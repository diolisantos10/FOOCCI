/**
 * POST /api/cron/crm/restart-cold-campaign
 *
 * Cron-safe (Bearer CRON_SECRET) preparation of the NEW cold-recovery campaign:
 * creates it PAUSED (never sends — the runner ignores PAUSED) and returns its
 * preflight diagnosis. Idempotent: reuses an existing PAUSED campaign of the same
 * concept instead of creating duplicates.
 *
 * DEFAULTS TO DRY-RUN (no create). A real creation requires body.dryRun === false
 * AND a restaurantId. Never sends WhatsApp, never activates a campaign.
 */

import { NextRequest, NextResponse } from "next/server";
import { prepareNewColdCampaign } from "@/services/crm/CRMColdCampaignPrepareService";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function checkCronAuth(req: NextRequest): { ok: true } | { ok: false; status: 401 | 503; error: string } {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    console.error("[cron/crm/restart-cold-campaign] CRON_SECRET env var is not configured");
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
      restaurantId?: string;
      sourceCampaignId?: string;
      name?: string;
      campaignFamilyKey?: string;
      dedupeWindowDays?: number;
      reuseMessage?: boolean;
      message?: string;
    };
    if (!body.restaurantId) {
      return NextResponse.json(
        { ok: false, error: "restaurantId é obrigatório", runtimeTouched: false },
        { status: 400 },
      );
    }
    const result = await prepareNewColdCampaign({
      dryRun: body.dryRun !== false, // default DRY-RUN
      restaurantId: body.restaurantId,
      sourceCampaignId: body.sourceCampaignId,
      name: body.name,
      campaignFamilyKey: body.campaignFamilyKey,
      dedupeWindowDays: typeof body.dedupeWindowDays === "number" ? body.dedupeWindowDays : undefined,
      reuseMessage: typeof body.reuseMessage === "boolean" ? body.reuseMessage : undefined,
      message: typeof body.message === "string" ? body.message : undefined,
    });
    return NextResponse.json({ ...result, runtimeTouched: false }, { status: 200 });
  } catch (err) {
    const message = err instanceof Error ? err.message.slice(0, 200) : "erro desconhecido";
    return NextResponse.json({ ok: false, error: message, runtimeTouched: false }, { status: 200 });
  }
}
