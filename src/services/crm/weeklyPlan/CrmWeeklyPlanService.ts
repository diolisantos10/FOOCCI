/**
 * CrmWeeklyPlanService — lifecycle + execution of the Weekly Strategist plan.
 *
 * The "doer" half of the Weekly Strategist:
 *   - read the current plan and autonomy settings,
 *   - approve / reject / edit individual proposed campaigns,
 *   - and EXECUTE approved items by turning each into a real recurring Campaign.
 *
 * Execution reuses CrmCampaignService.create() with a RECURRING scheduleConfig,
 * so the campaign goes ACTIVE and the existing ScheduledCampaignRunnerService
 * sends it safely within its window and all the usual safety caps. This service
 * therefore NEVER sends a message directly — it only creates campaigns.
 *
 * Tenant-scoped: every query is filtered by restaurantId.
 */

import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import { CrmCampaignService } from "@/services/crm/CrmCampaignService";
import type { CrmWeeklyPlanItem } from "@prisma/client";
import {
  type AutonomyMode,
  type AutonomyConfig,
  resolveAutonomyConfig,
  DEFAULT_AUTONOMY_CONFIG,
} from "./autonomyPolicy";

const PLAN_INCLUDE = {
  items: { orderBy: { createdAt: "asc" as const } },
} as const;

export interface ExecuteResult {
  executed: number;
  failed: number;
  skipped: number;
}

export class CrmWeeklyPlanService {
  // ─── Read ──────────────────────────────────────────────────────────────────

  /** Latest plan for the restaurant (most recent week), with items. */
  static async getCurrentPlan(restaurantId: string) {
    return prisma.crmWeeklyPlan.findFirst({
      where: { restaurantId },
      orderBy: { weekStart: "desc" },
      include: PLAN_INCLUDE,
    });
  }

  /** A specific plan, tenant-scoped (returns null if it isn't this restaurant's). */
  static async getPlan(restaurantId: string, planId: string) {
    return prisma.crmWeeklyPlan.findFirst({
      where: { id: planId, restaurantId },
      include: PLAN_INCLUDE,
    });
  }

  // ─── Autonomy settings ───────────────────────────────────────────────────────

  static async getAutonomy(
    restaurantId: string,
  ): Promise<{ mode: AutonomyMode; config: AutonomyConfig }> {
    const profile = await prisma.restaurantCRMProfile.findUnique({
      where: { restaurantId },
      select: { autonomyMode: true, autonomyConfig: true },
    });
    const mode: AutonomyMode = profile?.autonomyMode === "AUTOPILOT" ? "AUTOPILOT" : "COPILOT";
    return { mode, config: resolveAutonomyConfig(profile?.autonomyConfig) };
  }

  static async setAutonomy(
    restaurantId: string,
    input: { mode?: AutonomyMode; config?: Partial<AutonomyConfig> },
  ): Promise<{ mode: AutonomyMode; config: AutonomyConfig }> {
    const current = await this.getAutonomy(restaurantId);
    const mode: AutonomyMode = input.mode ?? current.mode;
    const config = resolveAutonomyConfig({ ...current.config, ...(input.config ?? {}) });

    const configJson = config as unknown as Prisma.InputJsonValue;
    await prisma.restaurantCRMProfile.upsert({
      where: { restaurantId },
      create: { restaurantId, autonomyMode: mode, autonomyConfig: configJson },
      update: { autonomyMode: mode, autonomyConfig: configJson },
    });
    return { mode, config };
  }

