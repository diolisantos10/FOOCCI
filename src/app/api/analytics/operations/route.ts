/**
 * GET /api/analytics/operations?from=YYYY-MM-DD&to=YYYY-MM-DD
 *
 * Returns operational efficiency metrics for the selected period: order
 * fulfillment timing (createdAt → completedAt for DELIVERED real orders),
 * delayed-order rate, cancellations, and awaiting-payment signals.
 *
 * NOTE: Per-stage timings (confirm / prep / ready) are not available in the
 * current schema — only total fulfillment time is computable.
 *
 * Read-only. Tenant-scoped. No LLM, no sends.
 */

import { NextRequest, NextResponse } from "next/server";
import { getTenantContext } from "@/lib/tenant";
import { AnalyticsOperationalEfficiencyService } from "@/services/analytics/AnalyticsOperationalEfficiencyService";

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

    const report = await AnalyticsOperationalEfficiencyService.getReport(
      ctx.restaurantId,
      fromDate,
      toDate,
      fromP,
      toP,
    );
    return NextResponse.json({ data: report });
  } catch (err) {
    console.error("[GET /api/analytics/operations]", err);
    return NextResponse.json({ error: "Erro ao gerar relatório operacional" }, { status: 500 });
  }
}
