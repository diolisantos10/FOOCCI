/**
 * ReadyMadeCampaignService — activation layer for the pre-built campaign catalog.
 *
 * Turns the ready-made catalog (readyMadeCampaigns.ts) into live, per-restaurant
 * state the UI can render and toggle with one click:
 *   - RECURRING campaigns  → backed by a real Campaign row (templateId = catalog id).
 *                            active ⇔ a campaign exists with status ACTIVE/SCHEDULED.
 *                            activate = create (or resume+update); deactivate = pause.
 *   - CART_RECOVERY        → backed by a flag in RestaurantCRMProfile.readyMadeConfig
 *                            (defaults ON to preserve the current always-on behavior).
 *
 * NOTHING is sent here. Activation only creates/enables a campaign that the normal
 * runner executes under the global safety budget. Sends still require the WhatsApp
 * instance connected and pass every safety gate.
 */

import { prisma } from "@/lib/prisma";
import { CrmCampaignService } from "./CrmCampaignService";
import {
  READY_MADE_CAMPAIGNS,
  getReadyMadeCampaign,
  getReadyMadeMessageVariants,
  getReadyMadeTiming,
  buildReadyMadeCampaignPayload,
  type ReadyMadeCampaign,
  type ReadyMadeCoupon,
  type ReadyMadeOverrides,
  type ReadyMadeTiming,
} from "./readyMadeCampaigns";

/** Persisted on/off for non-campaign ready-made engines. */
export interface ReadyMadeConfig {
  /** Cart recovery is ON unless explicitly disabled (preserves legacy behavior). */
  cartRecoveryEnabled: boolean;
}

const ACTIVE_STATUSES = ["ACTIVE", "SCHEDULED"];

/**
 * Ready-made campaigns replace the legacy CRMAutomation engine. When one is turned
 * on, disable the overlapping legacy automation (if any) so a restaurant can never
 * double-send the same relationship message from both engines. This is the safe
 * migration path away from the hidden Automações runner.
 */
const LEGACY_AUTOMATION_FOR: Record<string, "BIRTHDAY" | "POST_ORDER" | "REACTIVATION"> = {
  "aniversariantes":  "BIRTHDAY",
  "pedido-avaliacao": "POST_ORDER",
  "reativar-mornos":  "REACTIVATION",
  "recuperar-frios":  "REACTIVATION",
  "quente-esfriando": "REACTIVATION",
};

async function disableOverlappingLegacyAutomation(restaurantId: string, readyMadeId: string): Promise<void> {
  const trigger = LEGACY_AUTOMATION_FOR[readyMadeId];
  if (!trigger) return;
  await prisma.cRMAutomation.updateMany({
    where: { restaurantId, trigger: trigger as never, isEnabled: true },
    data:  { isEnabled: false },
  });
}

export interface ReadyMadeCampaignState {
  // Catalog (static)
  id:            string;
  emoji:         string;
  name:          string;
  tagline:       string;
  description:   string;
  objective:     string;
  engine:        ReadyMadeCampaign["engine"];
  priority:      ReadyMadeCampaign["priority"];
  editable:      ReadyMadeCampaign["editable"];
  /** Ready-to-use message options the owner can pick from. */
  messageVariants: string[];
  /** When this campaign fires, in plain words. */
  timing: ReadyMadeTiming;
  /** Event-based "X days after" value + its label (undefined for non-event campaigns). */
  triggerDays?: number;
  triggerDaysLabel?: string;
  // Live state
  active:        boolean;
  status:        string | null;   // campaign status (RECURRING) or null (CART)
  campaignId:    string | null;
  // Effective content (edited values when activated, else catalog defaults)
  message:       string;
  coupon:        ReadyMadeCoupon | null;
  weekdays:      number[];
  timeWindow:    { start: string; end: string };
  dailyLimit:    number;
}

// ─── config helpers ─────────────────────────────────────────────────────────────

export function parseReadyMadeConfig(raw: unknown): ReadyMadeConfig {
  if (!raw || typeof raw !== "object") return { cartRecoveryEnabled: true };
  const r = raw as Record<string, unknown>;
  return {
    cartRecoveryEnabled: typeof r.cartRecoveryEnabled === "boolean" ? r.cartRecoveryEnabled : true,
  };
}

async function getConfig(restaurantId: string): Promise<ReadyMadeConfig> {
  const profile = await prisma.restaurantCRMProfile.findUnique({
    where:  { restaurantId },
    select: { readyMadeConfig: true },
  });
  return parseReadyMadeConfig(profile?.readyMadeConfig);
}

