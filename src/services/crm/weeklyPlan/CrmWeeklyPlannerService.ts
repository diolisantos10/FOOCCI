/**
 * CrmWeeklyPlannerService — the "thinker" half of the Weekly Strategist.
 *
 * Once a week the agent:
 *   1. analyses the restaurant's situation via CrmActionCenterService,
 *   2. turns each actionable opportunity into a campaign draft (actionRecipes),
 *   3. decides per the restaurant's autonomy settings (autonomyPolicy),
 *   4. persists a CrmWeeklyPlan + items, and
 *   5. in AUTOPILOT, executes the auto-approved items (creates recurring campaigns).
 *
 * Idempotent per ISO week: one plan per restaurant per week unless `force` is set.
 */

import { startOfWeek } from "date-fns";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { CrmActionCenterService } from "@/services/crm/CrmActionCenterService";
import { buildPlanDrafts, type PlanItemDraft } from "./actionRecipes";
import { decidePlan } from "./autonomyPolicy";
import { CrmWeeklyPlanService } from "./CrmWeeklyPlanService";
import { CrmWeeklyNotificationService } from "./CrmWeeklyNotificationService";
import { composeCampaignTemplate, isAiMessagesEnabled, requiredPlaceholdersFor } from "./messageComposer";

export interface GenerateResult {
  planId: string;
  created: boolean;
  autoExecuted: number;
  totalItems: number;
}

export interface BatchResult {
  processed: number;
  created: number;
  autoExecuted: number;
  errors: { restaurantId: string; error: string }[];
}

/** Monday 00:00 of the week containing `now` (ISO week). */
export function isoWeekStart(now: Date): Date {
  return startOfWeek(now, { weekStartsOn: 1 });
}

export class CrmWeeklyPlannerService {
  /**
   * Generate (or return the existing) weekly plan for one restaurant.
   * Pass `force` to discard an existing plan for the week and recompute.
   */
  static async generateForRestaurant(
    restaurantId: string,
    opts?: { now?: Date; force?: boolean; notify?: boolean },
  ): Promise<GenerateResult> {
    const now = opts?.now ?? new Date();
    const weekStart = isoWeekStart(now);

    const existing = await prisma.crmWeeklyPlan.findFirst({
      where: { restaurantId, weekStart },
      select: { id: true },
    });
    if (existing && !opts?.force) {
      const items = await prisma.crmWeeklyPlanItem.count({ where: { planId: existing.id } });
      return { planId: existing.id, created: false, autoExecuted: 0, totalItems: items };
    }
    if (existing && opts?.force) {
      await prisma.crmWeeklyPlan.delete({ where: { id: existing.id } }); // cascade items
    }

    const { mode, config } = await CrmWeeklyPlanService.getAutonomy(restaurantId);
    const [actionCenter, restaurant] = await Promise.all([
      CrmActionCenterService.getActionCenter(restaurantId, { now }),
      prisma.restaurant.findUnique({ where: { id: restaurantId }, select: { name: true } }),
    ]);
    const baseDrafts = buildPlanDrafts(actionCenter.actions);
    const drafts = await this.enrichDraftsWithAi(baseDrafts, restaurant?.name ?? "nossa loja");
    const decision = decidePlan(drafts, mode, config);

    const totalAudience = decision.decisions.reduce((s, d) => s + d.draft.estimatedAudience, 0);
    const totalRevenue = decision.decisions.reduce((s, d) => s + d.draft.estimatedRevenue, 0);
    const summary = {
      totalItems: decision.decisions.length,
      totalAudience,
      totalEstimatedRevenue: Math.round(totalRevenue),
      highPriority: decision.decisions.filter((d) => d.draft.priority === "HIGH").length,
      autoApproved: decision.autoApprovedCount,
    };

    const plan = await prisma.crmWeeklyPlan.create({
      data: {
        restaurantId,
        weekStart,
        status: decision.planStatus,
        autonomyMode: mode,
        summary,
        warnings: actionCenter.warnings,
        decidedBy: mode === "AUTOPILOT" && decision.autoApprovedCount > 0 ? "AUTOPILOT" : null,
        decidedAt: mode === "AUTOPILOT" && decision.autoApprovedCount > 0 ? new Date() : null,
        items: {
          create: decision.decisions.map((d) => ({
            restaurantId,
            actionType: d.draft.actionType,
            title: d.draft.title,
            rationale: d.draft.rationale,
            targetSegment: d.draft.targetSegment,
            templateId: d.draft.templateId,
            objective: d.draft.objective,
            messageTemplate: d.draft.messageTemplate,
            estimatedAudience: d.draft.estimatedAudience,
            estimatedRevenue: d.draft.estimatedRevenue,
            priority: d.draft.priority,
            suggestedScheduleConfig: d.draft.suggestedScheduleConfig as unknown as Prisma.InputJsonValue,
            status: d.status,
          })),
        },
      },
      select: { id: true },
    });

    // AUTOPILOT: turn the auto-approved items into live recurring campaigns now.
    let autoExecuted = 0;
    if (mode === "AUTOPILOT" && decision.autoApprovedCount > 0) {
      const res = await CrmWeeklyPlanService.executeApprovedItems(restaurantId, plan.id);
      autoExecuted = res.executed;
    }

    // Proactively ping the owner on WhatsApp (cron only — opt-in via `notify`).
    if (opts?.notify) {
      const notifyPayload = {
        items: decision.decisions.map((d) => ({ status: d.status })),
        summary,
      };
      try {
        if (mode === "AUTOPILOT" && autoExecuted > 0) {
          await CrmWeeklyNotificationService.notifyAutopilotExecuted(restaurantId, notifyPayload, autoExecuted);
        } else {
          await CrmWeeklyNotificationService.notifyPlanReady(restaurantId, notifyPayload);
        }
      } catch {
        /* best-effort — a notification failure never fails plan generation */
      }
    }

    return {
      planId: plan.id,
      created: true,
      autoExecuted,
      totalItems: decision.decisions.length,
    };
  }

