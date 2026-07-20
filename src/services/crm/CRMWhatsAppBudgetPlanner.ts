/**
 * CRMWhatsAppBudgetPlanner
 *
 * Pure budget orchestration for the global CRM WhatsApp sending safety system.
 *
 * It answers a single question for one scheduler cycle (one cron run):
 *   "Given the restaurant's daily/cycle ceilings and the campaigns that are due
 *    right now, how many messages may the CRM send this cycle, and how should
 *    that be split across the campaigns — fairly, without letting any one
 *    campaign drain the whole day, and redistributing slots a campaign cannot
 *    use to the ones that can?"
 *
 * A "cycle" = one ScheduledCampaignRunnerService run. In Evolution Web mode the
 * cycle limit is the TOTAL across all campaigns in that run, never per campaign.
 *
 * This module is intentionally pure (no DB, no clock, no I/O) so the fairness math
 * is fully unit-testable. The scheduler feeds it counts and consumes the plan.
 */

import type { CRMWhatsAppBudgetConfig } from "@/lib/crm-safety";

// ─── Priorities ───────────────────────────────────────────────────────────────

export type CampaignPriority =
  | "BIRTHDAY"
  | "CART_ABANDONED"
  | "POST_ORDER_REVIEW"
  | "REACTIVATION_COLD"
  | "GENERIC_PROMO";

/** Lower number = higher priority (served first in PRIORITY mode). */
const PRIORITY_RANK: Record<CampaignPriority, number> = {
  BIRTHDAY:          0,
  CART_ABANDONED:    1,
  POST_ORDER_REVIEW: 2,
  REACTIVATION_COLD: 3,
  GENERIC_PROMO:     4,
};

/**
 * Best-effort mapping from a campaign's identifiers to a safety priority.
 * Unknown campaigns fall back to GENERIC_PROMO (lowest), so they only ever use
 * budget the higher-priority relationship/transactional campaigns leave behind.
 */
export function inferCampaignPriority(campaign: {
  templateId?:    string | null;
  objective?:     string | null;
  targetSegment?: string | null;
}): CampaignPriority {
  const tid = (campaign.templateId    ?? "").toLowerCase();
  const obj = (campaign.objective     ?? "").toUpperCase();
  const seg = (campaign.targetSegment ?? "").toLowerCase();

  if (tid === "auto:birthday" || tid === "aniversariantes" || obj === "BIRTHDAY" || seg.includes("aniversariant")) {
    return "BIRTHDAY";
  }
  if (tid.includes("carrinho") || seg.includes("carrinho") || seg.includes("abandon") || obj === "CART_ABANDONED") {
    return "CART_ABANDONED";
  }
  // Coupon about to expire is as time-critical as an abandoned cart — same rank.
  if (tid === "cupom-vencendo" || seg.includes("cupom-vencendo")) {
    return "CART_ABANDONED";
  }
  if (tid.includes("avaliacao") || seg.includes("avaliacao") || seg.includes("pedido-avaliacao") || obj === "POST_ORDER" || obj === "REVIEW") {
    return "POST_ORDER_REVIEW";
  }
  if (
    seg.includes("frio") || seg.includes("morno") || seg.includes("sumido") ||
    seg.includes("reativ") || seg.includes("esfri") || tid.includes("esfri") ||
    seg.includes("perdid") || tid.includes("perdid") ||
    obj === "REACTIVATION"
  ) {
    return "REACTIVATION_COLD";
  }
  return "GENERIC_PROMO";
}

// ─── Types ────────────────────────────────────────────────────────────────────

export type BudgetBlockReason =
  | "SAFETY_DISABLED"
  | "INSTANCE_DISCONNECTED"
  | "FAILURE_RATE_PAUSED"
  | "GLOBAL_DAILY_LIMIT_REACHED"
  | "GLOBAL_CYCLE_LIMIT_REACHED"
  | "CAMPAIGN_DAILY_QUOTA_REACHED"
  | "NO_ELIGIBLE_RECIPIENTS";

export interface BudgetCampaignInput {
  campaignId:        string;
  campaignName?:     string;
  priority:          CampaignPriority;
  /** Messages this campaign already sent in the rolling daily window. */
  alreadySentToday:  number;
  /** Upper bound of recipients still eligible to receive this campaign (after dedupe). */
  remainingAudience: number;
  /** This campaign's own configured daily limit — its quota in MANUAL distribution mode. */
  manualDailyQuota?: number;
}

export interface BudgetPlannerInput {
  config:             CRMWhatsAppBudgetConfig;
  /** CRM messages already sent across ALL campaigns in the rolling daily window. */
  globalSentToday:    number;
  /** Whether the WhatsApp/Evolution instance is currently connected (state=open). */
  instanceConnected:  boolean;
  /** True once the circuit breaker has tripped for this cycle. */
  failureRatePaused?: boolean;
  campaigns:          BudgetCampaignInput[];
}

