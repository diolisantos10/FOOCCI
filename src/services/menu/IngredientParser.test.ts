import { describe, it, expect } from "vitest";
import { parseIngredientNames } from "./IngredientParser";

describe("parseIngredientNames", () => {
  it("splits commas and final conjunction 'e'", () => {
    expect(parseIngredientNames("Arroz, salmão e cream cheese")).toEqual([
      "Arroz",
      "Salmão",
      "Cream Cheese",
    ]);
  });

  it("splits semicolons, slashes and newlines", () => {
    expect(parseIngredientNames("Alface; tomate\nmolho da casa / cebola")).toEqual([
      "Alface",
      "Tomate",
      "Molho da Casa",
      "Cebola",
    ]);
  });

  it("keeps Portuguese connectives lowercase in Title Case", () => {
    expect(parseIngredientNames("filé de tilápia, geleia de pimenta")).toEqual([
      "Filé de Tilápia",
      "Geleia de Pimenta",
    ]);
  });

  it("dedupes case-insensitively and preserves order", () => {
    expect(parseIngredientNames("Salmão, SALMÃO, arroz, Arroz")).toEqual(["Salmão", "Arroz"]);
  });

  it("drops bullets, quantity-only tokens and stray dots", () => {
    expect(parseIngredientNames("- Arroz., 300g, 2, 1,5 L, • Nori")).toEqual(["Arroz", "Nori"]);
  });

  it("splits 'com' as a conjunction", () => {
    expect(parseIngredientNames("Hot roll com geleia")).toEqual(["Hot Roll", "Geleia"]);
  });

  it("returns [] for empty/null/whitespace", () => {
    expect(parseIngredientNames(null)).toEqual([]);
    expect(parseIngredientNames(undefined)).toEqual([]);
    expect(parseIngredientNames("   ")).toEqual([]);
  });

  it("ignores single-character noise and overlong tokens", () => {
    expect(parseIngredientNames("a, x, Salmão")).toEqual(["Salmão"]);
    expect(parseIngredientNames("S".repeat(61) + ", Arroz")).toEqual(["Arroz"]);
  });
});
