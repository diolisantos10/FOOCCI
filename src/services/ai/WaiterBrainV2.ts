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
  description?: string | null;
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

interface PriceBenchmarks { p25: number; median: number; p75: number; }

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

function selectDrinkItems(catalog: V2CatalogItem[], cartItemIds: string[], limit: number): string[] {
  return tagCatalog(catalog)
    .filter((i) => i.tags.includes("drink") && !cartItemIds.includes(i.id))
    .sort(tagSort)
    .slice(0, limit)
    .map((i) => i.id);
}

function selectDessertItems(catalog: V2CatalogItem[], cartItemIds: string[], limit: number): string[] {
  return tagCatalog(catalog)
    .filter((i) => i.tags.includes("dessert") && !cartItemIds.includes(i.id))
    .sort(tagSort)
    .slice(0, limit)
    .map((i) => i.id);
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

  // A) Price-sensitive — affordable items first, no premium push
  if (customerIntent === "price_sensitive") return "recommend_budget_item";

  // B) Group / family — combos when available
  if (customerIntent === "wants_for_group")
    return menuProfile.hasCombos ? "recommend_group_bundle" : "recommend_signature_item";

  // C) Premium intent
  if (customerIntent === "premium_experience")
    return menuProfile.hasPremiumItems ? "recommend_premium_upgrade" : "recommend_signature_item";

  // D) Explicit pairing request — always cart-aware
  if (customerIntent === "asks_pairing") return "recommend_pairing";

  // E) Explicit category requests
  if (customerIntent === "asks_drink")
    return menuProfile.hasDrinks   ? "recommend_drink"   : "ask_clarifying_question";
  if (customerIntent === "asks_dessert")
    return menuProfile.hasDesserts ? "recommend_dessert" : "ask_clarifying_question";

  // Light / complete — map to available product shapes
  if (customerIntent === "wants_light_food")    return "recommend_signature_item";
  if (customerIntent === "wants_complete_meal")
    return menuProfile.hasCombos ? "recommend_group_bundle" : "recommend_signature_item";

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

  // F/G) Unclear / silent browsing — ask with buttons
  return "ask_clarifying_question";
}

export interface WaiterResponseShape {
  message: string;
  options: WaiterOption[];
  cards:   string[];
  mode:    WaiterMode;
}

const STRATEGY_MESSAGES: Record<SalesStrategy, string> = {
  recommend_signature_item:  "Separei as melhores opções pra você 👇",
  recommend_budget_item:     "Ótimas opções com bom custo-benefício 👇",
  recommend_group_bundle:    "Pra compartilhar, essas opções fazem mais sentido 👇",
  recommend_premium_upgrade: "Uma experiência um pouco acima do padrão 👇",
  recommend_pairing:         "Essas opções combinam bem com o que você escolheu 👇",
  recommend_drink:           "Aqui estão as bebidas disponíveis 👇",
  recommend_dessert:         "Para adoçar o final 🍰",
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
    case "wants_recommendation": {
      if (!hasItems) return { message: "Prefere algo mais leve ou completo?", options: [{ label: "Leve", value: "light" }, { label: "Completo", value: "complete" }], cards: [], mode: "BROWSE", requiresAI: false, aiDirective: "" };
      // Cart has items → context-aware recommendation
      const cards = selectRecommendedItems(catalog, cartItemIds, 3);
      if (cards.length > 0) return { message: "Aqui vai o que faz mais sentido pra você agora 👇", cards, mode: "SUGGESTION", options: [], requiresAI: false, aiDirective: "" };
      break;
    }
    case "asks_pairing": {
      const cards = selectPairingItems(catalog, cartItemIds, 3);
      if (cards.length > 0) return { message: "Essas opções combinam bem com o que você escolheu 👇", cards, mode: "SUGGESTION", options: [], requiresAI: false, aiDirective: "" };
      return noCardsFound();
    }
    case "checkout_intent": {
      if (!hasItems) break;
      const pairingCards = selectPairingItems(catalog, cartItemIds, 2);
      if (pairingCards.length > 0) {
        return {
          message:     "Antes de finalizar, que tal acrescentar algo?",
          cards:       [],
          mode:        "INTERVENTION",
          options:     [{ label: "Ver opções", value: "see_final_suggestions" }, { label: "Não, finalizar", value: "continue_checkout" }],
          requiresAI:  false,
          aiDirective: "",
        };
      }
      return { message: "Perfeito! Pode finalizar quando quiser 😊", cards: [], mode: "CHECKOUT_SUPPORT", options: [], requiresAI: false, aiDirective: "" };
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
