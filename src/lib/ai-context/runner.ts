/**
 * runAITurn — connects the AI Brain context to the OpenAI model.
 *
 * Pipeline:
 *   1. buildAIContext()     — fetch all restaurant/menu/customer/config data
 *   1b. validateOrderFlow() — hard gate: blocks AI if required fields missing
 *   1c. resolveSalesPhase() — upsell phase (DRINK/DESSERT/DONE); blockCheckout advisory
 *   2. filterMenuForAI()    — remove items that conflict with dietary profile
 *   3. Build system prompt  — informational preamble + 5-layer behavioral prompt
 *   4. Call OpenAI          — validated model, capped history, max 200 tokens
 *   5. Return reply
 *
 * Prompt structure (low → high LLM attention weight):
 *   [customer block]   — who is ordering (prepended, informational)
 *   [promotions block] — active discounts (prepended, informational)
 *   [personality]      — voice, tone, style       ┐
 *   [menu block]       — what the AI may reference ├ buildAgentPrompt()
 *   [cart block]       — current order state       │
 *   [sales layer]      — upsell strategy           │
 *   [PROTOCOL]         — absolute rules (LAST)     ┘ ← highest recency weight
 *
 * Domain safety:
 *   - AI only sees the filtered menu → cannot recommend excluded items
 *   - Protocol layer (last) prohibits inventing items, prices, promotions
 *   - ALLOWED_MODELS whitelist prevents model substitution
 *   - System controls stage transitions; AI only controls language
 */

import { openai }              from "@/lib/openai";
import type OpenAI              from "openai";
import { buildAIContext }       from "./builder";
import { filterMenuForAI }      from "./filter";
import { buildAgentPrompt }     from "@/lib/agent/builder";
import { validateOrderFlow }    from "@/lib/order/orchestrator";
import { resolveSalesPhase }    from "@/lib/sales/flow";
import { selectSuggestion }     from "@/lib/sales/suggest";
import {
  DEFAULT_PERSONALITY,
  DEFAULT_SALES,
  ALLOWED_MODELS,
} from "@/lib/agent/types";
import type {
  PersonalityConfig,
  SalesConfig,
  AgentContext,
  SuggestedItem,
  CartItem,
  MenuCategoryMeta,
  MenuItemMeta,
  OrderStage,
} from "@/lib/agent/types";
import type {
  AIContext,
  MenuCategoryContext,
  PromotionContext,
  CustomerContext,
} from "./types";

// ── Public types ──────────────────────────────────────────────────────────────

/** Cart item as sent by the ordering client — matches lib/agent/types CartItem. */
export interface TurnCartItem {
  name:  string;
  price: number;
  qty:   number;
}

export interface AITurnInput {
  restaurantId:    string;
  message:         string;
  history:         Array<{ role: "user" | "assistant"; content: string }>;
  cart?:           TurnCartItem[];
  stage?:          OrderStage;
  upsellOffered?:  "drink" | "dessert" | null;
  deliveryMethod?: "delivery" | "pickup" | null;
  /** Delivery address collected from the customer during conversation. */
  address?:        string | null;
  /** Payment method chosen by the customer (e.g. "pix", "cash", "card"). */
  paymentMethod?:  string | null;
  /** Pass if customer is already identified (auth or session). */
  customerId?:     string;
  /** Pass if customer identity was resolved by phone but no DB ID yet. */
  customerPhone?:  string;
  /** Customer name collected during checkout flow (anonymous ordering). */
  customerName?:   string | null;
  /**
   * Set by the frontend when the customer first navigates to a category that
   * has a description. The runner injects this into the preamble so the AI
   * presents the category naturally — without the user message appearing in chat.
   */
  categoryIntro?:  { name: string; description: string } | null;
}

export interface AITurnOutput {
  reply: string;
  /**
   * True when the orchestrator blocked the AI call and returned a
   * forced message. The route handler can use this to skip history
   * recording or trigger a different UI state.
   */
  forced?: true;
  /** The flow rule that triggered the block (e.g. "MISSING_PAYMENT"). */
  reason?: string;
  /** Name of the item the AI is actively suggesting, if any. */
  suggestedItemName?: string;
}

// ── Coerce helper ─────────────────────────────────────────────────────────────

function coerce<T extends string>(
  value: string | null | undefined,
  allowed: T[],
  fallback: T
): T {
  return allowed.includes(value as T) ? (value as T) : fallback;
}

