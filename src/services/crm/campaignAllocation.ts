/**
 * Campaign send allocation / forecast — a PURE model of how the CRM send budget
 * would be shared across active campaigns under a "balanced + priority" policy.
 *
 * IMPORTANT: this is a FORECAST/diagnostic. It does NOT change how the real
 * scheduler sends today (which is still "first due campaign consumes the budget").
 * It exists to make competition between campaigns visible to the restaurant owner
 * and to power the capacity dashboard. No DB, no side effects.
 */

export type CampaignPriority = "LOW" | "NORMAL" | "HIGH" | "CRITICAL";

export const PRIORITY_RANK: Record<CampaignPriority, number> = { CRITICAL: 0, HIGH: 1, NORMAL: 2, LOW: 3 };
export const PRIORITY_LABEL: Record<CampaignPriority, string> = {
  CRITICAL: "Crítica", HIGH: "Alta", NORMAL: "Normal", LOW: "Baixa",
};

export type AllocationRisk = "HEALTHY" | "ATTENTION" | "BLOCKED_BY_LIMIT" | "COMPETING";

export interface AllocationCampaignInput {
  campaignId: string;
  campaignName: string;
  priority: CampaignPriority;
  /** The campaign's own per-day limit (already clamped to ≥ 1). */
  dailyLimit: number;
  /** New eligible recipients right now (already deduped by who has been sent). */
  eligibleNow: number;
  /** Sends for THIS campaign in the last 24h. */
  alreadySent24h: number;
}

export interface AllocationInput {
  /** Restaurant-wide 24h cap. 0 = no cap (unlimited). */
  globalDailyCap: number;
  /** Already consumed across ALL campaigns + automations in the last 24h. */
  globalDailyConsumed: number;
  /** Optional restaurant weekly cap (0/undefined = off). */
  weeklyGlobalCap?: number;
  weeklyGlobalConsumed?: number;
  campaigns: AllocationCampaignInput[];
}

export interface CampaignAllocation {
  campaignId: string;
  campaignName: string;
  priority: CampaignPriority;
  eligibleNow: number;
  /** What the campaign COULD send today by its own limit (demand). */
  campaignDemand: number;
  /** Forecast sends today under the balanced+priority policy. */
  allocatedToday: number;
  /** Eligible that won't be served because the global budget is exhausted. */
  blockedByGlobalCap: number;
  /** Eligible beyond the campaign's own daily limit. */
  blockedByCampaignLimit: number;
  riskLevel: AllocationRisk;
  explanation: string;
}

export interface AllocationResult {
  globalDailyCap: number;
  globalDailyRemaining: number; // -1 = unlimited
  weeklyGlobalCap: number;
  weeklyGlobalRemaining: number; // -1 = off
  budgetToday: number; // -1 = unlimited
  totalEligible: number;
  totalDemand: number;
  totalAllocatedToday: number;
  /** Campaign forecast to consume the most of today's budget. */
  topConsumer: string | null;
  /** Campaigns that have eligible audience but get starved by the budget. */
  atRisk: string[];
  campaigns: CampaignAllocation[];
}

const UNLIMITED = Number.POSITIVE_INFINITY;

function clampNonNeg(n: number): number {
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
}

/** Balanced (water-filling) distribution of `budget` across recipients by demand. */
function balancedFill(
  recipients: Array<{ id: string; demand: number }>,
  alloc: Record<string, number>,
  budget: number,
): number {
  let remaining = budget;
  // Bounded loop — converges fast (each pass either exhausts budget or satisfies a campaign).
  for (let pass = 0; pass < recipients.length + 2 && remaining > 0; pass++) {
    const active = recipients.filter((r) => alloc[r.id]! < r.demand);
    if (active.length === 0) break;
    const share = Math.max(1, Math.floor(remaining / active.length));
    // Serve the smallest-demand first so leftover frees up for larger ones.
    const ordered = [...active].sort((a, b) => (a.demand - alloc[a.id]!) - (b.demand - alloc[b.id]!));
    for (const r of ordered) {
      if (remaining <= 0) break;
      const want = r.demand - alloc[r.id]!;
      const give = Math.min(share, want, remaining);
      alloc[r.id]! += give;
      remaining -= give;
    }
  }
  return remaining;
}

