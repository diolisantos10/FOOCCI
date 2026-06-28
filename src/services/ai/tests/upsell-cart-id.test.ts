/**
 * Regression: checkout upsell skipped for variant/customized/upsell cart lines.
 *
 * Those lines carry a suffixed id (`${id}_${variantId}`, `${id}_c<uid>`,
 * `${id}__upsell`) that doesn't match the catalog, so `analyzeCart().hasFood`
 * read false and `handleCheckoutStarted` skipped the refrigerante → sobremesa →
 * extras offer. The fix normalizes cart lines to their `baseItemId`.
 */

import { vi, describe, it, expect } from "vitest";

// WaiterBrainV2 only consumes isDessertCategory from ConversationGuardrails (which
// pulls prisma) — mock it so this stays a pure unit test.
vi.mock("../ConversationGuardrails", () => ({
  isDessertCategory: (name: string) =>
    /sobremesa|doce|sorvete|torta|bolo|brownie|pudim|brigadeiro|dessert|sweet/i.test(name),
}));

import { decide, analyzeCart, createWaiterMemory, type V2CatalogItem } from "../WaiterBrainV2";
import { cartLineBaseIds } from "../cartNormalization";

function catalog(): V2CatalogItem[] {
  return [
    { id: "b1", name: "Smash Clássico",   categoryName: "Burgers",    price: 32, sortOrder: 1 },
    { id: "b2", name: "Bacon Duplo",      categoryName: "Burgers",    price: 42, sortOrder: 2 },
    { id: "d1", name: "Coca-Cola Lata",   categoryName: "Bebidas",    price: 8,  sortOrder: 3 },
    { id: "s1", name: "Pudim",            categoryName: "Sobremesas", price: 12, sortOrder: 4 },
  ];
}

function checkout(cartItemIds: string[]) {
  return decide({
    event:       "ON_CHECKOUT_STARTED",
    cartItemIds,
    cartValue:   32,
    catalog:     catalog(),
    message:     "",
    memory:      createWaiterMemory(),
  });
}

describe("cartLineBaseIds", () => {
  it("normalizes variant/customized/upsell suffixes to the base product id", () => {
    expect(cartLineBaseIds([
      { id: "b1" },                              // plain
      { id: "b1_v9",     baseItemId: "b1" },     // variant
      { id: "b2_cABC12", baseItemId: "b2" },     // customized
      { id: "d1__upsell", baseItemId: "d1" },    // upsell
    ])).toEqual(["b1", "b1", "b2", "d1"]);
  });

  it("falls back to id when baseItemId is absent", () => {
    expect(cartLineBaseIds([{ id: "b1" }, { name: "x" } as { id?: string }])).toEqual(["b1"]);
  });
});

describe("checkout upsell vs cart id shape", () => {
  it("BUG: a suffixed (customized) cart id is not recognized as food", () => {
    expect(analyzeCart(["b1"], catalog()).hasFood).toBe(true);
    expect(analyzeCart(["b1_cABC12"], catalog()).hasFood).toBe(false); // the bug
  });

  it("offers the drink upsell when the cart id matches the catalog (base id)", () => {
    const out = checkout(["b1"]);
    expect(out.cards.length).toBeGreaterThan(0);
    expect(out.cards).toContain("d1");
    expect(out.memoryPatch?.checkoutUpsellStage).toBe("drink_shown");
  });

  it("REPRO: a raw suffixed id skips the whole upsell (goes straight to done)", () => {
    const out = checkout(["b1_cABC12"]);
    expect(out.cards.length).toBe(0);
    expect(out.memoryPatch?.checkoutUpsellStage).toBe("completed");
  });

  it("FIX: normalizing the suffixed line restores the drink upsell", () => {
    const ids = cartLineBaseIds([{ id: "b1_cABC12", baseItemId: "b1" }]);
    const out = checkout(ids);
    expect(out.cards).toContain("d1");
    expect(out.memoryPatch?.checkoutUpsellStage).toBe("drink_shown");
  });
});
