/**
 * CRMPreflightDiagnosisService — answers, BEFORE sending, "who gets reached, who
 * is left out, and why". Pure core (`diagnosePreflight`) so it is fully testable;
 * a thin DB orchestrator (`buildPreflightForCampaign`) feeds it real data.
 *
 * It never sends and never mutates anything.
 */

import { prisma } from "@/lib/prisma";
import { getSafetyConfig } from "@/lib/crm-safety";
import { resolveAudience } from "./CrmCampaignService";
import { readDedupePolicy, readOverridePolicy } from "./crmDedupePolicy";
import { generateMessageFingerprint } from "./messageFingerprint";
import { getImpactedByCampaign, getImpactedByConcept, getImpactedByMessage } from "./CRMContactLedgerService";

export interface PreflightCustomer {
  id: string;
  phone: string | null;
  hasOptedOut?: boolean;
}

export interface PreflightInput {
  customers: PreflightCustomer[];
  impactedByCampaign: Set<string>;
  impactedByConcept: Set<string>;
  impactedByMessage: Set<string>;
  dedupeByConcept: boolean;
  dedupeByMessage: boolean;
  allowResendToImpacted: boolean;
  /** Customers currently at the per-customer weekly cap. */
  weeklyCappedIds?: Set<string>;
  /** -1 = unlimited. Restaurant remaining budget today. */
  globalDailyRemaining: number;
  /** Remaining of the campaign's own daily limit. */
  campaignDailyRemaining: number;
  /** Birthday/priority override of the weekly per-customer cap. */
  allowWeeklyOverride: boolean;
}

export interface PreflightDiagnosis {
  audienceTotal: number;
  eligibleNow: number;
  forecastSendToday: number;
  blocked: {
    optOut: number;
    invalidPhone: number;
    weeklyLimit: number;
    alreadyImpactedCampaign: number;
    alreadyImpactedConcept: number;
    duplicateMessage: number;
    globalCap: number;
    campaignCap: number;
  };
  overrideWeeklyLimitUsed: number;
  warnings: string[];
  recommendations: string[];
  canSendNow: boolean;
}

/** PURE — classifies each customer with the same precedence as the runtime. */
export function diagnosePreflight(input: PreflightInput): PreflightDiagnosis {
  const weeklyCapped = input.weeklyCappedIds ?? new Set<string>();
  const b = { optOut: 0, invalidPhone: 0, weeklyLimit: 0, alreadyImpactedCampaign: 0, alreadyImpactedConcept: 0, duplicateMessage: 0, globalCap: 0, campaignCap: 0 };
  let eligible = 0;
  let overrideUsed = 0;

  for (const c of input.customers) {
    if (!c.phone || !c.phone.trim()) { b.invalidPhone++; continue; }
    if (c.hasOptedOut) { b.optOut++; continue; }
    if (!input.allowResendToImpacted && input.impactedByCampaign.has(c.id)) { b.alreadyImpactedCampaign++; continue; }
    if (!input.allowResendToImpacted && input.dedupeByConcept && input.impactedByConcept.has(c.id)) { b.alreadyImpactedConcept++; continue; }
    if (!input.allowResendToImpacted && input.dedupeByMessage && input.impactedByMessage.has(c.id)) { b.duplicateMessage++; continue; }
    if (weeklyCapped.has(c.id)) {
      if (input.allowWeeklyOverride) { overrideUsed++; /* still eligible */ }
      else { b.weeklyLimit++; continue; }
    }
    eligible++;
  }

  // Forecast today = eligible capped by remaining global + campaign budgets.
  const globalRemain = input.globalDailyRemaining < 0 ? Number.POSITIVE_INFINITY : input.globalDailyRemaining;
  const campaignRemain = Math.max(0, input.campaignDailyRemaining);
  const forecast = Math.max(0, Math.min(eligible, globalRemain, campaignRemain));
  // Eligible that won't be served today because of caps.
  b.globalCap = globalRemain === Number.POSITIVE_INFINITY ? 0 : Math.max(0, eligible - input.globalDailyRemaining);
  b.campaignCap = Math.max(0, eligible - campaignRemain);

  const warnings: string[] = [];
  const recommendations: string[] = [];
  if (b.alreadyImpactedConcept > 0) warnings.push(`${b.alreadyImpactedConcept} cliente(s) já foram impactados por este conceito e não serão reenviados.`);
  if (b.duplicateMessage > 0) warnings.push(`${b.duplicateMessage} cliente(s) já receberam uma mensagem muito parecida recentemente.`);
  if (b.weeklyLimit > 0) {
    warnings.push(`${b.weeklyLimit} cliente(s) bloqueados pelo limite semanal por cliente.`);
    if (!input.allowWeeklyOverride) recommendations.push("Para campanha importante (ex.: aniversário), ative o envio prioritário acima do limite semanal.");
  }
  if (b.globalCap > 0) {
    warnings.push(`${b.globalCap} cliente(s) podem ficar de fora hoje pelo orçamento global do restaurante.`);
    recommendations.push("Aumente o cap diário/semanal global ou reduza campanhas concorrentes.");
  }
  if (overrideUsed > 0) warnings.push(`Envio prioritário em uso: ${overrideUsed} cliente(s) acima do limite semanal.`);
  if (eligible === 0) recommendations.push("Nenhum cliente elegível agora — verifique segmento, dedupe e limites.");

  return {
    audienceTotal: input.customers.length,
    eligibleNow: eligible,
    forecastSendToday: forecast,
    blocked: b,
    overrideWeeklyLimitUsed: overrideUsed,
    warnings,
    recommendations,
    canSendNow: forecast > 0,
  };
}

