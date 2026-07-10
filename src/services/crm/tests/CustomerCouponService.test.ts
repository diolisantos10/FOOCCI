import { describe, it, expect, beforeEach, vi } from "vitest";

const db = vi.hoisted(() => ({
  promotion:      { findFirst: vi.fn() },
  customerCoupon: { findFirst: vi.fn(), create: vi.fn(), findMany: vi.fn() },
}));
vi.mock("@/lib/prisma", () => ({ prisma: db }));

import { CustomerCouponService, computeCouponExpiry } from "../CustomerCouponService";

const NOW = new Date("2026-07-10T12:00:00Z");

beforeEach(() => {
  vi.clearAllMocks();
  db.promotion.findFirst.mockResolvedValue({ id: "promo1", couponValidityDays: null, endsAt: null });
  db.customerCoupon.findFirst.mockResolvedValue(null);
  db.customerCoupon.create.mockResolvedValue({ id: "cc1" });
});

describe("computeCouponExpiry", () => {
  it("uses couponValidityDays from grant when set", () => {
    const exp = computeCouponExpiry(NOW, { couponValidityDays: 10, endsAt: null });
    expect(exp.getTime()).toBe(NOW.getTime() + 10 * 86_400_000);
  });
  it("falls back to endsAt when no validity days", () => {
    const ends = new Date("2026-08-01T00:00:00Z");
    expect(computeCouponExpiry(NOW, { couponValidityDays: null, endsAt: ends }).getTime()).toBe(ends.getTime());
  });
  it("defaults to 30 days when nothing is set", () => {
    const exp = computeCouponExpiry(NOW, {});
    expect(exp.getTime()).toBe(NOW.getTime() + 30 * 86_400_000);
  });
});

describe("CustomerCouponService.grant", () => {
  it("credits the coupon into the wallet with a computed expiry", async () => {
    db.promotion.findFirst.mockResolvedValue({ id: "promo1", couponValidityDays: 15, endsAt: null });
    const r = await CustomerCouponService.grant({ restaurantId: "r1", customerId: "c1", couponCode: "volteI10", sourceCampaignId: "camp1", now: NOW });
    expect(r.granted).toBe(true);
    expect(db.customerCoupon.create).toHaveBeenCalledOnce();
    const data = db.customerCoupon.create.mock.calls[0]![0].data;
    expect(data.couponCode).toBe("VOLTEI10");           // uppercased
    expect(data.customerId).toBe("c1");
    expect(data.sourceCampaignId).toBe("camp1");
    expect(data.expiresAt.getTime()).toBe(NOW.getTime() + 15 * 86_400_000);
  });

  it("skips when the coupon code has no active promotion", async () => {
    db.promotion.findFirst.mockResolvedValue(null);
    const r = await CustomerCouponService.grant({ restaurantId: "r1", customerId: "c1", couponCode: "GHOST", now: NOW });
    expect(r).toEqual({ granted: false, reason: "NO_PROMOTION" });
    expect(db.customerCoupon.create).not.toHaveBeenCalled();
  });

  it("does not duplicate an active, unexpired coupon the customer already holds", async () => {
    db.customerCoupon.findFirst.mockResolvedValue({ id: "existing" });
    const r = await CustomerCouponService.grant({ restaurantId: "r1", customerId: "c1", couponCode: "VOLTEI10", now: NOW });
    expect(r).toEqual({ granted: false, reason: "ALREADY_HAS" });
    expect(db.customerCoupon.create).not.toHaveBeenCalled();
  });

  it("ignores an empty coupon code", async () => {
    const r = await CustomerCouponService.grant({ restaurantId: "r1", customerId: "c1", couponCode: "  ", now: NOW });
    expect(r).toEqual({ granted: false, reason: "NO_PROMOTION" });
    expect(db.promotion.findFirst).not.toHaveBeenCalled();
  });
});

describe("CustomerCouponService.listActive", () => {
  it("returns active, non-expired coupons shaped for the cart", async () => {
    db.customerCoupon.findMany.mockResolvedValue([
      { id: "cc1", couponCode: "VOLTEI10", expiresAt: new Date("2026-08-01"), grantedAt: NOW,
        promotion: { name: "Volte 10%", type: "PERCENTAGE", discountValue: 10 } },
    ]);
    const list = await CustomerCouponService.listActive("r1", "c1", NOW);
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ code: "VOLTEI10", name: "Volte 10%", type: "PERCENTAGE", discount: 10 });
  });
});
