/**
 * Menu "Mais vendidos" — dynamic best-sellers for the public menu (/pedido, /qr).
 *
 * Single source of truth so the public menu's "Mais vendidos" category reflects
 * REAL sales, consistent with Analytics. Before this module each menu page ran its
 * own inline 7-day aggregation that diverged from Analytics (different period, sort
 * and status filter), so the category never matched the owner's bestsellers.
 *
 * Convention (matches AnalyticsService's "valid sale" definition):
 *   - only operational/completed orders: CONFIRMED, PREPARING, READY,
 *     OUT_FOR_DELIVERY, DELIVERED (excludes PENDING / AWAITING_PAYMENT / CANCELLED).
 *   - Foocci real orders only by default — imported history (importedAt IS NOT NULL)
 *     is excluded, so the menu reflects what customers actually order here.
 *   - period: last 30 days by default (configurable).
 *   - ranked by units sold (quantity) desc, revenue desc as tie-breaker.
 *
 * Availability/deleted exclusion is applied by the caller via `rankBestSellers`
 * against the set of items actually present & orderable in the rendered menu —
 * deleted/archived/unavailable products are never in that set, so they drop out.
 *
 * Cached in-memory per restaurant (short TTL) so a menu load never re-aggregates
 * on every request; `invalidateMenuBestSellers` clears it (e.g. admin refresh).
 */

import { prisma } from "@/lib/prisma";

export const MENU_BESTSELLER_PERIOD_DAYS = 30;
export const MENU_BESTSELLER_LIMIT       = 10;
/** Minimum products-with-sales for the category to show; below this it is hidden. */
export const MENU_BESTSELLER_MIN_PRODUCTS = 1;

const CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes — "reasonably current"

export interface BestSellerRow {
  menuItemId: string;
  qty:        number; // total units sold in the period
  revenue:    number; // gross revenue (tie-breaker)
}

type RawBigint = bigint | number | string | null;
const toNum = (v: RawBigint): number => (v == null ? 0 : Number(typeof v === "bigint" ? v.toString() : v));

const cache = new Map<string, { at: number; periodDays: number; rows: BestSellerRow[] }>();

/**
 * Raw best-seller rows for a restaurant (cached), ordered qty desc / revenue desc.
 * Returns an empty array on any error so the menu degrades gracefully (no category).
 */
export async function getMenuBestSellerRows(
  restaurantId: string,
  periodDays: number = MENU_BESTSELLER_PERIOD_DAYS,
): Promise<BestSellerRow[]> {
  const cached = cache.get(restaurantId);
  if (cached && cached.periodDays === periodDays && Date.now() - cached.at < CACHE_TTL_MS) {
    return cached.rows;
  }

  const from = new Date(Date.now() - periodDays * 86_400_000);

  try {
    const raw = await prisma.$queryRaw<Array<{ menu_item_id: string; qty: RawBigint; revenue: string }>>`
      SELECT
        oi."menuItemId"                  AS menu_item_id,
        COALESCE(SUM(oi.quantity), 0)    AS qty,
        COALESCE(SUM(oi.total), 0)::text AS revenue
      FROM order_items oi
      JOIN orders o ON o.id = oi."orderId"
      WHERE o."restaurantId" = ${restaurantId}
        AND oi."menuItemId" IS NOT NULL
        AND o.status IN ('CONFIRMED','PREPARING','READY','OUT_FOR_DELIVERY','DELIVERED')
        AND o."importedAt" IS NULL
        AND o."createdAt" >= ${from}
      GROUP BY oi."menuItemId"
      ORDER BY SUM(oi.quantity) DESC NULLS LAST, SUM(oi.total) DESC NULLS LAST
      LIMIT 50
    `;

    const rows: BestSellerRow[] = raw
      .filter((r) => r.menu_item_id)
      .map((r) => ({ menuItemId: r.menu_item_id, qty: toNum(r.qty), revenue: toNum(r.revenue) }));

    cache.set(restaurantId, { at: Date.now(), periodDays, rows });
    return rows;
  } catch (err) {
    console.error("[menuBestSellers] aggregation failed", { restaurantId, err });
    return [];
  }
}

/**
 * Pure ranking + safety filter applied to raw rows for a SPECIFIC rendered menu.
 * Keeps only products that are present & orderable in `availableItemIds` (so
 * deleted/archived/unavailable products never appear), drops zero-sales rows,
 * orders by quantity desc then revenue desc, and caps to `limit`.
 */
export function rankBestSellers(
  rows: BestSellerRow[],
  availableItemIds: ReadonlySet<string>,
  limit: number = MENU_BESTSELLER_LIMIT,
): BestSellerRow[] {
  return rows
    .filter((r) => r.qty > 0 && availableItemIds.has(r.menuItemId))
    .sort((a, b) => b.qty - a.qty || b.revenue - a.revenue)
    .slice(0, Math.max(0, limit));
}

/** Clears the cached best-sellers (all restaurants, or one). Safe no-op anywhere. */
export function invalidateMenuBestSellers(restaurantId?: string): void {
  if (restaurantId) cache.delete(restaurantId);
  else cache.clear();
}
