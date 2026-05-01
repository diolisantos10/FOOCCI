/**
 * WaiterBrainV2 — event-driven sales assistant for the digital menu.
 *
 * Reacts to UI events instead of reading user messages directly.
 * Returns { message, cards } where cards is a list of product IDs
 * to render as UI cards — the AI never lists products in text.
 *
 * Design contract:
 *   UI controls checkout, payment, and address flow.
 *   WaiterBrainV2 controls sales suggestions only.
 *   AI text is always short (≤ 2 lines).
 *   Products are ALWAYS shown via cards, never listed in text.
 */

import { isDessertCategory } from "./ConversationGuardrails";

// ─── public types ─────────────────────────────────────────────

/**
 * Events emitted by the UI to drive WaiterBrainV2 decisions.
 *
 * ON_ENTRY             — customer opened the ordering page
 * ON_MENU_MODE         — customer chose "Ver cardápio" (passive browsing)
 * ON_USER_MESSAGE      — customer sent a free-text message (requires AI)
 * ON_ITEM_ADDED        — customer added an item to the cart
 * ON_CART_UPDATED      — cart now has 2+ items (upgrade/drink window opens)
 * ON_IDLE              — customer has been inactive; show best sellers
 * ON_CHECKOUT_STARTED  — customer tapped "Finalizar pedido"
 * AFTER_CHECKOUT       — order confirmed; only answer status/logistics questions
 * ON_PERMISSION_ACCEPT — customer accepted the suggestion prompt (INTERVENTION mode)
 */
export type V2Event =
  | "ON_ENTRY"
  | "ON_MENU_MODE"
  | "ON_USER_MESSAGE"
  | "ON_ITEM_ADDED"
  | "ON_CART_UPDATED"
  | "ON_IDLE"
  | "ON_CHECKOUT_STARTED"
  | "AFTER_CHECKOUT"
  | "ON_PERMISSION_ACCEPT";

/** Flat product descriptor used for card selection (no full MenuItem needed). */
export interface V2CatalogItem {
  id:           string;
  name:         string;
  categoryName: string;
  price:        number;
  sortOrder?:   number;
}

export interface V2Input {
  event:        V2Event;
  cartItemIds:  string[];    // IDs of items currently in cart
  cartValue:    number;      // current cart subtotal in BRL
  lastAddedId?: string;      // for ON_ITEM_ADDED: the item just added
  catalog:      V2CatalogItem[];
  message?:     string;      // raw user message (for intent detection)
}

/** Rendering mode returned to the client so the UI knows how to behave. */
export type WaiterMode = "BROWSE" | "SUGGESTION" | "INTERVENTION" | "CHECKOUT_SUPPORT";

/** A tappable quick-reply button. `label` is display text; `value` is what gets sent. */
export interface WaiterOption {
  label: string;
  value: string;
}

export interface V2Output {
  message:     string;          // short text (≤ 2 lines)
  cards:       string[];        // product IDs to render as UI cards
  mode:        WaiterMode;      // UI rendering state
  options:     WaiterOption[];  // quick-reply buttons — empty array when none
  requiresAI:  boolean;         // when true → caller must run OpenAI pipeline
  aiDirective: string;          // injected into system prompt for AI events
}

// ─── sales intelligence types ────────────────────────────────

export type CustomerIntent =
  | "browsing_alone"
  | "wants_recommendation"
  | "wants_light_food"
  | "wants_complete_meal"
  | "wants_for_group"
  | "price_sensitive"
  | "premium_experience"
  | "asks_drink"
  | "asks_dessert"
  | "asks_pairing"
  | "checkout_intent"
  | "restriction_based"
  | "unclear";

export type SalesOpportunity =
  | "suggest_main_item"
  | "suggest_combo"
  | "suggest_group_option"
  | "suggest_pairing"
  | "suggest_drink"
  | "suggest_dessert"
  | "suggest_premium_upgrade"
  | "ask_clarifying_question"
  | "stay_quiet"
  | "support_checkout";

export interface SalesAnalysis {
  customerIntent:   CustomerIntent;
  salesOpportunity: SalesOpportunity;
  confidence:       number;   // 0–1
  reason:           string;   // human-readable explanation for debug/logging
}

// ─── sales intelligence core ─────────────────────────────────

