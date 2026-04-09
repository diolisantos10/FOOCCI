/**
 * Suggestion Engine — selects the best drink or dessert item to suggest
 * during a DRINK or DESSERT sales phase.
 *
 * Selection priority (highest score wins):
 *   1. Bestseller            (+30, or +40 when salesPriority = "bestsellers")
 *   2. Promoted item         (+20, or +30 when salesPriority = "promotions")
 *   3. Context match         (+15 — cart item keywords pair with candidate item)
 *   4. Customer history      (+10 — customer ordered this item before)
 *   5. Any available item    (fallback, score 0)
 *
 * The returned SuggestionResult includes:
 *   - The specific item name + price + description
 *   - A contextual reason phrase in Portuguese
 *   - An optional promotion hint
 *
 * The AI uses this to construct a specific, waiter-style suggestion
 * instead of a generic "want a drink?" message.
 */

import type {
  AIContext,
  MenuCategoryContext,
  MenuItemContext,
  PromotionContext,
  CartItemContext,
} from "@/lib/ai-context/types";
import type { SalesPriority, SuggestedItem } from "@/lib/agent/types";

export type SuggestionResult = SuggestedItem;

// ── Category detection keywords ───────────────────────────────────────────────

const DRINK_CAT_KEYWORDS = [
  "bebida", "bebidas", "suco", "sucos", "refrigerante", "refrigerantes",
  "água", "cerveja", "cervejas", "limonada", "chá", "café", "vitamina",
  "shake", "smoothie", "drinks", "drink", "coquetéis",
];

const DESSERT_CAT_KEYWORDS = [
  "sobremesa", "sobremesas", "doce", "doces", "pudim", "sorvete",
  "brigadeiro", "brownie", "torta", "bolo", "mousse", "petit gateau",
  "açaí", "waffle", "crepe",
];

// ── Context pairing rules ─────────────────────────────────────────────────────
// Format: [cartKeywords, itemKeywords, reason phrase]
// First matching rule wins for both scoring (+15) and reason selection.
// cartKeywords: words expected in cart item names/descriptions.
// itemKeywords: words expected in the candidate item name/description/tags.

type ContextRule = [cartKws: string[], itemKws: string[], reason: string];

const DRINK_PAIRING: ContextRule[] = [
  [
    ["pizza", "calabresa", "pepperoni", "portuguesa"],
    ["cola", "refrigerante", "coca", "cerveja", "chopp"],
    "cai muito bem com pizza",
  ],
  [
    ["hamburger", "burger", "lanche", "smash", "cheddar", "bacon"],
    ["refrigerante", "limonada", "cola", "cerveja", "chopp"],
    "é o clássico com lanche",
  ],
  [
    ["frango", "grelhado", "light", "leve", "fit", "salada", "vegano", "vegetariano", "natural"],
    ["suco", "vitamina", "limonada", "água", "natural"],
    "combina com pratos mais leves",
  ],
  [
    ["massa", "pasta", "lasanha", "macarrão", "espaguete", "talharim"],
    ["refrigerante", "limonada", "cerveja", "chopp"],
    "harmoniza bem com massas",
  ],
  [
    ["peixe", "camarão", "salmão", "frutos do mar", "tilápia"],
    ["limonada", "água", "suco", "vitamina"],
    "é ótimo com frutos do mar",
  ],
  [
    ["açaí", "frutas", "tropical", "granola"],
    ["suco", "vitamina", "água de coco", "natural"],
    "vai muito bem junto",
  ],
  [
    ["picante", "apimentado", "pimenta", "ardido"],
    ["limonada", "água", "refrigerante", "suco"],
    "ajuda a equilibrar o picante",
  ],
];

const DESSERT_PAIRING: ContextRule[] = [
  [
    ["pizza", "hamburger", "burger", "lanche", "bacon", "cheddar"],
    ["sorvete", "sorbet", "mousse", "leve", "fruta", "frutas"],
    "é uma sobremesa leve para fechar bem",
  ],
  [
    ["vegano", "vegetariano", "natural", "fit", "light", "leve", "grelhado"],
    ["frutas", "mousse", "natural", "vegano", "leve", "sorvete"],
    "combina com o seu estilo de pedido",
  ],
  [
    ["frango", "grelhado", "salada", "levinho"],
    ["sorvete", "frutas", "mousse", "leve", "sorbet"],
    "é perfeito para fechar com leveza",
  ],
];

// ── Helpers ───────────────────────────────────────────────────────────────────

