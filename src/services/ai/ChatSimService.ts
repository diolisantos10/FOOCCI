/**
 * ChatSimService
 *
 * Runs a sandboxed interactive chat session against the real AI ordering
 * pipeline (PromptBuilderService, UpsellEngine, OpenAI, AI_TOOL_DEFINITIONS).
 * Nothing is sent to WhatsApp — no provider call is ever made.
 *
 * Session lifecycle:
 *   1. createSession()   — creates temp Customer + Conversation in DB
 *   2. runTurn()         — processes one user message, returns AI response + tool calls + cart
 *   3. deleteSession()   — removes all temp DB records
 */

import { prisma } from "@/lib/prisma";
import { openai } from "@/lib/openai";
import { BrandConfigService } from "./BrandConfigService";
import { PromptBuilderService } from "./PromptBuilderService";
import { UpsellEngine } from "./UpsellEngine";
import { buildSalesProfile } from "./SalesProfile";
import { resolveMaxTokens } from "./BehaviorEngine";
import { AI_TOOL_DEFINITIONS, executeTool, type ToolContext } from "./AITools";
import { getAlreadySuggestedIds } from "./ConversationGuardrails";
import { ConversationStatus } from "@prisma/client";
import type OpenAI from "openai";

const MAX_TOOL_ITERATIONS = 6;

// ─── public types ──────────────────────────────────────────────

export interface ChatSession {
  sessionId:  string; // conversationId
  customerId: string;
}

export interface ChatToolCall {
  name:       string;
  success:    boolean;
  resultData: unknown; // typed below by tool name in the client
}

export interface ChatTurnResult {
  text:      string;
  toolCalls: ChatToolCall[];
  cart: {
    value: number;
    items: number;
  };
}

// ─── service ───────────────────────────────────────────────────

export class ChatSimService {
  static async createSession(restaurantId: string): Promise<ChatSession> {
    const tag      = Date.now().toString(36);
    const simPhone = `+5599${tag.padEnd(11, "0").slice(0, 11)}`;

    const customer = await prisma.customer.create({
      data: {
        restaurantId,
        name:  `[CHATSIM] ${new Date().toLocaleTimeString("pt-BR")}`,
        phone: simPhone,
      },
    });

    const conversation = await prisma.conversation.create({
      data: {
        restaurantId,
        customerId: customer.id,
        status:     ConversationStatus.BOT,
      },
    });

    return { sessionId: conversation.id, customerId: customer.id };
  }

