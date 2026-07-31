import { describe, it, expect } from "vitest";
import { bucketRevenueSources, type RevenueSourceKey } from "./RevenueAttributionService";

const S = (arr: string[]) => new Set(arr);
const round = (n: number) => Math.round(n * 100) / 100;
function rev(r: ReturnType<typeof bucketRevenueSources>, key: RevenueSourceKey): number {
  return r.buckets.find((b) => b.key === key)!.revenue;
}

describe("bucketRevenueSources", () => {
  it("empty input → zeroed 3 buckets in display order", () => {
    const r = bucketRevenueSources([], { referral: S([]), crm: S([]), upsell: S([]) });
    expect(r.total).toBe(0);
    expect(r.buckets.map((b) => b.key)).toEqual(["crm", "garcom", "espontanea"]);
    expect(r.buckets.every((b) => b.revenue === 0 && b.orders === 0)).toBe(true);
  });

  it("priority: referral > crm > upsell > espontânea", () => {
    const orders = [
      { id: "r", total: 100 }, // referral (também crm-tagged) → garçom
      { id: "c", total: 50 },  // crm → crm
      { id: "u", total: 30 },  // só upsell → garçom
      { id: "e", total: 20 },  // nada → espontânea
    ];
    const r = bucketRevenueSources(orders, { referral: S(["r"]), crm: S(["r", "c"]), upsell: S(["u"]) });
    expect(rev(r, "garcom")).toBe(130); // 100 (referral) + 30 (upsell)
    expect(rev(r, "crm")).toBe(50);
    expect(rev(r, "espontanea")).toBe(20);
  });

  it("crm vence upsell (a origem ganha da recomendação)", () => {
    const r = bucketRevenueSources([{ id: "x", total: 80 }], { referral: S([]), crm: S(["x"]), upsell: S(["x"]) });
    expect(rev(r, "crm")).toBe(80);
    expect(rev(r, "garcom")).toBe(0);
  });

  it("as fatias somam o total (sem dupla contagem)", () => {
    const orders = [{ id: "a", total: 33.33 }, { id: "b", total: 66.67 }, { id: "c", total: 100 }];
    const r = bucketRevenueSources(orders, { referral: S(["a"]), crm: S([]), upsell: S(["b"]) });
    expect(r.total).toBe(200);
    expect(round(r.buckets.reduce((s, b) => s + b.revenue, 0))).toBe(200);
  });

  it("sem influência → espontânea", () => {
    const r = bucketRevenueSources([{ id: "x", total: 40 }], { referral: S([]), crm: S([]), upsell: S([]) });
    expect(rev(r, "espontanea")).toBe(40);
    expect(rev(r, "garcom")).toBe(0);
  });
});
