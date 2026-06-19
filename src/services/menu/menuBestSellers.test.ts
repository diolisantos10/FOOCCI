/**
 * rankBestSellers — the pure ranking/exclusion core of the dynamic "Mais vendidos"
 * menu category (no DB, no network).
 *
 * Covers:
 *   A. uses product sales rows (qty/revenue)
 *   B. sorted by quantity sold (desc)
 *   C. revenue is the tie-breaker
 *   E. unavailable products are excluded (not in the rendered menu's id set)
 *   F. deleted/archived products are excluded (same mechanism)
 *   G. category is hidden when there are no sales (empty result)
 */

import { describe, it, expect } from "vitest";
import {
  rankBestSellers,
  MENU_BESTSELLER_LIMIT,
  MENU_BESTSELLER_PERIOD_DAYS,
  type BestSellerRow,
} from "@/services/menu/menuBestSellers";

const ALL = (ids: string[]) => new Set(ids);

describe("rankBestSellers", () => {
  it("A/B — ranks products by units sold (quantity), descending", () => {
    const rows: BestSellerRow[] = [
      { menuItemId: "p1", qty: 3,  revenue: 30 },
      { menuItemId: "p2", qty: 10, revenue: 50 },
      { menuItemId: "p3", qty: 7,  revenue: 10 },
    ];
    const ranked = rankBestSellers(rows, ALL(["p1", "p2", "p3"]), 10);
    expect(ranked.map((r) => r.menuItemId)).toEqual(["p2", "p3", "p1"]);
  });

  it("C — breaks quantity ties by revenue (desc)", () => {
    const rows: BestSellerRow[] = [
      { menuItemId: "a", qty: 5, revenue: 40 },
      { menuItemId: "b", qty: 5, revenue: 90 }, // same qty, higher revenue → first
      { menuItemId: "c", qty: 5, revenue: 10 },
    ];
    const ranked = rankBestSellers(rows, ALL(["a", "b", "c"]), 10);
    expect(ranked.map((r) => r.menuItemId)).toEqual(["b", "a", "c"]);
  });

  it("E/F — excludes products not orderable in the rendered menu (unavailable/deleted/archived)", () => {
    const rows: BestSellerRow[] = [
      { menuItemId: "available",   qty: 9, revenue: 90 },
      { menuItemId: "unavailable", qty: 8, revenue: 80 }, // not in the available set
      { menuItemId: "deleted",     qty: 7, revenue: 70 }, // no longer in the menu
    ];
    const ranked = rankBestSellers(rows, ALL(["available"]), 10);
    expect(ranked.map((r) => r.menuItemId)).toEqual(["available"]);
  });

  it("drops zero-sales rows and caps to the limit", () => {
    const rows: BestSellerRow[] = [
      { menuItemId: "z", qty: 0, revenue: 0 },  // no sales → excluded
      ...Array.from({ length: 12 }, (_, i) => ({ menuItemId: `p${i}`, qty: 12 - i, revenue: 0 })),
    ];
    const ranked = rankBestSellers(rows, ALL(["z", ...Array.from({ length: 12 }, (_, i) => `p${i}`)]), 10);
    expect(ranked).toHaveLength(10);
    expect(ranked.some((r) => r.menuItemId === "z")).toBe(false);
    expect(ranked[0]?.menuItemId).toBe("p0"); // highest qty first
  });

  it("G — yields an empty list when there are no sales (category hidden)", () => {
    expect(rankBestSellers([], ALL(["p1"]), 10)).toEqual([]);
    expect(rankBestSellers([{ menuItemId: "p1", qty: 0, revenue: 0 }], ALL(["p1"]), 10)).toEqual([]);
  });

  it("exposes the documented defaults (30-day period, top 10)", () => {
    expect(MENU_BESTSELLER_PERIOD_DAYS).toBe(30);
    expect(MENU_BESTSELLER_LIMIT).toBe(10);
  });
});
