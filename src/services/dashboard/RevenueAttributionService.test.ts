import { describe, it, expect } from "vitest";
import { bucketRevenueSources, type RevenueSourceKey } from "./RevenueAttributionService";

const S = (arr: string[]) => new Set(arr);
const round = (n: number) => Math.round(n * 100) / 100;
function rev(r: ReturnType<typeof bucketRevenueSources>, key: RevenueSourceKey): number {
  return r.buckets.find((b) => b.key === key)!.revenue;
}

describe("bucketRevenueSources", () => {
  it("empty input → zeroed 3 buckets in display order", () => {
    const r = bucketRevenueSources([], { referral: S([]), crm: S([]) });
    expect(r.total).toBe(0);
    expect(r.buckets.map((b) => b.key)).toEqual(["crm", "garcom", "espontanea"]);
    expect(r.buckets.every((b) => b.revenue === 0 && b.orders === 0)).toBe(true);
  });

  it("referral credita o pedido; upsell-only credita o item; nada → espontânea", () => {
    const orders = [
      { id: "r", total: 100 }, // referral (também crm-tagged) → garçom (pedido todo)
      { id: "c", total: 50 },  // crm, sem upsell → crm
      { id: "u", total: 30 },  // só upsell, valor 30 → garçom
      { id: "e", total: 20 },  // nada → espontânea
    ];
    const r = bucketRevenueSources(orders, { referral: S(["r"]), crm: S(["r", "c"]) }, { u: 30 });
    expect(rev(r, "garcom")).toBe(130); // 100 (referral) + 30 (upsell)
    expect(rev(r, "crm")).toBe(50);
    expect(rev(r, "espontanea")).toBe(20);
  });

  it("REGRA DO DONO: upsell credita SÓ o produto específico, não o pedido inteiro", () => {
    // Pedido de R$150 com um item de upsell de R$5, sem CRM/referral.
    const r = bucketRevenueSources([{ id: "x", total: 150 }], { referral: S([]), crm: S([]) }, { x: 5 });
    expect(rev(r, "garcom")).toBe(5);       // só o item recomendado
    expect(rev(r, "espontanea")).toBe(145); // o resto o cliente compraria de qualquer jeito
    expect(rev(r, "crm")).toBe(0);
  });

  it("pedido CRM com upsell: o item vai pro garçom, o resto do pedido pro CRM", () => {
    const r = bucketRevenueSources([{ id: "x", total: 80 }], { referral: S([]), crm: S(["x"]) }, { x: 20 });
    expect(rev(r, "garcom")).toBe(20); // item de upsell
    expect(rev(r, "crm")).toBe(60);    // 80 - 20
  });

  it("valor de upsell maior que o total é limitado ao total (nunca estoura)", () => {
    const r = bucketRevenueSources([{ id: "x", total: 40 }], { referral: S([]), crm: S([]) }, { x: 999 });
    expect(rev(r, "garcom")).toBe(40);
    expect(rev(r, "espontanea")).toBe(0);
  });

  it("as fatias somam o total (sem dupla contagem)", () => {
    const orders = [{ id: "a", total: 33.33 }, { id: "b", total: 66.67 }, { id: "c", total: 100 }];
    const r = bucketRevenueSources(orders, { referral: S(["a"]), crm: S([]) }, { b: 10 });
    expect(r.total).toBe(200);
    expect(round(r.buckets.reduce((s, b) => s + b.revenue, 0))).toBe(200);
  });

  it("sem influência → espontânea", () => {
    const r = bucketRevenueSources([{ id: "x", total: 40 }], { referral: S([]), crm: S([]) });
    expect(rev(r, "espontanea")).toBe(40);
    expect(rev(r, "garcom")).toBe(0);
  });
});