export interface BudgetCampaignAllocation {
  campaignId:       string;
  campaignName?:    string;
  priority:         CampaignPriority;
  /** This campaign's share of the daily budget (rolling 24h). */
  dailyQuota:       number;
  alreadySentToday: number;
  /** Messages this campaign may send THIS cycle. */
  allocated:        number;
  /** Why allocated is 0 (or why it is capped). Undefined when allocated > 0 and unconstrained. */
  reason?:          BudgetBlockReason;
}

export interface BudgetPlan {
  /** Whether the global budget orchestration is active. */
  enabled:               boolean;
  /** Total messages the whole CRM may send this cycle. */
  allowedTotalThisCycle: number;
  /** Whether a finite daily cap is in effect. */
  dailyLimitEnabled:     boolean;
  /** Remaining daily budget across all campaigns (MAX_SAFE_INTEGER when uncapped). */
  remainingDailyBudget:  number;
  /** Set when the WHOLE cycle is blocked (instance/failure/daily limit). */
  globalBlockReason?:    BudgetBlockReason;
  perCampaign:           BudgetCampaignAllocation[];
}

const UNLIMITED = Number.MAX_SAFE_INTEGER;

// ─── Daily quota ──────────────────────────────────────────────────────────────

/**
 * Even split of the daily budget across N campaigns, distributing any remainder
 * to the first campaigns in `order` (one extra each). Uncapped → everyone gets
 * UNLIMITED. This is the per-campaign ceiling for the whole day, so no single
 * campaign can drain the restaurant's daily budget.
 */
function computeDailyQuotas(dailyLimit: number, n: number, order: number[]): number[] {
  if (n === 0) return [];
  if (dailyLimit <= 0) return new Array(n).fill(UNLIMITED);
  const base = Math.floor(dailyLimit / n);
  let remainder = dailyLimit - base * n;
  const quotas: number[] = new Array(n).fill(base);
  for (const idx of order) {
    if (remainder <= 0) break;
    quotas[idx] = (quotas[idx] ?? 0) + 1;
    remainder -= 1;
  }
  return quotas;
}

/**
 * AUDIENCE mode: split the daily budget proportionally to each campaign's
 * eligible audience — a campaign with 300 frios gets 3× the quota of one with
 * 100 mornos. Campaigns with a non-empty audience always get at least 1 slot
 * (a tiny segment must still trickle). Zero-audience campaigns get 0. Falls
 * back to the even split when no audience data is available.
 */
function computeAudienceQuotas(dailyLimit: number, audiences: number[], order: number[]): number[] {
  const n = audiences.length;
  if (n === 0) return [];
  if (dailyLimit <= 0) return new Array(n).fill(UNLIMITED);
  const weights = audiences.map((a) => (Number.isFinite(a) && a > 0 ? a : 0));
  const total   = weights.reduce((s, v) => s + v, 0);
  if (total <= 0) return computeDailyQuotas(dailyLimit, n, order);

  const quotas = weights.map((w) => (w > 0 ? Math.max(1, Math.floor((dailyLimit * w) / total)) : 0));
  // Hand out any remainder (or claw back any floor-overshoot) by priority order.
  let assigned = quotas.reduce((s, v) => s + v, 0);
  for (const idx of order) {
    if (assigned >= dailyLimit) break;
    if ((weights[idx] ?? 0) > 0) { quotas[idx] = (quotas[idx] ?? 0) + 1; assigned += 1; }
  }
  for (const idx of [...order].reverse()) {
    if (assigned <= dailyLimit) break;
    if ((quotas[idx] ?? 0) > 1) { quotas[idx] = (quotas[idx] ?? 0) - 1; assigned -= 1; }
  }
  return quotas;
}

// ─── Cycle distribution ─────────────────────────────────────────────────────────

/**
 * Spread `total` cycle slots across campaigns, each bounded by `capacity[i]`.
 *
 * EQUAL    → round-robin one slot at a time (gives the fair 1/1/1/1/1 and 3/2
 *            splits and naturally hands an empty campaign's slot to the others).
 * PRIORITY → greedy by `order` (highest priority filled to capacity first, the
 *            rest use whatever is left).
 */
