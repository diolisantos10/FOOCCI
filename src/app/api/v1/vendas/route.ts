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
import { bearerToken } from "@/lib/api-key";
import { resolveApiKey } from "@/services/api/ApiKeyService";

export const dynamic = "force-dynamic";

// Same definition of a realized sale as the dashboard's FATURAMENTO card, so the
// external total always reconciles with what the lojista sees inside Foocci.
const REVENUE_STATUS: OrderStatus[] = [
  OrderStatus.CONFIRMED,
  OrderStatus.PREPARING,
  OrderStatus.READY,
  OrderStatus.OUT_FOR_DELIVERY,
  OrderStatus.DELIVERED,
];

// Friendly channel label from the order type (matches the brief's "Delivery").
const CHANNEL_LABEL: Record<OrderType, string> = {
  [OrderType.DELIVERY]: "Delivery",
  [OrderType.PICKUP]:   "Retirada",
  [OrderType.DINE_IN]:  "Salão",
};

const DEFAULT_WINDOW_DAYS = 30;
const MAX_ROWS = 1000; // cap per call; caller paginates by advancing `desde`

function jsonError(status: number, error: string) {
  return NextResponse.json({ error }, { status, headers: { "Cache-Control": "no-store" } });
}

/**
 * Parse ?desde=YYYY-MM-DD (or a full ISO 8601 timestamp) → Date, or null if
 * absent/invalid. STRICT on purpose: ambiguous, locale-dependent forms like
 * "11-07-2026" (is that Jul 11 or Nov 7?) are rejected rather than silently
 * mis-parsed by the lenient Date constructor.
 */
function parseDesde(raw: string | null): Date | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  // Bare date → start of that day, UTC.
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    const d = new Date(`${trimmed}T00:00:00.000Z`);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  // Full ISO 8601 timestamp (must begin YYYY-MM-DDThh:mm…).
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(trimmed)) {
    const d = new Date(trimmed);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  return null;
}

export async function GET(req: NextRequest) {
  try {
    const key = await resolveApiKey(bearerToken(req.headers.get("authorization")));
    if (!key) return jsonError(401, "Chave de conexão inválida ou revogada.");

    const rawDesde = req.nextUrl.searchParams.get("desde");
    if (rawDesde && !parseDesde(rawDesde)) {
      return jsonError(400, "Parâmetro 'desde' inválido. Use o formato AAAA-MM-DD.");
    }
    const desde =
      parseDesde(rawDesde) ?? new Date(Date.now() - DEFAULT_WINDOW_DAYS * 24 * 60 * 60 * 1000);

    const orders = await prisma.order.findMany({
      where:   { restaurantId: key.restaurantId, status: { in: REVENUE_STATUS }, createdAt: { gte: desde } },
      orderBy: { createdAt: "asc" },
      take:    MAX_ROWS + 1, // fetch one extra to detect truncation
      select: {
        id:          true,
        orderNumber: true,
        total:       true,
        type:        true,
        createdAt:   true,
        items:       { select: { quantity: true } },
      },
    });

    const truncated = orders.length > MAX_ROWS;
    const page = truncated ? orders.slice(0, MAX_ROWS) : orders;

    const data = page.map((o) => ({
      id:     o.orderNumber != null ? `PED-${o.orderNumber}` : o.id,
      valor:  Number(o.total),                       // reais, 2 decimals
      data:   o.createdAt.toISOString(),
      canal:  CHANNEL_LABEL[o.type] ?? o.type,
      vendas: 1,                                     // each record = one sale
      itens:  o.items.reduce((n, it) => n + it.quantity, 0),
    }));

    return NextResponse.json(
      {
        data,
        meta: { desde: desde.toISOString(), count: data.length, limit: MAX_ROWS, truncated },
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (err) {
    console.error("[GET /api/v1/vendas]", err);
    return jsonError(500, "Erro interno ao consultar vendas.");
  }
}