/**
 * Deterministic intent + opportunity classifier.
 * Reads the raw customer message and returns a SalesAnalysis.
 * Does NOT change any existing WaiterBrainV2 behavior — called by
 * handlers in future sprints. Currently side-effect-free.
 */
export function analyzeSalesContext(input: V2Input): SalesAnalysis {
  const msg     = (input.message ?? "").toLowerCase().trim();
  const hasCart = input.cartItemIds.length > 0;

  // ── intent detection (deterministic keyword rules) ────────
  if (/\b(família|familia|grupo|[2-9]\s*pessoas?)\b/i.test(msg)) {
    return {
      customerIntent:   "wants_for_group",
      salesOpportunity: "suggest_group_option",
      confidence:       0.9,
      reason:           "group/family keyword detected",
    };
  }

  if (/bebida|refri(gerante)?|água|suco|drink/i.test(msg)) {
    return {
      customerIntent:   "asks_drink",
      salesOpportunity: "suggest_drink",
      confidence:       0.9,
      reason:           "drink keyword detected",
    };
  }

  if (/sobremesa|doce/i.test(msg)) {
    return {
      customerIntent:   "asks_dessert",
      salesOpportunity: "suggest_dessert",
      confidence:       0.9,
      reason:           "dessert keyword detected",
    };
  }

  if (/\bleve\b|light/i.test(msg)) {
    return {
      customerIntent:   "wants_light_food",
      salesOpportunity: "suggest_main_item",
      confidence:       0.85,
      reason:           "light-food keyword detected",
    };
  }

  if (/\bcompleto\b|\bcomplete\b|refeição completa/i.test(msg)) {
    return {
      customerIntent:   "wants_complete_meal",
      salesOpportunity: "suggest_combo",
      confidence:       0.85,
      reason:           "complete-meal keyword detected",
    };
  }

  if (/barato|econôm|econom|até\s*R?\$|em conta/i.test(msg)) {
    return {
      customerIntent:   "price_sensitive",
      salesOpportunity: "suggest_main_item",
      confidence:       0.85,
      reason:           "price-sensitivity keyword detected",
    };
  }

  if (/combina|acompanha|vai bem|harmoniz/i.test(msg)) {
    return {
      customerIntent:   "asks_pairing",
      salesOpportunity: hasCart ? "suggest_pairing" : "ask_clarifying_question",
      confidence:       0.85,
      reason:           "pairing keyword detected",
    };
  }

  if (/sugere|indica|recomenda|me ajud|o que (tem|você|vc)/i.test(msg)) {
    return {
      customerIntent:   "wants_recommendation",
      salesOpportunity: hasCart ? "suggest_pairing" : "suggest_main_item",
      confidence:       0.8,
      reason:           "recommendation-request keyword detected",
    };
  }

  // Default: unclear → ask a clarifying question
  return {
    customerIntent:   "unclear",
    salesOpportunity: "ask_clarifying_question",
    confidence:       0.5,
    reason:           "no clear intent signal in message",
  };
}

// ─── category classifiers ─────────────────────────────────────

function isDrinkCategory(name: string): boolean {
  return /bebida|suco|drink|refri|água|cerveja|vinho|refrigerante|soda|shake/i.test(name);
}

function isComplementCategory(name: string): boolean {
  return !isDrinkCategory(name) && !isDessertCategory(name);
}

// ─── card selection helpers ───────────────────────────────────

function bySort(a: V2CatalogItem, b: V2CatalogItem): number {
  return (a.sortOrder ?? 999) - (b.sortOrder ?? 999);
}

/**
 * Picks up to `limit` top-selling (lowest sortOrder) non-drink/non-dessert items
 * that are not already in the cart.
 */
function topSellers(catalog: V2CatalogItem[], cartItemIds: string[], limit = 3): string[] {
  return catalog
    .filter((i) => isComplementCategory(i.categoryName) && !cartItemIds.includes(i.id))
    .sort(bySort)
    .slice(0, limit)
    .map((i) => i.id);
}

/**
 * Picks 1 complementary food item (different category from the last-added item,
 * not a drink, not a dessert, not already in cart).
 */
function complementaryFood(
  catalog:      V2CatalogItem[],
  lastAddedId:  string | undefined,
  cartItemIds:  string[],
): string[] {
  const lastCat = catalog.find((i) => i.id === lastAddedId)?.categoryName ?? "";
  const candidate = catalog
    .filter(
      (i) =>
        isComplementCategory(i.categoryName) &&
        i.categoryName !== lastCat &&
        !cartItemIds.includes(i.id),
    )
    .sort(bySort)[0];
  return candidate ? [candidate.id] : [];
}

