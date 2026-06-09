/**
 * POST /api/cron/crm/governance-diagnostic
 *
 * Cron-safe validation (no admin secret) that the CRM governance foundation works
 * in production: CRMContactLedger table + Campaign identity columns exist, the
 * ledger dedupe (concept/message) works, and the preflight blocks an
 * already-impacted customer. Synthetic data + cleanup; never sends WhatsApp.
 *
 * Auth: Authorization: Bearer {CRON_SECRET}. POST only, never public.
 */

import { NextRequest, NextResponse } from "next/server";
import { runGovernanceDiagnostic } from "@/services/crm/crmGovernanceDiagnostic";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function checkCronAuth(req: NextRequest): { ok: true } | { ok: false; status: 401 | 503; error: string } {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    console.error("[cron/crm/governance-diagnostic] CRON_SECRET env var is not configured");
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
  const result = await runGovernanceDiagnostic();
  return NextResponse.json(result, { status: 200 });
}