  /**
   * Cross-tenant autonomy overview for the Admin control panel: every restaurant
   * with its current mode, resolved guardrails and latest weekly plan status.
   */
  static async listAutonomyOverview() {
    const [restaurants, profiles, plans] = await Promise.all([
      prisma.restaurant.findMany({ select: { id: true, name: true, slug: true }, orderBy: { name: "asc" } }),
      prisma.restaurantCRMProfile.findMany({
        select: { restaurantId: true, autonomyMode: true, autonomyConfig: true },
      }),
      prisma.crmWeeklyPlan.findMany({
        orderBy: { weekStart: "desc" },
        select: { restaurantId: true, weekStart: true, status: true, summary: true },
      }),
    ]);

    const profileMap = new Map(profiles.map((p) => [p.restaurantId, p]));
    const latestPlan = new Map<string, (typeof plans)[number]>();
    for (const pl of plans) {
      if (!latestPlan.has(pl.restaurantId)) latestPlan.set(pl.restaurantId, pl); // desc → first seen is latest
    }

    return restaurants.map((r) => {
      const prof = profileMap.get(r.id);
      const mode: AutonomyMode = prof?.autonomyMode === "AUTOPILOT" ? "AUTOPILOT" : "COPILOT";
      return {
        restaurantId: r.id,
        name: r.name,
        slug: r.slug,
        mode,
        config: resolveAutonomyConfig(prof?.autonomyConfig),
        latestPlan: latestPlan.get(r.id) ?? null,
      };
    });
  }

  // ─── Item-level decisions ────────────────────────────────────────────────────

  /** Approve one proposed item and execute it (create its recurring campaign). */
  static async approveItem(restaurantId: string, itemId: string): Promise<CrmWeeklyPlanItem> {
    const item = await this.requireItem(restaurantId, itemId);
    if (item.status === "PROPOSED") {
      await prisma.crmWeeklyPlanItem.update({
        where: { id: item.id },
        data: { status: "APPROVED", decidedAt: new Date() },
      });
    }
    const executed = await this.executeItem({ ...item, status: "APPROVED" });
    await this.syncPlanStatus(item.planId);
    return executed;
  }

  static async rejectItem(restaurantId: string, itemId: string): Promise<CrmWeeklyPlanItem> {
    const item = await this.requireItem(restaurantId, itemId);
    const updated = await prisma.crmWeeklyPlanItem.update({
      where: { id: item.id },
      data: { status: "REJECTED", decidedAt: new Date() },
    });
    await this.syncPlanStatus(item.planId);
    return updated;
  }

  /** Edit a proposed item's message / schedule / coupon before approving it. */
  static async editItem(
    restaurantId: string,
    itemId: string,
    patch: { messageTemplate?: string; suggestedScheduleConfig?: object; couponCode?: string | null },
  ): Promise<CrmWeeklyPlanItem> {
    const item = await this.requireItem(restaurantId, itemId);
    if (item.status === "EXECUTED") {
      throw new Error("Não é possível editar um item já executado.");
    }
    return prisma.crmWeeklyPlanItem.update({
      where: { id: item.id },
      data: {
        messageTemplate: patch.messageTemplate ?? undefined,
        suggestedScheduleConfig: patch.suggestedScheduleConfig
          ? (patch.suggestedScheduleConfig as unknown as Prisma.InputJsonValue)
          : undefined,
        couponCode: patch.couponCode === undefined ? undefined : patch.couponCode,
      },
    });
  }

  // ─── Plan-level decisions ────────────────────────────────────────────────────

  /** Approve every proposed item in the plan, then execute all approved items. */
  static async approvePlan(
    restaurantId: string,
    planId: string,
  ): Promise<{ executed: ExecuteResult }> {
    const plan = await this.getPlan(restaurantId, planId);
    if (!plan) throw new Error("Plano não encontrado.");

    await prisma.crmWeeklyPlanItem.updateMany({
      where: { planId, status: "PROPOSED" },
      data: { status: "APPROVED", decidedAt: new Date() },
    });
    const executed = await this.executeApprovedItems(restaurantId, planId);
    await prisma.crmWeeklyPlan.update({
      where: { id: planId },
      data: { decidedAt: new Date(), decidedBy: "LOJISTA" },
    });
    await this.syncPlanStatus(planId);
    return { executed };
  }

