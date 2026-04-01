/**
 * POST /api/payments/stone/create-link
 *
 * Auth-protected endpoint that creates a Stone hosted payment link
 * for an existing order. Idempotent: if a payment with a live link
 * already exists, returns the existing URL.
 *
 * Body: { orderId: string }
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getTenantContext } from "@/lib/tenant";
import { createPaymentLink } from "@/lib/stone";
import { Decimal } from "@prisma/client/runtime/library";

const bodySchema = z.object({
  orderId: z.string().min(1),
});

export async function POST(req: NextRequest) {
  const ctx = getTenantContext(req);
  if (!ctx) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { restaurantId } = ctx;

  const raw = await req.json().catch(() => null);
  const parsed = bodySchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ error: "orderId is required" }, { status: 400 });
  }

  const { orderId } = parsed.data;

  const order = await prisma.order.findUnique({
    where: { id: orderId },
    select: {
      restaurantId: true,
      total: true,
      status: true,
      payment: true,
    },
  });

  if (!order || order.restaurantId !== restaurantId) {
    return NextResponse.json({ error: "Order not found" }, { status: 404 });
  }

  if (order.status === "CANCELLED") {
    return NextResponse.json({ error: "Cannot create link for a cancelled order" }, { status: 400 });
  }

  // Idempotency: if an active LINK_SENT payment exists, return it
  if (
    order.payment &&
    order.payment.status === "LINK_SENT" &&
    order.payment.paymentUrl &&
    order.payment.expiresAt &&
    new Date(order.payment.expiresAt) > new Date()
  ) {
    return NextResponse.json({
      orderId,
      paymentUrl: order.payment.paymentUrl,
      providerReference: order.payment.providerReference,
      expiresAt: order.payment.expiresAt,
    });
  }

  const amount = Number(order.total);

  let stoneResult;
  try {
    stoneResult = await createPaymentLink({
      orderId,
      amount,
      description: `Pedido ${orderId} – ${restaurantId}`,
      expiresInMinutes: 30,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Stone error";
    return NextResponse.json({ error: msg }, { status: 502 });
  }

  // Create or update payment record
  if (!order.payment) {
    await prisma.payment.create({
      data: {
        orderId,
        method: "ONLINE",
        status: "LINK_SENT",
        amount: new Decimal(amount),
        paymentMode: "PAY_NOW",
        providerName: "stone",
        providerReference: stoneResult.providerReference,
        paymentUrl: stoneResult.paymentUrl,
        expiresAt: new Date(stoneResult.expiresAt),
      },
    });
  } else {
    await prisma.payment.update({
      where: { id: order.payment.id },
      data: {
        status: "LINK_SENT",
        providerName: "stone",
        providerReference: stoneResult.providerReference,
        paymentUrl: stoneResult.paymentUrl,
        expiresAt: new Date(stoneResult.expiresAt),
      },
    });
  }

  // Advance order to AWAITING_PAYMENT if still PENDING
  if (order.status === "PENDING") {
    await prisma.order.update({
      where: { id: orderId },
      data: { status: "AWAITING_PAYMENT" },
    });
  }

  return NextResponse.json({
    orderId,
    paymentUrl: stoneResult.paymentUrl,
    providerReference: stoneResult.providerReference,
    expiresAt: stoneResult.expiresAt,
  });
}
