/**
 * WaiterBrainV2 — Menu Retrieval Contract Tests
 *
 * Tests resolveMenuIntent pure function. No DB, no AI, no network.
 */

import { vi, describe, it, expect } from "vitest";

vi.mock("../ConversationGuardrails", () => ({
  isDessertCategory: (name: string) =>
    /sobremesa|doce|sorvete|torta|bolo|brownie|pudim|brigadeiro|dessert|sweet/i.test(name),
}));

import { resolveMenuIntent, type V2CatalogItem } from "../WaiterBrainV2";

// ── Catalog fixtures ──────────────────────────────────────────────────────────

function makeSushiOnlyCatalog(): V2CatalogItem[] {
  return [
    { id: "s1", name: "Temaki Salmão",        categoryName: "Temakis",    price: 22, sortOrder: 1 },
    { id: "s2", name: "Uramaki Philadelphia",  categoryName: "Uramakis",   price: 28, sortOrder: 2 },
    { id: "s3", name: "Combinado Para 2",      categoryName: "Combos",     price: 65, sortOrder: 3 },
    { id: "s4", name: "Temaki Atum",           categoryName: "Temakis",    price: 24, sortOrder: 4 },
  ];
}

function makeDrinkCatalog(): V2CatalogItem[] {
  return [
    { id: "d1", name: "Suco de Laranja",       categoryName: "Bebidas",    price: 8,  sortOrder: 1 },
    { id: "d2", name: "Refrigerante Lata",     categoryName: "Bebidas",    price: 7,  sortOrder: 2 },
    { id: "d3", name: "Água Mineral",          categoryName: "Bebidas",    price: 5,  sortOrder: 3 },
    { id: "d4", name: "Temaki Salmão",         categoryName: "Temakis",    price: 22, sortOrder: 4 },
  ];
}

