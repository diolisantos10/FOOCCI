/**
 * POST /api/cron/agent-library/deep-diagnostic
 *
 * Cron-safe variant of the deep-extraction diagnostic: proves, with ZERO manual
 * steps, that DEEP chunked extraction turns substantial content into useful
 * archived techniques. It runs the same `runDeepExtractionDiagnostic` (create
 * dense synthetic source → chunk → process → consolidate → assert
 * techniquesCreated > 0 → delete temp source) and returns PASS/FAIL.
 *
 * Auth: Authorization: Bearer {CRON_SECRET} — the SAME secret the other crons
 * use, so it can be driven from GitHub Actions WITHOUT an admin secret. POST
 * only, never public. Never touches any agent runtime.
 */

import { NextRequest, NextResponse } from "next/server";
import { runDeepExtractionDiagnostic } from "@/services/agentLibrary/deepExtraction/deepExtractionDiagnostic";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function checkCronAuth(req: NextRequest): { ok: true } | { ok: false; status: 401 | 503; error: string } {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    console.error("[cron/agent-library/deep-diagnostic] CRON_SECRET env var is not configured");
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

  const result = await runDeepExtractionDiagnostic();
  // PASS → 200; controlled FAIL → 200 with status:"FAIL" (the run is the result).
  return NextResponse.json(result, { status: 200 });
}