  /**
   * Fase 2: replace each draft's recipe message with an on-brand template
   * generated from the CRM Agent's constitution (screened + safe). No-op when AI
   * messages are disabled, so the deterministic recipe stays the default.
   */
  private static async enrichDraftsWithAi(
    drafts: PlanItemDraft[],
    restaurantName: string,
  ): Promise<PlanItemDraft[]> {
    if (!isAiMessagesEnabled()) return drafts;
    return Promise.all(
      drafts.map(async (d) => {
        const { message } = await composeCampaignTemplate({
          actionType: d.actionType,
          restaurantName,
          fallbackMessage: d.messageTemplate,
          requiredPlaceholders: requiredPlaceholdersFor(d.messageTemplate),
          allowDiscount: false,
        });
        return { ...d, messageTemplate: message };
      }),
    );
  }

  /**
   * Cron entry point: generate plans for every restaurant that has a real
   * (non-guest, active) customer base — those are the ones a plan can act on.
   */
  static async generateForAllRestaurants(opts?: { now?: Date; force?: boolean; notify?: boolean }): Promise<BatchResult> {
    const rows = await prisma.customer.groupBy({
      by: ["restaurantId"],
      where: { isGuest: false, isActive: true },
      _count: { _all: true },
    });
    const restaurantIds = rows.filter((r) => r._count._all > 0).map((r) => r.restaurantId);

    const result: BatchResult = { processed: 0, created: 0, autoExecuted: 0, errors: [] };
    for (const restaurantId of restaurantIds) {
      try {
        // First, the digest for last week's results (best-effort), then this week's plan.
        if (opts?.notify) {
          await CrmWeeklyNotificationService.sendResultsDigest(restaurantId, { now: opts?.now }).catch(() => undefined);
        }
        const r = await this.generateForRestaurant(restaurantId, opts);
        result.processed += 1;
        if (r.created) result.created += 1;
        result.autoExecuted += r.autoExecuted;
      } catch (err) {
        result.errors.push({
          restaurantId,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }
    return result;
  }
}