export function distributeCycle(
  total: number,
  capacity: number[],
  mode: "EQUAL" | "PRIORITY",
  order: number[],
): number[] {
  const n = capacity.length;
  const allocated: number[] = new Array(n).fill(0);
  let remaining = Math.max(0, total);
  if (n === 0 || remaining === 0) return allocated;

  if (mode === "PRIORITY") {
    for (const idx of order) {
      if (remaining <= 0) break;
      const take = Math.min((capacity[idx] ?? 0) - (allocated[idx] ?? 0), remaining);
      if (take > 0) {
        allocated[idx] = (allocated[idx] ?? 0) + take;
        remaining -= take;
      }
    }
    return allocated;
  }

  // EQUAL — round-robin until budget or capacity is exhausted.
  let progressed = true;
  while (remaining > 0 && progressed) {
    progressed = false;
    for (const idx of order) {
      if (remaining <= 0) break;
      if ((allocated[idx] ?? 0) < (capacity[idx] ?? 0)) {
        allocated[idx] = (allocated[idx] ?? 0) + 1;
        remaining -= 1;
        progressed = true;
      }
    }
  }
  return allocated;
}

// ─── Planner ──────────────────────────────────────────────────────────────────

export class CRMWhatsAppBudgetPlanner {
  /**
   * Produce the budget plan for one cycle. Pure — no side effects.
   */
  static plan(input: BudgetPlannerInput): BudgetPlan {
    const { config, globalSentToday, instanceConnected, failureRatePaused, campaigns } = input;
    const n = campaigns.length;

    const dailyLimitEnabled = config.globalDailyLimit > 0;
    const remainingDailyBudget = dailyLimitEnabled
      ? Math.max(0, config.globalDailyLimit - globalSentToday)
      : UNLIMITED;

    // Helper to stamp the same global reason on every campaign and return early.
    const blockAll = (reason: BudgetBlockReason): BudgetPlan => ({
      enabled: config.enabled,
      allowedTotalThisCycle: 0,
      dailyLimitEnabled,
      remainingDailyBudget,
      globalBlockReason: reason,
      perCampaign: campaigns.map((c) => ({
        campaignId:       c.campaignId,
        campaignName:     c.campaignName,
        priority:         c.priority,
        dailyQuota:       0,
        alreadySentToday: c.alreadySentToday,
        allocated:        0,
        reason,
      })),
    });

    if (!config.enabled) return blockAll("SAFETY_DISABLED");
    if (config.stopOnInstanceDisconnected && !instanceConnected) return blockAll("INSTANCE_DISCONNECTED");
    if (failureRatePaused) return blockAll("FAILURE_RATE_PAUSED");
    if (dailyLimitEnabled && remainingDailyBudget <= 0) return blockAll("GLOBAL_DAILY_LIMIT_REACHED");

    // Priority order (stable): primary by rank, tiebreak by input order.
    const order = campaigns
      .map((_, i) => i)
      .sort((a, b) => {
        const ra = PRIORITY_RANK[campaigns[a]!.priority];
        const rb = PRIORITY_RANK[campaigns[b]!.priority];
        return ra !== rb ? ra - rb : a - b;
      });

    const mode: "EQUAL" | "PRIORITY" = input.config.distributionMode === "PRIORITY" ? "PRIORITY" : "EQUAL";

    // MANUAL mode: each campaign's own configured daily limit is its quota (the
    // owner sets it per campaign), instead of an equal split of the global budget.
    // Campaigns without a limit fall back to the equal share so a half-configured
    // setup still behaves sanely. The global daily/cycle ceilings still apply.
    // AUDIENCE mode: the daily budget is split proportionally to each campaign's
    // eligible audience — bigger segments get bigger quotas, automatically.
    const equalQuotas = computeDailyQuotas(config.globalDailyLimit, n, order);
    const dailyQuotas =
      config.distributionMode === "MANUAL"
        ? campaigns.map((c, i) =>
            typeof c.manualDailyQuota === "number" && c.manualDailyQuota >= 0
              ? c.manualDailyQuota
              : (equalQuotas[i] ?? 0))
        : config.distributionMode === "AUDIENCE"
        ? computeAudienceQuotas(config.globalDailyLimit, campaigns.map((c) => c.remainingAudience), order)
        : equalQuotas;

    // Per-campaign capacity this cycle = what's left of the daily quota, bounded
    // by the remaining audience (no point allocating a slot nobody can receive).
    const quotaRemaining = campaigns.map((c, i) => Math.max(0, (dailyQuotas[i] ?? 0) - c.alreadySentToday));
    const capacity = campaigns.map((c, i) => Math.max(0, Math.min(quotaRemaining[i] ?? 0, c.remainingAudience)));

    const totalCapacity = capacity.reduce((s, v) => s + v, 0);
    const allowedTotalThisCycle = Math.min(config.globalCycleLimit, remainingDailyBudget, totalCapacity);

    const allocated = distributeCycle(allowedTotalThisCycle, capacity, mode, order);

    const perCampaign: BudgetCampaignAllocation[] = campaigns.map((c, i) => {
      const alloc = allocated[i] ?? 0;
      const quota = dailyQuotas[i] ?? 0;
      let reason: BudgetBlockReason | undefined;
      if (alloc === 0) {
        if ((quotaRemaining[i] ?? 0) <= 0) reason = "CAMPAIGN_DAILY_QUOTA_REACHED";
        else if (c.remainingAudience <= 0) reason = "NO_ELIGIBLE_RECIPIENTS";
        else                               reason = "GLOBAL_CYCLE_LIMIT_REACHED";
      }
      return {
        campaignId:       c.campaignId,
        campaignName:     c.campaignName,
        priority:         c.priority,
        dailyQuota:       quota === UNLIMITED ? 0 : quota,
        alreadySentToday: c.alreadySentToday,
        allocated:        alloc,
        reason,
      };
    });

    return {
      enabled: config.enabled,
      allowedTotalThisCycle: allocated.reduce((s, v) => s + v, 0),
      dailyLimitEnabled,
      remainingDailyBudget,
      perCampaign,
    };
  }
}

