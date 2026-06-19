/**
 * GET /api/analytics/bestsellers-diagnostic
 *
 * READ-ONLY. Explains the dynamic "Mais vendidos" menu category: the period used,
 * which products are shown, and which sold but were excluded (and why) — so an
 * owner can verify why a product appears or not, and how it relates to Analytics.
 *
 * Tenant-scoped (OWNER/MANAGER). Sends nothing, mutates nothing.
 */

import { NextRequest } from "next/server";
import { getTenantContext } from "@/lib/tenant";
import { ok, unauthorized, forbidden, serverError } from "@/lib/api-response";
import { prisma } from "@/lib/prisma";
import {
  getMenuBestSellerRows,
  rankBestSellers,
  MENU_BESTSELLER_PERIOD_DAYS,
  MENU_BESTSELLER_LIMIT,
} from "@/services/menu/menuBestSellers";

export async function GET(req: NextRequest) {
  const ctx = getTenantContext(req);
  if (!ctx) return unauthorized();
  if (!["OWNER", "MANAGER"].includes(ctx.role)) return forbidden();

  try {
    const periodDays = MENU_BESTSELLER_PERIOD_DAYS;
    const rows = await getMenuBestSellerRows(ctx.restaurantId, periodDays);

    const items = await prisma.menuItem.findMany({
      where:  { id: { in: rows.map((r) => r.menuItemId) } },
      select: { id: true, name: true, isAvailable: true },
    });
    const byId         = new Map(items.map((i) => [i.id, i]));
    const availableIds = new Set(items.filter((i) => i.isAvailable).map((i) => i.id));

    const ranked    = rankBestSellers(rows, availableIds, MENU_BESTSELLER_LIMIT);
    const rankedSet = new Set(ranked.map((r) => r.menuItemId));

    const shown = ranked.map((r, idx) => ({
      rank:       idx + 1,
      menuItemId: r.menuItemId,
      name:       byId.get(r.menuItemId)?.name ?? "(desconhecido)",
      qty:        r.qty,
      revenue:    r.revenue,
    }));

    const excluded = rows
      .filter((r) => !rankedSet.has(r.menuItemId))
      .map((r) => {
        const it = byId.get(r.menuItemId);
        const reason =
          !it             ? "DELETED_OR_ARCHIVED" :
          !it.isAvailable ? "UNAVAILABLE"         :
          r.qty <= 0      ? "NO_SALES"            : "BEYOND_TOP_LIMIT";
        return { menuItemId: r.menuItemId, name: it?.name ?? null, qty: r.qty, revenue: r.revenue, reason };
      });

    return ok({
      restaurantId:         ctx.restaurantId,
      source:               "ANALYTICS_BESTSELLERS",
      periodDays,
      ranking:              "quantity desc, revenue desc (tie-breaker)",
      orderStatusesCounted: ["CONFIRMED", "PREPARING", "READY", "OUT_FOR_DELIVERY", "DELIVERED"],
      foocciOnly:           true,
      limit:                MENU_BESTSELLER_LIMIT,
      totalCandidatesWithSales: rows.length,
      shown,
      excluded,
      note: "O menu usa pedidos reais Foocci (sem histórico importado), agrupa por produto e ordena por quantidade vendida. A tela de Analytics → Produtos agrupa por nome e ordena por receita (e inclui importados), por isso a ordem pode diferir.",
    });
  } catch (err) {
    console.error("[GET /api/analytics/bestsellers-diagnostic]", err);
    return serverError();
  }
}
