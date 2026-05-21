/**
 * GET /api/crm/campaigns/[id]/debug
 *
 * Read-only diagnostic endpoint. Returns:
 * - Campaign state (status, scheduleConfig)
 * - Whether the runner considers it "due now" and why not if not
 * - Next expected run time
 * - Safety config blocks
 * - Live audience count (re-computed, not from cached counters)
 *
 * Never sends messages. Safe to call at any time.
 */

import { NextRequest } from "next/server";
import { getTenantContext } from "@/lib/tenant";
import { ok, unauthorized, notFound, serverError } from "@/lib/api-response";
import { prisma } from "@/lib/prisma";
import { ScheduledCampaignRunnerService, type RecurringScheduleConfig } from "@/services/crm/ScheduledCampaignRunnerService";
import { resolveAudience } from "@/services/crm/CrmCampaignService";
import { getSafetyConfig, checkQuietHours, checkWeekendBlock } from "@/lib/crm-safety";

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const ctx = getTenantContext(req);
    if (!ctx) return unauthorized();

    const campaign = await prisma.campaign.findUnique({
      where:  { id: params.id },
      select: {
        id: true, restaurantId: true, name: true, status: true,
        targetSegment: true, templateId: true,
        scheduledAt: true, scheduleConfig: true,
        totalSent: true, totalFailed: true, totalAudience: true,
      },
    });

    if (!campaign || campaign.restaurantId !== ctx.restaurantId) {
      return notFound("Campaign not found");
    }

    const now = new Date();
    const cfg = campaign.scheduleConfig as RecurringScheduleConfig | null;
    const isRecurring = cfg?.mode === "RECURRING";

    // ── Runner eligibility ────────────────────────────────────────────────────
    let isDueNow    = false;
    let notDueReason: string | null = null;
    let nextRunAt:  string | null = null;

    if (!["ACTIVE", "SCHEDULED"].includes(campaign.status)) {
      notDueReason = `Campanha está ${campaign.status} (não ativa)`;
    } else if (!isRecurring) {
      notDueReason = "Campanha não é recorrente — executada manualmente";
    } else {
      isDueNow = ScheduledCampaignRunnerService.isCampaignDueNow(campaign, now);
      if (!isDueNow) {
        const tz = cfg?.timezone ?? "America/Sao_Paulo";
        const fmt = new Intl.DateTimeFormat("pt-BR", { timeZone: tz, weekday: "long", hour: "2-digit", minute: "2-digit", hour12: false });
        const localNow = fmt.format(now);

        if (cfg?.weekdays) {
          const dayFmt = new Intl.DateTimeFormat("en-US", { timeZone: tz, weekday: "short" });
          const wdMap: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
          const todayWd = wdMap[dayFmt.format(now)] ?? -1;
          if (!cfg.weekdays.includes(todayWd)) {
            const dayNames = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
            const scheduledDays = cfg.weekdays.map((d) => dayNames[d]).join(", ");
            notDueReason = `Hoje (${localNow}) não é dia de envio. Dias configurados: ${scheduledDays}`;
          } else {
            notDueReason = `Fora da janela de envio (${cfg.timeWindow?.start ?? "?"}–${cfg.timeWindow?.end ?? "?"}, ${tz}). Agora: ${localNow}`;
          }
        } else {
          notDueReason = `Não é hora de executar agora (${localNow})`;
        }

        const nextRun = ScheduledCampaignRunnerService.getNextRunAt(campaign, now);
        if (nextRun) nextRunAt = nextRun.toISOString();
      }
    }

    // ── Safety blocks ─────────────────────────────────────────────────────────
    const safety = await getSafetyConfig(campaign.restaurantId);
    const safetyBlocks: string[] = [];

    const quietReason   = checkQuietHours(safety, now);
    const weekendReason = checkWeekendBlock(safety, now);
    if (quietReason)   safetyBlocks.push(quietReason);
    if (weekendReason) safetyBlocks.push(weekendReason);

    if (safety.dailyGlobalCap > 0) {
      const cutoff24h = new Date(now.getTime() - 86_400_000);
      const globalToday = await prisma.campaignExecution.count({
        where: { restaurantId: campaign.restaurantId, sentAt: { gte: cutoff24h }, status: { in: ["SENT", "DELIVERED", "READ"] } },
      });
      if (globalToday >= safety.dailyGlobalCap) {
        safetyBlocks.push(`Cap global diário atingido (${globalToday}/${safety.dailyGlobalCap})`);
      }
    }

    // ── Daily campaign limit ──────────────────────────────────────────────────
    let dailyCapStatus: string | null = null;
    if (isRecurring && cfg) {
      const dailyLimit = Math.max(1, Math.min(cfg.dailyLimit ?? 20, 200));
      const cutoff24h  = new Date(now.getTime() - 86_400_000);
      const todaySent  = await prisma.campaignExecution.count({
        where: { campaignId: campaign.id, sentAt: { gte: cutoff24h }, status: { in: ["SENT", "DELIVERED", "READ"] } },
      });
      if (todaySent >= dailyLimit) {
        dailyCapStatus = `Limite diário da campanha atingido (${todaySent}/${dailyLimit})`;
      } else {
        dailyCapStatus = `${todaySent}/${dailyLimit} enviados hoje`;
      }
    }

    // ── Live audience ─────────────────────────────────────────────────────────
    let audienceDebug: {
      totalEligible:  number;
      alreadySent:    number;
      newEligible:    number;
      error?:         string;
    } | null = null;

    try {
      const allEligible = await resolveAudience(
        campaign.restaurantId,
        campaign.targetSegment ?? "",
        campaign.templateId ?? undefined
      );

      const alreadySentIds = new Set(
        (await prisma.campaignExecution.findMany({
          where:  { campaignId: campaign.id, status: { in: ["SENT", "DELIVERED", "READ"] } },
          select: { customerId: true },
        })).map((e) => e.customerId)
      );

      const newEligible = allEligible.filter((c) => !alreadySentIds.has(c.id));

      audienceDebug = {
        totalEligible: allEligible.length,
        alreadySent:   alreadySentIds.size,
        newEligible:   newEligible.length,
      };
    } catch (err) {
      audienceDebug = {
        totalEligible: 0,
        alreadySent:   0,
        newEligible:   0,
        error: err instanceof Error ? err.message : "Erro ao calcular audiência",
      };
    }

    return ok({
      campaignId:      campaign.id,
      status:          campaign.status,
      isRecurring,
      isDueNow,
      notDueReason,
      nextRunAt,
      safetyBlocks,
      dailyCapStatus,
      scheduleConfig:  cfg,
      audience:        audienceDebug,
    });
  } catch (err) {
    console.error("[GET /api/crm/campaigns/[id]/debug]", err);
    return serverError();
  }
}
