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
 * ON_ENTRY           — customer opened the ordering page
 * ON_MENU_MODE       — customer chose "Ver cardápio" (passive browsing)
 * ON_USER_MESSAGE    — customer sent a free-text message (requires AI)
 * ON_ITEM_ADDED      — customer added an item to the cart
 * ON_CART_UPDATED    — cart now has 2+ items (upgrade/drink window opens)
 * ON_IDLE            — customer has been inactive; show best sellers
 * ON_CHECKOUT_STARTED — customer tapped "Finalizar pedido"
 * AFTER_CHECKOUT     — order confirmed; only answer status/logistics questions
 */
export type V2Event =
  | "ON_ENTRY"
  | "ON_MENU_MODE"
  | "ON_USER_MESSAGE"
  | "ON_ITEM_ADDED"
  | "ON_CART_UPDATED"
  | "ON_IDLE"
  | "ON_CHECKOUT_STARTED"
  | "AFTER_CHECKOUT";

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
}

export interface V2Output {
  message:      string;   // short text (≤ 2 lines)
  cards:        string[]; // product IDs to render as UI cards
  requiresAI:   boolean;  // when true → caller must run OpenAI pipeline
  aiDirective:  string;   // injected into system prompt for AI events
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

// ─── directive builder for AI events ────────────────────────

const BASE_DIRECTIVE = `
━━━ WAITERBRAIN V2 — REGRAS OBRIGATÓRIAS NESTE TURNO ━━━
▶ Você é um assistente de vendas embutido num menu digital — NÃO é um chatbot.
▶ MENSAGEM: máximo 2 linhas. Direta. Amigável.
▶ PRODUTOS: NUNCA liste itens no texto. SEMPRE use suggest_upsell para sugerir.
▶ PROIBIDO chamar confirm_order — o checkout é controlado PELO CLIENTE via botão.
▶ PROIBIDO pedir dados pessoais (nome, endereço, pagamento) — o UI coleta isso.
━━━`;

function buildUserMessageDirective(cartItemIds: string[], cartValue: number): string {
  const hasItems = cartItemIds.length > 0;
  const lines = [
    BASE_DIRECTIVE,
    "",
    hasItems
      ? `CONTEXTO: cliente tem ${cartItemIds.length} item(ns) no carrinho (R$ ${cartValue.toFixed(2)}).`
      : "CONTEXTO: carrinho vazio.",
    "",
    "DECISÃO DESTE TURNO:",
    hasItems
      ? [
          "  → Cliente enviou mensagem com itens no carrinho.",
          "  → Responda diretamente ao que perguntou.",
          "  → Se houver oportunidade → sugira 1 item via suggest_upsell.",
          "  → Não force checkout — deixe o cliente decidir.",
        ].join("\n")
      : [
          "  → Carrinho vazio: faça UMA pergunta de qualificação antes de sugerir.",
          "  → Ex: 'Prefere algo mais leve ou mais completo?'",
          "  → Após a resposta → sugira 1 item via suggest_upsell.",
          "  → NUNCA sugira antes de qualificar.",
        ].join("\n"),
  ];
  return lines.join("\n");
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
    message:    "Bem-vindo! 😊\nQuer uma sugestão ou prefere explorar o cardápio?",
    cards:      [],
    requiresAI: false,
    aiDirective: "",
  };
}

function handleMenuMode(): V2Output {
  return {
    message:    "Perfeito 👌\nFica à vontade — se quiser uma sugestão, me chama 😉",
    cards:      [],
    requiresAI: false,
    aiDirective: "",
  };
}

function handleItemAdded(input: V2Input): V2Output {
  const cards = complementaryFood(input.catalog, input.lastAddedId, input.cartItemIds);
  return {
    message:    cards.length > 0
      ? "Boa escolha 🔥\nEsse aqui combina muito bem 👇"
      : "Boa escolha! 🔥",
    cards,
    requiresAI: false,
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
    requiresAI: false,
    aiDirective: "",
  };
}

function handleIdle(input: V2Input): V2Output {
  const cards = topSellers(input.catalog, input.cartItemIds, 3);
  return {
    message:    "Se quiser algo certeiro, esses são os mais pedidos 👇",
    cards,
    requiresAI: false,
    aiDirective: "",
  };
}

function handleCheckoutStarted(): V2Output {
  return {
    message:    "Perfeito 😊\nVamos finalizar rapidinho 👇",
    cards:      [],
    requiresAI: false,
    aiDirective: "",
  };
}

function handleAfterCheckout(): V2Output {
  return {
    message:    "",
    cards:      [],
    requiresAI: true,
    aiDirective: buildAfterCheckoutDirective(),
  };
}

function handleUserMessage(input: V2Input): V2Output {
  return {
    message:    "",
    cards:      [],
    requiresAI: true,
    aiDirective: buildUserMessageDirective(input.cartItemIds, input.cartValue),
  };
}

// ─── public API ───────────────────────────────────────────────

export function decide(input: V2Input): V2Output {
  switch (input.event) {
    case "ON_ENTRY":           return handleEntry();
    case "ON_MENU_MODE":       return handleMenuMode();
    case "ON_ITEM_ADDED":      return handleItemAdded(input);
    case "ON_CART_UPDATED":    return handleCartUpdated(input);
    case "ON_IDLE":            return handleIdle(input);
    case "ON_CHECKOUT_STARTED": return handleCheckoutStarted();
    case "AFTER_CHECKOUT":     return handleAfterCheckout();
    case "ON_USER_MESSAGE":    return handleUserMessage(input);
  }
}