  static async rejectPlan(restaurantId: string, planId: string) {
    const plan = await this.getPlan(restaurantId, planId);
    if (!plan) throw new Error("Plano não encontrado.");
    await prisma.crmWeeklyPlanItem.updateMany({
      where: { planId, status: { in: ["PROPOSED", "APPROVED"] } },
      data: { status: "REJECTED", decidedAt: new Date() },
    });
    return prisma.crmWeeklyPlan.update({
      where: { id: planId },
      data: { status: "REJECTED", decidedAt: new Date(), decidedBy: "LOJISTA" },
      include: PLAN_INCLUDE,
    });
  }

  // ─── Execution (item → recurring Campaign) ───────────────────────────────────

  /** Execute every APPROVED item that hasn't been turned into a campaign yet. */
  static async executeApprovedItems(restaurantId: string, planId: string): Promise<ExecuteResult> {
    const items = await prisma.crmWeeklyPlanItem.findMany({
      where: { planId, restaurantId, status: "APPROVED", campaignId: null },
    });
    let executed = 0;
    let failed = 0;
    for (const item of items) {
      const after = await this.executeItem(item);
      if (after.status === "EXECUTED") executed += 1;
      else if (after.status === "FAILED") failed += 1;
    }
    await this.syncPlanStatus(planId);
    return { executed, failed, skipped: 0 };
  }

  /**
   * Turn a single approved item into a recurring Campaign. Idempotent: if the
   * item already has a campaignId it is returned unchanged.
   */
  private static async executeItem(item: CrmWeeklyPlanItem): Promise<CrmWeeklyPlanItem> {
    if (item.campaignId) return item;
    if (item.status !== "APPROVED") return item;

    try {
      const { campaignId } = await CrmCampaignService.create(item.restaurantId, {
        name: `Plano semanal · ${item.title}`,
        templateId: item.templateId ?? undefined,
        targetSegment: item.targetSegment,
        messageTemplate: item.messageTemplate,
        objective: item.objective ?? undefined,
        scheduleConfig: item.suggestedScheduleConfig ?? undefined,
        couponCode: item.couponCode ?? undefined,
        // Stable concept key per opportunity → the contact ledger remembers who was
        // already reached, so the same person isn't re-hit week after week.
        campaignFamilyKey: `weekly-${item.actionType.toLowerCase()}`,
        dedupePolicy: {
          dedupeByConcept: true,
          dedupeByMessage: true,
          dedupeWindowDays: 30,
          allowResendToImpacted: false,
        },
      });

      return prisma.crmWeeklyPlanItem.update({
        where: { id: item.id },
        data: { status: "EXECUTED", campaignId, executionError: null },
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Falha ao criar campanha.";
      return prisma.crmWeeklyPlanItem.update({
        where: { id: item.id },
        data: { status: "FAILED", executionError: message.slice(0, 480) },
      });
    }
  }

  // ─── helpers ─────────────────────────────────────────────────────────────────

  private static async requireItem(
    restaurantId: string,
    itemId: string,
  ): Promise<CrmWeeklyPlanItem> {
    const item = await prisma.crmWeeklyPlanItem.findFirst({
      where: { id: itemId, restaurantId },
    });
    if (!item) throw new Error("Item do plano não encontrado.");
    return item;
  }

  /** Recompute the plan status from its items' statuses. */
  static async syncPlanStatus(planId: string): Promise<void> {
    const items = await prisma.crmWeeklyPlanItem.findMany({
      where: { planId },
      select: { status: true },
    });
    if (items.length === 0) return;

    const count = (s: string) => items.filter((i) => i.status === s).length;
    const proposed = count("PROPOSED");
    const approved = count("APPROVED");
    const executed = count("EXECUTED");
    const failed = count("FAILED");
    const rejected = count("REJECTED");

    let status: string;
    if (rejected === items.length) {
      status = "REJECTED";
    } else if (proposed > 0) {
      status = executed + approved + failed > 0 ? "PARTIALLY_APPROVED" : "PENDING_APPROVAL";
    } else if (executed > 0 || failed > 0) {
      status = "EXECUTED";
    } else {
      status = "APPROVED";
    }

    await prisma.crmWeeklyPlan.update({
      where: { id: planId },
      data: { status: status as never },
    });
  }
}

export { DEFAULT_AUTONOMY_CONFIG };
