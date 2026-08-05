/**
 * POST /api/cron/raiox/run
 *
 * O raio-x noturno: coleta determinística do estado do sistema, sem IA.
 * Varre banco e código-fonte, produz achados com evidência e persiste a
 * execução para que a comparação com ontem seja possível.
 *
 * Auth: Authorization: Bearer {CRON_SECRET} — o mesmo segredo dos outros crons.
 * Só POST. Não existe handler GET, de propósito: uma coleta que qualquer
 * crawler dispara vira carga sem dono.
 *
 * SOMENTE LEITURA. Nunca envia mensagem, nunca cria pedido, nunca gera Pix,
 * nunca chama a Meta, nunca toca em runtime. A única escrita é nas tabelas
 * `raiox_*`. `src/services/raiox/noSideEffects.test.ts` prova por varredura.
 *
 * Resposta:
 *   { ok, runId, globalStatus, counts, durationMs, findingsCount,
 *     comparedToRunId, unavailableBlocks }
 */

import { NextRequest, NextResponse } from "next/server";
import { collectSample } from "@/services/raiox/collect/RaioXCollector";
import { runProbes } from "@/services/raiox/RaioXService";
import { persistRun, getPreviousMetrics } from "@/services/raiox/persistence/RaioXStore";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

function checkCronAuth(req: NextRequest): { ok: true } | { ok: false; status: 401 | 503; error: string } {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    console.error("[cron/raiox/run] CRON_SECRET não configurado — o raio-x não roda");
    return { ok: false, status: 503, error: "CRON_SECRET is not configured" };
  }
  const auth = req.headers.get("authorization") ?? "";
  if (auth !== `Bearer ${secret}`) return { ok: false, status: 401, error: "Unauthorized" };
  return { ok: true };
}

export async function POST(req: NextRequest) {
  const auth = checkCronAuth(req);
  if (!auth.ok) {
    return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
  }

  // Base de comparação. Falhar aqui NÃO cancela a coleta: perder o "contra
  // ontem" é pior que nada, mas perder a noite inteira é muito pior.
  let previous: Awaited<ReturnType<typeof getPreviousMetrics>> = null;
  try {
    previous = await getPreviousMetrics();
  } catch (err) {
    console.error("[cron/raiox/run] base de comparação indisponível:", err instanceof Error ? err.message : err);
  }

  const sample = await collectSample();
  const report = runProbes(sample, { previous });

  let runId: string;
  try {
    runId = await persistRun(report, { source: "CRON", triggeredBy: "cron" });
  } catch (err) {
    console.error("[cron/raiox/run] persistência falhou:", err instanceof Error ? err.message : err);
    return NextResponse.json(
      { ok: false, error: "Raio-x rodou mas a persistência falhou", globalStatus: report.globalStatus },
      { status: 500 },
    );
  }

  return NextResponse.json({
    ok: true,
    runId,
    globalStatus: report.globalStatus,
    counts: { byStatus: report.countsByStatus, bySeverity: report.countsBySeverity },
    durationMs: Math.max(0, report.finishedAt.getTime() - report.startedAt.getTime()),
    findingsCount: report.findings.length,
    comparedToRunId: report.comparedToRunId,
    unavailableBlocks: report.unavailableBlocks,
  });
}
