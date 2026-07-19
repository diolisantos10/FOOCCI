/**
 * GET /api/crm/campaigns/[id]/phrase-stats
 *
 * Per-phrase data for the campaign's message pool, keyed by variantKey (the
 * phrase fingerprint):
 *   { stats: { [key]: { sent, converted, revenue } }   // effectiveness
 *   , meta:  { [key]: "APPROVED"|"PENDING"|"REJECTED" } // Meta template status
 *   , metaEnabled: boolean }                            // restaurant uses Meta CRM
 *
 * Shows the owner which phrase converts best AND where each phrase stands in
 * Meta's approval — right where the phrases live. Read-only, tenant-scoped.
 */

import { NextRequest } from "next/server";
import { getTenantContext } from "@/lib/tenant";
import { ok, notFound, unauthorized, serverError } from "@/lib/api-response";
import { prisma } from "@/lib/prisma";
import { readPhraseMetaTemplates } from "@/services/crm/crmMessagePool";

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
      select: { id: true, audienceConfig: true },
    });
    if (!campaign) return notFound("Campanha não encontrada");

    const base = { campaignId: campaign.id, variantKey: { not: null } };
    const phraseTemplates = readPhraseMetaTemplates(campaign.audienceConfig);
    const templateNames   = [...new Set(Object.values(phraseTemplates).map((t) => t.name).filter((n): n is string => !!n))];

    const [sentRows, convRows, revRows, metaCfg, templateRows] = await Promise.all([
      prisma.campaignExecution.groupBy({
        by: ["variantKey"], where: { ...base, status: "SENT" as never }, _count: { _all: true },
      }),
      prisma.campaignExecution.groupBy({
        by: ["variantKey"], where: { ...base, converted: true }, _count: { _all: true },
      }),
      prisma.campaignExecution.groupBy({
        by: ["variantKey"], where: { ...base, converted: true }, _sum: { revenue: true },
      }),
      prisma.metaWhatsAppConfig.findUnique({
        where:  { restaurantId: ctx.restaurantId },
        select: { metaCrmEnabled: true, connectionStatus: true },
      }).catch(() => null),
      templateNames.length > 0
        ? prisma.metaMessageTemplate.findMany({
            where:  { restaurantId: ctx.restaurantId, templateName: { in: templateNames } },
            select: { templateName: true, status: true },
          })
        : Promise.resolve([]),
    ]);

    const stats: Record<string, { sent: number; converted: number; revenue: number }> = {};
    const row = (k: string | null) => {
      if (!k) return null;
      return (stats[k] ??= { sent: 0, converted: 0, revenue: 0 });
    };
    for (const r of sentRows) { const s = row(r.variantKey); if (s) s.sent = r._count._all; }
    for (const r of convRows) { const s = row(r.variantKey); if (s) s.converted = r._count._all; }
    for (const r of revRows)  { const s = row(r.variantKey); if (s) s.revenue = Number(r._sum.revenue ?? 0); }

    // Meta status per phrase: variantKey → its template's current approval status.
    const statusByName = new Map(templateRows.map((t) => [t.templateName, t.status]));
    const meta: Record<string, string> = {};
    for (const [key, tpl] of Object.entries(phraseTemplates)) {
      const st = tpl.name ? statusByName.get(tpl.name) : undefined;
      if (st) meta[key] = st;
    }

    return ok({
      stats,
      meta,
      metaEnabled: metaCfg?.metaCrmEnabled === true && metaCfg.connectionStatus === "CONNECTED",
    });
  } catch (err) {
    console.error("[GET /api/crm/campaigns/[id]/phrase-stats]", err);
    return serverError();
  }
}
