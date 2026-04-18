/**
 * GET /api/pedido/payment-status?orderId=<id>
 *
 * Public polling endpoint — no auth required.
 * Used by PedidoClient to check payment status after pay_now.
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  const orderId = req.nextUrl.searchParams.get("orderId");
  if (!orderId) {
    return NextResponse.json({ error: "orderId required" }, { status: 400 });
  }

  const payment = await prisma.payment.findUnique({
    where: { orderId },
    select: { status: true, expiresAt: true },
  });

  if (!payment) {
    return NextResponse.json({ paymentStatus: "PENDING" });
  }

  // Auto-expire if link has passed expiry
  if (
    payment.status === "LINK_SENT" &&
    payment.expiresAt &&
    new Date(payment.expiresAt) < new Date()
  ) {
    await prisma.payment.updateMany({
      where: { orderId, status: "LINK_SENT" },
      data: { status: "EXPIRED" },
    });
    return NextResponse.json({ paymentStatus: "EXPIRED" });
  }

  return NextResponse.json({ paymentStatus: payment.status });
}
