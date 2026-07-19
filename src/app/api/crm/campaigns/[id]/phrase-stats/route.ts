/**
 * GET /api/crm/campaigns/[id]/phrase-stats
 *
 * Per-phrase effectiveness for the campaign's message pool, keyed by variantKey
 * (the phrase fingerprint each execution recorded):
 *   { [variantKey]: { sent, converted, revenue } }
 *
 * This is what shows the owner which phrase converts best — and what the future
 * CRM agent reads to breed better phrases. Read-only, tenant-scoped.
 */

import { NextRequest } from "next/server";
import { getTenantContext } from "@/lib/tenant";
import { ok, notFound, unauthorized, serverError } from "@/lib/api-response";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const ctx = getTenantContext(req);
    if (!ctx) return unauthorized();

    const campaign = await prisma.campaign.findFirst({
      where:  { id: params.id, restaurantId: ctx.restaurantId },
      select: { id: true },
    });
    if (!campaign) return notFound("Campanha não encontrada");

    const base = { campaignId: campaign.id, variantKey: { not: null } };
    const [sentRows, convRows, revRows] = await Promise.all([
      prisma.campaignExecution.groupBy({
        by: ["variantKey"], where: { ...base, status: "SENT" as never }, _count: { _all: true },
      }),
      prisma.campaignExecution.groupBy({
        by: ["variantKey"], where: { ...base, converted: true }, _count: { _all: true },
      }),
      prisma.campaignExecution.groupBy({
        by: ["variantKey"], where: { ...base, converted: true }, _sum: { revenue: true },
      }),
    ]);

    const stats: Record<string, { sent: number; converted: number; revenue: number }> = {};
    const row = (k: string | null) => {
      if (!k) return null;
      return (stats[k] ??= { sent: 0, converted: 0, revenue: 0 });
    };
    for (const r of sentRows) { const s = row(r.variantKey); if (s) s.sent = r._count._all; }
    for (const r of convRows) { const s = row(r.variantKey); if (s) s.converted = r._count._all; }
    for (const r of revRows)  { const s = row(r.variantKey); if (s) s.revenue = Number(r._sum.revenue ?? 0); }

    return ok(stats);
  } catch (err) {
    console.error("[GET /api/crm/campaigns/[id]/phrase-stats]", err);
    return serverError();
  }
}