/**
 * Picks 1–2 drink items not already in the cart.
 */
function drinkSuggestions(catalog: V2CatalogItem[], cartItemIds: string[], limit = 2): string[] {
  return catalog
    .filter((i) => isDrinkCategory(i.categoryName) && !cartItemIds.includes(i.id))
    .sort(bySort)
    .slice(0, limit)
    .map((i) => i.id);
}

/**
 * When cart has 2+ items, check whether drinks are absent and offer them.
 * Otherwise offer food upgrades (higher-priced items in the same categories).
 */
function cartUpdateCards(
  catalog:     V2CatalogItem[],
  cartItemIds: string[],
  cartValue:   number,
): { cards: string[]; offersDrink: boolean } {
  const hasDrink = cartItemIds.some((id) => {
    const item = catalog.find((i) => i.id === id);
    return item && isDrinkCategory(item.categoryName);
  });

  if (!hasDrink) {
    const drinks = drinkSuggestions(catalog, cartItemIds, 2);
    if (drinks.length > 0) return { cards: drinks, offersDrink: true };
  }

  // No drink opportunity — offer a food upgrade (highest-price item not in cart)
  const upgrade = catalog
    .filter((i) => isComplementCategory(i.categoryName) && !cartItemIds.includes(i.id))
    .sort((a, b) => b.price - a.price)[0];
  return { cards: upgrade ? [upgrade.id] : [], offersDrink: false };
}

// ─── product selection helpers (Sales Intelligence) ──────────
// All helpers: filter by category/price, exclude cart items, return IDs only.

function selectDrinkItems(catalog: V2CatalogItem[], cartItemIds: string[], limit: number): string[] {
  return catalog
    .filter((i) => isDrinkCategory(i.categoryName) && !cartItemIds.includes(i.id))
    .sort(bySort)
    .slice(0, limit)
    .map((i) => i.id);
}

function selectDessertItems(catalog: V2CatalogItem[], cartItemIds: string[], limit: number): string[] {
  return catalog
    .filter((i) => isDessertCategory(i.categoryName) && !cartItemIds.includes(i.id))
    .sort(bySort)
    .slice(0, limit)
    .map((i) => i.id);
}

function selectLightItems(catalog: V2CatalogItem[], cartItemIds: string[], limit: number): string[] {
  const mains = catalog.filter((i) => isComplementCategory(i.categoryName) && !cartItemIds.includes(i.id));
  if (mains.length === 0) return [];
  const prices  = mains.map((i) => i.price).sort((a, b) => a - b);
  const median  = prices[Math.floor(prices.length / 2)] ?? 0;
  // Light = category sounds like starters/salads OR price ≤ median (smaller portion proxy)
  const light = mains.filter(
    (i) =>
      /entrada|salada|aperitiv|petisco|porcao|porção|tira.gosto|snack/i.test(i.categoryName) ||
      i.price <= median,
  );
  return (light.length > 0 ? light : mains).sort(bySort).slice(0, limit).map((i) => i.id);
}

function selectCompleteMealItems(catalog: V2CatalogItem[], cartItemIds: string[], limit: number): string[] {
  const mains = catalog.filter((i) => isComplementCategory(i.categoryName) && !cartItemIds.includes(i.id));
  if (mains.length === 0) return [];
  const prices  = mains.map((i) => i.price).sort((a, b) => a - b);
  const median  = prices[Math.floor(prices.length / 2)] ?? 0;
  // Complete = name/category suggests main/combo OR price ≥ median (larger portion proxy)
  const complete = mains.filter(
    (i) =>
      /combo|completo|principal|refeição|família/i.test(i.name) ||
      /combo|principal|main/i.test(i.categoryName) ||
      i.price >= median,
  );
  return (complete.length > 0 ? complete : mains).sort(bySort).slice(0, limit).map((i) => i.id);
}

