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
 *   7. Send final text response via the Meta Cloud API (WhatsAppMessagingService).
 *   8. Log the interaction (tokens, cost, tool calls, latency).
 *   9. On any unrecoverable error: transition to HUMAN, send fallback message.
 *
 * Safety:
 *   - AI cannot invent items/prices (PromptBuilder + tool executor validation).
 *   - Hard limit of MAX_TOOL_ITERATIONS per turn prevents infinite loops.
 *   - WhatsApp send errors are caught; conversation falls to HUMAN.
 */

import { prisma } from "@/lib/prisma";
import { openai } from "@/lib/openai";
import { MetaConfigService } from "@/services/whatsapp/MetaConfigService";
import { sendWhatsAppText } from "@/services/whatsapp/activeProvider";
import { BrandConfigService } from "./BrandConfigService";
import { PromptBuilderService } from "./PromptBuilderService";
import { UpsellEngine } from "./UpsellEngine";
import { AIInteractionLogger } from "./AIInteractionLogger";
import { buildSalesProfile } from "./SalesProfile";
import { resolveMaxTokens } from "./BehaviorEngine";
import { AI_TOOL_DEFINITIONS, executeTool, type ToolContext } from "./AITools";
import { getDrinkAttemptCount, getAlreadySuggestedItems, isDessertCategory, isMainCategory } from "./ConversationGuardrails";
import * as WaiterBrain from "./WaiterBrain";
import * as WaiterBrainV2 from "./WaiterBrainV2";
import { cartLineBaseIds } from "./cartNormalization";
import { buildWaiterProfileDirective } from "./waiter/WaiterAgentProfile";
import { getExperienceBrief } from "@/services/brain/experience/ExperienceBriefService";
import { getWaiterRuntimeKnowledge } from "@/services/waiterRuntime/WaiterLibraryRuntimeBridge";
import type { V2Event, V2CatalogItem, WaiterMode, WaiterOption, MenuIntentResult } from "./WaiterBrainV2";
import type { UpsellSuggestion } from "./UpsellEngine";
import type OpenAI from "openai";
import { ConversationStatus } from "@prisma/client";
import type { OrderStage } from "@/lib/agent/types";

// ─── web turn types (replaces runner.ts) ──────────────────────

export interface AIWebTurnInput {
  restaurantId:    string;
  message:         string;
  history:         Array<{ role: "user" | "assistant"; content: string }>;
  cart?:           Array<{ id?: string; baseItemId?: string; name: string; price: number; qty: number }>;
  stage?:          OrderStage;
  upsellOffered?:  "drink" | "dessert" | "extras" | null;
  deliveryMethod?: "delivery" | "pickup" | null;
  address?:        string | null;
  paymentMethod?:  string | null;
  customerId?:     string;
  customerPhone?:  string;
  customerName?:   string | null;
  categoryIntro?:  { name: string; description: string } | null;
  // ── V2 event-driven fields ───────────────────────────────────
  /** Event that triggered this turn (WaiterBrainV2). Defaults to ON_USER_MESSAGE. */
  event?:          V2Event;
  /** Full flat catalog for card selection. Omit to skip V2 card logic. */
  catalogItems?:   V2CatalogItem[];
  /** ID of the last item added (used for ON_ITEM_ADDED complement selection). */
  lastAddedId?:    string;
  /** Product IDs already shown as cards this session (for de-duplication). */
  suggestedProductIds?: string[];
  /** Client-held WaiterMemory from previous turn — merged server-side for stateful continuity. */
  waiterMemory?: Partial<WaiterBrainV2.WaiterMemory>;
}

export interface AIWebTurnOutput {
  reply:              string;
  cards:              string[];        // product IDs to show as UI cards (V2)
  mode:               WaiterMode;     // UI rendering state
  options:            WaiterOption[]; // quick-reply buttons
  suggestedItemName?: string;
  pinnedCardId?:      string;         // item shown first in carousel with ⭐
  /** Memory patch to be stored client-side and sent back on the next request. */
  memoryPatch?: Partial<WaiterBrainV2.WaiterMemory>;
}

const MAX_TOOL_ITERATIONS = 6;

// ─── stage inference ──────────────────────────────────────────
// Determines the current upsell stage from cart state + available suggestions.
// Stage 3 = drink not yet attempted; Stage 4 = dessert not yet attempted;
// "none" = cart empty (Stage 1/2) or both already covered (Stage 5+).
type UpsellStage = "food" | 3 | 4 | "none";