// ─── Cycle interval ────────────────────────────────────────────────────────────

/**
 * True when the CRM produced execution activity more recently than the minimum
 * interval between cycles — the current run should wait for the next tick.
 * Any execution row counts (sent/blocked/skipped): each one marks a cycle that
 * actually did work, and spacing exists to protect the WhatsApp number.
 */
export function isCycleIntervalActive(
  lastActivityAt: Date | string | null,
  minMinutes: number,
  now: Date = new Date(),
): boolean {
  if (!lastActivityAt || minMinutes <= 0) return false;
  const t = new Date(lastActivityAt).getTime();
  if (Number.isNaN(t)) return false;
  return now.getTime() - t < minMinutes * 60_000;
}

// ─── Circuit breaker (Evolution Web) ────────────────────────────────────────────

export interface CircuitBreakerTally {
  /** Real provider/Evolution send failures so far this cycle (NOT safety blocks/skips). */
  providerFailures: number;
  /** Successful sends so far this cycle. */
  sent: number;
}

export interface CircuitBreakerVerdict {
  tripped: boolean;
  reason?: "FAILURE_RATE_PAUSED";
  message?: string;
}

/**
 * Decide whether the cycle should stop sending because Evolution is failing.
 *
 * Trips when EITHER:
 *   - provider failures reach maxConsecutiveProviderFailures, OR
 *   - the provider failure rate (failures / attempts) reaches pauseOnFailureRatePercent.
 *
 * Only REAL provider failures feed this — safety blocks (opt-out/cooldown/weekly
 * cap) and recipient-data skips (no/invalid phone) are never counted, so a wave of
 * legitimately-blocked recipients can never trip the breaker.
 */
export function evaluateCircuitBreaker(
  tally: CircuitBreakerTally,
  config: Pick<CRMWhatsAppBudgetConfig, "maxConsecutiveProviderFailures" | "pauseOnFailureRatePercent">,
): CircuitBreakerVerdict {
  const failures = Math.max(0, tally.providerFailures);
  const attempts = failures + Math.max(0, tally.sent);

  if (config.maxConsecutiveProviderFailures > 0 && failures >= config.maxConsecutiveProviderFailures) {
    return { tripped: true, reason: "FAILURE_RATE_PAUSED", message: "Pausado por segurança: muitas falhas do WhatsApp neste ciclo." };
  }
  if (config.pauseOnFailureRatePercent > 0 && attempts > 0) {
    const ratePercent = (failures / attempts) * 100;
    if (ratePercent >= config.pauseOnFailureRatePercent) {
      return { tripped: true, reason: "FAILURE_RATE_PAUSED", message: "Pausado por segurança: muitas falhas do WhatsApp neste ciclo." };
    }
  }
  return { tripped: false };
}

// ─── Human-readable reasons (PT-BR) for the campaign detail UI ───────────────────

/**
 * Maps a machine block reason + allocation into the owner-facing wording the
 * campaign detail screen shows.
 */
export function describeBudgetAllocation(a: Pick<BudgetCampaignAllocation, "allocated" | "reason">): string {
  if (a.allocated > 0) {
    return a.allocated === 1
      ? "Receberá 1 envio no próximo ciclo"
      : `Receberá ${a.allocated} envios no próximo ciclo`;
  }
  switch (a.reason) {
    case "INSTANCE_DISCONNECTED":        return "WhatsApp desconectado";
    case "FAILURE_RATE_PAUSED":          return "Pausado por segurança";
    case "GLOBAL_DAILY_LIMIT_REACHED":   return "Limite global diário atingido";
    case "CAMPAIGN_DAILY_QUOTA_REACHED": return "Limite diário da campanha atingido";
    case "GLOBAL_CYCLE_LIMIT_REACHED":   return "Aguardando próximo ciclo";
    case "NO_ELIGIBLE_RECIPIENTS":       return "Sem clientes elegíveis no momento";
    case "SAFETY_DISABLED":              return "Orçamento de segurança desativado";
    default:                             return "Sem orçamento disponível hoje";
  }
}
