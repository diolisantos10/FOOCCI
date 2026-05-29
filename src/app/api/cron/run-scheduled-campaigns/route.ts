/**
 * POST /api/cron/run-scheduled-campaigns
 *
 * Auth: Authorization: Bearer {CRON_SECRET}
 *
 * Query params (or JSON body):
 *   dryRun=true           — preview only, no messages sent
 *   restaurantId=<id>     — scope to one restaurant
 *   campaignId=<id>       — run a specific campaign
 *   limit=<n>             — override batch size cap
 *
 * Response:
 *   { ok, dryRun, campaignsProcessed, totalEligible, totalSent, totalSkipped, results[] }
 */

import { NextRequest, NextResponse } from "next/server";
import { ScheduledCampaignRunnerService } from "@/services/crm/ScheduledCampaignRunnerService";

function checkCronAuth(req: NextRequest): { ok: true } | { ok: false; status: 401 | 503; error: string } {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    console.error("[cron/run-scheduled-campaigns] CRON_SECRET env var is not configured — scheduled campaigns will not run");
    return { ok: false, status: 503, error: "CRON_SECRET is not configured" };
  }
  const auth = req.headers.get("authorization") ?? "";
  if (auth !== `Bearer ${secret}`) {
    return { ok: false, status: 401, error: "Unauthorized" };
  }
  return { ok: true };
}

export async function POST(req: NextRequest) {
  const auth = checkCronAuth(req);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  try {
    // Accept params from both query string and JSON body
    const url   = req.nextUrl;
    const body  = await req.json().catch(() => ({})) as Record<string, unknown>;

    const dryRun       = url.searchParams.get("dryRun") === "true" || body.dryRun === true;
    const restaurantId = (url.searchParams.get("restaurantId") ?? body.restaurantId as string | undefined) || undefined;
    const campaignId   = (url.searchParams.get("campaignId")   ?? body.campaignId  as string | undefined) || undefined;
    const limitRaw     = url.searchParams.get("limit")         ?? body.limit;

    // Default batch cap: 5 per cron run when no explicit limit is given.
    // Prevents runaway requests when the workflow omits the limit param.
    const BATCH_DEFAULT = 5;
    const limit = limitRaw
      ? Math.min(200, Math.max(1, parseInt(String(limitRaw))))
      : BATCH_DEFAULT;

    // Auto-recover any campaigns stuck in SENDING from previous crashed runs.
    // Safe: dryRun flag is threaded through — no DB writes in preview mode.
    const recovery = await ScheduledCampaignRunnerService.recoverStuckSendingCampaigns({ restaurantId, dryRun });
    if (recovery.recovered > 0) {
      console.log(`[cron/run-scheduled-campaigns] Recovered ${recovery.recovered} stuck-SENDING campaigns → SCHEDULED`, recovery.campaignIds);
    }

    if (campaignId) {
      // Single-campaign run
      const result = await ScheduledCampaignRunnerService.runCampaignBatch(campaignId, { dryRun, limit });
      return NextResponse.json({
        ok: true,
        dryRun,
        campaignsProcessed: 1,
        totalEligible:      result.eligible,
        totalSent:          result.sent,
        totalSkipped:       result.skipped,
        results:            [result],
      });
    }

    // Run all due campaigns (optionally scoped to one restaurant)
    const summary = await ScheduledCampaignRunnerService.runDueCampaigns({ restaurantId, dryRun, limit });

    return NextResponse.json({ ok: true, ...summary });
  } catch (err) {
    console.error("[cron/run-scheduled-campaigns]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
