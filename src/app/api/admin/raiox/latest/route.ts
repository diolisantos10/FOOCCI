/**
 * GET /api/admin/raiox/latest
 *
 * A porta de leitura do raio-x — é daqui que a sessão da manhã tira o material
 * para escrever o relatório de negócio ao CEO.
 *
 * Auth: x-admin-secret ou cookie de admin (mesmo padrão de /api/admin/quality).
 *
 * Query:
 *   ?runId=<id>   — uma execução específica em vez da última
 *   ?history=14   — quantas execuções resumidas devolver (1..60)
 *
 * Resposta:
 *   { ok: true, latest, history }
 *
 * `latest.unavailableBlocks` é parte da resposta e NÃO é enfeite: é o que a
 * coleta não conseguiu olhar. Relatório que omite isso está afirmando calmaria
 * onde houve cegueira.
 */

import { NextRequest, NextResponse } from "next/server";
import { checkAdminRequest } from "@/lib/admin-auth";
import { getLatestRunWithFindings, getRunWithFindings, listHistory } from "@/services/raiox/persistence/RaioXStore";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  if (!process.env.ADMIN_SECRET) {
    return NextResponse.json({ ok: false, error: "Endpoint disabled — ADMIN_SECRET not configured." }, { status: 403 });
  }
  if (!checkAdminRequest(req)) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(req.url);
  const runId = url.searchParams.get("runId");
  const historyLimit = Number(url.searchParams.get("history") ?? "14");

  try {
    const latest = runId ? await getRunWithFindings(runId) : await getLatestRunWithFindings();
    const history = await listHistory(Number.isFinite(historyLimit) ? historyLimit : 14);
    if (!latest) {
      // Sem execução nenhuma o correto é dizer "não sei", não devolver vazio com
      // cara de tudo certo.
      return NextResponse.json({
        ok: true,
        latest: null,
        history,
        note: "Nenhuma execução do raio-x registrada ainda — isto não significa que o sistema esteja saudável.",
      });
    }
    return NextResponse.json({ ok: true, latest, history });
  } catch (err) {
    console.error("[raiox] leitura falhou:", err instanceof Error ? err.message : err);
    return NextResponse.json({ ok: false, error: "Failed to load raio-x" }, { status: 500 });
  }
}
