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
   */
  static async suggest(
    restaurantId: string,
    draftId: string | null,
    salesPriority: SalesPriority = "bestsellers"
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
    const cartItemIds = new Set(draft.items.map((item) => item.menuItemId));

    // Item ordering based on sales priority
    const itemOrderBy =
      salesPriority === "high_margin"
        ? { price: "desc" as const }
        : salesPriority === "promotions"
        ? { price: "asc" as const }
        : { sortOrder: "asc" as const }; // bestsellers — follow manual sort order

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
          where: { isActive: true, id: { notIn: Array.from(cartItemIds) } },
          orderBy: itemOrderBy,
          take: 1,
          select: { id: true, name: true, price: true },
        },
      },
    });

    const suggestions: UpsellSuggestion[] = [];

    for (const category of otherCategories) {
      if (suggestions.length >= MAX_SUGGESTIONS) break;
      const topItem = category.items[0];
      if (!topItem) continue;

      suggestions.push({
        menuItemId: topItem.id,
        name: topItem.name,
        price: Number(topItem.price),
        categoryName: category.name,
        reason: `Complementa bem os itens do pedido (${category.name})`,
      });
    }

    return suggestions;
  }
}
