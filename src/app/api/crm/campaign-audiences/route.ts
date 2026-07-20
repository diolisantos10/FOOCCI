/**
 * GET /api/crm/campaign-audiences
 *
 * Per-campaign eligible audience for the Ativas table, keyed by campaignId:
 *   { [campaignId]: number }   // clients currently in the campaign's segment who
 *                              // can receive a WhatsApp message (reachable pool)
 *
 * Recomputed live from the customer base each call, so it reflects TODAY's
 * segmentation — a customer that slid from frio to perdido is counted under the
 * right campaign automatically. Resolved once per distinct templateId (segment),
 * then fanned out to every campaign that shares it. Read-only, tenant-scoped.
 */

import { NextRequest } from "next/server";
import { getTenantContext } from "@/lib/tenant";
import { ok, unauthorized, serverError } from "@/lib/api-response";
import { prisma } from "@/lib/prisma";
import { CrmAudienceService } from "@/services/crm/CrmAudienceService";
import { getSegmentConfig } from "@/lib/crm-segments";
import { getSafetyConfig } from "@/lib/crm-safety";
import { CRMWhatsAppBudgetPlanner, inferCampaignPriority } from "@/services/crm/CRMWhatsAppBudgetPlanner";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const ctx = getTenantContext(req);
    if (!ctx) return unauthorized();

    const campaigns = await prisma.campaign.findMany({
      where:  { restaurantId: ctx.restaurantId, status: { in: ["ACTIVE", "SCHEDULED"] as never[] } },
      select: { id: true, templateId: true, targetSegment: true, scheduleConfig: true },
    });

    const segCfg = await getSegmentConfig(ctx.restaurantId);

    // A custom campaign has no ready-made templateId, only a targetSegment. Map those
    // segments to the audience template that computes the same pool, so they resolve too.
    const SEGMENT_TEMPLATE: Record<string, string> = {
      FRIO:            "recuperar-frios",
      MORNO:           "reativar-mornos",
      QUENTE:          "clientes-quentes",
      PERDIDO:         "recuperar-perdidos",
      NOVOS:           "segunda-compra",
      PRIMEIRO_PEDIDO: "segunda-compra",
      VIP:             "clientes-vip",
      TODOS:           "todos-clientes",
    };

    // Resolve each distinct template/segment once (avoid recomputing shared segments).
    const byTemplate = new Map<string, number>();
    const templateOf = (c: (typeof campaigns)[number]) =>
      c.templateId || (c.targetSegment && SEGMENT_TEMPLATE[c.targetSegment]) || c.targetSegment || "todos-clientes";

    const distinct = [...new Set(campaigns.map(templateOf))];
    await Promise.all(distinct.map(async (tpl) => {
      try {
        const res = await CrmAudienceService.getAudiencePreview(ctx.restaurantId, tpl, segCfg);
        byTemplate.set(tpl, res.eligibleCount);
      } catch {
        byTemplate.set(tpl, 0);
      }
    }));

    const map: Record<string, number> = {};
    for (const c of campaigns) {
      // Recurring campaigns only — cart recovery has its own event-based audience.
      const cfg = c.scheduleConfig as { mode?: string } | null;
      if (cfg?.mode === "CART_RECOVERY") continue;
      map[c.id] = byTemplate.get(templateOf(c)) ?? 0;
    }

    // Effective daily quota per campaign under the CURRENT distribution mode —
    // what the table's "Limite/dia" must show ("quanto vem pra casa"), computed
    // by the same pure planner the runner uses.
    const quotas: Record<string, number> = {};
    let mode = "EQUAL";
    try {
      const budget = (await getSafetyConfig(ctx.restaurantId)).crmWhatsAppSafety;
      if (budget?.enabled) {
        mode = budget.distributionMode;
        const recurring = campaigns.filter((c) => (c.scheduleConfig as { mode?: string } | null)?.mode === "RECURRING");
        if (recurring.length > 0) {
          const plan = CRMWhatsAppBudgetPlanner.plan({
            config:            budget,
            globalSentToday:   0,
            instanceConnected: true,
            campaigns: recurring.map((c) => ({
              campaignId:        c.id,
              priority:          inferCampaignPriority({ templateId: c.templateId, targetSegment: c.targetSegment }),
              alreadySentToday:  0,
              remainingAudience: map[c.id] ?? 0,
              manualDailyQuota:  Math.max(1, Math.min((c.scheduleConfig as { dailyLimit?: number } | null)?.dailyLimit ?? 20, 200)),
            })),
          });
          for (const p of plan.perCampaign) quotas[p.campaignId] = p.dailyQuota;
        }
      }
    } catch (e) {
      console.warn("[campaign-audiences] quota computation failed", e);
    }

    return ok({ audiences: map, quotas, mode });
  } catch (err) {
    console.error("[GET /api/crm/campaign-audiences]", err);
    return serverError();
  }
}
