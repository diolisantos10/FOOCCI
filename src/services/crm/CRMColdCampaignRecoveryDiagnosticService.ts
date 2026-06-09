/**
 * CRMColdCampaignRecoveryDiagnosticService — finds the old "cold customer
 * recovery" campaigns, separates real failures from safety blocks, and reports
 * what is already impacted (so a new campaign can be prepared safely).
 *
 * Read-only. Never sends, never mutates a campaign.
 */

import { prisma } from "@/lib/prisma";
import { classifyExecution } from "./crmExecutionClassification";
import { resolveAudience } from "./CrmCampaignService";
import { suggestCampaignFamilyKey, generateMessageFingerprint } from "./messageFingerprint";
import { getImpactedByConcept, getImpactedByMessage } from "./CRMContactLedgerService";

const COLD_NAME_RE = /fri[oa]s?|recuper|reativ/i;
const SENT_STATUSES = ["SENT", "DELIVERED", "READ"] as const;

/**
 * Cron-safe, GLOBAL, read-only scan of cold campaigns across ALL restaurants.
 * Returns ONLY campaign metadata + counts (no message text, no customer PII) so
 * it can run from a CRON_SECRET diagnostic without an admin secret.
 */
export interface ColdCampaignSummary {
  campaignId: string;
  restaurantId: string;
  name: string;
  status: string;
  targetSegment: string | null;
  campaignFamilyKey: string | null;
  hasFingerprint: boolean;
  suggestedFamilyKey: string;
  sentExecutions: number;
  blockedSafety: number;
  failedProvider: number;
  weeklyCapBlocks: number;
  alreadyInLedger: number;
}

export interface ColdRecoveryGlobal {
  candidates: ColdCampaignSummary[];
  totals: { campaigns: number; sentExecutions: number; alreadyInLedger: number; wouldBackfill: number };
  recommendedFamilyKey: string;
}

export async function diagnoseColdRecoveryGlobal(): Promise<ColdRecoveryGlobal> {
  const all = await prisma.campaign.findMany({
    orderBy: { createdAt: "desc" },
    select: {
      id: true, restaurantId: true, name: true, status: true, targetSegment: true, templateId: true,
      campaignFamilyKey: true, messageFingerprint: true,
    },
  });
  const cold = all.filter(
    (c) => COLD_NAME_RE.test(c.name) || (c.targetSegment ?? "").toLowerCase().includes("frio") || (c.templateId ?? "").includes("recuperar-frios"),
  );

  const candidates: ColdCampaignSummary[] = [];
  for (const c of cold) {
    const [groups, sentCount, ledgerCount] = await Promise.all([
      prisma.campaignExecution.groupBy({
        by: ["status", "failedReason", "errorMessage"],
        where: { campaignId: c.id, status: { in: ["BLOCKED", "FAILED"] as never[] } },
        _count: { id: true },
      }),
      prisma.campaignExecution.count({ where: { campaignId: c.id, status: { in: [...SENT_STATUSES] } } }),
      prisma.cRMContactLedger.count({ where: { campaignId: c.id, status: "SENT" } }),
    ]);
    let blockedSafety = 0, failedProvider = 0, weeklyCapBlocks = 0;
    for (const g of groups) {
      const cat = classifyExecution({ status: g.status, failedReason: g.failedReason, errorMessage: g.errorMessage });
      if (cat.kind === "BLOCKED") { blockedSafety += g._count.id; if (cat.category === "BLOCKED_WEEKLY_LIMIT") weeklyCapBlocks += g._count.id; }
      else if (cat.kind === "FAILED") failedProvider += g._count.id;
    }
    candidates.push({
      campaignId: c.id, restaurantId: c.restaurantId, name: c.name, status: c.status, targetSegment: c.targetSegment,
      campaignFamilyKey: c.campaignFamilyKey, hasFingerprint: !!c.messageFingerprint,
      suggestedFamilyKey: c.campaignFamilyKey || suggestCampaignFamilyKey({ name: c.name }),
      sentExecutions: sentCount, blockedSafety, failedProvider, weeklyCapBlocks, alreadyInLedger: ledgerCount,
    });
  }

  const totals = candidates.reduce(
    (acc, c) => ({
      campaigns: acc.campaigns + 1,
      sentExecutions: acc.sentExecutions + c.sentExecutions,
      alreadyInLedger: acc.alreadyInLedger + c.alreadyInLedger,
      wouldBackfill: acc.wouldBackfill + Math.max(0, c.sentExecutions - c.alreadyInLedger),
    }),
    { campaigns: 0, sentExecutions: 0, alreadyInLedger: 0, wouldBackfill: 0 },
  );

  return {
    candidates,
    totals,
    recommendedFamilyKey: candidates.find((c) => c.campaignFamilyKey)?.campaignFamilyKey || "reativacao-frios",
  };
}

