/**
 * GET /api/v1/clientes — PUBLIC customer feed (scope: customers:read).
 *
 * Contains PERSONAL DATA (nome, telefone) — it only ever responds for a key the
 * lojista explicitly granted "Clientes", and only for that key's own restaurant.
 * Anonymous guest sessions are excluded. `optOut` is surfaced so the consumer
 * honours a customer's LGPD marketing opt-out.
 *
 *   Authorization: Bearer fck_xxxxxxxx
 *   ?desde=AAAA-MM-DD   only customers created on/after this date (default 365d)
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireApiScope, jsonError, jsonOk, resolveDesde, V1_MAX_ROWS } from "@/lib/api-v1";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const auth = await requireApiScope(req, "customers:read");
    if (auth instanceof NextResponse) return auth;

    const window = resolveDesde(req, 365);
    if (window instanceof NextResponse) return window;
    const { desde } = window;

    const rows = await prisma.customer.findMany({
      where:   { restaurantId: auth.restaurantId, isGuest: false, createdAt: { gte: desde } },
      orderBy: { createdAt: "desc" },
      take:    V1_MAX_ROWS + 1,
      select: {
        id: true, name: true, phone: true, email: true, tier: true, segment: true,
        totalOrders: true, totalSpend: true, averageTicket: true, lastOrderAt: true,
        hasOptedOut: true, createdAt: true,
      },
    });

    const truncated = rows.length > V1_MAX_ROWS;
    const page = truncated ? rows.slice(0, V1_MAX_ROWS) : rows;

    const data = page.map((c) => {
      const totalGasto = Number(c.totalSpend);
      const ticket = c.averageTicket != null
        ? Number(c.averageTicket)
        : c.totalOrders > 0 ? Math.round((totalGasto / c.totalOrders) * 100) / 100 : 0;
      return {
        id:          c.id,
        nome:        c.name,
        telefone:    c.phone ?? null,
        email:       c.email ?? null,
        tier:        c.tier,
        segmento:    c.segment,
        totalPedidos: c.totalOrders,
        totalGasto,
        ticketMedio: ticket,
        ultimaCompra: c.lastOrderAt?.toISOString() ?? null,
        criadoEm:    c.createdAt.toISOString(),
        optOut:      c.hasOptedOut, // consumer must not market to true
      };
    });

    return jsonOk({
      data,
      meta: { desde: desde.toISOString(), count: data.length, limit: V1_MAX_ROWS, truncated },
    });
  } catch (err) {
    console.error("[GET /api/v1/clientes]", err);
    return jsonError(500, "Erro interno ao consultar clientes.");
  }
}
