/**
 * Waiter best-seller data source.
 *
 * Returns a restaurant-scoped map of `menuItemId → sales metrics`, used by the
 * /pedido chat route to enrich the V2 catalog so WaiterBrainV2 can order product
 * cards by most-sold first.
 *
 * Sales convention mirrors AnalyticsService.getTopProducts:
 *   - counts only valid operational/completed orders
 *     (CONFIRMED, PREPARING, READY, OUT_FOR_DELIVERY, DELIVERED)
 *   - excludes PENDING / CANCELLED / failed-unpaid orders
 *   - uses COALESCE(importedAt, createdAt) for the time window so imported
 *     history counts too
 *
 * Cached in-memory per restaurant with a short TTL so it does NOT run a fresh
 * aggregation on every chat message. Pure read — no writes, no side effects.
 */

import { prisma } from "@/lib/prisma";

export interface BestSellerEntry {
  qty:        number; // total units sold
  orderCount: number; // distinct orders containing the item
  revenue:    number; // gross revenue
}

export type BestSellerMap = Map<string, BestSellerEntry>;

type RawBigint = bigint | number | string | null;
const toNum = (v: RawBigint | { toString(): string } | null | undefined): number =>
  v == null ? 0 : Number(typeof v === "bigint" ? v.toString() : v);

const CACHE_TTL_MS  = 10 * 60 * 1000; // 10 minutes
const LOOKBACK_DAYS = 365;            // all-time-ish window (1 year) keeps it cheap + relevant

const cache = new Map<string, { at: number; map: BestSellerMap }>();

/**
 * Returns the best-seller map for a restaurant (cached). On any error returns an
 * empty map so callers degrade gracefully to the deterministic fallback ordering.
 */
export async function getBestSellerMap(
  restaurantId: string,
  lookbackDays: number = LOOKBACK_DAYS,
): Promise<BestSellerMap> {
  const cached = cache.get(restaurantId);
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) return cached.map;

  const from = new Date(Date.now() - lookbackDays * 86_400_000);

  try {
    const rows = await prisma.$queryRaw<Array<{
      menu_item_id: string;
      qty:          RawBigint;
      order_count:  RawBigint;
      revenue:      string;
    }>>`
      SELECT
        oi."menuItemId"                  AS menu_item_id,
        COALESCE(SUM(oi.quantity), 0)    AS qty,
        COUNT(DISTINCT oi."orderId")     AS order_count,
        COALESCE(SUM(oi.total), 0)::text AS revenue
      FROM order_items oi
      JOIN orders o ON o.id = oi."orderId"
      WHERE o."restaurantId" = ${restaurantId}
        AND oi."menuItemId" IS NOT NULL
        AND o.status IN ('CONFIRMED','PREPARING','READY','OUT_FOR_DELIVERY','DELIVERED')
        AND COALESCE(o."importedAt", o."createdAt") >= ${from}
      GROUP BY oi."menuItemId"
    `;

    const map: BestSellerMap = new Map();
    for (const r of rows) {
      if (!r.menu_item_id) continue;
      map.set(r.menu_item_id, {
        qty:        toNum(r.qty),
        orderCount: toNum(r.order_count),
        revenue:    toNum(r.revenue),
      });
    }

    cache.set(restaurantId, { at: Date.now(), map });
    return map;
  } catch (err) {
    console.error("[bestSellers] aggregation failed", { restaurantId, err });
    return new Map();
  }
}

/**
 * Enriches a flat V2 catalog (array of items with `id`, `salesCount`, `isBestSeller`)
 * in place from a best-seller map. Items with no sales data are left untouched so
 * the brain falls back to deterministic sortOrder/name ordering.
 *
 * `isBestSeller` is flagged for items in the top quartile by units sold (qty > 0),
 * giving the brain a coarse "star" signal independent of the raw count.
 */
export function applyBestSellers<T extends { id: string; salesCount?: number | null; isBestSeller?: boolean | null }>(
  catalog: T[],
  map:     BestSellerMap,
): T[] {
  if (map.size === 0) return catalog;

  const soldQtys = [...map.values()].map((e) => e.qty).filter((q) => q > 0).sort((a, b) => b - a);
  // Top-quartile threshold (qty). When few items have sales, every seller is a "best seller".
  const idx          = Math.max(0, Math.floor(soldQtys.length * 0.25) - 1);
  const topThreshold = soldQtys.length > 0 ? (soldQtys[idx] ?? soldQtys[0] ?? 0) : 0;

  for (const item of catalog) {
    const entry = map.get(item.id);
    if (!entry) continue;
    item.salesCount   = entry.qty;
    item.isBestSeller = entry.qty > 0 && entry.qty >= topThreshold;
  }
  return catalog;
}
