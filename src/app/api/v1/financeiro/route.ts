/**
 * GET /api/v1/financeiro — PUBLIC per-order financial breakdown (scope:
 * finance:read). For reconciliation in the finance module: subtotal, taxa de
 * entrega, desconto, total, cupom, forma e status de pagamento per sale.
 *
 *   Authorization: Bearer fck_xxxxxxxx
 *   ?desde=AAAA-MM-DD   only sales created on/after this date (default 30d)
 *
 * Uses the same REVENUE_STATUS "sale" definition as /vendas, so the finance
 * feed reconciles line-for-line with the sales feed and the dashboard.
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { OrderStatus } from "@prisma/client";
import { requireApiScope, jsonError, jsonOk, resolveDesde, V1_MAX_ROWS } from "@/lib/api-v1";
import { REVENUE_STATUS_LIST } from "@/lib/order-revenue";

export const dynamic = "force-dynamic";

// Fonte única: @/lib/order-revenue — reconcilia linha a linha com /vendas e o painel.
const REVENUE_STATUS: OrderStatus[] = REVENUE_STATUS_LIST;

export async function GET(req: NextRequest) {
  try {
    const auth = await requireApiScope(req, "finance:read");
    if (auth instanceof NextResponse) return auth;

    const window = resolveDesde(req);
    if (window instanceof NextResponse) return window;
    const { desde } = window;

    const orders = await prisma.order.findMany({
      where:   { restaurantId: auth.restaurantId, status: { in: REVENUE_STATUS }, createdAt: { gte: desde } },
      orderBy: { createdAt: "asc" },
      take:    V1_MAX_ROWS + 1,
      select: {
        id: true, orderNumber: true, createdAt: true,
        subtotal: true, deliveryFee: true, discount: true, total: true, couponCode: true,
        payment: { select: { method: true, status: true, paidAt: true } },
      },
    });

    const truncated = orders.length > V1_MAX_ROWS;
    const page = truncated ? orders.slice(0, V1_MAX_ROWS) : orders;

    const data = page.map((o) => ({
      id:             o.orderNumber != null ? `PED-${o.orderNumber}` : o.id,
      data:           o.createdAt.toISOString(),
      subtotal:       Number(o.subtotal),
      taxaEntrega:    Number(o.deliveryFee),
      desconto:       Number(o.discount),
      total:          Number(o.total),
      cupom:          o.couponCode ?? null,
      formaPagamento: o.payment?.method ?? null,
      statusPagamento: o.payment?.status ?? null,
      pagoEm:         o.payment?.paidAt?.toISOString() ?? null,
    }));

    return jsonOk({
      data,
      meta: { desde: desde.toISOString(), count: data.length, limit: V1_MAX_ROWS, truncated },
    });
  } catch (err) {
    console.error("[GET /api/v1/financeiro]", err);
    return jsonError(500, "Erro interno ao consultar financeiro.");
  }
}
