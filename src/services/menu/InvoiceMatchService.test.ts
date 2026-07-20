import { describe, it, expect } from "vitest";
import {
  tokenize,
  matchIngredient,
  normalizeUnit,
  convertUnitPrice,
  effectiveUnitPrice,
  buildProposals,
  type CatalogIngredient,
} from "./InvoiceMatchService";

const catalog: CatalogIngredient[] = [
  { id: "i1", name: "Salmão", unit: "g", costPerUnit: 0.09 },
  { id: "i2", name: "Cream Cheese", unit: "g", costPerUnit: 0.04 },
  { id: "i3", name: "Arroz", unit: "g", costPerUnit: 0.012 },
  { id: "i4", name: "Alga Nori", unit: "un", costPerUnit: 0.8 },
];

describe("tokenize", () => {
  it("strips accents, noise words and quantities", () => {
    expect(tokenize("SALMÃO FRESCO RESFRIADO KG 2,5")).toEqual(["salmao"]);
    expect(tokenize("Queijo Cream Cheese 150g")).toEqual(["queijo", "cream", "cheese", "150g"]);
  });
});

describe("matchIngredient", () => {
  it("matches invoice noise to the clean catalog name (high)", () => {
    const m = matchIngredient("SALMAO FRESCO CONGELADO KG", catalog);
    expect(m?.ingredient.id).toBe("i1");
    expect(m?.confidence).toBe("high");
  });

  it("catalog name fully contained in the invoice name is high", () => {
    const m = matchIngredient("QUEIJO CREAM CHEESE TRADICIONAL", catalog);
    expect(m?.ingredient.id).toBe("i2");
    expect(m?.confidence).toBe("high");
  });

  it("genuine partial overlap is medium (review-worthy)", () => {
    const m = matchIngredient("CREAM IMPORTADO", catalog);
    expect(m?.ingredient.id).toBe("i2");
    expect(m?.confidence).toBe("medium");
  });

  it("returns null when nothing plausible", () => {
    expect(matchIngredient("DETERGENTE NEUTRO 500ML", catalog)).toBeNull();
  });
});

describe("normalizeUnit", () => {
  it("maps aliases", () => {
    expect(normalizeUnit("KG")).toBe("kg");
    expect(normalizeUnit("Lt")).toBe("L");
    expect(normalizeUnit("UND")).toBe("un");
    expect(normalizeUnit(null)).toBeNull();
  });
});

describe("convertUnitPrice", () => {
  it("kg→g divides by 1000 (R$ 90/kg = R$ 0,09/g)", () => {
    expect(convertUnitPrice("kg", 90, "g")).toEqual({
      cost: 0.09,
      note: "convertido de R$/kg para R$/g",
    });
  });

  it("L→ml and ml→L", () => {
    expect(convertUnitPrice("L", 12, "ml")?.cost).toBe(0.012);
    expect(convertUnitPrice("ml", 0.012, "L")?.cost).toBe(12);
  });

  it("same unit passes through; incompatible returns null", () => {
    expect(convertUnitPrice("un", 0.8, "un")).toEqual({ cost: 0.8, note: null });
    expect(convertUnitPrice("cx", 45, "g")).toBeNull();
  });
});

describe("effectiveUnitPrice", () => {
  it("uses unitPrice when present, else total ÷ quantity", () => {
    expect(
      effectiveUnitPrice({ name: "x", quantity: 2.5, unit: "kg", unitPrice: 89.9, totalPrice: 224.75 })
    ).toBe(89.9);
    expect(
      effectiveUnitPrice({ name: "x", quantity: 2.5, unit: "kg", unitPrice: null, totalPrice: 224.75 })
    ).toBe(89.9);
    expect(effectiveUnitPrice({ name: "x", quantity: null, unit: "kg", unitPrice: null, totalPrice: 90 })).toBeNull();
  });
});

describe("buildProposals", () => {
  it("full happy path: match + convert (nota em kg, insumo em g)", () => {
    const [p] = buildProposals(
      [{ name: "SALMAO FRESCO KG", quantity: 2.5, unit: "kg", unitPrice: null, totalPrice: 250 }],
      catalog
    );
    expect(p.matchedIngredientId).toBe("i1");
    expect(p.extractedUnitPrice).toBe(100); // 250 ÷ 2,5
    expect(p.suggestedCost).toBe(0.1); // R$100/kg → R$0,10/g
    expect(p.conversionNote).toContain("convertido");
  });

  it("no match → proposal ainda aparece para revisão manual", () => {
    const [p] = buildProposals(
      [{ name: "GELO EM CUBOS PCT", quantity: 4, unit: "pct", unitPrice: 8, totalPrice: 32 }],
      catalog
    );
    expect(p.matchedIngredientId).toBeNull();
    expect(p.confidence).toBe("none");
    expect(p.suggestedCost).toBeNull();
  });

  it("match com unidade incompatível → sem custo sugerido + aviso", () => {
    const [p] = buildProposals(
      [{ name: "ALGA NORI CX 50", quantity: 1, unit: "cx", unitPrice: 40, totalPrice: 40 }],
      catalog
    );
    expect(p.matchedIngredientId).toBe("i4");
    expect(p.suggestedCost).toBeNull();
    expect(p.conversionNote).toContain("difere do insumo");
  });
});
