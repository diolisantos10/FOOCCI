/**
 * GET /api/pedido/pix-payment?orderId=<id>
 *
 * Public endpoint — no auth required.
 * Returns the Pix copy-paste key for a pending Mercado Pago Pix payment so
 * that the customer can recover the QR screen after a page refresh.
 *
 * Only responds when:
 *   - payment.providerName === "mercadopago"
 *   - payment.status === "LINK_SENT" (not yet paid or expired)
 *   - payment has not passed its expiresAt
 *
 * paymentUrl column stores the Pix copy-paste key for MP orders
 * (repurposed from the hosted-checkout URL used by Stone/Checkout-Pro).
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  const orderId = req.nextUrl.searchParams.get("orderId");
  if (!orderId) {
    return NextResponse.json({ error: "orderId required" }, { status: 400 });
  }

  const payment = await prisma.payment.findUnique({
    where:  { orderId },
    select: { status: true, paymentUrl: true, providerName: true, expiresAt: true },
  });

  if (
    !payment ||
    payment.providerName !== "mercadopago" ||
    payment.status !== "LINK_SENT"
  ) {
    return NextResponse.json({ error: "No pending Pix payment" }, { status: 404 });
  }

  // Auto-expire if past expiresAt
  if (payment.expiresAt && new Date(payment.expiresAt) < new Date()) {
    await prisma.payment.update({
      where: { orderId },
      data:  { status: "EXPIRED" },
    });
    return NextResponse.json({ error: "Payment expired" }, { status: 410 });
  }

  return NextResponse.json({
    pixCopyPaste: payment.paymentUrl ?? "",
    expiresAt:    payment.expiresAt?.toISOString() ?? null,
  });
}
