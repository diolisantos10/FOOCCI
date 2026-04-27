/**
 * UpsellEngine
 *
 * Suggests complementary menu items based on what's already in the cart.
 *
 * Strategy (no ML required — pure DB logic):
 *   1. Identify categories represented in the current cart.
 *   2. Find active categories NOT yet represented.
 *   3. From each unrepresented category, pick the highest-price active item
 *      (higher-margin items first).
 *   4. Return up to MAX_SUGGESTIONS items, skipping items already in cart.
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

export class UpsellEngine {
  /**
   * Compute upsell suggestions for the current cart state.
   * Returns an empty array if the cart is empty or no suggestions exist.
   *
   * Guardrail parameters (PART 1–3):
   * @param excludeIds     - Product IDs already suggested in this conversation (anti-loop)
   * @param customerDietary  - Customer dietary restrictions (blocks conflicting items)
   * @param customerAllergies - Customer allergies (blocks conflicting items)
   *
   * Category ordering: main/popular categories first, desserts last.
   */
  static async suggest(
    restaurantId: string,
    draftId: string | null,
    salesPriority: SalesPriority = "bestsellers",
    excludeIds: Set<string> = new Set(),
    customerDietary: string[] = [],
    customerAllergies: string[] = [],
  ): Promise<UpsellSuggestion[]> {
    if (!draftId) return [];

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

    if (!draft || draft.items.length === 0) return [];

    // Categories already in cart
    const cartCategoryIds = new Set(
      draft.items.map((item) => item.menuItem?.categoryId).filter((id): id is string => !!id)
    );
    // Items already in cart
    const cartItemIds = new Set(draft.items.map((item) => item.menuItemId).filter((id): id is string => id !== null));

    // Item ordering based on sales priority
    const itemOrderBy =
      salesPriority === "high_margin"
        ? { price: "desc" as const }
        : salesPriority === "promotions"
        ? { price: "asc" as const }
        : { sortOrder: "asc" as const }; // bestsellers — follow manual sort order

    // Merge cart items + already-suggested IDs into one exclusion set
    const allExcludedIds = new Set([...cartItemIds, ...excludeIds]);

    // Find all other active categories for this restaurant
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
          take: 5, // fetch a few candidates so we can apply dietary filter
          select: { id: true, name: true, price: true, ingredients: true },
        },
      },
    });

    const raw: UpsellSuggestion[] = [];

    for (const category of otherCategories) {
      if (raw.length >= MAX_SUGGESTIONS) break;

      // Pick first item from this category that passes dietary filter
      const topItem = category.items.find(
        (item) => !isBlockedByDietary(item.name, item.ingredients, customerDietary, customerAllergies),
      );
      if (!topItem) continue;

      raw.push({
        menuItemId: topItem.id,
        name:       topItem.name,
        price:      Number(topItem.price),
        categoryName: category.name,
        reason: `Complementa bem os itens do pedido (${category.name})`,
      });
    }

    // Category ordering: main/popular first, desserts last (PART 3)
    const suggestions = raw.sort((a, b) => {
      const score = (s: UpsellSuggestion) =>
        isMainCategory(s.categoryName) ? -1 : isDessertCategory(s.categoryName) ? 1 : 0;
      return score(a) - score(b);
    });

    return suggestions;
  }
}
