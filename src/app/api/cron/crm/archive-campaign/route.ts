/**
 * POST /api/cron/crm/archive-campaign
 *
 * Cron-safe (Bearer CRON_SECRET) way to take a campaign OUT of operation by setting
 * its status to CANCELLED. Never deletes the row, never sends, NEVER sets a
 * sending/active status. DEFAULTS TO DRY-RUN; a real change requires dryRun === false
 * AND a campaignId. Idempotent (already-CANCELLED is a no-op).
 */

import { NextRequest, NextResponse } from "next/server";
import { archiveCampaign } from "@/services/crm/CRMCampaignArchiveService";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function checkCronAuth(req: NextRequest): { ok: true } | { ok: false; status: 401 | 503; error: string } {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    console.error("[cron/crm/archive-campaign] CRON_SECRET env var is not configured");
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
    const body = (await req.json().catch(() => ({}))) as { dryRun?: boolean; campaignId?: string; toStatus?: string };
    if (!body.campaignId) {
      return NextResponse.json({ ok: false, error: "campaignId é obrigatório", runtimeTouched: false }, { status: 400 });
    }
    const result = await archiveCampaign({
      dryRun: body.dryRun !== false, // default DRY-RUN
      campaignId: body.campaignId,
      toStatus: typeof body.toStatus === "string" ? body.toStatus : undefined,
    });
    return NextResponse.json({ ...result, runtimeTouched: false }, { status: 200 });
  } catch (err) {
    const message = err instanceof Error ? err.message.slice(0, 200) : "erro desconhecido";
    return NextResponse.json({ ok: false, error: message, runtimeTouched: false }, { status: 200 });
  }
}
