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
import { EvolutionConfigService } from "@/services/evolution/EvolutionConfigService";
import { EvolutionClient } from "@/lib/evolution/EvolutionClient";
import { Prisma, ConversationStatus } from "@prisma/client";
import {
  resolveAudience,
  personalizeMessage,
} from "./CrmCampaignService";
import {
  assignConversationContext,
  buildConversationMetadataForCrmSend,
  CONTEXT_TYPE,
} from "@/services/agents/AgentRoutingService";
import {
  getSafetyConfig,
  getTodayGlobalSendCount,
  checkQuietHours,
  checkWeekendBlock,
  randomDelayMs,
  type CRMWhatsAppSafetyConfig,
} from "@/lib/crm-safety";

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
  skipped:      number;
  reason?:      string;
  completed:    boolean;
}

export interface ScheduledCampaignRunSummary {
  dryRun:             boolean;
  campaignsProcessed: number;
  totalEligible:      number;
  totalSent:          number;
  totalSkipped:       number;
  results:            CampaignBatchResult[];
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
    const batchCap       = Math.min(remainingToday, limit ?? remainingToday);

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

    const newEligible = allEligible.filter((c) => !alreadySentIds.has(c.id));

    if (newEligible.length === 0) {
      if (!dryRun) {
        await prisma.campaign.update({
          where: { id: campaignId },
          data:  { status: "COMPLETED" as never },
        });
      }
      return { campaignId, campaignName: campaign.name, eligible: 0, sent: 0, failed: 0, skipped: 0, reason: "Audience exhausted", completed: true };
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

    // Send batch
    const { sent, failed } = await this._sendBatch(campaign, batch, safety);

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
      totalSkipped:       results.reduce((s, r) => s + r.skipped, 0),
      results,
    };
  }

  // ── private ──────────────────────────────────────────────────

  private static async _sendBatch(
    campaign: {
      id: string; restaurantId: string; name: string; status: string;
      message: string; templateId: string | null; targetSegment: string | null;
    },
    customers: Array<{ id: string; name: string; phone: string; tier: string; segment: string; totalOrders: number; totalSpend: number; lastOrderAt: string | null }>,
    safety?: CRMWhatsAppSafetyConfig
  ): Promise<{ sent: number; failed: number }> {
    const cfgResult = await EvolutionConfigService.getSnapshot(campaign.restaurantId);
    if (!cfgResult.ok) {
      console.error(`[ScheduledCampaignRunner] WhatsApp not configured for restaurant ${campaign.restaurantId}`);
      return { sent: 0, failed: customers.length };
    }
    const evoConfig = cfgResult.data;

    // Load message personalization context
    const [restaurant, brandConfig] = await Promise.all([
      prisma.restaurant.findUnique({
        where:  { id: campaign.restaurantId },
        select: { name: true, slug: true },
      }),
      prisma.restaurantBrandConfig.findUnique({
        where:  { restaurantId: campaign.restaurantId },
        select: { googleReviewUrl: true },
      }),
    ]);
    const baseUrl   = (process.env.NEXT_PUBLIC_APP_URL ?? "").replace(/\/$/, "");
    const pedidoUrl = restaurant?.slug ? `${baseUrl}/pedido/${restaurant.slug}` : baseUrl;
    const msgCtx    = {
      restaurantName:  restaurant?.name ?? "nossa loja",
      pedidoUrl,
      googleReviewUrl: brandConfig?.googleReviewUrl ?? null,
    };

    // Pre-fetch opt-out status
    const optedOutIds = new Set(
      (await prisma.customer.findMany({
        where:  { id: { in: customers.map((c) => c.id) }, hasOptedOut: true },
        select: { id: true },
      })).map((c) => c.id)
    );

    let sent   = 0;
    let failed = 0;

    for (const customer of customers) {
      if (optedOutIds.has(customer.id)) {
        await prisma.campaignExecution.create({
          data: {
            campaignId:    campaign.id,
            restaurantId:  campaign.restaurantId,
            customerId:    customer.id,
            customerName:  customer.name,
            customerPhone: customer.phone,
            messageText:   "",
            status:        "FAILED",
            failedReason:  "Cliente opt-out",
          },
        });
        failed++;
        continue;
      }

      const phone = customer.phone.replace(/^\+/, "");
      if (!phone) {
        failed++;
        continue;
      }

      const messageText = personalizeMessage(campaign.message, customer, msgCtx);

      try {
        const evoResult = await EvolutionClient.sendTextMessage(evoConfig, phone, messageText);
        const now       = new Date();

        const convId = await findOrCreateBatchConversation(
          campaign.restaurantId, customer.id, customer.phone, campaign.id
        );
        await assignConversationContext(convId, "CRM_CAMPAIGN", { relatedCampaignId: campaign.id });

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
              externalMessageId: evoResult.key.id,
              externalStatus:    "sent",
              metadata:          buildConversationMetadataForCrmSend(campaign.id, exec.id),
            },
          }),
        ]);

        sent++;
        // Gradual dispatch: random inter-send delay to avoid robotic behaviour
        if (safety) {
          const delayMs = randomDelayMs(safety);
          if (delayMs > 0) await new Promise((r) => setTimeout(r, delayMs));
        }
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : "Erro desconhecido";
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
          },
        });
        failed++;
      }
    }

    // Single campaign counter update after batch
    if (sent > 0 || failed > 0) {
      await prisma.campaign.update({
        where: { id: campaign.id },
        data:  {
          totalSent:    { increment: sent },
          totalFailed:  { increment: failed },
          totalAudience: { increment: sent + failed },
        },
      });
    }

    return { sent, failed };
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
