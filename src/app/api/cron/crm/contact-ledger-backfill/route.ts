/**
 * POST /api/cron/crm/contact-ledger-backfill
 * Body: { dryRun?: boolean (default true), campaignId?, campaignFamilyKey?, limit? }
 *
 * Populates the impact ledger from existing CampaignExecution SENT rows. DEFAULTS
 * TO DRY-RUN. Read-only on campaigns, never sends, idempotent. Real backfill only
 * runs with an explicit { "dryRun": false }.
 *
 * Auth: Authorization: Bearer {CRON_SECRET}. POST only, never public.
 */

import { NextRequest, NextResponse } from "next/server";
import { backfillContactLedger } from "@/services/crm/CRMContactLedgerBackfillService";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function checkCronAuth(req: NextRequest): { ok: true } | { ok: false; status: 401 | 503; error: string } {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    console.error("[cron/crm/contact-ledger-backfill] CRON_SECRET env var is not configured");
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
    return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
  }

  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch { /* defaults */ }

  try {
    const result = await backfillContactLedger({
      dryRun: body.dryRun !== false, // anything but explicit false → dry-run
      campaignId: typeof body.campaignId === "string" ? body.campaignId : undefined,
      campaignFamilyKey: typeof body.campaignFamilyKey === "string" ? body.campaignFamilyKey : undefined,
      restaurantId: typeof body.restaurantId === "string" ? body.restaurantId : undefined,
      limit: typeof body.limit === "number" ? body.limit : undefined,
    });
    return NextResponse.json(result, { status: 200 });
  } catch (err) {
    const message = err instanceof Error ? err.message.slice(0, 200) : "erro desconhecido";
    return NextResponse.json({ ok: false, error: message }, { status: 200 });
  }
}