function selectGroupItems(catalog: V2CatalogItem[], cartItemIds: string[], limit: number): string[] {
  const mains = catalog.filter((i) => isComplementCategory(i.categoryName) && !cartItemIds.includes(i.id));
  if (mains.length === 0) return [];
  // Group = name signals combo/family, or fallback to highest-priced (largest portions)
  const group = mains.filter(
    (i) =>
      /combo|famil|balde|bandeja|para\s*[2-9]|[2-9]\s*pessoa/i.test(i.name) ||
      /famil|compartilh/i.test(i.categoryName),
  );
  if (group.length > 0) return group.sort(bySort).slice(0, limit).map((i) => i.id);
  return [...mains].sort((a, b) => b.price - a.price).slice(0, limit).map((i) => i.id);
}

// ─── directive builder for AI events ────────────────────────

const BASE_DIRECTIVE = `
━━━ GARÇOM VIRTUAL — REGRAS INVIOLÁVEIS ━━━
▶ Você é um garçom virtual num menu digital — NÃO um chatbot.
▶ MENSAGEM: máximo 2 linhas. Direta. Natural.
▶ REGRA VISUAL: se mencionou um produto → chame suggest_upsell. Se diz → mostra.
▶ NUNCA liste produtos no texto. NUNCA sugira sem chamar suggest_upsell.
▶ PROIBIDO confirm_order — o checkout é controlado pelo CLIENTE via botão.
▶ PROIBIDO pedir dados pessoais — o UI coleta isso.
▶ PROIBIDO dizer "adicionei" ou qualquer variante — você SUGERE; quem adiciona é o CLIENTE.
━━━`;

function buildUserMessageDirective(cartItemIds: string[], cartValue: number): string {
  const hasItems = cartItemIds.length > 0;
  const contextLine = hasItems
    ? `CONTEXTO: cliente tem ${cartItemIds.length} item(ns) no carrinho (R$ ${cartValue.toFixed(2)}).`
    : "CONTEXTO: carrinho vazio.";

  return [
    BASE_DIRECTIVE,
    "",
    contextLine,
    "",
    "━━━ MODELO DE DECISÃO — escolha EXATAMENTE UM comportamento ━━━",
    "",
    "EXECUTAR — cliente sabe o que quer (pediu item específico ou aceitou sugestão)",
    "  → Leia o cardápio (nome, descrição, ingredientes) e encontre o item.",
    "  → Execute suggest_upsell com o ID correto.",
    "  → Opcionalmente sugira 1 complemento leve depois.",
    "",
    "GUIAR — cliente está indeciso ou mensagem vaga sem intenção clara",
    "  → Faça UMA pergunta com botões — NUNCA pergunta aberta.",
    '  → Ex: "Prefere algo leve ou mais completo? 👇"',
    "  → NÃO sugira produto nenhum neste turno.",
    "",
    "SUGERIR — cliente pediu ajuda, pediu sugestão, ou expressou preferência de categoria",
    "  → Leia o cardápio (nome, descrição, ingredientes) e encontre o melhor item.",
    "  → Execute suggest_upsell com UM produto.",
    "  → 1 benefício curto + convite a confirmar.",
    '  → Ex: "Esse aqui é leve e bem fresquinho. Quer experimentar? 👇"',
    "  → Mapeamento de intenção:",
    '    "algo leve"   → pratos leves, saladas, entradas',
    '    "com fome"    → pratos principais, combos',
    '    "algo doce"   → sobremesas',
    '    "quero beber" → bebidas',
    "",
    "OBSERVAR — cliente está navegando, sem pedir nada",
    "  → Não interrompa.",
    '  → Pode perguntar: "Quer uma sugestão? 👇"',
    "",
    "FINALIZAR — cliente sinalizou fechamento (\"fecha\", \"é isso\", \"confirma\", \"só isso\")",
    "  → Ofereça bebida OU sobremesa se ainda não estiver no carrinho — uma vez.",
    "  → Depois: pare de vender.",
    "",
    "REGRA VISUAL (CRÍTICA): se você mencionar um produto → chame suggest_upsell.",
    "Se diz → mostra. Sem exceção.",
    "━━━",
  ].join("\n");
}

