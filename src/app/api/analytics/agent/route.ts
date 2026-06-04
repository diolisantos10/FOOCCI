/**
 * GET  /api/analytics/agent?from=YYYY-MM-DD&to=YYYY-MM-DD
 *   → AgentReport (executive summary, typed insights, period comparison)
 *
 * POST /api/analytics/agent
 *   Body: { question, from?, to?, period?, includeRawData? }
 *   → AnalyticsAgentAnswer (W3 conversational analytics)
 *
 * Both routes are read-only, tenant-scoped, no side effects.
 */

import { NextRequest, NextResponse } from "next/server";
import { getTenantContext } from "@/lib/tenant";
import { AnalyticsService } from "@/services/analytics/AnalyticsService";
import { AnalyticsInsightService } from "@/services/analytics/AnalyticsInsightService";
import { answerQuestion } from "@/services/analytics/AnalyticsAgentService";
import { prisma } from "@/lib/prisma";

function parseDateBR(iso: string): Date {
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
    return NextResponse.json({ error: "Parâmetros from e to são obrigatórios" }, { status: 400 });
  }

  try {
    const fromDate = parseDateBR(fromP);
    const toDate   = parseDateBR(toP);
    toDate.setUTCDate(toDate.getUTCDate() + 1); // end-of-day inclusive

    // ── Current period overview ─────────────────────────────────
    const overview = await AnalyticsService.getOverview(
      ctx.restaurantId,
      { from: fromDate, to: toDate },
    );

    // ── Previous period (same duration, shifted back) ───────────
    const durationMs = toDate.getTime() - fromDate.getTime();
    const prevTo     = new Date(fromDate.getTime());
    const prevFrom   = new Date(fromDate.getTime() - durationMs);
    const prevKpi    = await fetchKpiOnly(ctx.restaurantId, prevFrom, prevTo);

    // ── Period label ─────────────────────────────────────────────
    const days = Math.round(durationMs / 86_400_000);
    const periodLabel =
      days ===   1 ? "Hoje"                    :
      days ===   7 ? "Nos últimos 7 dias"       :
      days ===  30 ? "Nos últimos 30 dias"      :
      days ===  90 ? "Nos últimos 90 dias"      :
      days === 365 ? "Nos últimos 12 meses"     :
      `Nos últimos ${days} dias`;

    // ── Build report ─────────────────────────────────────────────
    const report = AnalyticsInsightService.buildReport(
      overview,
      prevKpi.orders > 0 ? prevKpi : null,
      periodLabel,
    );

    return NextResponse.json({ data: report });
  } catch (err) {
    console.error("[GET /api/analytics/agent]", err);
    return NextResponse.json({ error: "Erro ao gerar análise" }, { status: 500 });
  }
}

// ─── POST — W3 Conversational Analytics ─────────────────────────────────────

export async function POST(req: NextRequest) {
  const ctx = getTenantContext(req);
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: { question?: string; from?: string; to?: string; period?: string; includeRawData?: boolean };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Body JSON inválido" }, { status: 400 });
  }

  const question = (body.question ?? "").trim();
  if (!question) {
    return NextResponse.json({ error: "Campo 'question' é obrigatório" }, { status: 400 });
  }

  try {
    const from = body.from ? parseDateBR(body.from) : undefined;
    const to   = body.to   ? parseDateBR(body.to)   : undefined;

    const answer = await answerQuestion({
      restaurantId:   ctx.restaurantId,
      question,
      from,
      to,
      period:         body.period,
      locale:         "pt-BR",
      includeRawData: body.includeRawData ?? false,
    });

    return NextResponse.json({ data: answer });
  } catch (err) {
    console.error("[POST /api/analytics/agent]", err);
    return NextResponse.json({ error: "Erro ao processar pergunta" }, { status: 500 });
  }
}

// ─── Lightweight KPI fetch for previous period ───────────────────────────────

async function fetchKpiOnly(
  restaurantId: string,
  from:         Date,
  to:           Date,
): Promise<{ revenue: number; orders: number; avgTicket: number }> {
  try {
    type Row = { total_revenue: string; order_count: bigint | number };
    const rows = await prisma.$queryRaw<Row[]>`
      SELECT
        COALESCE(SUM(CASE WHEN status != 'CANCELLED' THEN total ELSE 0 END), 0)::text AS total_revenue,
        COUNT(*) FILTER (WHERE status != 'CANCELLED')                                  AS order_count
      FROM orders
      WHERE "restaurantId" = ${restaurantId}
        AND COALESCE("importedAt", "createdAt") >= ${from}
        AND COALESCE("importedAt", "createdAt") <  ${to}
    `;
    const row      = rows[0];
    const revenue  = Number(row?.total_revenue ?? 0);
    const orders   = Number(row?.order_count   ?? 0);
    return { revenue, orders, avgTicket: orders > 0 ? revenue / orders : 0 };
  } catch {
    return { revenue: 0, orders: 0, avgTicket: 0 };
  }
}
