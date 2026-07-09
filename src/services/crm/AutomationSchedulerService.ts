import { prisma } from "@/lib/prisma";
import { getPublicMenuUrl, getPublicSiteUrl } from "@/lib/public-url";
import { personalizeMessage, type AudienceCustomer } from "@/services/crm/CrmCampaignService";
import { CrmCampaignService } from "@/services/crm/CrmCampaignService";
import type { CRMAutomation } from "@prisma/client";
import { assignConversationContext, buildConversationMetadataForCrmSend } from "@/services/agents/AgentRoutingService";
import {
  getSafetyConfig,
  getTodayGlobalSendCount,
  checkQuietHours,
  checkWeekendBlock,
} from "@/lib/crm-safety";

// Campaign templateId prefix for automation-created campaigns.
// Used for dedup lookups and stats queries.
const AUTO_TAG = "auto:";

export interface AutomationRunResult {
  trigger: string;
  automationId: string;
  customersTargeted: number;
  messagesSent: number;
  messagesFailed: number;
  duplicatesSkipped: number;
  dryRun: boolean;
  campaignId?: string;
}

export interface RunAllResult {
  restaurantId: string;
  automationsRun: number;
  totalSent: number;
  totalFailed: number;
  results: AutomationRunResult[];
  errors: string[];
}

export class AutomationSchedulerService {
  /**
   * Run all enabled automations for a restaurant.
   * Safe to call repeatedly — per-trigger dedup prevents re-sending.
   */
  static async runEnabledAutomations(
    restaurantId: string,
    dryRun = false
  ): Promise<RunAllResult> {
    const automations = await prisma.cRMAutomation.findMany({
      where: { restaurantId, isEnabled: true },
    });

    // RETIRED: the legacy automation engine (birthday / post-order / reactivation)
    // is replaced by the ready-made campaigns in the Campanhas tab, which run through
    // the safe recurring runner + global budget. This engine no longer sends — it
    // only reports what WOULD have run, so nothing double-sends. Any still-enabled
    // legacy automation should be turned on as its ready-made equivalent instead.
    if (automations.length > 0) {
      console.warn(
        `[AutomationScheduler] RETIRED engine — skipped ${automations.length} legacy automation(s) ` +
        `for restaurant ${restaurantId} (${automations.map((a) => a.trigger).join(", ")}). ` +
        `Use the ready-made campaigns instead.`,
      );
    }
    return { restaurantId, automationsRun: 0, totalSent: 0, totalFailed: 0, results: [], errors: [] };
  }

  /**
   * Run a single automation trigger for a restaurant.
   */
  static async runSingleAutomation(
    restaurantId: string,
    automation: CRMAutomation,
    dryRun = false
  ): Promise<AutomationRunResult> {
    const base: AutomationRunResult = {
      trigger: automation.trigger,
      automationId: automation.id,
      customersTargeted: 0,
      messagesSent: 0,
      messagesFailed: 0,
      duplicatesSkipped: 0,
      dryRun,
    };

    // Respect per-automation sendDays config (0=Sun … 6=Sat)
    const schedCfg = (automation.scheduleConfig as { sendDays?: number[] } | null);
    if (schedCfg?.sendDays && schedCfg.sendDays.length > 0) {
      const nowBrasilia = new Date(new Date().toLocaleString("en-US", { timeZone: "America/Sao_Paulo" }));
      if (!schedCfg.sendDays.includes(nowBrasilia.getDay())) {
        console.log(`[AutomationScheduler] ${automation.trigger} skipped — not a configured send day`);
        return base;
      }
    }

    // ── Global safety checks ─────────────────────────────────────────────────
    const safety = await getSafetyConfig(restaurantId);

    const quietReason = checkQuietHours(safety);
    if (quietReason) {
      console.log(`[AutomationScheduler] ${automation.trigger} blocked — ${quietReason}`);
      return base;
    }

    const weekendReason = checkWeekendBlock(safety);
    if (weekendReason) {
      console.log(`[AutomationScheduler] ${automation.trigger} blocked — ${weekendReason}`);
      return base;
    }

    if (safety.dailyGlobalCap > 0) {
      const globalToday = await getTodayGlobalSendCount(restaurantId);
      if (globalToday >= safety.dailyGlobalCap) {
        console.log(`[AutomationScheduler] ${automation.trigger} blocked — cap global diário atingido (${globalToday}/${safety.dailyGlobalCap})`);
        return base;
      }
    }
    // ────────────────────────────────────────────────────────────────────────

    const customers = await AutomationSchedulerService.getTriggerableCustomers(
      restaurantId,
      automation
    );
    base.customersTargeted = customers.length;

    if (customers.length === 0 || dryRun || !automation.messageTemplate.trim()) return base;

    const { campaignId, recipients } = await AutomationSchedulerService.dispatchAutomationBatch(
      restaurantId,
      automation,
      customers
    );

    const sendResult = await CrmCampaignService.send(campaignId, restaurantId, {
      messages: recipients.map((r) => ({ recipientId: r.id, messageText: r.messageText })),
    });

    // Re-tag conversations from CRM_CAMPAIGN → CRM_AUTOMATION
    // (findOrCreateCrmConversation defaults to CRM_CAMPAIGN; automations need their own context)
    await prisma.conversation.updateMany({
      where: { relatedCampaignId: campaignId, contextType: "CRM_CAMPAIGN" },
      data:  { contextType: "CRM_AUTOMATION" },
    });

    return {
      ...base,
      campaignId,
      messagesSent: sendResult.totalSent,
      messagesFailed: sendResult.totalFailed,
      duplicatesSkipped: sendResult.duplicateSkipped,
    };
  }