function inferUpsellStage(
  cartItemCount: number,
  suggestions: Array<{ categoryName: string }>,
): UpsellStage {
  if (cartItemCount === 0) return "none";
  // Food expansion: main-category items still available (suggest more food before complements)
  const hasFood = suggestions.some((s) => isMainCategory(s.categoryName));
  if (hasFood) return "food";
  // Drink stage: non-main, non-dessert categories (only reached when food candidates exhausted)
  const hasDrink = suggestions.some(
    (s) => !isMainCategory(s.categoryName) && !isDessertCategory(s.categoryName),
  );
  if (hasDrink) return 3;
  const hasDessert = suggestions.some((s) => isDessertCategory(s.categoryName));
  if (hasDessert) return 4;
  return "none";
}

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

  /**
   * Process a single AI turn for the stateless web ordering widget.
   * Replaces the legacy runner.ts / runAITurn pipeline.
   *
   * Pipeline:
   *   1. Load brand config via BrandConfigService
   *   2. Build sales profile
   *   3. UpsellEngine.suggest — goal-driven suggestion candidates
   *   4. PromptBuilderService.buildForWeb — unified system prompt + history
   *   5. Inject upsell hints into system message
   *   6. OpenAI call with AI_TOOL_DEFINITIONS active
   *   7. Tool-call loop (suggest_upsell tracked; other tools deferred to client)
   *   8. Return { reply, suggestedItemName }
   */
  static async runWebTurn(input: AIWebTurnInput): Promise<AIWebTurnOutput> {
    return runWebTurnInternal(input);
  }
}

// ─── web turn (unified pipeline, stateless HTTP) ──────────────

