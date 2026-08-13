/**
 * GET /api/v1/vendas — PUBLIC external sales feed.
 *
 * The single endpoint external systems (first consumer: Foocci Manager, the
 * finance module) call to pull this restaurant's sales. Auth is a read-only
 * Bearer API key the lojista generates in Integrações → Conexões externas:
 *
 *     Authorization: Bearer fck_xxxxxxxx
 *
 * The key resolves the restaurant (tenant), so the caller never sends any id.
 * This route is listed in middleware PUBLIC_PATHS (no session) and does its own
 * auth via ApiKeyService.resolveApiKey — fail closed on anything invalid.
 *
 * Query:
 *   desde=YYYY-MM-DD   only sales created on/after this date (default: 30d ago)
 *
 * Response (documented contract — matches the integration brief):
 *   {
 *     "data": [
 *       { "id": "PED-10231", "valor": 125.90, "data": "2026-07-11T18:22:04.000Z",
 *         "canal": "Delivery", "vendas": 1, "itens": 3 }
 *     ],
 *     "meta": { "desde": "...", "count": 1, "limit": 1000, "truncated": false }
 *   }
 *
 * A "sale" mirrors the same statuses the owner sees as FATURAMENTO in the
 * dashboard (REVENUE_STATUS) — confirmed and beyond, never PENDING/CANCELLED.
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { OrderStatus, OrderType } from "@prisma/client";
import { requireApiScope, jsonError, jsonOk, resolveDesde, V1_MAX_ROWS } from "@/lib/api-v1";
import { REVENUE_STATUS_LIST } from "@/lib/order-revenue";

export const dynamic = "force-dynamic";

// Mesma definição de venda realizada do card FATURAMENTO do painel, vinda da
// fonte única (@/lib/order-revenue): o total externo reconcilia com o que o
// lojista vê por dentro, por construção e não por coincidência.
const REVENUE_STATUS: OrderStatus[] = REVENUE_STATUS_LIST;

// Friendly channel label from the order type (matches the brief's "Delivery").
const CHANNEL_LABEL: Record<OrderType, string> = {
  [OrderType.DELIVERY]: "Delivery",
  [OrderType.PICKUP]:   "Retirada",
  [OrderType.DINE_IN]:  "Salão",
};

export async function GET(req: NextRequest) {
  try {
    const auth = await requireApiScope(req, "sales:read");
    if (auth instanceof NextResponse) return auth;

    const window = resolveDesde(req);
    if (window instanceof NextResponse) return window;
    const { desde } = window;

    const orders = await prisma.order.findMany({
      where:   { restaurantId: auth.restaurantId, status: { in: REVENUE_STATUS }, createdAt: { gte: desde } },
      orderBy: { createdAt: "asc" },
      take:    V1_MAX_ROWS + 1, // fetch one extra to detect truncation
      select: {
        id:          true,
        orderNumber: true,
        total:       true,
        type:        true,
        createdAt:   true,
        items:       { select: { quantity: true } },
      },
    });

    const truncated = orders.length > V1_MAX_ROWS;
    const page = truncated ? orders.slice(0, V1_MAX_ROWS) : orders;

    const data = page.map((o) => ({
      id:     o.orderNumber != null ? `PED-${o.orderNumber}` : o.id,
      valor:  Number(o.total),                       // reais, 2 decimals
      data:   o.createdAt.toISOString(),
      canal:  CHANNEL_LABEL[o.type] ?? o.type,
      vendas: 1,                                     // each record = one sale
      itens:  o.items.reduce((n, it) => n + it.quantity, 0),
    }));

    return jsonOk({
      data,
      meta: { desde: desde.toISOString(), count: data.length, limit: V1_MAX_ROWS, truncated },
    });
  } catch (err) {
    console.error("[GET /api/v1/vendas]", err);
    return jsonError(500, "Erro interno ao consultar vendas.");
  }
}
