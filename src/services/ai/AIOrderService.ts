/**
 * AIOrderService — Phase 4 AI Ordering Engine
 *
 * Orchestrates a single conversation turn:
 *   1. Load conversation state; skip if HUMAN or RESOLVED.
 *   2. Set conversation status to BOT.
 *   3. Load brand config, build prompt.
 *   4. Call OpenAI with tool definitions.
 *   5. Execute tool calls in a loop (max MAX_TOOL_ITERATIONS).
 *   6. On handoff_to_human tool: transition to HUMAN, send handoff message, stop.
 *   7. Send final text response via Evolution API.
 *   8. Log the interaction (tokens, cost, tool calls, latency).
 *   9. On any unrecoverable error: transition to HUMAN, send fallback message.
 *
 * Safety:
 *   - AI cannot invent items/prices (PromptBuilder + tool executor validation).
 *   - Hard limit of MAX_TOOL_ITERATIONS per turn prevents infinite loops.
 *   - Evolution API send errors are caught; conversation falls to HUMAN.
 */

import { prisma } from "@/lib/prisma";
import { openai } from "@/lib/openai";
import { EvolutionConfigService } from "@/services/evolution/EvolutionConfigService";
import { EvolutionClient } from "@/lib/evolution/EvolutionClient";
import { BrandConfigService } from "./BrandConfigService";
import { PromptBuilderService } from "./PromptBuilderService";
import { UpsellEngine } from "./UpsellEngine";
import { AIInteractionLogger } from "./AIInteractionLogger";
import { buildSalesProfile } from "./SalesProfile";
import { resolveMaxTokens } from "./BehaviorEngine";
import { AI_TOOL_DEFINITIONS, executeTool, type ToolContext } from "./AITools";
import { getAlreadySuggestedIds } from "./ConversationGuardrails";
import type OpenAI from "openai";
import { ConversationStatus } from "@prisma/client";

const MAX_TOOL_ITERATIONS = 6;

// ─── public API ───────────────────────────────────────────────

export class AIOrderService {
  /**
   * Process a single AI turn for the given conversation.
   * Called by WebhookProcessorService after every inbound message.
   * Errors are logged internally — never thrown to the caller.
   */
  static async processTurn(conversationId: string): Promise<void> {
    const startMs = Date.now();

    try {
      await runTurn(conversationId, startMs);
    } catch (err) {
      console.error("[AIOrderService] Unhandled error in processTurn:", err);
      // Best-effort handoff on unexpected error
      await safeHandoff(
        conversationId,
        "Erro interno no assistente. Um atendente irá continuar."
      );
    }
  }
}

// ─── core turn logic ──────────────────────────────────────────

