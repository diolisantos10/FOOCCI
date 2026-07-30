import { describe, it, expect } from "vitest";
import { conversionFactor, compatibleUseUnits, lineCost } from "./units";

describe("conversionFactor", () => {
  it("mesma unidade → 1", () => {
    expect(conversionFactor("kg", "kg")).toBe(1);
    expect(conversionFactor("un", "un")).toBe(1);
  });
  it("massa g↔kg", () => {
    expect(conversionFactor("g", "kg")).toBeCloseTo(0.001, 10);
    expect(conversionFactor("kg", "g")).toBe(1000);
  });
  it("volume ml↔L", () => {
    expect(conversionFactor("ml", "L")).toBeCloseTo(0.001, 10);
    expect(conversionFactor("L", "ml")).toBe(1000);
  });
  it("dimensões diferentes ou desconhecidas → null", () => {
    expect(conversionFactor("g", "ml")).toBeNull();
    expect(conversionFactor("un", "g")).toBeNull();
    expect(conversionFactor("fatia", "porção")).toBeNull();
  });
});

describe("compatibleUseUnits", () => {
  it("massa oferece kg+g", () => {
    expect(compatibleUseUnits("kg")).toEqual(["kg", "g"]);
    expect(compatibleUseUnits("g")).toEqual(["kg", "g"]);
  });
  it("volume oferece L+ml", () => {
    expect(compatibleUseUnits("L")).toEqual(["L", "ml"]);
  });
  it("contagem só a própria unidade", () => {
    expect(compatibleUseUnits("un")).toEqual(["un"]);
    expect(compatibleUseUnits("fatia")).toEqual(["fatia"]);
  });
});

describe("lineCost (conversão uso→compra)", () => {
  it("compra em kg, usa em g", () => {
    // 150 g de um insumo a R$ 30,00/kg = R$ 4,50
    expect(lineCost(150, "g", "kg", 30)).toBeCloseTo(4.5, 6);
  });
  it("compra em L, usa em ml", () => {
    // 30 ml de um insumo a R$ 28,90/L = R$ 0,867
    expect(lineCost(30, "ml", "L", 28.9)).toBeCloseTo(0.867, 6);
  });
  it("mesma unidade não converte", () => {
    expect(lineCost(1, "un", "un", 0.9)).toBeCloseTo(0.9, 6);
    expect(lineCost(2, "kg", "kg", 30)).toBeCloseTo(60, 6);
  });
  it("faltando quantidade ou custo → null", () => {
    expect(lineCost(null, "g", "kg", 30)).toBeNull();
    expect(lineCost(150, "g", "kg", null)).toBeNull();
  });
  it("unidades incompatíveis → null (não inventa custo)", () => {
    expect(lineCost(150, "g", "un", 0.9)).toBeNull();
  });
});
