/**
 * GET /api/promotions/[id]/metrics
 *
 * Returns performance metrics for a single promotion/coupon.
 * Read-only. Scoped to the authenticated restaurant.
 *
 * Valid orders = status in [CONFIRMED…DELIVERED]
 *   AND (no payment record OR payment.status in [PAID, PAY_ON_DELIVERY, PAY_ON_PICKUP])
 * Cancelled, pending-payment, and failed orders are excluded.
 */

import { NextRequest } from "next/server";
import { getTenantContext } from "@/lib/tenant";
import { ok, unauthorized, notFound, serverError } from "@/lib/api-response";
import { prisma } from "@/lib/prisma";
import type { OrderStatus, PaymentStatus } from "@prisma/client";

const VALID_ORDER_STATUSES: OrderStatus[] = [
  "CONFIRMED", "PREPARING", "READY", "OUT_FOR_DELIVERY", "DELIVERED",
];

const VALID_PAYMENT_STATUSES: PaymentStatus[] = ["PAID", "PAY_ON_DELIVERY", "PAY_ON_PICKUP"];

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const ctx = getTenantContext(req);
    if (!ctx) return unauthorized();

    const { id } = await params;

    const promotion = await prisma.promotion.findFirst({
      where: { id, restaurantId: ctx.restaurantId },
      select: { id: true, couponCode: true },
    });
    if (!promotion) return notFound("Promoção não encontrada");

    const couponCode = promotion.couponCode ?? null;

    // Match orders by promotionId (primary) OR by coupon code for legacy orders
    const couponConditions = couponCode
      ? [{ AND: [{ promotionId: null }, { couponCode: { equals: couponCode, mode: "insensitive" as const } }] }]
      : [];

    const orders = await prisma.order.findMany({
      where: {
        restaurantId: ctx.restaurantId,
        status: { in: VALID_ORDER_STATUSES },
        AND: [
          { OR: [{ promotionId: id }, ...couponConditions] },
          { OR: [{ payment: null }, { payment: { status: { in: VALID_PAYMENT_STATUSES } } }] },
        ],
      },
      select: {
        id:         true,
        subtotal:   true,
        discount:   true,
        total:      true,
        status:     true,
        type:       true,
        createdAt:  true,
        customerId: true,
        customer:   { select: { name: true, phone: true } },
        payment:    { select: { status: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 200,
    });

    const uses = orders.length;
    const revenue = orders.reduce((s, o) => s + Number(o.total), 0);
    const discountGiven = orders.reduce((s, o) => s + Number(o.discount), 0);
    const averageTicket = uses > 0 ? revenue / uses : 0;
    const uniqueCustomers = new Set(orders.map((o) => o.customerId)).size;
    const lastUsedAt = uses > 0 ? orders[0]!.createdAt.toISOString() : null;

    return ok({
      promotionId: id,
      couponCode,
      uses,
      revenue:      round2(revenue),
      discountGiven: round2(discountGiven),
      averageTicket: round2(averageTicket),
      uniqueCustomers,
      lastUsedAt,
      orders: orders.map((o) => ({
        id:            o.id,
        orderRef:      o.id.slice(-6).toUpperCase(),
        customerName:  o.customer?.name ?? null,
        customerPhone: o.customer?.phone ?? null,
        createdAt:     o.createdAt.toISOString(),
        subtotal:      Number(o.subtotal),
        discount:      Number(o.discount),
        total:         Number(o.total),
        status:        o.status,
        type:          o.type,
        paymentStatus: o.payment?.status ?? null,
      })),
    });
  } catch (err) {
    console.error("[GET /api/promotions/[id]/metrics]", err);
    return serverError();
  }
}

function round2(n: number) {
  return Math.round(n * 100) / 100;
}
