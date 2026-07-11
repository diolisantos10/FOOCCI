import { describe, it, expect, beforeEach, vi } from "vitest";

const db = vi.hoisted(() => ({
  customerCoupon: { findFirst: vi.fn(), create: vi.fn(), findMany: vi.fn(), updateMany: vi.fn(), aggregate: vi.fn() },
  order:          { findUnique: vi.fn() },
}));
vi.mock("@/lib/prisma", () => ({ prisma: db }));

import { CustomerCouponService, computeCouponExpiry, couponRefCode, estimateCouponCost } from "../CustomerCouponService";

const NOW = new Date("2026-07-10T12:00:00Z");

beforeEach(() => {
  vi.clearAllMocks();
  db.customerCoupon.findFirst.mockResolvedValue(null);
  db.customerCoupon.create.mockResolvedValue({ id: "cc1" });
  db.customerCoupon.aggregate.mockResolvedValue({ _sum: { costEstimate: 0 } });
});

describe("computeCouponExpiry", () => {
  it("uses validityDays when set", () => {
    expect(computeCouponExpiry(NOW, 10).getTime()).toBe(NOW.getTime() + 10 * 86_400_000);
  });
  it("defaults to 30 days when unset or invalid", () => {
    expect(computeCouponExpiry(NOW).getTime()).toBe(NOW.getTime() + 30 * 86_400_000);
    expect(computeCouponExpiry(NOW, 0).getTime()).toBe(NOW.getTime() + 30 * 86_400_000);
  });
});

describe("couponRefCode", () => {
  it("labels percentage and fixed coupons", () => {
    expect(couponRefCode({ type: "PERCENTAGE", value: 20 })).toBe("20OFF");
    expect(couponRefCode({ type: "FIXED", value: 10 })).toBe("R$10");
  });
  it("labels a custom reward as BRINDE", () => {
    expect(couponRefCode({ type: "CUSTOM", value: 12 })).toBe("BRINDE");
  });
});

describe("estimateCouponCost", () => {
  it("uses the R$ value for fixed and custom coupons", () => {
    expect(estimateCouponCost({ type: "FIXED", value: 10 }, 50)).toBe(10);
    expect(estimateCouponCost({ type: "CUSTOM", value: 8 }, 50)).toBe(8);
  });
  it("estimates percentage coupons from the average ticket", () => {
    expect(estimateCouponCost({ type: "PERCENTAGE", value: 20 }, 50)).toBe(10);
    expect(estimateCouponCost({ type: "PERCENTAGE", value: 15 }, 40)).toBe(6);
  });
  it("never returns a negative cost", () => {
    expect(estimateCouponCost({ type: "FIXED", value: -5 }, 50)).toBe(0);
  });
});

