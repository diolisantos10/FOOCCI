/**
 * GET /api/analytics/overview?from=YYYY-MM-DD&to=YYYY-MM-DD
 *
 * Returns a single comprehensive analytics payload for the restaurant.
 * `from` is inclusive, `to` is exclusive (next day boundary at midnight UTC-3).
 */

import { NextRequest, NextResponse } from "next/server";
import { getTenantContext } from "@/lib/tenant";
import { AnalyticsService } from "@/services/analytics/AnalyticsService";

function parseDateBR(iso: string): Date {
  // Accept YYYY-MM-DD; treat as America/Sao_Paulo midnight (UTC-3 → UTC+3h)
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y!, (m! - 1), d!, 3, 0, 0)); // midnight BRT = 03:00 UTC
}

export async function GET(req: NextRequest) {
  const ctx = getTenantContext(req);
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const sp   = req.nextUrl.searchParams;
  const fromP = sp.get("from");
  const toP   = sp.get("to");

  if (!fromP || !toP) {
    return NextResponse.json({ error: "Parâmetros from e to são obrigatórios (YYYY-MM-DD)" }, { status: 400 });
  }

  try {
    const from = parseDateBR(fromP);
    const toEx = parseDateBR(toP);
    // `to` is end-of-day inclusive: advance one day so the SQL < boundary captures the whole day
    toEx.setUTCDate(toEx.getUTCDate() + 1);

    const data = await AnalyticsService.getOverview(ctx.restaurantId, { from, to: toEx });
    return NextResponse.json({ data });
  } catch (err) {
    console.error("[GET /api/analytics/overview]", err);
    return NextResponse.json({ error: "Erro ao carregar analytics" }, { status: 500 });
  }
}
