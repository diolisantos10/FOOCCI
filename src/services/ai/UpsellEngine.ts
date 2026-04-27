/**
 * UpsellEngine
 *
 * Suggests complementary menu items based on what's already in the cart,
 * now with goal-driven selection (Phase 2).
 *
 * Strategy:
 *   1. Identify categories represented in the current cart.
 *   2. Find active categories NOT yet represented.
 *   3. Compute cart value + item count; derive valueGap and itemGap vs targets.
 *   4. From each unrepresented category, pick the item that best fills the gaps:
 *        - valueGap > 0 → prefer items whose price maximally fills the gap
 *        - itemGap > 0  → prefer lower-price add-ons (easier to add)
 *        - Both active  → balanced scoring
 *   5. Return up to MAX_SUGGESTIONS items + cart context for the system prompt.
 *
 * The AI calls suggest_upsell(menuItemId) with one of these IDs, then
 * crafts a natural message to the customer. If accepted, add_item is called.
 */

import { prisma } from "@/lib/prisma";
import type { SalesPriority } from "@/validators/brand-config";
import { isBlockedByDietary, isDessertCategory, isMainCategory } from "./ConversationGuardrails";

const MAX_SUGGESTIONS = 3;

export interface UpsellSuggestion {
  menuItemId: string;
  name: string;
  price: number;
  categoryName: string;
  reason: string;
}

export interface UpsellResult {
  suggestions: UpsellSuggestion[];
  /** BRL total of items currently in the cart (unitPrice × quantity) */
  cartValue: number;
  /** Total quantity of items across all draft entries */
  cartItemCount: number;
  /** targetTicket − cartValue, clamped to 0 */
  valueGap: number;
  /** targetItems − cartItemCount, clamped to 0 */
  itemGap: number;
}

const EMPTY_RESULT: UpsellResult = {
  suggestions: [], cartValue: 0, cartItemCount: 0, valueGap: 0, itemGap: 0,
};

