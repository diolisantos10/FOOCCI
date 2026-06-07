/**
 * P0 — Waiter card policy.
 *
 * Proves the Foocci rule: when the customer asks for options/a category, the
 * Waiter shows ALL relevant available cards (organized, not hidden), ordered by
 * best sellers first when sales data exists, with a deterministic fallback when
 * it does not. Consultative recommendation stays concise; passive upsell stays
 * a small subset. No hallucinated / unavailable products.
 */

import { describe, it, expect } from "vitest";
import {
  decide,
  bestSellerScore,
  byBestSeller,
  type V2CatalogItem,
} from "../WaiterBrainV2";
import { applyBestSellers, type BestSellerMap } from "../waiter/bestSellers";

// ── Catalog with a large Hot Roll family + real sales counts ──────────────────
// 8 hot rolls (> the old 6-card cap) so a cap would be detectable; salesCounts are
// deliberately unsorted so best-seller ordering is observable.
const HOT_ROLLS: V2CatalogItem[] = [
  { id: "hr-fila",   name: "Hot Roll Filadélfia", categoryName: "Hot Roll", price: 32, sortOrder: 1, salesCount: 5  },
  { id: "hr-salmao", name: "Hot Roll Salmão",     categoryName: "Hot Roll", price: 34, sortOrder: 2, salesCount: 50 },
  { id: "hr-frango", name: "Hot Roll Frango",     categoryName: "Hot Roll", price: 30, sortOrder: 3, salesCount: 10 },
  { id: "hr-carne",  name: "Hot Roll Carne",      categoryName: "Hot Roll", price: 33, sortOrder: 4, salesCount: 3  },
  { id: "hr-camarao",name: "Hot Roll Camarão",    categoryName: "Hot Roll", price: 38, sortOrder: 5, salesCount: 99 },
  { id: "hr-veg",    name: "Hot Roll Vegetariano",categoryName: "Hot Roll", price: 28, sortOrder: 6, salesCount: 1  },
  { id: "hr-cream",  name: "Hot Roll Cream",      categoryName: "Hot Roll", price: 31, sortOrder: 7, salesCount: 20 },
  { id: "hr-spicy",  name: "Hot Roll Spicy",      categoryName: "Hot Roll", price: 35, sortOrder: 8, salesCount: 7  },
];

const OTHERS: V2CatalogItem[] = [
  { id: "coca",   name: "Coca-Cola",    categoryName: "Bebidas",    price: 8,  sortOrder: 20, salesCount: 40 },
  { id: "suco",   name: "Suco Natural", categoryName: "Bebidas",    price: 12, sortOrder: 21, salesCount: 12 },
  { id: "gateau", name: "Petit Gateau", categoryName: "Sobremesas", price: 24, sortOrder: 22, salesCount: 30 },
  { id: "mochi",  name: "Mochi",        categoryName: "Sobremesas", price: 18, sortOrder: 23, salesCount: 9  },
  { id: "edamame",name: "Edamame",      categoryName: "Entradas",   price: 18, sortOrder: 24, salesCount: 4  },
];

const CATALOG: V2CatalogItem[] = [...HOT_ROLLS, ...OTHERS];

const base = { event: "ON_USER_MESSAGE" as const, cartItemIds: [], cartValue: 0, catalog: CATALOG };

// helper: salesCount of a returned card id
const sc = (id: string) => CATALOG.find((i) => i.id === id)?.salesCount ?? 0;

describe("P0 card policy — category/options shows ALL available cards", () => {
  it("'tem hot roll?' returns ALL 8 hot rolls (no 5/6-card cap)", () => {
    const out = decide({ ...base, message: "tem hot roll?" });
    const hotRollCards = out.cards.filter((id) => id.startsWith("hr-"));
    expect(hotRollCards).toHaveLength(HOT_ROLLS.length); // all 8, not 5 or 6
    expect(out.cards.length).toBeGreaterThan(6);
  });

  it("'quais hot rolls vocês têm?' returns the full hot roll family", () => {
    const out = decide({ ...base, message: "quais hot rolls vocês têm?" });
    for (const hr of HOT_ROLLS) expect(out.cards).toContain(hr.id);
  });

  it("hot roll cards are ordered by best sellers first (salesCount desc)", () => {
    const out = decide({ ...base, message: "tem hot roll?" });
    const counts = out.cards.filter((id) => id.startsWith("hr-")).map(sc);
    // First card is the top seller (Camarão = 99)
    expect(out.cards[0]).toBe("hr-camarao");
    // Non-increasing by salesCount
    for (let i = 1; i < counts.length; i++) {
      expect(counts[i - 1]).toBeGreaterThanOrEqual(counts[i]!);
    }
  });

  it("never returns an ID outside the catalog (no hallucination)", () => {
    const ids = new Set(CATALOG.map((i) => i.id));
    for (const msg of ["tem hot roll?", "me mostra as sobremesas", "tem bebida?", "me sugere algo"]) {
      const out = decide({ ...base, message: msg });
      for (const id of out.cards) expect(ids.has(id)).toBe(true);
    }
  });
});

