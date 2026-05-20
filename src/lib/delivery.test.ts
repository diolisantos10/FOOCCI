import { describe, it, expect } from "vitest";
import { calcDeliveryFee, calcDeliveryFeeFromConfig } from "./delivery";

// minimumFee=5, includedKm=3, pricePerKm=2
const BASE = { minimumFee: 5, pricePerKm: 2, includedKm: 3, maxFee: null };

describe("calcDeliveryFee — included-km formula", () => {
  it("distance=0 → minimumFee", () => {
    expect(calcDeliveryFee(0, BASE.minimumFee, BASE.pricePerKm, BASE.includedKm, BASE.maxFee)).toBe(5);
  });

  it("distance=2.5 (within includedKm) → minimumFee", () => {
    expect(calcDeliveryFee(2.5, BASE.minimumFee, BASE.pricePerKm, BASE.includedKm, BASE.maxFee)).toBe(5);
  });

  it("distance=3 (exactly includedKm) → minimumFee", () => {
    expect(calcDeliveryFee(3, BASE.minimumFee, BASE.pricePerKm, BASE.includedKm, BASE.maxFee)).toBe(5);
  });

  it("distance=4 → minimumFee + 1×pricePerKm = 7", () => {
    expect(calcDeliveryFee(4, BASE.minimumFee, BASE.pricePerKm, BASE.includedKm, BASE.maxFee)).toBe(7);
  });

  it("distance=5 → minimumFee + 2×pricePerKm = 9", () => {
    expect(calcDeliveryFee(5, BASE.minimumFee, BASE.pricePerKm, BASE.includedKm, BASE.maxFee)).toBe(9);
  });

  it("distance=NaN → minimumFee (safe fallback)", () => {
    expect(calcDeliveryFee(NaN, BASE.minimumFee, BASE.pricePerKm, BASE.includedKm, BASE.maxFee)).toBe(5);
  });

  it("distance=null coerced as 0 → minimumFee", () => {
    expect(calcDeliveryFee(null as unknown as number, BASE.minimumFee, BASE.pricePerKm, BASE.includedKm, BASE.maxFee)).toBe(5);
  });
});

describe("calcDeliveryFee — maxFee cap", () => {
  it("fee capped at maxFee", () => {
    expect(calcDeliveryFee(10, 5, 2, 3, 12)).toBe(12);
  });

  it("fee below maxFee passes through", () => {
    expect(calcDeliveryFee(4, 5, 2, 3, 20)).toBe(7);
  });
});

describe("calcDeliveryFee — zero includedKm (legacy / baseFee only)", () => {
  it("includedKm=0: all km are extra → minimumFee + km×pricePerKm", () => {
    expect(calcDeliveryFee(4, 5, 2, 0, null)).toBe(13);
  });

  it("includedKm=0, distance=0 → minimumFee", () => {
    expect(calcDeliveryFee(0, 5, 2, 0, null)).toBe(5);
  });
});

describe("calcDeliveryFee — monetary precision", () => {
  it("result rounded to 2 decimal places", () => {
    // 5 + (3.7 - 3) * 1.5 = 5 + 0.7 * 1.5 = 5 + 1.05 = 6.05
    expect(calcDeliveryFee(3.7, 5, 1.5, 3, null)).toBe(6.05);
  });
});

describe("calcDeliveryFee — edge cases", () => {
  it("pricePerKm=0 always returns minimumFee", () => {
    expect(calcDeliveryFee(100, 5, 0, 0, null)).toBe(5);
  });

  it("minimumFee=0 → only per-km charge", () => {
    expect(calcDeliveryFee(4, 0, 2, 0, null)).toBe(8);
  });

  it("negative distance treated as 0 → minimumFee", () => {
    expect(calcDeliveryFee(-1, 5, 2, 3, null)).toBe(5);
  });
});

// ── calcDeliveryFeeFromConfig ─────────────────────────────────────────────────
// Canonical config-based formula: baseFee is the calculation base, minimumFee
// is an independent floor. When minimumFee is null it defaults to baseFee.

describe("calcDeliveryFeeFromConfig — real config (baseFee=5, minimumFee=null, included=3, perKm=1.8)", () => {
  const cfg = { baseFee: 5, minimumFee: null, includedKm: 3, pricePerKm: 1.8, maxFee: null };

  it("distance=1 (within includedKm) → 5", () => {
    expect(calcDeliveryFeeFromConfig(cfg, 1)).toBe(5);
  });

  it("distance=3 (exactly includedKm) → 5", () => {
    expect(calcDeliveryFeeFromConfig(cfg, 3)).toBe(5);
  });

  it("distance=5 → baseFee + 2×1.8 = 8.60", () => {
    expect(calcDeliveryFeeFromConfig(cfg, 5)).toBe(8.6);
  });

  it("distance=null (unknown) → baseFee fallback = 5", () => {
    expect(calcDeliveryFeeFromConfig(cfg, null)).toBe(5);
  });

  it("distance=undefined → baseFee fallback = 5", () => {
    expect(calcDeliveryFeeFromConfig(cfg, undefined)).toBe(5);
  });

  it("distance=NaN → baseFee fallback = 5", () => {
    expect(calcDeliveryFeeFromConfig(cfg, NaN)).toBe(5);
  });
});

describe("calcDeliveryFeeFromConfig — explicit minimumFee > baseFee (floor enforcement)", () => {
  const cfg = { baseFee: 5, minimumFee: 7, includedKm: 3, pricePerKm: 1.8, maxFee: null };

  it("distance=1 → floor wins = 7", () => {
    expect(calcDeliveryFeeFromConfig(cfg, 1)).toBe(7);
  });

  it("distance=3 → floor wins = 7", () => {
    expect(calcDeliveryFeeFromConfig(cfg, 3)).toBe(7);
  });

  it("distance=5 → calculated (8.60) > floor (7) → 8.60", () => {
    expect(calcDeliveryFeeFromConfig(cfg, 5)).toBe(8.6);
  });
});

describe("calcDeliveryFeeFromConfig — zero fee config", () => {
  it("base=0, minimum=null, priceKm=0, distance=1 → 0 (free delivery)", () => {
    expect(calcDeliveryFeeFromConfig({ baseFee: 0, minimumFee: null, includedKm: 0, pricePerKm: 0, maxFee: null }, 1)).toBe(0);
  });
});

describe("calcDeliveryFeeFromConfig — maxFee cap", () => {
  it("capped at maxFee when fee exceeds it", () => {
    // base=5, included=3, perKm=1.8, distance=10 → 5 + 7*1.8 = 17.6 → capped at 15
    expect(calcDeliveryFeeFromConfig({ baseFee: 5, minimumFee: null, includedKm: 3, pricePerKm: 1.8, maxFee: 15 }, 10)).toBe(15);
  });
});

describe("calcDeliveryFeeFromConfig — monetary precision", () => {
  it("result rounded to 2 decimal places", () => {
    // base=5, included=3, perKm=1.5, distance=3.7 → 5 + 0.7*1.5 = 5 + 1.05 = 6.05
    expect(calcDeliveryFeeFromConfig({ baseFee: 5, minimumFee: null, includedKm: 3, pricePerKm: 1.5, maxFee: null }, 3.7)).toBe(6.05);
  });
});