// ── AIContext → typed agent configs ───────────────────────────────────────────

function toPersonality(cfg: AIContext["aiConfig"]): PersonalityConfig {
  return {
    tone: coerce(
      cfg.tone,
      ["friendly", "professional", "casual", "warm"],
      DEFAULT_PERSONALITY.tone
    ),
    formality: coerce(
      cfg.formality,
      ["formal", "informal", "mixed"],
      DEFAULT_PERSONALITY.formality
    ),
    emojiUsage: coerce(
      cfg.emojiUsage,
      ["none", "minimal", "moderate", "expressive"],
      DEFAULT_PERSONALITY.emojiUsage
    ),
    communicationStyle: coerce(
      cfg.communicationStyle,
      ["conversational", "concise", "detailed"],
      DEFAULT_PERSONALITY.communicationStyle
    ),
    preset: coerce(
      cfg.personalityPreset,
      ["traditional", "fast", "premium", "young", "aggressive"],
      DEFAULT_PERSONALITY.preset
    ),
    greetingTemplate: cfg.greetingTemplate,
  };
}

function toSales(cfg: AIContext["aiConfig"]): SalesConfig {
  return {
    upsellStyle: coerce(
      cfg.upsellStyle,
      ["none", "gentle", "moderate", "proactive"],
      DEFAULT_SALES.upsellStyle
    ),
    upsellIntensity: coerce(
      cfg.upsellIntensity,
      ["low", "medium", "high"],
      DEFAULT_SALES.upsellIntensity
    ),
    focus: coerce(
      cfg.salesFocus,
      ["balanced", "ticket", "volume"],
      DEFAULT_SALES.focus
    ),
    priority: coerce(
      cfg.salesPriority,
      ["bestsellers", "high_margin", "promotions"],
      DEFAULT_SALES.priority
    ),
  };
}

// ── MenuCategoryContext → MenuCategoryMeta (agent format) ─────────────────────

function toMenuMeta(categories: MenuCategoryContext[]): MenuCategoryMeta[] {
  return categories.map((cat) => ({
    name:        cat.name,
    description: cat.description,
    items:       cat.items.map((item): MenuItemMeta => ({
      name:        item.name,
      price:       item.price,
      description: item.description,
      ingredients: item.ingredients,
      imageUrl:    item.imageUrl,
    })),
  }));
}

// ── Information depth detection ───────────────────────────────────────────────
//
// Detects whether the customer's message is requesting more detail than the
// default SHORT category presentation. Default is LOW (2 sentences max).
// HIGH is triggered by common Portuguese "explain more" phrases.

const HIGH_DEPTH_TRIGGERS = [
  "explica", "me conta", "me fala mais", "me diz mais",
  "o que e", "o que é", "o que sao", "o que são",
  "qual a diferenca", "qual a diferença", "qual e", "qual é",
  "como e feito", "como é feito", "ingredientes", "como funciona",
  "mais detalhes", "mais informacao", "mais informação", "curiosidade",
];

function detectInfoDepth(msg: string): "LOW" | "HIGH" {
  const n = msg.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  return HIGH_DEPTH_TRIGGERS.some((t) => n.includes(t)) ? "HIGH" : "LOW";
}

function buildInfoDepthBlock(depth: "LOW" | "HIGH", stage: OrderStage): string {
  if (stage !== "BROWSE") return "";
  if (depth === "HIGH") {
    return [
      `━━━ PROFUNDIDADE DE RESPOSTA: ALTA ━━━`,
      `O cliente pediu mais detalhes. Você pode usar 3–4 frases curtas.`,
      `Ainda conciso — mas mais completo nesta resposta.`,
    ].join("\n");
  }
  return [
    `━━━ PROFUNDIDADE DE RESPOSTA: BAIXA (padrão) ━━━`,
    `Máx. 2 frases curtas. Situe o cliente rapidamente.`,
    `NÃO explique demais, NÃO liste itens, NÃO antecipe perguntas que ele não fez.`,
  ].join("\n");
}

// ── Category intro hint ───────────────────────────────────────────────────────
//
// Injected into the preamble when the customer first navigates to a described
// category. Using a preamble hint (instead of a user message) keeps the chat
// clean: the AI's intro appears without a corresponding "Ver categoria: X" bubble.

