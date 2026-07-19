/**
 * confirmSumUpPayment — the money-touching path. Critical properties:
 *   - marks PAID only after re-verifying with SumUp (client "success" is NOT trusted)
 *   - idempotent when already paid
 *   - not_found for unknown / non-SumUp payments
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const h = vi.hoisted(() => ({
  paymentFindUnique: vi.fn(),
  paymentFindFirst:  vi.fn(),
  orderFindUnique:   vi.fn(),
  txPaymentUpdate:   vi.fn(),
  txOrderUpdate:     vi.fn(),
  getSumUpCheckout:  vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    payment:   { findUnique: h.paymentFindUnique, findFirst: h.paymentFindFirst },
    order:     { findUnique: h.orderFindUnique, updateMany: vi.fn(async () => ({ count: 0 })) },
    promotion: { update: vi.fn() },
    orderDraft:{ updateMany: vi.fn(async () => ({ count: 0 })) },
    $transaction: vi.fn(async (fn: (tx: unknown) => unknown) =>
      fn({ payment: { update: h.txPaymentUpdate }, order: { update: h.txOrderUpdate } })),
  },
}));
vi.mock("@/lib/sumup", () => ({ getSumUpCheckout: h.getSumUpCheckout }));
vi.mock("@/services/payment/paymentCredentials", () => ({
  getSumUpCredentials: vi.fn(async () => ({ apiKey: "sup_sk", merchantCode: "MC" })),
}));
vi.mock("@/services/crm/CustomerMetricsSyncService", () => ({
  CustomerMetricsSyncService: { syncOrderToCustomerMetrics: vi.fn(async () => {}) },
}));
vi.mock("@/services/crm/CustomerCouponService", () => ({
  CustomerCouponService: { consumeForPaidOrder: vi.fn(async () => {}) },
}));
vi.mock("@/services/print/PrintQueueService", () => ({
  PrintQueueService: { maybeEnqueueOrder: vi.fn(async () => {}) },
}));

import { confirmSumUpPayment } from "@/services/payment/confirmCardPayment";

const basePayment = {
  id: "pay1", status: "LINK_SENT", amount: 50,
  providerName: "sumup", providerReference: "chk_1",
  order: { id: "ord1", restaurantId: "r1", status: "AWAITING_PAYMENT", customerId: null },
};

beforeEach(() => {
  vi.clearAllMocks();
  h.orderFindUnique.mockResolvedValue({ promotionId: null, couponUsageCountedAt: null });
});

describe("confirmSumUpPayment", () => {
  it("marks paid + confirms the order only after SumUp says PAID", async () => {
    h.paymentFindUnique.mockResolvedValue({ ...basePayment });
    h.getSumUpCheckout.mockResolvedValue({ id: "chk_1", status: "PAID", amount: 50, last4: "4242", brand: "VISA", installments: 1 });

    const r = await confirmSumUpPayment({ orderId: "ord1" });

    expect(r).toBe("confirmed");
    expect(h.getSumUpCheckout).toHaveBeenCalledWith({ apiKey: "sup_sk", merchantCode: "MC" }, "chk_1");
    expect(h.txPaymentUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: "PAID", cardLast4: "4242", installments: 1 }) })
    );
    expect(h.txOrderUpdate).toHaveBeenCalled();
  });

  it("does NOT mark paid when SumUp is not PAID (client success is not trusted)", async () => {
    h.paymentFindUnique.mockResolvedValue({ ...basePayment });
    h.getSumUpCheckout.mockResolvedValue({ id: "chk_1", status: "PENDING" });

    const r = await confirmSumUpPayment({ orderId: "ord1" });

    expect(r).toBe("not_paid");
    expect(h.txPaymentUpdate).not.toHaveBeenCalled();
    expect(h.txOrderUpdate).not.toHaveBeenCalled();
  });

  it("is idempotent — already paid short-circuits without hitting SumUp", async () => {
    h.paymentFindUnique.mockResolvedValue({ ...basePayment, status: "PAID" });
    const r = await confirmSumUpPayment({ orderId: "ord1" });
    expect(r).toBe("already_paid");
    expect(h.getSumUpCheckout).not.toHaveBeenCalled();
  });

  it("returns not_found for unknown order or non-SumUp payment", async () => {
    h.paymentFindUnique.mockResolvedValue(null);
    expect(await confirmSumUpPayment({ orderId: "nope" })).toBe("not_found");

    h.paymentFindUnique.mockResolvedValue({ ...basePayment, providerName: "mercadopago" });
    expect(await confirmSumUpPayment({ orderId: "ord1" })).toBe("not_found");
  });
});