  /**
   * Create Campaign + CampaignExecution rows for the automation batch.
   * The Campaign.templateId is tagged with `auto:<TRIGGER>` for dedup and stats.
   */
  static async dispatchAutomationBatch(
    restaurantId: string,
    automation: CRMAutomation,
    customers: AudienceCustomer[]
  ): Promise<{ campaignId: string; recipients: { id: string; messageText: string }[] }> {
    const triggerLabel: Record<string, string> = {
      REACTIVATION: "Reativação automática",
      BIRTHDAY: "Aniversário automático",
      POST_ORDER: "Pós-pedido automático",
    };

    const [restaurant, brandConfig] = await Promise.all([
      prisma.restaurant.findUnique({
        where: { id: restaurantId },
        select: { name: true, slug: true },
      }),
      prisma.restaurantBrandConfig.findUnique({
        where: { restaurantId },
        select: { googleReviewUrl: true, instagramUrl: true },
      }),
    ]);

    const pedidoUrl = restaurant?.slug ? getPublicMenuUrl(restaurant.slug) : getPublicSiteUrl();
    const ctx = {
      restaurantName:  restaurant?.name ?? "nossa loja",
      pedidoUrl,
      googleReviewUrl: brandConfig?.googleReviewUrl ?? null,
      instagramUrl:    brandConfig?.instagramUrl    ?? null,
    };

    const campaign = await prisma.$transaction(async (tx) => {
      const c = await tx.campaign.create({
        data: {
          restaurantId,
          name: triggerLabel[automation.trigger] ?? automation.trigger,
          message: automation.messageTemplate,
          objective: automation.trigger,
          channel: "WHATSAPP",
          targetSegment: automation.trigger,
          templateId: `${AUTO_TAG}${automation.trigger}`,
          totalAudience: customers.length,
          status: "DRAFT",
        },
      });

      await tx.campaignExecution.createMany({
        data: customers.map((customer) => ({
          campaignId: c.id,
          restaurantId,
          customerId: customer.id,
          customerName: customer.name,
          customerPhone: customer.phone,
          messageText: personalizeMessage(automation.messageTemplate, customer, ctx),
          status: "PENDING",
        })),
      });

      return c;
    });

    const executions = await prisma.campaignExecution.findMany({
      where: { campaignId: campaign.id },
      select: { id: true, messageText: true },
    });

    return {
      campaignId: campaign.id,
      recipients: executions.map((e) => ({ id: e.id, messageText: e.messageText ?? "" })),
    };
  }

