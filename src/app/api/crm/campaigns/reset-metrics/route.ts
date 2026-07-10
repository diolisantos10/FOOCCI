/**
 * POST /api/crm/campaigns/reset-metrics
 *
 * Wipes the DISPLAYED performance counters of every campaign in the restaurant —
 * sent, failed, read, responded, converted and revenue all go back to 0. Use it
 * to start counting fresh (e.g. after retiring old manual campaigns).
 *
 * Display-only: this does NOT delete CampaignExecution rows or the contact ledger,
 * so send-deduplication / anti-repeat memory is preserved — nobody gets re-messaged
 * because of a reset. New sends and new attributions simply count up from zero.
 */

import { NextRequest } from "next/server";
import { getTenantContext } from "@/lib/tenant";
import { ok, unauthorized, serverError } from "@/lib/api-response";
import { prisma } from "@/lib/prisma";

export async function POST(req: NextRequest) {
  try {
    const ctx = getTenantContext(req);
    if (!ctx) return unauthorized();

    const res = await prisma.campaign.updateMany({
      where: { restaurantId: ctx.restaurantId },
      data: {
        totalSent:      0,
        totalFailed:    0,
        totalRead:      0,
        totalResponded: 0,
        totalConverted: 0,
        totalRevenue:   0,
      },
    });

    return ok({ reset: res.count });
  } catch (err) {
    console.error("[POST /api/crm/campaigns/reset-metrics]", err);
    return serverError();
  }
}
