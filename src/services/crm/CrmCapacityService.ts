/**
 * CrmCapacityService — builds the CRM "send budget" forecast for a restaurant:
 * how much capacity exists, how much is consumed, and how the balanced+priority
 * policy WOULD split it across active campaigns (forecast only — see
 * campaignAllocation: the real scheduler is unchanged).
 *
 * Read-only. Never sends, never mutates a campaign.
 */

import { prisma } from "@/lib/prisma";
import { getSafetyConfig, getTodayGlobalSendCount, getWeekGlobalSendCount } from "@/lib/crm-safety";
import { resolveAudience } from "./CrmCampaignService";
import {
  calculateCampaignSendAllocation,
  priorityFromScheduleConfig,
  type AllocationCampaignInput,
} from "./campaignAllocation";

const SENT_STATUSES = ["SENT", "DELIVERED", "READ"] as const;

export interface CapacityForecast {
  budget: {
    dailyCap: number;          // 0 = unlimited
    dailyConsumed: number;
    dailyRemaining: number;    // -1 = unlimited
    weeklyCap: number;         // 0 = off
    weeklyConsumed: number;
    weeklyRemaining: number;   // -1 = off
    maxPerWeekPerCustomer: number;
    customerCooldownHours: number;
  };
  distributionPolicy: {
    /** What actually runs today. */
    activeRuntime: "FIRST_DUE_CONSUMES";
    /** What the forecast models. */
    forecastModel: "BALANCED_PRIORITY";
    note: string;
  };
  activeCampaigns: number;
  allocation: ReturnType<typeof calculateCampaignSendAllocation>;
}

export async function getCapacityForecast(restaurantId: string): Promise<CapacityForecast> {
  const [safety, dailyConsumed, weeklyConsumed, campaigns] = await Promise.all([
    getSafetyConfig(restaurantId),
    getTodayGlobalSendCount(restaurantId),
    getWeekGlobalSendCount(restaurantId),
    prisma.campaign.findMany({
      where: {
        restaurantId,
        status: { in: ["ACTIVE", "SCHEDULED", "SENDING"] as never[] },
      },
      select: { id: true, name: true, targetSegment: true, templateId: true, scheduleConfig: true },
    }),
  ]);

  // Only recurring campaigns participate in the daily budget forecast.
  const recurring = campaigns.filter((c) => {
    const cfg = c.scheduleConfig as { mode?: string } | null;
    return cfg?.mode === "RECURRING";
  });

  const cutoff24h = new Date(Date.now() - 24 * 60 * 60 * 1000);

  const inputs: AllocationCampaignInput[] = await Promise.all(
    recurring.map(async (c) => {
      const cfg = c.scheduleConfig as { dailyLimit?: number } | null;
      const dailyLimit = Math.max(1, Math.min(cfg?.dailyLimit ?? 20, 200));
      const [audience, alreadySentLifetime, alreadySent24h] = await Promise.all([
        resolveAudience(restaurantId, c.targetSegment ?? "", c.templateId ?? undefined).then((a) => a.length).catch(() => 0),
        prisma.campaignExecution.count({ where: { campaignId: c.id, status: { in: [...SENT_STATUSES] } } }),
        prisma.campaignExecution.count({ where: { campaignId: c.id, status: { in: [...SENT_STATUSES] }, sentAt: { gte: cutoff24h } } }),
      ]);
      return {
        campaignId: c.id,
        campaignName: c.name,
        priority: priorityFromScheduleConfig(c.scheduleConfig),
        dailyLimit,
        eligibleNow: Math.max(0, audience - alreadySentLifetime),
        alreadySent24h,
      };
    }),
  );

  const allocation = calculateCampaignSendAllocation({
    globalDailyCap: safety.dailyGlobalCap,
    globalDailyConsumed: dailyConsumed,
    weeklyGlobalCap: safety.weeklyGlobalCap,
    weeklyGlobalConsumed: weeklyConsumed,
    campaigns: inputs,
  });

  return {
    budget: {
      dailyCap: safety.dailyGlobalCap,
      dailyConsumed,
      dailyRemaining: safety.dailyGlobalCap === 0 ? -1 : Math.max(0, safety.dailyGlobalCap - dailyConsumed),
      weeklyCap: safety.weeklyGlobalCap,
      weeklyConsumed,
      weeklyRemaining: safety.weeklyGlobalCap === 0 ? -1 : Math.max(0, safety.weeklyGlobalCap - weeklyConsumed),
      maxPerWeekPerCustomer: safety.maxPerWeekPerCustomer,
      customerCooldownHours: safety.customerCooldownHours,
    },
    distributionPolicy: {
      activeRuntime: "FIRST_DUE_CONSUMES",
      forecastModel: "BALANCED_PRIORITY",
      note: "O envio real ainda usa a regra atual (a primeira campanha do ciclo consome o orçamento). A previsão abaixo mostra como uma distribuição equilibrada por prioridade dividiria a capacidade — e onde há risco de competição.",
    },
    activeCampaigns: recurring.length,
    allocation,
  };
}