function buildCategoryIntentDirective(intent: "light" | "complete"): string {
  const isLight = intent === "light";
  return [
    BASE_DIRECTIVE,
    "",
    `CONTEXTO: cliente escolheu "${isLight ? "LEVE" : "COMPLETO"}". Carrinho vazio.`,
    `COMPORTAMENTO: SUGERIR (grade de categoria — ${isLight ? "2 a 3 itens leves" : "2 a 3 itens completos"})`,
    "",
    "OBRIGATÓRIO NESTE TURNO:",
    `  → 1 frase curta: ex. "${isLight
      ? "Aqui estão algumas opções leves pra você 👇"
      : "Ótima escolha! Veja as opções para uma refeição completa 👇"}"`,
    `  → Chame suggest_upsell 2 a 3 vezes — cada call com um item ${isLight
      ? "LEVE (entradas, saladas, peixes, pratos leves — SEM combos, SEM grelhados pesados)"
      : "COMPLETO (combos, pratos principais, grelhados, massas, teppan, yakisoba — SEM entradas avulsas)"}`,
    "  → NUNCA apenas 1 suggest_upsell — SEMPRE 2 a 3 calls neste turno.",
    "  → PROIBIDO misturar categorias.",
    "  → PROIBIDO fazer perguntas.",
  ].join("\n");
}

function buildAfterCheckoutDirective(): string {
  return [
    BASE_DIRECTIVE,
    "",
    "FASE: PÓS-CHECKOUT — pedido já foi confirmado.",
    "  → Apenas responda dúvidas sobre prazo de entrega, pagamento ou status.",
    "  → PROIBIDO sugerir novos produtos.",
    "  → PROIBIDO chamar qualquer ferramenta de adicionar/sugerir item.",
  ].join("\n");
}

// ─── event handlers ───────────────────────────────────────────

function handleEntry(): V2Output {
  return {
    message:     "Bem-vindo! 😊\nQuer uma sugestão ou prefere explorar o cardápio?",
    cards:       [],
    mode:        "BROWSE",
    options:     [],
    requiresAI:  false,
    aiDirective: "",
  };
}

function handleMenuMode(): V2Output {
  return {
    message:     "Perfeito 👌\nFica à vontade — se quiser uma sugestão, me chama 😉",
    cards:       [],
    mode:        "BROWSE",
    options:     [],
    requiresAI:  false,
    aiDirective: "",
  };
}

function handleItemAdded(): V2Output {
  return {
    message:     "Escolha certeira 👌",
    cards:       [],
    mode:        "BROWSE",
    options:     [],
    requiresAI:  false,
    aiDirective: "",
  };
}

function handleCartUpdated(input: V2Input): V2Output {
  const { cards, offersDrink } = cartUpdateCards(input.catalog, input.cartItemIds, input.cartValue);
  const message = offersDrink
    ? "Pra fechar bem, uma bebida gelada cai perfeito 👇"
    : cards.length > 0
      ? "Boa combinação! Quer dar um upgrade no pedido? 👇"
      : "Tá ficando ótimo o pedido! 🔥";
  return {
    message,
    cards,
    mode:        cards.length > 0 ? "SUGGESTION" : "BROWSE",
    options:     [],
    requiresAI:  false,
    aiDirective: "",
  };
}

function handleIdle(input: V2Input): V2Output {
  const cards = topSellers(input.catalog, input.cartItemIds, 3);
  return {
    message:     "Se quiser algo certeiro, esses são os mais pedidos 👇",
    cards,
    mode:        cards.length > 0 ? "SUGGESTION" : "BROWSE",
    options:     [],
    requiresAI:  false,
    aiDirective: "",
  };
}

function handleCheckoutStarted(): V2Output {
  return {
    message:     "Perfeito 😊\nSe já estiver tudo certo, pode finalizar 👇",
    cards:       [],
    mode:        "CHECKOUT_SUPPORT",
    options:     [],
    requiresAI:  false,
    aiDirective: "",
  };
}

function buildInterventionDirective(): string {
  return [
    BASE_DIRECTIVE,
    "",
    "CONTEXTO: cliente aceitou receber sugestões ativas (INTERVENTION mode).",
    "COMPORTAMENTO: SUGERIR (grade de sugestões — 2 a 3 itens variados)",
    "",
    "OBRIGATÓRIO NESTE TURNO:",
    '  → 1 frase de abertura curta: ex. "Separei algumas opções pra você 👇"',
    "  → Chame suggest_upsell 2 a 3 vezes — cada call com um produto diferente.",
    "  → NUNCA apenas 1 suggest_upsell — SEMPRE 2 a 3 calls neste turno.",
    "  → Varie as categorias quando possível.",
    "  → PROIBIDO fazer perguntas.",
  ].join("\n");
}

