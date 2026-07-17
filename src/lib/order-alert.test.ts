import { describe, it, expect } from "vitest";
import {
  isPaymentPendingOrder,
  pendingActionOrderIds,
  PENDING_ORDER_SOUND_MAX_AGE_MS,
  CONFIRMED_ORDER_SOUND_MAX_AGE_MS,
} from "@/lib/order-alert";

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
  const now = 100_000_000;
  const iso = (msAgo: number) => new Date(now - msAgo).toISOString();

  it("rings for newly-arrived orders — PENDING AND CONFIRMED — minus payment-pending", () => {
    const orders = [
      { id: "o1", status: "PENDING",   createdAt: iso(60_000) },
      { id: "o2", status: "AWAITING_PAYMENT", createdAt: iso(60_000) },
      { id: "o3", status: "PENDING",   createdAt: iso(60_000), paymentProviderName: "mercadopago", paymentStatus: "LINK_SENT" },
      { id: "o4", status: "CONFIRMED", createdAt: iso(60_000) }, // pay-on-delivery lands here — MUST ring
      { id: "o5", status: "PENDING",   createdAt: iso(60_000) },
    ];
    expect(pendingActionOrderIds(orders, { now })).toEqual(["o1", "o4", "o5"]);
  });

  it("does NOT ring for orders already being handled (PREPARING/READY/…)", () => {
    const orders = [
      { id: "a", status: "PREPARING",        createdAt: iso(60_000) },
      { id: "b", status: "READY",            createdAt: iso(60_000) },
      { id: "c", status: "OUT_FOR_DELIVERY", createdAt: iso(60_000) },
      { id: "d", status: "DELIVERED",        createdAt: iso(60_000) },
      { id: "e", status: "CANCELLED",        createdAt: iso(60_000) },
      { id: "f", status: "CONFIRMED",        createdAt: iso(60_000) }, // only this one is "new"
    ];
    expect(pendingActionOrderIds(orders, { now })).toEqual(["f"]);
  });

  it("empty list -> empty result", () => {
    expect(pendingActionOrderIds([])).toEqual([]);
  });

  describe("per-status sound windows", () => {
    it("PENDING rings up to 15 min, then auto-quiets", () => {
      const orders = [
        { id: "fresh", status: "PENDING", createdAt: iso(PENDING_ORDER_SOUND_MAX_AGE_MS - 60_000) },
        { id: "stale", status: "PENDING", createdAt: iso(PENDING_ORDER_SOUND_MAX_AGE_MS + 60_000) },
      ];
      expect(pendingActionOrderIds(orders, { now })).toEqual(["fresh"]);
    });

    it("CONFIRMED rings up to 3 min, then auto-quiets (heads-up only)", () => {
      const orders = [
        { id: "fresh", status: "CONFIRMED", createdAt: iso(CONFIRMED_ORDER_SOUND_MAX_AGE_MS - 30_000) },
        { id: "stale", status: "CONFIRMED", createdAt: iso(CONFIRMED_ORDER_SOUND_MAX_AGE_MS + 30_000) },
      ];
      expect(pendingActionOrderIds(orders, { now })).toEqual(["fresh"]);
    });

    it("a 10-min-old CONFIRMED is quiet while a 10-min-old PENDING still rings", () => {
      const orders = [
        { id: "c", status: "CONFIRMED", createdAt: iso(10 * 60_000) },
        { id: "p", status: "PENDING",   createdAt: iso(10 * 60_000) },
      ];
      expect(pendingActionOrderIds(orders, { now })).toEqual(["p"]);
    });

    it("missing/invalid timestamp fails toward ringing, not silence", () => {
      const orders = [
        { id: "x", status: "CONFIRMED" },
        { id: "y", status: "PENDING", createdAt: "not-a-date" },
      ];
      expect(pendingActionOrderIds(orders, { now })).toEqual(["x", "y"]);
    });
  });
});
