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

/** Provider that actually delivers the WhatsApp message. */
export type CRMProviderMode = "EVOLUTION_WEB" | "META_CLOUD";

/** How the daily/cycle budget is split across the active campaigns. */
export type CRMBudgetDistributionMode = "EQUAL" | "PRIORITY" | "MANUAL";

/**
 * Restaurant-level WhatsApp sending budget + orchestration.
 *
 * This is the global safety budget that keeps the WhatsApp number from freezing
 * or being blocked while sends still ride the Evolution Web / WhatsApp Web bridge.
 * It governs how the daily ceiling is shared across all active campaigns and how
 * many messages the whole CRM may send per scheduler cycle (cron run).
 *
 * A "cycle" is one CRM scheduler/cron execution. In Evolution Web mode the cycle
 * limit is the TOTAL across all campaigns in that run — not per campaign.
 */
export interface CRMWhatsAppBudgetConfig {
  /** Master switch for the global budget orchestration. When off, legacy per-campaign behavior applies. */
  enabled: boolean;
  /** Active delivery provider. Evolution Web rides a real WhatsApp-Web session and needs tight limits. */
  providerMode: CRMProviderMode;
  /** Max CRM messages the whole restaurant may send in a 24h window. 0 = no daily cap. Default 50 for Evolution Web. */
  globalDailyLimit: number;
  /** Max CRM messages the whole CRM may send in ONE scheduler cycle, shared across all campaigns. Default 5. */
  globalCycleLimit: number;
  /** Minimum minutes between two scheduler cycles. Default 10. */
  minMinutesBetweenCycles: number;
  /** How the daily budget is divided among active campaigns. */
  distributionMode: CRMBudgetDistributionMode;
  /** Stop all sends immediately when the WhatsApp instance is not connected. */
  stopOnInstanceDisconnected: boolean;
  /** Pause the rest of the cycle when the provider failure rate exceeds this percent. 0 = off. */
  pauseOnFailureRatePercent: number;
  /** Trip the circuit breaker after this many provider failures in a cycle. 0 = off. */
  maxConsecutiveProviderFailures: number;
}

export interface CRMWhatsAppSafetyConfig {
  /** Max CRM messages sent per 24-hour rolling window across ALL campaigns + automations. 0 = no cap. */
  dailyGlobalCap: number;
  /** OPTIONAL restaurant-wide weekly cap (7-day rolling) across ALL campaigns + automations. 0 = off. */
  weeklyGlobalCap: number;
  /**
   * PREPAID total allowance of UNIQUE contacts the CRM may ever message.
   * Counts distinct customers that have received at least one CRM send (lifetime).
   * 0 = off / unlimited. "Recharge" = raise this number in Settings. Does not reset.
   */
  contactBudgetTotal: number;
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
  /** Global WhatsApp sending budget + orchestration (daily/cycle limits, distribution, circuit breaker). */
  crmWhatsAppSafety: CRMWhatsAppBudgetConfig;
  /**
   * When FALSE (default) the anti-ban rules are LOCKED to safe values and the daily
   * limit follows the warmup ramp — the owner cannot raise them. When TRUE the owner
   * has explicitly taken manual control and the stored values are enforced as-is
   * (they accept the ban risk). Only the prepaid contact budget stays owner-set
   * either way — it is a cost limit, not an anti-ban rule.
   */
  manualOverride: boolean;
  /**
   * Monthly money budget (R$) for coupons the CRM auto-distributes. Each granted
   * coupon draws down its estimated cost (FIXED = value; PERCENTAGE = avg ticket ×
   * %; CUSTOM = its estimated cost). When the month's spend reaches this, coupons
   * stop being credited (messages still send). 0 = no budget / unlimited.
   */
  couponMonthlyBudget: number;
  /** Average order value used to estimate the cost of a percentage coupon. */
  couponAvgTicket: number;
}

export const DEFAULT_BUDGET_CONFIG: Readonly<CRMWhatsAppBudgetConfig> = {
  enabled:                        true,
  providerMode:                   "EVOLUTION_WEB",
  globalDailyLimit:               50, // Evolution Web default — keep the number safe
  globalCycleLimit:               5,  // total across ALL campaigns per cron run
  minMinutesBetweenCycles:        10,
  distributionMode:               "EQUAL",
  stopOnInstanceDisconnected:     true,
  pauseOnFailureRatePercent:      50,
  maxConsecutiveProviderFailures: 3,
};

