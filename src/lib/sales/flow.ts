/**
 * Sales Flow Resolver — determines the current upsell phase and whether
 * the AI is allowed to use checkout language in its response.
 *
 * Design rules:
 *   - Supersedes detectOpportunity's preamble role (opportunity.ts stays
 *     as a utility but its preamble injection is replaced by this module).
 *   - Runs AFTER the order orchestrator gate in runner.ts.
 *   - Never blocks the ordering flow — only signals the AI via the preamble.
 *   - blockCheckout is advisory for the AI; the orchestrator is the hard gate.
 *
 * Phase progression:
 *   NONE     → cart has no "main" item (food) yet; no upsell needed
 *   DRINK    → food in cart, no drink, drink not yet offered → suggest drink
 *   DESSERT  → drink in cart, no dessert, dessert not yet offered → suggest dessert
 *   DONE     → all relevant upsells resolved; checkout language is allowed
 */

import type { AIContext, MenuCategoryContext, CartItemContext } from "@/lib/ai-context/types";
import type { SalesPhase } from "@/lib/ai-context/types";

// ── Result type ────────────────────────────────────────────────────────────────

export interface SalesFlowResult {
  salesPhase:    SalesPhase;
  salesResolved: boolean;
  /** When true the AI must not use delivery/payment/checkout language. */
  blockCheckout: boolean;
  /** The upsell type that should be offered right now (if any). */
  type?: "drink" | "dessert";
}

// ── Category keywords ──────────────────────────────────────────────────────────
// Intentionally broad — covers common Brazilian restaurant menus.

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

const MAIN_FOOD_KEYWORDS: string[] = [
  "lanche", "lanches", "hamburguer", "hamburger", "burger", "pizza", "pizzas",
  "prato", "pratos", "refeição", "refeições", "frango", "carne", "peixe",
  "massa", "massas", "salada", "saladas", "entrada", "entradas", "petisco",
  "petiscos", "sushi", "combinado", "porção", "porções", "wrap",
];

// ── Category index ─────────────────────────────────────────────────────────────

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

function matchesAny(text: string, keywords: string[]): boolean {
  return keywords.some((kw) => text.includes(kw));
}

function itemBelongsTo(
  item: CartItemContext,
  keywords: string[],
  index: Map<string, string>,
): boolean {
  const catName = item.itemId ? (index.get(item.itemId) ?? "") : "";
  if (catName && matchesAny(catName, keywords)) return true;
  return matchesAny(item.name.toLowerCase(), keywords);
}

// ── Main resolver ──────────────────────────────────────────────────────────────

/**
 * Resolves the current sales phase given the cart state and what was
 * previously offered this session.
 *
 * @param context        Full AI context (must have menu + operational.cart).
 * @param alreadyOffered Last upsell type offered in this session — prevents
 *                       re-suggesting the same type when the customer ignores it.
 *                       Sourced from AITurnInput.upsellOffered.
 */
export function resolveSalesPhase(
  context:        AIContext,
  alreadyOffered: "drink" | "dessert" | null = null,
): SalesFlowResult {
  const { menu, operational } = context;
  const cart = operational.cart;

  // No items in cart → nothing to upsell around; pass through
  if (cart.length === 0) {
    return { salesPhase: "NONE", salesResolved: true, blockCheckout: false };
  }

  const index = buildCategoryIndex(menu);

  const hasDrink   = cart.some((i) => itemBelongsTo(i, DRINK_KEYWORDS,   index));
  const hasDessert = cart.some((i) => itemBelongsTo(i, DESSERT_KEYWORDS, index));
  const hasMain    = cart.some(
    (i) =>
      itemBelongsTo(i, MAIN_FOOD_KEYWORDS, index) ||
      // Items that are NOT a drink or dessert are considered a "main" item
      (!itemBelongsTo(i, DRINK_KEYWORDS, index) && !itemBelongsTo(i, DESSERT_KEYWORDS, index))
  );

  // Cart has only drinks/desserts (no food) → skip upsell, allow checkout
  if (!hasMain) {
    return { salesPhase: "DONE", salesResolved: true, blockCheckout: false };
  }

  // ── RULE 1: Drink phase ────────────────────────────────────────────────────
  // Food in cart, no drink, drink not yet offered → must offer drink first
  if (!hasDrink && alreadyOffered !== "drink") {
    return {
      salesPhase:    "DRINK",
      salesResolved: false,
      blockCheckout: true,
      type:          "drink",
    };
  }

  // ── RULE 2: Dessert phase ──────────────────────────────────────────────────
  // Drink present (or already offered), no dessert, dessert not yet offered
  if ((hasDrink || alreadyOffered === "drink") && !hasDessert && alreadyOffered !== "dessert") {
    return {
      salesPhase:    "DESSERT",
      salesResolved: false,
      blockCheckout: true,
      type:          "dessert",
    };
  }

  // ── All upsells resolved ───────────────────────────────────────────────────
  return { salesPhase: "DONE", salesResolved: true, blockCheckout: false };
}
