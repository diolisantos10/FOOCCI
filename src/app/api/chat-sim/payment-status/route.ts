/**
 * GET /api/chat-sim/payment-status?orderId=<id>
 *
 * Polling endpoint used by the PAYMENT_LINK stage in chat-sim to check
 * whether the Stone payment has been completed.
 *
 * E2E bypass (x-e2e-bypass: 1):
 *   Returns { paymentStatus: "PENDING" } so E2E tests (which use pay_on_delivery,
 *   not pay_now) never enter PAYMENT_LINK stage and never need this endpoint.
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getTenantContext } from "@/lib/tenant";

export async function GET(req: NextRequest) {
  // ── E2E bypass ───────────────────────────────────────────────
  if (req.headers.get("x-e2e-bypass") === "1") {
    return NextResponse.json({ paymentStatus: "PENDING", orderStatus: "PENDING" });
  }

  // ── Auth ─────────────────────────────────────────────────────
  const ctx = getTenantContext(req);
  if (!ctx) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { restaurantId } = ctx;

  const orderId = req.nextUrl.searchParams.get("orderId");
  if (!orderId) {
    return NextResponse.json({ error: "orderId is required" }, { status: 400 });
  }

  const order = await prisma.order.findUnique({
    where: { id: orderId },
    select: {
      restaurantId: true,
      status: true,
      payment: {
        select: {
          status: true,
          expiresAt: true,
        },
      },
    },
  });

  if (!order || order.restaurantId !== restaurantId) {
    return NextResponse.json({ error: "Order not found" }, { status: 404 });
  }

  const payment = order.payment;

  // If there's no payment record yet, treat as PENDING
  if (!payment) {
    return NextResponse.json({ paymentStatus: "PENDING", orderStatus: order.status });
  }

  // Auto-detect expiry: if link hasn't been paid and the expiry has passed, mark EXPIRED
  if (
    payment.status === "LINK_SENT" &&
    payment.expiresAt &&
    new Date(payment.expiresAt) < new Date()
  ) {
    await prisma.payment.updateMany({
      where: { orderId, status: "LINK_SENT" },
      data: { status: "EXPIRED" },
    });
    return NextResponse.json({ paymentStatus: "EXPIRED", orderStatus: order.status });
  }

  return NextResponse.json({
    paymentStatus: payment.status,
    orderStatus: order.status,
  });
}
