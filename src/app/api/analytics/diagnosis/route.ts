/**
 * GET /api/analytics/diagnosis?from=YYYY-MM-DD&to=YYYY-MM-DD
 *
 * Deterministic root-cause diagnosis for the selected period, compared against
 * the previous comparable window (same duration, shifted back). Returns a
 * DiagnosisReport: findings (what changed + likely causes + action), anomalies
 * (threshold breaches) and an executive summary.
 *
 * Read-only. Tenant-scoped via getTenantContext. No LLM, no sends.
 */

import { NextRequest, NextResponse } from "next/server";
import { getTenantContext } from "@/lib/tenant";
import { prisma } from "@/lib/prisma";
import { AnalyticsService } from "@/services/analytics/AnalyticsService";
import {
  AnalyticsDiagnosisService,
  type DiagnosisPeriodMeta,
  type RecoveryDiagnosisInput,
} from "@/services/analytics/AnalyticsDiagnosisService";

function parseDateBR(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y!, (m! - 1), d!, 3, 0, 0)); // midnight BRT = 03:00 UTC
}

function periodLabelFor(days: number): string {
  return (
    days ===   1 ? "Hoje" :
    days ===   7 ? "Últimos 7 dias" :
    days ===  30 ? "Últimos 30 dias" :
    days ===  90 ? "Últimos 90 dias" :
    days === 365 ? "Últimos 12 meses" :
    `Últimos ${days} dias`
  );
}

/** Abandoned/recovered draft counts in a window (tenant-scoped, read-only). */
async function fetchRecoverySummary(
  restaurantId: string,
  from: Date,
  to: Date,
): Promise<{ abandoned: number; recovered: number }> {
  try {
    const rows = await prisma.$queryRaw<Array<{ abandoned: bigint | number; recovered: bigint | number }>>`
      SELECT
        COUNT(*) FILTER (WHERE status = 'ABANDONED' OR "recoveryAttempts" > 0)                       AS abandoned,
        COUNT(*) FILTER (WHERE status = 'CONFIRMED' AND "recoveryAttempts" > 0)                       AS recovered
      FROM order_drafts
      WHERE "restaurantId" = ${restaurantId}
        AND "createdAt" >= ${from}
        AND "createdAt" <  ${to}
    `;
    const r = rows[0];
    return { abandoned: Number(r?.abandoned ?? 0), recovered: Number(r?.recovered ?? 0) };
  } catch {
    return { abandoned: 0, recovered: 0 };
  }
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
    toDate.setUTCDate(toDate.getUTCDate() + 1); // end-of-day inclusive

    const durationMs = toDate.getTime() - fromDate.getTime();
    const prevTo     = new Date(fromDate.getTime());
    const prevFrom   = new Date(fromDate.getTime() - durationMs);
    const days       = Math.max(1, Math.round(durationMs / 86_400_000));

    // Current + previous full overview (parallel) for a rich comparison.
    const [current, previous, recCur, recPrev] = await Promise.all([
      AnalyticsService.getOverview(ctx.restaurantId, { from: fromDate, to: toDate }),
      AnalyticsService.getOverview(ctx.restaurantId, { from: prevFrom, to: prevTo }),
      fetchRecoverySummary(ctx.restaurantId, fromDate, toDate),
      fetchRecoverySummary(ctx.restaurantId, prevFrom, prevTo),
    ]);

    const period: DiagnosisPeriodMeta = {
      from: fromP,
      to:   toP,
      label: periodLabelFor(days),
    };
    const comparisonPeriod: DiagnosisPeriodMeta = {
      from: prevFrom.toISOString().slice(0, 10),
      to:   prevTo.toISOString().slice(0, 10),
      label: "período anterior",
    };

    const recovery: RecoveryDiagnosisInput = {
      abandonedDrafts:      recCur.abandoned,
      recoveredDrafts:      recCur.recovered,
      prevAbandonedDrafts:  recPrev.abandoned,
      prevRecoveredDrafts:  recPrev.recovered,
    };

    const report = AnalyticsDiagnosisService.diagnose({
      current,
      previous: previous.kpi.orders > 0 ? previous : null,
      period,
      comparisonPeriod,
      recovery,
    });

    return NextResponse.json({ data: report });
  } catch (err) {
    console.error("[GET /api/analytics/diagnosis]", err);
    return NextResponse.json({ error: "Erro ao gerar diagnóstico" }, { status: 500 });
  }
}
