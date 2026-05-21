/**
 * POST /api/payments/mercadopago/webhook
 *
 * Receives IPN / webhook notifications from Mercado Pago.
 * Docs: https://www.mercadopago.com.br/developers/pt/docs/your-integrations/notifications/webhooks
 *
 * MP sends { type, data: { id } } where data.id is the PAYMENT ID (not preference ID).
 * We fetch the payment from the MP API to get external_reference (= orderId),
 * then look up and confirm the order.
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { decrypt } from "@/lib/crypto";
import { Decimal } from "@prisma/client/runtime/library";
import { CustomerMetricsSyncService } from "@/services/crm/CustomerMetricsSyncService";

async function getMpToken(restaurantId: string): Promise<string | null> {
  const cfg = await prisma.integrationConfig.findUnique({
    where: { restaurantId_provider: { restaurantId, provider: "mercadopago" } },
    select: { configBlob: true },
  });
  if (!cfg) return null;
  try {
    const raw = JSON.parse(decrypt(cfg.configBlob)) as { accessToken: string };
    return raw.accessToken ?? null;
  } catch {
    return null;
  }
}

export async function POST(req: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const type = body.type as string | undefined;

  // Only process payment events
  if (type !== "payment") {
    return NextResponse.json({ received: true });
  }

  const paymentId = (body.data as Record<string, unknown>)?.id as string | undefined;
  if (!paymentId) return NextResponse.json({ received: true });

  // Find the payment record by orderId (stored as external_reference in MP).
  // MP sends a payment.id in webhooks which differs from the preference ID we stored.
  // Strategy: look up all active MP payments and find the matching one via MP API.
  // More efficient: find order via our DB payment that has providerName=mercadopago
  // and status=LINK_SENT, then fetch each from MP until we find the matching payment.
  //
  // Better: fetch the payment directly from MP API using the payment ID,
  // extract external_reference (= orderId), then look up our order.

  // We need a token — find any active MP integration to start.
  // First try: find a payment record using providerReference = paymentId (unlikely to match)
  let payment = await prisma.payment.findFirst({
    where: { providerReference: paymentId, providerName: "mercadopago" },
    include: { order: { select: { id: true, restaurantId: true, status: true } } },
  });

  let mpPaymentData: Record<string, unknown> | null = null;

  if (!payment) {
    // Fetch from MP using any available token to get external_reference
    const activeMpCfgs = await prisma.integrationConfig.findMany({
      where: { provider: "mercadopago", isActive: true },
      select: { restaurantId: true, configBlob: true },
    });

    for (const cfg of activeMpCfgs) {
      let token: string;
      try {
        token = (JSON.parse(decrypt(cfg.configBlob)) as { accessToken: string }).accessToken;
      } catch { continue; }

      const mpRes = await fetch(`https://api.mercadopago.com/v1/payments/${paymentId}`, {
        headers: { Authorization: `Bearer ${token}` },
      }).catch(() => null);

      if (!mpRes?.ok) continue;
      const data = await mpRes.json().catch(() => null);
      if (!data) continue;

      // Verify this payment belongs to this restaurant's preference
      const externalRef = data.external_reference as string | undefined;
      if (!externalRef) continue;

      // Look up the order and its payment
      const orderRecord = await prisma.order.findFirst({
        where: { id: externalRef, restaurantId: cfg.restaurantId },
        select: { id: true, restaurantId: true, status: true },
      });
      if (!orderRecord) continue;

      const paymentRecord = await prisma.payment.findUnique({
        where: { orderId: externalRef },
        include: { order: { select: { id: true, restaurantId: true, status: true } } },
      });
      if (!paymentRecord) continue;

      payment = paymentRecord;
      mpPaymentData = data;
      break;
    }
  }

  if (!payment || !payment.order) {
    return NextResponse.json({ received: true });
  }

  // Fetch the payment status from MP if we haven't already
  if (!mpPaymentData) {
    const accessToken = await getMpToken(payment.order.restaurantId);
    if (!accessToken) return NextResponse.json({ received: true });

    const mpRes = await fetch(`https://api.mercadopago.com/v1/payments/${paymentId}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    }).catch(() => null);

    if (!mpRes?.ok) return NextResponse.json({ received: true });
    mpPaymentData = await mpRes.json().catch(() => null);
  }

  if (!mpPaymentData || mpPaymentData.status !== "approved") {
    return NextResponse.json({ received: true });
  }

  // Already confirmed — idempotent
  if (payment.status === "PAID") {
    return NextResponse.json({ received: true });
  }

  // Mark payment as paid and advance order
  await prisma.$transaction([
    prisma.payment.update({
      where: { id: payment.id },
      data: {
        status: "PAID",
        paidAt: new Date(),
        amount: new Decimal(
          (mpPaymentData.transaction_amount as number) ?? Number(payment.amount)
        ),
      },
    }),
    prisma.order.update({
      where: { id: payment.order.id },
      data: { status: "CONFIRMED" },
    }),
  ]);

  // Idempotent coupon usage count: increment Promotion.usedCount only once per order,
  // regardless of how many times the webhook fires. The updateMany WHERE couponUsageCountedAt IS NULL
  // ensures only the first caller wins the race; subsequent calls are no-ops.
  const orderForCoupon = await prisma.order.findUnique({
    where:  { id: payment.order.id },
    select: { promotionId: true, couponUsageCountedAt: true },
  });
  if (orderForCoupon?.promotionId && !orderForCoupon.couponUsageCountedAt) {
    const stamped = await prisma.order.updateMany({
      where: { id: payment.order.id, couponUsageCountedAt: null },
      data:  { couponUsageCountedAt: new Date() },
    });
    if (stamped.count > 0) {
      await prisma.promotion.update({
        where: { id: orderForCoupon.promotionId },
        data:  { usedCount: { increment: 1 } },
      });
    }
  }

  // Sync CRM metrics through the centralized service.
  // crmSyncedAt guards against double-counting on repeated webhooks.
  await CustomerMetricsSyncService.syncOrderToCustomerMetrics(payment.order.id, "mp_webhook");

  return NextResponse.json({ received: true });
}

// MP sends a GET to validate the webhook URL during setup
export async function GET() {
  return NextResponse.json({ ok: true });
}
