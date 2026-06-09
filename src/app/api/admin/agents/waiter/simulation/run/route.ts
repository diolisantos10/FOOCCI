/**
 * POST /api/admin/agents/waiter/simulation/run
 * Runs (and persists) a safe Waiter simulation. Body:
 *   { scenarioCount?: number, seed?: string, scenarioTypes?: string[] }
 *
 * Auth: admin only. Fully dry-run — no order, no Pix, no WhatsApp, no runtime
 * mutation. Returns a summary + runId.
 */

import { NextRequest, NextResponse } from "next/server";
import { checkAdminRequest } from "@/lib/admin-auth";
import { runAndPersistWaiterSimulation } from "@/services/simulation/waiter/runWaiterSimulation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  if (!process.env.ADMIN_SECRET) {
    return NextResponse.json({ ok: false, error: "Endpoint disabled — ADMIN_SECRET not configured." }, { status: 403 });
  }
  if (!checkAdminRequest(req)) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  let body: Record<string, unknown> = {};
  try {
    body = await req.json();
  } catch {
    // empty body is allowed → defaults
  }

  const scenarioCount = typeof body.scenarioCount === "number" ? body.scenarioCount : undefined;
  const seed = typeof body.seed === "string" && body.seed.trim() ? body.seed.trim() : undefined;
  const scenarioTypes = Array.isArray(body.scenarioTypes)
    ? body.scenarioTypes.filter((x): x is string => typeof x === "string")
    : undefined;

  try {
    const { runId, result } = await runAndPersistWaiterSimulation({ scenarioCount, seed, scenarioTypes, mode: "MANUAL" });
    return NextResponse.json({
      ok: true,
      runId,
      status: result.status,
      summary: {
        scenariosTotal: result.scenariosTotal,
        passed: result.scenariosPassed,
        warnings: result.scenariosWarning,
        failed: result.scenariosFailed,
        p0: result.p0Count,
        p1: result.p1Count,
        p2: result.p2Count,
        opportunities: result.opportunityCount,
      },
      runtimeTouched: result.runtimeTouched,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Falha ao rodar a simulação.";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
