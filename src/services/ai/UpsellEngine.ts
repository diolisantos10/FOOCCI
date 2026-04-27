/**
 * UpsellEngine
 *
 * Suggests complementary menu items based on what's already in the cart,
 * with goal-driven + sales-signal selection (Phase 2 + 3).
 *
 * Selection priority (per candidate within each unrepresented category):
 *   1. Gap fit      — how well the item's price fills valueGap / itemGap (weight 0.60)
 *   2. Popularity   — order count in the last 30 days (weight 0.30)
 *   3. Margin proxy — item price relative to peers (weight 0.10)
 *
 * When both gaps are met: popularity (0.60) + margin (0.40) — no gap component.
 * When popularity data is unavailable: scores degrade gracefully to pure gap logic.
 *
 * All existing guardrails are preserved:
 *   - excludeIds anti-loop
 *   - dietary / allergy filtering
 *   - single suggestion per response (enforced in AITools)
 *   - category ordering: mains first, desserts last
 */

import { prisma } from "@/lib/prisma";
import type { SalesPriority } from "@/validators/brand-config";
import { isBlockedByDietary, isDessertCategory, isMainCategory } from "./ConversationGuardrails";

const MAX_SUGGESTIONS = 3;
const POPULARITY_WINDOW_DAYS = 30;

export interface UpsellSuggestion {
  menuItemId: string;
  name: string;
  price: number;
  categoryName: string;
  reason: string;
}

export interface UpsellResult {
  suggestions: UpsellSuggestion[];
  cartValue: number;
  cartItemCount: number;
  valueGap: number;
  itemGap: number;
}

const EMPTY_RESULT: UpsellResult = {
  suggestions: [], cartValue: 0, cartItemCount: 0, valueGap: 0, itemGap: 0,
};

export class UpsellEngine {
  /**
   * Compute goal-driven + sales-signal upsell suggestions for the current cart.
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

    // ── DB query ordering (pre-filter before signal scoring) ─
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

    // ── Popularity signal (batch, 30-day window) ─────────────
    const allCandidateIds = otherCategories.flatMap((cat) => cat.items.map((item) => item.id));
    const popularityMap = await fetchPopularityMap(allCandidateIds, restaurantId);

    // ── Build suggestions ────────────────────────────────────
    const raw: UpsellSuggestion[] = [];

    for (const category of otherCategories) {
      if (raw.length >= MAX_SUGGESTIONS) break;

      const candidates = category.items.filter(
        (item) => !isBlockedByDietary(item.name, item.ingredients, customerDietary, customerAllergies),
      );
      const topItem = selectBySignal(candidates, popularityMap, valueGap, itemGap);
      if (!topItem) continue;

      const orderCount = popularityMap.get(topItem.id) ?? 0;
      raw.push({
        menuItemId:   topItem.id,
        name:         topItem.name,
        price:        Number(topItem.price),
        categoryName: category.name,
        reason:       buildReason(category.name, Number(topItem.price), valueGap, itemGap, orderCount),
      });
    }

    // Category ordering: mains first, desserts last
    const suggestions = raw.sort((a, b) => {
      const score = (s: UpsellSuggestion) =>
        isMainCategory(s.categoryName) ? -1 : isDessertCategory(s.categoryName) ? 1 : 0;
      return score(a) - score(b);
    });

    return { suggestions, cartValue, cartItemCount, valueGap, itemGap };
  }
}

// ── Popularity fetch (PART 1) ─────────────────────────────────

async function fetchPopularityMap(
  candidateIds: string[],
  restaurantId: string,
): Promise<Map<string, number>> {
  if (candidateIds.length === 0) return new Map();

  const since = new Date(Date.now() - POPULARITY_WINDOW_DAYS * 24 * 60 * 60 * 1000);

  try {
    const counts = await prisma.orderItem.groupBy({
      by: ["menuItemId"],
      where: {
        menuItemId: { in: candidateIds },
        order: {
          restaurantId,
          createdAt: { gte: since },
        },
      },
      _count: { menuItemId: true },
    });

    return new Map(
      counts
        .filter((r): r is typeof r & { menuItemId: string } => r.menuItemId !== null)
        .map((r) => [r.menuItemId, r._count.menuItemId])
    );
  } catch {
    // PART 3 — Fallback: return empty map so scoring degrades to gap-only
    return new Map();
  }
}

// ── Signal-aware item selection (PART 2) ─────────────────────

type Candidate = { id: string; name: string; price: { toString(): string }; ingredients: string | null };

/**
 * Score each candidate by gap fit (primary) + popularity (secondary) + margin proxy.
 *
 * Weights when gaps are open:  gap=0.60, popularity=0.30, margin=0.10
 * Weights when goals are met:  popularity=0.60, margin=0.40
 *
 * All components are normalized to 0–1 before weighting, so a product
 * with no order history simply scores 0 on the popularity component —
 * it doesn't break the ranking, it just doesn't get the bonus.
 */
function selectBySignal(
  candidates: Candidate[],
  popularityMap: Map<string, number>,
  valueGap: number,
  itemGap: number,
): Candidate | undefined {
  if (candidates.length === 0) return undefined;
  if (candidates.length === 1) return candidates[0]!;

  const noGap = valueGap === 0 && itemGap === 0;

  const priced = candidates.map((c) => ({
    c,
    price:      Number(c.price),
    orderCount: popularityMap.get(c.id) ?? 0,
  }));

  const maxPrice = Math.max(...priced.map((p) => p.price), 0.01);
  const maxCount = Math.max(...priced.map((p) => p.orderCount), 1);

  const scored = priced.map(({ c, price, orderCount }) => {
    const popularity = orderCount / maxCount;  // 0-1
    const margin     = price / maxPrice;       // 0-1 (price proxy)

    let score: number;

    if (noGap) {
      score = popularity * 0.6 + margin * 0.4;
    } else {
      let gapScore = 0;
      const gapComponents = (valueGap > 0 ? 1 : 0) + (itemGap > 0 ? 1 : 0);

      if (valueGap > 0) {
        // Peaks at 1 when price exactly matches the gap; decreases symmetrically
        gapScore += Math.min(price, valueGap) / Math.max(price, valueGap, 0.01);
      }
      if (itemGap > 0) {
        // Cheaper items score higher when adding more items is the goal
        gapScore += 1 - price / maxPrice;
      }

      const normalizedGap = gapComponents > 0 ? gapScore / gapComponents : 0;
      score = normalizedGap * 0.6 + popularity * 0.3 + margin * 0.1;
    }

    return { c, score };
  });

  scored.sort((a, b) => b.score - a.score);
  return scored[0]!.c;
}

// ── Reason text (PART 1 signal exposure to AI) ───────────────

function buildReason(
  categoryName: string,
  price: number,
  valueGap: number,
  itemGap: number,
  orderCount: number,
): string {
  const popularLabel = orderCount > 10 ? "muito pedido"
    : orderCount > 0                   ? "popular"
    : null;

  if (valueGap > 0 && price <= valueGap) {
    return popularLabel
      ? `${popularLabel} — contribui para a meta de ticket (${categoryName})`
      : `Contribui R$ ${price.toFixed(2)} para a meta de ticket (${categoryName})`;
  }
  if (itemGap > 0) {
    return popularLabel
      ? `${popularLabel} — complemento ideal para fechar o pedido (${categoryName})`
      : `Complemento ideal para adicionar mais um item ao pedido (${categoryName})`;
  }
  return popularLabel
    ? `${popularLabel} — complementa bem o pedido (${categoryName})`
    : `Complementa bem os itens do pedido (${categoryName})`;
}
