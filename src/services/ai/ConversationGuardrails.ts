/**
 * ConversationGuardrails
 *
 * Protection layer for AI product suggestions. Does NOT touch the existing
 * upsell system — only adds filters and tracking on top of it.
 *
 * Responsibilities:
 *   - Track which productIds have already been suggested in the conversation
 *     (anti-loop: never re-suggest the same item)
 *   - Dietary/allergy filtering: block items that conflict with customer
 *     restrictions declared in their profile
 *   - Category priority ordering: mains/popular first, desserts last
 */

import { prisma } from "@/lib/prisma";

// ── Category classification ───────────────────────────────────────────────────

const DESSERT_KEYWORDS = [
  "sobremesa", "doce", "sorvete", "torta", "bolo", "brownie",
  "pudim", "mousse", "gelat", "açaí", "milk-shake", "milkshake",
];

const MAIN_KEYWORDS = [
  "prato", "principal", "pizza", "burger", "hamburguer", "pasta",
  "sushi", "bowl", "lanche", "prato feito", "executivo", "grelhad",
  "frango", "carne", "peixe",
];

export function isDessertCategory(categoryName: string): boolean {
  const lower = categoryName.toLowerCase();
  return DESSERT_KEYWORDS.some((kw) => lower.includes(kw));
}

export function isMainCategory(categoryName: string): boolean {
  const lower = categoryName.toLowerCase();
  return MAIN_KEYWORDS.some((kw) => lower.includes(kw));
}

/**
 * Sorts upsell suggestion candidates so that:
 *   1. Main/popular categories come first
 *   2. Dessert categories come last
 * Everything else stays in its original position.
 */
export function sortByCategory<T extends { categoryName: string }>(items: T[]): T[] {
  return [...items].sort((a, b) => {
    const aMain    = isMainCategory(a.categoryName)    ? -1 : 0;
    const bMain    = isMainCategory(b.categoryName)    ? -1 : 0;
    const aDessert = isDessertCategory(a.categoryName) ?  1 : 0;
    const bDessert = isDessertCategory(b.categoryName) ?  1 : 0;
    return (aMain + aDessert) - (bMain + bDessert);
  });
}

// ── Dietary / allergy filtering ───────────────────────────────────────────────

// Maps known restriction labels to ingredient keywords that should be blocked.
// Keys are lowercase — matched case-insensitively against customer preference strings.
const DIETARY_BLOCK_MAP: Record<string, string[]> = {
  vegetariano:       ["carne", "frango", "peixe", "bacon", "presunto", "costela", "boi", "bovino"],
  vegetariana:       ["carne", "frango", "peixe", "bacon", "presunto", "costela", "boi", "bovino"],
  vegano:            ["carne", "frango", "peixe", "bacon", "queijo", "leite", "ovo", "manteiga", "mel"],
  vegana:            ["carne", "frango", "peixe", "bacon", "queijo", "leite", "ovo", "manteiga", "mel"],
  "sem glúten":      ["trigo", "farinha", "pão", "massa", "pizza", "macarrão"],
  "sem lactose":     ["queijo", "leite", "creme", "manteiga", "iogurte", "requeijão"],
  "sem peixe":       ["peixe", "salmão", "atum", "tilápia", "bacalhau"],
  "sem frutos do mar": ["camarão", "lagosta", "mariscos", "fruto do mar", "polvo", "lula"],
  "sem carne":       ["carne", "boi", "bovino", "bacon", "costela", "presunto"],
  halal:             ["porco", "bacon", "presunto", "linguiça"],
};

/**
 * How safe an item is for a customer who declared a restriction.
 *
 * `unknown` is the state that was missing, and its absence was the dietary P1: the
 * filter matched keywords against the item name plus its ingredients, so an item with
 * NO ingredients registered never matched anything — and not matching was read as
 * "safe". A dish named "Risoto do Chef" with an empty ingredient list went straight to
 * a customer who had declared "sem lactose".
 *
 * That is guardrail 1 inverted — absence of information treated as information — and
 * here the cost is not money or reputation. It is the health of whoever ordered.
 */
export type DietarySafety = "safe" | "blocked" | "unknown";

/**
 * Classifies an item against the customer's restrictions.
 *
 * Returns `unknown` when the customer declared a restriction AND the item has no
 * ingredients registered: we cannot prove it conflicts, and we equally cannot prove it
 * is safe. An `unknown` item must never be presented as suitable — it either stays out
 * of the suggestion, or goes out with an explicit "preciso confirmar".
 */
