/**
 * POST /api/crm/campaigns/reset-metrics
 *
 * Wipes past campaign data so the panel and analytics start clean:
 *   - every campaign's counters (sent/failed/read/responded/converted/revenue) → 0
 *   - the failed / blocked / skipped execution LOG rows are deleted, so the old
 *     failure history stops polluting the "Mensagens enviadas" list and counts.
 *
 * Safety: SUCCESSFUL sends (SENT / DELIVERED / READ) are KEPT. The runner reads
 * those to avoid re-messaging a customer who already got a message — deleting them
 * would risk a re-send, so they stay. The contact ledger (anti-repeat memory) is
 * also untouched. Nobody is re-messaged because of a reset.
 */

import { NextRequest } from "next/server";
import { getTenantContext } from "@/lib/tenant";
import { ok, unauthorized, serverError } from "@/lib/api-response";
import { prisma } from "@/lib/prisma";

// Statuses that represent a real successful contact — kept for send-dedup + history.
const KEEP_STATUSES = ["SENT", "DELIVERED", "READ"];

export async function POST(req: NextRequest) {
  try {
    const ctx = getTenantContext(req);
    if (!ctx) return unauthorized();

    const [counters, deleted] = await prisma.$transaction([
      prisma.campaign.updateMany({
        where: { restaurantId: ctx.restaurantId },
        data: {
          totalSent:      0,
          totalFailed:    0,
          totalRead:      0,
          totalResponded: 0,
          totalConverted: 0,
          totalRevenue:   0,
        },
      }),
      // Purge only the non-successful log rows (failures, blocks, skips, pending).
      prisma.campaignExecution.deleteMany({
        where: {
          restaurantId: ctx.restaurantId,
          status: { notIn: KEEP_STATUSES as never[] },
        },
      }),
    ]);

    return ok({ campaignsReset: counters.count, executionsPurged: deleted.count });
  } catch (err) {
    console.error("[POST /api/crm/campaigns/reset-metrics]", err);
    return serverError();
  }
}
