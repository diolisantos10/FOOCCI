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
import {
  DEFAULT_PERSONALITY,
  DEFAULT_SALES,
  ALLOWED_MODELS,
} from "@/lib/agent/types";
import type {
  PersonalityConfig,
  SalesConfig,
  AgentContext,
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
      imageUrl:    item.imageUrl,
    })),
  }));
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

function buildSalesPhaseBlock(
  phase:  ReturnType<typeof resolveSalesPhase>,
): string {
  if (phase.salesResolved || !phase.type) return "";

  if (phase.type === "drink") {
    return [
      `━━━ FASE COMERCIAL: BEBIDA ━━━`,
      `O cliente tem itens no carrinho mas ainda não escolheu uma bebida.`,
      `Sugira uma bebida que combine com o pedido, de forma natural e consultiva — como um garçom experiente.`,
      `REGRA: Não use linguagem de finalização de pedido (endereço, pagamento, entrega) enquanto esta fase não for resolvida.`,
      `Se o cliente recusar ou ignorar, continue o fluxo normalmente sem insistir.`,
    ].join("\n");
  }

  // dessert phase
  return [
    `━━━ FASE COMERCIAL: SOBREMESA ━━━`,
    `O cliente já tem bebida no carrinho. Há uma oportunidade de sugerir uma sobremesa leve.`,
    `Faça a sugestão de forma natural, uma única vez — sem pressionar.`,
    `REGRA: Não use linguagem de finalização de pedido (endereço, pagamento, entrega) enquanto esta fase não for resolvida.`,
    `Se o cliente recusar ou ignorar, continue o fluxo normalmente.`,
  ].join("\n");
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
  } = input;

  // ── Step 1: Build full AI context ─────────────────────────────────────────
  const ctx = await buildAIContext(restaurantId, {
    customerId,
    customerPhone,
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
  // Skipped during BROWSE: the AI must respond freely to greetings and menu
  // questions; applying the gate here would block the initial greeting and
  // every browsing message once the cart has items.
  const gate = stage !== "BROWSE" ? validateOrderFlow(ctx) : { block: false as const };
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
  };

  // ── Step 4: Assemble system prompt ────────────────────────────────────────
  let systemPrompt: string;

  if (ctx.aiConfig.systemPromptOverride) {
    // Owner-provided full override — use as-is, no layer injection
    systemPrompt = ctx.aiConfig.systemPromptOverride;
  } else {
    // Build informational preamble (prepended = lowest LLM attention weight)
    const preamble = [
      buildCustomerBlock(ctx.customer),
      buildPromotionsBlock(ctx.promotions),
      buildSalesPhaseBlock(salesFlow),
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
  const cappedHistory = history.slice(-ctx.aiConfig.maxHistoryMessages);

  // ── Step 7: Call OpenAI ───────────────────────────────────────────────────
  const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
    { role: "system", content: systemPrompt },
    ...cappedHistory.map((m) => ({ role: m.role, content: m.content })),
    { role: "user", content: message.trim() },
  ];

  const completion = await openai.chat.completions.create({
    model,
    messages,
    max_tokens:  200,
    temperature: 0.2,
  });

  const reply =
    completion.choices[0]?.message?.content?.trim() ??
    "Desculpe, não consegui processar sua mensagem. 😅";

  return { reply };
}
