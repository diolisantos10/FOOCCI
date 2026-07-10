import { describe, it, expect, beforeEach, vi } from "vitest";

const db = vi.hoisted(() => ({
  order:             { findUnique: vi.fn() },
  customerCoupon:    { findUnique: vi.fn() },
  campaignExecution: { findFirst: vi.fn(), update: vi.fn() },
  campaign:          { update: vi.fn() },
  cRMActionLog:      { findFirst: vi.fn() },
  conversation:      { updateMany: vi.fn() },
  $transaction:      vi.fn(async (arr: unknown) => (Array.isArray(arr) ? Promise.all(arr as Promise<unknown>[]) : undefined)),
}));
vi.mock("@/lib/prisma", () => ({ prisma: db }));

import { CRMAttributionService } from "../CRMAttributionService";

const COUNTABLE_ORDER = {
  id: "o1", customerId: "c1", restaurantId: "r1", status: "CONFIRMED",
  total: 80, createdAt: new Date("2026-07-10T12:00:00Z"),
  customerCouponId: "cc1",
  payment: { paymentMode: "PAY_ON_DELIVERY", status: "PENDING" },
  customer: { isGuest: false },
};

beforeEach(() => {
  vi.clearAllMocks();
  db.order.findUnique.mockResolvedValue(COUNTABLE_ORDER);
  db.customerCoupon.findUnique.mockResolvedValue({ sourceCampaignId: "camp1" });
  db.campaignExecution.findFirst.mockResolvedValue({ id: "e1" });
  db.campaignExecution.update.mockResolvedValue({});
  db.campaign.update.mockResolvedValue({});
  db.cRMActionLog.findFirst.mockResolvedValue(null);
  db.conversation.updateMany.mockResolvedValue({ count: 1 });
});

describe("CRMAttributionService — coupon path (Priority 0)", () => {
  it("attributes a coupon order to the coupon's source campaign", async () => {
    const r = await CRMAttributionService.attributeOrderToRecentCrmAction("o1");
    expect(r).toMatchObject({ result: "attributed_campaign", campaignId: "camp1", revenue: 80 });
    // Campaign counters bumped by the order revenue.
    const bump = db.campaign.update.mock.calls[0]![0];
    expect(bump.where).toEqual({ id: "camp1" });
    expect(bump.data.totalConverted).toEqual({ increment: 1 });
    // The matching execution is closed so a later organic order can't re-count.
    const execUpd = db.campaignExecution.update.mock.calls[0]![0];
    expect(execUpd.data).toMatchObject({ converted: true, convertedOrderId: "o1" });
    // Coupon path wins — the CRMActionLog fallback is never queried.
    expect(db.cRMActionLog.findFirst).not.toHaveBeenCalled();
    // Purchase closes the CRM cycle — the chat's CRM tag is reset to INBOUND.
    const clear = db.conversation.updateMany.mock.calls[0]![0];
    expect(clear.where).toMatchObject({ restaurantId: "r1", customerId: "c1" });
    expect(clear.data).toMatchObject({ contextType: "INBOUND", relatedCampaignId: null });
  });

  it("still attributes when there is no matching execution (bumps campaign only)", async () => {
    db.campaignExecution.findFirst.mockResolvedValue(null);
    const r = await CRMAttributionService.attributeOrderToRecentCrmAction("o1");
    expect(r).toMatchObject({ result: "attributed_campaign", campaignId: "camp1" });
    expect(db.campaignExecution.update).not.toHaveBeenCalled();
    expect(db.campaign.update).toHaveBeenCalledOnce();
  });

  it("falls through to the normal paths when the coupon has no source campaign", async () => {
    db.customerCoupon.findUnique.mockResolvedValue({ sourceCampaignId: null });
    await CRMAttributionService.attributeOrderToRecentCrmAction("o1");
    // No coupon-campaign → the coupon path is skipped and the CRMActionLog path runs.
    expect(db.cRMActionLog.findFirst).toHaveBeenCalled();
  });

  it("does not run the coupon path for an order with no wallet coupon", async () => {
    db.order.findUnique.mockResolvedValue({ ...COUNTABLE_ORDER, customerCouponId: null });
    await CRMAttributionService.attributeOrderToRecentCrmAction("o1");
    expect(db.customerCoupon.findUnique).not.toHaveBeenCalled();
    expect(db.cRMActionLog.findFirst).toHaveBeenCalled();
  });

  it("skips cancelled orders (never CRM revenue)", async () => {
    db.order.findUnique.mockResolvedValue({ ...COUNTABLE_ORDER, status: "CANCELLED" });
    const r = await CRMAttributionService.attributeOrderToRecentCrmAction("o1");
    expect(r.result).toBe("skipped_cancelled");
    expect(db.campaign.update).not.toHaveBeenCalled();
  });
});
