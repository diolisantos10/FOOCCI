import { describe, it, expect } from "vitest";
import { bucketRevenueSources, type RevenueSourceKey } from "./RevenueAttributionService";

/** Helper: pull a bucket's revenue by key from the result. */
function rev(result: ReturnType<typeof bucketRevenueSources>, key: RevenueSourceKey): number {
  return result.buckets.find((b) => b.key === key)!.revenue;
}
function ord(result: ReturnType<typeof bucketRevenueSources>, key: RevenueSourceKey): number {
  return result.buckets.find((b) => b.key === key)!.orders;
}

describe("bucketRevenueSources", () => {
  it("empty input → zeroed 4 buckets", () => {
    const r = bucketRevenueSources([], new Set(), new Set());
    expect(r.total).toBe(0);
    expect(r.buckets.map((b) => b.key)).toEqual(["crm", "referral", "new", "organic"]);
    expect(r.buckets.every((b) => b.revenue === 0 && b.orders === 0)).toBe(true);
  });

  it("classifies each order into exactly one bucket by priority", () => {
    const orders = [
      { id: "o_ref",     total: 100, isFirst: true  }, // referral wins even though first
      { id: "o_new",     total: 50,  isFirst: true  }, // first, not referral → new
      { id: "o_crm",     total: 30,  isFirst: false }, // returning + crm
      { id: "o_organic", total: 20,  isFirst: false }, // returning, nothing → organic
    ];
    const crm = new Set(["o_crm", "o_ref"]); // o_ref is also crm-tagged, but referral has priority
    const referral = new Set(["o_ref"]);
    const r = bucketRevenueSources(orders, crm, referral);

    expect(rev(r, "referral")).toBe(100);
    expect(rev(r, "new")).toBe(50);
    expect(rev(r, "crm")).toBe(30);
    expect(rev(r, "organic")).toBe(20);
    expect(ord(r, "referral")).toBe(1);
  });

  it("shares sum to the total (no double counting, nothing dropped)", () => {
    const orders = [
      { id: "a", total: 33.33, isFirst: true },
      { id: "b", total: 66.67, isFirst: false },
      { id: "c", total: 100,   isFirst: false },
    ];
    const r = bucketRevenueSources(orders, new Set(["c"]), new Set());
    const sum = r.buckets.reduce((s, b) => s + b.revenue, 0);
    expect(r.total).toBe(200);
    expect(Math.round(sum * 100) / 100).toBe(200);
  });

  it("first order takes precedence over CRM (new customer isn't 'CRM')", () => {
    const orders = [{ id: "x", total: 80, isFirst: true }];
    const r = bucketRevenueSources(orders, new Set(["x"]), new Set());
    expect(rev(r, "new")).toBe(80);
    expect(rev(r, "crm")).toBe(0);
  });

  it("returning order with no attribution → organic", () => {
    const orders = [{ id: "x", total: 40, isFirst: false }];
    const r = bucketRevenueSources(orders, new Set(), new Set());
    expect(rev(r, "organic")).toBe(40);
  });
});
