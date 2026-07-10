import { describe, it, expect, beforeEach, vi } from "vitest";

const db = vi.hoisted(() => ({
  customerCoupon: { findFirst: vi.fn(), create: vi.fn(), findMany: vi.fn(), updateMany: vi.fn() },
  order:          { findUnique: vi.fn() },
}));
vi.mock("@/lib/prisma", () => ({ prisma: db }));

import { CustomerCouponService, computeCouponExpiry, couponRefCode } from "../CustomerCouponService";

const NOW = new Date("2026-07-10T12:00:00Z");

beforeEach(() => {
  vi.clearAllMocks();
  db.customerCoupon.findFirst.mockResolvedValue(null);
  db.customerCoupon.create.mockResolvedValue({ id: "cc1" });
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

  it("does not grant the same campaign's coupon twice to a customer", async () => {
    db.customerCoupon.findFirst.mockResolvedValue({ id: "existing" });
    const r = await CustomerCouponService.grant({
      restaurantId: "r1", customerId: "c1", coupon: { type: "PERCENTAGE", value: 20 }, sourceCampaignId: "camp1", now: NOW,
    });
    expect(r).toEqual({ granted: false, reason: "ALREADY_HAS" });
    expect(db.customerCoupon.create).not.toHaveBeenCalled();
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
      { id: "cc1", couponCode: "20OFF", discountType: "PERCENTAGE", discountValue: 20, expiresAt: new Date("2026-08-01"), grantedAt: NOW },
      { id: "cc2", couponCode: "R$10", discountType: "FIXED", discountValue: 10, expiresAt: null, grantedAt: NOW },
    ]);
    const list = await CustomerCouponService.listActive("r1", "c1", NOW);
    expect(list[0]).toMatchObject({ code: "20OFF", discountType: "PERCENTAGE", discountValue: 20, label: "20% OFF" });
    expect(list[1]).toMatchObject({ discountType: "FIXED", discountValue: 10, label: "R$ 10 OFF" });
  });
});