async function setConfig(restaurantId: string, patch: Partial<ReadyMadeConfig>): Promise<void> {
  const current = await getConfig(restaurantId);
  const next = { ...current, ...patch };
  await prisma.restaurantCRMProfile.upsert({
    where:  { restaurantId },
    create: { restaurantId, readyMadeConfig: next as object },
    update: { readyMadeConfig: next as object },
  });
}

// ─── state ──────────────────────────────────────────────────────────────────────

type RecurringCfg = {
  weekdays?:    number[];
  timeWindow?:  { start: string; end: string };
  dailyLimit?:  number;
  triggerDays?: number;
  coupon?:      ReadyMadeCoupon | null;
};

export class ReadyMadeCampaignService {
  /** Full catalog with live per-restaurant state, in catalog order. */
  static async getStates(restaurantId: string): Promise<ReadyMadeCampaignState[]> {
    // One query for all ready-made campaign rows (most recent per templateId).
    const rows = await prisma.campaign.findMany({
      where:   { restaurantId, templateId: { in: READY_MADE_CAMPAIGNS.map((c) => c.id) } },
      orderBy: { createdAt: "desc" },
      select:  { id: true, templateId: true, status: true, message: true, scheduleConfig: true },
    });
    const byTemplate = new Map<string, (typeof rows)[number]>();
    for (const r of rows) if (r.templateId && !byTemplate.has(r.templateId)) byTemplate.set(r.templateId, r);

    const config = await getConfig(restaurantId);

    return READY_MADE_CAMPAIGNS.map((rm) => {
      const base = {
        id: rm.id, emoji: rm.emoji, name: rm.name, tagline: rm.tagline,
        description: rm.description, objective: rm.objective, engine: rm.engine,
        priority: rm.priority, editable: rm.editable,
        messageVariants: getReadyMadeMessageVariants(rm.id),
        timing: getReadyMadeTiming(rm.id),
        triggerDaysLabel: rm.triggerDaysLabel,
      };

      if (rm.engine === "CART_RECOVERY") {
        return {
          ...base,
          active:      config.cartRecoveryEnabled,
          status:      null,
          campaignId:  null,
          message:     rm.defaultMessage,
          coupon:      null,
          weekdays:    rm.schedule.weekdays,
          timeWindow:  rm.schedule.timeWindow,
          dailyLimit:  rm.schedule.dailyLimit,
          triggerDays: rm.triggerDays,
        };
      }

      const row = byTemplate.get(rm.id);
      const cfg = (row?.scheduleConfig as RecurringCfg | null) ?? null;
      return {
        ...base,
        active:     row ? ACTIVE_STATUSES.includes(row.status) : false,
        status:     row?.status ?? null,
        campaignId: row?.id ?? null,
        message:    row?.message ?? rm.defaultMessage,
        // When activated, the coupon lives in scheduleConfig; else the catalog default.
        coupon:      row ? (cfg?.coupon ?? null) : (rm.defaultCoupon ?? null),
        weekdays:    cfg?.weekdays   ?? rm.schedule.weekdays,
        timeWindow:  cfg?.timeWindow ?? rm.schedule.timeWindow,
        dailyLimit:  cfg?.dailyLimit ?? rm.schedule.dailyLimit,
        triggerDays: cfg?.triggerDays ?? rm.triggerDays,
      };
    });
  }