/** DB orchestrator — loads the data and runs the pure diagnosis for a campaign. */
export async function buildPreflightForCampaign(campaignId: string): Promise<PreflightDiagnosis | null> {
  const campaign = await prisma.campaign.findUnique({
    where: { id: campaignId },
    select: {
      id: true, restaurantId: true, message: true, targetSegment: true, templateId: true,
      campaignFamilyKey: true, messageFingerprint: true, dedupePolicy: true, scheduleConfig: true,
    },
  });
  if (!campaign) return null;

  const dedupe = readDedupePolicy(campaign.dedupePolicy);
  const override = readOverridePolicy(campaign.scheduleConfig);
  const fingerprint = campaign.messageFingerprint || generateMessageFingerprint(campaign.message);
  const familyKey = campaign.campaignFamilyKey ?? "";

  const audience = await resolveAudience(campaign.restaurantId, campaign.targetSegment ?? "", campaign.templateId ?? undefined).catch(() => []);
  const customers: PreflightCustomer[] = audience.map((c: { id: string; phone?: string | null }) => ({ id: c.id, phone: c.phone ?? null }));

  // Opt-out set.
  const optedOut = new Set(
    (await prisma.customer.findMany({ where: { id: { in: customers.map((c) => c.id) }, hasOptedOut: true }, select: { id: true } })).map((c) => c.id),
  );
  for (const c of customers) if (optedOut.has(c.id)) c.hasOptedOut = true;

  const [impactedByCampaign, impactedByConcept, impactedByMessage, safety, globalConsumed, sent24h] = await Promise.all([
    getImpactedByCampaign(campaign.restaurantId, campaign.id),
    familyKey ? getImpactedByConcept(campaign.restaurantId, familyKey, dedupe.dedupeWindowDays) : Promise.resolve(new Set<string>()),
    fingerprint ? getImpactedByMessage(campaign.restaurantId, fingerprint, dedupe.dedupeWindowDays) : Promise.resolve(new Set<string>()),
    getSafetyConfig(campaign.restaurantId),
    prisma.campaignExecution.count({ where: { restaurantId: campaign.restaurantId, status: { in: ["SENT", "DELIVERED", "READ"] }, sentAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) } } }),
    prisma.campaignExecution.count({ where: { campaignId: campaign.id, status: { in: ["SENT", "DELIVERED", "READ"] }, sentAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) } } }),
  ]);

  const cfg = campaign.scheduleConfig as { dailyLimit?: number } | null;
  const dailyLimit = Math.max(1, Math.min(cfg?.dailyLimit ?? 20, 200));

  return diagnosePreflight({
    customers,
    impactedByCampaign,
    impactedByConcept,
    impactedByMessage,
    dedupeByConcept: dedupe.dedupeByConcept,
    dedupeByMessage: dedupe.dedupeByMessage,
    allowResendToImpacted: dedupe.allowResendToImpacted,
    globalDailyRemaining: safety.dailyGlobalCap === 0 ? -1 : Math.max(0, safety.dailyGlobalCap - globalConsumed),
    campaignDailyRemaining: Math.max(0, dailyLimit - sent24h),
    allowWeeklyOverride: override.allowWeeklyCustomerCapOverride,
  });
}
