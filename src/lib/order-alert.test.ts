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
  it("includes only PENDING, non-payment-pending orders", () => {
    const orders = [
      { id: "o1", status: "PENDING" },
      { id: "o2", status: "AWAITING_PAYMENT" },
      { id: "o3", status: "PENDING", paymentProviderName: "mercadopago", paymentStatus: "LINK_SENT" },
      { id: "o4", status: "CONFIRMED" },
      { id: "o5", status: "PENDING" },
    ];
    expect(pendingActionOrderIds(orders)).toEqual(["o1", "o5"]);
  });
  it("empty list -> empty result", () => {
    expect(pendingActionOrderIds([])).toEqual([]);
  });
});