export function calculateCampaignSendAllocation(input: AllocationInput): AllocationResult {
  const dailyCap = clampNonNeg(input.globalDailyCap);
  const dailyConsumed = clampNonNeg(input.globalDailyConsumed);
  const weeklyCap = clampNonNeg(input.weeklyGlobalCap ?? 0);
  const weeklyConsumed = clampNonNeg(input.weeklyGlobalConsumed ?? 0);

  const dailyRemaining = dailyCap === 0 ? UNLIMITED : Math.max(0, dailyCap - dailyConsumed);
  const weeklyRemaining = weeklyCap === 0 ? UNLIMITED : Math.max(0, weeklyCap - weeklyConsumed);
  const budget = Math.min(dailyRemaining, weeklyRemaining);

  // Per-campaign demand = min(eligible, remaining of its own daily limit).
  const demandOf = (c: AllocationCampaignInput) =>
    Math.max(0, Math.min(clampNonNeg(c.eligibleNow), Math.max(0, clampNonNeg(c.dailyLimit) - clampNonNeg(c.alreadySent24h))));

  const alloc: Record<string, number> = {};
  for (const c of input.campaigns) alloc[c.campaignId] = 0;

  if (budget === UNLIMITED) {
    for (const c of input.campaigns) alloc[c.campaignId] = demandOf(c);
  } else {
    // Priority tiers: CRITICAL reserved first, then HIGH, NORMAL, LOW from leftover.
    const tiers: CampaignPriority[] = ["CRITICAL", "HIGH", "NORMAL", "LOW"];
    let remaining = budget;
    for (const tier of tiers) {
      const recipients = input.campaigns
        .filter((c) => c.priority === tier)
        .map((c) => ({ id: c.campaignId, demand: demandOf(c) }))
        .filter((r) => r.demand > 0);
      if (recipients.length === 0) continue;
      remaining = balancedFill(recipients, alloc, remaining);
      if (remaining <= 0) break;
    }
  }

  const totalDemand = input.campaigns.reduce((s, c) => s + demandOf(c), 0);
  const budgetTight = budget !== UNLIMITED && budget < totalDemand;

  const campaigns: CampaignAllocation[] = input.campaigns.map((c) => {
    const demand = demandOf(c);
    const allocated = alloc[c.campaignId] ?? 0;
    const ownLimitLeft = Math.max(0, clampNonNeg(c.dailyLimit) - clampNonNeg(c.alreadySent24h));
    const blockedByCampaignLimit = Math.max(0, clampNonNeg(c.eligibleNow) - ownLimitLeft);
    const blockedByGlobalCap = Math.max(0, demand - allocated);

    let riskLevel: AllocationRisk = "HEALTHY";
    let explanation = "Capacidade saudável — envia tudo o que pode hoje.";
    if (clampNonNeg(c.eligibleNow) === 0) {
      riskLevel = "HEALTHY";
      explanation = "Sem público elegível agora (todos já contactados ou bloqueados).";
    } else if (blockedByGlobalCap > 0 && budgetTight) {
      riskLevel = "COMPETING";
      explanation = `Competindo por orçamento — ${blockedByGlobalCap} elegível(is) podem ficar de fora hoje porque outras campanhas consomem o limite.`;
    } else if (blockedByCampaignLimit > 0) {
      riskLevel = "BLOCKED_BY_LIMIT";
      explanation = `Limitada pelo próprio limite diário — ${blockedByCampaignLimit} elegível(is) além do limite de ${c.dailyLimit}/dia.`;
    } else if (allocated < demand) {
      riskLevel = "ATTENTION";
      explanation = "Atenção — pode não enviar a todos os elegíveis hoje.";
    }

    return {
      campaignId: c.campaignId,
      campaignName: c.campaignName,
      priority: c.priority,
      eligibleNow: clampNonNeg(c.eligibleNow),
      campaignDemand: demand,
      allocatedToday: allocated,
      blockedByGlobalCap,
      blockedByCampaignLimit,
      riskLevel,
      explanation,
    };
  });

  const totalAllocatedToday = campaigns.reduce((s, c) => s + c.allocatedToday, 0);
  const topConsumer = campaigns.length > 0
    ? campaigns.reduce((a, b) => (b.allocatedToday > a.allocatedToday ? b : a)).campaignName
    : null;
  const atRisk = campaigns.filter((c) => c.riskLevel === "COMPETING").map((c) => c.campaignName);

  return {
    globalDailyCap: dailyCap,
    globalDailyRemaining: dailyRemaining === UNLIMITED ? -1 : dailyRemaining,
    weeklyGlobalCap: weeklyCap,
    weeklyGlobalRemaining: weeklyRemaining === UNLIMITED ? -1 : weeklyRemaining,
    budgetToday: budget === UNLIMITED ? -1 : budget,
    totalEligible: input.campaigns.reduce((s, c) => s + clampNonNeg(c.eligibleNow), 0),
    totalDemand,
    totalAllocatedToday,
    topConsumer: totalAllocatedToday > 0 ? topConsumer : null,
    atRisk,
    campaigns,
  };
}

/** Reads a campaign priority from its scheduleConfig JSON (default NORMAL). */
export function priorityFromScheduleConfig(scheduleConfig: unknown): CampaignPriority {
  const p = (scheduleConfig as { priority?: unknown } | null)?.priority;
  return p === "LOW" || p === "HIGH" || p === "CRITICAL" || p === "NORMAL" ? p : "NORMAL";
}