async function runWebTurnInternal(input: AIWebTurnInput): Promise<AIWebTurnOutput> {
  const {
    restaurantId,
    message,
    history,
    cart          = [],
    customerId,
    customerName  = null,
    event         = "ON_USER_MESSAGE",
    catalogItems  = [],
    lastAddedId,
  } = input;

  // ── WaiterBrainV2 decision (always first) ───────────────────
  // Non-AI events return immediately — no OpenAI call needed.
  // Normalize to product (base) ids so variant/customized/upsell lines are still
  // recognized in cart analysis — otherwise the checkout upsell is skipped.
  const cartItemIds = cartLineBaseIds(cart);
  const cartValue   = cart.reduce((s, c) => s + c.price * c.qty, 0);

  // Build session memory from request context.
  // finalUpsellPromptShown is only true when the client already offered a upsell
  // (indicated by the upsellOffered field). When not set (e.g. AutoPilot calls),
  // WaiterBrainV2 will show the permission gate if the cart qualifies.
  const waiterMemory: WaiterBrainV2.WaiterMemory = {
    ...WaiterBrainV2.createWaiterMemory(),
    ...(input.waiterMemory ?? {}),
    suggestedProductIds:    input.waiterMemory?.suggestedProductIds ?? input.suggestedProductIds ?? [],
    finalUpsellPromptShown: (input.waiterMemory?.finalUpsellPromptShown ?? false) ||
                             (event === "ON_CHECKOUT_STARTED" && input.upsellOffered != null),
  };

  // Fetch store channels for HUMAN_CONTACT / SOCIAL_CHANNELS deterministic handlers.
  // Only incurs DB cost on ON_USER_MESSAGE events; all other events skip this fetch.
  let storeChannels: WaiterBrainV2.V2Input["storeChannels"] | undefined;
  if (event === "ON_USER_MESSAGE") {
    const [channelBrandCfg, storeProfileRow] = await Promise.all([
      prisma.restaurantBrandConfig.findUnique({ where: { restaurantId }, select: { instagramUrl: true, tiktokUrl: true } }),
      prisma.storeProfile.findUnique({ where: { restaurantId }, select: { whatsappPhone: true } }),
    ]);
    storeChannels = {
      whatsapp:  storeProfileRow?.whatsappPhone ?? null,
      instagram: channelBrandCfg?.instagramUrl  ?? null,
      tiktok:    channelBrandCfg?.tiktokUrl      ?? null,
    };
  }

  const v2 = WaiterBrainV2.decide({
    event,
    cartItemIds,
    cartValue,
    lastAddedId,
    catalog: catalogItems,
    message,
    memory: waiterMemory,
    storeChannels,
  });

  if (!v2.requiresAI) {
    const rbCards = v2.cards ?? [];
    console.info("[waiter-ai]", JSON.stringify({
      source:           "rule_based",
      restaurantId,
      event,
      mode:             v2.mode,
      userMsgPreview:   message.slice(0, 60),
    }));
    console.info("[waiter-decision]", JSON.stringify({
      source:               "rule_based",
      userMessagePreview:   message.slice(0, 60),
      intent:               null,
      uiAction:             rbCards.length > 0 ? "SHOW_PRODUCTS" : "BROWSE",
      candidateCount:       rbCards.length,
      selectedProductCount: rbCards.length,
      noMatch:              rbCards.length === 0 && event === "ON_USER_MESSAGE",
      openaiUsed:           false,
      blockedHallucination: false,
      reason:               `mode=${v2.mode}`,
    }));
    return { reply: v2.message, cards: rbCards, mode: v2.mode, options: v2.options, pinnedCardId: v2.pinnedCardId, memoryPatch: v2.memoryPatch };
  }

  // ── Pre-AI menu intent resolution (synchronous — prevents hallucination) ───
  // Run BEFORE the async brand config load: pure in-memory scan of catalogItems.
  // noMatch=true + queryTermCount > 0 = item genuinely absent from menu.
  let menuIntentResult: MenuIntentResult = {
    intent:              "UNKNOWN",
    queryTerms:          [],
    exactMatches:        [],
    categoryMatches:     [],
    alternativeProducts: [],
    noMatch:             false,
    confidence:          "low",
    reason:              "not evaluated",
  };
  if (event === "ON_USER_MESSAGE" && message.trim()) {
    menuIntentResult = WaiterBrainV2.resolveMenuIntent(message, catalogItems, { cartItemIds });
  }

  // ── AI pipeline (ON_USER_MESSAGE / AFTER_CHECKOUT) ──────────

  // 1. Brand config
  const aiStartMs = Date.now();
  const [brandConfig, restaurantRow] = await Promise.all([
    BrandConfigService.getOrDefault(restaurantId),
    prisma.restaurant.findUnique({ where: { id: restaurantId }, select: { name: true } }),
  ]);
  const restaurantName = restaurantRow?.name ?? "";

  // 2. Sales profile
  const salesProfile = buildSalesProfile(brandConfig, restaurantName);

  // 3. UpsellEngine — null draftId returns empty result for anonymous web sessions
  const upsellResult = await UpsellEngine.suggest(
    restaurantId,
    null,
    salesProfile.salesPriority,
    new Set<string>(),
    [],
    [],
    salesProfile.targetTicket,
    salesProfile.targetItems,
  );

  // 4. PromptBuilderService — unified system prompt + request history
  const messages = await PromptBuilderService.buildForWeb({
    restaurantId,
    customerId,
    customerName,
    history,
    cart,
    brandConfig,
  });

  // 5. Inject Waiter professional profile (constitution) + V2 directive + upsell hints.
  // The profile is prepended to the system prompt so the AI reads its professional
  // identity (waiter/salesperson, not bot) BEFORE the per-turn behavior directive.
  // Web-only: this does not touch the WhatsApp Agent path (which uses build()).
  const sysMsg = messages[0] as OpenAI.Chat.ChatCompletionSystemMessageParam;
  // Consumo do Cofre de Experiências: o que os clientes DESTE restaurante mais
  // pedem — contexto pra o garçom antecipar/recomendar melhor (nunca verdade).
  const experienceBrief = await getExperienceBrief(restaurantId).catch(() => "");
  messages[0] = {
    ...sysMsg,
    content: `${buildWaiterProfileDirective()}\n\n${sysMsg.content}${experienceBrief ? `\n\n${experienceBrief}` : ""}`,
  };
  let sysAddendum = v2.aiDirective;

  // Only inject upsell candidates for ON_USER_MESSAGE (not AFTER_CHECKOUT)
  if (event !== "AFTER_CHECKOUT") {
    const webUpsellStage  = inferUpsellStage(upsellResult.cartItemCount, upsellResult.suggestions);
    const webUpsellAllowed = webUpsellStage === 3 || webUpsellStage === 4;

    if (webUpsellAllowed && upsellResult.suggestions.length > 0 && brandConfig.upsellStyle !== "none") {
      sysAddendum +=
        "\n\nSUGESTÕES DE UPSELL (chame suggest_upsell se pertinente):\n" +
        upsellResult.suggestions
          .map((s) => `  • [ID: ${s.menuItemId}] ${s.name} — R$ ${s.price.toFixed(2)} (${s.categoryName})`)
          .join("\n");
    }
  }

  // ── Menu intent context injection (hallucination prevention) ─────────────────
  // Tells AI exactly what the catalog found so it never claims items exist that don't.
  if (event === "ON_USER_MESSAGE" && message.trim()) {
    const allMatchIds = [
      ...menuIntentResult.exactMatches.map((i) => i.id),
      ...menuIntentResult.categoryMatches.map((i) => i.id),
    ];
    if (allMatchIds.length > 0) {
      // Products found — list validated candidate IDs for the AI to use
      const candidateLines = allMatchIds
        .slice(0, 8)
        .map((id) => {
          const item = catalogItems.find((i) => i.id === id);
          return item ? `  • [ID: ${id}] ${item.name} — R$ ${item.price.toFixed(2)}` : null;
        })
        .filter((l): l is string => l !== null)
        .join("\n");
      sysAddendum += `\n\n━━━ PRODUTOS CANDIDATOS (busca prévia no cardápio) ━━━\n${candidateLines}\n→ Prefira estes IDs ao chamar suggest_upsell — são os mais relevantes para a consulta do cliente.`;
    } else if (menuIntentResult.noMatch) {
      // Specific product/category terms in query but NOTHING matched → "not found"
      const altLines = menuIntentResult.alternativeProducts
        .slice(0, 4)
        .map((i) => `  • [ID: ${i.id}] ${i.name} — R$ ${i.price.toFixed(2)}`)
        .join("\n");
      sysAddendum += `\n\n━━━ BUSCA NO CARDÁPIO ━━━\nResultado: NENHUM PRODUTO ENCONTRADO para esta consulta.\n→ OBRIGATÓRIO: Informe ao cliente que não encontrou esse item/categoria no cardápio.\n→ PROIBIDO: Afirmar que o produto existe ou chamar suggest_upsell para este item.`;
      if (altLines) {
        sysAddendum += `\n→ Alternativas reais disponíveis (use APENAS estes IDs):\n${altLines}`;
      } else {
        sysAddendum += `\n→ Se quiser sugerir alternativas reais do cardápio, mencione-as APENAS usando IDs listados no CARDÁPIO COMPLETO acima.`;
      }
    }
  }

  // ── Library → runtime bridge (governed, optional, fully fallback-safe) ───────
  // Adds curated, ACTIVE+runtimeEnabled techniques ONLY when an ACTIVE
  // LIBRARY_ASSISTED version exists for this restaurant/global scope. Any other
  // case (no version, library off, no techniques, DB error) returns enabled:false
  // and the prompt is byte-for-byte identical to today. Never throws.
  const libraryKnowledge = await getWaiterRuntimeKnowledge({ restaurantId, agentSlug: "waiter" });
  if (libraryKnowledge.enabled && libraryKnowledge.promptBlock) {
    sysAddendum += libraryKnowledge.promptBlock;
  }

  if (sysAddendum) {
    const cur = messages[0] as OpenAI.Chat.ChatCompletionSystemMessageParam;
    messages[0] = { ...cur, content: cur.content + sysAddendum };
  }

  // 6. OpenAI call with AI_TOOL_DEFINITIONS active
  const loopMessages: OpenAI.Chat.ChatCompletionMessageParam[] = [
    ...messages,
    { role: "user", content: message.trim() },
  ];

  let finalResponse = "";
  let suggestedItemName: string | undefined;
  const aiCards: string[] = [];  // product IDs collected from suggest_upsell calls
  let addItemAttempts = 0;

  for (let iteration = 0; iteration < MAX_TOOL_ITERATIONS; iteration++) {
    const response = await openai.chat.completions.create({
      model: brandConfig.aiModel,
      messages: loopMessages,
      tools: AI_TOOL_DEFINITIONS,
      tool_choice: "auto",
      max_tokens: resolveMaxTokens(salesProfile),
      temperature: 0.3,
    });

    const choice = response.choices[0];
    if (!choice) break;

    const { finish_reason, message: assistantMsg } = choice;
    loopMessages.push(assistantMsg);

    if (finish_reason === "stop" || finish_reason === "length") {
      finalResponse = assistantMsg.content ?? "";
      break;
    }

    if (finish_reason === "tool_calls" && assistantMsg.tool_calls) {
      const functionCalls = assistantMsg.tool_calls.filter(
        (tc): tc is Extract<typeof tc, { type: "function"; function: { name: string; arguments: string } }> =>
          tc.type === "function" && "function" in tc
      );

      for (const toolCall of functionCalls) {
        const toolName = toolCall.function.name;
        let toolResult: { success: boolean; message: string; data?: unknown };

        if (toolName === "add_item") {
          addItemAttempts++;
          if (addItemAttempts > 2) {
            toolResult = {
              success: false,
              message: "PARAR: limite de tentativas add_item atingido neste turno. " +
                       "Responda ao cliente diretamente sem chamar add_item novamente.",
            };
            loopMessages.push({ role: "tool", tool_call_id: toolCall.id, content: JSON.stringify(toolResult) });
            continue;
          }
        }

        if (toolName === "suggest_upsell") {
          const args = safeJson(toolCall.function.arguments) as Record<string, unknown>;
          const itemId = args.menuItemId as string | undefined;
          // Collect card ID from suggest_upsell (V2 cards)
          if (itemId && !aiCards.includes(itemId)) aiCards.push(itemId);
          const hit = upsellResult.suggestions.find((s) => s.menuItemId === itemId);
          if (hit) suggestedItemName = hit.name;
          toolResult = { success: true, message: `Sugestão registrada: ${hit?.name ?? itemId}` };
        } else {
          toolResult = { success: true, message: "Ação registrada — processada pelo cliente." };
        }

        loopMessages.push({ role: "tool", tool_call_id: toolCall.id, content: JSON.stringify(toolResult) });
      }
      continue;
    }

    finalResponse = assistantMsg.content ?? "";
    break;
  }

  // ── Post-AI validation ──────────────────────────────────────────────────────
  // 1. Remove any card IDs that don't exist in the catalog (ghost IDs the AI may have invented).
  const catalogIdSet = new Set(catalogItems.map((i) => i.id));
  let finalCards = aiCards.filter((id) => catalogIdSet.has(id));

  // 2. Hallucination guard: if the query had specific product terms but the catalog had NOTHING,
  //    and the AI still added cards, those cards are likely for the wrong item — discard them.
  //    Exception: if the AI response explicitly mentions alternatives the customer can browse.
  const noMenuMatch =
    event === "ON_USER_MESSAGE" &&
    menuIntentResult.noMatch;
  let blockedHallucination = false;
  if (noMenuMatch && finalCards.length > 0 && !/alternativ/i.test(finalResponse)) {
    finalCards = [];
    blockedHallucination = true;
    console.warn("[waiter-ai] hallucination blocked — AI suggested cards for a non-existent query term");
  }

  console.info("[waiter-ai]", JSON.stringify({
    source:              "openai",
    restaurantId,
    event,
    model:               brandConfig.aiModel,
    hasCustomPrompt:     !!(brandConfig.waiterPrompt?.trim()),
    menuItemsCount:      catalogItems.length,
    userMsgPreview:      message.slice(0, 60),
    latencyMs:           Date.now() - aiStartMs,
    replyPreview:        finalResponse.slice(0, 80),
    candidateCount:      menuIntentResult.exactMatches.length + menuIntentResult.categoryMatches.length,
    blockedHallucination,
  }));

  console.info("[waiter-decision]", JSON.stringify({
    source:               "openai",
    userMessagePreview:   message.slice(0, 60),
    menuIntent:           menuIntentResult.intent,
    queryTerms:           menuIntentResult.queryTerms,
    exactCount:           menuIntentResult.exactMatches.length,
    categoryCount:        menuIntentResult.categoryMatches.length,
    alternativeCount:     menuIntentResult.alternativeProducts.length,
    noMatch:              menuIntentResult.noMatch,
    confidence:           menuIntentResult.confidence,
    uiAction:             finalCards.length > 0 ? "SHOW_PRODUCTS" : noMenuMatch ? "NO_MATCH" : "ASK_CLARIFYING",
    selectedProductCount: finalCards.length,
    openaiUsed:           true,
    blockedHallucination,
    reason:               menuIntentResult.reason || `ai_path event=${event}`,
  }));

  // Fail-safe name match (backward compat only — V2 prefers finalCards)
  if (finalResponse && !suggestedItemName) {
    const hit = upsellResult.suggestions.find(
      (s) => s.name.length >= 4 &&
        normalizeText(finalResponse).includes(normalizeText(s.name))
    );
    if (hit) suggestedItemName = hit.name;
  }

  // Hard guard: ON_ITEM_ADDED must never return cards or options regardless of AI output.
  // Rule 7 already strips them from the deterministic path; this guard covers the AI path.
  if (event === "ON_ITEM_ADDED") {
    return {
      reply:   finalResponse || "",
      cards:   [],
      mode:    "BROWSE",
      options: [],
    };
  }

  // Hard guard: CHECKOUT_SUPPORT mode must never return cards or selling content.
  const inCheckout = v2.mode === "CHECKOUT_SUPPORT" || event === "AFTER_CHECKOUT";
  if (inCheckout) {
    return {
      reply:   finalResponse || "Pedido recebido 😊 Agora é só acompanhar a confirmação.",
      cards:   [],
      mode:    "CHECKOUT_SUPPORT",
      options: [],
      suggestedItemName: undefined,
    };
  }

  // Contract guard: if the reply contains product-presentation language but cards are empty,
  // strip the presentation opening so the client never sees "Separei..." without visible cards.
  const PRESENTATION_RE = /separei|encontrei|vou te mostrar|essas opções|essas bebidas|essas sobremesas/i;
  if (PRESENTATION_RE.test(finalResponse) && finalCards.length === 0) {
    finalResponse = finalResponse.replace(
      /^[^.!?\n]*(?:separei|encontrei|vou te mostrar|essas opções|essas bebidas|essas sobremesas)[^.!?\n]*/i,
      "Posso te ajudar com o cardápio 😊"
    ).trim();
  }

  return {
    reply:             finalResponse || "Desculpe, não consegui processar sua mensagem. 😅",
    cards:             finalCards,
    mode:              finalCards.length > 0 && v2.mode === "BROWSE" ? "SUGGESTION" : v2.mode,
    options:           v2.options,
    suggestedItemName,
    memoryPatch:       v2.memoryPatch,
  };
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
      customerPhone: true,
      status: true,
      customer: { select: { phone: true } },
    },
  });

  if (!conversation) {
    console.warn(`[AIOrderService] Conversation not found: ${conversationId}`);
    return;
  }

  if (!conversation.customerId || !conversation.customer) {
    console.warn(`[AIOrderService] Conversation ${conversationId} has no customer — skipping`);
    return;
  }

  // Only process OPEN conversations (BOT is already being processed elsewhere)
  if (
    conversation.status === ConversationStatus.HUMAN ||
    conversation.status === ConversationStatus.RESOLVED
  ) {
    return;
  }

  const { restaurantId, customerId } = conversation as typeof conversation & { customerId: string };

  // 2. Mark as BOT
  await prisma.conversation.update({
    where: { id: conversationId },
    data: { status: ConversationStatus.BOT },
  });

  // 3. Load brand config + a credencial do canal único (Meta)
  const [brandConfig, restaurantName, metaConfig] = await Promise.all([
    BrandConfigService.getOrDefault(restaurantId),
    prisma.restaurant.findUnique({ where: { id: restaurantId }, select: { name: true } })
      .then((r) => r?.name ?? ""),
    // `null` cobre "não configurado" E "banco tossiu". Nos dois casos não dá para
    // responder — e ausência de informação não é permissão (guardrail 1).
    MetaConfigService.getResolved(restaurantId).catch((err) => {
      console.error(`[AIOrderService] leitura da config Meta falhou p/ ${restaurantId}`, err);
      return null;
    }),
  ]);

  // Falha fechado: sem credencial da Meta não há canal de saída. Devolve a
  // conversa para OPEN (nunca deixa presa em BOT) e registra o caso concreto.
  if (!metaConfig) {
    console.warn(
      `[AIOrderService] sem config Meta para o restaurante ${restaurantId} — turno abortado (conv ${conversationId})`
    );
    await prisma.conversation.update({
      where: { id: conversationId },
      data: { status: ConversationStatus.OPEN },
    });
    return;
  }
  // Reply target: prefer the conversation's channel phone (from the WhatsApp webhook,
  // always deliverable). Customer.phone is CRM data and can be malformed (seen live:
  // 12-digit local number without country code, rejected by Meta as INVALID_PHONE).
  const toPhone = ((conversation.customerPhone ?? "").trim() || conversation.customer!.phone! ).replace(/^\+/, "");

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
    drinkAttemptsThisTurn:   0,
    drinkAttemptsPriorTurns: 0, // overwritten below after parallel query
    confirmOrderAttempts:    0,
    checkoutIntent:          false,
  };

  // 5. Build sales profile + guardrail data + upsell context
  const salesProfile = buildSalesProfile(brandConfig, restaurantName);

  // Load guardrail data in parallel with the existing profile build
  const [alreadySuggestedItems, customerPrefs, drinkAttemptsPriorTurns, lastUserMessage] = await Promise.all([
    getAlreadySuggestedItems(conversationId),
    prisma.customerPreference.findUnique({
      where:  { customerId },
      select: { dietary: true, allergies: true },
    }),
    getDrinkAttemptCount(conversationId),
    prisma.message.findFirst({
      where:   { conversationId, direction: "INBOUND" },
      orderBy: { sentAt: "desc" },
      select:  { content: true },
    }).then((m) => m?.content ?? ""),
  ]);
  const alreadySuggestedIds = new Set<string>(alreadySuggestedItems.map((i: { id: string }) => i.id));
  toolCtx.drinkAttemptsPriorTurns = drinkAttemptsPriorTurns;

  const customerDietary   = customerPrefs?.dietary   ?? [];
  const customerAllergies = customerPrefs?.allergies ?? [];

  const upsellResult = await UpsellEngine.suggest(
    restaurantId,
    draftId,
    salesProfile.salesPriority,
    alreadySuggestedIds,
    customerDietary,
    customerAllergies,
    salesProfile.targetTicket,
    salesProfile.targetItems,
  );
  const {
    suggestions: upsellSuggestions,
    cartValue,
    cartItemCount,
    valueGap,
    itemGap,
  } = upsellResult;

  // Determine current stage so we only inject upsell hints when appropriate
  const upsellStage   = inferUpsellStage(cartItemCount, upsellSuggestions);
  const upsellAllowed = upsellStage === "food" || upsellStage === 3 || upsellStage === 4;

  // 6. Build messages — pass UpsellEngine metrics so PromptBuilder has single source of truth
  const messages = await PromptBuilderService.build({
    conversationId,
    restaurantId,
    customerId,
    brandConfig,
    upsellMetrics: { cartValue, cartItemCount, valueGap, itemGap },
  });

  // Inject upsell hints into system message — ONLY in Stage 3 or 4
  const sysMsg = messages[0] as OpenAI.Chat.ChatCompletionSystemMessageParam;
  let sysAddendum = "";

  // WaiterBrain: when cart is empty UpsellEngine returns nothing (requires a draft).
  // Load main item candidates directly so RECOMMEND_MAIN has products to offer.
  const mainItemFallback: UpsellSuggestion[] = cartItemCount === 0
    ? await (async () => {
        const rows = await prisma.menuItem.findMany({
          where:   { isActive: true, category: { restaurantId } },
          include: { category: { select: { name: true } } },
          take: 20,
        });
        return rows
          .filter((i) => isMainCategory(i.category.name))
          .slice(0, 3)
          .map((i) => ({
            menuItemId:   i.id,
            name:         i.name,
            price:        Number(i.price),
            categoryName: i.category.name,
            reason:       "prato principal",
          }));
      })()
    : [];

  // WaiterBrain — intent-driven decision for this turn
  const waiterCandidates = cartItemCount === 0 ? mainItemFallback : upsellSuggestions;
  const waiterDecision = WaiterBrain.decide({
    userMessage: lastUserMessage,
    state: {
      cartItemCount,
      upsellStage,
      drinkAttemptsPrior: drinkAttemptsPriorTurns,
    },
    candidates: brandConfig.upsellStyle !== "none" ? waiterCandidates : [],
  });
  sysAddendum += waiterDecision.directive;

  // Dietary hard rule — inject restrictions as a non-negotiable filter block.
  // UpsellEngine already filters suggest_upsell candidates; this addendum
  // covers free-text mentions and add_item calls that bypass UpsellEngine.
  if (customerDietary.length > 0 || customerAllergies.length > 0) {
    const lines: string[] = [];
    if (customerDietary.length > 0)   lines.push(`Restrições: ${customerDietary.join(", ")}`);
    if (customerAllergies.length > 0) lines.push(`Alergias: ${customerAllergies.join(", ")}`);
    sysAddendum +=
      "\n\n⚠️ RESTRIÇÕES ALIMENTARES ATIVAS (filtro obrigatório neste turno):\n" +
      lines.map((l) => `  ${l}`).join("\n") +
      "\n  → PROIBIDO sugerir, mencionar ou adicionar qualquer item incompatível." +
      "\n  → Se não houver opções compatíveis: responda 'Hoje não temos opções compatíveis" +
      " com essa restrição' — nunca sugira substituto não verificado.";
  }

  // Anti-repeat: list already-suggested items by name+ID so AI can match
  // them against the conversation context and never repeat or re-pitch.
  if (alreadySuggestedItems.length > 0) {
    sysAddendum +=
      "\n\nITENS JÁ SUGERIDOS NESTA CONVERSA (alreadySuggestedIds + rejectedIds — PROIBIDO repetir):\n" +
      alreadySuggestedItems
        .map((i: { id: string; name: string }) => `  • ${i.name} [ID: ${i.id}]`)
        .join("\n") +
      "\n  → Estes itens NÃO devem aparecer novamente como sugestão, independente do estágio." +
      "\n  → Se não houver item novo disponível em uma categoria → PULE a categoria inteira.";
  }

  // ── Library → runtime bridge (same governed, fallback-safe path as web) ──────
  const libraryKnowledge = await getWaiterRuntimeKnowledge({ restaurantId, agentSlug: "waiter" });
  if (libraryKnowledge.enabled && libraryKnowledge.promptBlock) {
    sysAddendum += libraryKnowledge.promptBlock;
  }

  if (sysAddendum) {
    messages[0] = { ...sysMsg, content: sysMsg.content + sysAddendum };
  }

  // 7. OpenAI tool-call loop
  let promptTokens = 0;
  let completionTokens = 0;
  const toolCallsMade: Array<{ name: string; args: unknown; result: unknown; success: boolean }> = [];
  let finalResponse = "";
  let addItemAttempts = 0;            // guard: max 2 add_item calls per turn
  let upsellTriggeredBy: "model" | "fail_safe" | null = null;

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
        // Server-side guard: max 2 add_item calls per turn (original + 1 retry)
        if (toolCall.function.name === "add_item") {
          addItemAttempts++;
          if (addItemAttempts > 2) {
            const blocked = {
              success: false,
              message: "PARAR: limite de tentativas add_item atingido neste turno. " +
                       "Responda ao cliente diretamente sem chamar add_item novamente.",
            };
            loopMessages.push({
              role: "tool",
              tool_call_id: toolCall.id,
              content: JSON.stringify(blocked),
            });
            toolCallsMade.push({
              name: "add_item",
              args: safeJson(toolCall.function.arguments),
              result: blocked,
              success: false,
            });
            continue;
          }
        }

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

  // Track whether the model itself triggered suggest_upsell
  if (toolCallsMade.some((tc) => tc.name === "suggest_upsell")) {
    upsellTriggeredBy = "model";
  }

  // ── Speech ↔ tool audit (observe-only) ───────────────────────
  // Log when AI mentioned a product name without calling suggest_upsell.
  // Silent auto-execution is disabled — AI handles it on the next turn.
  if (
    finalResponse &&
    !handoffRequested &&
    upsellAllowed &&
    !toolCallsMade.some((tc) => tc.name === "suggest_upsell")
  ) {
    const hit = upsellSuggestions.find(
      (s) => s.name.length >= 4 &&
        normalizeText(finalResponse).includes(normalizeText(s.name))
    );
    if (hit) {
      console.warn(
        `[AIOrderService] [SPEECH-TOOL-MISMATCH] stage=${upsellStage} product="${hit.name}" reason="model mentioned product without calling suggest_upsell — no auto-fire"`
      );
    }
  }

  // ── Per-turn decision log ─────────────────────────────────────
  const conflictDetected =
    (!upsellAllowed && toolCallsMade.some((tc) => tc.name === "suggest_upsell")) ||
    (upsellStage === "none" && toolCallsMade.some((tc) => tc.name === "confirm_order" && !tc.success));
  console.info("[AIOrderService] [TURN DECISION]", JSON.stringify({
    stage:               upsellStage,
    intent:              waiterDecision.intent,
    action:              waiterDecision.action,
    upsell_allowed:      upsellAllowed,
    upsell_triggered_by: upsellTriggeredBy,
    conflict_detected:   conflictDetected,
  }));

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

    await sendWhatsAppReply(restaurantId, toPhone, handoffMsg, conversationId);
    await logTurn({ restaurantId, conversationId, model: brandConfig.aiModel,
      promptTokens, completionTokens, latencyMs, toolCallsMade,
      turnNumber: 1, success: true, errorMessage: `handoff: ${handoffReason}` });
    return;
  }

  // 9. Send reply
  if (finalResponse) {
    await sendWhatsAppReply(restaurantId, toPhone, finalResponse, conversationId);
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
  restaurantId: string,
  toPhone: string,
  text: string,
  conversationId: string
): Promise<void> {
  try {
    // Canal único: a Meta homologada. Não existe caminho alternativo em erro.
    const result = await sendWhatsAppText(restaurantId, toPhone, text);
    if (!result.ok) {
      console.error("[AIOrderService] send failed:", result.errorCode, result.error);
      return;
    }
    const now = new Date();

    await prisma.$transaction([
      prisma.message.create({
        data: {
          conversationId,
          direction: "OUTBOUND",
          senderType: "AI",
          content: text,
          type: "TEXT",
          sentAt: now,
          externalStatus: "sent",
          provider: result.provider,
          ...(result.providerMessageId
            ? { externalMessageId: result.providerMessageId, providerMessageId: result.providerMessageId }
            : {}),
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

    // Localiza a conversa para mandar a mensagem de queda pelo canal oficial
    const conv = await prisma.conversation.findUnique({
      where: { id: conversationId },
      select: { restaurantId: true, customerPhone: true, customer: { select: { phone: true } } },
    });

    if (conv) {
      const phone = ((conv.customerPhone ?? "").trim() || (conv.customer?.phone ?? "").trim()).replace(/^\+/, "");
      if (phone) {
        await sendWhatsAppReply(conv.restaurantId, phone, message, conversationId);
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

// Strip accents + lowercase for robust product-name matching.
function normalizeText(text: string): string {
  return text.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
}

// buildGoalContext removed — goal context is now generated exclusively by
// PromptBuilderService.buildGoalsBlock() using UpsellEngine metrics passed
// via PromptContext.upsellMetrics. Single source of truth.