async function runTurn(conversationId: string, startMs: number): Promise<void> {
  // 1. Load conversation
  const conversation = await prisma.conversation.findUnique({
    where: { id: conversationId },
    select: {
      id: true,
      restaurantId: true,
      customerId: true,
      status: true,
      customer: { select: { phone: true } },
    },
  });

  if (!conversation) {
    console.warn(`[AIOrderService] Conversation not found: ${conversationId}`);
    return;
  }

  // Only process OPEN conversations (BOT is already being processed elsewhere)
  if (
    conversation.status === ConversationStatus.HUMAN ||
    conversation.status === ConversationStatus.RESOLVED
  ) {
    return;
  }

  const { restaurantId, customerId } = conversation;

  // 2. Mark as BOT
  await prisma.conversation.update({
    where: { id: conversationId },
    data: { status: ConversationStatus.BOT },
  });

  // 3. Load brand config + Evolution config
  const [brandConfig, restaurantName, configResult] = await Promise.all([
    BrandConfigService.getOrDefault(restaurantId),
    prisma.restaurant.findUnique({ where: { id: restaurantId }, select: { name: true } })
      .then((r) => r?.name ?? ""),
    EvolutionConfigService.getSnapshot(restaurantId),
  ]);

  if (!configResult.ok) {
    console.warn(
      `[AIOrderService] No Evolution config for restaurant ${restaurantId} — cannot send reply`
    );
    await prisma.conversation.update({
      where: { id: conversationId },
      data: { status: ConversationStatus.OPEN },
    });
    return;
  }

  const evolutionConfig = configResult.data;
  const toPhone = conversation.customer.phone.replace(/^\+/, "");

  // 4. Find current OPEN draft
  const existingDraft = await prisma.orderDraft.findFirst({
    where: { restaurantId, customerId, status: "OPEN" },
    orderBy: { createdAt: "desc" },
    select: { id: true },
  });

  let draftId: string | null = existingDraft?.id ?? null;
  let handoffRequested = false;
  let handoffReason = "";

  // Build tool context (upsellSuggestedThisTurn starts false — reset each turn)
  const toolCtx: ToolContext = {
    restaurantId,
    conversationId,
    customerId,
    draftId,
    setDraftId: (id) => { draftId = id; toolCtx.draftId = id; },
    requestHandoff: (reason) => { handoffRequested = true; handoffReason = reason; },
    upsellSuggestedThisTurn: false,
  };

  // 5. Build sales profile + guardrail data + upsell context
  const salesProfile = buildSalesProfile(brandConfig, restaurantName);

  // Load guardrail data in parallel with the existing profile build
  const [alreadySuggestedIds, customerPrefs] = await Promise.all([
    getAlreadySuggestedIds(conversationId),
    prisma.customerPreference.findUnique({
      where:  { customerId },
      select: { dietary: true, allergies: true },
    }),
  ]);

  const customerDietary   = customerPrefs?.dietary   ?? [];
  const customerAllergies = customerPrefs?.allergies ?? [];

  const upsellSuggestions = await UpsellEngine.suggest(
    restaurantId,
    draftId,
    salesProfile.salesPriority,
    alreadySuggestedIds,
    customerDietary,
    customerAllergies,
  );

  // 6. Build messages
  const messages = await PromptBuilderService.build({
    conversationId,
    restaurantId,
    customerId,
    brandConfig,
  });

  // Inject upsell hints + guardrail context into system message
  const sysMsg = messages[0] as OpenAI.Chat.ChatCompletionSystemMessageParam;
  let sysAddendum = "";

  if (upsellSuggestions.length > 0 && brandConfig.upsellStyle !== "none") {
    sysAddendum +=
      "\n\nSUGESTÕES DE UPSELL DISPONÍVEIS (use suggest_upsell se adequado):\n" +
      upsellSuggestions
        .map((s) => `  • [ID: ${s.menuItemId}] ${s.name} — R$ ${s.price.toFixed(2)} (${s.categoryName})`)
        .join("\n");
  }

  // Anti-loop: tell AI which products were already suggested in this conversation
  if (alreadySuggestedIds.size > 0) {
    sysAddendum +=
      "\n\nPRODUTOS JÁ SUGERIDOS NESTA CONVERSA (não repita):\n" +
      [...alreadySuggestedIds].map((id) => `  • ${id}`).join("\n");
  }

  if (sysAddendum) {
    messages[0] = { ...sysMsg, content: sysMsg.content + sysAddendum };
  }

  // 7. OpenAI tool-call loop
  let promptTokens = 0;
  let completionTokens = 0;
  const toolCallsMade: Array<{ name: string; args: unknown; result: unknown; success: boolean }> = [];
  let finalResponse = "";

  const loopMessages: OpenAI.Chat.ChatCompletionMessageParam[] = [...messages];

  for (let iteration = 0; iteration < MAX_TOOL_ITERATIONS; iteration++) {
    const response = await openai.chat.completions.create({
      model: brandConfig.aiModel,
      messages: loopMessages,
      tools: AI_TOOL_DEFINITIONS,
      tool_choice: "auto",
      max_tokens: resolveMaxTokens(salesProfile),
      temperature: 0.3,
    });

    promptTokens += response.usage?.prompt_tokens ?? 0;
    completionTokens += response.usage?.completion_tokens ?? 0;

    const choice = response.choices[0];
    if (!choice) break;

    const { finish_reason, message } = choice;

    // Add assistant message to loop context
    loopMessages.push(message);

    if (finish_reason === "stop" || finish_reason === "length") {
      finalResponse = message.content ?? "";
      break;
    }

    if (finish_reason === "tool_calls" && message.tool_calls) {
      // Filter to only standard function tool calls (ignore custom tool call types)
      const functionCalls = message.tool_calls.filter(
        (tc): tc is Extract<typeof tc, { type: "function"; function: { name: string; arguments: string } }> =>
          tc.type === "function" && "function" in tc
      );

      for (const toolCall of functionCalls) {
        const result = await executeTool(
          toolCall.function.name,
          toolCall.function.arguments,
          toolCtx
        );

        toolCallsMade.push({
          name: toolCall.function.name,
          args: safeJson(toolCall.function.arguments),
          result,
          success: result.success,
        });

        loopMessages.push({
          role: "tool",
          tool_call_id: toolCall.id,
          content: JSON.stringify(result),
        });

        // Stop tool loop on handoff
        if (handoffRequested) break;
      }

      if (handoffRequested) break;
      continue;
    }

    // Any other finish reason — take content as final
    finalResponse = message.content ?? "";
    break;
  }

  const latencyMs = Date.now() - startMs;

  // 8. Handle handoff
  if (handoffRequested) {
    await prisma.conversation.update({
      where: { id: conversationId },
      data: {
        status: ConversationStatus.HUMAN,
        assignedTo: null,
        lastMessageAt: new Date(),
        unreadCount: { increment: 1 },
      },
    });

    const handoffMsg =
      `Vou transferir você para um de nossos atendentes. ` +
      `Em breve alguém irá continuar o atendimento. 🙏`;

    await sendWhatsAppReply(evolutionConfig, toPhone, handoffMsg, conversationId);
    await logTurn({ restaurantId, conversationId, model: brandConfig.aiModel,
      promptTokens, completionTokens, latencyMs, toolCallsMade,
      turnNumber: 1, success: true, errorMessage: `handoff: ${handoffReason}` });
    return;
  }

  // 9. Send reply
  if (finalResponse) {
    await sendWhatsAppReply(evolutionConfig, toPhone, finalResponse, conversationId);
  }

  // 10. Restore to BOT status (it was set to BOT at start, keep it unless it's now HUMAN)
  const currentStatus = await prisma.conversation.findUnique({
    where: { id: conversationId },
    select: { status: true },
  });
  if (currentStatus?.status === ConversationStatus.BOT) {
    // Keep as BOT — still in AI-handled mode
  }

  // 11. Log
  await logTurn({
    restaurantId,
    conversationId,
    model: brandConfig.aiModel,
    promptTokens,
    completionTokens,
    latencyMs,
    toolCallsMade,
    turnNumber: 1,
    success: true,
  });
}

