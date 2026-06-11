/**
 * POST /api/payments/mercadopago/webhook
 *
 * Receives payment notifications from Mercado Pago.
 * Docs: https://www.mercadopago.com.br/developers/pt/docs/your-integrations/notifications/webhooks
 *
 * MP sends notifications in several formats — we handle all of them:
 *   1. Webhooks API (JSON body): { type: "payment", action: "payment.updated", data: { id: "..." } }
 *   2. IPN query params (legacy): POST ?topic=payment&id=<paymentId>
 *   3. IPN body (legacy):         { topic: "payment", id: "..." }
 *
 * Signature verification:
 *   Webhooks API notifications (format 1) carry x-signature and x-request-id headers.
 *   We verify HMAC-SHA256 per the official MP spec. In production with
 *   MERCADO_PAGO_WEBHOOK_SECRET set, a missing or invalid signature → 401.
 *   Legacy IPN (formats 2/3) pre-date signatures and are allowed with a warning.
 *
 * All formats are mapped to a payment ID, then we fetch the payment from MP API
 * to get external_reference (= our orderId) and confirm the order if approved.
 *
 * Always responds 200 on application-level errors (not auth failures) so MP
 * does not retry on transient issues.
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { decrypt } from "@/lib/crypto";
import { verifyMpWebhookSignature } from "@/lib/mercadopago";
import { Decimal } from "@prisma/client/runtime/library";
import { CustomerMetricsSyncService } from "@/services/crm/CustomerMetricsSyncService";

const LOG = "[mp-webhook]";

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

/** Confirm an approved MP payment: marks payment PAID, order CONFIRMED, syncs CRM. Idempotent. */
export async function confirmMpPayment(
  paymentRecord: { id: string; status: string; amount: unknown; order: { id: string; restaurantId: string; status: string } | null },
  mpPaymentData: Record<string, unknown>,
): Promise<"confirmed" | "already_paid" | "skipped"> {
  if (!paymentRecord.order) return "skipped";
  const order = paymentRecord.order;

  if (paymentRecord.status === "PAID") {
    console.info(LOG, "already paid — idempotent", { orderId: order.id });
    return "already_paid";
  }

  if (mpPaymentData.status !== "approved") {
    return "skipped";
  }

  // Only advance order to CONFIRMED if it's still waiting for payment.
  // Do NOT downgrade an order already in the operational flow (PREPARING, READY, etc.)
  // — the payment reconciliation is safe even if the kitchen started preparing early.
  const orderNeedsStatusAdvance = ["PENDING", "AWAITING_PAYMENT"].includes(order.status);

  await prisma.$transaction(async (tx) => {
    await tx.payment.update({
      where: { id: paymentRecord.id },
      data: {
        status: "PAID",
        paidAt: new Date(),
        amount: new Decimal(
          (mpPaymentData.transaction_amount as number) ?? Number(paymentRecord.amount)
        ),
      },
    });
    if (orderNeedsStatusAdvance) {
      await tx.order.update({
        where: { id: order.id },
        data: { status: "CONFIRMED" },
      });
    }
  });

  console.info(LOG, "order confirmed", { orderId: order.id });

  // Idempotent coupon usage: updateMany WHERE couponUsageCountedAt IS NULL wins the race.
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

  // crmSyncedAt in CustomerMetricsSyncService prevents double-counting.
  await CustomerMetricsSyncService.syncOrderToCustomerMetrics(order.id, "mp_webhook");

  return "confirmed";
}