function norm(s: string): string {
  return s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

function matchesAny(text: string, keywords: string[]): boolean {
  const n = norm(text);
  return keywords.some((kw) => n.includes(norm(kw)));
}

/** Find the drink or dessert category in the (filtered) menu. */
function findCategory(
  menu:  MenuCategoryContext[],
  type:  "drink" | "dessert",
): MenuCategoryContext | null {
  const kws = type === "drink" ? DRINK_CAT_KEYWORDS : DESSERT_CAT_KEYWORDS;
  return menu.find((cat) => matchesAny(cat.name, kws)) ?? null;
}

/**
 * Build a map of item ID → matching promotion for all items in a category.
 * An item is eligible for promotion if:
 *   - it's explicitly in targetProductIds, OR
 *   - its category is in targetCategoryIds, OR
 *   - the promotion target is "ORDER" (order-level discount)
 */
function buildPromoMap(
  promotions: PromotionContext[],
  category:   MenuCategoryContext,
): Map<string, PromotionContext> {
  const map = new Map<string, PromotionContext>();
  for (const promo of promotions) {
    for (const item of category.items) {
      if (
        promo.targetProductIds.includes(item.id) ||
        promo.targetCategoryIds.includes(category.id) ||
        promo.target === "ORDER"
      ) {
        if (!map.has(item.id)) map.set(item.id, promo);
      }
    }
  }
  return map;
}

/** Format a promotion as a short, natural-sounding hint phrase. */
function formatPromoHint(promo: PromotionContext): string {
  if (promo.type === "PERCENTAGE") return `${promo.discountValue}% de desconto hoje`;
  if (promo.type === "FIXED")      return `R$ ${promo.discountValue.toFixed(2)} de desconto`;
  if (promo.type === "FREE_DELIVERY") return "frete grátis incluído";
  return promo.name;
}

/**
 * Score a candidate item for recommendation.
 * Examines bestseller status, promotions, context pairing, and customer history.
 */
function scoreItem(
  item:          MenuItemContext,
  promoMap:      Map<string, PromotionContext>,
  priority:      SalesPriority,
  cartText:      string,
  type:          "drink" | "dessert",
  pastItemNames: Set<string>,
): number {
  let score = 0;

  if (item.isBestseller) {
    score += priority === "bestsellers" ? 40 : 30;
  }
  if (promoMap.has(item.id)) {
    score += priority === "promotions" ? 30 : 20;
  }

  // Context pairing: does this item match what's in the cart?
  const itemText = norm(
    `${item.name} ${item.description ?? ""} ${item.tags.join(" ")}`,
  );
  const rules = type === "drink" ? DRINK_PAIRING : DESSERT_PAIRING;
  for (const [cartKws, itemKws] of rules) {
    if (matchesAny(cartText, cartKws) && matchesAny(itemText, itemKws)) {
      score += 15;
      break;
    }
  }

  // CRM: customer has ordered this item before
  if (pastItemNames.has(norm(item.name))) score += 10;

  return score;
}

/**
 * Resolve a contextual reason phrase for the chosen item.
 * Looks for a pairing rule where the cart content and item description match.
 * Falls back to a generic phrase if no rule matches.
 */
function resolveReason(
  cart: CartItemContext[],
  item: MenuItemContext,
  type: "drink" | "dessert",
): string {
  const cartText = norm(cart.map((i) => `${i.name} ${i.notes ?? ""}`).join(" "));
  const itemText = norm(
    `${item.name} ${item.description ?? ""} ${item.tags.join(" ")}`,
  );
  const rules = type === "drink" ? DRINK_PAIRING : DESSERT_PAIRING;
  for (const [cartKws, itemKws, reason] of rules) {
    if (
      cartKws.length > 0 &&
      matchesAny(cartText, cartKws) &&
      (itemKws.length === 0 || matchesAny(itemText, itemKws))
    ) {
      return reason;
    }
  }
  return type === "drink"
    ? "é uma boa pedida para acompanhar"
    : "é o favorito aqui para fechar o pedido";
}

// ── Main ──────────────────────────────────────────────────────────────────────

/**
 * Select the best item to suggest in the current sales phase.
 *
 * @param context      Full AI context (for promotions, customer, cart).
 * @param filteredMenu Menu after dietary filtering — same items the AI sees.
 * @param type         "drink" or "dessert" phase.
 * @param priority     Restaurant's sales priority config.
 * @returns A SuggestionResult to inject into the prompt, or null if no
 *          suitable category/item exists in the menu.
 */
export function selectSuggestion(
  context:      AIContext,
  filteredMenu: MenuCategoryContext[],
  type:         "drink" | "dessert",
  priority:     SalesPriority,
): SuggestionResult | null {
  const { promotions, customer, operational } = context;
  const cart = operational.cart;

  const category = findCategory(filteredMenu, type);
  if (!category || category.items.length === 0) return null;

  const promoMap  = buildPromoMap(promotions, category);
  const cartText  = norm(cart.map((i) => `${i.name} ${i.notes ?? ""}`).join(" "));

  // Build set of item names the customer has ordered in the past (normalised)
  const pastItemNames = new Set<string>(
    (customer?.recentOrders ?? []).flatMap(
      (o) => o.items.map((i) => norm(i.name)),
    ),
  );

  // Score all available items in the category
  const scored = category.items.map((item) => ({
    item,
    score: scoreItem(item, promoMap, priority, cartText, type, pastItemNames),
  }));
  scored.sort((a, b) => b.score - a.score);

  const best = scored[0]?.item;
  if (!best) return null;

  const reason = resolveReason(cart, best, type);
  const promo  = promoMap.get(best.id) ?? null;

  return {
    itemName:        best.name,
    itemPrice:       best.price,
    itemDescription: best.description,
    reason,
    promotionHint:   promo ? formatPromoHint(promo) : null,
  };
}
