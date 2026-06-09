/**
 * POST /api/cron/crm/cold-recovery-diagnostic
 *
 * Cron-safe, read-only identification of the old "cold customer recovery"
 * campaigns across all restaurants — campaign metadata + counts only (NO message
 * text, NO customer PII). Lets the cold-campaign restart flow be diagnosed in
 * production WITHOUT an admin secret. Never sends, never mutates anything.
 *
 * Auth: Authorization: Bearer {CRON_SECRET}. POST only, never public.
 */

import { NextRequest, NextResponse } from "next/server";
import { diagnoseColdRecoveryGlobal } from "@/services/crm/CRMColdCampaignRecoveryDiagnosticService";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function checkCronAuth(req: NextRequest): { ok: true } | { ok: false; status: 401 | 503; error: string } {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    console.error("[cron/crm/cold-recovery-diagnostic] CRON_SECRET env var is not configured");
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
    return NextResponse.json({ ok: false, error: auth.error, runtimeTouched: false }, { status: auth.status });
  }
  try {
    const diagnosis = await diagnoseColdRecoveryGlobal();
    return NextResponse.json({ ok: true, ...diagnosis, runtimeTouched: false }, { status: 200 });
  } catch (err) {
    const message = err instanceof Error ? err.message.slice(0, 200) : "erro desconhecido";
    return NextResponse.json({ ok: false, error: message, runtimeTouched: false }, { status: 200 });
  }
}