export async function POST(req: NextRequest) {
  // ── Step 0: read headers and raw body once ────────────────────────────────
  const xSignature  = req.headers.get("x-signature")  ?? "";
  const xRequestId  = req.headers.get("x-request-id") ?? "";

  let body: Record<string, unknown> = {};
  try {
    const text = await req.text();
    if (text) body = JSON.parse(text);
  } catch {
    // Non-JSON body is fine for legacy IPN query-param notifications
  }

  // ── Step 1: determine notification format ─────────────────────────────────
  // Webhooks API: body contains data.id — these carry x-signature.
  // Legacy IPN:   body contains topic/id OR query params — no signature.
  const dataObj      = body.data as Record<string, unknown> | undefined;
  const bodyDataId   = dataObj?.id != null ? String(dataObj.id) : null;
  const isWebhooksApi = bodyDataId !== null;

  // ── Step 2: signature verification ────────────────────────────────────────
  const sigPresent   = !!xSignature;
  const reqIdPresent = !!xRequestId;

  if (isWebhooksApi || sigPresent) {
    // All Webhooks API notifications and any notification with an x-signature header
    // go through verification. Use bodyDataId if available; fall back to query/body id.
    const idForSig = bodyDataId
      ?? req.nextUrl.searchParams.get("id")
      ?? (body.id != null ? String(body.id) : "");

    const sigResult = verifyMpWebhookSignature(idForSig, xSignature, xRequestId);

    console.info(LOG, "signature check", {
      format:    isWebhooksApi ? "webhooks_api" : "ipn_with_sig",
      sigPresent,
      reqIdPresent,
      sigResult,
    });

    if (sigResult === "invalid") {
      console.warn(LOG, "invalid signature — rejected", { idForSig });
      return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
    }

    if (sigResult === "missing") {
      // x-signature absent on a Webhooks API format notification
      if (process.env.NODE_ENV === "production" && process.env.MERCADO_PAGO_WEBHOOK_SECRET) {
        // Secret is configured but MP sent no signature — reject (spoofed or mis-configured MP app)
        console.warn(LOG, "missing x-signature on Webhooks API notification — rejected");
        return NextResponse.json({ error: "Missing signature" }, { status: 401 });
      }
      if (process.env.NODE_ENV === "production") {
        console.error(
          LOG,
          "CRITICAL: MERCADO_PAGO_WEBHOOK_SECRET is not set. " +
          "Webhooks API notifications are accepted without signature verification. " +
          "Set MERCADO_PAGO_WEBHOOK_SECRET in Railway to enable verification.",
        );
      } else {
        console.warn(LOG, "x-signature absent — bypassed (dev/no secret configured)");
      }
    }

    if (sigResult === "no_secret") {
      if (process.env.NODE_ENV === "production") {
        console.error(
          LOG,
          "CRITICAL: MERCADO_PAGO_WEBHOOK_SECRET is not set. " +
          "Webhooks API notifications are accepted without signature verification. " +
          "Set MERCADO_PAGO_WEBHOOK_SECRET in Railway to enable verification.",
        );
      } else {
        console.warn(LOG, "MERCADO_PAGO_WEBHOOK_SECRET not set — signature verification skipped (dev)");
      }
    }

    // sigResult === "verified" → fall through
  } else {
    // Legacy IPN notification (no x-signature, no data.id) — allow with warning in prod
    if (process.env.NODE_ENV === "production" && process.env.MERCADO_PAGO_WEBHOOK_SECRET) {
      console.warn(
        LOG,
        "legacy IPN notification without x-signature received in production. " +
        "Consider migrating your MP integration to the Webhooks API for signature verification.",
      );
    } else {
      console.info(LOG, "legacy IPN notification (no signature expected)");
    }
  }

  // ── Step 3: extract payment ID from any MP notification format ────────────
  let paymentId: string | undefined;

  // IPN legacy: query params ?topic=payment&id=<paymentId>
  const topicParam = req.nextUrl.searchParams.get("topic");
  const idParam    = req.nextUrl.searchParams.get("id");
  if (topicParam === "payment" && idParam) {
    paymentId = idParam;
    console.info(LOG, "IPN query-param format", { paymentId });
  }

  if (!paymentId) {
    const type   = body.type   as string | undefined;
    const action = body.action as string | undefined;
    const topic  = body.topic  as string | undefined;

    const isPaymentEvent =
      type === "payment" ||
      action?.startsWith("payment.") ||
      topic === "payment";

    if (!isPaymentEvent) {
      console.info(LOG, "non-payment event — ignored", { type, action, topic });
      return NextResponse.json({ received: true });
    }

    // JSON Webhooks API: data.id  |  IPN body: id
    const rawId = bodyDataId ?? (body.id != null ? String(body.id) : undefined);
    paymentId   = rawId ?? undefined;
  }

  if (!paymentId) {
    console.warn(LOG, "notification received but no payment ID found", { body });
    return NextResponse.json({ received: true });
  }

  console.info(LOG, "processing payment", {
    paymentId,
    sigVerified: sigPresent,
  });

  // ── Step 4: find the matching payment record ──────────────────────────────
  // Fast path: providerReference is stored as the MP payment ID since the direct Pix API flow.
  let payment = await prisma.payment.findFirst({
    where: { providerReference: paymentId, providerName: "mercadopago" },
    include: { order: { select: { id: true, restaurantId: true, status: true } } },
  });

  let mpPaymentData: Record<string, unknown> | null = null;

  if (!payment) {
    // Slow path: paymentId isn't our stored reference (e.g. Checkout Pro preference flow).
    // Fetch from MP using each active token until external_reference resolves to an order.
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

      if (!mpRes?.ok) {
        console.warn(LOG, "MP API fetch failed", { paymentId, status: mpRes?.status });
        continue;
      }

      const data = await mpRes.json().catch(() => null) as Record<string, unknown> | null;
      if (!data) continue;

      const externalRef = data.external_reference as string | undefined;
      if (!externalRef) {
        console.warn(LOG, "payment has no external_reference", { paymentId });
        continue;
      }

      const orderRecord = await prisma.order.findFirst({
        where: { id: externalRef, restaurantId: cfg.restaurantId },
        select: { id: true },
      });
      if (!orderRecord) {
        console.info(LOG, "external_reference not matched to restaurant", { externalRef, restaurantId: cfg.restaurantId });
        continue;
      }

      const paymentRecord = await prisma.payment.findUnique({
        where: { orderId: externalRef },
        include: { order: { select: { id: true, restaurantId: true, status: true } } },
      });
      if (!paymentRecord) {
        console.warn(LOG, "order found but no payment record", { orderId: externalRef });
        continue;
      }

      payment = paymentRecord;
      mpPaymentData = data;
      console.info(LOG, "order resolved via MP API external_reference", { orderId: externalRef, mpStatus: data.status });
      break;
    }
  }

  if (!payment || !payment.order) {
    console.warn(LOG, "payment not found in DB for paymentId", { paymentId });
    return NextResponse.json({ received: true });
  }

  // ── Step 5: fetch MP payment status if not already loaded ─────────────────
  if (!mpPaymentData) {
    const accessToken = await getMpToken(payment.order.restaurantId);
    if (!accessToken) {
      console.warn(LOG, "no MP token for restaurant", { restaurantId: payment.order.restaurantId });
      return NextResponse.json({ received: true });
    }

    const mpRes = await fetch(`https://api.mercadopago.com/v1/payments/${paymentId}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    }).catch(() => null);

    if (!mpRes?.ok) {
      console.warn(LOG, "MP API fetch failed on status check", { paymentId, status: mpRes?.status });
      return NextResponse.json({ received: true });
    }
    mpPaymentData = await mpRes.json().catch(() => null);
  }

  if (!mpPaymentData) {
    console.warn(LOG, "empty MP payment data", { paymentId });
    return NextResponse.json({ received: true });
  }

  console.info(LOG, "MP payment status", { paymentId, mpStatus: mpPaymentData.status, orderId: payment.order.id });

  // ── Step 6: confirm if approved ───────────────────────────────────────────
  const result = await confirmMpPayment(payment, mpPaymentData);
  console.info(LOG, "done", { paymentId, orderId: payment.order.id, result });

  // ── Step 7: close any OPEN draft after successful Pix confirmation ─────────
  // Prevents abandonment recovery from firing for an order that was just paid.
  if (result === "confirmed") {
    const orderForDraft = await prisma.order.findUnique({
      where:  { id: payment.order.id },
      select: { customerId: true, restaurantId: true },
    });
    if (orderForDraft?.customerId) {
      void prisma.orderDraft.updateMany({
        where: {
          restaurantId: orderForDraft.restaurantId,
          customerId:   orderForDraft.customerId,
          status:       "OPEN",
        },
        data: { status: "CONFIRMED", confirmedAt: new Date() },
      }).catch((err) =>
        console.warn(LOG, "draft close failed after payment", {
          orderId: payment!.order!.id,
          error:   err instanceof Error ? err.message : String(err),
        }),
      );
    }
  }

  return NextResponse.json({ received: true });
}

// MP sends a GET to validate the webhook URL during setup
export async function GET() {
  return NextResponse.json({ ok: true });
}