export const DEFAULT_SAFETY_CONFIG: Readonly<CRMWhatsAppSafetyConfig> = {
  dailyGlobalCap:        200,
  weeklyGlobalCap:       0, // off by default — opt-in via Settings
  contactBudgetTotal:    0, // off by default — opt-in via Settings (prepaid unique-contacts balance)

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
  crmWhatsAppSafety:     DEFAULT_BUDGET_CONFIG,
  manualOverride:        false, // safe rules locked by default
  couponMonthlyBudget:   0,     // off by default — opt-in via CRM Configurações
  couponAvgTicket:       50,    // R$ — estimate for percentage-coupon cost
};

// ─── Parsing ──────────────────────────────────────────────────────────────────

export function parseBudgetConfig(raw: unknown): CRMWhatsAppBudgetConfig {
  const d = DEFAULT_BUDGET_CONFIG;
  if (!raw || typeof raw !== "object") return { ...d };
  const r = raw as Record<string, unknown>;
  const num = (v: unknown, fallback: number) => (typeof v === "number" && Number.isFinite(v) && v >= 0 ? v : fallback);
  const providerMode: CRMProviderMode =
    r.providerMode === "META_CLOUD" || r.providerMode === "EVOLUTION_WEB" ? r.providerMode : d.providerMode;
  const distributionMode: CRMBudgetDistributionMode =
    r.distributionMode === "EQUAL" || r.distributionMode === "PRIORITY" || r.distributionMode === "MANUAL"
      ? r.distributionMode
      : d.distributionMode;
  return {
    enabled:                        typeof r.enabled                    === "boolean" ? r.enabled : d.enabled,
    providerMode,
    globalDailyLimit:               num(r.globalDailyLimit,               d.globalDailyLimit),
    globalCycleLimit:               Math.max(1, num(r.globalCycleLimit,   d.globalCycleLimit)),
    minMinutesBetweenCycles:        num(r.minMinutesBetweenCycles,        d.minMinutesBetweenCycles),
    distributionMode,
    stopOnInstanceDisconnected:     typeof r.stopOnInstanceDisconnected === "boolean" ? r.stopOnInstanceDisconnected : d.stopOnInstanceDisconnected,
    pauseOnFailureRatePercent:      Math.min(100, num(r.pauseOnFailureRatePercent, d.pauseOnFailureRatePercent)),
    maxConsecutiveProviderFailures: num(r.maxConsecutiveProviderFailures, d.maxConsecutiveProviderFailures),
  };
}

export function parseSafetyConfig(raw: unknown): CRMWhatsAppSafetyConfig {
  const d = DEFAULT_SAFETY_CONFIG;
  if (!raw || typeof raw !== "object") return { ...d, crmWhatsAppSafety: { ...DEFAULT_BUDGET_CONFIG } };
  const r = raw as Record<string, unknown>;
  return {
    crmWhatsAppSafety:     parseBudgetConfig(r.crmWhatsAppSafety),
    dailyGlobalCap:        typeof r.dailyGlobalCap        === "number"  ? r.dailyGlobalCap        : d.dailyGlobalCap,
    weeklyGlobalCap:       typeof r.weeklyGlobalCap       === "number"  ? r.weeklyGlobalCap       : d.weeklyGlobalCap,
    contactBudgetTotal:    typeof r.contactBudgetTotal    === "number"  ? r.contactBudgetTotal    : d.contactBudgetTotal,
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
    manualOverride:        typeof r.manualOverride        === "boolean" ? r.manualOverride        : d.manualOverride,
    couponMonthlyBudget:   typeof r.couponMonthlyBudget   === "number"  ? r.couponMonthlyBudget   : d.couponMonthlyBudget,
    couponAvgTicket:       typeof r.couponAvgTicket       === "number" && r.couponAvgTicket > 0 ? r.couponAvgTicket : d.couponAvgTicket,
  };
}

// ─── Safe locked rules + warmup ramp ────────────────────────────────────────
// Safe-by-default: with manualOverride OFF the anti-ban rules below are FIXED and
// the daily limit follows the number's warmup age. The owner can only change them
// by turning manual override ON (taking responsibility for the ban risk).

/** Warmup steps: safe max CRM messages/day by WhatsApp number age (days connected). */
export const WARMUP_RAMP: ReadonlyArray<{ maxAgeDays: number; dailyLimit: number }> = [
  { maxAgeDays: 3,        dailyLimit: 20  },
  { maxAgeDays: 7,        dailyLimit: 40  },
  { maxAgeDays: 14,       dailyLimit: 80  },
  { maxAgeDays: 30,       dailyLimit: 150 },
  { maxAgeDays: Infinity, dailyLimit: 250 },
];

export function warmupDailyLimit(ageDays: number): number {
  for (const step of WARMUP_RAMP) if (ageDays <= step.maxAgeDays) return step.dailyLimit;
  return 250;
}

