/**
 * PATCH /api/payments/stone/[orderId]/mark-paid
 *
 * Manual fallback for the pilot phase: allows OWNER or MANAGER to manually
 * mark an order's payment as PAID when the Stone webhook was not received
 * (network issue, sandbox glitch, etc.).
 *
 * Guards:
 *   - OWNER or MANAGER role only
 *   - Order must belong to the authenticated restaurant
 *   - Idempotent: returns 200 if already PAID
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getTenantContext } from "@/lib/tenant";
import { CustomerMetricsSyncService } from "@/services/crm/CustomerMetricsSyncService";
import { OrderService } from "@/services/order/OrderService";

export async function PATCH(
  req: NextRequest,
  { params }: { params: { orderId: string } }
) {
  const ctx = getTenantContext(req);
  if (!ctx) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { restaurantId, role } = ctx;

  if (role !== "OWNER" && role !== "MANAGER") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { orderId } = params;

  const order = await prisma.order.findUnique({
    where: { id: orderId },
    select: {
      restaurantId:         true,
      status:               true,
      promotionId:          true,
      couponUsageCountedAt: true,
      payment: { select: { id: true, status: true } },
    },
  });

  if (!order || order.restaurantId !== restaurantId) {
    return NextResponse.json({ error: "Order not found" }, { status: 404 });
  }

  if (!order.payment) {
    return NextResponse.json({ error: "No payment record for this order" }, { status: 404 });
  }

  // Idempotency
  if (order.payment.status === "PAID") {
    return NextResponse.json({ ok: true, alreadyPaid: true });
  }

  await prisma.payment.update({
    where: { id: order.payment.id },
    data: { status: "PAID", paidAt: new Date() },
  });

  // ── O status vai pelo ponto único ─────────────────────────────────────────
  //
  // CORREÇÃO DE 13/08/2026: escrevia `status: "CONFIRMED"` direto e por isso
  // não enfileirava a comanda nem emitia a NFC-e. Mesmo defeito das outras
  // rotas de socorro — o lojista reconciliava o pagamento e a cozinha não
  // ficava sabendo do pedido.
  if (order.status === "AWAITING_PAYMENT" || order.status === "PENDING") {
    const advanced = await OrderService.updateStatus(restaurantId, orderId, { status: "CONFIRMED" });
    if (!advanced.ok) {
      console.error("[stone mark-paid] pagamento marcado mas o pedido não avançou", {
        restaurantId, orderId, fromStatus: order.status, error: advanced.error,
      });
      return NextResponse.json(
        { error: "Pagamento marcado como pago, mas o pedido não avançou para Confirmado.", paymentRecorded: true },
        { status: 502 }
      );
    }
  }

  // Idempotent coupon usage count
  if (order.promotionId && !order.couponUsageCountedAt) {
    const stamped = await prisma.order.updateMany({
      where: { id: orderId, couponUsageCountedAt: null },
      data:  { couponUsageCountedAt: new Date() },
    });
    if (stamped.count > 0) {
      await prisma.promotion.update({
        where: { id: order.promotionId },
        data:  { usedCount: { increment: 1 } },
      });
    }
  }

  await CustomerMetricsSyncService.syncOrderToCustomerMetrics(orderId, "stone_mark_paid");

  return NextResponse.json({ ok: true, markedPaid: true });
}