function handleInterventionRequest(): V2Output {
  return {
    message:     "",
    cards:       [],
    mode:        "INTERVENTION",
    options:     [],
    requiresAI:  true,
    aiDirective: buildInterventionDirective(),
  };
}

function handleAfterCheckout(): V2Output {
  return {
    message:     "",
    cards:       [],
    mode:        "CHECKOUT_SUPPORT",
    options:     [],
    requiresAI:  true,
    aiDirective: buildAfterCheckoutDirective(),
  };
}

function noCardsFound(): V2Output {
  return {
    message:     "Não encontrei uma opção perfeita agora. Quer explorar o cardápio?",
    cards:       [],
    mode:        "BROWSE",
    options:     [{ label: "Ver cardápio", value: "browse_menu" }],
    requiresAI:  false,
    aiDirective: "",
  };
}

function handleUserMessage(input: V2Input): V2Output {
  const analysis  = analyzeSalesContext(input);
  const hasItems  = input.cartItemIds.length > 0;
  const { catalog, cartItemIds } = input;

  // ── Deterministic paths (Sales Intelligence — no AI call) ────
  switch (analysis.customerIntent) {
    case "wants_light_food": {
      const cards = selectLightItems(catalog, cartItemIds, 3);
      if (cards.length > 0) return { message: "Separei algumas opções mais leves pra você 👇", cards, mode: "SUGGESTION", options: [], requiresAI: false, aiDirective: "" };
      return noCardsFound();
    }
    case "wants_complete_meal": {
      const cards = selectCompleteMealItems(catalog, cartItemIds, 3);
      if (cards.length > 0) return { message: "Separei opções mais completas pra você 👇", cards, mode: "SUGGESTION", options: [], requiresAI: false, aiDirective: "" };
      return noCardsFound();
    }
    case "wants_for_group": {
      const cards = selectGroupItems(catalog, cartItemIds, 3);
      if (cards.length > 0) return { message: "Pra compartilhar, essas opções fazem mais sentido 👇", cards, mode: "SUGGESTION", options: [], requiresAI: false, aiDirective: "" };
      return noCardsFound();
    }
    case "asks_dessert": {
      const cards = selectDessertItems(catalog, cartItemIds, 3);
      if (cards.length > 0) return { message: "Para adoçar o final 🍰", cards, mode: "SUGGESTION", options: [], requiresAI: false, aiDirective: "" };
      return noCardsFound();
    }
    case "asks_drink": {
      const cards = selectDrinkItems(catalog, cartItemIds, 3);
      if (cards.length > 0) return { message: "Aqui estão as bebidas disponíveis 👇", cards, mode: "SUGGESTION", options: [], requiresAI: false, aiDirective: "" };
      return noCardsFound();
    }
    case "unclear": {
      // Cart is empty → qualification buttons; cart has items → fall through to AI
      if (!hasItems) return { message: "Prefere algo mais leve ou completo?", options: [{ label: "Leve", value: "light" }, { label: "Completo", value: "complete" }], cards: [], mode: "BROWSE", requiresAI: false, aiDirective: "" };
      break;
    }
  }

  // ── AI path for remaining intents ─────────────────────────────
  // (wants_recommendation, price_sensitive, premium_experience,
  //  asks_pairing, checkout_intent, restriction_based, unclear+cart)
  return {
    message:     "",
    cards:       [],
    mode:        "BROWSE",
    options:     hasItems ? [] : [{ label: "Leve", value: "light" }, { label: "Completo", value: "complete" }],
    requiresAI:  true,
    aiDirective: buildUserMessageDirective(input.cartItemIds, input.cartValue),
  };
}

// ─── public API ───────────────────────────────────────────────

export function decide(input: V2Input): V2Output {
  switch (input.event) {
    case "ON_ENTRY":            return handleEntry();
    case "ON_MENU_MODE":        return handleMenuMode();
    case "ON_ITEM_ADDED":       return handleItemAdded();
    case "ON_CART_UPDATED":     return handleCartUpdated(input);
    case "ON_IDLE":             return handleIdle(input);
    case "ON_CHECKOUT_STARTED": return handleCheckoutStarted();
    case "AFTER_CHECKOUT":      return handleAfterCheckout();
    case "ON_USER_MESSAGE":     return handleUserMessage(input);
    case "ON_PERMISSION_ACCEPT": return handleInterventionRequest();
  }
}