describe("CustomerCouponService.grant", () => {
  it("credits a card-defined percentage coupon with a computed expiry", async () => {
    const r = await CustomerCouponService.grant({
      restaurantId: "r1", customerId: "c1",
      coupon: { type: "PERCENTAGE", value: 20 }, validityDays: 15, sourceCampaignId: "camp1", now: NOW,
    });
    expect(r).toMatchObject({ granted: true });
    const data = db.customerCoupon.create.mock.calls[0]![0].data;
    expect(data.discountType).toBe("PERCENTAGE");
    expect(data.discountValue).toBe(20);
    expect(data.couponCode).toBe("20OFF");
    expect(data.promotionId).toBeNull();
    expect(data.sourceCampaignId).toBe("camp1");
    expect(data.expiresAt.getTime()).toBe(NOW.getTime() + 15 * 86_400_000);
  });

  it("credits a fixed R$ coupon", async () => {
    await CustomerCouponService.grant({ restaurantId: "r1", customerId: "c1", coupon: { type: "FIXED", value: 10 }, now: NOW });
    const data = db.customerCoupon.create.mock.calls[0]![0].data;
    expect(data.discountType).toBe("FIXED");
    expect(data.discountValue).toBe(10);
  });

  it("ignores a zero/absent coupon", async () => {
    const r = await CustomerCouponService.grant({ restaurantId: "r1", customerId: "c1", coupon: { type: "PERCENTAGE", value: 0 }, now: NOW });
    expect(r).toEqual({ granted: false, reason: "NO_COUPON" });
    expect(db.customerCoupon.create).not.toHaveBeenCalled();
  });

  it("grants a CUSTOM reward defined by its text even when the cost is 0", async () => {
    const r = await CustomerCouponService.grant({
      restaurantId: "r1", customerId: "c1",
      coupon: { type: "CUSTOM", value: 0, description: "sobremesa grátis" }, now: NOW,
    });
    expect(r).toMatchObject({ granted: true });
    const data = db.customerCoupon.create.mock.calls[0]![0].data;
    expect(data.discountType).toBe("CUSTOM");
    expect(data.description).toBe("sobremesa grátis");
    expect(data.couponCode).toBe("BRINDE");
    expect(data.costEstimate).toBe(0);
  });

  it("rejects a CUSTOM reward with no text", async () => {
    const r = await CustomerCouponService.grant({
      restaurantId: "r1", customerId: "c1", coupon: { type: "CUSTOM", value: 5, description: "  " }, now: NOW,
    });
    expect(r).toEqual({ granted: false, reason: "NO_COUPON" });
    expect(db.customerCoupon.create).not.toHaveBeenCalled();
  });

  it("does not grant the same campaign's coupon twice to a customer", async () => {
    db.customerCoupon.findFirst.mockResolvedValue({ id: "existing" });
    const r = await CustomerCouponService.grant({
      restaurantId: "r1", customerId: "c1", coupon: { type: "PERCENTAGE", value: 20 }, sourceCampaignId: "camp1", now: NOW,
    });
    expect(r).toEqual({ granted: false, reason: "ALREADY_HAS" });
    expect(db.customerCoupon.create).not.toHaveBeenCalled();
  });

  it("stores the estimated cost and custom reward description", async () => {
    await CustomerCouponService.grant({
      restaurantId: "r1", customerId: "c1",
      coupon: { type: "CUSTOM", value: 8, description: "sobremesa grátis" }, avgTicket: 50, now: NOW,
    });
    const data = db.customerCoupon.create.mock.calls[0]![0].data;
    expect(data.description).toBe("sobremesa grátis");
    expect(data.costEstimate).toBe(8);
  });

  it("credits within the monthly budget, charging the estimated cost", async () => {
    db.customerCoupon.aggregate.mockResolvedValue({ _sum: { costEstimate: 40 } });
    const r = await CustomerCouponService.grant({
      restaurantId: "r1", customerId: "c1", coupon: { type: "FIXED", value: 10 },
      monthlyBudget: 100, avgTicket: 50, now: NOW,
    });
    expect(r).toMatchObject({ granted: true });
    expect(db.customerCoupon.create).toHaveBeenCalled();
  });

  it("stops granting once the coupon would exceed the monthly budget", async () => {
    db.customerCoupon.aggregate.mockResolvedValue({ _sum: { costEstimate: 95 } });
    const r = await CustomerCouponService.grant({
      restaurantId: "r1", customerId: "c1", coupon: { type: "FIXED", value: 10 },
      monthlyBudget: 100, avgTicket: 50, now: NOW,
    });
    expect(r).toEqual({ granted: false, reason: "BUDGET_EXCEEDED" });
    expect(db.customerCoupon.create).not.toHaveBeenCalled();
  });

  it("ignores the budget when it is 0 (off)", async () => {
    db.customerCoupon.aggregate.mockResolvedValue({ _sum: { costEstimate: 9999 } });
    const r = await CustomerCouponService.grant({
      restaurantId: "r1", customerId: "c1", coupon: { type: "FIXED", value: 10 }, monthlyBudget: 0, now: NOW,
    });
    expect(r).toMatchObject({ granted: true });
  });
});

describe("CustomerCouponService.monthlySpend", () => {
  it("sums the estimated cost of coupons granted since the month start", async () => {
    db.customerCoupon.aggregate.mockResolvedValue({ _sum: { costEstimate: 37.5 } });
    const spent = await CustomerCouponService.monthlySpend("r1", NOW);
    expect(spent).toBe(37.5);
    const where = db.customerCoupon.aggregate.mock.calls[0]![0].where;
    expect(where.restaurantId).toBe("r1");
    expect(where.grantedAt.gte).toEqual(new Date(NOW.getFullYear(), NOW.getMonth(), 1));
  });
  it("returns 0 when nothing was granted", async () => {
    db.customerCoupon.aggregate.mockResolvedValue({ _sum: { costEstimate: null } });
    expect(await CustomerCouponService.monthlySpend("r1", NOW)).toBe(0);
  });
  it("excludes expired-unused coupons from the committed amount (reserve returns)", async () => {
    db.customerCoupon.aggregate.mockResolvedValue({ _sum: { costEstimate: 10 } });
    await CustomerCouponService.monthlySpend("r1", NOW);
    const where = db.customerCoupon.aggregate.mock.calls[0]![0].where;
    // Only USED, or ACTIVE-and-not-expired, count against the budget.
    expect(where.OR).toEqual([
      { status: "USED" },
      { status: "ACTIVE", OR: [{ expiresAt: null }, { expiresAt: { gt: NOW } }] },
    ]);
  });
});

describe("CustomerCouponService.monthlyUsedStats", () => {
  it("counts only coupons actually redeemed this month (real spend)", async () => {
    db.customerCoupon.aggregate.mockResolvedValue({ _sum: { costEstimate: 24 }, _count: { id: 3 } });
    const r = await CustomerCouponService.monthlyUsedStats("r1", NOW);
    expect(r).toEqual({ count: 3, spend: 24 });
    const where = db.customerCoupon.aggregate.mock.calls[0]![0].where;
    expect(where).toMatchObject({ restaurantId: "r1", status: "USED" });
    expect(where.usedAt.gte).toEqual(new Date(NOW.getFullYear(), NOW.getMonth(), 1));
  });
});

