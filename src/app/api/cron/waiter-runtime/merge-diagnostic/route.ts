/**
 * POST /api/cron/waiter-runtime/merge-diagnostic
 *
 * Cron-safe operational validation of the Waiter Runtime Merge. Runs the full
 * synthetic, fully-isolated cycle (create technique → DRAFT → TESTING → Quality
 * gate → ACTIVE LIBRARY_ASSISTED → bridge check → rollback → CURRENT fallback →
 * cleanup) and returns PASS/FAIL. The synthetic version is scoped to a unique
 * non-existent restaurantId, so NO real /pedido turn can ever see it
 * (runtimeTouched stays false).
 *
 * Auth: Authorization: Bearer {CRON_SECRET} — the SAME secret the other crons use,
 * so it can run from GitHub Actions WITHOUT an admin secret. POST only, never
 * public. Never creates an order, never sends WhatsApp, never touches Pix/MP.
 */

import { NextRequest, NextResponse } from "next/server";
import { runWaiterRuntimeMergeDiagnostic } from "@/services/waiterRuntime/mergeDiagnostic";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function checkCronAuth(req: NextRequest): { ok: true } | { ok: false; status: 401 | 503; error: string } {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    console.error("[cron/waiter-runtime/merge-diagnostic] CRON_SECRET env var is not configured");
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

  const result = await runWaiterRuntimeMergeDiagnostic();
  // PASS → 200; controlled FAIL → 200 with status:"FAIL" (the run is the result).
  return NextResponse.json(result, { status: 200 });
}
