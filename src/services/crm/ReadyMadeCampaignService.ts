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
  buildReadyMadeCampaignPayload,
  type ReadyMadeCampaign,
  type ReadyMadeOverrides,
} from "./readyMadeCampaigns";

/** Persisted on/off for non-campaign ready-made engines. */
export interface ReadyMadeConfig {
  /** Cart recovery is ON unless explicitly disabled (preserves legacy behavior). */
  cartRecoveryEnabled: boolean;
}

const ACTIVE_STATUSES = ["ACTIVE", "SCHEDULED"];

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
  suggestedCoupon?: string;
  // Live state
  active:        boolean;
  status:        string | null;   // campaign status (RECURRING) or null (CART)
  campaignId:    string | null;
  // Effective content (edited values when activated, else catalog defaults)
  message:       string;
  couponCode:    string | null;
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
  weekdays?:   number[];
  timeWindow?: { start: string; end: string };
  dailyLimit?: number;
};

export class ReadyMadeCampaignService {
  /** Full catalog with live per-restaurant state, in catalog order. */
  static async getStates(restaurantId: string): Promise<ReadyMadeCampaignState[]> {
    // One query for all ready-made campaign rows (most recent per templateId).
    const rows = await prisma.campaign.findMany({
      where:   { restaurantId, templateId: { in: READY_MADE_CAMPAIGNS.map((c) => c.id) } },
      orderBy: { createdAt: "desc" },
      select:  { id: true, templateId: true, status: true, message: true, couponCode: true, scheduleConfig: true },
    });
    const byTemplate = new Map<string, (typeof rows)[number]>();
    for (const r of rows) if (r.templateId && !byTemplate.has(r.templateId)) byTemplate.set(r.templateId, r);

    const config = await getConfig(restaurantId);

    return READY_MADE_CAMPAIGNS.map((rm) => {
      const base = {
        id: rm.id, emoji: rm.emoji, name: rm.name, tagline: rm.tagline,
        description: rm.description, objective: rm.objective, engine: rm.engine,
        priority: rm.priority, editable: rm.editable, suggestedCoupon: rm.suggestedCoupon,
      };

      if (rm.engine === "CART_RECOVERY") {
        return {
          ...base,
          active:     config.cartRecoveryEnabled,
          status:     null,
          campaignId: null,
          message:    rm.defaultMessage,
          couponCode: null,
          weekdays:   rm.schedule.weekdays,
          timeWindow: rm.schedule.timeWindow,
          dailyLimit: rm.schedule.dailyLimit,
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
        couponCode: row?.couponCode ?? rm.suggestedCoupon ?? null,
        weekdays:   cfg?.weekdays   ?? rm.schedule.weekdays,
        timeWindow: cfg?.timeWindow ?? rm.schedule.timeWindow,
        dailyLimit: cfg?.dailyLimit ?? rm.schedule.dailyLimit,
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
    overrides: ReadyMadeOverrides = {},
  ): Promise<{ ok: true; campaignId: string | null } | { ok: false; error: string }> {
    const rm = getReadyMadeCampaign(id);
    if (!rm) return { ok: false, error: "Campanha pronta não encontrada." };

    if (rm.engine === "CART_RECOVERY") {
      await setConfig(restaurantId, { cartRecoveryEnabled: true });
      return { ok: true, campaignId: null };
    }

    const payload = buildReadyMadeCampaignPayload(rm, overrides);

    const existing = await prisma.campaign.findFirst({
      where:   { restaurantId, templateId: rm.id },
      orderBy: { createdAt: "desc" },
      select:  { id: true, status: true },
    });

    if (existing) {
      // Resume + apply any edits to the existing row (no duplicate campaigns).
      await prisma.campaign.update({
        where: { id: existing.id },
        data:  {
          status:         "ACTIVE" as never,
          message:        payload.messageTemplate,
          scheduleConfig: payload.scheduleConfig as object,
          ...(payload.couponCode ? { couponCode: payload.couponCode } : {}),
        },
      });
      return { ok: true, campaignId: existing.id };
    }

    const result = await CrmCampaignService.create(restaurantId, {
      name:            payload.name,
      templateId:      payload.templateId,
      targetSegment:   payload.targetSegment,
      messageTemplate: payload.messageTemplate,
      objective:       payload.objective,
      channel:         payload.channel,
      scheduleConfig:  payload.scheduleConfig,
      couponCode:      payload.couponCode,
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
   * Edit an activated ready-made campaign's content/schedule without changing its
   * on/off state. Only meaningful for RECURRING campaigns that already exist.
   */
  static async update(
    restaurantId: string,
    id: string,
    overrides: ReadyMadeOverrides,
  ): Promise<{ ok: true } | { ok: false; error: string }> {
    const rm = getReadyMadeCampaign(id);
    if (!rm) return { ok: false, error: "Campanha pronta não encontrada." };
    if (rm.engine !== "RECURRING") return { ok: false, error: "Esta campanha não é editável." };

    const existing = await prisma.campaign.findFirst({
      where:   { restaurantId, templateId: rm.id },
      orderBy: { createdAt: "desc" },
      select:  { id: true },
    });
    if (!existing) return { ok: false, error: "Ative a campanha antes de editar." };

    const payload = buildReadyMadeCampaignPayload(rm, overrides);
    await prisma.campaign.update({
      where: { id: existing.id },
      data:  {
        message:        payload.messageTemplate,
        scheduleConfig: payload.scheduleConfig as object,
        ...(payload.couponCode ? { couponCode: payload.couponCode } : {}),
      },
    });
    return { ok: true };
  }
}