/** WhatsApp number age in days, from when its Evolution config was created. */
export async function getNumberAgeDays(restaurantId: string): Promise<number> {
  const cfg = await prisma.evolutionConfig.findUnique({
    where:  { restaurantId },
    select: { createdAt: true },
  });
  if (!cfg?.createdAt) return 0;
  return Math.max(0, Math.floor((Date.now() - cfg.createdAt.getTime()) / 86_400_000));
}

/**
 * Build the EFFECTIVE (enforced) safety config from the raw stored config + number age.
 * manualOverride ON → stored values as-is. OFF → safe locked rules + warmup daily limit.
 * The prepaid contact budget + timezone are always kept from the owner's config.
 */
export function applyEffectiveSafety(raw: CRMWhatsAppSafetyConfig, ageDays: number): CRMWhatsAppSafetyConfig {
  if (raw.manualOverride) return raw;
  const safeDaily = warmupDailyLimit(ageDays);
  return {
    ...raw,
    manualOverride:        false,
    dailyGlobalCap:        safeDaily,
    weeklyGlobalCap:       0,
    customerCooldownHours: 24,
    quietHoursEnabled:     true,
    quietHoursStart:       "21:00",
    quietHoursEnd:         "08:00",
    sendOnWeekends:        true,
    maxPerWeekPerCustomer: 5,
    randomDelayEnabled:    true,
    randomDelayMinSec:     5,
    randomDelayMaxSec:     45,
    crmWhatsAppSafety: {
      ...raw.crmWhatsAppSafety,
      enabled:                        true,
      globalDailyLimit:               safeDaily,
      globalCycleLimit:               5,
      minMinutesBetweenCycles:        10,
      stopOnInstanceDisconnected:     true,
      pauseOnFailureRatePercent:      50,
      maxConsecutiveProviderFailures: 3,
    },
  };
}

// ─── DB helpers ───────────────────────────────────────────────────────────────

/**
 * EFFECTIVE safety config used by ALL enforcement (runner, planner, capacity, etc.).
 * Safe-by-default: locked rules + warmup daily limit unless the owner turned manual
 * override ON. This is the single choke point that keeps the number protected.
 */
export async function getSafetyConfig(restaurantId: string): Promise<CRMWhatsAppSafetyConfig> {
  const [profile, ageDays] = await Promise.all([
    prisma.restaurantCRMProfile.findUnique({
      where:  { restaurantId },
      select: { whatsAppSafetyConfig: true },
    }),
    getNumberAgeDays(restaurantId),
  ]);
  return applyEffectiveSafety(parseSafetyConfig(profile?.whatsAppSafetyConfig), ageDays);
}

/**
 * RAW stored config (owner's manual values + override toggle state) — for the
 * Settings UI. Never use this for enforcement; use getSafetyConfig instead.
 */
export async function getRawSafetyConfig(restaurantId: string): Promise<CRMWhatsAppSafetyConfig> {
  const profile = await prisma.restaurantCRMProfile.findUnique({
    where:  { restaurantId },
    select: { whatsAppSafetyConfig: true },
  });
  return parseSafetyConfig(profile?.whatsAppSafetyConfig);
}

/**
 * How many DISTINCT contacts the CRM has already messaged (lifetime), across all
 * campaigns + automations. This is what the prepaid contact budget consumes.
 */
export async function getConsumedContactCount(restaurantId: string): Promise<number> {
  const rows = await prisma.campaignExecution.findMany({
    where:    { restaurantId, status: { in: ["SENT", "DELIVERED", "READ"] } },
    select:   { customerId: true },
    distinct: ["customerId"],
  });
  return rows.length;
}

export interface ContactBudgetStatus {
  /** Prepaid total set by the owner. 0 = off/unlimited. */
  total: number;
  /** Distinct contacts already messaged (lifetime). */
  used: number;
  /** total - used, floored at 0. Infinity when the budget is off (total = 0). */
  remaining: number;
  /** Whether the prepaid budget is active (total > 0). */
  enabled: boolean;
}

/**
 * Live prepaid contact-budget status for the Settings tab and campaign config.
 * `remaining` is the "saldo" shown to the user.
 */
export async function getContactBudgetStatus(restaurantId: string): Promise<ContactBudgetStatus> {
  const cfg = await getSafetyConfig(restaurantId);
  const total = Math.max(0, Math.floor(cfg.contactBudgetTotal || 0));
  if (total <= 0) {
    return { total: 0, used: await getConsumedContactCount(restaurantId), remaining: Infinity, enabled: false };
  }
  const used = await getConsumedContactCount(restaurantId);
  return { total, used, remaining: Math.max(0, total - used), enabled: true };
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

/**
 * Total CRM messages successfully sent in the last 7 days for this restaurant,
 * across ALL campaigns and automations (for the optional weekly restaurant cap).
 */
export async function getWeekGlobalSendCount(restaurantId: string): Promise<number> {
  const cutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
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