export function classifyDietarySafety(
  itemName:     string,
  ingredients:  string | null | undefined,
  dietary:      string[],
  allergies:    string[],
): DietarySafety {
  const restrictions = [...dietary, ...allergies].filter((r) => r && r.trim());
  // Nothing declared → nothing to prove.
  if (restrictions.length === 0) return "safe";

  const text = `${itemName} ${ingredients ?? ""}`.toLowerCase();

  for (const restriction of restrictions) {
    const lower = restriction.toLowerCase().trim();

    // Direct match: restriction term appears literally in the item text
    if (text.includes(lower)) return "blocked";

    // Mapped blockers: restriction maps to specific ingredient keywords
    const blockers = DIETARY_BLOCK_MAP[lower] ?? [];
    if (blockers.some((b) => text.includes(b))) return "blocked";
  }

  // Nothing matched — but that only means "safe" if there was something to read.
  const hasIngredients = !!ingredients && ingredients.trim().length > 0;
  return hasIngredients ? "safe" : "unknown";
}

/**
 * Returns true if an item must NOT be offered to this customer.
 *
 * Both `blocked` and `unknown` exclude it. Staying quiet about a dish is recoverable;
 * a wrong reassurance to someone with an allergy is not — so when the two are in
 * tension, silence wins.
 */
export function isBlockedByDietary(
  itemName:     string,
  ingredients:  string | null | undefined,
  dietary:      string[],
  allergies:    string[],
): boolean {
  return classifyDietarySafety(itemName, ingredients, dietary, allergies) !== "safe";
}

// ── Already-suggested product tracking ───────────────────────────────────────

/**
 * Returns the set of menuItemIds that the AI has already called
 * suggest_upsell for in this conversation (across all prior turns).
 * Prevents the same product from being pitched twice.
 */
export async function getAlreadySuggestedIds(conversationId: string): Promise<Set<string>> {
  const logs = await prisma.aIInteractionLog.findMany({
    where:   { conversationId },
    select:  { toolCalls: true },
    orderBy: { createdAt: "asc" },
  });

  const suggested = new Set<string>();

  for (const log of logs) {
    if (!Array.isArray(log.toolCalls)) continue;
    for (const call of log.toolCalls as Array<{ name: string; args?: unknown }>) {
      if (call.name === "suggest_upsell" && call.args && typeof call.args === "object") {
        const args = call.args as Record<string, unknown>;
        if (typeof args.menuItemId === "string") {
          suggested.add(args.menuItemId);
        }
      }
    }
  }

  return suggested;
}

export interface SuggestedItem {
  id:   string;
  name: string;
}

/**
 * Same as getAlreadySuggestedIds but enriched with product names from the
 * menu catalog, so the AI can match items to conversation context by name.
 */
export async function getAlreadySuggestedItems(
  conversationId: string,
): Promise<SuggestedItem[]> {
  const ids = await getAlreadySuggestedIds(conversationId);
  if (ids.size === 0) return [];
  const rows = await prisma.menuItem.findMany({
    where:  { id: { in: [...ids] } },
    select: { id: true, name: true },
  });
  return rows;
}

// ── Drink attempt tracking ────────────────────────────────────────────────────

/**
 * Returns the number of distinct drink items suggested via suggest_upsell
 * in prior turns of this conversation (does not include the current turn).
 * A "drink" is any item whose category is neither a main dish nor a dessert.
 */
export async function getDrinkAttemptCount(conversationId: string): Promise<number> {
  const logs = await prisma.aIInteractionLog.findMany({
    where:  { conversationId },
    select: { toolCalls: true },
    orderBy: { createdAt: "asc" },
  });

  const suggestedIds = new Set<string>();
  for (const log of logs) {
    if (!Array.isArray(log.toolCalls)) continue;
    for (const call of log.toolCalls as Array<{ name: string; args?: unknown }>) {
      if (call.name === "suggest_upsell" && call.args && typeof call.args === "object") {
        const args = call.args as Record<string, unknown>;
        if (typeof args.menuItemId === "string") suggestedIds.add(args.menuItemId);
      }
    }
  }

  if (suggestedIds.size === 0) return 0;

  const items = await prisma.menuItem.findMany({
    where:  { id: { in: [...suggestedIds] } },
    select: { id: true, category: { select: { name: true } } },
  });

  return items.filter(
    (item) => !isMainCategory(item.category.name) && !isDessertCategory(item.category.name),
  ).length;
}