  /**
   * Turn a ready-made campaign ON. For RECURRING: resume+update an existing row, or
   * create a fresh ACTIVE recurring campaign. For CART_RECOVERY: flip the flag.
   * Applies any owner overrides (message/coupon/schedule). Never sends.
   */
  static async activate(
    restaurantId: string,
    id: string,
  ): Promise<{ ok: true; campaignId: string | null } | { ok: false; error: string }> {
    const rm = getReadyMadeCampaign(id);
    if (!rm) return { ok: false, error: "Campanha pronta não encontrada." };

    if (rm.engine === "CART_RECOVERY") {
      await setConfig(restaurantId, { cartRecoveryEnabled: true });
      return { ok: true, campaignId: null };
    }

    // Retire the overlapping legacy automation so both engines never fire together.
    await disableOverlappingLegacyAutomation(restaurantId, rm.id);

    // Turning ON is a status flip only — it never touches the content, so any edits
    // the owner saved while it was off are preserved.
    const existing = await prisma.campaign.findFirst({
      where:   { restaurantId, templateId: rm.id },
      orderBy: { createdAt: "desc" },
      select:  { id: true, status: true },
    });
    if (existing) {
      // Reactivating a campaign that was OFF (paused/cancelled/completed) starts a
      // fresh run: the dashboard must show only what happens from now on, not stats
      // left over from a previous activation. A same-session pause→resume never hits
      // this (status is still ACTIVE/SCHEDULED), so it keeps counting normally.
      const wasOff = !ACTIVE_STATUSES.includes(existing.status);
      await prisma.campaign.update({
        where: { id: existing.id },
        data:  {
          status: "ACTIVE" as never,
          ...(wasOff ? {
            // Fresh run: reset counters AND normalize the name to the catalog default
            // so a stale custom name (e.g. an old "NIVER") becomes the ready-made name.
            name: rm.name,
            totalSent: 0, totalFailed: 0, totalRead: 0,
            totalResponded: 0, totalConverted: 0, totalRevenue: 0,
            lastRunAt: null,
          } : {}),
        },
      });
      if (wasOff) {
        // The panel recomputes "Falhas" live from execution rows, so zeroing the
        // counter isn't enough — delete the old failed/blocked log rows too. Keep
        // the successful sends (SENT/DELIVERED/READ) so send-dedup stays intact.
        await prisma.campaignExecution.deleteMany({
          where: { campaignId: existing.id, status: { notIn: ["SENT", "DELIVERED", "READ"] as never[] } },
        }).catch(() => {});
      }
      return { ok: true, campaignId: existing.id };
    }

    // First activation with no prior edits — create straight from the safe defaults.
    const payload = buildReadyMadeCampaignPayload(rm);
    const result = await CrmCampaignService.create(restaurantId, {
      name:            payload.name,
      templateId:      payload.templateId,
      targetSegment:   payload.targetSegment,
      messageTemplate: payload.messageTemplate,
      objective:       payload.objective,
      channel:         payload.channel,
      scheduleConfig:  payload.scheduleConfig,
    });
    return { ok: true, campaignId: result.campaignId };
  }

  /** Turn a ready-made campaign OFF. RECURRING → pause the row; CART → flag off. */
  static async deactivate(
    restaurantId: string,
    id: string,
  ): Promise<{ ok: true } | { ok: false; error: string }> {
    const rm = getReadyMadeCampaign(id);
    if (!rm) return { ok: false, error: "Campanha pronta não encontrada." };

    if (rm.engine === "CART_RECOVERY") {
      await setConfig(restaurantId, { cartRecoveryEnabled: false });
      return { ok: true };
    }

    const existing = await prisma.campaign.findFirst({
      where:   { restaurantId, templateId: rm.id, status: { in: ACTIVE_STATUSES as never[] } },
      orderBy: { createdAt: "desc" },
      select:  { id: true },
    });
    if (existing) {
      await prisma.campaign.update({ where: { id: existing.id }, data: { status: "PAUSED" as never } });
    }
    return { ok: true };
  }

  /**
   * Edit a ready-made campaign's content/schedule WITHOUT turning it on. Works
   * before activation: if no campaign row exists yet, a PAUSED one is created to
   * hold the edits (the owner can configure everything, then flip it on when ready).
   * The runner only ever acts on ACTIVE campaigns, so a PAUSED row sends nothing.
   */
  static async update(
    restaurantId: string,
    id: string,
    overrides: ReadyMadeOverrides,
  ): Promise<{ ok: true } | { ok: false; error: string }> {
    const rm = getReadyMadeCampaign(id);
    if (!rm) return { ok: false, error: "Campanha pronta não encontrada." };
    if (rm.engine !== "RECURRING") return { ok: false, error: "Esta campanha não é editável." };

    const payload = buildReadyMadeCampaignPayload(rm, overrides);

    const existing = await prisma.campaign.findFirst({
      where:   { restaurantId, templateId: rm.id },
      orderBy: { createdAt: "desc" },
      select:  { id: true },
    });

    if (existing) {
      // Edit in place — never changes the on/off (status) state.
      await prisma.campaign.update({
        where: { id: existing.id },
        data:  {
          message:        payload.messageTemplate,
          scheduleConfig: payload.scheduleConfig as object,
        },
      });
      return { ok: true };
    }

    // No row yet — persist the edits as a PAUSED (off) campaign so they survive
    // until the owner turns it on.
    await prisma.campaign.create({
      data: {
        restaurantId,
        name:           payload.name,
        message:        payload.messageTemplate,
        objective:      payload.objective,
        channel:        payload.channel,
        targetSegment:  payload.targetSegment,
        templateId:     payload.templateId,
        status:         "PAUSED" as never,
        scheduleConfig: payload.scheduleConfig as object,
      },
    });
    return { ok: true };
  }
}
