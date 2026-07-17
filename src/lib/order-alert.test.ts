import { describe, it, expect } from "vitest";
import { isPaymentPendingOrder, pendingActionOrderIds } from "@/lib/order-alert";

describe("isPaymentPendingOrder", () => {
  it("AWAITING_PAYMENT is always payment-pending", () => {
    expect(isPaymentPendingOrder({ status: "AWAITING_PAYMENT" })).toBe(true);
  });
  it("mercadopago LINK_SENT/PENDING is payment-pending", () => {
    expect(isPaymentPendingOrder({ status: "PENDING", paymentProviderName: "mercadopago", paymentStatus: "LINK_SENT" })).toBe(true);
    expect(isPaymentPendingOrder({ status: "PENDING", paymentProviderName: "mercadopago", paymentStatus: "PENDING" })).toBe(true);
  });
  it("a normal PENDING order (no online payment) is NOT payment-pending", () => {
    expect(isPaymentPendingOrder({ status: "PENDING" })).toBe(false);
  });
  it("a paid mercadopago order is NOT payment-pending", () => {
    expect(isPaymentPendingOrder({ status: "CONFIRMED", paymentProviderName: "mercadopago", paymentStatus: "PAID" })).toBe(false);
  });
});

describe("pendingActionOrderIds", () => {
  it("rings for newly-arrived orders — PENDING AND CONFIRMED — minus payment-pending", () => {
    const orders = [
      { id: "o1", status: "PENDING" },
      { id: "o2", status: "AWAITING_PAYMENT" },
      { id: "o3", status: "PENDING", paymentProviderName: "mercadopago", paymentStatus: "LINK_SENT" },
      { id: "o4", status: "CONFIRMED" }, // pay-on-delivery lands here — MUST ring
      { id: "o5", status: "PENDING" },
    ];
    expect(pendingActionOrderIds(orders)).toEqual(["o1", "o4", "o5"]);
  });

  it("does NOT ring for orders already being handled (PREPARING/READY/…)", () => {
    const orders = [
      { id: "a", status: "PREPARING" },
      { id: "b", status: "READY" },
      { id: "c", status: "OUT_FOR_DELIVERY" },
      { id: "d", status: "DELIVERED" },
      { id: "e", status: "CANCELLED" },
      { id: "f", status: "CONFIRMED" }, // only this one is "new"
    ];
    expect(pendingActionOrderIds(orders)).toEqual(["f"]);
  });

  it("empty list -> empty result", () => {
    expect(pendingActionOrderIds([])).toEqual([]);
  });

  describe("recency safety-net (maxAgeMs)", () => {
    const now = 10_000_000;
    const iso = (ms: number) => new Date(ms).toISOString();

    it("keeps a fresh order but drops one older than the window", () => {
      const orders = [
        { id: "fresh", status: "CONFIRMED", createdAt: iso(now - 60_000) },       // 1 min old
        { id: "stale", status: "CONFIRMED", createdAt: iso(now - 30 * 60_000) },  // 30 min old
      ];
      expect(pendingActionOrderIds(orders, { now, maxAgeMs: 15 * 60_000 })).toEqual(["fresh"]);
    });

    it("with no window given, age is ignored (rings regardless)", () => {
      const orders = [{ id: "old", status: "CONFIRMED", createdAt: iso(now - 10 * 60 * 60_000) }];
      expect(pendingActionOrderIds(orders)).toEqual(["old"]);
    });

    it("missing/invalid timestamp fails toward ringing, not silence", () => {
      const orders = [{ id: "x", status: "CONFIRMED" }];
      expect(pendingActionOrderIds(orders, { now, maxAgeMs: 15 * 60_000 })).toEqual(["x"]);
    });
  });
});
