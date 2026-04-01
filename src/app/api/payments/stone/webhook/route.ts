/**
 * POST /api/payments/stone/webhook
 *
 * Public endpoint — receives payment status notifications from Stone.
 * Verifies HMAC-SHA256 signature via x-stone-signature header.
 * Idempotent: ignores events for payments already in PAID status.
 *
 * On payment.approved:
 *   Payment: LINK_SENT → PAID (with paidAt)
 *   Order:   AWAITING_PAYMENT → CONFIRMED
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyWebhookSignature } from "@/lib/stone";

export async function POST(req: NextRequest) {
  const rawBody = await req.text();
  const signature = req.headers.get("x-stone-signature") ?? "";

  // Verify signature when secret is configured.
  // If STONE_WEBHOOK_SECRET is not set (dev/test), we skip verification.
  const secret = process.env.STONE_WEBHOOK_SECRET;
  if (secret) {
    if (!verifyWebhookSignature(rawBody, signature)) {
      return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
    }
  }

  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const eventType = payload.event_type as string | undefined;

  // Only handle payment approval events
  if (eventType !== "payment.approved" && eventType !== "payment_link.completed") {
    return NextResponse.json({ ok: true });
  }

  // Stone sends the internal payment_link id and order metadata
  const providerReference =
    (payload.id as string | undefined) ??
    ((payload.payment_link as Record<string, unknown> | undefined)?.id as
      | string
      | undefined);

  if (!providerReference) {
    return NextResponse.json({ error: "Missing providerReference" }, { status: 400 });
  }

  const payment = await prisma.payment.findFirst({
    where: { providerReference },
    include: { order: { select: { id: true, status: true } } },
  });

  if (!payment) {
    // Unknown reference — Stone might retry; return 200 to stop retries
    return NextResponse.json({ ok: true });
  }

  // Idempotency: if already PAID, do nothing
  if (payment.status === "PAID") {
    return NextResponse.json({ ok: true });
  }

  // Atomic update: payment PAID + order CONFIRMED
  await prisma.$transaction([
    prisma.payment.update({
      where: { id: payment.id },
      data: { status: "PAID", paidAt: new Date() },
    }),
    prisma.order.update({
      where: { id: payment.orderId },
      data: { status: "CONFIRMED" },
    }),
  ]);

  return NextResponse.json({ ok: true });
}
