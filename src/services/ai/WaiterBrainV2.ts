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
  message?:     string;      // raw user message (for intent detection)
}

export interface V2Output {
  message:      string;   // short text (≤ 2 lines)
  cards:        string[]; // product IDs to render as UI cards
  requiresAI:   boolean;  // when true → caller must run OpenAI pipeline
  aiDirective:  string;   // injected into system prompt for AI events
  /** Quick-reply buttons rendered below the response — each string is a tap-to-send label. */
  options?:     string[];
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
▶ PROIBIDO dizer "adicionei", "coloquei no pedido", "já está no carrinho", "mando?" — você SUGERE; quem adiciona é o CLIENTE tocando no "+".
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
    "VOCÊ É UM GARÇOM — SIGA ESTAS ETAPAS NESTE TURNO:",
    "",
    "ETAPA 1 — EXTRAIA A INTENÇÃO DO CLIENTE:",
    "  Leia o que o cliente disse e identifique o que ele quer comer/beber.",
    "  Exemplos de intenção:",
    '    "algo leve"    → pratos leves, saladas, entradas',
    '    "quero salada" → categoria saladas',
    '    "com fome"     → pratos principais, combos',
    '    "algo rápido"  → itens simples e rápidos',
    '    "algo doce"    → sobremesas',
    '    "quero beber"  → bebidas',
    "",
    "ETAPA 2 — ENCONTRE O ITEM NO CARDÁPIO:",
    "  Leia o cardápio completo acima.",
    "  Para cada item verifique: nome, descrição E ingredientes.",
    "  Encontre o item que MELHOR corresponde à intenção extraída.",
    "",
    "ETAPA 3 — SUGIRA (OBRIGATÓRIO):",
    "  → Execute suggest_upsell com o ID do item encontrado.",
    "  → NUNCA mencione o item só no texto sem chamar suggest_upsell.",
    "",
    "ETAPA 4 — CONFIRME:",
    "  Escreva 1 frase curta (max 1 linha) que:",
    '    • reflete o que o cliente pediu (ex: "Esse aqui é leve e bem fresquinho 👇")',
    "    • convida a confirmar — sem fazer perguntas abertas",
    "",
    "SE NÃO HOUVER INTENÇÃO CLARA:",
    "  → Faça UMA pergunta com 2 opções:",
    '    Exemplo: "Prefere algo leve ou mais completo? 👇"',
    "  → NÃO sugira nenhum produto sem antes entender o que o cliente quer.",
    hasItems
      ? "  → Com itens no carrinho: responda ao que perguntou, sugira 1 complemento se houver oportunidade."
      : "",
  ].filter((l) => l !== "").join("\n");
}

function buildCategoryIntentDirective(intent: "light" | "complete"): string {
  const isLight = intent === "light";
  return [
    BASE_DIRECTIVE,
    "",
    `CONTEXTO: cliente escolheu "${isLight ? "ALGO LEVE" : "REFEIÇÃO COMPLETA"}". Carrinho vazio.`,
    "",
    "OBRIGATÓRIO NESTE TURNO:",
    `  → Responda com 1 frase curta (max 1 linha): ex. "${isLight
      ? "Aqui estão algumas opções leves pra você 👇"
      : "Ótima escolha! Aqui estão opções para uma refeição completa 👇"}"`,
    `  → Chame suggest_upsell 2 a 3 vezes, cada vez com um item ${isLight
      ? "LEVE (entradas, saladas, peixes, pratos leves — SEM combos, SEM grelhados pesados)"
      : "COMPLETO (combos, pratos principais, grelhados, massas, teppan, yakisoba — SEM entradas avulsas leves)"}`,
    "  → NUNCA sugira apenas 1 item — SEMPRE 2 a 3 suggest_upsell calls neste turno.",
    "  → PROIBIDO misturar categorias (leve com completo ou vice-versa).",
    "  → PROIBIDO fazer perguntas.",
    "  → PROIBIDO dizer que adicionou — você SUGERE, o cliente adiciona.",
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
    message:    "Perfeito 😊\nSe já estiver tudo certo, pode finalizar 👇",
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
  const hasItems = input.cartItemIds.length > 0;
  const msg = (input.message ?? "").toLowerCase();

  // Detect category intent from qualifier buttons.
  // When detected, use the multi-suggest category directive instead of the generic one.
  let aiDirective: string;
  if (!hasItems && /leve|light|🥗/u.test(msg)) {
    aiDirective = buildCategoryIntentDirective("light");
  } else if (!hasItems && /completa|completo|refeição|complete|🍽/u.test(msg)) {
    aiDirective = buildCategoryIntentDirective("complete");
  } else {
    aiDirective = buildUserMessageDirective(input.cartItemIds, input.cartValue);
  }

  return {
    message:    "",
    cards:      [],
    requiresAI: true,
    aiDirective,
    // Qualification buttons only shown on first free-text message with empty cart.
    // Exactly 2 options per UX spec — no "surprise me".
    options: hasItems ? undefined : ["Leve", "Completo"],
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