export class UpsellEngine {
  /**
   * Compute goal-driven upsell suggestions for the current cart state.
   * Returns empty result if cart is empty or no suggestions exist.
   *
   * @param excludeIds        - Product IDs already suggested this conversation (anti-loop)
   * @param customerDietary   - Customer dietary restrictions
   * @param customerAllergies - Customer allergies
   * @param targetTicket      - BRL goal for this order (from SalesProfile)
   * @param targetItems       - Item count goal for this order (from SalesProfile)
   */
  static async suggest(
    restaurantId: string,
    draftId: string | null,
    salesPriority: SalesPriority = "bestsellers",
    excludeIds: Set<string> = new Set(),
    customerDietary: string[] = [],
    customerAllergies: string[] = [],
    targetTicket: number = 80,
    targetItems: number = 3,
  ): Promise<UpsellResult> {
    if (!draftId) return EMPTY_RESULT;

    const draft = await prisma.orderDraft.findUnique({
      where: { id: draftId },
      include: {
        items: {
          include: {
            menuItem: {
              select: { id: true, categoryId: true },
            },
          },
        },
      },
    });

    if (!draft || draft.items.length === 0) return EMPTY_RESULT;

    // ── Cart metrics ─────────────────────────────────────────
    const cartValue = draft.items.reduce(
      (sum, item) => sum + Number(item.unitPrice) * item.quantity, 0
    );
    const cartItemCount = draft.items.reduce((sum, item) => sum + item.quantity, 0);
    const valueGap = Math.max(0, targetTicket - cartValue);
    const itemGap  = Math.max(0, targetItems  - cartItemCount);

    // ── Cart content ─────────────────────────────────────────
    const cartCategoryIds = new Set(
      draft.items.map((item) => item.menuItem?.categoryId).filter((id): id is string => !!id)
    );
    const cartItemIds = new Set(
      draft.items.map((item) => item.menuItemId).filter((id): id is string => id !== null)
    );

    // ── DB query ordering (pre-filter before gap scoring) ────
    const itemOrderBy =
      salesPriority === "high_margin"
        ? { price: "desc" as const }
        : salesPriority === "promotions"
        ? { price: "asc" as const }
        : { sortOrder: "asc" as const };

    const allExcludedIds = new Set([...cartItemIds, ...excludeIds]);

    const otherCategories = await prisma.menuCategory.findMany({
      where: {
        restaurantId,
        isActive: true,
        id: { notIn: Array.from(cartCategoryIds) },
      },
      orderBy: { sortOrder: "asc" },
      include: {
        items: {
          where: { isActive: true, id: { notIn: Array.from(allExcludedIds) } },
          orderBy: itemOrderBy,
          take: 5,
          select: { id: true, name: true, price: true, ingredients: true },
        },
      },
    });

    const raw: UpsellSuggestion[] = [];

    for (const category of otherCategories) {
      if (raw.length >= MAX_SUGGESTIONS) break;

      // Apply dietary filter then pick the best gap-fit item
      const candidates = category.items.filter(
        (item) => !isBlockedByDietary(item.name, item.ingredients, customerDietary, customerAllergies),
      );
      const topItem = selectByGap(candidates, valueGap, itemGap);
      if (!topItem) continue;

      raw.push({
        menuItemId:   topItem.id,
        name:         topItem.name,
        price:        Number(topItem.price),
        categoryName: category.name,
        reason:       buildReason(category.name, Number(topItem.price), valueGap, itemGap),
      });
    }

    // Category ordering: main/popular first, desserts last
    const suggestions = raw.sort((a, b) => {
      const score = (s: UpsellSuggestion) =>
        isMainCategory(s.categoryName) ? -1 : isDessertCategory(s.categoryName) ? 1 : 0;
      return score(a) - score(b);
    });

    return { suggestions, cartValue, cartItemCount, valueGap, itemGap };
  }
}

// ── Gap-aware item selection ──────────────────────────────────

type Candidate = { id: string; name: string; price: { toString(): string }; ingredients: string | null };

/**
 * Score each candidate by how well it closes the current value/item gaps,
 * then return the highest-scoring one.
 *
 * Scoring (both components normalized 0–1, equal weight):
 *   valueGap component: min(price, gap) / max(price, gap)  → peaks at 1 when price == gap
 *   itemGap  component: 1 - price / maxPrice               → cheaper items score higher
 */
function selectByGap(
  candidates: Candidate[],
  valueGap: number,
  itemGap: number,
): Candidate | undefined {
  if (candidates.length === 0) return undefined;
  if (candidates.length === 1) return candidates[0]!;
  if (valueGap === 0 && itemGap === 0) return candidates[0]!;

  const priced = candidates.map((c) => ({ c, price: Number(c.price) }));
  const maxPrice = Math.max(...priced.map((p) => p.price), 0.01);

  const scored = priced.map(({ c, price }) => {
    let score = 0;
    if (valueGap > 0) {
      // 1 when price === gap, decreasing in either direction
      score += Math.min(price, valueGap) / Math.max(price, valueGap, 0.01);
    }
    if (itemGap > 0) {
      // Cheaper items are easier add-ons when the customer needs more items
      score += 1 - price / maxPrice;
    }
    return { c, score };
  });

  scored.sort((a, b) => b.score - a.score);
  return scored[0]!.c;
}

function buildReason(
  categoryName: string,
  price: number,
  valueGap: number,
  itemGap: number,
): string {
  if (valueGap > 0 && price <= valueGap) {
    return `Contribui R$ ${price.toFixed(2)} para a meta de ticket (${categoryName})`;
  }
  if (itemGap > 0) {
    return `Complemento ideal para adicionar mais um item ao pedido (${categoryName})`;
  }
  return `Complementa bem os itens do pedido (${categoryName})`;
}
