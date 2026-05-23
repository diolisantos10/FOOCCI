/**
 * CRM WhatsApp Sending Safety
 *
 * Global safety configuration for outbound WhatsApp CRM messages.
 * Stored in RestaurantCRMProfile.whatsAppSafetyConfig (JSONB).
 *
 * Enforced by:
 *   - ScheduledCampaignRunnerService  (recurring campaigns)
 *   - AutomationSchedulerService      (reactivation, birthday, post-order)
 */

import { prisma } from "@/lib/prisma";

// ─── Config shape ─────────────────────────────────────────────────────────────

export interface CRMWhatsAppSafetyConfig {
  /** Max CRM messages sent per 24-hour rolling window across ALL campaigns + automations. 0 = no cap. */
  dailyGlobalCap: number;
  /** Minimum hours between any two CRM messages to the same customer. Default 24. */
  customerCooldownHours: number;
  /** Whether to enforce quiet hours (no automated sends). */
  quietHoursEnabled: boolean;
  /** Start of quiet period — "HH:MM" 24-h format. */
  quietHoursStart: string;
  /** End of quiet period — "HH:MM" 24-h format. */
  quietHoursEnd: string;
  /** IANA timezone for quiet hours evaluation. */
  timezone: string;
  /** Allow sends on Saturday and Sunday. When false only Mon–Fri. */
  sendOnWeekends: boolean;
  /** Max CRM messages to the same customer in any 7-day window. 0 = no limit. */
  maxPerWeekPerCustomer: number;
  /** Whether to insert a random delay between consecutive sends in a batch. */
  randomDelayEnabled: boolean;
  /** Lower bound of the random inter-send delay (seconds). */
  randomDelayMinSec: number;
  /** Upper bound of the random inter-send delay (seconds). */
  randomDelayMaxSec: number;
}

export const DEFAULT_SAFETY_CONFIG: Readonly<CRMWhatsAppSafetyConfig> = {
  dailyGlobalCap:        200,
  customerCooldownHours: 24,
  quietHoursEnabled:     true,
  quietHoursStart:       "21:00",
  quietHoursEnd:         "08:00",
  timezone:              "America/Sao_Paulo",
  sendOnWeekends:        true,
  maxPerWeekPerCustomer: 5,
  randomDelayEnabled:    true,
  randomDelayMinSec:     5,
  randomDelayMaxSec:     45,
};

// ─── Parsing ──────────────────────────────────────────────────────────────────

export function parseSafetyConfig(raw: unknown): CRMWhatsAppSafetyConfig {
  const d = DEFAULT_SAFETY_CONFIG;
  if (!raw || typeof raw !== "object") return { ...d };
  const r = raw as Record<string, unknown>;
  return {
    dailyGlobalCap:        typeof r.dailyGlobalCap        === "number"  ? r.dailyGlobalCap        : d.dailyGlobalCap,
    customerCooldownHours: typeof r.customerCooldownHours === "number"  ? r.customerCooldownHours : d.customerCooldownHours,
    quietHoursEnabled:     typeof r.quietHoursEnabled     === "boolean" ? r.quietHoursEnabled     : d.quietHoursEnabled,
    quietHoursStart:       typeof r.quietHoursStart       === "string"  ? r.quietHoursStart       : d.quietHoursStart,
    quietHoursEnd:         typeof r.quietHoursEnd         === "string"  ? r.quietHoursEnd         : d.quietHoursEnd,
    timezone:              typeof r.timezone              === "string"  ? r.timezone              : d.timezone,
    sendOnWeekends:        typeof r.sendOnWeekends        === "boolean" ? r.sendOnWeekends        : d.sendOnWeekends,
    maxPerWeekPerCustomer: typeof r.maxPerWeekPerCustomer === "number"  ? r.maxPerWeekPerCustomer : d.maxPerWeekPerCustomer,
    randomDelayEnabled:    typeof r.randomDelayEnabled    === "boolean" ? r.randomDelayEnabled    : d.randomDelayEnabled,
    randomDelayMinSec:     typeof r.randomDelayMinSec     === "number"  ? r.randomDelayMinSec     : d.randomDelayMinSec,
    randomDelayMaxSec:     typeof r.randomDelayMaxSec     === "number"  ? r.randomDelayMaxSec     : d.randomDelayMaxSec,
  };
}

// ─── DB helpers ───────────────────────────────────────────────────────────────

export async function getSafetyConfig(restaurantId: string): Promise<CRMWhatsAppSafetyConfig> {
  const profile = await prisma.restaurantCRMProfile.findUnique({
    where:  { restaurantId },
    select: { whatsAppSafetyConfig: true },
  });
  return parseSafetyConfig(profile?.whatsAppSafetyConfig);
}

