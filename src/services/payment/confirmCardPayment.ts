/**
 * confirmSumUpPayment — the single source of truth for confirming a SumUp card
 * payment. Called by BOTH the client-driven /card/confirm endpoint and the
 * SumUp webhook, so confirmation is idempotent and consistent regardless of who
 * reports it first.
 *
 * It NEVER trusts the caller's "success": it re-fetches the checkout from SumUp
 * server-side and only marks paid when SumUp itself says PAID. Side-effects
 * mirror the Mercado Pago Pix confirmation (confirmMpPayment): order → CONFIRMED,
 * print enqueue, coupon usage, wallet coupon consume, CRM sync, draft close.
 */

import { prisma } from "@/lib/prisma";
import { Decimal } from "@prisma/client/runtime/library";
import { getSumUpCredentials } from "./paymentCredentials";
import { getSumUpCheckout } from "@/lib/sumup";
import { CustomerMetricsSyncService } from "@/services/crm/CustomerMetricsSyncService";
import { CustomerCouponService } from "@/services/crm/CustomerCouponService";
import { PrintQueueService } from "@/services/print/PrintQueueService";
import { FiscalEmissionService } from "@/services/fiscal/FiscalEmissionService";

const LOG = "[sumup-confirm]";

export type ConfirmCardResult =
  | "confirmed"
  | "already_paid"
  | "not_paid"
  | "not_found"
  | "error";

export interface CardPaymentLocator {
  orderId?: string;     // preferred — the client's stable handle (Payment.orderId is @unique)
  checkoutId?: string;  // used by the webhook (SumUp references the checkout)
}

export async function confirmSumUpPayment(loc: CardPaymentLocator): Promise<ConfirmCardResult> {
  const include = {
    order: { select: { id: true, restaurantId: true, status: true, customerId: true } },
  } as const;

  const payment = loc.orderId
    ? await prisma.payment.findUnique({ where: { orderId: loc.orderId }, include })
    : loc.checkoutId
      ? await prisma.payment.findFirst({
          where: { providerReference: loc.checkoutId, providerName: "sumup" },
          include,
        })
      : null;

  if (!payment || !payment.order || payment.providerName !== "sumup") return "not_found";
  const order = payment.order;

  if (payment.status === "PAID") return "already_paid";

  const checkoutId = payment.providerReference;
  if (!checkoutId) return "not_found";

  // Re-verify server-side — the client's onResponse "success" is NOT proof.
  const creds = await getSumUpCredentials(order.restaurantId);
  if (!creds) {
    console.warn(LOG, "no sumup credentials for restaurant", { restaurantId: order.restaurantId });
    return "error";
  }

  let checkout;
  try {
    checkout = await getSumUpCheckout(
      { apiKey: creds.apiKey, merchantCode: creds.merchantCode },
      checkoutId,
    );
  } catch (e) {
    console.warn(LOG, "getSumUpCheckout failed", { checkoutId, error: e instanceof Error ? e.message : String(e) });
    return "error";
  }

  if (checkout.status.toUpperCase() !== "PAID") return "not_paid";

  // Only advance an order still waiting for payment — never downgrade one already
  // in the operational flow (PREPARING/READY/…).
  const orderNeedsStatusAdvance = ["PENDING", "AWAITING_PAYMENT"].includes(order.status);

  await prisma.$transaction(async (tx) => {
    await tx.payment.update({
      where: { id: payment.id },
      data: {
        status:       "PAID",
        paidAt:       new Date(),
        amount:       new Decimal(checkout.amount ?? Number(payment.amount)),
        cardBrand:    checkout.brand ?? null,
        cardLast4:    checkout.last4 ?? null,
        installments: checkout.installments ?? null,
      },
    });
    if (orderNeedsStatusAdvance) {
      await tx.order.update({ where: { id: order.id }, data: { status: "CONFIRMED" } });
    }
  });

  console.info(LOG, "order confirmed", { orderId: order.id });

  if (orderNeedsStatusAdvance) {
    PrintQueueService.maybeEnqueueOrder(order.restaurantId, order.id).catch((e) =>
      console.error("[print] sumup confirm enqueue failed:", e),
    );
    // Fire-and-forget: emit the NFC-e (no-op unless the restaurant enabled it).
    FiscalEmissionService.maybeEmitForOrder(order.restaurantId, order.id).catch((e) =>
      console.error("[fiscal] sumup confirm emit failed:", e),
    );
  }

  // Idempotent coupon usage (promotion) — updateMany WHERE couponUsageCountedAt IS NULL wins the race.
  const orderForCoupon = await prisma.order.findUnique({
    where:  { id: order.id },
    select: { promotionId: true, couponUsageCountedAt: true },
  });
  if (orderForCoupon?.promotionId && !orderForCoupon.couponUsageCountedAt) {
    const stamped = await prisma.order.updateMany({
      where: { id: order.id, couponUsageCountedAt: null },
      data:  { couponUsageCountedAt: new Date() },
    });
    if (stamped.count > 0) {
      await prisma.promotion.update({
        where: { id: orderForCoupon.promotionId },
        data:  { usedCount: { increment: 1 } },
      });
    }
  }

  // Wallet coupon (iFood-style) — consume on payment approval. Idempotent.
  await CustomerCouponService.consumeForPaidOrder(order.id).catch((e) =>
    console.error("[sumup confirm] wallet coupon consume failed:", e),
  );

  // crmSyncedAt guards against double-counting.
  await CustomerMetricsSyncService.syncOrderToCustomerMetrics(order.id, "sumup_confirm");

  // Close any OPEN draft so abandonment recovery doesn't fire for a paid order.
  if (order.customerId) {
    void prisma.orderDraft.updateMany({
      where: { restaurantId: order.restaurantId, customerId: order.customerId, status: "OPEN" },
      data:  { status: "CONFIRMED", confirmedAt: new Date() },
    }).catch((err) =>
      console.warn(LOG, "draft close failed after payment", {
        orderId: order.id, error: err instanceof Error ? err.message : String(err),
      }),
    );
  }

  return "confirmed";
}