function buildCategoryIntroHint(
  intro: { name: string; description: string },
): string {
  return [
    `━━━ NAVEGAÇÃO DE CATEGORIA ━━━`,
    `O cliente está visualizando: ${intro.name}`,
    `Descrição: ${intro.description}`,
    `→ Apresente esta categoria em 1–2 frases naturais, como um maître apresentando uma seção do cardápio.`,
    `→ NÃO narre o clique nem use "você selecionou" ou "você está vendo".`,
    `→ Máx. 2 frases curtas (≤18 palavras cada). Apelo sensorial, direto ao ponto.`,
  ].join("\n");
}

// ── Informational preamble blocks ─────────────────────────────────────────────
//
// These are prepended BEFORE the 5-layer behavioral prompt so they carry the
// lowest LLM attention weight. The protocol layer remains LAST and authoritative.

function buildCustomerBlock(customer: CustomerContext | null): string {
  if (!customer) return "";

  const firstName = customer.name.trim().split(/\s+/)[0];
  const lines: string[] = [`━━━ CLIENTE ━━━`];

  lines.push(`Nome: ${firstName}`);

  if (customer.isRecurring) {
    lines.push(
      `Cliente recorrente — ${customer.totalOrders} pedido(s).`
    );
  } else {
    lines.push("Novo cliente ou primeira compra.");
  }

  if (customer.preferences) {
    if (customer.preferences.dietary.length > 0) {
      lines.push(`Preferências alimentares: ${customer.preferences.dietary.join(", ")}`);
    }
    if (customer.preferences.allergies.length > 0) {
      lines.push(`Alergias: ${customer.preferences.allergies.join(", ")}`);
    }
  }

  if (customer.segments.length > 0) {
    lines.push(`Segmento: ${customer.segments.join(", ")}`);
  }

  lines.push(
    "Use o primeiro nome quando soar natural. Não mencione valores gastos ao cliente."
  );

  return lines.join("\n");
}

function buildPromotionsBlock(promotions: PromotionContext[]): string {
  if (promotions.length === 0) return "";

  const lines = promotions.map((p) => {
    let discount: string;
    if (p.type === "PERCENTAGE")    discount = `${p.discountValue}% de desconto`;
    else if (p.type === "FREE_DELIVERY") discount = "frete grátis";
    else if (p.type === "FIXED")    discount = `R$ ${p.discountValue.toFixed(2)} de desconto`;
    else                            discount = p.name;

    const minOrder  = p.minOrderValue != null
      ? ` (pedido mínimo R$ ${p.minOrderValue.toFixed(2)})`
      : "";
    const coupon    = p.couponCode ? ` — cupom: ${p.couponCode}` : "";
    const expiry    = p.endsAt
      ? ` — válido até ${new Date(p.endsAt).toLocaleDateString("pt-BR")}`
      : "";

    return `  • ${p.name}: ${discount}${minOrder}${coupon}${expiry}`;
  });

  return [
    `━━━ PROMOÇÕES ATIVAS ━━━`,
    ...lines,
    `Mencione promoções desta lista quando relevante. Nunca invente descontos.`,
  ].join("\n");
}

function buildCustomerSuggestionHint(
  customer:  CustomerContext | null,
  itemName:  string,
): string {
  if (!customer) return "";
  // Check if this customer has ordered this item before
  const ordered = customer.recentOrders.some((o) =>
    o.items.some((i) => i.name.toLowerCase().includes(itemName.toLowerCase()))
  );
  if (ordered) {
    return `Contexto CRM: este cliente já pediu "${itemName}" antes — pode mencionar isso naturalmente se couber.`;
  }
  if (customer.preferences?.dietary.length) {
    return `Preferências do cliente: ${customer.preferences.dietary.join(", ")} — leve em conta ao enquadrar a sugestão.`;
  }
  return "";
}

