/**
 * GET /api/admin/quality/history
 *
 * Read-only history for the Quality Control dashboard: the latest run, the most
 * recent runs (capped), and an optional single run with its findings.
 *
 * Auth: x-admin-secret header OR foocci-admin-token cookie.
 *
 * Query:
 *   ?limit=20        — number of recent runs (1..50, default 20)
 *   ?runId=<id>      — when present, also returns that run with its findings
 *
 * Response:
 *   { ok: true, latest, runs, run? }       (200)
 *   { ok: false, error }                   (401 | 403 | 500)
 *
 * `latest` includes the findings of the most recent run (for the executive
 * overview); `runs` are lightweight summaries (for the trend + history table).
 */

import { NextRequest, NextResponse } from "next/server";
import { checkAdminRequest } from "@/lib/admin-auth";
import { listHistory, getRunWithFindings } from "@/services/quality/persistence/QualityAuditStore";
import { avaliarMedidores } from "@/services/brain/runtime/MeasurementFreshnessAlarm";

export async function GET(req: NextRequest) {
  if (!process.env.ADMIN_SECRET) {
    return NextResponse.json(
      { ok: false, error: "Endpoint disabled — ADMIN_SECRET not configured." },
      { status: 403 },
    );
  }
  if (!checkAdminRequest(req)) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(req.url);
  const limit = Number(url.searchParams.get("limit") ?? "20");
  const runId = url.searchParams.get("runId");

  try {
    const runs = await listHistory(Number.isFinite(limit) ? limit : 20);
    // latest carries its findings (executive overview); summaries drive the trend.
    const latest = runs[0] ? await getRunWithFindings(runs[0].id) : null;
    const run = runId ? await getRunWithFindings(runId) : null;

    /**
     * O ESTADO DO MEDIDOR vai junto com o que ele mediu — de propósito.
     *
     * Um histórico de auditorias não diz, sozinho, se a auditoria ainda ACONTECE:
     * a lista mais recente parece igual esteja o cron vivo ou morto há dez dias.
     * Devolver as duas coisas no mesmo payload é o que impede o painel de
     * apresentar um veredito vencido como se fosse o de hoje.
     */
    const medidores = await avaliarMedidores().catch(() => []);

    return NextResponse.json({ ok: true, latest, runs, run, medidores });
  } catch (err) {
    console.error("[quality] history failed:", err instanceof Error ? err.message : err);
    return NextResponse.json({ ok: false, error: "Failed to load history" }, { status: 500 });
  }
}
