import { describe, it, expect } from "vitest";
import {
  computeFixedPct,
  computeMarkup,
  roundPrice,
  idealPrice,
  cmvPct,
  periodCmvPct,
  classifyPrice,
  changePct,
} from "./PricingEngine";

describe("computeFixedPct", () => {
  it("converts fixed R$ into % of revenue (proposal example: 17k/85k = 20%)", () => {
    expect(computeFixedPct(85_000, 17_000)).toBe(20);
  });

  it("is null without revenue, with zero revenue, or without expenses", () => {
    expect(computeFixedPct(null, 17_000)).toBeNull();
    expect(computeFixedPct(0, 17_000)).toBeNull();
    expect(computeFixedPct(85_000, null)).toBeNull();
  });

  it("accepts zero expenses (0%)", () => {
    expect(computeFixedPct(85_000, 0)).toBe(0);
  });
});

describe("computeMarkup", () => {
  it("proposal example: 20 + 15 + 30 = 65% → markup 100/35 ≈ 2.857", () => {
    const r = computeMarkup({ fixedPct: 20, taxesFeesPct: 15, targetProfitPct: 30 });
    expect(r).not.toBeNull();
    expect(r!.totalPct).toBe(65);
    expect(r!.markup).toBeCloseTo(100 / 35, 6);
  });

  it("market example (Goomer): 30% cost structure + 20% profit → markup 2.0", () => {
    const r = computeMarkup({ fixedPct: 30, taxesFeesPct: 0, targetProfitPct: 20 });
    expect(r!.markup).toBeCloseTo(2, 10);
  });

  it("zero assumptions → markup 1.0 (price = cost)", () => {
    expect(computeMarkup({ fixedPct: 0, taxesFeesPct: 0, targetProfitPct: 0 })!.markup).toBe(1);
  });

  it("rejects impossible assumptions (sum ≥ 100%) and negatives", () => {
    expect(computeMarkup({ fixedPct: 60, taxesFeesPct: 30, targetProfitPct: 10 })).toBeNull();
    expect(computeMarkup({ fixedPct: 120, taxesFeesPct: 0, targetProfitPct: 0 })).toBeNull();
    expect(computeMarkup({ fixedPct: -5, taxesFeesPct: 10, targetProfitPct: 10 })).toBeNull();
  });
});

describe("roundPrice", () => {
  it("ENDING_90 rounds up to the next ,90", () => {
    expect(roundPrice(48.05, "ENDING_90")).toBe(48.9);
    expect(roundPrice(48.95, "ENDING_90")).toBe(49.9);
    expect(roundPrice(30.03, "ENDING_90")).toBe(30.9);
    expect(roundPrice(0.5, "ENDING_90")).toBe(0.9);
  });

  it("ENDING_90 keeps a price already ending in ,90", () => {
    expect(roundPrice(30.9, "ENDING_90")).toBe(30.9);
    // float noise: 0.1 + 0.2 style artifacts must not bump a whole real
    expect(roundPrice(48.900000000000006, "ENDING_90")).toBe(48.9);
  });

  it("ENDING_99 rounds up to the next ,99", () => {
    expect(roundPrice(48.05, "ENDING_99")).toBe(48.99);
    expect(roundPrice(49.0, "ENDING_99")).toBe(49.99);
    expect(roundPrice(48.99, "ENDING_99")).toBe(48.99);
  });

  it("NONE keeps 2 decimal places", () => {
    expect(roundPrice(48.056, "NONE")).toBe(48.06);
    expect(roundPrice(48.054, "NONE")).toBe(48.05);
  });
});

describe("idealPrice", () => {
  const markup = computeMarkup({ fixedPct: 20, taxesFeesPct: 15, targetProfitPct: 30 })!.markup;

  it("proposal example: cost 16.80 × 2.857 = 48.00 → ,90 rounding → 48.90", () => {
    expect(idealPrice(16.8, markup, "ENDING_90")).toBe(48.9);
  });

  it("cost 10 × markup 2.857 ≈ 28.57 → NONE keeps 28.57", () => {
    expect(idealPrice(10, markup, "NONE")).toBe(28.57);
  });

  it("null without cost or without a valid markup", () => {
    expect(idealPrice(null, markup, "ENDING_90")).toBeNull();
    expect(idealPrice(0, markup, "ENDING_90")).toBeNull();
    expect(idealPrice(16.8, null, "ENDING_90")).toBeNull();
  });

  it("never suggests below cost (markup 1.0 → price = cost)", () => {
    expect(idealPrice(25, 1, "NONE")).toBe(25);
    expect(idealPrice(25.5, 1, "ENDING_90")).toBe(25.9);
  });
});

describe("cmvPct", () => {
  it("Stone example: cost 10 on price 35 → 28.57%", () => {
    expect(cmvPct(10, 35)).toBe(28.57);
  });

  it("null without cost or price", () => {
    expect(cmvPct(null, 35)).toBeNull();
    expect(cmvPct(10, 0)).toBeNull();
    expect(cmvPct(0, 35)).toBeNull();
  });
});

describe("periodCmvPct", () => {
  it("Stone example: 5000 + 10000 − 4000 = 11000 on 29000 revenue → 37.93%", () => {
    expect(
      periodCmvPct({ openingStock: 5000, purchases: 10_000, closingStock: 4000, revenue: 29_000 })
    ).toBe(37.93);
  });

  it("null until all four figures are informed", () => {
    expect(
      periodCmvPct({ openingStock: 5000, purchases: 10_000, closingStock: null, revenue: 29_000 })
    ).toBeNull();
    expect(
      periodCmvPct({ openingStock: 5000, purchases: 10_000, closingStock: 4000, revenue: 0 })
    ).toBeNull();
  });
});

describe("classifyPrice", () => {
  it("flags a price clearly under the ideal as BELOW", () => {
    expect(classifyPrice(42.9, 48.9)).toBe("BELOW");
  });

  it("flags a price clearly over the ideal as ABOVE", () => {
    expect(classifyPrice(39.9, 30.9)).toBe("ABOVE");
  });

  it("treats small differences as ON_TARGET (2% tolerance)", () => {
    expect(classifyPrice(48.9, 48.9)).toBe("ON_TARGET");
    expect(classifyPrice(48.9, 49.5)).toBe("ON_TARGET"); // 0.60 diff < 2% of 48.90
    expect(classifyPrice(48.9, 50.9)).toBe("BELOW"); // 2.00 diff > tolerance
  });
});

describe("changePct", () => {
  it("computes the signed variation (42.90 → 48.90 = +13.99%)", () => {
    expect(changePct(42.9, 48.9)).toBe(13.99);
    expect(changePct(39.9, 30.9)).toBe(-22.56);
  });

  it("null without a valid old price", () => {
    expect(changePct(0, 48.9)).toBeNull();
  });
});
