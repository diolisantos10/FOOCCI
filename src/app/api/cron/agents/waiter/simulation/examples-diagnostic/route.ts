/**
 * POST /api/cron/agents/waiter/simulation/examples-diagnostic
 *
 * Cron-safe validation of the real-conversation example pipeline WITHOUT an admin
 * secret: synthetic conversation with PII → sanitize → create example (PENDING) →
 * approve → approved example biases the generator → no literal copy → no PII leak
 * → cleanup. Fully dry-run; no order/Pix/WhatsApp; runtimeTouched=false.
 *
 * Auth: Authorization: Bearer {CRON_SECRET}. POST only, never public.
 */

import { NextRequest, NextResponse } from "next/server";
import { runExamplesDiagnostic } from "@/services/simulation/examples/examplesDiagnostic";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function checkCronAuth(req: NextRequest): { ok: true } | { ok: false; status: 401 | 503; error: string } {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    console.error("[cron/agents/waiter/simulation/examples-diagnostic] CRON_SECRET env var is not configured");
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

  const result = await runExamplesDiagnostic();
  // PASS → 200; controlled FAIL → 200 with status:"FAIL" (the run is the result).
  return NextResponse.json(result, { status: 200 });
}