/**
 * Total CRM messages successfully sent in the last 24 hours for this restaurant,
 * across ALL campaigns and automations.
 */
export async function getTodayGlobalSendCount(restaurantId: string): Promise<number> {
  const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);
  return prisma.campaignExecution.count({
    where: {
      restaurantId,
      sentAt: { gte: cutoff },
      status: { in: ["SENT", "DELIVERED", "READ"] },
    },
  });
}

// ─── Guard helpers ────────────────────────────────────────────────────────────

/**
 * Returns a reason string if the current time falls inside quiet hours;
 * returns null when sending is allowed.
 */
export function checkQuietHours(cfg: CRMWhatsAppSafetyConfig, now: Date = new Date()): string | null {
  if (!cfg.quietHoursEnabled) return null;

  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: cfg.timezone,
    hour:     "2-digit",
    minute:   "2-digit",
    hour12:   false,
  });
  const parts  = fmt.formatToParts(now);
  const h      = parseInt(parts.find((p) => p.type === "hour")?.value   ?? "0", 10);
  const m      = parseInt(parts.find((p) => p.type === "minute")?.value ?? "0", 10);
  const nowMin = h * 60 + m;

  const startParts = cfg.quietHoursStart.split(":").map(Number);
  const endParts   = cfg.quietHoursEnd.split(":").map(Number);
  const startMin   = (startParts[0] ?? 0) * 60 + (startParts[1] ?? 0);
  const endMin     = (endParts[0]   ?? 0) * 60 + (endParts[1]   ?? 0);

  // Handles overnight spans: e.g. 21:00–08:00
  const inQuiet = startMin > endMin
    ? nowMin >= startMin || nowMin < endMin
    : nowMin >= startMin && nowMin < endMin;

  return inQuiet
    ? `Horário quieto ativo (${cfg.quietHoursStart}–${cfg.quietHoursEnd}, fuso ${cfg.timezone})`
    : null;
}

/**
 * Returns a reason string if today is a weekend day and weekend sends are disabled;
 * null otherwise.
 */
export function checkWeekendBlock(cfg: CRMWhatsAppSafetyConfig, now: Date = new Date()): string | null {
  if (cfg.sendOnWeekends) return null;
  const fmt = new Intl.DateTimeFormat("en-US", { timeZone: cfg.timezone, weekday: "short" });
  const day = fmt.format(now); // "Sun" | "Mon" | ... | "Sat"
  if (day === "Sun" || day === "Sat") {
    return "Envio em fins de semana desabilitado nas configurações de segurança";
  }
  return null;
}

/**
 * Returns a random inter-send delay in **milliseconds** drawn from [minSec, maxSec].
 * Returns 0 when random delay is disabled.
 */
export function randomDelayMs(cfg: CRMWhatsAppSafetyConfig): number {
  if (!cfg.randomDelayEnabled) return 0;
  const min = Math.max(0, cfg.randomDelayMinSec);
  const max = Math.max(min, cfg.randomDelayMaxSec);
  return (Math.floor(Math.random() * (max - min + 1)) + min) * 1000;
}

// ─── Birthday exemption ───────────────────────────────────────────────────────

/**
 * Returns true when a campaign/automation qualifies as a birthday send.
 *
 * Birthday messages are exempt from cross-campaign frequency cooldowns
 * (customerCooldownHours / maxPerWeekPerCustomer / 24h duplicate guard)
 * because birthday windows occur at most once per month per customer and
 * must not be blocked by an earlier promotion.
 *
 * All other safety rules still apply:
 *   - hasOptedOut / crmContactable / valid phone
 *   - WhatsApp integration availability
 *   - quiet hours and daily global cap
 *   - per-automation 365-day dedup (prevents re-sending same birthday year)
 */
export function isBirthdayCampaign(campaign: {
  templateId?:    string | null;
  objective?:     string | null;
  targetSegment?: string | null;
}): boolean {
  const tid = (campaign.templateId    ?? "").toLowerCase();
  const obj = (campaign.objective     ?? "").toUpperCase();
  const seg = (campaign.targetSegment ?? "").toUpperCase();

  // Automation runner tags birthday campaigns with templateId = "auto:BIRTHDAY"
  if (tid === "auto:birthday")  return true;
  // Manual campaign using the "aniversariantes" template
  if (tid === "aniversariantes") return true;
  // Objective or segment explicitly identifies birthday
  if (obj === "BIRTHDAY")        return true;
  if (seg === "ANIVERSARIANTES" || seg === "BIRTHDAY") return true;
  return false;
}
