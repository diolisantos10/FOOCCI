/**
 * POST /api/payments/mercadopago/webhook
 *
 * Receives IPN / webhook notifications from Mercado Pago.
 * Docs: https://www.mercadopago.com.br/developers/pt/docs/your-integrations/notifications/webhooks
 *
 * MP sends a POST with `{ type, data: { id } }`.
 * We fetch the payment from the MP API, check status, then confirm the order.
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { decrypt } from "@/lib/crypto";
import { Decimal } from "@prisma/client/runtime/library";

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

  // Find the payment record by providerReference (preference or payment ID)
  // MP sends payment IDs in webhooks; we need to find which restaurant this belongs to.
  // Look up via providerReference OR try fetching from MP API.
  const payment = await prisma.payment.findFirst({
    where: { providerReference: paymentId, providerName: "mercadopago" },
    include: { order: { select: { id: true, restaurantId: true, status: true } } },
  });

  if (!payment || !payment.order) {
    // Payment ID from webhook may differ from preference ID; try MP API lookup
    // to find external_reference (orderId) if stored as providerReference
    return NextResponse.json({ received: true });
  }

  const { order } = payment;
  const accessToken = await getMpToken(order.restaurantId);
  if (!accessToken) return NextResponse.json({ received: true });

  // Fetch payment status from MP API
  const mpRes = await fetch(`https://api.mercadopago.com/v1/payments/${paymentId}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  }).catch(() => null);

  if (!mpRes?.ok) return NextResponse.json({ received: true });

  const mpPayment = await mpRes.json().catch(() => null);
  if (!mpPayment || mpPayment.status !== "approved") {
    return NextResponse.json({ received: true });
  }

  // Mark payment as paid and advance order
  await prisma.$transaction([
    prisma.payment.update({
      where: { id: payment.id },
      data: {
        status: "PAID",
        paidAt: new Date(),
        amount: new Decimal(mpPayment.transaction_amount ?? Number(payment.amount)),
      },
    }),
    prisma.order.update({
      where: { id: order.id },
      data: { status: "CONFIRMED" },
    }),
  ]);

  return NextResponse.json({ received: true });
}

// MP sends a GET to validate the webhook URL during setup
export async function GET() {
  return NextResponse.json({ ok: true });
}