export interface ColdCampaignCandidate {
  campaignId: string;
  name: string;
  status: string;
  targetSegment: string | null;
  campaignFamilyKey: string | null;
  messageFingerprint: string | null;
  suggestedFamilyKey: string;
  executions: { sent: number; blockedSafety: number; failedProvider: number; weeklyCapBlocks: number };
}

export interface ColdRecoveryDiagnosis {
  restaurantId: string;
  candidates: ColdCampaignCandidate[];
  recommendedFamilyKey: string;
  alreadyImpactedByConcept: number;
  alreadyImpactedByMessage: number;
  eligibleNow: number;
  notes: string[];
}

export async function diagnoseColdRecovery(restaurantId: string): Promise<ColdRecoveryDiagnosis> {
  const all = await prisma.campaign.findMany({
    where: { restaurantId },
    orderBy: { createdAt: "desc" },
    select: {
      id: true, name: true, status: true, targetSegment: true, templateId: true,
      message: true, campaignFamilyKey: true, messageFingerprint: true,
    },
  });

  const cold = all.filter(
    (c) => COLD_NAME_RE.test(c.name) || (c.targetSegment ?? "").toLowerCase().includes("frio") || (c.templateId ?? "").includes("recuperar-frios"),
  );

  const candidates: ColdCampaignCandidate[] = [];
  for (const c of cold) {
    const groups = await prisma.campaignExecution.groupBy({
      by: ["status", "failedReason", "errorMessage"],
      where: { campaignId: c.id, status: { in: ["SENT", "DELIVERED", "READ", "BLOCKED", "FAILED"] as never[] } },
      _count: { id: true },
    });
    let sent = 0, blockedSafety = 0, failedProvider = 0, weeklyCapBlocks = 0;
    for (const g of groups) {
      const cat = classifyExecution({ status: g.status, failedReason: g.failedReason, errorMessage: g.errorMessage });
      if (cat.kind === "SENT") sent += g._count.id;
      else if (cat.kind === "BLOCKED") { blockedSafety += g._count.id; if (cat.category === "BLOCKED_WEEKLY_LIMIT") weeklyCapBlocks += g._count.id; }
      else if (cat.kind === "FAILED") failedProvider += g._count.id;
    }
    candidates.push({
      campaignId: c.id, name: c.name, status: c.status, targetSegment: c.targetSegment,
      campaignFamilyKey: c.campaignFamilyKey, messageFingerprint: c.messageFingerprint,
      suggestedFamilyKey: c.campaignFamilyKey || suggestCampaignFamilyKey({ name: c.name }),
      executions: { sent, blockedSafety, failedProvider, weeklyCapBlocks },
    });
  }

  // Recommended stable concept key for the new campaign.
  const recommendedFamilyKey = candidates.find((c) => c.campaignFamilyKey)?.campaignFamilyKey || "reativacao-frios";

  // Impact already recorded in the ledger for this concept.
  const refMessage = cold.find((c) => c.message)?.message ?? "";
  const refFingerprint = cold.find((c) => c.messageFingerprint)?.messageFingerprint || (refMessage ? generateMessageFingerprint(refMessage) : "");
  const [impConcept, impMessage] = await Promise.all([
    getImpactedByConcept(restaurantId, recommendedFamilyKey, 60),
    refFingerprint ? getImpactedByMessage(restaurantId, refFingerprint, 60) : Promise.resolve(new Set<string>()),
  ]);

  // Eligible-now estimate for the cold segment.
  const coldSegment = cold.find((c) => (c.targetSegment ?? "").toLowerCase().includes("frio"))?.targetSegment ?? "FRIO";
  const audience = await resolveAudience(restaurantId, coldSegment, undefined).catch(() => []);
  const impactedUnion = new Set([...impConcept, ...impMessage]);
  const eligibleNow = audience.filter((a: { id: string }) => !impactedUnion.has(a.id)).length;

  const notes: string[] = [];
  if (candidates.length === 0) notes.push("Nenhuma campanha de frios encontrada — comece a proteção daqui para frente.");
  if (impConcept.size === 0 && impMessage.size === 0) notes.push("Ledger ainda não tem impacto histórico deste conceito — rode o backfill antes de apagar a campanha antiga.");

  return {
    restaurantId,
    candidates,
    recommendedFamilyKey,
    alreadyImpactedByConcept: impConcept.size,
    alreadyImpactedByMessage: impMessage.size,
    eligibleNow,
    notes,
  };
}
