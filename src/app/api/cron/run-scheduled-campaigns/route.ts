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
import { provisionPoolTemplates } from "@/services/whatsapp/MetaTemplateProvisionService";
import { prisma } from "@/lib/prisma";

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

    // Default batch cap when no explicit limit is given — an upper-bound guard
    // only: the runner enforces the real per-provider caps (Evolution Web 5/run,
    // Meta official 40/run).
    const BATCH_DEFAULT = 40;
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

    // Zero-click Meta approval: make sure every catalog/custom phrase of every
    // active campaign has its template submitted. After the first sweep this is a
    // handful of DB reads per restaurant (skip-guard) — no Graph traffic.
    if (!dryRun) {
      try {
        // `metaCrmEnabled` saiu deste filtro em 04/08. Ele era o interruptor
        // "usar a Meta no CRM" de quando havia dois provedores; com a Meta como
        // canal ÚNICO, mantê-lo aqui produzia o pior dos mundos: a loja envia
        // (o envio não olha mais esse campo) mas nunca ganha modelo aprovado —
        // e aí toda audiência fora da janela de 24h volta BLOCKED para sempre.
        // O que gateia de verdade é a conexão.
        const metaRestaurants = await prisma.metaWhatsAppConfig.findMany({
          where:  { connectionStatus: "CONNECTED", ...(restaurantId ? { restaurantId } : {}) },
          select: { restaurantId: true },
        });
        for (const r of metaRestaurants) {
          const res = await provisionPoolTemplates(r.restaurantId).catch(() => null);
          if (res && res.created > 0) {
            console.log(`[cron/run-scheduled-campaigns] auto-submitted ${res.created} phrase template(s) to Meta`, { restaurantId: r.restaurantId });
          }
        }
      } catch (e) {
        console.warn("[cron/run-scheduled-campaigns] phrase template provisioning failed", e);
      }
    }

    return NextResponse.json({ ok: true, ...summary });
  } catch (err) {
    console.error("[cron/run-scheduled-campaigns]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