describe("CustomerCouponService.findRedeemable", () => {
  it("returns a shaped coupon when active, owned and unexpired", async () => {
    db.customerCoupon.findFirst.mockResolvedValue({ id: "cc1", discountType: "PERCENTAGE", discountValue: 20 });
    const r = await CustomerCouponService.findRedeemable("r1", "c1", "cc1", NOW);
    expect(r).toEqual({ id: "cc1", discountType: "PERCENTAGE", discountValue: 20 });
    // Query scopes to restaurant + customer + ACTIVE + not-expired.
    const where = db.customerCoupon.findFirst.mock.calls[0]![0].where;
    expect(where).toMatchObject({ id: "cc1", restaurantId: "r1", customerId: "c1", status: "ACTIVE" });
  });
  it("returns null when not found / not redeemable", async () => {
    db.customerCoupon.findFirst.mockResolvedValue(null);
    expect(await CustomerCouponService.findRedeemable("r1", "c1", "x", NOW)).toBeNull();
  });
});

describe("CustomerCouponService.markUsed", () => {
  it("consumes only an ACTIVE coupon and reports success", async () => {
    db.customerCoupon.updateMany.mockResolvedValue({ count: 1 });
    const ok = await CustomerCouponService.markUsed({ couponId: "cc1", customerId: "c1", orderId: "o1", now: NOW });
    expect(ok).toBe(true);
    const args = db.customerCoupon.updateMany.mock.calls[0]![0];
    expect(args.where).toMatchObject({ id: "cc1", customerId: "c1", status: "ACTIVE" });
    expect(args.data).toMatchObject({ status: "USED", usedOrderId: "o1" });
  });
  it("is idempotent — a second call consumes nothing", async () => {
    db.customerCoupon.updateMany.mockResolvedValue({ count: 0 });
    expect(await CustomerCouponService.markUsed({ couponId: "cc1", customerId: "c1", orderId: "o1" })).toBe(false);
  });
});

describe("CustomerCouponService.consumeForPaidOrder", () => {
  it("marks the order's wallet coupon USED on payment approval", async () => {
    db.order.findUnique.mockResolvedValue({ customerCouponId: "cc1", customerId: "c1" });
    db.customerCoupon.updateMany.mockResolvedValue({ count: 1 });
    expect(await CustomerCouponService.consumeForPaidOrder("o1")).toBe(true);
    expect(db.customerCoupon.updateMany.mock.calls[0]![0].where).toMatchObject({ id: "cc1", customerId: "c1", status: "ACTIVE" });
  });
  it("no-ops when the order has no wallet coupon", async () => {
    db.order.findUnique.mockResolvedValue({ customerCouponId: null, customerId: "c1" });
    expect(await CustomerCouponService.consumeForPaidOrder("o1")).toBe(false);
    expect(db.customerCoupon.updateMany).not.toHaveBeenCalled();
  });
});

describe("CustomerCouponService.restoreForOrder", () => {
  it("restores coupons consumed by a deleted order back to ACTIVE", async () => {
    db.customerCoupon.updateMany.mockResolvedValue({ count: 2 });
    const n = await CustomerCouponService.restoreForOrder("o1");
    expect(n).toBe(2);
    const args = db.customerCoupon.updateMany.mock.calls[0]![0];
    expect(args.where).toMatchObject({ usedOrderId: "o1", status: "USED" });
    expect(args.data).toMatchObject({ status: "ACTIVE", usedOrderId: null });
  });
});

describe("CustomerCouponService.listActive", () => {
  it("shapes active coupons for the cart from the self-contained discount", async () => {
    db.customerCoupon.findMany.mockResolvedValue([
      { id: "cc1", couponCode: "20OFF", discountType: "PERCENTAGE", discountValue: 20, description: null, expiresAt: new Date("2026-08-01"), grantedAt: NOW },
      { id: "cc2", couponCode: "R$10", discountType: "FIXED", discountValue: 10, description: null, expiresAt: null, grantedAt: NOW },
    ]);
    const list = await CustomerCouponService.listActive("r1", "c1", NOW);
    expect(list[0]).toMatchObject({ code: "20OFF", discountType: "PERCENTAGE", discountValue: 20, label: "20% OFF", isReward: false });
    expect(list[1]).toMatchObject({ discountType: "FIXED", discountValue: 10, label: "R$ 10 OFF", isReward: false });
  });

  it("shapes a CUSTOM reward as a manual brinde — no money discount", async () => {
    db.customerCoupon.findMany.mockResolvedValue([
      { id: "cc3", couponCode: "BRINDE", discountType: "CUSTOM", discountValue: 8, description: "sobremesa grátis", expiresAt: null, grantedAt: NOW },
    ]);
    const list = await CustomerCouponService.listActive("r1", "c1", NOW);
    expect(list[0]).toMatchObject({
      discountType: "CUSTOM", discountValue: 0, isReward: true,
      description: "sobremesa grátis", label: "sobremesa grátis",
    });
  });
});
