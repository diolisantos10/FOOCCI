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

/**
 * A MARCA DO CLIENTE DE SIMULAÇÃO — e por que ela virou trava.
 *
 * Achado da varredura de multi-inquilino de 05/08/2026 (P0): a rota de encerrar
 * sessão recebia `customerId` no corpo e mandava apagar. Sem conferir de qual
 * restaurante era o cliente, sem conferir se era de teste, e sem conferir o cargo
 * de quem pediu. O efeito: qualquer pessoa logada — inclusive `STAFF` — apagava um
 * cliente REAL e **todo o histórico de pedidos dele**, colando na chamada o
 * `customerId` que a própria tela de CRM mostra.
 *
 * O que torna isso pior que um furo comum é que ele **contornava as três
 * proteções que já existiam** para exatamente esta operação:
 *   · `api/customers/[id]` exige OWNER/MANAGER, escopa por restaurante e apenas
 *     DESATIVA — não apaga;
 *   · `CRMService` RECUSA excluir cliente que tenha pedido;
 *   · aqui os pedidos eram apagados PRIMEIRO, justamente para o cliente poder cair
 *     depois.
 *
 * A lição, e ela é maior que este arquivo: **a porta dos fundos é a ferramenta de
 * teste**. Quem escreve sandbox pensa em dado descartável e esquece que a rota
 * roda no mesmo servidor, no mesmo banco. Entre ~140 rotas de inquilino revisadas
 * na varredura, esta foi a única sem check-then-write.
 *
 * A marca já existia desde sempre no nome do cliente criado — só nunca tinha sido
 * conferida na saída. Agora é constante única: quem muda a criação muda a trava
 * junto, e não dá para elas discordarem em silêncio.
 */
export const CHATSIM_NAME_PREFIX = "[CHATSIM]";

/** Motivo pelo qual a sessão foi recusada — `null` quando ela é legítima. */
export type ChatSimRejection = "SESSAO_INEXISTENTE" | "NAO_E_SIMULACAO";

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
        name:  `${CHATSIM_NAME_PREFIX} ${new Date().toLocaleTimeString("pt-BR")}`,
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

  /**
   * O PORTÃO ÚNICO DA SIMULAÇÃO. Toda rota de `chat-sim` passa por aqui antes de
   * escrever ou apagar qualquer coisa.
   *
   * Ele responde três perguntas que a rota antiga não fazia, e as três precisam
   * ser "sim" para a operação seguir:
   *   1. a conversa e o cliente existem **dentro deste restaurante**? (o par
   *      `{id, restaurantId}` vai no `where` — nunca `findUnique` por id puro);
   *   2. a conversa é DESTE cliente? (senão dá para injetar mensagem numa conversa
   *      real usando um `customerId` de simulação — o achado A2 da mesma varredura);
   *   3. o cliente é de simulação, e não gente de verdade?
   *
   * Devolve o motivo em vez de lançar: a rota decide o código HTTP, e o motivo é o
   * que aparece no log — alerta sem o caso concreto é ruído (guardrail 6).
   *
   * Guardrail 5 aplicado: a recusa é inerte. Ela **não apaga nada** e no pior caso
   * deixa um cliente `[CHATSIM]` parado no banco — infinitamente mais barato que a
   * exclusão indevida que ela evita.
   */
  static async checkSession(params: {
    restaurantId: string;
    sessionId:    string;
    customerId:   string;
  }): Promise<ChatSimRejection | null> {
    const { restaurantId, sessionId, customerId } = params;

    const [conversa, cliente] = await Promise.all([
      prisma.conversation.findFirst({
        where:  { id: sessionId, restaurantId },
        select: { id: true, customerId: true },
      }),
      prisma.customer.findFirst({
        where:  { id: customerId, restaurantId },
        select: { id: true, name: true },
      }),
    ]);

    if (!conversa || !cliente) return "SESSAO_INEXISTENTE";
    if (conversa.customerId !== cliente.id) return "SESSAO_INEXISTENTE";
    if (!(cliente.name ?? "").startsWith(CHATSIM_NAME_PREFIX)) return "NAO_E_SIMULACAO";

    return null;
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

  /**
   * Apaga a sessão de simulação — e **somente** uma sessão de simulação.
   *
   * Devolve o motivo da recusa quando não apaga. Antes esta função engolia tudo num
   * `catch` que só dava `console.warn`: falha de exclusão saía como sucesso para
   * quem chamou. "Não deu para apagar" é informação, não silêncio.
   *
   * Todo `where` daqui em diante carrega `restaurantId`. Não é redundância com o
   * portão: é a mesma trava escrita duas vezes, no lugar onde o dano acontece — um
   * `deleteMany` sem escopo é uma linha de distância de virar incidente de novo.
   */
  static async deleteSession(params: {
    restaurantId: string;
    sessionId:    string;
    customerId:   string;
  }): Promise<{ deleted: boolean; reason: ChatSimRejection | null }> {
    const { restaurantId, sessionId, customerId } = params;

    const recusa = await ChatSimService.checkSession(params);
    if (recusa) return { deleted: false, reason: recusa };

    try {
      await prisma.order.deleteMany({ where: { customerId, restaurantId } });
      const drafts = await prisma.orderDraft.findMany({
        where:  { customerId, restaurantId },
        select: { id: true },
      });
      if (drafts.length > 0) {
        await prisma.orderDraftItem.deleteMany({ where: { orderDraftId: { in: drafts.map((d) => d.id) } } });
        await prisma.orderDraft.deleteMany({ where: { customerId, restaurantId } });
      }
      await prisma.conversation.deleteMany({ where: { id: sessionId, restaurantId } });
      await prisma.customer.deleteMany({ where: { id: customerId, restaurantId } });
      return { deleted: true, reason: null };
    } catch (err) {
      console.warn("[ChatSimService] Cleanup error (non-fatal):", err);
      return { deleted: false, reason: null };
    }
  }
}
