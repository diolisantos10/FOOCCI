/**
 * ScheduledCampaignRunnerService
 *
 * Executes recurring CRM campaign batches. Called by
 * POST /api/cron/run-scheduled-campaigns on a schedule.
 *
 * Responsibilities:
 * - Identify ACTIVE/SCHEDULED campaigns with mode=RECURRING that are due
 * - Respect weekday schedule, time window, timezone
 * - Enforce daily send limits (24-hour rolling window)
 * - Deduplicate: never send same campaign to same customer twice
 * - Send via Evolution API, log in Chat Inbox
 * - Mark COMPLETED when audience exhausted or end condition met
 */

import { prisma } from "@/lib/prisma";
import { getPublicMenuUrl, getPublicSiteUrl, sanitizeCustomerUrl } from "@/lib/public-url";
import { EvolutionConfigService } from "@/services/evolution/EvolutionConfigService";
import { EvolutionClient, EvolutionApiError } from "@/lib/evolution/EvolutionClient";
import { MetaWhatsAppCloudProvider } from "@/services/whatsapp/providers/MetaWhatsAppCloudProvider";
import { sendMetaCrmMessage } from "./metaCrmSend";
import { normalizePhoneForEvolution, isValidEvolutionPhone } from "@/lib/crm/normalizePhone";
import { Prisma, ConversationStatus } from "@prisma/client";
import {
  resolveAudience,
  personalizeMessage,
} from "./CrmCampaignService";
import { getSegmentConfig } from "@/lib/crm-segments";
import { resolveCustomerSegment } from "./CustomerSegmentService";
import { CrmAudienceService } from "./CrmAudienceService";
import {
  getReadyMadeCampaign, resolveTierCoupon, TIER_COUPON_CAMPAIGN_IDS,
  type TierCouponsConfig,
} from "./readyMadeCampaigns";
import { RelationshipProgramService } from "./RelationshipProgramService";
import {
  parseMessagePool,
  resolveActivePhrases,
  readPhraseMetaTemplates,
  pickPhrase,
  phraseKey,
  withCouponLine,
  type PoolPhrase,
} from "./crmMessagePool";
import { MetaTemplateService } from "@/services/whatsapp/MetaTemplateService";
import {
  markConversationCrmContext,
  buildConversationMetadataForCrmSend,
  CONTEXT_TYPE,
} from "@/services/agents/AgentRoutingService";
import {
  getSafetyConfig,
  getTodayGlobalSendCount,
  getWeekGlobalSendCount,
  checkQuietHours,
  checkWeekendBlock,
  randomDelayMs,
  isBirthdayCampaign,
  type CRMWhatsAppSafetyConfig,
} from "@/lib/crm-safety";
import { ContactSafetyService } from "@/services/crm/ContactSafetyService";
import { CustomerCouponService } from "./CustomerCouponService";
import { readDedupePolicy, readOverridePolicy } from "./crmDedupePolicy";
import { generateMessageFingerprint } from "./messageFingerprint";
import { getImpactedByConcept, getImpactedByMessage, recordLedger } from "./CRMContactLedgerService";
import { classifyExecution } from "./crmExecutionClassification";
import {
  computeRecoverablePlan,
  assertReprocessAllowed,
  type ReprocessBlockReason,
} from "./recoverableReprocessPlan";
import { maskPhone } from "@/lib/wa-text-ordering-flag";
import {
  CRMWhatsAppBudgetPlanner,
  evaluateCircuitBreaker,
  inferCampaignPriority,
  describeBudgetAllocation,
  isCycleIntervalActive,
  type BudgetCampaignInput,
  type BudgetBlockReason,
} from "./CRMWhatsAppBudgetPlanner";
import { SendTimingIntelligenceService } from "./SendTimingIntelligenceService";

// ─── Types ────────────────────────────────────────────────────

export interface RecurringScheduleConfig {
  mode:           "RECURRING";
  weekdays:       number[];                     // 0=Sunday … 6=Saturday
  timeWindow:     { start: string; end: string }; // "HH:MM"
  dailyLimit:     number;
  /** Event-based campaigns: days after the event to target (review, 2nd purchase). */
  triggerDays?:   number;
  /** Card-defined coupon granted to each recipient's wallet on send. */
  coupon?:        { type: "PERCENTAGE" | "FIXED" | "CUSTOM"; value: number; description?: string; validityDays?: number } | null;
  endCondition:   "AUDIENCE_EXHAUSTED" | "END_DATE" | "MAX_TOTAL";
  endDate?:       string | null;                // "YYYY-MM-DD"
  maxTotal?:      number | null;
  timezone:       string;                       // IANA e.g. "America/Sao_Paulo"
}

export interface CampaignBatchResult {
  campaignId:   string;
  campaignName: string;
  eligible:     number;
  sent:         number;
  failed:       number;
  /** Safety blocks (weekly cap / cooldown / opt-out / window) — NOT failures. */
  blocked?:     number;
  skipped:      number;
  reason?:      string;
  completed:    boolean;
}

/** Recently-blocked customers are not re-attempted for this many hours (avoids
 *  re-creating a block row every cron tick and inflating the failure count). */
const BLOCK_RETRY_WINDOW_HOURS = 24;

/** In-process guard against parallel live reprocess runs for the same campaign
 *  (closes the duplicate-send race a double-submit could otherwise open). */
const REPROCESSING_CAMPAIGNS = new Set<string>();

/**
 * Hard ceiling on messages sent per run for the Evolution Web / Baileys provider.
 * Evolution Web rides a real WhatsApp-Web session — bursts freeze the phone and
 * raise spam/block risk — so a recurring batch never sends more than this in one
 * run, regardless of the caller-supplied limit or the campaign's daily limit.
 * A lower configured limit is still respected (we take the min).
 * NOTE: this cap is provider-specific; an official Meta Cloud API provider (when
 * added) should gate on its own limits, not this constant.
 */
export const EVOLUTION_WEB_MAX_PER_RUN = 5;

/**
 * Per-run ceiling on the OFFICIAL Meta Cloud API — no session to protect, so the
 * cap only paces requests and keeps each cron HTTP call inside its timeout.
 * 40/run × ~36 cron cycles/day ≈ 1.4k capacity, comfortably above the safe
 * daily limit (META_SAFE_DAILY_LIMIT), so the day's budget is always reachable.
 */
export const META_CLOUD_MAX_PER_RUN = 40;

/** True when the restaurant sends CRM through the official Meta Cloud API. */
async function isMetaCrmActive(restaurantId: string): Promise<boolean> {
  try {
    const cfg = await prisma.metaWhatsAppConfig.findUnique({
      where:  { restaurantId },
      select: { metaCrmEnabled: true, connectionStatus: true },
    });
    return cfg?.metaCrmEnabled === true && cfg.connectionStatus === "CONNECTED";
  } catch {
    return false; // absent table/mock → treat as Evolution (the conservative path)
  }
}

export interface ScheduledCampaignRunSummary {
  dryRun:             boolean;
  campaignsProcessed: number;
  totalEligible:      number;
  totalSent:          number;
  totalFailed:        number;
  totalBlocked:       number;
  totalSkipped:       number;
  results:            CampaignBatchResult[];
}

export interface StuckSendingRecoveryResult {
  recovered:   number;
  dryRun:      boolean;
  campaignIds: string[];
}

/** Read-only budget snapshot for the campaign detail UI (Section 9). */
export interface BudgetSnapshot {
  enabled:               boolean;
  providerMode:          "EVOLUTION_WEB" | "META_CLOUD";
  distributionMode:      "EQUAL" | "PRIORITY" | "MANUAL" | "AUDIENCE";
  globalDailyUsed?:      number;
  globalDailyLimit?:     number;
  globalCycleLimit?:     number;
  /** Remaining daily budget, or null when no daily cap is set. */
  remainingDailyBudget?: number | null;
  activeCampaigns?:      number;
  campaign?: {
    dailyQuota:          number;
    alreadySentToday:    number;
    nextCycleAllocation: number;
    reason:              BudgetBlockReason | null;
    reasonText:          string;
  } | null;
}

export interface ReprocessRecipientResult {
  customerName: string;
  phoneMasked:  string;
  status:       "SENT" | "FAILED" | "BLOCKED" | "SKIPPED" | "IGNORED";
  detail:       string;
}

export interface ReprocessRecoverableResult {
  ok:           boolean;
  /** Set when a gate blocked the run (ok=false). */
  reason?:      ReprocessBlockReason | "NOT_FOUND" | "IN_PROGRESS";
  message?:     string;
  /** HTTP status the route should return. */
  httpStatus:   number;
  campaignId:   string;
  campaignName: string;
  plan: {
    recoverableExecutions: number;
    distinctRecipients:    number;
    duplicatesRemoved:     number;
    cap:                   number;
    nextBatchCount:        number;
  };
  instanceState: string | null;
  /** Recipients actually attempted via the safe send path. */
  requested:     number;
  sent:          number;
  /** Safety blocks + recipient-data skips + revalidation exclusions. */
  ignored:       number;
  failed:        number;
  /** True when a mid-batch instance collapse stopped the remaining sends. */
  aborted:       boolean;
  recipients:    ReprocessRecipientResult[];
}

// ─── Timezone helpers ─────────────────────────────────────────

function getLocalTimeInfo(
  timezone: string,
  now: Date = new Date()
): { weekday: number; hours: number; minutes: number } {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    weekday:  "short",
    hour:     "2-digit",
    minute:   "2-digit",
    hour12:   false,
  });
  const parts  = fmt.formatToParts(now);
  const get    = (type: string) => parts.find((p) => p.type === type)?.value ?? "0";
  const wdMap: Record<string, number> = {
    Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6,
  };
  return {
    weekday: wdMap[get("weekday")] ?? 0,
    hours:   parseInt(get("hour")),
    minutes: parseInt(get("minute")),
  };
}