  static async runTurn(params: {
    conversationId: string;
    restaurantId:   string;
    customerId:     string;
    message:        string;
  }): Promise<ChatTurnResult> {
    const { conversationId, restaurantId, customerId, message } = params;

    // Persist inbound message so the prompt builder sees it in history
    await prisma.message.create({
      data: {
        conversationId,
        direction: "INBOUND",
        content:   message,
        type:      "TEXT",
        sentAt:    new Date(),
      },
    });

    const [brandConfig, restaurantRow] = await Promise.all([
      BrandConfigService.getOrDefault(restaurantId),
      prisma.restaurant.findUnique({ where: { id: restaurantId }, select: { name: true } }),
    ]);
    const restaurantName = restaurantRow?.name ?? "";
    const salesProfile   = buildSalesProfile(brandConfig, restaurantName);

    const existingDraft = await prisma.orderDraft.findFirst({
      where:   { restaurantId, customerId, status: "OPEN" },
      orderBy: { createdAt: "desc" },
      select:  { id: true },
    });
    let draftId: string | null = existingDraft?.id ?? null;
    let handoffRequested = false;

    const toolCtx: ToolContext = {
      restaurantId,
      conversationId,
      customerId,
      draftId,
      setDraftId:     (id) => { draftId = id; toolCtx.draftId = id; },
      requestHandoff: ()   => { handoffRequested = true; },
      upsellSuggestedThisTurn: false,
      drinkAttemptsThisTurn:   0,
      drinkAttemptsPriorTurns: 0,
      confirmOrderAttempts:    0,
      checkoutIntent:          false,
    };

    const [alreadySuggestedIds, customerPrefs] = await Promise.all([
      getAlreadySuggestedIds(conversationId),
      prisma.customerPreference.findUnique({
        where:  { customerId },
        select: { dietary: true, allergies: true },
      }),
    ]);

    const upsellResult = await UpsellEngine.suggest(
      restaurantId,
      draftId,
      salesProfile.salesPriority,
      alreadySuggestedIds,
      customerPrefs?.dietary   ?? [],
      customerPrefs?.allergies ?? [],
      salesProfile.targetTicket,
      salesProfile.targetItems,
    );
    const { suggestions: upsellSuggestions, cartValue, cartItemCount, valueGap, itemGap } = upsellResult;

    const messages = await PromptBuilderService.build({
      conversationId,
      restaurantId,
      customerId,
      brandConfig,
    });

    // Inject upsell + goal context (mirrors AIOrderService exactly)
    const sysMsg = messages[0] as OpenAI.Chat.ChatCompletionSystemMessageParam;
    let sysAddendum = "";

    if (upsellSuggestions.length > 0 && brandConfig.upsellStyle !== "none") {
      sysAddendum +=
        "\n\nSUGESTÕES DE UPSELL DISPONÍVEIS (use suggest_upsell se adequado):\n" +
        upsellSuggestions
          .map((s) => `  • [ID: ${s.menuItemId}] ${s.name} — R$ ${s.price.toFixed(2)} (${s.categoryName}) — ${s.reason}`)
          .join("\n");
    }
    if (cartItemCount > 0) {
      const goalLines = [
        `\n\nCONTEXTO DE METAS (turno atual):`,
        `  Pedido: R$ ${cartValue.toFixed(2)} | ${cartItemCount} itens`,
        `  Meta:   R$ ${salesProfile.targetTicket.toFixed(2)} | ${salesProfile.targetItems} itens`,
      ];
      if (valueGap > 0 || itemGap > 0) {
        const gaps: string[] = [];
        if (valueGap > 0) gaps.push(`R$ ${valueGap.toFixed(2)} em valor`);
        if (itemGap > 0)  gaps.push(`${itemGap} itens`);
        goalLines.push(`  Gap: ${gaps.join(" | ")}`);
      }
      sysAddendum += goalLines.join("\n");
    }
    if (alreadySuggestedIds.size > 0) {
      sysAddendum +=
        "\n\nPRODUTOS JÁ SUGERIDOS NESTA CONVERSA (não repita):\n" +
        [...alreadySuggestedIds].map((id) => `  • ${id}`).join("\n");
    }
    if (sysAddendum) {
      messages[0] = { ...sysMsg, content: sysMsg.content + sysAddendum };
    }

    // OpenAI tool-call loop (identical to AIOrderService / executeSimulatedTurn)
    const toolCallsMade: ChatToolCall[] = [];
    let finalResponse = "";
    const loopMessages: OpenAI.Chat.ChatCompletionMessageParam[] = [...messages];

    for (let iter = 0; iter < MAX_TOOL_ITERATIONS; iter++) {
      const response = await openai.chat.completions.create({
        model:       brandConfig.aiModel,
        messages:    loopMessages,
        tools:       AI_TOOL_DEFINITIONS,
        tool_choice: "auto",
        max_tokens:  resolveMaxTokens(salesProfile),
        temperature: 0.3,
      });

      const choice = response.choices[0];
      if (!choice) break;

      const { finish_reason, message: msg } = choice;
      loopMessages.push(msg);

      if (finish_reason === "stop" || finish_reason === "length") {
        finalResponse = msg.content ?? "";
        break;
      }

      if (finish_reason === "tool_calls" && msg.tool_calls) {
        const fnCalls = msg.tool_calls.filter(
          (tc): tc is Extract<typeof tc, { type: "function"; function: { name: string; arguments: string } }> =>
            tc.type === "function" && "function" in tc
        );

        for (const tc of fnCalls) {
          const result = await executeTool(tc.function.name, tc.function.arguments, toolCtx);
          toolCallsMade.push({
            name:       tc.function.name,
            success:    result.success,
            resultData: result.data ?? null,
          });
          loopMessages.push({
            role:         "tool",
            tool_call_id: tc.id,
            content:      JSON.stringify(result),
          });
          if (handoffRequested) break;
        }
        if (handoffRequested) break;
        continue;
      }

      finalResponse = msg.content ?? "";
      break;
    }

    // Persist AI response so subsequent turns see full history
    if (finalResponse) {
      await prisma.message.create({
        data: {
          conversationId,
          direction: "OUTBOUND",
          content:   finalResponse,
          type:      "TEXT",
          sentAt:    new Date(),
        },
      });
    }

    // Return current cart snapshot
    const draft = await prisma.orderDraft.findFirst({
      where:   { customerId, restaurantId, status: "OPEN" },
      orderBy: { createdAt: "desc" },
      select:  { subtotal: true, items: { select: { quantity: true, menuItem: { select: { name: true, price: true } } } } },
    });

    return {
      text:      finalResponse,
      toolCalls: toolCallsMade,
      cart: {
        value: Number(draft?.subtotal ?? 0),
        items: draft?.items.reduce((s, i) => s + i.quantity, 0) ?? 0,
      },
    };
  }

  static async deleteSession(sessionId: string, customerId: string): Promise<void> {
    try {
      await prisma.order.deleteMany({ where: { customerId } });
      const drafts = await prisma.orderDraft.findMany({ where: { customerId }, select: { id: true } });
      if (drafts.length > 0) {
        await prisma.orderDraftItem.deleteMany({ where: { orderDraftId: { in: drafts.map((d) => d.id) } } });
        await prisma.orderDraft.deleteMany({ where: { customerId } });
      }
      await prisma.conversation.delete({ where: { id: sessionId } }).catch(() => null);
      await prisma.customer.delete({ where: { id: customerId } }).catch(() => null);
    } catch (err) {
      console.warn("[ChatSimService] Cleanup error (non-fatal):", err);
    }
  }
}
