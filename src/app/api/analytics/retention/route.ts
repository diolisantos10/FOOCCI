/**
 * GET /api/analytics/retention?from=YYYY-MM-DD&to=YYYY-MM-DD
 *
 * Returns cohort-based customer retention analysis for the selected window.
 * The `from`/`to` params define when customers made their FIRST purchase
 * (cohort acquisition window) — return orders can fall outside this window.
 *
 * Read-only. Tenant-scoped. No LLM, no sends.
 */

import { NextRequest, NextResponse } from "next/server";
import { getTenantContext } from "@/lib/tenant";
import { AnalyticsRetentionService } from "@/services/analytics/AnalyticsRetentionService";

function parseDateBR(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y!, (m! - 1), d!, 3, 0, 0));
}

export async function GET(req: NextRequest) {
  const ctx = getTenantContext(req);
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const sp    = req.nextUrl.searchParams;
  const fromP = sp.get("from");
  const toP   = sp.get("to");

  if (!fromP || !toP) {
    return NextResponse.json({ error: "Parâmetros from e to são obrigatórios (YYYY-MM-DD)" }, { status: 400 });
  }

  try {
    const fromDate = parseDateBR(fromP);
    const toDate   = parseDateBR(toP);
    toDate.setUTCDate(toDate.getUTCDate() + 1);

    const report = await AnalyticsRetentionService.getReport(
      ctx.restaurantId,
      fromDate,
      toDate,
      fromP,
      toP,
    );
    return NextResponse.json({ data: report });
  } catch (err) {
    console.error("[GET /api/analytics/retention]", err);
    return NextResponse.json({ error: "Erro ao gerar relatório de retenção" }, { status: 500 });
  }
}
