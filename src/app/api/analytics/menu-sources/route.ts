/**
 * GET /api/analytics/menu-sources?range=today|7d|30d
 *
 * Authenticated. Returns delivery menu visit + order attribution by source.
 */

import { NextRequest } from "next/server";
import { getTenantContext } from "@/lib/tenant";
import { ok, badRequest, unauthorized, serverError } from "@/lib/api-response";
import { prisma } from "@/lib/prisma";

const VALID_RANGES = new Set(["today", "7d", "30d"]);

const SOURCE_LABELS: Record<string, string> = {
  instagram: "Instagram",
  whatsapp:  "WhatsApp",
  google:    "Google",
  qrcode:    "QR Code",
  crm:       "CRM",
  manual:    "Manual",
  direct:    "Direto",
  other:     "Outros",
};

const ALL_SOURCES = Object.keys(SOURCE_LABELS);

export interface MenuSourceRow {
  source:         string;
  label:          string;
  visits:         number;
  orders:         number;
  revenue:        number;
  conversionRate: number; // orders / visits * 100
  avgTicket:      number; // revenue / orders
}

function rangeStart(range: string): Date {
  const now = new Date();
  if (range === "today") {
    return new Date(now.getFullYear(), now.getMonth(), now.getDate());
  }
  if (range === "7d") {
    return new Date(now.getTime() - 7 * 86_400_000);
  }
  return new Date(now.getTime() - 30 * 86_400_000); // 30d default
}

export async function GET(req: NextRequest) {
  const ctx = getTenantContext(req);
  if (!ctx) return unauthorized();

  const range = req.nextUrl.searchParams.get("range") ?? "7d";
  if (!VALID_RANGES.has(range)) return badRequest("range inválido. Use: today | 7d | 30d");

  try {
    const since = rangeStart(range);
    const rid   = ctx.restaurantId;

    // ── Visits (MenuEvent) ────────────────────────────────────────────────────
    const eventGroups = await prisma.menuEvent.groupBy({
      by:      ["source"],
      where:   { restaurantId: rid, createdAt: { gte: since } },
      _count:  { _all: true },
    });

    const visitMap = new Map<string, number>(
      eventGroups.map((g) => [g.source ?? "other", g._count._all])
    );

    // ── Orders (by trafficSource) ─────────────────────────────────────────────
    const orderGroups = await prisma.order.groupBy({
      by:     ["trafficSource"],
      where:  {
        restaurantId: rid,
        importedAt:   null, // real Foocci orders only — imported history excluded
        createdAt:    { gte: since },
        status:       { notIn: ["CANCELLED"] },
      },
      _count: { _all: true },
      _sum:   { total: true },
    });

    const orderMap  = new Map<string, number>();
    const revenueMap = new Map<string, number>();

    for (const g of orderGroups) {
      const src = g.trafficSource ?? "direct";
      orderMap.set(src, g._count._all);
      revenueMap.set(src, Number(g._sum.total ?? 0));
    }

    // ── Build unified rows ────────────────────────────────────────────────────
    const allSources = new Set([
      ...ALL_SOURCES,
      ...visitMap.keys(),
      ...orderMap.keys(),
    ]);

    const rows: MenuSourceRow[] = [];
    for (const src of allSources) {
      const visits  = visitMap.get(src)  ?? 0;
      const orders  = orderMap.get(src)  ?? 0;
      const revenue = revenueMap.get(src) ?? 0;

      if (visits === 0 && orders === 0) continue;

      rows.push({
        source:         src,
        label:          SOURCE_LABELS[src] ?? src,
        visits,
        orders,
        revenue,
        conversionRate: visits > 0 ? Math.round((orders / visits) * 100 * 10) / 10 : 0,
        avgTicket:      orders > 0 ? Math.round((revenue / orders) * 100) / 100 : 0,
      });
    }

    rows.sort((a, b) => b.visits - a.visits || b.orders - a.orders);

    return ok({ range, since: since.toISOString(), rows });
  } catch (err) {
    console.error("[GET /api/analytics/menu-sources]", err);
    return serverError();
  }
}
