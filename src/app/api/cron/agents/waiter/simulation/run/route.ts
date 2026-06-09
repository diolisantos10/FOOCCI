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
    }, { status: 200 });
  } catch (err) {
    const message = err instanceof Error ? err.message.slice(0, 200) : "erro desconhecido";
    return NextResponse.json({ ok: false, status: "FAIL", message, runtimeTouched: false }, { status: 200 });
  }
}
