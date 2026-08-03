/**
 * Commission calculator — the maths behind the highest-converting block on the site.
 *
 * This runs on a public page in front of restaurant owners who know their own numbers.
 * A wrong result here is not a rendering bug: it is an argument that collapses in the
 * sales call that follows.
 */

import { describe, it, expect } from "vitest";
import {
  calculateCommission,
  formatBRL,
  COMMISSION_RATES,
  MIGRATION_RANGE,
  COMMISSION_SOURCE,
} from "./commissionRates";

describe("calculateCommission", () => {
  it("matches the published table for R$ 40 mil with own delivery", () => {
    // OS §2.2: R$ 40 mil → R$ 6.080/month at 15,2%.
    const r = calculateCommission(40_000, "own");
    expect(Math.round(r.monthlyCommission)).toBe(6_080);
    expect(Math.round(r.savingsLow)).toBe(1_216); // 20%
    expect(Math.round(r.savingsHigh)).toBe(2_128); // 35%
  });

  it("matches the published table for R$ 150 mil with own delivery", () => {
    const r = calculateCommission(150_000, "own");
    expect(Math.round(r.monthlyCommission)).toBe(22_800);
  });

  it("charges more when the marketplace does the delivery", () => {
    const own = calculateCommission(20_000, "own");
    const mkt = calculateCommission(20_000, "marketplace");
    expect(mkt.monthlyCommission).toBeGreaterThan(own.monthlyCommission);
    expect(Math.round(mkt.monthlyCommission)).toBe(5_300); // 26,5%
  });

  it("returns zeros — never NaN — for unusable input", () => {
    // "R$ NaN" on a public page discredits every other number around it.
    for (const bad of [NaN, -1, Infinity, 0]) {
      const r = calculateCommission(bad, "own");
      expect(r.monthlyCommission).toBe(0);
      expect(r.savingsLow).toBe(0);
      expect(r.savingsHigh).toBe(0);
      expect(Number.isFinite(r.monthlyCommission)).toBe(true);
    }
  });

  it("keeps the migration range conservative — the argument must survive being halved", () => {
    expect(MIGRATION_RANGE.low).toBeLessThanOrEqual(0.2);
    expect(MIGRATION_RANGE.high).toBeLessThanOrEqual(0.5);
  });
});

describe("published rates carry their origin", () => {
  it("every rate has a human-readable breakdown", () => {
    for (const rate of Object.values(COMMISSION_RATES)) {
      expect(rate.breakdown.trim().length).toBeGreaterThan(0);
      expect(rate.rate).toBeGreaterThan(0);
      expect(rate.rate).toBeLessThan(1);
    }
  });

  it("the source is stated and dated — a number without origin is invented", () => {
    expect(COMMISSION_SOURCE.label.trim().length).toBeGreaterThan(10);
    expect(COMMISSION_SOURCE.checkedAt).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("never names a competitor — decisão do CEO, é risco jurídico", () => {
    // Naming a marketplace in a comparison on a public commercial page invites a
    // lawsuit. The argument works without the name, so the name does not go up.
    const publicText = [
      COMMISSION_SOURCE.label,
      ...Object.values(COMMISSION_RATES).flatMap((r) => [r.label, r.breakdown]),
    ].join(" ");
    expect(publicText).not.toMatch(/ifood|rappi|uber\s*eats|99food/i);
  });
});

describe("formatBRL", () => {
  it("formats in Brazilian currency without cents", () => {
    expect(formatBRL(6080)).toContain("6.080");
    expect(formatBRL(0)).toContain("0");
  });
});