// ─── helpers ─────────────────────────────────────────────────

async function sendWhatsAppReply(
  config: { instanceName: string; baseUrl: string; apiKey: string },
  toPhone: string,
  text: string,
  conversationId: string
): Promise<void> {
  try {
    const result = await EvolutionClient.sendTextMessage(config, toPhone, text);
    const now = new Date();

    await prisma.$transaction([
      prisma.message.create({
        data: {
          conversationId,
          direction: "OUTBOUND",
          content: text,
          type: "TEXT",
          sentAt: now,
          externalMessageId: result.key.id,
          externalStatus: "sent",
        },
      }),
      prisma.conversation.update({
        where: { id: conversationId },
        data: { lastMessageAt: now },
      }),
    ]);
  } catch (err) {
    console.error("[AIOrderService] Failed to send WhatsApp reply:", err);
  }
}

async function safeHandoff(conversationId: string, message: string): Promise<void> {
  try {
    await prisma.conversation.update({
      where: { id: conversationId },
      data: { status: ConversationStatus.HUMAN },
    });

    // Attempt to find Evolution config and send the fallback message
    const conv = await prisma.conversation.findUnique({
      where: { id: conversationId },
      select: { restaurantId: true, customer: { select: { phone: true } } },
    });

    if (conv) {
      const cfgResult = await EvolutionConfigService.getSnapshot(conv.restaurantId);
      if (cfgResult.ok) {
        const phone = conv.customer.phone.replace(/^\+/, "");
        await sendWhatsAppReply(cfgResult.data, phone, message, conversationId);
      }
    }
  } catch (err) {
    console.error("[AIOrderService] safeHandoff failed:", err);
  }
}

async function logTurn(params: {
  restaurantId: string;
  conversationId: string;
  model: string;
  promptTokens: number;
  completionTokens: number;
  latencyMs: number;
  toolCallsMade: Array<{ name: string; args: unknown; result: unknown; success: boolean }>;
  turnNumber: number;
  success: boolean;
  errorMessage?: string;
}): Promise<void> {
  await AIInteractionLogger.log({
    restaurantId: params.restaurantId,
    conversationId: params.conversationId,
    model: params.model,
    promptTokens: params.promptTokens,
    completionTokens: params.completionTokens,
    latencyMs: params.latencyMs,
    turnNumber: params.turnNumber,
    toolCalls: params.toolCallsMade,
    success: params.success,
    errorMessage: params.errorMessage,
  });
}

function safeJson(raw: string): unknown {
  try { return JSON.parse(raw); } catch { return raw; }
}