  /**
   * Query customers eligible for this automation trigger.
   * Each trigger type has its own inactivity window dedup.
   */
  static async getTriggerableCustomers(
    restaurantId: string,
    automation: CRMAutomation
  ): Promise<AudienceCustomer[]> {
    const baseWhere = {
      restaurantId,
      isGuest: false,
      isActive: true,
      hasOptedOut: false,
      crmContactable: true,
      phone: { not: null as null },
    };

    type Row = {
      id: string; name: string; phone: string | null;
      tier: string; segment: string;
      totalOrders: number; totalSpend: { toNumber(): number };
      lastOrderAt: Date | null;
    };

    const baseSelect = {
      id: true, name: true, phone: true,
      tier: true, segment: true,
      totalOrders: true, totalSpend: true, lastOrderAt: true,
    } as const;

    function serialize(rows: Row[]): AudienceCustomer[] {
      return rows
        .filter((r) => r.phone && r.phone.trim() !== "")
        .map((r) => ({
          id: r.id,
          name: r.name,
          phone: r.phone!,
          tier: r.tier,
          segment: r.segment,
          totalOrders: r.totalOrders,
          totalSpend: r.totalSpend.toNumber(),
          lastOrderAt: r.lastOrderAt?.toISOString() ?? null,
        }));
    }

    switch (automation.trigger) {
      case "REACTIVATION": {
        const cutoff = new Date(Date.now() - automation.triggerAfterDays * 86_400_000);
        const candidates = serialize(
          (await prisma.customer.findMany({
            where: { ...baseWhere, lastOrderAt: { not: null, lte: cutoff } },
            orderBy: { lastOrderAt: "asc" },
            take: 500,
            select: baseSelect,
          })) as Row[]
        );
        return AutomationSchedulerService._filterRecentlyContacted(
          restaurantId,
          candidates,
          `${AUTO_TAG}REACTIVATION`,
          automation.triggerAfterDays
        );
      }

      case "BIRTHDAY": {
        const now = new Date();
        const todayMonth = now.getMonth() + 1;
        const todayDay = now.getDate();

        const withBirthday = await prisma.customer.findMany({
          where: { ...baseWhere, birthDate: { not: null } },
          select: { ...baseSelect, birthDate: true },
        }) as (Row & { birthDate: Date | null })[];

        const todayCustomers = withBirthday
          .filter((r) => r.phone && r.phone.trim() !== "")
          .filter((r) => {
            if (!r.birthDate) return false;
            const bMonth = r.birthDate.getMonth() + 1;
            const bDay = r.birthDate.getDate();
            return bMonth === todayMonth && Math.abs(bDay - todayDay) <= 1;
          })
          .map((r) => ({
            id: r.id,
            name: r.name,
            phone: r.phone!,
            tier: r.tier,
            segment: r.segment,
            totalOrders: r.totalOrders,
            totalSpend: r.totalSpend.toNumber(),
            lastOrderAt: r.lastOrderAt?.toISOString() ?? null,
          }));

        return AutomationSchedulerService._filterRecentlyContacted(
          restaurantId,
          todayCustomers,
          `${AUTO_TAG}BIRTHDAY`,
          365
        );
      }

      case "POST_ORDER": {
        const windowEnd = new Date(Date.now() - automation.triggerAfterDays * 86_400_000);
        const windowStart = new Date(windowEnd.getTime() - 86_400_000);

        // OrderStatus enum terminal values: DELIVERED is the only completed-delivery
        // state in this system (no separate COMPLETED status exists).
        // Both delivery and pickup orders are marked DELIVERED when fulfilled.
        const orders = await prisma.order.findMany({
          where: {
            restaurantId,
            status: { in: ["DELIVERED"] },
            completedAt: { gte: windowStart, lte: windowEnd },
          },
          select: { customerId: true },
          distinct: ["customerId"],
        });

        const customerIds = orders.map((o) => o.customerId).filter(Boolean) as string[];
        if (customerIds.length === 0) return [];

        const candidates = serialize(
          (await prisma.customer.findMany({
            where: { ...baseWhere, id: { in: customerIds } },
            select: baseSelect,
          })) as Row[]
        );

        // null = lifetime (all-time) dedup when oncePerCustomerLifetime is set
        const dedupWindow = automation.oncePerCustomerLifetime
          ? null
          : automation.triggerAfterDays;

        return AutomationSchedulerService._filterRecentlyContacted(
          restaurantId,
          candidates,
          `${AUTO_TAG}POST_ORDER`,
          dedupWindow
        );
      }

      default:
        return [];
    }
  }

  /**
   * Generate a personalized message for a single customer.
   * Convenience method for preview/testing; batch dispatch uses dispatchAutomationBatch.
   */
  static async generateAutomationMessage(
    restaurantId: string,
    automation: CRMAutomation,
    customer: AudienceCustomer
  ): Promise<string> {
    const [restaurant, brandConfig] = await Promise.all([
      prisma.restaurant.findUnique({
        where: { id: restaurantId },
        select: { name: true, slug: true },
      }),
      prisma.restaurantBrandConfig.findUnique({
        where: { restaurantId },
        select: { googleReviewUrl: true, instagramUrl: true },
      }),
    ]);

    const pedidoUrl = restaurant?.slug ? getPublicMenuUrl(restaurant.slug) : getPublicSiteUrl();

    return personalizeMessage(automation.messageTemplate, customer, {
      restaurantName:  restaurant?.name ?? "nossa loja",
      pedidoUrl,
      googleReviewUrl: brandConfig?.googleReviewUrl ?? null,
      instagramUrl:    brandConfig?.instagramUrl    ?? null,
    });
  }

  /**
   * Remove customers already contacted by this automation within the dedup window.
   * Looks up past CampaignExecution records tagged with the automation's templateId.
   */
  /**
   * Remove customers already contacted by this automation within the dedup window.
   * withinDays = null means lifetime (all-time) — customer is never re-contacted.
   */
  private static async _filterRecentlyContacted(
    restaurantId: string,
    customers: AudienceCustomer[],
    templateId: string,
    withinDays: number | null
  ): Promise<AudienceCustomer[]> {
    if (customers.length === 0) return [];

    const customerIds = customers.map((c) => c.id);

    const campaigns = await prisma.campaign.findMany({
      where: { restaurantId, templateId },
      select: { id: true },
    });
    if (campaigns.length === 0) return customers;

    const campaignIds = campaigns.map((c) => c.id);

    const alreadySent = await prisma.campaignExecution.findMany({
      where: {
        restaurantId,
        customerId: { in: customerIds },
        campaignId: { in: campaignIds },
        status: { in: ["SENT", "DELIVERED", "READ"] },
        ...(withinDays !== null
          ? { sentAt: { gte: new Date(Date.now() - withinDays * 86_400_000) } }
          : {}),
      },
      select: { customerId: true },
    });

    const impactedIds = new Set(
      alreadySent.map((e) => e.customerId).filter(Boolean) as string[]
    );
    return customers.filter((c) => !impactedIds.has(c.id));
  }
}
