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
  | "ON_PERMISSION_ACCEPT"    // kept for backward compat
  | "ON_PERMISSION_ACCEPTED"  // canonical form used by AutoPilot and new clients
  | "ON_PERMISSION_DECLINED";

/** Flat product descriptor used for card selection (no full MenuItem needed). */
export interface V2CatalogItem {
  id:           string;
  name:         string;
  categoryName: string;
  price:        number;
  sortOrder?:   number;
  description?: string | null;
}

// ─── session memory ───────────────────────────────────────────

/**
 * Lightweight session memory held by the client (never persisted).
 * Passed in via V2Input.memory; updates returned via V2Output.memoryPatch.
 */
export interface WaiterMemory {
  suggestedProductIds:     string[];   // products shown as cards this session
  declinedSuggestionTypes: string[];   // e.g. "passive_help", "final_upsell"
  acceptedSuggestionTypes: string[];
  lastIntent:              string | null;
  lastMode:                string | null;
  permissionDeclinedAt:    number | null; // Unix ms — null means never declined
  promptCount:             number;        // how many idle permission prompts shown
  finalUpsellPromptShown:  boolean;       // pre-checkout upsell prompt was shown once
  finalUpsellDeclined:     boolean;       // user clicked "Não, finalizar"
  qualificationCount:      number;        // qualifying questions asked this session (anti-loop)
}

/** Returns a blank WaiterMemory for a new ordering session. */
export function createWaiterMemory(): WaiterMemory {
  return {
    suggestedProductIds:     [],
    declinedSuggestionTypes: [],
    acceptedSuggestionTypes: [],
    lastIntent:              null,
    lastMode:                null,
    permissionDeclinedAt:    null,
    promptCount:             0,
    finalUpsellPromptShown:  false,
    finalUpsellDeclined:     false,
    qualificationCount:      0,
  };
}

// ─── waiter sales config ──────────────────────────────────────

/** Configures Sales Specialist Agent behavior per restaurant. */
export type WaiterSalesConfig = {
  interactionLevel:                    "low" | "medium" | "high";
  upsellStyle:                         "subtle" | "balanced" | "aggressive";
  permissionRequiredBeforeSuggestions: boolean;
  allowIdlePrompt:                     boolean;
  allowFinalUpsellPrompt:              boolean;
  maxPermissionPromptsPerSession:      number;
  tone:                                "traditional" | "premium" | "young" | "fast";
};

/**
 * Default hardcoded config — medium/balanced behavior.
 * Future Agents panel will replace this with a per-restaurant value from DB.
 */
export const DEFAULT_WAITER_CONFIG: WaiterSalesConfig = {
  interactionLevel:                    "medium",
  upsellStyle:                         "balanced",
  permissionRequiredBeforeSuggestions: true,
  allowIdlePrompt:                     true,
  allowFinalUpsellPrompt:              true,
  maxPermissionPromptsPerSession:      2,
  tone:                                "traditional",
};

// Cooldown duration per interaction level
const COOLDOWN_BY_LEVEL: Record<WaiterSalesConfig["interactionLevel"], number> = {
  low:    15 * 60 * 1000,  // 15 min — less intrusive
  medium:  5 * 60 * 1000,  // 5 min  — balanced (current default)
  high:    2 * 60 * 1000,  // 2 min  — more responsive
};

// Upsell-style copy overrides (balanced uses INTENT_COPY defaults)
const SUBTLE_COPY: Partial<Record<CustomerIntent, string>> = {
  wants_light_option:   "Se preferir algo mais leve, essas podem funcionar 👇",
  wants_complete_meal:  "Para uma refeição mais completa, essas são opções 👇",
  wants_group_order:    "Para dividir, essas opções podem funcionar 👇",
  wants_budget_option:  "Temos opções com bom custo-benefício 👇",
  wants_premium_option: "Temos algumas opções diferenciadas, se quiser ver 👇",
  asks_for_drink:       "Para acompanhar, essas são as opções disponíveis 👇",
  asks_for_dessert:     "Para finalizar, temos essas opções de sobremesa 👇",
  asks_for_pairing:     "Para complementar, essas podem combinar 👇",
};

const AGGRESSIVE_COPY: Partial<Record<CustomerIntent, string>> = {
  wants_light_option:   "Pra algo mais leve — essas são as melhores escolhas 👇",
  wants_complete_meal:  "Pra uma refeição completa — essas são perfeitas 👇",
  wants_group_order:    "Pra compartilhar — não tem como errar nessas 👇",
  wants_budget_option:  "Melhor custo-benefício da casa — garantido 👇",
  wants_premium_option: "Experiência premium — você vai adorar 👇",
  asks_for_drink:       "Essas bebidas vão completar seu pedido 👇",
  asks_for_dessert:     "Sobremesas que valem muito a pena 👇",
  asks_for_pairing:     "Combinação perfeita para o seu pedido 👇",
};

// ─── internal observability ───────────────────────────────────
// Enable with: WAITER_DEBUG=true
// Never exposed to the customer UI — server console only.

const DEBUG_ENABLED =
  typeof process !== "undefined" && process.env.WAITER_DEBUG === "true";

function waiterLog(payload: Record<string, unknown>): void {
  if (!DEBUG_ENABLED) return;
  // eslint-disable-next-line no-console
  console.log("[WaiterBrainV2]", JSON.stringify(payload));
}

export interface V2Input {
  event:        V2Event;
  cartItemIds:  string[];    // IDs of items currently in cart
  cartValue:    number;      // current cart subtotal in BRL
  lastAddedId?: string;      // for ON_ITEM_ADDED: the item just added
  catalog:      V2CatalogItem[];
  message?:     string;      // raw user message (for intent detection)
  memory?:      WaiterMemory;    // current session memory — client passes this in
  config?:      WaiterSalesConfig; // optional per-restaurant config override
}

/** Rendering mode returned to the client so the UI knows how to behave. */
export type WaiterMode = "BROWSE" | "SUGGESTION" | "INTERVENTION" | "CHECKOUT_SUPPORT";

/** A tappable quick-reply button. `label` is display text; `value` is what gets sent. */
export interface WaiterOption {
  label: string;
  value: string;
}

export interface V2Output {
  message:      string;          // short text (≤ 2 lines)
  cards:        string[];        // product IDs to render as UI cards
  mode:         WaiterMode;      // UI rendering state
  options:      WaiterOption[];  // quick-reply buttons — empty array when none
  requiresAI:   boolean;         // when true → caller must run OpenAI pipeline
  aiDirective:  string;          // injected into system prompt for AI events
  memoryPatch?: Partial<WaiterMemory>; // client merges this into its WaiterMemory
}

// ─── sales intelligence types ────────────────────────────────

export type CustomerIntent =
  | "browsing_alone"
  | "wants_recommendation"
  | "wants_light_option"        // was wants_light_food
  | "wants_complete_meal"
  | "wants_group_order"         // was wants_for_group
  | "wants_budget_option"       // was price_sensitive
  | "wants_premium_option"      // was premium_experience
  | "asks_for_drink"            // was asks_drink
  | "asks_for_dessert"          // was asks_dessert
  | "asks_for_pairing"          // was asks_pairing
  | "asks_specific_product"
  | "asks_category"
  | "checkout_intent"
  | "restriction_based"
  | "unclear";

