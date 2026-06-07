/**
 * WaiterBrainV2 — v1.5 card-quantity + dietary-restriction safety.
 *
 * Pure tests (no DB/AI/network). ConversationGuardrails is mocked to isolate the
 * prisma import (same pattern as the other V2 suites).
 *
 * Covers:
 *  - broad intents surface a fuller set (≤ 12), contextual pairing stays small;
 *  - "sou vegano" never claims "não temos", never surfaces obvious seafood/meat,
 *    is cautious (asks to confirm ingredients), and never hallucinates;
 *  - no-candidate catalog → cautious "não encontrei ... confirmada".
 */

import { vi, describe, it, expect } from "vitest";

vi.mock("../ConversationGuardrails", () => ({
  isDessertCategory: (name: string) =>
    /sobremesa|doce|sorvete|torta|bolo|brownie|pudim|mousse|dessert|sweet/i.test(name),
  isMainCategory: () => true,
}));

import { decide, type V2CatalogItem } from "../WaiterBrainV2";

const base = { event: "ON_USER_MESSAGE" as const, cartItemIds: [], cartValue: 0 };

function catalog(): V2CatalogItem[] {
  return [
    { id: "uramaki",  name: "Uramaki Salmão",        categoryName: "Uramakis",  price: 28, sortOrder: 1 },
    { id: "hotfila",  name: "Hot Roll Filadélfia",   categoryName: "Hot Rolls", price: 30, sortOrder: 2 },
    { id: "hotcam",   name: "Hot Roll Camarão",      categoryName: "Hot Rolls", price: 38, sortOrder: 3 },
    { id: "temaki",   name: "Temaki Salmão",         categoryName: "Temakis",   price: 24, sortOrder: 4 },
    { id: "ceviche",  name: "Ceviche de Peixe",      categoryName: "Entradas",  price: 35, sortOrder: 5 },
    { id: "yakisoba", name: "Yakisoba de Frango",    categoryName: "Quentes",   price: 33, sortOrder: 6 },
    { id: "gyoza",    name: "Gyoza",                 categoryName: "Entradas",  price: 22, sortOrder: 7, description: "pastel japonês de legumes" },
    { id: "harumaki", name: "Harumaki de Legumes",   categoryName: "Entradas",  price: 20, sortOrder: 8, description: "rolinho de legumes" },
    { id: "edamame",  name: "Edamame",               categoryName: "Entradas",  price: 18, sortOrder: 9, description: "vagem de soja" },
    { id: "sunomono", name: "Sunomono",              categoryName: "Saladas",   price: 16, sortOrder: 10, description: "salada de pepino" },
    { id: "pepino",   name: "Uramaki Pepino",        categoryName: "Uramakis",  price: 19, sortOrder: 11, description: "pepino e arroz" },
    { id: "combo",    name: "Combinado 40 peças",    categoryName: "Combos",    price: 120, sortOrder: 12, servingSize: 4 },
    { id: "coca",     name: "Coca-Cola",             categoryName: "Bebidas",   price: 8,  sortOrder: 13 },
  ];
}

const SEAFOOD_MEAT_IDS = ["uramaki", "hotcam", "temaki", "ceviche", "yakisoba", "hotfila"];

describe("WaiterBrainV2 v1.5 — card quantity", () => {
  it("contextual pairing stays small (≤ 6)", () => {
    const out = decide({ ...base, cartItemIds: ["combo"], catalog: catalog(), message: "o que combina com esse combo?" });
    expect(out.cards.length).toBeLessThanOrEqual(6);
  });

  it("broad recommendation never exceeds 12 and never hallucinates", () => {
    const ids = new Set(catalog().map((i) => i.id));
    for (const message of ["me sugere algo", "quero algo barato", "quero algo leve"]) {
      const out = decide({ ...base, catalog: catalog(), message });
      expect(out.cards.length).toBeLessThanOrEqual(12);
      for (const c of out.cards) expect(ids.has(c)).toBe(true);
    }
  });
});

describe("WaiterBrainV2 v1.5 — vegan / restriction safety", () => {
  it("'sou vegano' is cautious: no 'não temos', confirms ingredients, no seafood/meat card", () => {
    const out = decide({ ...base, catalog: catalog(), message: "sou vegano, o que posso comer?" });
    // never the dangerous denial
    expect(out.message.toLowerCase()).not.toContain("não temos");
    // cautious wording — asks to confirm ingredients
    expect(out.message.toLowerCase()).toMatch(/ingrediente|confir/);
    // never surfaces an obvious seafood/meat item
    for (const id of out.cards) expect(SEAFOOD_MEAT_IDS).not.toContain(id);
    // candidates exist in this catalog (edamame/sunomono/harumaki/pepino…)
    expect(out.cards.length).toBeGreaterThan(0);
    // never hallucinates
    const ids = new Set(catalog().map((i) => i.id));
    for (const c of out.cards) expect(ids.has(c)).toBe(true);
  });

  it("never claims an item IS vegan and includes a CTA", () => {
    const out = decide({ ...base, catalog: catalog(), message: "tem opção vegana?" });
    expect(out.message.toLowerCase()).not.toMatch(/é vegan|são vegan|100% vegan/);
    expect(out.message).toMatch(/👇|adicion|quer|montar/i);
  });

  it("no vegan candidate → cautious 'não encontrei … confirmada', not a false claim", () => {
    const seafoodOnly: V2CatalogItem[] = [
      { id: "s1", name: "Uramaki Salmão", categoryName: "Uramakis", price: 28, sortOrder: 1 },
      { id: "s2", name: "Temaki Atum",     categoryName: "Temakis",  price: 26, sortOrder: 2 },
      { id: "s3", name: "Hot Roll Camarão", categoryName: "Hot Rolls", price: 38, sortOrder: 3 },
    ];
    const out = decide({ ...base, catalog: seafoodOnly, message: "sou vegano" });
    expect(out.cards.length).toBe(0);
    expect(out.message.toLowerCase()).toContain("não encontrei");
    expect(out.message.toLowerCase()).toContain("confirmada");
    expect(out.message.toLowerCase()).not.toContain("não temos");
  });

  it("does not suggest salmon/shrimp for a 'sem frutos do mar' request", () => {
    const out = decide({ ...base, catalog: catalog(), message: "quero algo sem frutos do mar" });
    for (const id of out.cards) expect(["uramaki", "hotcam", "temaki", "ceviche"]).not.toContain(id);
  });
});