function buildSalesPhaseBlock(
  phase:      ReturnType<typeof resolveSalesPhase>,
  suggestion: SuggestedItem | null,
  customer:   CustomerContext | null,
): string {
  if (phase.salesResolved || !phase.type) return "";

  const typeLabel = phase.type === "drink" ? "BEBIDA" : "SOBREMESA";
  const lines: string[] = [`━━━ FASE COMERCIAL: ${typeLabel} ━━━`];

  if (suggestion) {
    // Specific item selected — give the AI precise context to work with
    lines.push(
      `Item para sugerir: "${suggestion.itemName}" — R$ ${suggestion.itemPrice.toFixed(2)}`,
      `Motivo contextual: ${suggestion.reason}`,
    );
    if (suggestion.itemDescription) {
      lines.push(`Descrição: ${suggestion.itemDescription}`);
    }
    if (suggestion.promotionHint) {
      lines.push(
        `Promoção ativa: ${suggestion.promotionHint} — mencione de forma casual se couber, nunca como argumento de venda.`,
      );
    }
    const crmHint = buildCustomerSuggestionHint(customer, suggestion.itemName);
    if (crmHint) lines.push(crmHint);
  } else {
    // No specific item found — generic fallback.
    // Directive is intentionally narrow: pick ONE item from the category and
    // name it directly. The sales constraint block (last in prompt) enforces this.
    if (phase.type === "drink") {
      lines.push(
        "Nenhum item específico selecionado. Escolha UMA bebida do cardápio que combine com o pedido.",
        "Nomeie-a diretamente na sugestão — não liste opções nem peça ao cliente para escolher a categoria.",
      );
    } else {
      lines.push(
        "Nenhuma sobremesa específica selecionada. Escolha UMA sobremesa do cardápio.",
        "Nomeie-a diretamente na sugestão — não liste opções nem peça ao cliente para escolher a categoria.",
      );
    }
  }

  lines.push(
    `REGRA: Não use linguagem de finalização (endereço, pagamento, entrega) nesta fase.`,
    `Se o cliente recusar ou ignorar, continue o fluxo normalmente sem insistir.`,
  );

  return lines.join("\n");
}

// ── Main runner ───────────────────────────────────────────────────────────────