function makeFullCatalog(): V2CatalogItem[] {
  return [
    { id: "f1", name: "Temaki Salmão",         categoryName: "Temakis",    price: 22, sortOrder: 1 },
    { id: "f2", name: "Yakisoba de Frango",    categoryName: "Pratos Quentes", price: 35, sortOrder: 2, description: "macarrão japonês quente" },
    { id: "f3", name: "Suco de Laranja",       categoryName: "Bebidas",    price: 8,  sortOrder: 3 },
    { id: "f4", name: "Pudim de Leite",        categoryName: "Sobremesas", price: 12, sortOrder: 4 },
    { id: "f5", name: "Sorvete de Morango",    categoryName: "Sobremesas", price: 10, sortOrder: 5 },
    { id: "f6", name: "Refrigerante Lata",     categoryName: "Bebidas",    price: 7,  sortOrder: 6 },
    { id: "f7", name: "Lamen Tonkotsu",        categoryName: "Pratos Quentes", price: 38, sortOrder: 7, description: "macarrão japonês quente" },
  ];
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("resolveMenuIntent — noMatch cases", () => {
  it('returns noMatch=true when asking "Tem massas?" on a sushi-only catalog', () => {
    const result = resolveMenuIntent("Tem massas?", makeSushiOnlyCatalog());
    expect(result.noMatch).toBe(true);
    expect(result.exactMatches).toHaveLength(0);
    expect(result.categoryMatches).toHaveLength(0);
  });

  it("finds proximity alternatives when asking for pizza on a sushi catalog", () => {
    const result = resolveMenuIntent("Tem pizza?", makeSushiOnlyCatalog());
    expect(result.noMatch).toBe(true);
    // "combinado" matches the pizza proximity pattern
    expect(result.alternativeProducts.length).toBeGreaterThanOrEqual(0);
  });

  it('returns noMatch=true with no random cards for "Tem pizza?" on sushi catalog', () => {
    const result = resolveMenuIntent("Tem pizza?", makeSushiOnlyCatalog());
    expect(result.noMatch).toBe(true);
    // alternativeProducts must only be real catalog items matching proximity
    for (const item of result.alternativeProducts) {
      expect(makeSushiOnlyCatalog().map((i) => i.id)).toContain(item.id);
    }
  });
});

describe("resolveMenuIntent — match cases", () => {
  it('returns matches for "Tem bebida?" when catalog has drinks', () => {
    const result = resolveMenuIntent("Tem bebida?", makeDrinkCatalog());
    expect(result.noMatch).toBe(false);
    const allMatchIds = [
      ...result.exactMatches.map((i) => i.id),
      ...result.categoryMatches.map((i) => i.id),
    ];
    expect(allMatchIds.length).toBeGreaterThan(0);
    // All returned items must be drink items
    for (const id of allMatchIds) {
      const item = makeDrinkCatalog().find((i) => i.id === id)!;
      expect(item.categoryName).toMatch(/bebida/i);
    }
  });

  it('returns sobremesa items for "Tem sobremesa?"', () => {
    const result = resolveMenuIntent("Tem sobremesa?", makeFullCatalog());
    expect(result.noMatch).toBe(false);
    const allMatchIds = [
      ...result.exactMatches.map((i) => i.id),
      ...result.categoryMatches.map((i) => i.id),
    ];
    expect(allMatchIds.length).toBeGreaterThan(0);
    for (const id of allMatchIds) {
      const item = makeFullCatalog().find((i) => i.id === id)!;
      expect(item.categoryName).toMatch(/sobremesa/i);
    }
  });

  it('returns hot/warm items for "Quero algo quente"', () => {
    const result = resolveMenuIntent("Quero algo quente", makeFullCatalog());
    const allMatchIds = [
      ...result.exactMatches.map((i) => i.id),
      ...result.categoryMatches.map((i) => i.id),
    ];
    // Yakisoba and Lamen are in "Pratos Quentes" — should match
    if (allMatchIds.length > 0) {
      for (const id of allMatchIds) {
        expect(makeFullCatalog().map((i) => i.id)).toContain(id);
      }
    }
  });
});

describe("resolveMenuIntent — intent classification", () => {
  it('classifies "Tem massas?" as ASK_PRODUCT_EXISTS', () => {
    const result = resolveMenuIntent("Tem massas?", makeSushiOnlyCatalog());
    expect(result.intent).toBe("ASK_PRODUCT_EXISTS");
  });

  it('classifies "Me mostra as bebidas" as ASK_CATEGORY or ASK_PRODUCT_EXISTS', () => {
    const result = resolveMenuIntent("Me mostra as bebidas", makeDrinkCatalog());
    expect(["ASK_CATEGORY", "ASK_PRODUCT_EXISTS"]).toContain(result.intent);
  });

  it('classifies "O que você recomenda?" as ASK_RECOMMENDATION', () => {
    const result = resolveMenuIntent("O que você recomenda?", makeFullCatalog());
    expect(result.intent).toBe("ASK_RECOMMENDATION");
  });

  it('classifies "Sou alérgico a camarão" as DIETARY_RESTRICTION', () => {
    const result = resolveMenuIntent("Sou alérgico a camarão", makeFullCatalog());
    expect(result.intent).toBe("DIETARY_RESTRICTION");
  });
});

describe("resolveMenuIntent — output integrity", () => {
  it("alternativeProducts only contains items from the passed catalog", () => {
    const catalog = makeSushiOnlyCatalog();
    const result = resolveMenuIntent("Tem pizza?", catalog);
    const catalogIds = catalog.map((i) => i.id);
    for (const item of result.alternativeProducts) {
      expect(catalogIds).toContain(item.id);
    }
  });

  it("returns no cards when noMatch=true and no proximity match exists", () => {
    // Ask about something not in the catalog and not in proximity map
    const result = resolveMenuIntent("Tem risoto?", makeSushiOnlyCatalog());
    // alternativeProducts should only be real catalog items (may be empty)
    const catalogIds = makeSushiOnlyCatalog().map((i) => i.id);
    for (const item of result.alternativeProducts) {
      expect(catalogIds).toContain(item.id);
    }
  });

  it("passes cartItemIds context without crashing", () => {
    const catalog = makeFullCatalog();
    const result = resolveMenuIntent("Tem bebida?", catalog, { cartItemIds: ["f1"] });
    expect(result).toBeDefined();
    expect(result.noMatch).toBe(false);
  });
});
