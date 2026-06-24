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
import { getPublicMenuUrl, getPublicSiteUrl } from "@/lib/public-url";
import { EvolutionConfigService } from "@/services/evolution/EvolutionConfigService";
import { EvolutionClient, EvolutionApiError } from "@/lib/evolution/EvolutionClient";
import { MetaWhatsAppCloudProvider } from "@/services/whatsapp/providers/MetaWhatsAppCloudProvider";
import { normalizePhoneForEvolution, isValidEvolutionPhone } from "@/lib/crm/normalizePhone";
import { Prisma, ConversationStatus } from "@prisma/client";
import {
  resolveAudience,
  personalizeMessage,
} from "./CrmCampaignService";
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

// ─── Types ────────────────────────────────────────────────────

export interface RecurringScheduleConfig {
  mode:           "RECURRING";
  weekdays:       number[];                     // 0=Sunday … 6=Saturday
  timeWindow:     { start: string; end: string }; // "HH:MM"
  dailyLimit:     number;
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
    options: { dryRun?: boolean; limit?: number } = {}
  ): Promise<CampaignBatchResult> {
    const { dryRun = false, limit } = options;

    const campaign = await prisma.campaign.findUnique({
      where:  { id: campaignId },
      select: {
        id: true, restaurantId: true, name: true, status: true,
        targetSegment: true, templateId: true, message: true,
        scheduleConfig: true, totalSent: true,
        campaignFamilyKey: true, messageFingerprint: true, dedupePolicy: true,
      },
    });

    if (!campaign) {
      return { campaignId, campaignName: "", eligible: 0, sent: 0, failed: 0, skipped: 0, reason: "Campaign not found", completed: false };
    }

    if (!this.isCampaignDueNow(campaign)) {
      return { campaignId, campaignName: campaign.name, eligible: 0, sent: 0, failed: 0, skipped: 0, reason: "Not due now", completed: false };
    }

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
    const dailyLimit = Math.max(1, Math.min(cfg.dailyLimit ?? 20, 200));

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
    // Evolution Web hard cap: never more than EVOLUTION_WEB_MAX_PER_RUN per run,
    // even if a caller passes a larger limit or the daily limit is higher.
    const batchCap       = Math.min(remainingToday, limit ?? remainingToday, EVOLUTION_WEB_MAX_PER_RUN);

    // Resolve full eligible audience at execution time
    const allEligible = await resolveAudience(
      campaign.restaurantId,
      campaign.targetSegment ?? "",
      campaign.templateId ?? undefined
    );

    // Exclude customers already sent this campaign
    const alreadySentIds = new Set(
      (await prisma.campaignExecution.findMany({
        where:  { campaignId, status: { in: ["SENT", "DELIVERED", "READ"] } },
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
    });

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
        id: true, name: true, status: true,
        scheduleConfig: true, totalSent: true,
      },
    });

    const due = candidates.filter((c) => {
      const cfg = c.scheduleConfig as RecurringScheduleConfig | null;
      return cfg?.mode === "RECURRING" && this.isCampaignDueNow(c);
    });

    const results = await Promise.all(
      due.map((c) =>
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
    const cap = EVOLUTION_WEB_MAX_PER_RUN;
    const emptyPlan = { recoverableExecutions: 0, distinctRecipients: 0, duplicatesRemoved: 0, cap, nextBatchCount: 0 };
    let lockHeld = false;

    const campaign = await prisma.campaign.findUnique({
      where:  { id: campaignId },
      select: {
        id: true, restaurantId: true, name: true, status: true,
        message: true, templateId: true, targetSegment: true,
        scheduleConfig: true, campaignFamilyKey: true, messageFingerprint: true,
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
      // Not an error — simply nothing safe to send right now.
      return { ok: true, httpStatus: 200, message: "Nenhum destinatário recuperável no momento.", campaignId, campaignName: campaign.name, plan: planOut, instanceState: null, requested: 0, sent: 0, ignored: 0, failed: 0, aborted: false, recipients: [] };
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

    const send = await this._sendBatch(
      { id: campaign.id, restaurantId: campaign.restaurantId, name: campaign.name, status: campaign.status, message: campaign.message, templateId: campaign.templateId, targetSegment: campaign.targetSegment },
      customers,
      safety,
      { allowWeeklyCapOverride: override.allowWeeklyCustomerCapOverride, campaignFamilyKey: campaign.campaignFamilyKey ?? null, messageFingerprint: fingerprint || null },
      { abortOnInstanceCollapse: true },
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
    },
    customers: Array<{ id: string; name: string; phone: string; tier: string; segment: string; totalOrders: number; totalSpend: number; lastOrderAt: string | null }>,
    safety?: CRMWhatsAppSafetyConfig,
    governance?: { allowWeeklyCapOverride: boolean; campaignFamilyKey: string | null; messageFingerprint: string | null },
    runOpts: { abortOnInstanceCollapse?: boolean } = {},
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
    const [restaurant, brandConfig] = await Promise.all([
      prisma.restaurant.findUnique({
        where:  { id: campaign.restaurantId },
        select: { name: true, slug: true },
      }),
      prisma.restaurantBrandConfig.findUnique({
        where:  { restaurantId: campaign.restaurantId },
        select: { googleReviewUrl: true, instagramUrl: true },
      }),
    ]);
    const pedidoUrl = restaurant?.slug ? getPublicMenuUrl(restaurant.slug) : getPublicSiteUrl();
    const msgCtx    = {
      restaurantName:  restaurant?.name ?? "nossa loja",
      pedidoUrl,
      googleReviewUrl: brandConfig?.googleReviewUrl ?? null,
      instagramUrl:    brandConfig?.instagramUrl    ?? null,
    };

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

      const messageText = personalizeMessage(campaign.message, customer, msgCtx);

      if (!messageText.trim()) {
        const unresolved = (campaign.message.match(/\{[^}]+\}/g) ?? []).join(", ");
        await prisma.campaignExecution.create({
          data: {
            campaignId:    campaign.id,
            restaurantId:  campaign.restaurantId,
            customerId:    customer.id,
            customerName:  customer.name,
            customerPhone: customer.phone,
            messageText:   "",
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
          const metaResult = await metaProvider.sendText({ restaurantId: campaign.restaurantId, to: phone, text: messageText });
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
            status:        "FAILED",
            failedReason:  errMsg,
            errorMessage:  errorCode,
          },
        });
        failed++;

        // Manual reprocess only: if the Evolution instance has hard-collapsed
        // mid-batch, stop remaining sends and return a partial result instead of
        // hammering a dead session. The cron path passes no flag → unchanged.
        if (runOpts.abortOnInstanceCollapse) {
          const liveStatus = evoConfig ? await EvolutionClient.getInstanceStatus(evoConfig).catch(() => null) : null;
          if (!liveStatus || liveStatus.state !== "open") { aborted = true; break; }
        }
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
