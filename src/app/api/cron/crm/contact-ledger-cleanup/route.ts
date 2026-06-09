/**
 * POST /api/cron/crm/contact-ledger-cleanup
 *
 * Surgically rolls back an over-broad ledger backfill: removes CRMContactLedger
 * rows (metadata.backfill=true) that do NOT belong to `keepCampaignId`, and
 * optionally relabels the kept rows to a canonical concept key.
 *
 * DEFAULTS TO DRY-RUN (counts only, writes nothing). A real cleanup requires
 * body.dryRun === false AND a valid keepCampaignId. Never sends, never mutates a
 * campaign, never touches CampaignExecution history.
 *
 * Auth: Authorization: Bearer {CRON_SECRET}. POST only, never public.
 */

import { NextRequest, NextResponse } from "next/server";
import { cleanupBackfilledLedger } from "@/services/crm/CRMContactLedgerCleanupService";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function checkCronAuth(req: NextRequest): { ok: true } | { ok: false; status: 401 | 503; error: string } {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    console.error("[cron/crm/contact-ledger-cleanup] CRON_SECRET env var is not configured");
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
    const body = (await req.json().catch(() => ({}))) as {
      dryRun?: boolean;
      keepCampaignId?: string;
      relabelTo?: string | null;
    };
    if (!body.keepCampaignId) {
      return NextResponse.json(
        { ok: false, error: "keepCampaignId é obrigatório", runtimeTouched: false },
        { status: 400 },
      );
    }
    const result = await cleanupBackfilledLedger({
      dryRun: body.dryRun !== false, // default DRY-RUN
      keepCampaignId: body.keepCampaignId,
      relabelTo: body.relabelTo ?? null,
    });
    return NextResponse.json({ ...result, runtimeTouched: false }, { status: 200 });
  } catch (err) {
    const message = err instanceof Error ? err.message.slice(0, 200) : "erro desconhecido";
    return NextResponse.json({ ok: false, error: message, runtimeTouched: false }, { status: 200 });
  }
}
