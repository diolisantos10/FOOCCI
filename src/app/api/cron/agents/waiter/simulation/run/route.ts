/**
 * POST /api/cron/agents/waiter/simulation/run
 *
 * Cron-safe entrypoint to run a small, safe Waiter simulation batch from GitHub
 * Actions WITHOUT an admin secret. Persists the run + opportunities for later
 * human review. Fully dry-run: no order, no Pix, no WhatsApp, no runtime mutation.
 *
 * Auth: Authorization: Bearer {CRON_SECRET}. POST only, never public.
 */

import { NextRequest, NextResponse } from "next/server";
import { runAndPersistWaiterSimulation } from "@/services/simulation/waiter/runWaiterSimulation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function checkCronAuth(req: NextRequest): { ok: true } | { ok: false; status: 401 | 503; error: string } {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    console.error("[cron/agents/waiter/simulation/run] CRON_SECRET env var is not configured");
    return { ok: false, status: 503, error: "CRON_SECRET is not configured" };
  }
  if ((req.headers.get("authorization") ?? "") !== `Bearer ${secret}`) {
    return { ok: false, status: 401, error: "Unauthorized" };
  }
  return { ok: true };
}

export async function POST(req: NextRequest) {
  const auth = checkCronAuth(req);
  if (!auth.ok) {
    return NextResponse.json({ ok: false, status: "FAIL", message: auth.error, runtimeTouched: false }, { status: auth.status });
  }

  let body: Record<string, unknown> = {};
  try {
    body = await req.json();
  } catch {
    // empty body → defaults
  }
  const scenarioCount = typeof body.scenarioCount === "number" ? Math.min(body.scenarioCount, 24) : 12;
  const seed = typeof body.seed === "string" && body.seed.trim() ? body.seed.trim() : undefined;

  try {
    const { runId, result } = await runAndPersistWaiterSimulation({ scenarioCount, seed, mode: "CRON" });
    return NextResponse.json({
      ok: true,
      status: "PASS",
      runId,
      scenariosTotal: result.scenariosTotal,
      passed: result.scenariosPassed,
      warnings: result.scenariosWarning,
      failed: result.scenariosFailed,
      p0Count: result.p0Count,
      opportunityCount: result.opportunityCount,
      runtimeTouched: false,
      // O alerta carrega a própria evidência.
      //
      // Antes, o cron falhava com "p0Count=1 — encontrou um problema crítico" e
      // NADA mais: nem o cenário, nem a frase, nem o que o agente respondeu. O
      // detalhe ficava no banco, e quem recebia o e-mail às 6h não tinha como
      // saber o que quebrou sem abrir o admin e caçar a rodada.
      //
      // Alerta que não diz o porquê custa uma investigação inteira toda vez que
      // dispara. Aqui vai o mínimo para agir: qual cenário, o que o cliente
      // pediu, o que o agente respondeu e a violação exata. Sem PII — o
      // simulador roda sobre catálogo sintético.
      p0: (result.scenarios ?? [])
        .filter((s) => s?.evaluation?.severity === "P0")
        .map((s) => ({
          cenario:      s.scenario?.scenarioType ?? "?",
          clientePediu: s.scenario?.initialMessage ?? "",
          agenteDisse:  (s.output?.finalMessage ?? "").slice(0, 400),
          cards:        s.output?.cards ?? [],
          violacoes:    s.evaluation?.evidence ?? [],
        })),
    }, { status: 200 });
  } catch (err) {
    const message = err instanceof Error ? err.message.slice(0, 200) : "erro desconhecido";
    return NextResponse.json({ ok: false, status: "FAIL", message, runtimeTouched: false }, { status: 200 });
  }
}