export async function runAITurn(input: AITurnInput): Promise<AITurnOutput> {
  const {
    restaurantId,
    message,
    history,
    cart           = [],
    stage          = "BROWSE",
    upsellOffered  = null,
    deliveryMethod = null,
    address        = null,
    paymentMethod  = null,
    customerId,
    customerPhone,
    customerName   = null,
    categoryIntro  = null,
  } = input;

  // ── Step 1: Build full AI context ─────────────────────────────────────────
  const ctx = await buildAIContext(restaurantId, {
    customerId,
    customerPhone,
    customerName,
    orderStage:    stage,
    deliveryMethod,
    address,
    paymentMethod,
    channel:       "delivery",
    cart: cart.map((item) => ({
      name:      item.name,
      quantity:  item.qty,
      unitPrice: item.price,
    })),
  });

  // ── Step 1b: Order orchestrator gate ──────────────────────────────────────
  // Runs BEFORE the AI model is called. If any required field is missing the
  // orchestrator returns a deterministic forced message — no LLM involved.
  //
  // Only active at REVIEW_ORDER and DONE — the stages where ALL checkout data
  // must already be present. During data-collection stages (ADDRESS_INPUT,
  // ASK_NAME, PAYMENT, etc.) the UI panels drive the flow; the AI just responds
  // naturally and should not be blocked by the orchestrator.
  const VALIDATE_AT = new Set<OrderStage>(["REVIEW_ORDER", "DONE"]);
  const gate = VALIDATE_AT.has(stage) ? validateOrderFlow(ctx) : { block: false as const };
  if (gate.block) {
    return {
      reply:  gate.message,
      forced: true,
      reason: gate.reason,
    };
  }

  // ── Step 1c: Sales phase resolution ───────────────────────────────────────
  // Determines the current upsell phase (DRINK / DESSERT / DONE / NONE) and
  // whether checkout language should be blocked in the AI response.
  // Runs after the orchestrator gate; result is written back to ctx.operational
  // so downstream modules (prompt builder) can read it.
  const salesFlow = resolveSalesPhase(ctx, upsellOffered ?? null);
  ctx.operational.salesPhase   = salesFlow.salesPhase;
  ctx.operational.salesResolved = salesFlow.salesResolved;

  // ── Step 2: Filter menu for this customer's dietary profile + message ──────
  const filteredMenu = filterMenuForAI(ctx.menu, {
    customerDietary: ctx.customer?.preferences?.dietary,
    userMessage:     message,
  });

  // ── Step 3: Convert context to agent-layer types ───────────────────────────
  const personality = toPersonality(ctx.aiConfig);
  const sales       = toSales(ctx.aiConfig);

  // ── Step 2b: Derive prompt-facing sales phase ─────────────────────────────
  // When upsellOffered is explicitly set by the frontend, it IS the active phase —
  // treat it as authoritative. Do NOT use salesFlow.type here: resolveSalesPhase
  // treats alreadyOffered="drink" as "drink was completed → advance to dessert",
  // which would contradict the frontend that is currently mid-drink offer.
  //
  // When upsellOffered is null the customer is browsing freely; suppress the
  // upsell directive entirely so the AI doesn't suggest drinks on first item add.
  const promptSalesFlow: typeof salesFlow = upsellOffered
    ? { ...salesFlow, salesResolved: false, type: upsellOffered }
    : { ...salesFlow, salesResolved: true, type: undefined };

  // ── Step 2c: Select best suggestion item for the active sales phase ────────
  // Operates on promptSalesFlow so we never suggest items during free browsing.
  const suggestion = promptSalesFlow.type
    ? selectSuggestion(ctx, filteredMenu, promptSalesFlow.type, sales.priority)
    : null;

  const agentCtx: AgentContext = {
    restaurantName: ctx.restaurant.name,
    categories:     toMenuMeta(filteredMenu),
    cart:           cart.map((item): CartItem => ({
      name:  item.name,
      price: item.price,
      qty:   item.qty,
    })),
    stage,
    upsellOffered,
    deliveryMethod,
    suggestedItem:  suggestion,
    // Checkout data collected via UI panels — passed to the protocol layer so
    // stage scripts can explicitly state what was already collected, preventing
    // the AI from re-asking for information the customer already provided.
    collectedAddress:       address      ?? null,
    collectedCustomerName:  customerName ?? null,
    collectedPaymentMethod: ctx.operational.paymentMethod ?? null,
  };

  // ── Step 4: Assemble system prompt ────────────────────────────────────────
  let systemPrompt: string;

  if (ctx.aiConfig.systemPromptOverride) {
    // Owner-provided full override — use as-is, no layer injection
    systemPrompt = ctx.aiConfig.systemPromptOverride;
  } else {
    // Build informational preamble (prepended = lowest LLM attention weight)
    const infoDepth = detectInfoDepth(message);
    const preamble = [
      buildInfoDepthBlock(infoDepth, stage),
      categoryIntro ? buildCategoryIntroHint(categoryIntro) : "",
      buildCustomerBlock(ctx.customer),
      buildPromotionsBlock(ctx.promotions),
      buildSalesPhaseBlock(promptSalesFlow, suggestion, ctx.customer),
    ].filter(Boolean).join("\n\n");

    // 5-layer behavioral prompt — protocol is LAST (highest attention weight)
    const agentLayers = buildAgentPrompt(personality, sales, agentCtx);

    systemPrompt = preamble ? `${preamble}\n\n${agentLayers}` : agentLayers;
  }

  // ── Step 5: Validate model ─────────────────────────────────────────────────
  const model = ALLOWED_MODELS.has(ctx.aiConfig.aiModel)
    ? ctx.aiConfig.aiModel
    : "gpt-4o-mini";

  // ── Step 6: Cap history ────────────────────────────────────────────────────
  // At checkout stages (non-BROWSE) the AI must respond to state, not to
  // the conversation. Clearing history prevents the AI from being confused
  // by earlier browsing messages and re-asking for already-collected data.
  const cappedHistory =
    stage === "BROWSE"
      ? history.slice(-ctx.aiConfig.maxHistoryMessages)
      : [];

  // ── Step 7: Call OpenAI ───────────────────────────────────────────────────
  const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
    { role: "system", content: systemPrompt },
    // Filter out any empty-content entries — OpenAI rejects them with 400.
    ...cappedHistory
      .filter((m) => m.content.trim().length > 0)
      .map((m) => ({ role: m.role, content: m.content })),
    { role: "user", content: message.trim() },
  ];

  const completion = await openai.chat.completions.create({
    model,
    messages,
    max_tokens:  200,
    temperature: 0.2,
  });

  // Use || (not ??) so that an empty-string response also falls back.
  const reply =
    completion.choices[0]?.message?.content?.trim() ||
    "Desculpe, não consegui processar sua mensagem. 😅";

  return { reply, suggestedItemName: suggestion?.itemName ?? undefined };
}
