/**
 * Sales Opportunity Engine — lightweight, non-intrusive suggestion layer.
 *
 * Detects when it makes sense to suggest a complementary item (drink or
 * dessert) based on what is already in the cart.  Returns a hint that is
 * injected into the AI preamble; the AI decides HOW to surface it.
 *
 * Design rules:
 *   - Never blocks the ordering flow
 *   - Never overrides the orchestrator
 *   - Suggestion fires AT MOST ONCE per type per conversation
 *     (enforced via the `alreadyOffered` guard passed from session state)
 *   - Detects categories via menu cross-reference first, name keywords second
 *
 * Note: CartItemContext has no `.category` field — category is resolved by
 * looking up `itemId` in the live menu, falling back to item-name keywords.
 */

import type { AIContext, CartItemContext, MenuCategoryContext } from "@/lib/ai-context/types";

// ── Result types ──────────────────────────────────────────────────────────────

export type OpportunityType = "DRINK" | "DESSERT";

export interface SalesOpportunity {
  type:        OpportunityType;
  messageHint: string;
}

// ── Category keywords ─────────────────────────────────────────────────────────
// Matched against the menu category NAME (and item name as fallback).
// Brazilian Portuguese — intentionally broad to cover common restaurant menus.

const DRINK_KEYWORDS: string[] = [
  "bebida", "bebidas", "suco", "sucos", "refrigerante", "refrigerantes",
  "água", "cerveja", "cervejas", "limonada", "chá", "café", "vitamina",
  "shake", "smoothie", "drinks", "drink", "coquetéis",
];

const DESSERT_KEYWORDS: string[] = [
  "sobremesa", "sobremesas", "doce", "doces", "pudim", "sorvete",
  "brigadeiro", "brownie", "torta", "bolo", "mousse", "petit gateau",
  "açaí", "waffle", "crepe",
];

// ── Category resolver ─────────────────────────────────────────────────────────

/**
 * Builds a Map<itemId → lowercased category name> from the full menu.
 * Only items with a non-empty itemId are indexed.
 */
function buildCategoryIndex(menu: MenuCategoryContext[]): Map<string, string> {
  const index = new Map<string, string>();
  for (const cat of menu) {
    const catLower = cat.name.toLowerCase();
    for (const item of cat.items) {
      if (item.id) index.set(item.id, catLower);
    }
  }
  return index;
}

/** Returns true if the text matches any keyword in the list. */
function matchesAny(text: string, keywords: string[]): boolean {
  return keywords.some((kw) => text.includes(kw));
}

/**
 * Resolves whether a cart item belongs to a given keyword group.
 * Priority: menu category name → item name (keyword fallback).
 */
function itemBelongsTo(
  item: CartItemContext,
  keywords: string[],
  index: Map<string, string>,
): boolean {
  const catName = item.itemId ? (index.get(item.itemId) ?? "") : "";
  if (catName && matchesAny(catName, keywords)) return true;
  // Fallback: match against the item name itself
  return matchesAny(item.name.toLowerCase(), keywords);
}

// ── Main function ─────────────────────────────────────────────────────────────

/**
 * Detects the next best sales opportunity given the current cart + menu.
 *
 * @param context        Full AI context (menu + operational.cart).
 * @param alreadyOffered What was last offered this session — prevents re-
 *                       suggesting the same type if the customer ignored it.
 *                       Sourced from AITurnInput.upsellOffered.
 * @returns A SalesOpportunity to inject into the AI preamble, or null.
 */
export function detectOpportunity(
  context:        AIContext,
  alreadyOffered: "drink" | "dessert" | null = null,
): SalesOpportunity | null {
  const { menu, operational } = context;
  const cart = operational.cart;

  // No cart items → nothing to complement
  if (cart.length === 0) return null;

  const index      = buildCategoryIndex(menu);
  const hasDrink   = cart.some((i) => itemBelongsTo(i, DRINK_KEYWORDS,   index));
  const hasDessert = cart.some((i) => itemBelongsTo(i, DESSERT_KEYWORDS, index));

  // ── RULE 1: Suggest drink if none in cart and not already offered ─────────
  if (!hasDrink && alreadyOffered !== "drink") {
    return {
      type:        "DRINK",
      messageHint: "Sugerir bebida que combine com o pedido",
    };
  }

  // ── RULE 2: Suggest dessert once a drink is present; not already offered ──
  if (hasDrink && !hasDessert && alreadyOffered !== "dessert") {
    return {
      type:        "DESSERT",
      messageHint: "Sugerir sobremesa leve após o pedido",
    };
  }

  return null;
}