function timeToMinutes(hhmm: string): number {
  const [h = 0, m = 0] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

// ─── Service ──────────────────────────────────────────────────

export class ScheduledCampaignRunnerService {
  /**
   * Returns true if the campaign should receive a batch right now.
   */
  static isCampaignDueNow(
    campaign: { status: string; scheduleConfig: unknown; totalSent: number },
    now: Date = new Date()
  ): boolean {
    if (!["ACTIVE", "SCHEDULED"].includes(campaign.status)) return false;

    const cfg = campaign.scheduleConfig as RecurringScheduleConfig | null;
    if (!cfg || cfg.mode !== "RECURRING") return false;

    const tz = cfg.timezone || "America/Sao_Paulo";
    const { weekday, hours, minutes } = getLocalTimeInfo(tz, now);

    // Weekday filter
    if (!cfg.weekdays.includes(weekday)) return false;

    // Time window filter
    const currentMins = hours * 60 + minutes;
    if (
      currentMins < timeToMinutes(cfg.timeWindow.start) ||
      currentMins >= timeToMinutes(cfg.timeWindow.end)
    ) {
      return false;
    }

    // End date
    if (cfg.endCondition === "END_DATE" && cfg.endDate) {
      if (now > new Date(cfg.endDate + "T23:59:59Z")) return false;
    }

    // Max total
    if (cfg.endCondition === "MAX_TOTAL" && cfg.maxTotal != null) {
      if (campaign.totalSent >= cfg.maxTotal) return false;
    }

    return true;
  }

  /**
   * Returns approximate next eligible run time (useful for UI display).
   */
  static getNextRunAt(
    campaign: { status: string; scheduleConfig: unknown },
    now: Date = new Date()
  ): Date | null {
    if (!["ACTIVE", "SCHEDULED"].includes(campaign.status)) return null;

    const cfg = campaign.scheduleConfig as RecurringScheduleConfig | null;
    if (!cfg || cfg.mode !== "RECURRING") return null;

    const tz = cfg.timezone || "America/Sao_Paulo";

    // Scan forward up to 8 days for next eligible window
    for (let dayOffset = 0; dayOffset < 8; dayOffset++) {
      const candidate   = new Date(now.getTime() + dayOffset * 86_400_000);
      const { weekday, hours, minutes } = getLocalTimeInfo(tz, candidate);
      if (!cfg.weekdays.includes(weekday)) continue;

      const currentMins = hours * 60 + minutes;
      const startMins   = timeToMinutes(cfg.timeWindow.start);
      // If today and already past window start — skip to next eligible day
      if (dayOffset === 0 && currentMins >= startMins) continue;

      return new Date(candidate.getTime() + (startMins - currentMins) * 60_000);
    }
    return null;
  }

  /**
   * Execute one batch for a single recurring campaign.
   */
  static async runCampaignBatch(
    campaignId: string,
    options: { dryRun?: boolean; limit?: number; abortOnInstanceCollapse?: boolean; dailyLimitOverride?: number } = {}
  ): Promise<CampaignBatchResult> {
    const { dryRun = false, limit, abortOnInstanceCollapse = false, dailyLimitOverride } = options;

    const campaign = await prisma.campaign.findUnique({
      where:  { id: campaignId },
      select: {
        id: true, restaurantId: true, name: true, status: true,
        targetSegment: true, templateId: true, message: true, objective: true, audienceConfig: true,
        scheduleConfig: true, totalSent: true, couponCode: true,
        campaignFamilyKey: true, messageFingerprint: true, dedupePolicy: true,
      },
    });

    if (!campaign) {
      return { campaignId, campaignName: "", eligible: 0, sent: 0, failed: 0, skipped: 0, reason: "Campaign not found", completed: false };
    }

    if (!this.isCampaignDueNow(campaign)) {
      return { campaignId, campaignName: campaign.name, eligible: 0, sent: 0, failed: 0, skipped: 0, reason: "Not due now", completed: false };
    }

    // ── Learned send timing (ADDITIVE — OFF by default) ─────────────────────
    // Single decision point: when CRM_LEARNED_TIMING_ENABLED === "true" AND the
    // restaurant has enough conversion history (bestSendHours ≠ null), the batch
    // is deferred to the best-performing hour WITHIN the merchant-configured
    // window (already validated by isCampaignDueNow above — we never leave it).
    // Once the local time reaches that hour, sending proceeds exactly as before.
    // Flag OFF (default), insufficient data, or any lookup error → the block is
    // a no-op and the pre-existing behavior is preserved bit-for-bit.
    if (process.env.CRM_LEARNED_TIMING_ENABLED === "true") {
      const timingCfg = campaign.scheduleConfig as RecurringScheduleConfig | null;
      if (timingCfg?.timeWindow) {
        const tz = timingCfg.timezone || "America/Sao_Paulo";
        const learned = await SendTimingIntelligenceService
          .bestSendHours(campaign.restaurantId, tz)
          .catch(() => null); // intelligence must never break the send path
        if (learned) {
          const bestHour = SendTimingIntelligenceService.pickBestHourWithin(
            timingCfg.timeWindow.start,
            timingCfg.timeWindow.end,
            learned.hourScores,
          );
          const { hours: localHour } = getLocalTimeInfo(tz);
          if (bestHour !== null && localHour < bestHour) {
            const reason = `Aguardando melhor horário aprendido (${String(bestHour).padStart(2, "0")}:00, dentro da janela configurada)`;
            console.log(`[ScheduledCampaignRunner] ${campaign.name} deferred — ${reason}`);
            return { campaignId, campaignName: campaign.name, eligible: 0, sent: 0, failed: 0, skipped: 0, reason, completed: false };
          }
        }
      }
    }
    // ────────────────────────────────────────────────────────────────────────

    // ── Global safety checks ─────────────────────────────────────────────────
    const safety = await getSafetyConfig(campaign.restaurantId);

    const quietReason = checkQuietHours(safety);
    if (quietReason) {
      console.log(`[ScheduledCampaignRunner] ${campaign.name} blocked — ${quietReason}`);
      return { campaignId, campaignName: campaign.name, eligible: 0, sent: 0, failed: 0, skipped: 0, reason: quietReason, completed: false };
    }

    const weekendReason = checkWeekendBlock(safety);
    if (weekendReason) {
      console.log(`[ScheduledCampaignRunner] ${campaign.name} blocked — ${weekendReason}`);
      return { campaignId, campaignName: campaign.name, eligible: 0, sent: 0, failed: 0, skipped: 0, reason: weekendReason, completed: false };
    }

    if (safety.dailyGlobalCap > 0) {
      const globalToday = await getTodayGlobalSendCount(campaign.restaurantId);
      if (globalToday >= safety.dailyGlobalCap) {
        const reason = `Cap global diário atingido (${globalToday}/${safety.dailyGlobalCap})`;
        console.log(`[ScheduledCampaignRunner] ${campaign.name} blocked — ${reason}`);
        return { campaignId, campaignName: campaign.name, eligible: 0, sent: 0, failed: 0, skipped: globalToday, reason, completed: false };
      }
    }

    // Optional restaurant weekly cap — OFF by default (weeklyGlobalCap = 0).
    // Only enforced when the owner explicitly sets it in Settings.
    if (safety.weeklyGlobalCap > 0) {
      const globalWeek = await getWeekGlobalSendCount(campaign.restaurantId);
      if (globalWeek >= safety.weeklyGlobalCap) {
        const reason = `Cap global semanal atingido (${globalWeek}/${safety.weeklyGlobalCap})`;
        console.log(`[ScheduledCampaignRunner] ${campaign.name} blocked — ${reason}`);
        return { campaignId, campaignName: campaign.name, eligible: 0, sent: 0, failed: 0, skipped: globalWeek, reason, completed: false };
      }
    }
    // ────────────────────────────────────────────────────────────────────────

    const cfg = campaign.scheduleConfig as unknown as RecurringScheduleConfig;
    // AUDIENCE distribution passes the planner's proportional share as an override;
    // otherwise the campaign's own configured limit applies (MANUAL behavior).
    const dailyLimit = dailyLimitOverride && dailyLimitOverride > 0
      ? dailyLimitOverride
      : Math.max(1, Math.min(cfg.dailyLimit ?? 20, 200));

    // Count last-24h sends (rolling daily window)
    const cutoff24h  = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const todaySent  = await prisma.campaignExecution.count({
      where: {
        campaignId,
        sentAt: { gte: cutoff24h },
        status: { in: ["SENT", "DELIVERED", "READ"] },
      },
    });

    if (todaySent >= dailyLimit) {
      return { campaignId, campaignName: campaign.name, eligible: 0, sent: 0, failed: 0, skipped: todaySent, reason: "Daily limit reached", completed: false };
    }

    const remainingToday = dailyLimit - todaySent;
    // Per-run hard cap is provider-specific: the Evolution Web session needs tiny
    // batches (ban risk); the official Meta Cloud API runs at full pace.
    const perRunCap      = (await isMetaCrmActive(campaign.restaurantId)) ? META_CLOUD_MAX_PER_RUN : EVOLUTION_WEB_MAX_PER_RUN;
    const batchCap       = Math.min(remainingToday, limit ?? remainingToday, perRunCap);

    // Resolve full eligible audience at execution time
    const allEligible = await resolveAudience(
      campaign.restaurantId,
      campaign.targetSegment ?? "",
      campaign.templateId ?? undefined,
      { triggerDays: cfg.triggerDays },
    );

    // Exclude customers already sent this campaign. Campaigns with a recontactDays
    // window (e.g. "Mimo mensal") only exclude sends INSIDE the window — the same
    // customer becomes eligible again after it passes. Absent = once ever (default).
    const recontactDays = (campaign.templateId ? getReadyMadeCampaign(campaign.templateId)?.recontactDays : undefined) ?? null;
    const alreadySentIds = new Set(
      (await prisma.campaignExecution.findMany({
        where:  {
          campaignId,
          status: { in: ["SENT", "DELIVERED", "READ"] },
          ...(recontactDays ? { sentAt: { gte: new Date(Date.now() - recontactDays * 86_400_000) } } : {}),
        },
        select: { customerId: true },
      })).map((e) => e.customerId)
    );

    // Avoid useless retry: a customer recently BLOCKED (weekly cap / cooldown /
    // opt-out / window) OR recently FAILED at the provider (e.g. invalid number)
    // is NOT re-attempted within the retry window, so we don't create a fresh
    // block/failure row every tick (which inflated "falhas" to the hundreds).
    // They are re-evaluated only after the window expires.
    const recentlyAttemptedIds = new Set(
      (await prisma.campaignExecution.findMany({
        where: {
          campaignId,
          status:    { in: ["BLOCKED", "FAILED"] as never[] },
          createdAt: { gte: new Date(Date.now() - BLOCK_RETRY_WINDOW_HOURS * 60 * 60 * 1000) },
        },
        select: { customerId: true },
      })).map((e) => e.customerId)
    );

    // ── Governance dedupe (concept + message) via the impact ledger ──────────
    // Anti-spam by default: do not re-contact a customer already impacted by this
    // CONCEPT (campaignFamilyKey) or by the same MESSAGE fingerprint, even under a
    // new campaignId. The ledger is empty for historical data, so this is a no-op
    // until impacts start being recorded — no surprise change to live campaigns.
    const dedupe = readDedupePolicy(campaign.dedupePolicy);
    const familyKey = campaign.campaignFamilyKey ?? "";
    const fingerprint = campaign.messageFingerprint || generateMessageFingerprint(campaign.message);
    let impactedByConcept = new Set<string>();
    let impactedByMessage = new Set<string>();
    if (!dedupe.allowResendToImpacted) {
      [impactedByConcept, impactedByMessage] = await Promise.all([
        dedupe.dedupeByConcept && familyKey ? getImpactedByConcept(campaign.restaurantId, familyKey, dedupe.dedupeWindowDays) : Promise.resolve(new Set<string>()),
        dedupe.dedupeByMessage && fingerprint ? getImpactedByMessage(campaign.restaurantId, fingerprint, dedupe.dedupeWindowDays) : Promise.resolve(new Set<string>()),
      ]);
    }

    const newEligible = allEligible.filter(
      (c) => !alreadySentIds.has(c.id) && !recentlyAttemptedIds.has(c.id) && !impactedByConcept.has(c.id) && !impactedByMessage.has(c.id),
    );

    if (newEligible.length === 0) {
      // Only mark COMPLETED when the campaign was explicitly configured to end
      // on audience exhaustion. Campaigns created via the UI omit endCondition,
      // so they should stay ACTIVE and re-evaluate on the next cron tick (new
      // customers may become eligible after the cooldown window resets).
      const shouldComplete = cfg.endCondition === "AUDIENCE_EXHAUSTED";
      if (shouldComplete && !dryRun) {
        await prisma.campaign.update({
          where: { id: campaignId },
          data:  { status: "COMPLETED" as never },
        });
      }
      return {
        campaignId,
        campaignName: campaign.name,
        eligible: 0, sent: 0, failed: 0, skipped: 0,
        reason: shouldComplete ? "Audience exhausted" : "No new eligible recipients this run",
        completed: shouldComplete,
      };
    }

    // ── Contact limit — INFORMATIONAL ONLY (not enforced in the runner) ───────
    // The "Limite de Contatos" is displayed in the CRM UI, but it must NOT hard-
    // block sends here. The previous guard counted LIFETIME distinct contacts
    // (including imported/historical data), so any restaurant with more history
    // than the configured number had every new-contact campaign silently blocked
    // — which took the whole CRM offline. Enforcement will be reintroduced with a
    // proper baseline (or tied to the provider's credit) before being re-enabled.
    const batch = newEligible.slice(0, batchCap);

    if (dryRun) {
      return {
        campaignId,
        campaignName: campaign.name,
        eligible:     newEligible.length,
        sent:         0,
        failed:       0,
        skipped:      newEligible.length - batch.length,
        reason:       "Dry run",
        completed:    false,
      };
    }

    // Mark the start of this cycle so the detail API can filter current-cycle executions.
    await prisma.campaign.update({ where: { id: campaignId }, data: { lastRunAt: new Date() } });

    // Send batch
    const override = readOverridePolicy(campaign.scheduleConfig);
    const { sent, failed, blocked = 0 } = await this._sendBatch(campaign, batch, safety, {
      allowWeeklyCapOverride: override.allowWeeklyCustomerCapOverride,
      campaignFamilyKey: familyKey || null,
      messageFingerprint: fingerprint || null,
    }, { abortOnInstanceCollapse, coupon: cfg.coupon ?? null, couponValidityDays: cfg.coupon?.validityDays ?? null });

    // Check end conditions
    const totalSentAfter      = (campaign.totalSent ?? 0) + sent;
    const remainingAfterBatch = newEligible.length - batch.length;
    const exhausted =
      (cfg.endCondition === "AUDIENCE_EXHAUSTED" && remainingAfterBatch === 0) ||
      (cfg.endCondition === "MAX_TOTAL" && cfg.maxTotal != null && totalSentAfter >= cfg.maxTotal);

    if (exhausted) {
      await prisma.campaign.update({
        where: { id: campaignId },
        data:  { status: "COMPLETED" as never },
      });
    }

    return {
      campaignId,
      campaignName: campaign.name,
      eligible:     newEligible.length,
      sent,
      failed,
      blocked,
      skipped:      newEligible.length - batch.length,
      completed:    exhausted,
    };
  }

  /**
   * Find and execute all due recurring campaigns.
   *
   * When the global WhatsApp sending budget is enabled (crmWhatsAppSafety), each
   * restaurant's due campaigns are run through the budget orchestrator — the cycle
   * total never exceeds globalCycleLimit, the daily total never exceeds
   * globalDailyLimit, the budget is split fairly across campaigns, unused slots are
   * redistributed, and a failure/instance circuit breaker can pause the cycle.
   * When disabled, the legacy parallel per-campaign path runs unchanged.
   */
  static async runDueCampaigns(
    options: { restaurantId?: string; dryRun?: boolean; limit?: number } = {}
  ): Promise<ScheduledCampaignRunSummary> {
    const { restaurantId, dryRun = false, limit } = options;

    const candidates = await prisma.campaign.findMany({
      where: {
        status:         { in: ["ACTIVE", "SCHEDULED"] as never[] },
        scheduleConfig: { not: Prisma.AnyNull },
        ...(restaurantId ? { restaurantId } : {}),
      },
      select: {
        id: true, name: true, status: true, restaurantId: true,
        templateId: true, targetSegment: true,
        scheduleConfig: true, totalSent: true,
      },
    });

    const due = candidates.filter((c) => {
      const cfg = c.scheduleConfig as RecurringScheduleConfig | null;
      return cfg?.mode === "RECURRING" && this.isCampaignDueNow(c);
    });

    // The budget is per-restaurant, so orchestrate each restaurant's due set on its own.
    const byRestaurant = new Map<string, typeof due>();
    for (const c of due) {
      const arr = byRestaurant.get(c.restaurantId) ?? [];
      arr.push(c);
      byRestaurant.set(c.restaurantId, arr);
    }

    const results: CampaignBatchResult[] = [];
    for (const [rid, group] of byRestaurant) {
      const safety = await getSafetyConfig(rid);
      const budget = safety.crmWhatsAppSafety;

      if (budget?.enabled && budget.providerMode === "EVOLUTION_WEB") {
        // Minimum interval between cycles: if the CRM produced execution activity
        // more recently than the configured spacing, this run waits for the next
        // tick. Dry runs still preview normally.
        if (!dryRun && budget.minMinutesBetweenCycles > 0) {
          const lastActivity = await prisma.campaignExecution.findFirst({
            where:   { restaurantId: rid },
            orderBy: { createdAt: "desc" },
            select:  { createdAt: true },
          });
          if (isCycleIntervalActive(lastActivity?.createdAt ?? null, budget.minMinutesBetweenCycles)) {
            results.push(...group.map((c): CampaignBatchResult => ({
              campaignId:   c.id,
              campaignName: c.name,
              eligible:     0, sent: 0, failed: 0, blocked: 0, skipped: 0,
              reason:       `Aguardando intervalo mínimo entre ciclos (${budget.minMinutesBetweenCycles} min)`,
              completed:    false,
            })));
            continue;
          }
        }
        results.push(...await this._runOrchestratedCycle(rid, group, budget, { dryRun }));
      } else {
        // Legacy parallel path — preserved exactly for restaurants with the budget off.
        const legacy = await Promise.all(
          group.map((c) =>
            this.runCampaignBatch(c.id, { dryRun, limit }).catch((err): CampaignBatchResult => ({
              campaignId:   c.id,
              campaignName: c.name,
              eligible:     0,
              sent:         0,
              failed:       0,
              skipped:      0,
              reason:       err instanceof Error ? err.message : "Unknown error",
              completed:    false,
            }))
          )
        );
        results.push(...legacy);
      }
    }

    return {
      dryRun,
      campaignsProcessed: results.length,
      totalEligible:      results.reduce((s, r) => s + r.eligible, 0),
      totalSent:          results.reduce((s, r) => s + r.sent, 0),
      totalFailed:        results.reduce((s, r) => s + r.failed, 0),
      totalBlocked:       results.reduce((s, r) => s + (r.blocked ?? 0), 0),
      totalSkipped:       results.reduce((s, r) => s + r.skipped, 0),
      results,
    };
  }

  /**
   * Run ONE budget-orchestrated cycle for a single restaurant.
   *
   * Sequential by design: the global cycle/daily budget and the failure circuit
   * breaker must be accounted for as each campaign sends, which a parallel run
   * cannot do safely. After every campaign the remaining cycle budget is re-planned
   * over the campaigns left, so a campaign that could not use its slot (no eligible
   * recipients) hands it to the others (Section 6 redistribution).
   */
  private static async _runOrchestratedCycle(
    restaurantId: string,
    due: Array<{ id: string; name: string; templateId: string | null; targetSegment: string | null; scheduleConfig: unknown }>,
    budget: import("@/lib/crm-safety").CRMWhatsAppBudgetConfig,
    opts: { dryRun?: boolean },
  ): Promise<CampaignBatchResult[]> {
    const { dryRun = false } = opts;
    const byId = new Map(due.map((c) => [c.id, c]));

    const skip = (
      c: { id: string; name: string },
      reason: BudgetBlockReason,
    ): CampaignBatchResult => ({
      campaignId:   c.id,
      campaignName: c.name,
      eligible:     0, sent: 0, failed: 0, blocked: 0, skipped: 0,
      reason:       describeBudgetAllocation({ allocated: 0, reason }),
      completed:    false,
    });

    // Instance connectivity is read once up front — a disconnected instance blocks
    // the whole cycle with no provider calls at all (Section 7).
    const instanceConnected = dryRun ? true : await this._isInstanceConnected(restaurantId);

    // Counters that seed the planner.
    const globalSentSeed = await getTodayGlobalSendCount(restaurantId);
    const cutoff24h = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const sentByCampaign = new Map<string, number>();
    await Promise.all(
      due.map(async (c) => {
        sentByCampaign.set(
          c.id,
          await prisma.campaignExecution.count({
            where: { campaignId: c.id, sentAt: { gte: cutoff24h }, status: { in: ["SENT", "DELIVERED", "READ"] } },
          }),
        );
      }),
    );

    // AUDIENCE distribution needs each campaign's real eligible-audience size to
    // weight the split. Resolved once per distinct template (segments are shared).
    const audienceByCampaign = new Map<string, number>();
    if (budget.distributionMode === "AUDIENCE") {
      try {
        const segCfg = await getSegmentConfig(restaurantId);
        const templateOf = (c: (typeof due)[number]) => c.templateId || c.targetSegment || "todos-clientes";
        const byTemplate = new Map<string, number>();
        await Promise.all([...new Set(due.map(templateOf))].map(async (tpl) => {
          try {
            const res = await CrmAudienceService.getAudiencePreview(restaurantId, tpl, segCfg);
            byTemplate.set(tpl, res.eligibleCount);
          } catch { byTemplate.set(tpl, 0); }
        }));
        for (const c of due) audienceByCampaign.set(c.id, byTemplate.get(templateOf(c)) ?? 0);
      } catch { /* fall back to unweighted below */ }
    }

    let pending: BudgetCampaignInput[] = due.map((c) => {
      const cfg = c.scheduleConfig as RecurringScheduleConfig | null;
      const audience = audienceByCampaign.get(c.id);
      return {
        campaignId:        c.id,
        campaignName:      c.name,
        priority:          inferCampaignPriority({ templateId: c.templateId, targetSegment: c.targetSegment }),
        alreadySentToday:  sentByCampaign.get(c.id) ?? 0,
        // AUDIENCE mode weights by the real eligible pool; other modes discover the
        // audience during the send (redistribution handles empty campaigns).
        remainingAudience: typeof audience === "number"
          ? Math.max(0, audience - (sentByCampaign.get(c.id) ?? 0))
          : Number.MAX_SAFE_INTEGER,
        // MANUAL distribution mode uses the campaign's own daily limit as its quota
        // (same clamp as runCampaignBatch applies).
        manualDailyQuota:  Math.max(1, Math.min(cfg?.dailyLimit ?? 20, 200)),
      };
    });

    const resultsById = new Map<string, CampaignBatchResult>();
    let cycleSent = 0;
    let cycleFailed = 0;
    let breakerTripped = false;
    let globalSent = globalSentSeed;

    while (pending.length > 0) {
      const remainingCycle = Math.max(0, budget.globalCycleLimit - cycleSent);
      const plan = CRMWhatsAppBudgetPlanner.plan({
        config:            { ...budget, globalCycleLimit: remainingCycle },
        globalSentToday:   globalSent,
        instanceConnected,
        failureRatePaused: breakerTripped,
        campaigns:         pending,
      });

      if (plan.globalBlockReason) {
        for (const p of pending) resultsById.set(p.campaignId, skip(byId.get(p.campaignId)!, plan.globalBlockReason));
        break;
      }

      // Serve the campaign with the largest allocation first (priority-weighted in
      // PRIORITY mode); ties fall to input order.
      let next = plan.perCampaign[0]!;
      for (const a of plan.perCampaign) if (a.allocated > next.allocated) next = a;

      if (next.allocated <= 0) {
        for (const a of plan.perCampaign) {
          resultsById.set(a.campaignId, skip(byId.get(a.campaignId)!, a.reason ?? "GLOBAL_CYCLE_LIMIT_REACHED"));
        }
        break;
      }

      const campaign = byId.get(next.campaignId)!;
      const res = await this.runCampaignBatch(campaign.id, {
        dryRun,
        limit:                   next.allocated,
        abortOnInstanceCollapse: true,
        // AUDIENCE mode: the planner's proportional share replaces the campaign's
        // own dailyLimit (otherwise a 20/day leftover from MANUAL would choke it).
        ...(budget.distributionMode === "AUDIENCE" && next.dailyQuota > 0
          ? { dailyLimitOverride: next.dailyQuota }
          : {}),
      }).catch((err): CampaignBatchResult => ({
        campaignId:   campaign.id,
        campaignName: campaign.name,
        eligible:     0, sent: 0, failed: 0, skipped: 0,
        reason:       err instanceof Error ? err.message : "Unknown error",
        completed:    false,
      }));
      resultsById.set(campaign.id, res);

      cycleSent   += res.sent;
      cycleFailed += res.failed;
      globalSent  += res.sent;

      if (!breakerTripped) {
        const verdict = evaluateCircuitBreaker({ providerFailures: cycleFailed, sent: cycleSent }, budget);
        if (verdict.tripped) breakerTripped = true;
      }

      // Drop the processed campaign so the freed budget redistributes to the rest.
      pending = pending.filter((p) => p.campaignId !== campaign.id);
    }

    // Restore the original campaign order in the returned results.
    return due.map((c) => resultsById.get(c.id) ?? skip(c, "GLOBAL_CYCLE_LIMIT_REACHED"));
  }

  /**
   * Read-only budget snapshot for the campaign detail UI (Section 9).
   *
   * Computes — WITHOUT sending or touching the provider — how the global daily
   * budget currently splits across the restaurant's active recurring campaigns and
   * what THIS campaign would receive in the next cycle, plus an owner-facing reason.
   * Remaining audience is treated as available (the real audience is only known at
   * send time), so this is a planning view, not a guarantee.
   */
  static async getBudgetSnapshot(
    restaurantId: string,
    focusCampaignId: string,
  ): Promise<BudgetSnapshot> {
    const budget = (await getSafetyConfig(restaurantId)).crmWhatsAppSafety;
    if (!budget?.enabled || budget.providerMode !== "EVOLUTION_WEB") {
      return {
        enabled:          false,
        providerMode:     budget?.providerMode ?? "EVOLUTION_WEB",
        distributionMode: budget?.distributionMode ?? "EQUAL",
      };
    }

    const active = await prisma.campaign.findMany({
      where: {
        restaurantId,
        status:         { in: ["ACTIVE", "SCHEDULED"] as never[] },
        scheduleConfig: { not: Prisma.AnyNull },
      },
      select: { id: true, name: true, templateId: true, targetSegment: true, scheduleConfig: true },
    });
    const recurring = active.filter((c) => (c.scheduleConfig as RecurringScheduleConfig | null)?.mode === "RECURRING");

    // The focus campaign may be active but not in the recurring set (e.g. one-time);
    // still report the global figures so the UI can render them.
    const cutoff24h = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const [globalSentToday, sentCounts] = await Promise.all([
      getTodayGlobalSendCount(restaurantId),
      Promise.all(
        recurring.map((c) =>
          prisma.campaignExecution.count({
            where: { campaignId: c.id, sentAt: { gte: cutoff24h }, status: { in: ["SENT", "DELIVERED", "READ"] } },
          }),
        ),
      ),
    ]);

    const campaigns: BudgetCampaignInput[] = recurring.map((c, i) => {
      const cfg = c.scheduleConfig as RecurringScheduleConfig | null;
      return {
        campaignId:        c.id,
        campaignName:      c.name,
        priority:          inferCampaignPriority({ templateId: c.templateId, targetSegment: c.targetSegment }),
        alreadySentToday:  sentCounts[i] ?? 0,
        remainingAudience: Number.MAX_SAFE_INTEGER,
        manualDailyQuota:  Math.max(1, Math.min(cfg?.dailyLimit ?? 20, 200)),
      };
    });

    const plan = CRMWhatsAppBudgetPlanner.plan({
      config: budget, globalSentToday, instanceConnected: true, campaigns,
    });

    const focus = plan.perCampaign.find((p) => p.campaignId === focusCampaignId) ?? null;

    return {
      enabled:              true,
      providerMode:         budget.providerMode,
      distributionMode:     budget.distributionMode,
      globalDailyUsed:      globalSentToday,
      globalDailyLimit:     budget.globalDailyLimit,
      globalCycleLimit:     budget.globalCycleLimit,
      remainingDailyBudget: plan.dailyLimitEnabled ? plan.remainingDailyBudget : null,
      activeCampaigns:      recurring.length,
      campaign: focus
        ? {
            dailyQuota:          focus.dailyQuota,
            alreadySentToday:    focus.alreadySentToday,
            nextCycleAllocation: focus.allocated,
            reason:              focus.reason ?? null,
            reasonText:          describeBudgetAllocation({ allocated: focus.allocated, reason: focus.reason }),
          }
        : null,
    };
  }

  /**
   * True when the restaurant has a live channel to send CRM through.
   *
   * CRM-via-Meta: if the official Meta Cloud API is the CRM channel and it's
   * connected, the Evolution (WhatsApp Web) instance being offline is IRRELEVANT —
   * Meta is what actually sends. Checking only Evolution here wrongly blocked every
   * campaign with "WhatsApp desconectado" for restaurants that migrated to Meta.
   * Otherwise fall back to the Evolution instance reporting state=open.
   */
  private static async _isInstanceConnected(restaurantId: string): Promise<boolean> {
    const meta = await prisma.metaWhatsAppConfig.findUnique({
      where:  { restaurantId },
      select: { metaCrmEnabled: true, connectionStatus: true },
    }).catch(() => null);
    if (meta?.metaCrmEnabled === true && meta.connectionStatus === "CONNECTED") return true;

    const snap = await EvolutionConfigService.getSnapshot(restaurantId);
    if (!snap.ok) return false;
    const status = await EvolutionClient.getInstanceStatus(snap.data).catch(() => null);
    return status?.state === "open";
  }

  /**
   * Owner-initiated SAFE reprocess of a campaign's recoverable failures.
   *
   * Recomputes the recoverable plan from fresh DB rows (never trusts the client),
   * checks the live Evolution instance state immediately before sending, sends only
   * the next safe batch (cap EVOLUTION_WEB_MAX_PER_RUN) through the SAME battle-tested
   * `_sendBatch` path (opt-out / phone / cooldown / weekly-cap / cross-campaign dedup
   * gates, Central de Conversas logging, failure classification), creating NEW
   * execution rows only — old failed rows are never mutated. Aborts the remaining
   * sends if the instance collapses mid-batch and returns a partial result.
   *
   * Sends NOTHING unless `confirm === true`, the campaign is reprocessable, there is
   * a non-empty batch, and the instance is connected.
   */
  static async reprocessRecoverableBatch(
    campaignId: string,
    ctx: { restaurantId: string; confirm: unknown },
  ): Promise<ReprocessRecoverableResult> {
    // Reprocess never bypasses the global WhatsApp budget: the per-run cap is the
    // smaller of the provider's hard ceiling, the configured cycle limit, and
    // whatever is left of today's global daily budget (Section 10).
    const budget = (await getSafetyConfig(ctx.restaurantId)).crmWhatsAppSafety;
    const perRunCap = (await isMetaCrmActive(ctx.restaurantId)) ? META_CLOUD_MAX_PER_RUN : EVOLUTION_WEB_MAX_PER_RUN;
    let cap = perRunCap;
    let budgetExhausted = false;
    if (budget?.enabled && budget.providerMode === "EVOLUTION_WEB") {
      const remainingDaily = budget.globalDailyLimit > 0
        ? Math.max(0, budget.globalDailyLimit - await getTodayGlobalSendCount(ctx.restaurantId))
        : Number.MAX_SAFE_INTEGER;
      cap = Math.max(0, Math.min(perRunCap, budget.globalCycleLimit, remainingDaily));
      budgetExhausted = remainingDaily <= 0;
    }
    const emptyPlan = { recoverableExecutions: 0, distinctRecipients: 0, duplicatesRemoved: 0, cap, nextBatchCount: 0 };
    let lockHeld = false;

    const campaign = await prisma.campaign.findUnique({
      where:  { id: campaignId },
      select: {
        id: true, restaurantId: true, name: true, status: true,
        message: true, templateId: true, targetSegment: true, objective: true, audienceConfig: true,
        scheduleConfig: true, campaignFamilyKey: true, messageFingerprint: true, couponCode: true,
        executions: {
          orderBy: { createdAt: "asc" },
          select: { id: true, customerId: true, customerName: true, customerPhone: true, status: true, failedReason: true, errorMessage: true },
        },
      },
    });

    const blocked = (
      reason: ReprocessBlockReason | "NOT_FOUND" | "IN_PROGRESS",
      message: string,
      httpStatus: number,
      extra: Partial<ReprocessRecoverableResult> = {},
    ): ReprocessRecoverableResult => ({
      ok: false, reason, message, httpStatus,
      campaignId, campaignName: campaign?.name ?? "",
      plan: emptyPlan, instanceState: null,
      requested: 0, sent: 0, ignored: 0, failed: 0, aborted: false, recipients: [],
      ...extra,
    });

    // Tenant scope — never touch another restaurant's campaign.
    if (!campaign || campaign.restaurantId !== ctx.restaurantId) {
      return blocked("NOT_FOUND", "Campanha não encontrada.", 404);
    }

    // Recompute the plan server-side from fresh rows (client preview is ignored).
    const plan = computeRecoverablePlan(
      campaign.executions.map((e) => ({
        id: e.id, customerId: e.customerId, customerName: e.customerName,
        customerPhone: e.customerPhone, status: e.status,
        failedReason: e.failedReason, errorMessage: e.errorMessage,
      })),
      cap,
    );
    const planOut = {
      recoverableExecutions: plan.recoverableExecutions,
      distinctRecipients:    plan.distinctRecipients,
      duplicatesRemoved:     plan.duplicatesRemoved,
      cap:                   plan.cap,
      nextBatchCount:        plan.nextBatchCount,
    };

    // Confirmation + campaign-status gates first (cheap, no side effects, no network).
    if (ctx.confirm !== true) {
      return blocked("NOT_CONFIRMED", "Confirmação explícita obrigatória ({ confirm: true }).", 400, { plan: planOut });
    }
    if (!assertReprocessAllowed({ confirm: true, campaignStatus: campaign.status, nextBatchCount: 1, instanceState: "open" }).ok) {
      return blocked("CAMPAIGN_NOT_REPROCESSABLE", `Campanha em status ${campaign.status} não pode reprocessar.`, 409, { plan: planOut });
    }
    if (plan.nextBatchCount === 0) {
      // Not an error — simply nothing safe to send right now. Distinguish "no
      // recoverable recipients" from "global daily budget already spent today".
      const message = budgetExhausted
        ? "Sem orçamento global de envio disponível hoje — limite diário do WhatsApp atingido."
        : "Nenhum destinatário recuperável no momento.";
      return { ok: true, httpStatus: 200, message, campaignId, campaignName: campaign.name, plan: planOut, instanceState: null, requested: 0, sent: 0, ignored: 0, failed: 0, aborted: false, recipients: [] };
    }

    // No parallel live reprocess for the same campaign (anti-duplicate guard).
    if (REPROCESSING_CAMPAIGNS.has(campaignId)) {
      return blocked("IN_PROGRESS", "Já existe um reprocessamento em andamento para esta campanha.", 409, { plan: planOut });
    }
    REPROCESSING_CAMPAIGNS.add(campaignId);
    lockHeld = true;
    try {
    // Live Evolution instance gate — IMMEDIATELY before sending.
    let instanceState: string | null = null;
    const snap = await EvolutionConfigService.getSnapshot(campaign.restaurantId);
    if (snap.ok) {
      const status = await EvolutionClient.getInstanceStatus(snap.data).catch(() => null);
      instanceState = status?.state ?? null;
    }
    const gate = assertReprocessAllowed({ confirm: true, campaignStatus: campaign.status, nextBatchCount: plan.nextBatchCount, instanceState });
    if (!gate.ok) {
      return blocked(gate.reason, gate.message, gate.reason === "INSTANCE_NOT_CONNECTED" ? 409 : 400, { plan: planOut, instanceState });
    }

    // Revalidate each recipient against the CURRENT cadastro: contactable, not
    // opted-out, has a phone — and not already successfully sent on this campaign.
    const batchIds = plan.nextBatch.map((r) => r.customerId);
    const [contactable, alreadySentRows] = await Promise.all([
      prisma.customer.findMany({
        where: {
          id: { in: batchIds }, restaurantId: campaign.restaurantId,
          isGuest: false, isActive: true, hasOptedOut: false, crmContactable: true,
          phone: { not: null },
        },
        select: { id: true, name: true, phone: true, tier: true, segment: true, totalOrders: true, totalSpend: true, lastOrderAt: true, importedLastOrderAt: true },
      }),
      prisma.campaignExecution.findMany({
        where: { campaignId, customerId: { in: batchIds }, status: { in: ["SENT", "DELIVERED", "READ"] } },
        select: { customerId: true },
      }),
    ]);
    const alreadySent = new Set(alreadySentRows.map((e) => e.customerId));
    const contactableById = new Map(contactable.map((c) => [c.id, c]));

    const customers: Array<{ id: string; name: string; phone: string; tier: string; segment: string; totalOrders: number; totalSpend: number; lastOrderAt: string | null }> = [];
    const revalidationExcluded: ReprocessRecipientResult[] = [];
    for (const r of plan.nextBatch) {
      const c = contactableById.get(r.customerId);
      if (!c || alreadySent.has(r.customerId)) {
        revalidationExcluded.push({
          customerName: r.customerName, phoneMasked: maskPhone(r.customerPhone),
          status: "IGNORED",
          detail: alreadySent.has(r.customerId) ? "Já enviado com sucesso" : "Opt-out / sem WhatsApp elegível",
        });
        continue;
      }
      customers.push({
        id: c.id, name: c.name, phone: c.phone as string, tier: c.tier, segment: c.segment,
        totalOrders: c.totalOrders, totalSpend: c.totalSpend.toNumber(),
        lastOrderAt: (c.lastOrderAt ?? c.importedLastOrderAt)?.toISOString() ?? null,
      });
    }

    if (customers.length === 0) {
      return { ok: true, httpStatus: 200, message: "Todos os recuperáveis foram ignorados na revalidação.", campaignId, campaignName: campaign.name, plan: planOut, instanceState, requested: 0, sent: 0, ignored: revalidationExcluded.length, failed: 0, aborted: false, recipients: revalidationExcluded };
    }

    // Send via the SAME safe path used by the cron, with mid-batch abort enabled.
    const safety = await getSafetyConfig(campaign.restaurantId);
    const override = readOverridePolicy(campaign.scheduleConfig);
    const fingerprint = campaign.messageFingerprint || generateMessageFingerprint(campaign.message);
    const startedAt = new Date();

    const reproCoupon = (campaign.scheduleConfig as RecurringScheduleConfig | null)?.coupon ?? null;
    const send = await this._sendBatch(
      { id: campaign.id, restaurantId: campaign.restaurantId, name: campaign.name, status: campaign.status, message: campaign.message, templateId: campaign.templateId, targetSegment: campaign.targetSegment, objective: campaign.objective, audienceConfig: campaign.audienceConfig, scheduleConfig: campaign.scheduleConfig },
      customers,
      safety,
      { allowWeeklyCapOverride: override.allowWeeklyCustomerCapOverride, campaignFamilyKey: campaign.campaignFamilyKey ?? null, messageFingerprint: fingerprint || null },
      { abortOnInstanceCollapse: true, coupon: reproCoupon, couponValidityDays: reproCoupon?.validityDays ?? null },
    );

    // Per-recipient log = the NEW execution rows created during this run.
    const created = await prisma.campaignExecution.findMany({
      where:  { campaignId, customerId: { in: customers.map((c) => c.id) }, createdAt: { gte: startedAt } },
      orderBy: { createdAt: "asc" },
      select: { customerName: true, customerPhone: true, status: true, failedReason: true, errorMessage: true },
    });
    const sentRecipients: ReprocessRecipientResult[] = created.map((e) => {
      const c = classifyExecution({ status: e.status, failedReason: e.failedReason, errorMessage: e.errorMessage });
      const status: ReprocessRecipientResult["status"] =
        c.kind === "SENT" ? "SENT" : c.kind === "BLOCKED" ? "BLOCKED" : c.kind === "SKIPPED" ? "SKIPPED" : "FAILED";
      return { customerName: e.customerName ?? "", phoneMasked: maskPhone(e.customerPhone ?? ""), status, detail: c.badge };
    });

    return {
      ok: true, httpStatus: 200,
      message: send.aborted ? "Instância desconectou durante o envio — lote interrompido com resultado parcial." : undefined,
      campaignId, campaignName: campaign.name,
      plan: planOut, instanceState,
      requested: customers.length,
      sent: send.sent,
      ignored: send.blocked + send.skipped + revalidationExcluded.length,
      failed: send.failed,
      aborted: send.aborted,
      recipients: [...sentRecipients, ...revalidationExcluded],
    };
    } finally {
      if (lockHeld) REPROCESSING_CAMPAIGNS.delete(campaignId);
    }
  }

  // ── private ──────────────────────────────────────────────────

  private static async _sendBatch(
    campaign: {
      id: string; restaurantId: string; name: string; status: string;
      message: string; templateId: string | null; targetSegment: string | null;
      objective: string | null; audienceConfig: unknown; scheduleConfig?: unknown;
    },
    customers: Array<{ id: string; name: string; phone: string; tier: string; segment: string; totalOrders: number; totalSpend: number; lastOrderAt: string | null }>,
    safety?: CRMWhatsAppSafetyConfig,
    governance?: { allowWeeklyCapOverride: boolean; campaignFamilyKey: string | null; messageFingerprint: string | null },
    runOpts: {
      abortOnInstanceCollapse?: boolean;
      /** Card-defined coupon to credit to each customer's wallet on a successful send. */
      coupon?: { type: "PERCENTAGE" | "FIXED" | "CUSTOM"; value: number; description?: string; validityDays?: number } | null;
      /** Days the granted coupon stays valid. */
      couponValidityDays?: number | null;
    } = {},
  ): Promise<{ sent: number; failed: number; blocked: number; skipped: number; aborted: boolean }> {
    // Check if Meta CRM is enabled
    const metaCfgRow = await prisma.metaWhatsAppConfig.findUnique({
      where:  { restaurantId: campaign.restaurantId },
      select: { metaCrmEnabled: true, connectionStatus: true },
    });
    const useMetaCrm = metaCfgRow?.metaCrmEnabled === true && metaCfgRow.connectionStatus === "CONNECTED";
    const metaProvider = useMetaCrm ? new MetaWhatsAppCloudProvider() : null;

    const cfgResult = await EvolutionConfigService.getSnapshot(campaign.restaurantId);
    if (!cfgResult.ok && !useMetaCrm) {
      console.error(`[ScheduledCampaignRunner] WhatsApp not configured for restaurant ${campaign.restaurantId}`);
      return { sent: 0, failed: customers.length, blocked: 0, skipped: 0, aborted: false };
    }
    const evoConfig = cfgResult.ok ? cfgResult.data : null;

    // Load message personalization context
    const [restaurant, brandConfig, agentCfg] = await Promise.all([
      prisma.restaurant.findUnique({
        where:  { id: campaign.restaurantId },
        select: { name: true, slug: true },
      }),
      prisma.restaurantBrandConfig.findUnique({
        where:  { restaurantId: campaign.restaurantId },
        select: { googleReviewUrl: true, instagramUrl: true, tiktokUrl: true, facebookUrl: true, youtubeUrl: true },
      }),
      prisma.whatsAppAgentConfig.findUnique({
        where:  { restaurantId: campaign.restaurantId },
        select: { menuUrl: true },
      }),
    ]);
    // Use the SAME menu link the WhatsApp agent sends: the owner-configured menu URL
    // (what appears on the Cardápio page) wins; only fall back to the auto /pedido/{slug}
    // link when none is set. /qr/ links are remapped to /pedido/ so identity survives.
    const rawMenuUrl = agentCfg?.menuUrl?.trim() || (restaurant?.slug ? getPublicMenuUrl(restaurant.slug) : null);
    const fixedMenuUrl = rawMenuUrl?.replace(/\/qr\/([^/?]+)/, "/pedido/$1") ?? rawMenuUrl;
    const pedidoUrl = fixedMenuUrl ? sanitizeCustomerUrl(fixedMenuUrl) : getPublicSiteUrl();
    const msgCtx    = {
      restaurantName:  restaurant?.name ?? "nossa loja",
      pedidoUrl,
      googleReviewUrl: brandConfig?.googleReviewUrl ?? null,
      instagramUrl:    brandConfig?.instagramUrl    ?? null,
      tiktokUrl:       brandConfig?.tiktokUrl       ?? null,
      facebookUrl:     brandConfig?.facebookUrl     ?? null,
      youtubeUrl:      brandConfig?.youtubeUrl      ?? null,
      coupon:          runOpts.coupon ?? null,
    };

    // ── Message pool: the phrases rotating for this campaign ──────────────────
    // Owner-selected ready-made variants + their custom phrases; empty pool falls
    // back to campaign.message (legacy single-phrase behavior). Each send draws one
    // at random and records its variantKey so per-phrase conversion is measurable.
    // A campaign that grants a coupon must SAY so — phrases without {cupom} get the
    // prize line appended (withCouponLine). Identity/stats stay on the base text.
    const hasCoupon = !!runOpts.coupon;
    const activePhrases = resolveActivePhrases(
      { templateId: campaign.templateId, message: campaign.message },
      parseMessagePool(campaign.scheduleConfig),
      { hasCoupon },
    );
    const fallbackPhrase: PoolPhrase = {
      key: phraseKey(campaign.message), text: withCouponLine(campaign.message, hasCoupon), source: "fallback",
    };
    // On the Meta path, marketing to cold audiences REQUIRES an approved template —
    // rotation is limited to phrases whose per-phrase template is APPROVED **for the
    // current text** (a coupon toggle changes the text; a stale template would send
    // the old wording). With none eligible, the legacy single-template path is used.
    const phraseTemplates = readPhraseMetaTemplates(campaign.audienceConfig);
    let metaPhrases: PoolPhrase[] = [];
    if (metaProvider && activePhrases.length > 0) {
      const checks = await Promise.all(activePhrases.map(async (p) => {
        const tpl = phraseTemplates[p.key];
        if (!tpl?.name || tpl.submittedMessage !== p.text) return null;
        const found = await MetaTemplateService.findApproved(campaign.restaurantId, {
          templateName: tpl.name, languageCode: tpl.language,
        }).catch(() => null);
        return found ? p : null;
      }));
      metaPhrases = checks.filter((p): p is PoolPhrase => p !== null);
    }

    // "Cupom vencendo" speaks about the customer's OWN wallet coupon — resolve each
    // recipient's soonest-expiring ACTIVE coupon so {cupom}/{validade} render THEIR
    // reward and its real expiry date (not a campaign-level coupon).
    const expiringCouponByCustomer = new Map<string, NonNullable<(typeof msgCtx)["coupon"]> & { expiresAt?: Date | null }>();
    if (campaign.templateId === "cupom-vencendo") {
      try {
        const rows = await prisma.customerCoupon.findMany({
          where: {
            restaurantId: campaign.restaurantId,
            customerId:   { in: customers.map((c) => c.id) },
            status:       "ACTIVE" as never,
            expiresAt:    { gte: new Date() },
          },
          orderBy: { expiresAt: "asc" },
          select:  { customerId: true, discountType: true, discountValue: true, description: true, expiresAt: true },
        });
        for (const r of rows) {
          if (expiringCouponByCustomer.has(r.customerId)) continue; // keep the soonest
          expiringCouponByCustomer.set(r.customerId, {
            type:        r.discountType === "PERCENTAGE" || r.discountType === "FIXED" ? r.discountType : "CUSTOM",
            value:       Number(r.discountValue ?? 0),
            description: r.description ?? undefined,
            expiresAt:   r.expiresAt,
          });
        }
      } catch (e) {
        console.warn(`[CampaignRunner] expiring-coupon lookup failed`, { campaignId: campaign.id, error: e instanceof Error ? e.message : String(e) });
      }
    }

    // Per-tier rewards ("Subiu de nível" / "Mimo mensal"): each recipient gets the
    // coupon configured for THEIR tier (scheduleConfig.tierCoupons), falling back
    // to the campaign's base coupon.
    const tierCoupons: TierCouponsConfig | null =
      campaign.templateId && (TIER_COUPON_CAMPAIGN_IDS as readonly string[]).includes(campaign.templateId)
        ? ((campaign.scheduleConfig as { tierCoupons?: TierCouponsConfig } | null)?.tierCoupons ?? null)
        : null;

    // "Quase no próximo nível" renders each recipient's chasing target: which tier
    // comes next and how much spend is missing ({proximo_nivel}/{falta_proximo_nivel}).
    let nextTierOf: ((c: { tier: string; totalSpend: number }) => { label: string; missing: number } | null) | null = null;
    if (campaign.templateId === "quase-no-proximo-nivel") {
      try {
        const s = await RelationshipProgramService.getSettings(campaign.restaurantId);
        const LADDER = [
          { from: "BRONZE", label: "Prata",    threshold: Number(s.silverMinSpend) },
          { from: "PRATA",  label: "Ouro",     threshold: Number(s.goldMinSpend) },
          { from: "OURO",   label: "Diamante", threshold: Number(s.diamondMinSpend) },
        ];
        nextTierOf = (c) => {
          const step = LADDER.find((l) => l.from === c.tier);
          if (!step) return null;
          const missing = step.threshold - c.totalSpend;
          return missing > 0 ? { label: step.label, missing } : null;
        };
      } catch (e) {
        console.warn(`[CampaignRunner] tier-settings lookup failed`, { campaignId: campaign.id, error: e instanceof Error ? e.message : String(e) });
      }
    }

    // Pre-fetch opt-out status
    const optedOutIds = new Set(
      (await prisma.customer.findMany({
        where:  { id: { in: customers.map((c) => c.id) }, hasOptedOut: true },
        select: { id: true },
      })).map((c) => c.id)
    );

    // Unified contact-safety context. Time-window and daily-cap gates were
    // already enforced once before this batch (see runCampaignBatch), so here
    // the gate adds the per-customer rules the runner historically lacked:
    // customer cooldown, weekly cap, and CROSS-CAMPAIGN 24h dedup.
    const isBirthday    = isBirthdayCampaign(campaign);
    const safetyContext = await ContactSafetyService.buildGlobalContext(campaign.restaurantId, {
      evolutionAvailable: true,
    });

    let sent        = 0;
    let failed      = 0; // REAL send failures (provider/Evolution) only
    let blocked     = 0; // safety blocks — never counted as failures
    let skipped     = 0; // recipient-data skips (no/invalid phone) — never failures
    let sendIndex   = 0; // tracks actual send attempts (for inter-send delay placement)
    let aborted     = false; // set when a hard instance collapse stops the batch early
    // Circuit breaker: if the WhatsApp session is unhealthy, Evolution rejects EVERY
    // send (HTTP 500, or a 400 wrapping "Connection Closed"). Without this we hammer
    // the whole audience and rack up hundreds of failures. After N consecutive
    // instance/provider failures we stop the batch — a reconnect is needed, not more tries.
    let consecutiveInstanceFailures = 0;
    const INSTANCE_COLLAPSE_THRESHOLD = 5;
    const unreachableIds: string[] = []; // numbers that can't receive WhatsApp (retire/delete)

    for (const customer of customers) {
      // Authoritative unified safety gate (cooldown / weekly cap / cross-campaign dedup).
      const decision = await ContactSafetyService.assertSendable({
        restaurantId:       campaign.restaurantId,
        customerId:         customer.id,
        phone:              customer.phone,
        campaignId:         campaign.id,
        isBirthday,
        allowWeeklyCapOverride: governance?.allowWeeklyCapOverride ?? false,
        enforceTimeWindows: false, // already gated pre-batch in runCampaignBatch
        enforceDailyCap:    false, // already gated pre-batch in runCampaignBatch
        context:            safetyContext,
      });
      if (!decision.sendable) {
        // A safety block is NOT a failure — record it as BLOCKED with the
        // machine reason on errorMessage (so the UI classifies it precisely).
        await prisma.campaignExecution.create({
          data: {
            campaignId:    campaign.id,
            restaurantId:  campaign.restaurantId,
            customerId:    customer.id,
            customerName:  customer.name,
            customerPhone: customer.phone,
            messageText:   "",
            status:        "BLOCKED" as never,
            failedReason:  decision.detail ?? decision.reason ?? "Bloqueado",
            errorMessage:  decision.reason ?? "UNKNOWN_ERROR",
          },
        });
        blocked++;
        continue;
      }

      if (optedOutIds.has(customer.id)) {
        await prisma.campaignExecution.create({
          data: {
            campaignId:    campaign.id,
            restaurantId:  campaign.restaurantId,
            customerId:    customer.id,
            customerName:  customer.name,
            customerPhone: customer.phone,
            messageText:   "",
            status:        "BLOCKED" as never,
            failedReason:  "Cliente opt-out",
            errorMessage:  "CUSTOMER_OPTED_OUT",
          },
        });
        blocked++;
        continue;
      }

      const phone = normalizePhoneForEvolution(customer.phone);
      if (!isValidEvolutionPhone(phone)) {
        // Recipient-data problem — SKIP before any Evolution call. NOT a failure.
        const hasRawPhone = Boolean((customer.phone ?? "").trim());
        await prisma.campaignExecution.create({
          data: {
            campaignId:    campaign.id,
            restaurantId:  campaign.restaurantId,
            customerId:    customer.id,
            customerName:  customer.name,
            customerPhone: customer.phone,
            messageText:   "",
            status:        "SKIPPED" as never,
            failedReason:  hasRawPhone ? "Telefone inválido" : "Sem telefone",
            errorMessage:  hasRawPhone ? "INVALID_PHONE_FORMAT" : "MISSING_PHONE",
          },
        });
        skipped++;
        continue;
      }

      // Per-recipient render context: cupom-vencendo swaps in the customer's OWN
      // expiring coupon; quase-no-proximo-nivel adds their next tier + missing R$.
      // Anyone whose state changed since audience resolution (coupon used, tier
      // crossed) is skipped — never message something untruthful.
      const nextTierInfo = nextTierOf ? nextTierOf(customer) : null;
      // The coupon THIS recipient earns: their tier's reward when configured,
      // else the campaign's base coupon (unchanged for regular campaigns).
      const recipientCoupon = tierCoupons
        ? resolveTierCoupon(tierCoupons, customer.tier, runOpts.coupon ?? null)
        : (runOpts.coupon ?? null);
      const recipientCtx = campaign.templateId === "cupom-vencendo"
        ? { ...msgCtx, coupon: expiringCouponByCustomer.get(customer.id) ?? null }
        : nextTierInfo
        ? { ...msgCtx, nextTierLabel: nextTierInfo.label, nextTierMissing: nextTierInfo.missing }
        : tierCoupons
        ? { ...msgCtx, coupon: recipientCoupon }
        : msgCtx;
      if (campaign.templateId === "quase-no-proximo-nivel" && !nextTierInfo) {
        await prisma.campaignExecution.create({
          data: {
            campaignId:    campaign.id,
            restaurantId:  campaign.restaurantId,
            customerId:    customer.id,
            customerName:  customer.name,
            customerPhone: customer.phone,
            messageText:   "",
            status:        "SKIPPED" as never,
            failedReason:  "Cliente já cruzou o próximo nível",
            errorMessage:  "NO_NEXT_TIER_TARGET",
          },
        });
        skipped++;
        continue;
      }
      if (campaign.templateId === "cupom-vencendo" && !recipientCtx.coupon) {
        await prisma.campaignExecution.create({
          data: {
            campaignId:    campaign.id,
            restaurantId:  campaign.restaurantId,
            customerId:    customer.id,
            customerName:  customer.name,
            customerPhone: customer.phone,
            messageText:   "",
            status:        "SKIPPED" as never,
            failedReason:  "Cupom já usado ou expirado",
            errorMessage:  "NO_ACTIVE_EXPIRING_COUPON",
          },
        });
        skipped++;
        continue;
      }

      // Draw this recipient's phrase. Meta path rotates only over phrases whose
      // template is approved; anything else keeps the legacy single-phrase flow.
      const phrase = (metaProvider
        ? (pickPhrase(metaPhrases) ?? fallbackPhrase)
        : (pickPhrase(activePhrases) ?? fallbackPhrase));
      const messageText = personalizeMessage(phrase.text, customer, recipientCtx);

      if (!messageText.trim()) {
        const unresolved = (phrase.text.match(/\{[^}]+\}/g) ?? []).join(", ");
        await prisma.campaignExecution.create({
          data: {
            campaignId:    campaign.id,
            restaurantId:  campaign.restaurantId,
            customerId:    customer.id,
            customerName:  customer.name,
            customerPhone: customer.phone,
            messageText:   "",
            variantKey:    phrase.key || null,
            status:        "FAILED",
            failedReason:  unresolved
              ? `Mensagem vazia após substituição de variáveis (não resolvidas: ${unresolved})`
              : "Mensagem vazia após substituição de variáveis",
            errorMessage:  "EMPTY_MESSAGE_AFTER_RENDER",
          },
        });
        failed++;
        continue;
      }

      // Inter-send delay BEFORE each message except the first.
      // Placing delay here (not after) guarantees no sleep after the last send,
      // which was the cause of Railway proxy timeouts (exit 56).
      // Capped at 10 s to stay within the HTTP request budget.
      if (sendIndex > 0 && safety) {
        const rawDelay = randomDelayMs(safety);
        const delayMs  = Math.min(rawDelay, 10_000);
        if (delayMs > 0) await new Promise((r) => setTimeout(r, delayMs));
      }
      sendIndex++;

      try {
        // Send via Meta Cloud API (when CRM toggle is on) with Evolution fallback.
        let externalMessageId: string | null = null;
        let crmProvider = "EVOLUTION";

        if (metaProvider) {
          // Cold/marketing audience is outside the 24h window → must use an APPROVED
          // template. Resolve the campaign's template + fill {{1}}=nome; falls back to
          // freeform only when no template is configured.
          const firstName = (customer.name ?? "").split(" ")[0] || "Cliente";
          // When the drawn phrase has its own approved template, send THAT one;
          // the fallback phrase keeps the campaign's legacy template resolution.
          const phraseTpl = phraseTemplates[phrase.key];
          const metaAudienceCfg = phrase.source !== "fallback" && phraseTpl
            ? { metaTemplate: phraseTpl }
            : campaign.audienceConfig;
          const { result: metaResult } = await sendMetaCrmMessage(metaProvider, {
            restaurantId: campaign.restaurantId, phone, freeformText: messageText, firstName,
            campaign: { objective: campaign.objective, audienceConfig: metaAudienceCfg },
            // Fill approved-template body params from the SAME canonical context that
            // rendered the freeform text, so a multi-variable template ({{2}}=cupom,
            // {{3}}=link, …) delivers exactly what the freeform message would. Use the
            // firstName fallback ("Cliente") for {nome} so a blank-name customer keeps the
            // exact single-variable behavior instead of bailing to freeform on an empty param.
            renderToken: (token) => personalizeMessage(token, { ...customer, name: customer.name || firstName }, recipientCtx),
          });
          if (metaResult.ok) {
            externalMessageId = metaResult.providerMessageId;
            crmProvider = "META_CLOUD_API";
          } else {
            console.warn(`[ScheduledCampaignRunner] Meta send failed (${metaResult.errorCode}) — falling back to Evolution for ${phone}`);
            if (evoConfig) {
              const evoResult = await EvolutionClient.sendTextMessage(evoConfig, phone, messageText);
              externalMessageId = evoResult.key.id;
              crmProvider = "EVOLUTION_FALLBACK";
            } else {
              throw new Error(`Meta CRM send failed: ${metaResult.error} (no Evolution fallback configured)`);
            }
          }
        } else {
          if (!evoConfig) throw new Error("No WhatsApp provider configured");
          const evoResult = await EvolutionClient.sendTextMessage(evoConfig, phone, messageText);
          externalMessageId = evoResult.key.id;
          crmProvider = "EVOLUTION";
        }

        const now       = new Date();

        const convId = await findOrCreateBatchConversation(
          campaign.restaurantId, customer.id, customer.phone, campaign.id
        );
        await markConversationCrmContext(convId, "CRM_CAMPAIGN", { relatedCampaignId: campaign.id });

        const exec = await prisma.campaignExecution.create({
          data: {
            campaignId:    campaign.id,
            restaurantId:  campaign.restaurantId,
            customerId:    customer.id,
            customerName:  customer.name,
            customerPhone: customer.phone,
            messageText,
            variantKey:    phrase.key || null,
            status:        "SENT",
            sentAt:        now,
          },
          select: { id: true },
        });

        // Intentionally omit Conversation.lastMessageAt update — see CrmCampaignService.
        await prisma.$transaction([
          prisma.message.create({
            data: {
              conversationId:    convId,
              direction:         "OUTBOUND",
              senderType:        "AI",
              content:           messageText,
              type:              "TEXT",
              sentAt:            now,
              externalMessageId,
              externalStatus:    "sent",
              metadata:          { ...buildConversationMetadataForCrmSend(campaign.id, exec.id) as object, crmProvider },
            },
          }),
        ]);

        // Impact memory: record the SENT so future campaigns/concepts dedupe.
        await recordLedger({
          restaurantId: campaign.restaurantId,
          customerId: customer.id,
          phone: customer.phone,
          campaignId: campaign.id,
          campaignFamilyKey: governance?.campaignFamilyKey ?? null,
          messageFingerprint: governance?.messageFingerprint ?? null,
          contactType: isBirthday ? "BIRTHDAY" : "CAMPAIGN",
          status: "SENT",
          reasonCode: governance?.allowWeeklyCapOverride ? "OVERRIDE_WEEKLY_LIMIT_USED" : "SENT",
          usedPriorityOverride: governance?.allowWeeklyCapOverride ?? false,
          sourceExecutionId: exec.id,
        });

        sent++;
        consecutiveInstanceFailures = 0; // a success proves the session is alive

        // Coupon wallet: if this campaign grants a card-defined coupon, credit it to
        // the customer (iFood-style). Idempotent + best-effort — a coupon hiccup must
        // never break a successful send.
        if (recipientCoupon) {
          await CustomerCouponService.grant({
            restaurantId:     campaign.restaurantId,
            customerId:       customer.id,
            coupon:           recipientCoupon,
            validityDays:     recipientCoupon.validityDays ?? runOpts.couponValidityDays ?? null,
            sourceCampaignId: campaign.id,
            monthlyBudget:    safety?.couponMonthlyBudget ?? 0,
            avgTicket:        safety?.couponAvgTicket ?? 50,
          }).catch((e) => console.error(`[ReadyMade] coupon grant failed for ${customer.id}:`, e));
        }
      } catch (err) {
        // A real provider/Evolution failure (e.g. HTTP 400 invalid number).
        const isEvoErr = err instanceof EvolutionApiError;
        const errMsg = isEvoErr
          ? `HTTP ${(err as EvolutionApiError).status}: ${typeof (err as EvolutionApiError).body === "string" ? (err as EvolutionApiError).body : JSON.stringify((err as EvolutionApiError).body ?? {}).slice(0, 500)}`
          : (err instanceof Error ? err.message : "Erro desconhecido");
        const errorCode = isEvoErr ? `EVOLUTION_HTTP_${(err as EvolutionApiError).status}` : errMsg;
        await prisma.campaignExecution.create({
          data: {
            campaignId:    campaign.id,
            restaurantId:  campaign.restaurantId,
            customerId:    customer.id,
            customerName:  customer.name,
            customerPhone: customer.phone,
            messageText:   "",
            variantKey:    phrase.key || null,
            status:        "FAILED",
            failedReason:  errMsg,
            errorMessage:  errorCode,
          },
        });
        failed++;

        // Is this an INSTANCE/session failure (vs a genuine per-number bad request)?
        // A session-wrapped 400, a 500, a timeout or a disconnect all mean the
        // WhatsApp session is unhealthy — retrying the next recipient will fail too.
        const cls = classifyExecution({ status: "FAILED", failedReason: errMsg, errorMessage: errorCode });
        const isInstanceFailure =
          cls.category === "EVOLUTION_INSTANCE_DISCONNECTED" ||
          cls.category === "FAILED_PROVIDER" ||
          cls.category === "FAILED_TIMEOUT" ||
          cls.category === "EVOLUTION_AUTH_ERROR";
        consecutiveInstanceFailures = isInstanceFailure ? consecutiveInstanceFailures + 1 : 0;

        // Auto-cleanup: a genuine per-number failure (bad request / invalid phone —
        // NOT a transient session/instance problem, which is retried) means this
        // number can't receive WhatsApp. Collect it — after the batch, dead leads are
        // DELETED and the ones with order history are retired (kept non-contactable).
        if (cls.category === "EVOLUTION_BAD_REQUEST" || cls.category === "BLOCKED_INVALID_PHONE") {
          unreachableIds.push(customer.id);
        }

        // Circuit breaker (all paths, incl. cron): once the session is clearly
        // collapsed, stop the batch instead of hammering the whole audience and
        // racking up hundreds of identical failures. A reconnect is what's needed.
        if (consecutiveInstanceFailures >= INSTANCE_COLLAPSE_THRESHOLD) {
          console.warn(`[CampaignRunner] instance collapse — aborting batch after ${consecutiveInstanceFailures} consecutive failures`, {
            campaignId: campaign.id, lastError: errorCode,
          });
          aborted = true;
          break;
        }

        // Manual reprocess: also verify liveness explicitly and stop early.
        if (runOpts.abortOnInstanceCollapse) {
          const liveStatus = evoConfig ? await EvolutionClient.getInstanceStatus(evoConfig).catch(() => null) : null;
          if (!liveStatus || liveStatus.state !== "open") { aborted = true; break; }
        }
      }
    }

    // Auto-cleanup of numbers that can't receive WhatsApp (irreversible). Dead LEADS
    // (no order/draft history) are physically DELETED — "só cadastros limpos ficam".
    // Contacts WITH order history are kept but retired from CRM (crmContactable=false),
    // so the sales history is never destroyed. Reversible failures are NOT here — they
    // stay eligible and get retried in a later cycle.
    if (unreachableIds.length > 0) {
      const ids = [...new Set(unreachableIds)];
      try {
        await prisma.customer.updateMany({ where: { id: { in: ids } }, data: { crmContactable: false } });
        const rows = await prisma.customer.findMany({
          where:  { id: { in: ids } },
          select: {
            id: true, phone: true,
            lastOrderAt: true, importedLastOrderAt: true, totalOrders: true, importedOrderCount: true,
            _count: { select: { orders: true, orderDrafts: true } },
          },
        });
        const deletable = new Set(rows.filter((r) => r._count.orders === 0 && r._count.orderDrafts === 0).map((r) => r.id));

        // Log each exclusion for the Migração panel — the segment the customer sat in
        // at the moment they left the base ("how many perdidos/frios we lost to bad
        // numbers"). Written before the hard delete so we don't lose the record.
        try {
          const segCfg = await getSegmentConfig(campaign.restaurantId);
          await prisma.crmBaseExclusion.createMany({
            data: rows.map((r) => ({
              restaurantId: campaign.restaurantId,
              customerId:   r.id,
              phone:        r.phone,
              reason:       deletable.has(r.id) ? "INVALID_PHONE_DELETED" : "RETIRED_NO_CONTACT",
              hadHistory:   !deletable.has(r.id),
              priorSegment: resolveCustomerSegment({
                lastOrderAt:         r.lastOrderAt,
                importedLastOrderAt: r.importedLastOrderAt,
                totalOrders:         r.totalOrders,
                importedOrderCount:  r.importedOrderCount ?? 0,
                cfg:                 segCfg,
              }).segment,
            })),
          });
        } catch (logErr) {
          console.warn(`[CampaignRunner] exclusion log failed`, { error: logErr instanceof Error ? logErr.message : String(logErr) });
        }

        if (deletable.size > 0) {
          const delIds = [...deletable];
          // Conversation is the only non-cascading FK on a lead with no orders — unlink
          // it (keep the chat) so the delete never blocks. Addresses/prefs/etc. cascade.
          await prisma.$transaction([
            prisma.conversation.updateMany({ where: { customerId: { in: delIds } }, data: { customerId: null } }),
            prisma.customer.deleteMany({ where: { id: { in: delIds } } }),
          ]);
        }
        console.info(`[CampaignRunner] unreachable cleanup: ${deletable.size} deleted, ${ids.length - deletable.size} retired`, { campaignId: campaign.id });
      } catch (e) {
        console.warn(`[CampaignRunner] unreachable cleanup failed`, { campaignId: campaign.id, error: e instanceof Error ? e.message : String(e) });
      }
    }

    // Single campaign counter update after batch. totalFailed counts REAL send
    // failures only — safety blocks are derived from BLOCKED executions, not here.
    if (sent > 0 || failed > 0 || blocked > 0 || skipped > 0) {
      await prisma.campaign.update({
        where: { id: campaign.id },
        data:  {
          totalSent:    { increment: sent },
          totalFailed:  { increment: failed }, // recipient-data skips are NOT counted here
          totalAudience: { increment: sent + failed + blocked + skipped },
        },
      });
    }

    return { sent, failed, blocked, skipped, aborted };
  }

  /**
   * Find campaigns stuck in SENDING status (server crashed mid-send) and
   * optionally reset them back to SCHEDULED so they can be re-sent from the UI.
   */
  static async recoverStuckSendingCampaigns(options: {
    restaurantId?:     string;
    olderThanMinutes?: number;
    dryRun?:           boolean;
  } = {}): Promise<StuckSendingRecoveryResult> {
    const { restaurantId, olderThanMinutes = 30, dryRun = false } = options;

    const stuck = await prisma.campaign.findMany({
      where: {
        status: "SENDING" as never,
        ...(restaurantId ? { restaurantId } : {}),
        updatedAt: { lt: new Date(Date.now() - olderThanMinutes * 60_000) },
      },
      select: { id: true, name: true, restaurantId: true },
    });

    if (stuck.length === 0) {
      return { recovered: 0, dryRun, campaignIds: [] };
    }

    console.log(`[ScheduledCampaignRunner] recovering stuck SENDING campaigns (${stuck.length})`);

    const stuckIds = stuck.map((c) => c.id);

    if (!dryRun) {
      await prisma.campaign.updateMany({
        where: { id: { in: stuckIds } },
        data:  { status: "SCHEDULED" as never },
      });
    }

    return {
      recovered:   stuck.length,
      dryRun,
      campaignIds: stuckIds,
    };
  }
}

// ── find or create WhatsApp conversation ──────────────────────

async function findOrCreateBatchConversation(
  restaurantId: string,
  customerId:   string,
  phone:        string,
  campaignId:   string
): Promise<string> {
  const existing = await prisma.conversation.findFirst({
    where: {
      restaurantId,
      customerId,
      channel: "WHATSAPP",
      status:  { in: [ConversationStatus.OPEN, ConversationStatus.BOT, ConversationStatus.HUMAN] },
    },
    orderBy: { lastMessageAt: "desc" },
    select:  { id: true },
  });
  if (existing) return existing.id;

  const customer = await prisma.customer.findUnique({
    where:  { id: customerId },
    select: { name: true, phone: true },
  });

  const conv = await prisma.conversation.create({
    data: {
      restaurantId,
      customerId,
      channel:           "WHATSAPP",
      status:            ConversationStatus.OPEN,
      customerPhone:     customer?.phone ?? phone,
      customerName:      customer?.name ?? phone,
      contextType:       CONTEXT_TYPE.CRM_CAMPAIGN,
      relatedCampaignId: campaignId,
    },
  });

  return conv.id;
}
