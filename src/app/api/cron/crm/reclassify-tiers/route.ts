/**
 * POST /api/cron/crm/reclassify-tiers  (Bearer CRON_SECRET)
 *
 * Daily tier reclassification for every restaurant whose relationship program is
 * ON. With a rolling classification window (3/6/12 months) a customer's tier must
 * be recomputed even on days they don't order — a customer who went quiet slides
 * down. Vitalício (window 0) restaurants are recomputed too (cheap, idempotent).
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { RelationshipProgramService } from "@/services/crm/RelationshipProgramService";

function ok(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  return !!secret && (req.headers.get("authorization") ?? "") === `Bearer ${secret}`;
}

export async function POST(req: NextRequest) {
  if (!ok(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const body = await req.json().catch(() => ({})) as { restaurantId?: string };

    const restaurantIds = body.restaurantId
      ? [body.restaurantId]
      : (await prisma.tierSettings.findMany({
          where:  { programEnabled: true },
          select: { restaurantId: true },
        })).map((r) => r.restaurantId);

    let totalUpdated = 0;
    const results: Array<{ restaurantId: string; updated: number }> = [];
    for (const id of restaurantIds) {
      const r = await RelationshipProgramService.recalculateTiers(id).catch(() => ({ updated: 0 }));
      totalUpdated += r.updated;
      results.push({ restaurantId: id, updated: r.updated });
    }

    return NextResponse.json({ ok: true, restaurantsProcessed: restaurantIds.length, totalUpdated, results });
  } catch (err) {
    console.error("[cron/crm/reclassify-tiers]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