export type SalesOpportunity =
  | "recommend_first_product"   // was suggest_main_item
  | "clarify_preference"        // was ask_clarifying_question
  | "suggest_light_options"
  | "suggest_complete_options"  // was suggest_combo
  | "suggest_group_combo"       // was suggest_group_option
  | "suggest_budget_option"
  | "suggest_premium_upgrade"
  | "suggest_drink"
  | "suggest_dessert"
  | "suggest_pairing"
  | "stay_quiet"
  | "checkout_support";         // was support_checkout

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

  // "group" — button value sent from qualification question
  // "see_final_suggestions" — sent when user accepts pre-checkout upsell offer
  if (msg === "see_final_suggestions") {
    return {
      customerIntent:   "asks_for_pairing",
      salesOpportunity: "suggest_pairing",
      confidence:       0.95,
      reason:           "pre-checkout final-suggestions button value",
    };
  }

  if (/\b(família|familia|grupo|[2-9]\s*pessoas?)\b|\bgroup\b|para\s*compartilhar/i.test(msg)) {
    return {
      customerIntent:   "wants_group_order",
      salesOpportunity: "suggest_group_combo",
      confidence:       0.9,
      reason:           "group/family keyword detected",
    };
  }

  if (/bebida|refri(gerante)?|água|suco|drink/i.test(msg)) {
    return {
      customerIntent:   "asks_for_drink",
      salesOpportunity: "suggest_drink",
      confidence:       0.9,
      reason:           "drink keyword detected",
    };
  }

  if (/sobremesa|doce/i.test(msg)) {
    return {
      customerIntent:   "asks_for_dessert",
      salesOpportunity: "suggest_dessert",
      confidence:       0.9,
      reason:           "dessert keyword detected",
    };
  }

  if (/\bleve\b|\bsuave\b|light/i.test(msg)) {
    return {
      customerIntent:   "wants_light_option",
      salesOpportunity: "suggest_light_options",
      confidence:       0.85,
      reason:           "light-food keyword detected",
    };
  }

  if (/\bcompleto\b|\bcomplete\b|refeição completa/i.test(msg)) {
    return {
      customerIntent:   "wants_complete_meal",
      salesOpportunity: "suggest_complete_options",
      confidence:       0.85,
      reason:           "complete-meal keyword detected",
    };
  }

  if (/barato|econôm|econom|até\s*R?\$|em conta/i.test(msg)) {
    return {
      customerIntent:   "wants_budget_option",
      salesOpportunity: "suggest_budget_option",
      confidence:       0.85,
      reason:           "price-sensitivity keyword detected",
    };
  }

  if (/\bmelhor\b|melhor da casa|algo especial|especial|premium|\btop\b|destaque|mais\s*caro|high.?end|caprichado|favorito da casa/i.test(msg)) {
    return {
      customerIntent:   "wants_premium_option",
      salesOpportunity: "suggest_premium_upgrade",
      confidence:       0.85,
      reason:           "premium keyword detected",
    };
  }

  if (/combina|acompanha|vai bem|harmoniz/i.test(msg)) {
    return {
      customerIntent:   "asks_for_pairing",
      salesOpportunity: hasCart ? "suggest_pairing" : "clarify_preference",
      confidence:       0.85,
      reason:           "pairing keyword detected",
    };
  }

  if (/finalizar|fechar|é isso|só isso|confirmar pedido/i.test(msg)) {
    return {
      customerIntent:   "checkout_intent",
      salesOpportunity: "checkout_support",
      confidence:       0.9,
      reason:           "checkout intent keyword detected",
    };
  }

  if (/sugere|indica|recomenda|me ajud|o que (tem|você|vc)/i.test(msg)) {
    return {
      customerIntent:   "wants_recommendation",
      salesOpportunity: hasCart ? "suggest_pairing" : "recommend_first_product",
      confidence:       0.8,
      reason:           "recommendation-request keyword detected",
    };
  }

  // Specific product — check catalog for exact name match
  if (input.catalog.length > 0 && msg.length >= 3) {
    const hit = input.catalog.find(
      (item) => item.name.length >= 4 && msg.includes(item.name.toLowerCase()),
    );
    if (hit) {
      return {
        customerIntent:   "asks_specific_product",
        salesOpportunity: "recommend_first_product",
        confidence:       0.95,
        reason:           `specific product name "${hit.name}" found in message`,
      };
    }
  }

  // Category — check catalog for category name match
  if (input.catalog.length > 0 && msg.length >= 3) {
    const catNames = [...new Set(input.catalog.map((i) => i.categoryName))];
    const hitCat   = catNames.find((c) => c.length >= 4 && msg.includes(c.toLowerCase()));
    if (hitCat) {
      return {
        customerIntent:   "asks_category",
        salesOpportunity: "recommend_first_product",
        confidence:       0.85,
        reason:           `category name "${hitCat}" found in message`,
      };
    }
  }

  // Default: unclear → ask a clarifying question
  return {
    customerIntent:   "unclear",
    salesOpportunity: "clarify_preference",
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

// ─── menu item tagging ────────────────────────────────────────

export type ItemTag =
  | "light" | "complete" | "group"   | "premium" | "cheap"
  | "drink" | "dessert"  | "starter" | "main"    | "combo"
  | "pairing_candidate";

export interface TaggedItem {
  id:          string;
  name:        string;
  category:    string;
  description: string | null;
  price:       number;
  sortOrder?:  number;
  tags:        ItemTag[];
}

export interface PriceBenchmarks { p25: number; median: number; p75: number; }

function computePriceBenchmarks(catalog: V2CatalogItem[]): PriceBenchmarks {
  const prices = catalog
    .filter((i) => isComplementCategory(i.categoryName))
    .map((i) => i.price)
    .sort((a, b) => a - b);
  if (prices.length === 0) return { p25: 0, median: 0, p75: 0 };
  return {
    p25:    prices[Math.floor(prices.length * 0.25)] ?? 0,
    median: prices[Math.floor(prices.length * 0.50)] ?? 0,
    p75:    prices[Math.floor(prices.length * 0.75)] ?? 0,
  };
}

/**
 * Tags a single menu item with semantic labels.
 * Pass priceBenchmarks from computePriceBenchmarks() for price-tier accuracy.
 * Works with any restaurant menu — no cuisine-specific logic.
 */
export function analyzeMenuItem(item: V2CatalogItem, benchmarks: PriceBenchmarks): TaggedItem {
  const text = [item.name, item.categoryName, item.description ?? ""].join(" ").toLowerCase();
  const tags: ItemTag[] = [];

  if (isDrinkCategory(item.categoryName)) {
    tags.push("drink", "pairing_candidate");
  } else if (isDessertCategory(item.categoryName)) {
    tags.push("dessert", "pairing_candidate");
  } else {
    // Combo / group (overrides light — combos are always complete)
    if (/combo|famil|balde|bandeja|para\s*[2-9]|[2-9]\s*pessoas?|compartilh/i.test(text)) {
      tags.push("combo", "group", "complete");
    }
    // Starter / small plates
    if (/entrada|salada|aperitiv|petisco|porç(ao|ão)|tira.gosto|snack/i.test(text)) {
      tags.push("starter", "light", "pairing_candidate");
    }
    // Explicit light signals in name or description
    if (!tags.includes("combo") && /\bleve\b|\blight\b|diet|vegano|vegetarian/i.test(text)) {
      if (!tags.includes("light")) tags.push("light");
    }
    // Main dish (default for non-categorised food items)
    if (!tags.includes("combo") && !tags.includes("starter")) {
      tags.push("main");
    }
    // Complete meal signal
    if (!tags.includes("complete") &&
        (item.price >= benchmarks.median || /prato\s*principal|refeição|completo/i.test(text))) {
      tags.push("complete");
    }
    // Price-based light (cheapest items are generally smaller portions)
    if (!tags.includes("light") && !tags.includes("combo") &&
        item.price > 0 && item.price <= benchmarks.p25) {
      tags.push("light");
    }
    // Premium / cheap tiers
    if (item.price > 0 && item.price >= benchmarks.p75) tags.push("premium");
    if (item.price > 0 && item.price <= benchmarks.p25) tags.push("cheap");
  }

  return {
    id:          item.id,
    name:        item.name,
    category:    item.categoryName,
    description: item.description ?? null,
    price:       item.price,
    sortOrder:   item.sortOrder,
    tags,
  };
}

function tagCatalog(catalog: V2CatalogItem[]): TaggedItem[] {
  const b = computePriceBenchmarks(catalog);
  return catalog.map((item) => analyzeMenuItem(item, b));
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
// All helpers use tagCatalog() for semantic selection.
// Excludes cart items, returns exact IDs, no duplicates.

function tagSort(a: TaggedItem, b: TaggedItem): number {
  return (a.sortOrder ?? 999) - (b.sortOrder ?? 999);
}

function selectDrinkItems(catalog: V2CatalogItem[], cartItemIds: string[], limit?: number): string[] {
  const all = tagCatalog(catalog)
    .filter((i) => i.tags.includes("drink") && !cartItemIds.includes(i.id))
    .sort(tagSort);
  return (limit !== undefined ? all.slice(0, limit) : all).map((i) => i.id);
}

function selectDessertItems(catalog: V2CatalogItem[], cartItemIds: string[], limit?: number): string[] {
  const all = tagCatalog(catalog)
    .filter((i) => i.tags.includes("dessert") && !cartItemIds.includes(i.id))
    .sort(tagSort);
  return (limit !== undefined ? all.slice(0, limit) : all).map((i) => i.id);
}

function selectLightItems(catalog: V2CatalogItem[], cartItemIds: string[], limit: number): string[] {
  const tagged = tagCatalog(catalog);
  const notInCart = tagged.filter((i) => !i.tags.includes("drink") && !i.tags.includes("dessert") && !cartItemIds.includes(i.id));
  const light = notInCart.filter((i) => i.tags.includes("light") || i.tags.includes("starter"));
  // Starters first, then light-tagged, then sortOrder
  const sorted = (light.length > 0 ? light : notInCart).sort((a, b) => {
    const aScore = (a.tags.includes("starter") ? 2 : 0) + (a.tags.includes("light") ? 1 : 0);
    const bScore = (b.tags.includes("starter") ? 2 : 0) + (b.tags.includes("light") ? 1 : 0);
    if (bScore !== aScore) return bScore - aScore;
    return tagSort(a, b);
  });
  return sorted.slice(0, limit).map((i) => i.id);
}

function selectCompleteMealItems(catalog: V2CatalogItem[], cartItemIds: string[], limit: number): string[] {
  const tagged = tagCatalog(catalog);
  const notInCart = tagged.filter((i) => !i.tags.includes("drink") && !i.tags.includes("dessert") && !cartItemIds.includes(i.id));
  const complete = notInCart.filter((i) => i.tags.includes("complete") || i.tags.includes("main"));
  // combo > complete > main, then sortOrder
  const tagScore = (t: TaggedItem) =>
    (t.tags.includes("combo")    ? 3 : 0) +
    (t.tags.includes("complete") ? 2 : 0) +
    (t.tags.includes("main")     ? 1 : 0);
  const sorted = (complete.length > 0 ? complete : notInCart)
    .sort((a, b) => tagScore(b) - tagScore(a) || tagSort(a, b));
  return sorted.slice(0, limit).map((i) => i.id);
}

function selectGroupItems(catalog: V2CatalogItem[], cartItemIds: string[], limit: number): string[] {
  const tagged = tagCatalog(catalog);
  const notInCart = tagged.filter((i) => !i.tags.includes("drink") && !i.tags.includes("dessert") && !cartItemIds.includes(i.id));
  const group = notInCart.filter((i) => i.tags.includes("group") || i.tags.includes("combo"));
  if (group.length > 0) return group.sort(tagSort).slice(0, limit).map((i) => i.id);
  // Fallback: highest-priced items (largest portions proxy for groups)
  return [...notInCart].sort((a, b) => b.price - a.price).slice(0, limit).map((i) => i.id);
}

/**
 * Context-aware recommendation.
 * Prioritises what the cart is missing: food → drink → dessert → pairing/premium.
 * Not a funnel — driven by current cart state only.
 */
function selectRecommendedItems(catalog: V2CatalogItem[], cartItemIds: string[], limit: number): string[] {
  const tagged  = tagCatalog(catalog);
  const inCart  = tagged.filter((i) => cartItemIds.includes(i.id));
  const notCart = tagged.filter((i) => !cartItemIds.includes(i.id));

  const cartHasFood    = inCart.some((i) => !i.tags.includes("drink") && !i.tags.includes("dessert"));
  const cartHasDrink   = inCart.some((i) => i.tags.includes("drink"));
  const cartHasDessert = inCart.some((i) => i.tags.includes("dessert"));

  // Empty cart → bestsellers (food only, by sortOrder)
  if (cartItemIds.length === 0) {
    return notCart
      .filter((i) => !i.tags.includes("drink") && !i.tags.includes("dessert"))
      .sort(tagSort)
      .slice(0, limit)
      .map((i) => i.id);
  }
  // Has food but no drink → suggest drink
  if (cartHasFood && !cartHasDrink) {
    const drinks = notCart.filter((i) => i.tags.includes("drink")).sort(tagSort);
    if (drinks.length > 0) return drinks.slice(0, limit).map((i) => i.id);
  }
  // Has food + drink but no dessert → suggest dessert
  if (cartHasFood && cartHasDrink && !cartHasDessert) {
    const desserts = notCart.filter((i) => i.tags.includes("dessert")).sort(tagSort);
    if (desserts.length > 0) return desserts.slice(0, limit).map((i) => i.id);
  }
  // Fallback → pairing candidates or premium items, else top of catalog
  const pairings = notCart.filter((i) => i.tags.includes("pairing_candidate") || i.tags.includes("premium")).sort(tagSort);
  return (pairings.length > 0 ? pairings : notCart.sort(tagSort)).slice(0, limit).map((i) => i.id);
}

// ─── cart analysis + pairing helpers (Sales Intelligence) ───

export interface CartAnalysis {
  hasFood:          boolean;
  hasDrink:         boolean;
  hasDessert:       boolean;
  hasCombo:         boolean;
  itemCount:        number;
  totalValue:       number;
  categoriesInCart: string[];
  mainFlavors:      string[];
  opportunity:      "drink" | "dessert" | "pairing" | "upgrade" | "none";
}

export function analyzeCart(cartItemIds: string[], catalog: V2CatalogItem[]): CartAnalysis {
  const tagged  = tagCatalog(catalog);
  const inCart  = tagged.filter((i) => cartItemIds.includes(i.id));

  const hasFood    = inCart.some((i) => !i.tags.includes("drink") && !i.tags.includes("dessert"));
  const hasDrink   = inCart.some((i) => i.tags.includes("drink"));
  const hasDessert = inCart.some((i) => i.tags.includes("dessert"));
  const hasCombo   = inCart.some((i) => i.tags.includes("combo"));

  const categoriesInCart = [...new Set(inCart.map((i) => i.category))];

  let opportunity: CartAnalysis["opportunity"] = "none";
  if      (hasFood && !hasDrink)                  opportunity = "drink";
  else if (hasFood && hasDrink && !hasDessert)     opportunity = "dessert";
  else if (hasFood && inCart.length >= 2)          opportunity = "pairing";
  else if (hasFood)                                opportunity = "upgrade";

  return {
    hasFood, hasDrink, hasDessert, hasCombo,
    itemCount:        cartItemIds.length,
    totalValue:       inCart.reduce((sum, i) => sum + i.price, 0),
    categoriesInCart,
    mainFlavors:      [],
    opportunity,
  };
}

function selectPairingItems(catalog: V2CatalogItem[], cartItemIds: string[], limit: number): string[] {
  const ca      = analyzeCart(cartItemIds, catalog);
  const tagged  = tagCatalog(catalog);
  const notCart = tagged.filter((i) => !cartItemIds.includes(i.id));

  if (ca.opportunity === "drink") {
    const drinks = notCart.filter((i) => i.tags.includes("drink")).sort(tagSort);
    if (drinks.length > 0) return drinks.slice(0, limit).map((i) => i.id);
  }
  if (ca.opportunity === "dessert") {
    const desserts = notCart.filter((i) => i.tags.includes("dessert")).sort(tagSort);
    if (desserts.length > 0) return desserts.slice(0, limit).map((i) => i.id);
  }
  const pairings = notCart
    .filter((i) => i.tags.includes("pairing_candidate") || i.tags.includes("premium"))
    .sort(tagSort);
  return (pairings.length > 0 ? pairings : notCart.sort(tagSort)).slice(0, limit).map((i) => i.id);
}

// ─── Menu search ─────────────────────────────────────────────

function normalizeSearch(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^\w\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Synonym groups: [queryPattern, itemPattern].
 * When the customer message matches queryPattern, catalog items matching itemPattern
 * receive a bonus score — enabling "sushi" to surface uramaki, hot roll, etc.
 */
const MENU_SYNONYM_GROUPS: Array<[RegExp, RegExp]> = [
  // Sushi family — "sushi" query surfaces all sushi-style items
  [
    /\b(sushi|sashimi|niguiri|nigiri|uramaki|hossomaki|hosso.?maki|hot.?roll|temaki|maki|combinado)\b/i,
    /sushi|sashimi|niguiri|nigiri|uramaki|hossomaki|hot.?roll|temaki|maki|combinado|combo/i,
  ],
  // Ramen / noodle family
  [
    /\b(l[aá]men|ramen|yakisoba|macarr|yakis)\b/i,
    /lamen|ramen|yakisoba|macarr|noodle/i,
  ],
  // Drinks family
  [
    /\b(bebida|refri(gerante)?|refrigerante|suco|coca|agua|água|drink|cerveja|limonada|guaran[aá])\b/i,
    /bebida|refri|refrigerante|suco|coca|agua|drink|cerveja|limonada|guarana/i,
  ],
  // Desserts family
  [
    /\b(sobremesa|doce|gelad[ao]|sorvete|brownie|pudim|mousse|tembleque)\b/i,
    /sobremesa|doce|gelad|sorvete|brownie|pudim|mousse/i,
  ],
  // Combo / festival
  [
    /\b(combo|combinado|festival|bandeja)\b/i,
    /combo|combinado|festival|bandeja/i,
  ],
  // Frango / chicken family
  [
    /\b(frango|chicken|galinha)\b/i,
    /frango|chicken|galinha|peito|empanado/i,
  ],
  // Salmão / salmon family
  [
    /\b(salm[aã]o|salmon)\b/i,
    /salm[aã]o|salmon/i,
  ],
  // Camarão / shrimp family
  [
    /\b(camar[aã]o|shrimp)\b/i,
    /camar[aã]o|shrimp/i,
  ],
  // Peixe / fish family
  [
    /\b(peixe|fish|bacalhau|til[aá]pia|corvina)\b/i,
    /peixe|fish|bacalhau|tilapia|corvina/i,
  ],
  // Carne / beef family
  [
    /\b(carne|bife|picanha|fil[eé]|filet|contra.?fil[eé])\b/i,
    /carne|bife|picanha|fil[eé]|contra.?fil[eé]/i,
  ],
];

/**
 * Searches the catalog for items explicitly matching the customer's query.
 * Priority: name match > category match > description match > synonym group.
 * Returns IDs sorted by relevance and a confidence level.
 */
function searchMenuByQuery(
  rawQuery:         string,
  catalog:          V2CatalogItem[],
  cartItemIds:      string[],
  suggestedIds:     string[],
  limit = 5,
  maxBudget?:       number,
  excludeKeywords?: string[],
): { ids: string[]; confidence: "high" | "medium" | "low" } {
  const normQuery = normalizeSearch(rawQuery);
  const words     = normQuery.split(/\s+/).filter((w) => w.length >= 3);

  if (words.length === 0) return { ids: [], confidence: "low" };

  const scored: Array<{ id: string; score: number }> = [];

  for (const item of catalog) {
    if (cartItemIds.includes(item.id)) continue;

    // Hard-filter: budget constraint declared in the customer message.
    if (maxBudget !== undefined && item.price > maxBudget) continue;

    // Hard-filter: allergen/ingredient exclusion declared in the customer message.
    if (excludeKeywords?.length) {
      const nameLow = item.name.toLowerCase();
      const descLow = (item.description ?? "").toLowerCase();
      if (excludeKeywords.some((kw) => nameLow.includes(kw) || descLow.includes(kw))) continue;
    }

    const nameNorm = normalizeSearch(item.name);
    const catNorm  = normalizeSearch(item.categoryName);
    const descNorm = normalizeSearch(item.description ?? "");
    let score      = 0;

    for (const word of words) {
      if (nameNorm.includes(word))  score += 50;
      if (catNorm.includes(word))   score += 40;
      if (descNorm.includes(word))  score += 15;
    }

    const itemText = `${item.name} ${item.categoryName} ${item.description ?? ""}`;
    for (const [queryPat, itemPat] of MENU_SYNONYM_GROUPS) {
      if (queryPat.test(rawQuery) && itemPat.test(itemText)) {
        score += 35;
        break;
      }
    }

    // Hard-exclude already-suggested items — prevents repeated_suggestion across turns.
    // Do not use a soft penalty: any positive score on a high-signal query (e.g. "frango")
    // will survive a -25 adjustment and the same IDs would re-surface next turn.
    if (score > 0 && !suggestedIds.includes(item.id)) {
      scored.push({ id: item.id, score });
    }
  }

  if (scored.length === 0) return { ids: [], confidence: "low" };

  scored.sort((a, b) => b.score - a.score);
  const topScore    = scored[0]?.score ?? 0;
  const confidence  = topScore >= 40 ? "high" : topScore >= 20 ? "medium" : "low";

  return { ids: scored.slice(0, limit).map((s) => s.id), confidence };
}

// ─── Smart Product Selection Engine (Sprint 4C) ──────────────

export interface ScoreContext {
  cartItemIds: string[];
  cartTagged:  TaggedItem[];
  benchmarks:  PriceBenchmarks;
}

export function scoreProductForIntent(item: TaggedItem, intent: CustomerIntent, ctx: ScoreContext): number {
  let score = 0;

  // A) Intent fit
  switch (intent) {
    case "wants_light_option":
      score += item.tags.includes("light")   ? 30 : 0;
      score += item.tags.includes("starter") ? 20 : 0;
      score += item.tags.includes("main")    ?  5 : 0;
      score -= item.tags.includes("combo")   ? 15 : 0;
      score -= item.tags.includes("premium") ? 25 : 0;  // premium items are not light options
      score -= item.tags.includes("drink")   ? 20 : 0;
      score -= item.tags.includes("dessert") ? 20 : 0;
      // Baseline: guarantee non-premium food items always pass MIN_SCORE_THRESHOLD
      if (!item.tags.includes("premium") && !item.tags.includes("drink") && !item.tags.includes("dessert")) score += 5;
      break;
    case "wants_complete_meal":
      score += item.tags.includes("combo")    ? 35 : 0;
      score += item.tags.includes("complete") ? 25 : 0;
      score += item.tags.includes("main")     ? 15 : 0;
      score -= item.tags.includes("starter")  ? 15 : 0;
      score -= item.tags.includes("drink")    ? 20 : 0;
      score -= item.tags.includes("dessert")  ? 20 : 0;
      break;
    case "wants_group_order":
      score += item.tags.includes("group")    ? 40 : 0;
      score += item.tags.includes("combo")    ? 35 : 0;
      score += item.tags.includes("complete") ? 10 : 0;
      score += item.tags.includes("premium")  ?  5 : 0;
      score -= item.tags.includes("drink")    ? 15 : 0;
      score -= item.tags.includes("dessert")  ? 15 : 0;
      break;
    case "wants_premium_option":
      score += item.tags.includes("premium")  ? 40 : 0;
      score += item.tags.includes("combo")    ? 20 : 0;
      score += item.tags.includes("complete") ? 15 : 0;
      score -= item.tags.includes("cheap")    ? 30 : 0;
      score -= item.tags.includes("drink")    ? 10 : 0;
      score -= item.tags.includes("dessert")  ? 10 : 0;
      break;
    case "wants_budget_option":
      score += item.tags.includes("cheap")    ? 35 : 0;
      score += item.tags.includes("complete") ? 10 : 0;
      score += item.tags.includes("main")     ?  8 : 0;
      score -= item.tags.includes("premium")  ? 25 : 0;
      score -= item.tags.includes("drink")    ? 10 : 0;
      score -= item.tags.includes("dessert")  ? 10 : 0;
      // Baseline: guarantee non-premium food items always pass MIN_SCORE_THRESHOLD
      if (!item.tags.includes("premium") && !item.tags.includes("drink") && !item.tags.includes("dessert")) score += 5;
      break;
    case "asks_for_drink":
      score += item.tags.includes("drink") ? 60 : 0;
      if (!item.tags.includes("drink")) score -= 100;
      break;
    case "asks_for_dessert":
      score += item.tags.includes("dessert") ? 60 : 0;
      if (!item.tags.includes("dessert")) score -= 100;
      break;
    case "asks_for_pairing":
      score += item.tags.includes("pairing_candidate") ? 30 : 0;
      score += item.tags.includes("drink")             ? 20 : 0;
      score += item.tags.includes("dessert")           ? 15 : 0;
      if (!item.tags.includes("pairing_candidate") && !item.tags.includes("drink") && !item.tags.includes("dessert")) score -= 15;
      break;
    case "wants_recommendation": {
      const cartHasFood    = ctx.cartTagged.some((i) => !i.tags.includes("drink") && !i.tags.includes("dessert"));
      const cartHasDrink   = ctx.cartTagged.some((i) => i.tags.includes("drink"));
      const cartHasDessert = ctx.cartTagged.some((i) => i.tags.includes("dessert"));
      if (ctx.cartTagged.length === 0) {
        score += item.tags.includes("main")     ? 25 : 0;
        score += item.tags.includes("complete") ? 15 : 0;
        score -= item.tags.includes("drink")    ? 10 : 0;
        score -= item.tags.includes("dessert")  ? 10 : 0;
      } else if (cartHasFood && !cartHasDrink) {
        score += item.tags.includes("drink") ? 40 : -10;
      } else if (cartHasFood && cartHasDrink && !cartHasDessert) {
        score += item.tags.includes("dessert") ? 35 : -10;
      } else {
        score += item.tags.includes("pairing_candidate") ? 20 : 0;
        score += item.tags.includes("premium")           ? 15 : 0;
      }
      break;
    }
    default:
      score += item.tags.includes("main")     ? 20 : 0;
      score += item.tags.includes("complete") ? 15 : 0;
      break;
  }

  // B) Commercial value — budget/light intents prefer cheaper items; others prefer higher value.
  if (intent === "wants_budget_option" || intent === "wants_light_option") {
    if (item.price <= ctx.benchmarks.p25)    score += 12;
    if (item.price <= ctx.benchmarks.median) score +=  5;
    if (item.price >= ctx.benchmarks.p75)    score -= 40;  // heavy penalty: above-budget items must not appear
  } else {
    if (item.price >= ctx.benchmarks.median) score += 8;
    if (item.price >= ctx.benchmarks.p75)    score += 4;
  }

  // C) Cart fit
  if (ctx.cartTagged.length > 0) {
    const cartCategories = new Set(ctx.cartTagged.map((i) => i.category));
    if (intent === "asks_for_pairing") {
      if (!cartCategories.has(item.category)) score += 10;
    } else if (intent !== "asks_for_drink" && intent !== "asks_for_dessert") {
      if (cartCategories.has(item.category)) score -= 8;
    }
  }

  // D) Popularity tie-breaker
  if (item.sortOrder !== undefined) {
    score += Math.max(0, Math.floor((500 - item.sortOrder) / 50));
  }

  return score;
}

const MIN_SCORE_THRESHOLD = 10;

export function rankProducts(
  catalog:              V2CatalogItem[],
  intent:               CustomerIntent,
  cartItemIds:          string[],
  limit:                number,
  alreadySuggestedIds:  string[] = [],
): string[] {
  const benchmarks = computePriceBenchmarks(catalog);
  const tagged     = catalog.map((item) => analyzeMenuItem(item, benchmarks));
  const cartTagged = tagged.filter((i) => cartItemIds.includes(i.id));
  const ctx: ScoreContext = { cartItemIds, cartTagged, benchmarks };

  const scored:   Array<{ id: string; score: number }> = [];
  const rejected: Array<{ id: string; reason: string; score?: number }> = [];

  for (const item of tagged) {
    if (cartItemIds.includes(item.id)) {
      rejected.push({ id: item.id, reason: "already_in_cart" });
      continue;
    }
    let score = scoreProductForIntent(item, intent, ctx);
    const wasSuggested = alreadySuggestedIds.includes(item.id);
    // Hard-exclude already-shown products: 60-200=-140 < MIN_SCORE_THRESHOLD(10)
    if (wasSuggested) score -= 200;
    if (score >= MIN_SCORE_THRESHOLD) {
      scored.push({ id: item.id, score });
    } else {
      rejected.push({ id: item.id, reason: wasSuggested ? "already_suggested" : "low_score", score });
    }
  }
  scored.sort((a, b) => b.score - a.score);

  const seen    = new Set<string>();
  const results: string[] = [];
  for (const { id } of scored) {
    if (!seen.has(id) && results.length < limit) { seen.add(id); results.push(id); }
  }

  waiterLog({
    type:               "waiter_product_selection",
    intent,
    selectedProductIds: results,
    rejectedProductIds: rejected,
  });

  return results;
}

// ─── restaurant-agnostic sales strategy (Sales Intelligence) ─

export interface MenuProfile {
  cuisineSignals:             string[];
  hasCombos:                  boolean;
  hasDrinks:                  boolean;
  hasDesserts:                boolean;
  hasStarters:                boolean;
  hasPremiumItems:            boolean;
  avgPrice:                   number;
  topCategories:              string[];
  likelyMainCategories:       string[];
  likelyComplementCategories: string[];
}

/**
 * Profiles the menu catalog without hardcoding any cuisine.
 * Uses tag classification + category frequency to describe what the
 * restaurant sells, enabling strategy selection for any food type.
 */
export function analyzeMenuProfile(menuItems: V2CatalogItem[]): MenuProfile {
  const tagged = tagCatalog(menuItems);

  const hasDrinks      = tagged.some((i) => i.tags.includes("drink"));
  const hasDesserts    = tagged.some((i) => i.tags.includes("dessert"));
  const hasStarters    = tagged.some((i) => i.tags.includes("starter"));
  const hasCombos      = tagged.some((i) => i.tags.includes("combo"));
  const hasPremiumItems = tagged.some((i) => i.tags.includes("premium"));

  const foodItems = tagged.filter((i) => !i.tags.includes("drink") && !i.tags.includes("dessert"));
  const avgPrice  = foodItems.length > 0
    ? foodItems.reduce((s, i) => s + i.price, 0) / foodItems.length
    : 0;

  // Rank categories by item count
  const catFreq = new Map<string, number>();
  for (const item of menuItems) {
    catFreq.set(item.categoryName, (catFreq.get(item.categoryName) ?? 0) + 1);
  }
  const topCategories = [...catFreq.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([name]) => name);

  const mainCatNames = new Set(
    tagged.filter((i) => !i.tags.includes("drink") && !i.tags.includes("dessert")).map((i) => i.category),
  );
  const complementCatNames = new Set(
    tagged.filter((i) => i.tags.includes("drink") || i.tags.includes("dessert")).map((i) => i.category),
  );

  // Generic cuisine signal detection from all item text — no cuisine hard-wired
  const allText = menuItems
    .map((i) => `${i.categoryName} ${i.name} ${i.description ?? ""}`)
    .join(" ")
    .toLowerCase();
  const CUISINE_PATTERNS: [RegExp, string][] = [
    [/pizza|pizz[ao]/,                "pizza"   ],
    [/burger|hamburguer|smash/,       "burger"  ],
    [/sushi|temaki|uramaki|maki/,     "sushi"   ],
    [/pasta|macarrão|lasanha|risoto/, "italian" ],
    [/tacos?|burrito|mexican/,        "mexican" ],
    [/churrasco|bbq|grelhad/,         "grill"   ],
    [/wonton|dim.?sum/,               "chinese" ],
    [/crepe|crêpe/,                   "crepe"   ],
    [/açaí|acai/,                     "acai"    ],
    [/poke|bowl/,                     "poke"    ],
  ];
  const cuisineSignals = CUISINE_PATTERNS
    .filter(([re]) => re.test(allText))
    .map(([, signal]) => signal);

  return {
    cuisineSignals,
    hasCombos,
    hasDrinks,
    hasDesserts,
    hasStarters,
    hasPremiumItems,
    avgPrice,
    topCategories,
    likelyMainCategories:       [...mainCatNames],
    likelyComplementCategories: [...complementCatNames],
  };
}

// ─── menu analysis ────────────────────────────────────────────
// Returns all items organized into semantic candidate buckets.
// Restaurant-agnostic: works with any cuisine via analyzeMenuItem tags.

export interface MenuAnalysis {
  drinkCandidates:    TaggedItem[];
  dessertCandidates:  TaggedItem[];
  starterCandidates:  TaggedItem[];
  mainCandidates:     TaggedItem[];
  comboCandidates:    TaggedItem[];
  groupCandidates:    TaggedItem[];
  lightCandidates:    TaggedItem[];
  completeCandidates: TaggedItem[];
  premiumCandidates:  TaggedItem[];
  budgetCandidates:   TaggedItem[];
  pairingCandidates:  TaggedItem[];
}

/**
 * Tags every menu item and bins them into semantic candidate arrays.
 * Identical items can appear in multiple bins (e.g. a combo is also "complete").
 * Callers use these bins to select appropriate cards for any intent.
 */
export function analyzeMenu(menuItems: V2CatalogItem[]): MenuAnalysis {
  const tagged = tagCatalog(menuItems);
  return {
    drinkCandidates:    tagged.filter((i) => i.tags.includes("drink")),
    dessertCandidates:  tagged.filter((i) => i.tags.includes("dessert")),
    starterCandidates:  tagged.filter((i) => i.tags.includes("starter")),
    mainCandidates:     tagged.filter((i) => i.tags.includes("main")),
    comboCandidates:    tagged.filter((i) => i.tags.includes("combo")),
    groupCandidates:    tagged.filter((i) => i.tags.includes("group") || i.tags.includes("combo")),
    lightCandidates:    tagged.filter((i) => i.tags.includes("light")),
    completeCandidates: tagged.filter((i) => i.tags.includes("complete")),
    premiumCandidates:  tagged.filter((i) => i.tags.includes("premium")),
    budgetCandidates:   tagged.filter((i) => i.tags.includes("cheap")),
    pairingCandidates:  tagged.filter((i) => i.tags.includes("pairing_candidate")),
  };
}

// ─── sales situation (full analysis in one call) ──────────────

const NEED_DESCRIPTIONS: Partial<Record<CustomerIntent, string>> = {
  browsing_alone:       "explorando o cardápio independentemente",
  wants_recommendation: "quer uma recomendação",
  wants_light_option:   "quer uma opção mais leve",
  wants_complete_meal:  "quer uma refeição completa",
  wants_group_order:    "fazendo pedido para um grupo",
  wants_budget_option:  "busca bom custo-benefício",
  wants_premium_option: "quer uma experiência premium",
  asks_for_drink:       "quer uma bebida",
  asks_for_dessert:     "quer uma sobremesa",
  asks_for_pairing:     "quer algo que combine com o pedido atual",
  asks_specific_product:"perguntando sobre um produto específico",
  asks_category:        "perguntando sobre uma categoria do cardápio",
  checkout_intent:      "pronto para finalizar o pedido",
  restriction_based:    "tem restrições alimentares",
  unclear:              "intenção não identificada — precisa de clarificação",
};

/** Full enriched analysis combining intent + menu + cart + strategy in one call. */
export interface SalesSituation {
  intent:     CustomerIntent;
  need:       string;
  opportunity: SalesOpportunity;
  action:     SalesStrategy;
  confidence: number;
  reason:     string;
}

/**
 * Sales Specialist core: combines intent detection, menu profiling, cart
 * analysis, and strategy selection into one enriched output object.
 * Pure function — no DB calls, no side effects.
 */
export function analyzeSalesSituation(input: V2Input): SalesSituation {
  const analysis    = analyzeSalesContext(input);
  const menuProfile = analyzeMenuProfile(input.catalog);
  const cartAnal    = analyzeCart(input.cartItemIds, input.catalog);
  const strategy    = chooseSalesStrategy(analysis, menuProfile, cartAnal);

  return {
    intent:      analysis.customerIntent,
    need:        NEED_DESCRIPTIONS[analysis.customerIntent] ?? analysis.reason,
    opportunity: analysis.salesOpportunity,
    action:      strategy,
    confidence:  analysis.confidence,
    reason:      analysis.reason,
  };
}

export type SalesStrategy =
  | "recommend_signature_item"
  | "recommend_budget_item"
  | "recommend_group_bundle"
  | "recommend_premium_upgrade"
  | "recommend_pairing"
  | "recommend_drink"
  | "recommend_dessert"
  | "ask_clarifying_question"
  | "stay_quiet";

/**
 * Selects the right sales strategy from intent + menu profile + cart state.
 * Pure logic — no DB calls, no side effects.
 */
export function chooseSalesStrategy(
  analysis:     SalesAnalysis,
  menuProfile:  MenuProfile,
  cartAnalysis: CartAnalysis,
): SalesStrategy {
  const { customerIntent } = analysis;
  const { opportunity }    = cartAnalysis;

  // A) Budget — affordable items first, no premium push
  if (customerIntent === "wants_budget_option") return "recommend_budget_item";

  // B) Group / family — combos when available
  if (customerIntent === "wants_group_order")
    return menuProfile.hasCombos ? "recommend_group_bundle" : "recommend_signature_item";

  // C) Premium intent
  if (customerIntent === "wants_premium_option")
    return menuProfile.hasPremiumItems ? "recommend_premium_upgrade" : "recommend_signature_item";

  // D) Explicit pairing request — always cart-aware
  if (customerIntent === "asks_for_pairing") return "recommend_pairing";

  // E) Explicit category requests
  if (customerIntent === "asks_for_drink")
    return menuProfile.hasDrinks   ? "recommend_drink"   : "ask_clarifying_question";
  if (customerIntent === "asks_for_dessert")
    return menuProfile.hasDesserts ? "recommend_dessert" : "ask_clarifying_question";

  // Light — smallest/starter items
  if (customerIntent === "wants_light_option") return "recommend_signature_item";

  // Complete — full meal / combo
  if (customerIntent === "wants_complete_meal")
    return menuProfile.hasCombos ? "recommend_group_bundle" : "recommend_signature_item";

  // Specific product or category mentioned — route to AI for best match
  if (customerIntent === "asks_specific_product" || customerIntent === "asks_category")
    return "recommend_signature_item";

  // Recommendation — let cart opportunity guide the pick
  if (customerIntent === "wants_recommendation") {
    if (opportunity === "drink")   return menuProfile.hasDrinks   ? "recommend_drink"   : "recommend_signature_item";
    if (opportunity === "dessert") return menuProfile.hasDesserts ? "recommend_dessert" : "recommend_signature_item";
    if (opportunity === "pairing" || opportunity === "upgrade") return "recommend_pairing";
    return "recommend_signature_item";
  }

  // Checkout + restriction intents — stay quiet; other handlers own these
  if (customerIntent === "checkout_intent")   return "stay_quiet";
  if (customerIntent === "restriction_based") return "ask_clarifying_question";
  if (customerIntent === "browsing_alone")    return "stay_quiet";

  // Unclear — ask with buttons
  return "ask_clarifying_question";
}

export interface WaiterResponseShape {
  message: string;
  options: WaiterOption[];
  cards:   string[];
  mode:    WaiterMode;
}

const STRATEGY_MESSAGES: Record<SalesStrategy, string> = {
  recommend_signature_item:  "O mais pedido da casa pra você 👇",
  recommend_budget_item:     "Melhor custo-benefício — o favorito dos clientes 👇",
  recommend_group_bundle:    "A favorita do grupo — combinação certeira 👇",
  recommend_premium_upgrade: "Nossa opção mais especial — vale cada detalhe 👇",
  recommend_pairing:         "Combinação perfeita com o que você escolheu 👇",
  recommend_drink:           "A bebida ideal pra harmonizar com seu pedido 👇",
  recommend_dessert:         "O favorito dos clientes pra fechar com doce 🍰",
  ask_clarifying_question:   "Prefere algo mais leve ou completo?",
  stay_quiet:                "",
};

/**
 * Builds the normalized waiter response from a strategy + resolved product IDs.
 * Rule: if no products found, never mention item names — offer button question instead.
 */
export function buildWaiterResponse(
  strategy:         SalesStrategy,
  selectedProducts: string[],
): WaiterResponseShape {
  if (strategy === "stay_quiet") {
    return { message: "", options: [], cards: [], mode: "BROWSE" };
  }

  // No products → fall back to button question (rule 5)
  if (selectedProducts.length === 0) {
    return {
      message: "Prefere algo mais leve ou completo?",
      options: [{ label: "Leve", value: "light" }, { label: "Completo", value: "complete" }],
      cards:   [],
      mode:    "BROWSE",
    };
  }

  const isIntervention =
    strategy === "recommend_premium_upgrade" ||
    strategy === "recommend_group_bundle";

  return {
    message: STRATEGY_MESSAGES[strategy],
    options: [],
    cards:   selectedProducts,
    mode:    isIntervention ? "INTERVENTION" : "SUGGESTION",
  };
}

// ─── directive builder for AI events ────────────────────────

const BASE_DIRECTIVE = `
━━━ GUIDED AUTONOMY — GARÇOM VIRTUAL DE ALTO PADRÃO ━━━
▶ Identidade: especialista em experiência gastronômica num menu digital minimalista.
▶ NÃO sou um chatbot genérico — sou uma voz de marca sofisticada e contextual.

━━━ THE CAGE — RESTRIÇÕES DE UI ABSOLUTAS (NUNCA VIOLAR) ━━━
▶ LIMITE DE TEXTO: máximo 1-2 frases curtas. Teto de 15 palavras por resposta.
▶ NUNCA repita a mesma frase exata numa sessão — criatividade real, não templates fixos.
▶ NUNCA liste produtos no texto — use suggest_upsell. Se diz → mostra. Sem exceção.
▶ NUNCA sugira sem chamar suggest_upsell. Cards são obrigatórios com toda recomendação.
▶ VISUAL: use "👇" sempre que apresentar cards. Emojis elegantes (✨ 👌 🍱 🍰 🥤) nas confirmações — com moderação, nunca dois seguidos.
▶ PROIBIDO: confirm_order, pedir dados pessoais, dizer "adicionei" em qualquer variante.

━━━ LIBERDADE CRIATIVA TOTAL ━━━
▶ Analise o contexto completo: evento disparado, item específico, composição do carrinho.
▶ Gere respostas únicas e sofisticadas — varie tom, estrutura e escolha de palavras.
▶ Estilos permitidos: entusiasmado, elegante, informal sofisticado, curioso — nunca robótico.

━━━ TÉCNICAS DE VENDAS ELITE ━━━
▶ ANCORAGEM: indeciso? Mostre o premium primeiro via suggest_upsell, depois o custo-benefício.
▶ GATILHO DE DESEJO: "o mais pedido da casa", "combinação perfeita", "favorito dos clientes".
▶ VENDA CASADA: ao sugerir prato → plante 1 frase de harmonização sutil (sem nomear o produto).

━━━ TRATAMENTO DE OBJEÇÕES — ACKNOWLEDGE + PIVOT ━━━
▶ PREÇO ("caro", "mais em conta"): reconheça + pivote com valor percebido.
   Ex: "Entendido! Este combo entrega muito pelo valor — confira 👇"
▶ GOSTO/INGREDIENTE ("não gosto de cru", "frito", "empanado"): valide + redirecione.
   Ex: "Sem problemas! Nossos pratos quentes fazem muito sucesso — separei os melhores 👇"
▶ ALERGIA/RESTRIÇÃO ("alérgico a X", "orçamento R$ Y"): reconheça + filtre.
   Ex: "Entendido! Levei em conta sua restrição — estas são as melhores opções 👇"
▶ REGRA: toda objeção EXIGE cards (suggest_upsell) ou botões de qualificação. Texto puro após objeção = falha crítica.
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
    "  → ANCORAGEM: chame suggest_upsell com o item mais COMPLETO/PREMIUM primeiro.",
    "  → Depois, sugira 1 opção de custo-benefício como segundo call (quando aplicável).",
    "  → GATILHOS: use 'o mais pedido da casa', 'combinação perfeita', 'o mais fresco do dia'.",
    "  → VENDA CASADA: ao sugerir prato principal, adicione 1 frase de harmonização sutil.",
    '  → Ex: "O mais pedido da casa — fica perfeito com uma bebida gelada. Quer experimentar? 👇"',
    "  → OBJEÇÃO DE PREÇO detectada ('caro', 'em conta', 'barato'):",
    '    Pivote com empatia: "Entendido! Se a ideia é algo mais em conta, esse combo entrega muito pelo valor 👇"',
    "    Depois chame suggest_upsell com item de melhor custo-benefício.",
    "  → OBJEÇÃO DE GOSTO detectada ('não gosto de', 'frito', 'empanado', 'sem cru'):",
    '    Valide e redirecione: "Sem problemas! Nossos pratos quentes fazem muito sucesso — separei os melhores 👇"',
    "    Depois chame suggest_upsell com item do perfil solicitado.",
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

function handleEntry(_catalog: V2CatalogItem[]): V2Output {
  return {
    message:     "Olá! Estou aqui se precisar de ajuda 😊",
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

function handleItemAdded(input: V2Input): V2Output {
  const { catalog, cartItemIds, lastAddedId, cartValue } = input;
  const addedItem = lastAddedId ? catalog.find((i) => i.id === lastAddedId) : undefined;

  const itemLine = addedItem
    ? `Item adicionado: "${addedItem.name}" (categoria: ${addedItem.categoryName}) — R$ ${addedItem.price.toFixed(2)}`
    : "Item adicionado ao carrinho.";

  const cartLine = cartItemIds.length > 1
    ? `Pedido atual: ${cartItemIds.length} itens — total R$ ${cartValue.toFixed(2)}.`
    : "Primeiro item do pedido.";

  const aiDirective = [
    BASE_DIRECTIVE,
    "",
    "━━━ EVENTO: ON_ITEM_ADDED ━━━",
    itemLine,
    cartLine,
    "",
    "TAREFA: Gere 1 frase de confirmação única e sofisticada (máx. 15 palavras).",
    "  → Analise o item e contexto do carrinho — nunca use frases genéricas.",
    "  → Variedade obrigatória: entusiasmado, elegante, com dica sutil — alterne estilos.",
    "  → Se é bebida: elogie a escolha de acompanhamento. Se é sobremesa: antecipe a experiência.",
    "  → Se é 2º+ item: comente sutilmente a boa composição do pedido.",
    "  → Use 1 emoji elegante adequado à categoria (🍱 sushi/japonês, 🥤 bebida, 🍰 sobremesa, ✨ premium, 👌 padrão).",
    "PROIBIDO absolutamente: chamar suggest_upsell, add_item ou qualquer outra ferramenta.",
    "Responda SOMENTE com a frase de confirmação. Sem aspas. Sem explicação.",
  ].join("\n");

  return {
    message:     "",
    cards:       [],
    mode:        "BROWSE",
    options:     [],
    requiresAI:  true,
    aiDirective,
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
  const cfg = input.config ?? DEFAULT_WAITER_CONFIG;
  const mem = input.memory;
  const silent: V2Output = { message: "", cards: [], mode: "BROWSE", options: [], requiresAI: false, aiDirective: "" };

  if (!cfg.allowIdlePrompt) return silent;
  if (mem && (mem.promptCount >= cfg.maxPermissionPromptsPerSession || isPermissionCooldownActive(mem, cfg))) return silent;

  // When permission is not required, surface the permission ask as a soft suggestion.
  if (!cfg.permissionRequiredBeforeSuggestions) {
    return {
      message:     "Posso te sugerir algo? ✨",
      cards:       [],
      mode:        "BROWSE",
      options:     [
        { label: "Quero sugestão ✨", value: "want_suggestion" },
        { label: "Prefiro continuar", value: "continue_browsing" },
      ],
      requiresAI:  false,
      aiDirective: "",
    };
  }

  // Ask permission before suggesting — never auto-push products on idle.
  return {
    message:     "Posso te sugerir algo que combine com o que você está vendo? 👇",
    cards:       [],
    mode:        "BROWSE",
    options:     [
      { label: "Quero sugestão ✨", value: "want_suggestion" },
      { label: "Prefiro continuar", value: "continue_browsing" },
    ],
    requiresAI:  false,
    aiDirective: "",
  };
}

function handleCheckoutStarted(input: V2Input): V2Output {
  const cfg = input.config ?? DEFAULT_WAITER_CONFIG;
  const mem = input.memory;
  const ca  = analyzeCart(input.cartItemIds, input.catalog);

  // Skip if config disables, or already handled this session
  const alreadyHandled = !cfg.allowFinalUpsellPrompt || (mem && (mem.finalUpsellPromptShown || mem.finalUpsellDeclined));

  if (!alreadyHandled && ca.hasFood) {
    // Case A: cart has food but no drink → show drink cards actively
    if (!ca.hasDrink) {
      const drinkCards = selectDrinkItems(input.catalog, input.cartItemIds);
      if (drinkCards.length > 0) {
        return {
          message:     "Esse pedido fica perfeito com uma dessas bebidas — a combinação ideal 👇",
          cards:       drinkCards,
          mode:        "INTERVENTION",
          options:     [
            { label: "Adicionar depois",    value: "skip_drink_upsell" },
            { label: "Finalizar sem bebida", value: "continue_checkout"  },
          ],
          requiresAI:  false,
          aiDirective: "",
        };
      }
    }

    // Case B/C: has drink (or no drinks available) but no dessert → show dessert cards
    if (!ca.hasDessert) {
      const dessertCards = selectDessertItems(input.catalog, input.cartItemIds);
      if (dessertCards.length > 0) {
        return {
          message:     "O favorito dos clientes pra fechar com chave de ouro 🍰",
          cards:       dessertCards,
          mode:        "INTERVENTION",
          options:     [{ label: "Finalizar sem sobremesa", value: "continue_checkout" }],
          requiresAI:  false,
          aiDirective: "",
        };
      }
    }
  }

  // Case D: cart complete, or no opportunity — proceed to checkout.
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

/**
 * User accepted the passive permission prompt ("Quero sugestão ✨").
 * Run the Sales Specialist Core as if user said "me sugere algo":
 *   - Empty cart     → qualification buttons (Leve / Completo / Para compartilhar)
 *   - Cart has items → context-aware suggestion cards (deterministic)
 *   - Fallback       → AI pipeline for complex cases
 */
function handlePermissionAccepted(input: V2Input): V2Output {
  const { catalog, cartItemIds } = input;
  const suggestedIds = input.memory?.suggestedProductIds ?? [];
  const cards = rankProducts(catalog, "wants_recommendation", cartItemIds, 5, suggestedIds);
  if (cards.length > 0) {
    return {
      message:     "Separei algumas opções que combinam com o seu pedido 👇",
      cards,
      mode:        "INTERVENTION",
      options:     [],
      requiresAI:  false,
      aiDirective: "",
    };
  }

  // Fallback: AI pipeline
  return {
    message:     "",
    cards:       [],
    mode:        "INTERVENTION",
    options:     [],
    requiresAI:  true,
    aiDirective: buildInterventionDirective(),
  };
}

/** User declined ("Prefiro continuar") — silent acknowledgment, no products. */
function handlePermissionDeclined(): V2Output {
  return {
    message:     "Perfeito 😊 fico por aqui se precisar.",
    cards:       [],
    mode:        "BROWSE",
    options:     [],
    requiresAI:  false,
    aiDirective: "",
  };
}

function handleAfterCheckout(): V2Output {
  // Static response — never use AI for post-checkout events to prevent upsell leakage.
  return {
    message:     "Pedido recebido 😊 Agora é só acompanhar a confirmação.",
    cards:       [],
    mode:        "CHECKOUT_SUPPORT",
    options:     [],
    requiresAI:  false,
    aiDirective: "",
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

// ─── Commercial Response Builder (Sprint 4D) ─────────────────

const INTENT_COPY: Partial<Record<CustomerIntent, string>> = {
  wants_light_option:    "Pra algo mais leve — essas são as favoritas da casa 👇",
  wants_complete_meal:   "Pra uma refeição completa — essa combinação é perfeita 👇",
  wants_group_order:     "As favoritas do grupo — combinação certeira 👇",
  wants_budget_option:   "Melhor custo-benefício da casa — o mais pedido nessa faixa 👇",
  wants_premium_option:  "O melhor da casa — vale cada detalhe 👇",
  asks_for_drink:        "A combinação perfeita pra acompanhar o pedido 👇",
  asks_for_dessert:      "O favorito dos clientes pra fechar com chave de ouro 🍰",
  asks_for_pairing:      "Combinação perfeita com o que você escolheu 👇",
  wants_recommendation:  "O mais pedido da casa — você vai adorar 👇",
  asks_specific_product: "Separei essa opção especial pra você 👇",
  asks_category:         "As melhores opções dessa categoria 👇",
};

export interface CommercialResponseInput {
  intent:           CustomerIntent;
  opportunity?:     SalesOpportunity;
  selectedProducts: string[];
  mode:             WaiterMode;
  cartAnalysis?:    { hasFood: boolean; hasDrink: boolean; hasDessert: boolean };
  confidence?:      number;
}

function getCopy(intent: CustomerIntent, config: WaiterSalesConfig): string {
  const map =
    config.upsellStyle === "subtle"     ? { ...INTENT_COPY, ...SUBTLE_COPY }     :
    config.upsellStyle === "aggressive" ? { ...INTENT_COPY, ...AGGRESSIVE_COPY } :
    INTENT_COPY;
  return map[intent] ?? "Separei boas opções pra você 👇";
}

/**
 * Builds a concise, seller-tone message for a product suggestion.
 * Contract: cards present → options is always [] (no confirmation buttons).
 * Pass config to apply tone/upsell-style overrides; defaults to DEFAULT_WAITER_CONFIG.
 */
export function buildCommercialResponse(
  params: CommercialResponseInput,
  config: WaiterSalesConfig = DEFAULT_WAITER_CONFIG,
): Pick<V2Output, "message" | "options" | "cards" | "mode"> {
  const { intent, selectedProducts, mode } = params;
  const message = getCopy(intent, config);
  return { message, options: [], cards: selectedProducts, mode };
}

// ─── Objection-aware copy builder ─────────────────────────────────────────────
// Fires when a customer message contains price or taste/ingredient objection signals.
// Returns a copy string that pivots the objection with empathy; returns null when
// no objection is detected so normal INTENT_COPY continues to apply.

const PRICE_OBJECTION_RE_MSG =
  /\b(caro|cara|mais em conta|mais barato|barato|econôm|econom|em conta|custo.?benef[íi]cio)\b/i;

const TASTE_OBJECTION_RE_MSG =
  /n[ãa]o gosto\b|\b(frito|empanado|assado|cozido|sem cru|sem peixe|sem frango|sem carne|sem glúten)\b/i;

const CONSTRAINT_RE_MSG =
  /\b(al[eé]rgic[ao]|alergi[ao]|orçamento|sem [a-záéíóúâêôãõàç]+|intolerante)\b/i;

// Per-intent copy for price objections — acknowledges before pivoting.
const PRICE_OBJECTION_COPY: Partial<Record<CustomerIntent, string>> = {
  wants_budget_option:  "Entendido! Se a ideia é algo mais em conta, essas opções entregam muito pelo valor 👇",
  wants_group_order:    "Com certeza! Pra dividir bem e gastar menos, essas são ótimas escolhas 👇",
  wants_recommendation: "Sem problema! Separei as melhores opções de custo-benefício pra você 👇",
  asks_for_pairing:     "Claro! Essas opções harmonizam com o pedido e têm ótimo valor 👇",
  unclear:              "Entendido! Essas opções têm excelente custo-benefício 👇",
};

// Per-intent copy for taste/ingredient objections — validates and redirects.
const TASTE_OBJECTION_COPY: Partial<Record<CustomerIntent, string>> = {
  asks_category:        "Sem problemas! Nossos pratos quentes e empanados fazem muito sucesso — separei os melhores 👇",
  wants_recommendation: "Boa escolha! Separei as opções que combinam com o seu gosto 👇",
  unclear:              "Sem problemas! Veja essas opções que combinam com você 👇",
};

// Per-intent copy for allergy/budget constraint messages — acknowledges restriction before pivoting.
const CONSTRAINT_OBJECTION_COPY: Partial<Record<CustomerIntent, string>> = {
  wants_recommendation: "Entendido! Levando em conta sua restrição, separei as melhores opções pra você 👇",
  wants_budget_option:  "Entendido! Respeitando seu orçamento e restrições, essas são as melhores escolhas 👇",
  unclear:              "Entendido! Levei em conta sua restrição — veja essas opções 👇",
};

/**
 * Returns objection-pivoting copy when a price, taste, or constraint objection is detected.
 * Returns null when no objection signal is present — caller falls back to default copy.
 * Priority: price > taste > constraint (allergy/budget) so the most specific copy wins.
 */
function buildObjectionCopy(message: string, intent: CustomerIntent): string | null {
  if (PRICE_OBJECTION_RE_MSG.test(message)) {
    return PRICE_OBJECTION_COPY[intent] ??
           "Entendido! Essas opções têm excelente custo-benefício 👇";
  }
  if (TASTE_OBJECTION_RE_MSG.test(message)) {
    return TASTE_OBJECTION_COPY[intent] ??
           "Sem problemas! Separei opções que combinam com você 👇";
  }
  if (CONSTRAINT_RE_MSG.test(message)) {
    return CONSTRAINT_OBJECTION_COPY[intent] ??
           "Entendido! Levei em conta sua restrição — veja essas opções 👇";
  }
  return null;
}

/**
 * Returns context-aware copy for the high-confidence search fast-path.
 * Objection and constraint messages get empathy-first pivoting copy instead of a generic "Encontrei".
 */
function buildSearchCopy(message: string): string {
  if (PRICE_OBJECTION_RE_MSG.test(message)) {
    return "Entendido! Se a ideia é algo mais em conta, essas opções entregam muito pelo valor 👇";
  }
  if (TASTE_OBJECTION_RE_MSG.test(message)) {
    return "Sem problemas! Nossos pratos quentes e empanados fazem muito sucesso — separei os melhores 👇";
  }
  if (CONSTRAINT_RE_MSG.test(message)) {
    return "Entendido! Levei em conta sua restrição — veja essas opções 👇";
  }
  return "Aqui estão as melhores opções pra você 👇";
}

/**
 * Parses explicit constraints declared in the customer message.
 * Extracts allergen keywords from "alérgico/a a X" patterns and a numeric
 * maxBudget from "R$ X" when "orçamento" or "máximo" appears nearby.
 */
function extractMessageConstraints(
  msg: string,
): { maxBudget?: number; excludeKeywords: string[] } {
  const excludeKeywords: string[] = [];

  const allergyRe = /al[eé]rgic[ao]?\s+[àa]\s+([\wÀ-ž]+)/gi;
  let m: RegExpExecArray | null;
  while ((m = allergyRe.exec(msg)) !== null) {
    const kw = m[1]?.trim().toLowerCase();
    if (kw) excludeKeywords.push(kw);
  }

  let maxBudget: number | undefined;
  if (/orçamento|budget|máximo\s+[ée]/i.test(msg)) {
    const bm = /R\$\s*(\d{2,4}(?:[,.]?\d{2})?)/i.exec(msg);
    if (bm?.[1]) maxBudget = parseFloat(bm[1].replace(",", "."));
  }

  return { maxBudget, excludeKeywords };
}

/**
 * Post-filters a card ID list against declared constraints (maxBudget, excludeKeywords).
 * Returns the original list unchanged when no constraints are active.
 */
function applyConstraints(
  ids:              string[],
  catalog:          V2CatalogItem[],
  maxBudget?:       number,
  excludeKeywords?: string[],
): string[] {
  if (maxBudget === undefined && !excludeKeywords?.length) return ids;
  return ids.filter((id) => {
    const item = catalog.find((c) => c.id === id);
    if (!item) return true;
    if (maxBudget !== undefined && item.price > maxBudget) return false;
    if (excludeKeywords?.length) {
      const nameLow = item.name.toLowerCase();
      const descLow = (item.description ?? "").toLowerCase();
      if (excludeKeywords.some((kw) => nameLow.includes(kw) || descLow.includes(kw))) return false;
    }
    return true;
  });
}

function handleUserMessage(input: V2Input): V2Output {
  const cfg          = input.config ?? DEFAULT_WAITER_CONFIG;
  const { catalog, cartItemIds } = input;
  const suggestedIds = input.memory?.suggestedProductIds ?? [];

  const msgRaw  = input.message ?? "";
  const msgLow  = msgRaw.toLowerCase().trim();

  // Extract explicit constraints declared in the customer message
  // (e.g. "alérgico a camarão", "orçamento máximo R$ 60").
  const { maxBudget, excludeKeywords: excludedIngredients } = extractMessageConstraints(msgRaw);

  // Convenience wrapper — threads config to buildCommercialResponse for every deterministic path.
  // Applies message-level constraints (allergy, budget) before building the response so card lists
  // are always safe to render. Also pivots copy via buildObjectionCopy() when an objection is detected.
  const suggest = (intent: CustomerIntent, rawIds: string[], mode: WaiterMode): V2Output => {
    const cards = applyConstraints(rawIds, catalog, maxBudget, excludedIngredients);
    if (cards.length === 0 && rawIds.length > 0) return noCardsFound();
    const base    = buildCommercialResponse({ intent, selectedProducts: cards, mode }, cfg);
    const message = buildObjectionCopy(msgRaw, intent) ?? base.message;
    return { ...base, message, requiresAI: false, aiDirective: "" };
  };

  // ── Special path: pre-checkout "Ver opções" button (backward compat) ─────────
  if (msgLow === "see_final_suggestions") {
    const ca = analyzeCart(cartItemIds, catalog);
    const intent: CustomerIntent =
      !ca.hasDrink   ? "asks_for_drink"   :
      !ca.hasDessert ? "asks_for_dessert" :
                       "asks_for_pairing";
    const cards = rankProducts(catalog, intent, cartItemIds, 5, suggestedIds);
    if (cards.length > 0) {
      return {
        message:     "Pra fechar bem, essas opções combinam com seu pedido 👇",
        cards, mode: "INTERVENTION", options: [], requiresAI: false, aiDirective: "",
      };
    }
    return noCardsFound();
  }

  // ── Special path: "Ver sobremesas novamente" button ───────────────────────────
  if (msgLow === "see_desserts_again") {
    const cards = rankProducts(catalog, "asks_for_dessert", cartItemIds, 5, []);
    if (cards.length > 0) return suggest("asks_for_dessert", cards, "SUGGESTION");
    return noCardsFound();
  }

  // ── Special path: user skipped drink upsell → offer all desserts ────────────
  if (msgLow === "skip_drink_upsell") {
    const dessertCards = selectDessertItems(catalog, cartItemIds);
    if (dessertCards.length > 0) {
      return {
        message:     "Feche com chave de ouro — o favorito dos clientes 🍰",
        cards:       dessertCards,
        mode:        "INTERVENTION",
        options:     [{ label: "Finalizar sem sobremesa", value: "continue_checkout" }],
        requiresAI:  false,
        aiDirective: "",
      };
    }
    return {
      message:     "Perfeito 😊 pode finalizar por aqui.",
      cards:       [],
      mode:        "CHECKOUT_SUPPORT",
      options:     [],
      requiresAI:  false,
      aiDirective: "",
    };
  }

  // ── Menu search: explicit product / category queries ─────────────────────────
  // If the customer is asking about a specific food (sushi, temaki, coca, etc.),
  // surface matching catalog items immediately — no generic qualification.
  // Constraints (maxBudget, excludedIngredients) are applied inside searchMenuByQuery
  // so allergen items or over-budget items are excluded before scoring.
  const searchResult = searchMenuByQuery(msgRaw, catalog, cartItemIds, suggestedIds, 5, maxBudget, excludedIngredients);
  if (searchResult.confidence === "high") {
    return {
      message:     buildSearchCopy(msgRaw),
      cards:       searchResult.ids,
      mode:        "SUGGESTION",
      options:     [],
      requiresAI:  false,
      aiDirective: "",
    };
  }

  const analysis = analyzeSalesContext(input);
  const hasItems = cartItemIds.length > 0;

  // ── Deterministic paths (Sales Intelligence — no AI call) ────
  switch (analysis.customerIntent) {
    case "wants_light_option": {
      const cards = rankProducts(catalog, "wants_light_option", cartItemIds, 5, suggestedIds);
      if (cards.length > 0) return suggest("wants_light_option", cards, "SUGGESTION");
      return noCardsFound();
    }
    case "wants_complete_meal": {
      const cards = rankProducts(catalog, "wants_complete_meal", cartItemIds, 5, suggestedIds);
      if (cards.length > 0) return suggest("wants_complete_meal", cards, "SUGGESTION");
      return noCardsFound();
    }
    case "wants_group_order": {
      const cards = rankProducts(catalog, "wants_group_order", cartItemIds, 5, suggestedIds);
      if (cards.length > 0) return suggest("wants_group_order", cards, "SUGGESTION");
      return noCardsFound();
    }
    case "wants_budget_option": {
      const cards = rankProducts(catalog, "wants_budget_option", cartItemIds, 5, suggestedIds);
      if (cards.length > 0) return suggest("wants_budget_option", cards, "SUGGESTION");
      return noCardsFound();
    }
    case "wants_premium_option": {
      let cards = rankProducts(catalog, "wants_premium_option", cartItemIds, 5, suggestedIds);
      if (cards.length === 0 && suggestedIds.length > 0) {
        cards = rankProducts(catalog, "wants_premium_option", cartItemIds, 5, []);
      }
      if (cards.length > 0) return suggest("wants_premium_option", cards, "INTERVENTION");
      return noCardsFound();
    }
    case "asks_for_dessert": {
      const cards = rankProducts(catalog, "asks_for_dessert", cartItemIds, 5, suggestedIds);
      if (cards.length > 0) return suggest("asks_for_dessert", cards, "SUGGESTION");
      if (suggestedIds.some((id) => {
        const item = catalog.find((i) => i.id === id);
        return item && isDessertCategory(item.categoryName);
      })) {
        return {
          message:     "Mostro as mesmas opções de sobremesa ou prefere ver outra categoria?",
          cards:       [],
          mode:        "BROWSE",
          options:     [
            { label: "Ver sobremesas novamente", value: "see_desserts_again" },
            { label: "Ver outra categoria",      value: "browse_menu"        },
          ],
          requiresAI:  false,
          aiDirective: "",
        };
      }
      return noCardsFound();
    }
    case "asks_for_drink": {
      const cards = rankProducts(catalog, "asks_for_drink", cartItemIds, 5, suggestedIds);
      if (cards.length > 0) return suggest("asks_for_drink", cards, "SUGGESTION");
      return noCardsFound();
    }
    case "asks_for_pairing": {
      const cards = rankProducts(catalog, "asks_for_pairing", cartItemIds, 5, suggestedIds);
      if (cards.length > 0) return suggest("asks_for_pairing", cards, "SUGGESTION");
      return noCardsFound();
    }
    case "asks_specific_product": {
      const msgL = msgRaw.toLowerCase();
      const hit  = catalog.find((i) => i.name.length >= 4 && msgL.includes(i.name.toLowerCase()) && !cartItemIds.includes(i.id));
      if (hit) return suggest("asks_specific_product", [hit.id], "SUGGESTION");
      break;
    }
    case "asks_category": {
      const msgL    = msgRaw.toLowerCase();
      const catNames = [...new Set(catalog.map((i) => i.categoryName))];
      const hitCat  = catNames.find((c) => c.length >= 4 && msgL.includes(c.toLowerCase()));
      if (hitCat) {
        const cards = catalog
          .filter((i) => i.categoryName === hitCat && !cartItemIds.includes(i.id))
          .sort(bySort)
          .slice(0, 5)
          .map((i) => i.id);
        if (cards.length > 0) return suggest("asks_category", cards, "SUGGESTION");
      }
      break;
    }
    case "unclear":
    case "wants_recommendation": {
      const cards = rankProducts(catalog, "wants_recommendation", cartItemIds, 5, suggestedIds);
      if (cards.length > 0) return suggest("wants_recommendation", cards, "SUGGESTION");
      break;
    }
    case "checkout_intent": {
      if (!hasItems) break;
      const ca = analyzeCart(cartItemIds, catalog);
      if (!ca.hasDrink) {
        const drinkCards = selectDrinkItems(catalog, cartItemIds);
        if (drinkCards.length > 0) {
          return {
            message:     "Antes de finalizar — uma bebida vai bem com seu pedido 👇",
            cards:       drinkCards,
            mode:        "INTERVENTION",
            options:     [
              { label: "Adicionar depois",    value: "skip_drink_upsell" },
              { label: "Finalizar sem bebida", value: "continue_checkout" },
            ],
            requiresAI:  false,
            aiDirective: "",
          };
        }
      }
      if (!ca.hasDessert) {
        const dessertCards = selectDessertItems(catalog, cartItemIds);
        if (dessertCards.length > 0) {
          return {
            message:     "Antes de finalizar — separei algumas sobremesas pra você 👇",
            cards:       dessertCards,
            mode:        "INTERVENTION",
            options:     [{ label: "Finalizar sem sobremesa", value: "continue_checkout" }],
            requiresAI:  false,
            aiDirective: "",
          };
        }
      }
      return { message: "Perfeito! Pode finalizar quando quiser 😊", cards: [], mode: "CHECKOUT_SUPPORT", options: [], requiresAI: false, aiDirective: "" };
    }
  }

  // ── AI path for remaining intents ─────────────────────────────
  return {
    message:     "",
    cards:       [],
    mode:        "BROWSE",
    options:     [],
    requiresAI:  true,
    aiDirective: buildUserMessageDirective(input.cartItemIds, input.cartValue),
  };
}

// ─── response quality + safety guards ────────────────────────

const SAFE_FALLBACK: V2Output = {
  message:     "Perfeito 😊 fico por aqui se precisar de ajuda.",
  options:     [],
  cards:       [],
  mode:        "BROWSE",
  requiresAI:  false,
  aiDirective: "",
};

const VALID_MODES = new Set<WaiterMode>(["BROWSE", "SUGGESTION", "INTERVENTION", "CHECKOUT_SUPPORT"]);

// Unanswered choice questions → attach appropriate buttons automatically
const QUESTION_BUTTON_PATTERNS: { re: RegExp; options: WaiterOption[] }[] = [
  // 3-option pattern must come before the 2-option pattern (more specific first)
  {
    re: /leve.*completo.*compartilh|leve.*completo.*grupo/i,
    options: [
      { label: "Leve", value: "light" },
      { label: "Completo", value: "complete" },
      { label: "Para compartilhar", value: "group" },
    ],
  },
  {
    re: /leve.*ou.*completo|completo.*ou.*leve/i,
    options: [{ label: "Leve", value: "light" }, { label: "Completo", value: "complete" }],
  },
  {
    re: /quantas?\s*(pessoas?|são)/i,
    options: [
      { label: "Só eu",        value: "solo"        },
      { label: "2 a 3 pessoas", value: "small_group"  },
      { label: "4 ou mais",    value: "large_group"  },
    ],
  },
  {
    re: /mais econômico.*mais complet[ao]|mais complet[ao].*mais econômico/i,
    options: [
      { label: "Mais econômico", value: "budget"   },
      { label: "Mais completo",  value: "complete" },
    ],
  },
  // Cuisine-aware: sushi discovery
  {
    re: /cru.*quente.*temaki|prefere algo cru/i,
    options: [
      { label: "Cru / Sushi", value: "discovery_cru_sushi" },
      { label: "Quente",      value: "discovery_quente"    },
      { label: "Temaki",      value: "discovery_temaki"    },
    ],
  },
  // Cuisine-aware: pizza discovery
  {
    re: /pizza salgada.*doce|salgada.*ou.*doce.*pizza/i,
    options: [
      { label: "Salgada", value: "discovery_pizza_salgada" },
      { label: "Doce",    value: "discovery_pizza_doce"    },
    ],
  },
];

// Bare weak phrases → replace with seller-tone equivalent
const WEAK_PHRASE_RE = /^(legal|beleza|ótimo|ok|claro)[!.]?$/i;

// Option values allowed when mode is CHECKOUT_SUPPORT
const CHECKOUT_SAFE_OPTIONS = new Set(["continue_checkout", "browse_menu", "skip_drink_upsell"]);

/**
 * Validates and repairs a V2Output before it reaches the client.
 * Runs for every event so no handler can bypass the rules.
 *
 * Repair priority:
 *   1. Invalid mode          → SAFE_FALLBACK
 *   2. Deduplicate + ghost card IDs removed
 *   3. Message truncated to 2 lines
 *   4. Product mention in text without matching card → strip name from text
 *   5. Unanswered choice question → attach buttons (only when no cards shown)
 *   6. Bare weak phrase → seller replacement
 *   7. ON_ITEM_ADDED → force cards = [], options = []
 *   8. CHECKOUT_SUPPORT → force cards = [], strip selling options
 *   9. Cards present → options forced to [] (no confirmation buttons after cards)
 */
export function validateWaiterResponse(
  output:  V2Output,
  catalog: V2CatalogItem[],
  event:   V2Event,
): V2Output {
  let { message, cards, mode, options, requiresAI, aiDirective } = output;

  // Snapshot for debug diff — only allocated when debug is on
  const snap = DEBUG_ENABLED
    ? { message: output.message, cards: output.cards.slice(), options: output.options.slice(), mode: output.mode }
    : null;

  try {
    // 1. Mode must be a known WaiterMode
    if (!VALID_MODES.has(mode)) return { ...SAFE_FALLBACK };

    // 2. Deduplicate cards and drop any ID not present in the catalog
    const catalogIds = new Set(catalog.map((i) => i.id));
    cards = [...new Set(cards)].filter((id) => catalogIds.has(id));

    // 3. Truncate message to max 2 non-empty lines
    {
      const lines = message.split("\n").filter((l) => l.trim().length > 0);
      if (lines.length > 2) message = lines.slice(0, 2).join("\n");
    }

    // 4. Product mention guard (deterministic responses only — AI messages are empty at this point)
    if (!requiresAI && message.length > 0) {
      for (const item of catalog) {
        if (item.name.length < 4) continue; // very short names risk false positives
        const escaped = item.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        const nameRe  = new RegExp(escaped, "gi");
        if (nameRe.test(message) && !cards.includes(item.id)) {
          // Fix B: strip the name from the message text
          message = message.replace(nameRe, "").replace(/\s{2,}/g, " ").trim();
          if (message.replace(/[^a-zà-ú]/gi, "").length < 5) {
            message = "Separei boas opções pra você 👇";
          }
        }
      }
    }

    // 5. Open question guard — unanswered choice question must carry buttons (only when no cards)
    if (cards.length === 0 && options.length === 0 && !requiresAI && message.includes("?")) {
      for (const { re, options: btns } of QUESTION_BUTTON_PATTERNS) {
        if (re.test(message)) { options = btns; break; }
      }
    }

    // 6. Seller tone guard — bare weak phrases are not acceptable as a full response
    if (WEAK_PHRASE_RE.test(message.trim())) {
      message = "Escolha certeira 👌";
    }

    // 7. No UI invasion — item-added events must not carry cards or option prompts
    if (event === "ON_ITEM_ADDED") {
      cards   = [];
      options = [];
    }

    // 8. Checkout guard — CHECKOUT_SUPPORT must have no cards and no selling options
    if (mode === "CHECKOUT_SUPPORT") {
      cards   = [];
      options = options.filter((o) => CHECKOUT_SAFE_OPTIONS.has(o.value));
    }

    // 9. No confirmation buttons alongside product cards
    // Exception: active checkout upsell (INTERVENTION) may carry skip/continue options
    const isCheckoutUpsell = mode === "INTERVENTION" &&
      options.some((o) => o.value === "skip_drink_upsell" || o.value === "continue_checkout");
    if (cards.length > 0 && !isCheckoutUpsell) options = [];

    if (snap) {
      const fixes: string[] = [];
      if (snap.message !== message)                  fixes.push("message modified (truncation or product name stripped)");
      if (snap.cards.join(",") !== cards.join(","))  fixes.push("cards modified (dedup or ghost ID removed)");
      if (snap.options.length !== options.length)    fixes.push("options modified (buttons added or stripped)");
      if (snap.mode !== mode)                        fixes.push("mode changed");
      if (fixes.length > 0) {
        waiterLog({
          type:     "waiter_validation_fix",
          event,
          fixes,
          original: { message: snap.message, cards: snap.cards, options: snap.options.map((o) => o.value), mode: snap.mode },
          fixed:    { message, cards, options: options.map((o) => o.value), mode },
        });
      }
    }

    return { message, cards, mode, options, requiresAI, aiDirective };
  } catch {
    return { ...SAFE_FALLBACK };
  }
}

// ─── session memory helpers ───────────────────────────────────

function isPermissionCooldownActive(
  mem:    WaiterMemory,
  config: WaiterSalesConfig = DEFAULT_WAITER_CONFIG,
): boolean {
  if (mem.permissionDeclinedAt === null) return false;
  return Date.now() - mem.permissionDeclinedAt < COOLDOWN_BY_LEVEL[config.interactionLevel];
}

/**
 * Derives the memory update for this turn.
 * Client applies it as: `memory = { ...memory, ...memoryPatch }`.
 * All array values are complete replacements (not deltas).
 */
function computeMemoryPatch(input: V2Input, output: V2Output): Partial<WaiterMemory> {
  const mem  = input.memory ?? createWaiterMemory();
  const msg  = (input.message ?? "").toLowerCase().trim();
  const patch: Partial<WaiterMemory> = {};

  // Always track last mode
  patch.lastMode = output.mode;

  // Track last detected intent for ON_USER_MESSAGE turns
  if (input.event === "ON_USER_MESSAGE") {
    patch.lastIntent = analyzeSalesContext(input).customerIntent;
  }

  // Accumulate shown product IDs
  if (output.cards.length > 0) {
    patch.suggestedProductIds = [...new Set([...mem.suggestedProductIds, ...output.cards])];
  }

  // Permission prompt was shown → increment counter
  if (input.event === "ON_IDLE" && output.options.some((o) => o.value === "want_suggestion")) {
    patch.promptCount = mem.promptCount + 1;
  }

  // User explicitly declined passive help
  if (input.event === "ON_PERMISSION_DECLINED" || msg === "continue_browsing") {
    patch.permissionDeclinedAt    = Date.now();
    patch.declinedSuggestionTypes = [...new Set([...mem.declinedSuggestionTypes, "passive_help"])];
  }

  // User accepted passive help
  if (input.event === "ON_PERMISSION_ACCEPT" || input.event === "ON_PERMISSION_ACCEPTED" || msg === "want_suggestion") {
    patch.acceptedSuggestionTypes = [...new Set([...mem.acceptedSuggestionTypes, "passive_help"])];
  }

  // Pre-checkout upsell declined
  if (msg === "continue_checkout") {
    patch.declinedSuggestionTypes = [...new Set([...mem.declinedSuggestionTypes, "final_upsell"])];
    patch.finalUpsellDeclined     = true;
    patch.finalUpsellPromptShown  = true;
  }

  // Pre-checkout upsell accepted (user chose "Ver opções")
  if (msg === "see_final_suggestions") {
    patch.acceptedSuggestionTypes = [...new Set([...mem.acceptedSuggestionTypes, "final_upsell"])];
    patch.finalUpsellPromptShown  = true;
  }

  // Final upsell prompt shown at checkout start (old gate or new active upsell with cards)
  if (input.event === "ON_CHECKOUT_STARTED" &&
      (output.options.some((o) => o.value === "see_final_suggestions") || output.cards.length > 0)) {
    patch.finalUpsellPromptShown = true;
  }

  // User skipped drink upsell — mark as handled so dessert runs next
  if (input.event === "ON_USER_MESSAGE" && (input.message ?? "").toLowerCase().trim() === "skip_drink_upsell") {
    patch.finalUpsellPromptShown = true;
  }

  return patch;
}

// ─── public API ───────────────────────────────────────────────

export function decide(input: V2Input): V2Output {
  const raw = ((): V2Output => {
    try {
      switch (input.event) {
        case "ON_ENTRY":               return handleEntry(input.catalog);
        case "ON_MENU_MODE":           return handleMenuMode();
        case "ON_ITEM_ADDED":          return handleItemAdded(input);
        case "ON_CART_UPDATED":        return handleCartUpdated(input);
        case "ON_IDLE":                return handleIdle(input);
        case "ON_CHECKOUT_STARTED":    return handleCheckoutStarted(input);
        case "AFTER_CHECKOUT":         return handleAfterCheckout();
        case "ON_USER_MESSAGE":        return handleUserMessage(input);
        case "ON_PERMISSION_ACCEPT":
        case "ON_PERMISSION_ACCEPTED": {
          console.info("[WaiterBrainV2] ON_PERMISSION_ACCEPTED", JSON.stringify({
            cartItems:  input.cartItemIds.length,
            cartValue:  input.cartValue,
            hasMemory:  !!input.memory,
          }));
          return handlePermissionAccepted(input);
        }
        case "ON_PERMISSION_DECLINED": return handlePermissionDeclined();
        default: {
          console.warn("[WaiterBrainV2] Unknown event", input.event);
          return { ...SAFE_FALLBACK };
        }
      }
    } catch (err) {
      console.error("[WaiterBrainV2] decide() error", { event: input.event, err });
      return { ...SAFE_FALLBACK };
    }
  })();
  const validated   = validateWaiterResponse(raw, input.catalog, input.event);
  const memoryPatch = computeMemoryPatch(input, validated);
  const result      = { ...validated, memoryPatch };

  if (DEBUG_ENABLED) {
    const cfg = input.config ?? DEFAULT_WAITER_CONFIG;
    const ca  = analyzeCart(input.cartItemIds, input.catalog);
    const intent =
      input.event === "ON_USER_MESSAGE" ? analyzeSalesContext(input).customerIntent : null;

    // No-op: silent response with no message, no cards, no options
    if (validated.message === "" && validated.cards.length === 0 && validated.options.length === 0) {
      let noopReason = "unknown";
      const mem = input.memory;
      if (input.event === "ON_IDLE") {
        if (!cfg.allowIdlePrompt)                                                 noopReason = "idle_prompt_disabled";
        else if (mem && mem.promptCount >= cfg.maxPermissionPromptsPerSession)    noopReason = "prompt_count_exceeded";
        else if (mem && isPermissionCooldownActive(mem, cfg))                     noopReason = "cooldown_active";
      } else if (input.event === "ON_ITEM_ADDED")  noopReason = "item_added_no_intervention";
      else if (input.event === "AFTER_CHECKOUT")   noopReason = "checkout_active";
      waiterLog({ type: "waiter_noop", event: input.event, reason: noopReason });
    }

    waiterLog({
      type:        "waiter_decision",
      event:       input.event,
      mode:        validated.mode,
      intent,
      cards:       validated.cards,
      options:     validated.options.map((o) => o.value),
      requiresAI:  validated.requiresAI,
      cartSummary: {
        itemCount:  input.cartItemIds.length,
        hasFood:    ca.hasFood,
        hasDrink:   ca.hasDrink,
        hasDessert: ca.hasDessert,
      },
      configUsed: {
        interactionLevel: cfg.interactionLevel,
        upsellStyle:      cfg.upsellStyle,
        tone:             cfg.tone,
      },
    });
  }

  return result;
}
