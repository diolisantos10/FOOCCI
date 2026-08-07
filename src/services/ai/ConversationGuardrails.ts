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
//
// A régua mudou de casa em 07/08/2026 e virou módulo PURO
// (`./waiter/dietarySafety`). Motivo, em uma frase: este arquivo importa
// `prisma`, então as suítes do Garçom mockavam ele inteiro — e um mock que
// exporta duas funções e omite `classifyDietarySafety` não quebra o build,
// apenas devolve `undefined` e apaga a regra de segurança em silêncio.
//
// A reexportação abaixo existe para que nenhum consumidor antigo precise mudar
// de import. Um dono, vários consumidores — nunca duas cópias da mesma régua.

export {
  DIETARY_BLOCK_MAP,
  classifyDietarySafety,
  isBlockedByDietary,
  type DietarySafety,
} from "./waiter/dietarySafety";

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
