import { describe, it, expect } from "vitest";
import { calcDeliveryFee } from "./delivery";

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
