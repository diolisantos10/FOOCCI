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

function isCronAuthorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const auth = req.headers.get("authorization") ?? "";
  return auth === `Bearer ${secret}`;
}

export async function POST(req: NextRequest) {
  if (!isCronAuthorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    // Accept params from both query string and JSON body
    const url   = req.nextUrl;
    const body  = await req.json().catch(() => ({})) as Record<string, unknown>;

    const dryRun       = url.searchParams.get("dryRun") === "true" || body.dryRun === true;
    const restaurantId = (url.searchParams.get("restaurantId") ?? body.restaurantId as string | undefined) || undefined;
    const campaignId   = (url.searchParams.get("campaignId")   ?? body.campaignId  as string | undefined) || undefined;
    const limitRaw     = url.searchParams.get("limit")         ?? body.limit;
    const limit        = limitRaw ? Math.min(200, Math.max(1, parseInt(String(limitRaw)))) : undefined;

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