describe("P0 card policy — consultative recommendation stays concise", () => {
  it("'me sugere algo' returns a fuller ordered set (8–12), not the full menu", () => {
    const out = decide({ ...base, message: "me sugere algo" });
    // Broad recommendation policy: show MORE options (8–12) when available…
    expect(out.cards.length).toBeGreaterThanOrEqual(8);
    expect(out.cards.length).toBeLessThanOrEqual(12);
    // …but never the entire menu (cards are still curated/ordered).
    expect(out.cards.length).toBeLessThan(CATALOG.length);
  });
});

describe("P0 card policy — best-seller ordering with NO sales data is deterministic", () => {
  it("falls back to sortOrder then name when no sales metrics exist", () => {
    const noSales: V2CatalogItem[] = HOT_ROLLS.map(({ salesCount, ...rest }) => rest);
    const out = decide({ event: "ON_USER_MESSAGE", cartItemIds: [], cartValue: 0, catalog: noSales, message: "tem hot roll?" });
    const shown = out.cards.filter((id) => id.startsWith("hr-"));
    // Deterministic: ascending sortOrder (hr-fila=1 … hr-spicy=8)
    const expected = [...noSales].sort((a, b) => (a.sortOrder ?? 999) - (b.sortOrder ?? 999)).map((i) => i.id);
    expect(shown).toEqual(expected);
  });
});

describe("best-seller helpers", () => {
  it("bestSellerScore prefers salesCount > popularityScore > isBestSeller > 0", () => {
    expect(bestSellerScore({ id: "a", name: "A", categoryName: "C", price: 1, salesCount: 12 })).toBe(12);
    expect(bestSellerScore({ id: "b", name: "B", categoryName: "C", price: 1, popularityScore: 0.7 })).toBe(0.7);
    expect(bestSellerScore({ id: "c", name: "C", categoryName: "C", price: 1, isBestSeller: true })).toBe(0.5);
    expect(bestSellerScore({ id: "d", name: "D", categoryName: "C", price: 1 })).toBe(0);
    expect(bestSellerScore(null)).toBe(0);
  });

  it("byBestSeller orders most-sold first, then strategic priority, then sortOrder", () => {
    const sorted = [...HOT_ROLLS].sort(byBestSeller).map((i) => i.id);
    expect(sorted[0]).toBe("hr-camarao"); // 99
    expect(sorted[1]).toBe("hr-salmao");  // 50
    expect(sorted[2]).toBe("hr-cream");   // 20
  });

  it("applyBestSellers flags top-quartile sellers and writes salesCount", () => {
    const catalog: V2CatalogItem[] = [
      { id: "x1", name: "X1", categoryName: "C", price: 1 },
      { id: "x2", name: "X2", categoryName: "C", price: 1 },
      { id: "x3", name: "X3", categoryName: "C", price: 1 },
    ];
    const map: BestSellerMap = new Map([
      ["x1", { qty: 100, orderCount: 80, revenue: 1000 }],
      ["x2", { qty: 5,   orderCount: 5,  revenue: 50 }],
    ]);
    applyBestSellers(catalog, map);
    expect(catalog.find((i) => i.id === "x1")!.salesCount).toBe(100);
    expect(catalog.find((i) => i.id === "x1")!.isBestSeller).toBe(true);
    expect(catalog.find((i) => i.id === "x3")!.salesCount ?? null).toBeNull(); // untouched (no data)
  });

  it("applyBestSellers is a no-op when the map is empty (graceful fallback)", () => {
    const catalog: V2CatalogItem[] = [{ id: "y1", name: "Y1", categoryName: "C", price: 1 }];
    applyBestSellers(catalog, new Map());
    expect(catalog[0]!.salesCount ?? null).toBeNull();
  });
});
