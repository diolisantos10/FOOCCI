/**
 * PATCH /api/payments/mercadopago/[orderId]/mark-paid
 *
 * Manual fallback — mark a Mercado Pago payment as paid.
 * Useful for sandbox / when webhooks don't arrive.
 * Requires OWNER or MANAGER role.
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getTenantContext } from "@/lib/tenant";
import { CustomerMetricsSyncService } from "@/services/crm/CustomerMetricsSyncService";
import { CustomerCouponService } from "@/services/crm/CustomerCouponService";
import { OrderService } from "@/services/order/OrderService";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ orderId: string }> }
) {
  const ctx = getTenantContext(req);
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (ctx.role !== "OWNER" && ctx.role !== "MANAGER") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { orderId } = await params;

  const order = await prisma.order.findFirst({
    where: { id: orderId, restaurantId: ctx.restaurantId },
    select: { id: true, status: true, promotionId: true, couponUsageCountedAt: true },
  });
  if (!order) return NextResponse.json({ error: "Pedido não encontrado" }, { status: 404 });

  const payment = await prisma.payment.findUnique({
    where: { orderId },
    select: { id: true, providerName: true },
  });
  if (!payment || payment.providerName !== "mercadopago") {
    return NextResponse.json({ error: "Pagamento MP não encontrado" }, { status: 404 });
  }

  await prisma.payment.update({
    where: { orderId },
    data: { status: "PAID", paidAt: new Date() },
  });

  // ── O status vai pelo ponto único ─────────────────────────────────────────
  //
  // CORREÇÃO DE 13/08/2026. Esta rota escrevia `status: "CONFIRMED"` direto no
  // banco e, por isso, NÃO enfileirava a comanda nem emitia a NFC-e: o socorro
  // do lojista para um webhook do MP que não chegou deixava a cozinha sem papel.
  //
  // Dois ganhos de passar pelo `OrderService.updateStatus`:
  //   1. as obrigações do pedido confirmado (comanda + nota) rodam;
  //   2. a transição é VALIDADA. Antes, esta rota carimbava CONFIRMED sobre
  //      QUALQUER status — um pedido já em READY era REBAIXADO para Confirmado
  //      por um clique de reconciliação de pagamento.
  if (["PENDING", "AWAITING_PAYMENT"].includes(order.status)) {
    const advanced = await OrderService.updateStatus(ctx.restaurantId, orderId, { status: "CONFIRMED" });
    if (!advanced.ok) {
      console.error("[mp mark-paid] pagamento marcado mas o pedido não avançou", {
        restaurantId: ctx.restaurantId, orderId, fromStatus: order.status, error: advanced.error,
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

  // Wallet coupon (iFood-style) — consume on payment approval. Idempotent.
  await CustomerCouponService.consumeForPaidOrder(orderId).catch((e) =>
    console.error("[mp mark-paid] wallet coupon consume failed:", e),
  );

  await CustomerMetricsSyncService.syncOrderToCustomerMetrics(orderId, "mp_mark_paid");

  return NextResponse.json({ success: true });
}
