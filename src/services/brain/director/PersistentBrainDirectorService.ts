/**
 * PersistentBrainDirectorService — the Brain Director with durable governance.
 *
 * Iron rules (enforced here, on top of BrainGovernancePolicy):
 *  • AGENT/SYSTEM can never create an already-approved request — everything
 *    enters as PENDING_APPROVAL (or DRAFT), never APPROVED;
 *  • HIGH/CRITICAL risk requires a HUMAN decision (AGENT/SYSTEM identities are
 *    rejected as reviewers — v1 actually requires a human for EVERY decision);
 *  • runtimeImpact PRODUCTION forces requiresQualityGate=true;
 *  • approve() ONLY flips status to APPROVED — it never applies a change;
 *    applying is a separate, governed flow (test version + Quality Gate);
 *  • every decision records reviewedBy / reviewedAt / decisionReason;
 *  • history is preserved — records are never deleted.
 */

import type {
  BrainChangeRequester,
  BrainChangeTarget,
  BrainChangeRisk,
  BrainRuntimeImpact,
} from "./BrainChangeRequest";
import { classifyChangeRisk, requiresQualityGate } from "./BrainGovernancePolicy";
import {
  insertChangeRequest,
  findChangeRequest,
  updateChangeRequest,
  listChangeRequestRows,
  countRiskSummary,
  type BrainChangeRequestRow,
  type RiskSummaryCounts,
} from "./BrainDirectorRepository";

const REQUESTERS: BrainChangeRequester[] = ["CEO", "AGENT", "SYSTEM", "TRAINING_CENTER", "BRAIN_DIRECTOR"];
const TARGETS: BrainChangeTarget[] = [
  "REASONING_RULE", "KNOWLEDGE_SCHEMA", "AGENT_POLICY", "QUALITY_GATE", "TRAINING_RULE",
  "AI_ENGINE_ROUTING", "KNOWLEDGE_BASE", "SIMULATION_RULE", "EVIDENCE_RULE",
];
const RISKS: BrainChangeRisk[] = ["LOW", "MEDIUM", "HIGH", "CRITICAL"];
const IMPACTS: BrainRuntimeImpact[] = ["NONE", "TEST_VERSION_ONLY", "PRODUCTION"];
const NON_HUMAN_REVIEWERS = /^(agent|system|bot|ai)$/i;

export interface CreateChangeRequestInput {
  businessId?: string | null;
  businessType?: "RESTAURANT" | "AGENCY" | "GENERIC";
  requestedByType: BrainChangeRequester;
  requestedById?: string | null;
  target: BrainChangeTarget;
  summary: string;
  rationale: string;
  proposedChange?: Record<string, unknown> | null;
  riskLevel?: BrainChangeRisk;
  runtimeImpact?: BrainRuntimeImpact;
  metadata?: Record<string, unknown> | null;
}

export async function createChangeRequest(input: CreateChangeRequestInput): Promise<BrainChangeRequestRow> {
  if (!REQUESTERS.includes(input.requestedByType)) throw new Error(`requestedByType inválido: ${input.requestedByType}`);
  if (!TARGETS.includes(input.target)) throw new Error(`target inválido: ${input.target}`);
  if (!input.summary?.trim() || !input.rationale?.trim()) throw new Error("summary e rationale são obrigatórios.");

  const runtimeImpact: BrainRuntimeImpact = input.runtimeImpact && IMPACTS.includes(input.runtimeImpact) ? input.runtimeImpact : "NONE";
  const riskLevel: BrainChangeRisk =
    input.riskLevel && RISKS.includes(input.riskLevel)
      ? input.riskLevel
      : classifyChangeRisk({ requestedBy: input.requestedByType === "BRAIN_DIRECTOR" ? "CEO" : input.requestedByType, target: legacyTarget(input.target), summary: input.summary, rationale: input.rationale, runtimeImpact });

  // PRODUCTION impact always escalates risk and forces the gate.
  const finalRisk: BrainChangeRisk = runtimeImpact === "PRODUCTION" ? "CRITICAL" : riskLevel;
  const gate =
    runtimeImpact === "PRODUCTION" ||
    requiresQualityGate({ requestedBy: input.requestedByType === "BRAIN_DIRECTOR" ? "CEO" : input.requestedByType, target: legacyTarget(input.target), summary: input.summary, rationale: input.rationale, runtimeImpact, riskLevel: finalRisk });

  // NOBODY enters approved — least of all agents/systems.
  return insertChangeRequest({
    businessId: input.businessId ?? null,
    businessType: input.businessType ?? "RESTAURANT",
    requestedByType: input.requestedByType,
    requestedById: input.requestedById ?? null,
    target: input.target,
    summary: input.summary.slice(0, 300),
    rationale: input.rationale.slice(0, 2000),
    proposedChange: (input.proposedChange ?? undefined) as never,
    riskLevel: finalRisk,
    status: "PENDING_APPROVAL",
    requiresQualityGate: gate,
    runtimeImpact,
    metadata: (input.metadata ?? undefined) as never,
  });
}

/** The new targets map onto the legacy policy categories for risk purposes. */
function legacyTarget(t: BrainChangeTarget): "REASONING_RULE" | "KNOWLEDGE_SCHEMA" | "AGENT_POLICY" | "QUALITY_GATE" | "TRAINING_RULE" | "AI_ENGINE_ROUTING" {
  if (t === "KNOWLEDGE_BASE") return "KNOWLEDGE_SCHEMA";
  if (t === "SIMULATION_RULE" || t === "EVIDENCE_RULE") return "TRAINING_RULE";
  return t;
}

export type ReviewAction = "APPROVED" | "REJECTED" | "BACKLOG";

export interface ReviewInput {
  id: string;
  action: ReviewAction;
  reviewedBy: string;
  decisionReason?: string | null;
}

/**
 * Records a HUMAN decision. Approving NEVER applies the change — real changes
 * still require a test version + Quality Gate + manual activation elsewhere.
 */
export async function reviewChangeRequest(input: ReviewInput): Promise<BrainChangeRequestRow> {
  const request = await findChangeRequest(input.id);
  if (!request) throw new Error(`Change request ${input.id} não encontrado.`);
  if (request.status !== "PENDING_APPROVAL" && request.status !== "BACKLOG" && request.status !== "DRAFT") {
    throw new Error(`Change request já decidido (${request.status}).`);
  }
  const reviewer = input.reviewedBy?.trim();
  if (!reviewer || NON_HUMAN_REVIEWERS.test(reviewer)) {
    throw new Error("Apenas um humano identificado pode decidir uma mudança do Brain.");
  }
  if (!["APPROVED", "REJECTED", "BACKLOG"].includes(input.action)) {
    throw new Error(`Ação inválida: ${input.action}`);
  }
  return updateChangeRequest(input.id, {
    status: input.action,
    reviewedBy: reviewer,
    reviewedAt: new Date(),
    decisionReason: input.decisionReason?.slice(0, 500) ?? null,
  });
}

export const approve = (id: string, reviewedBy: string, reason?: string) =>
  reviewChangeRequest({ id, action: "APPROVED", reviewedBy, decisionReason: reason });
export const reject = (id: string, reviewedBy: string, reason?: string) =>
  reviewChangeRequest({ id, action: "REJECTED", reviewedBy, decisionReason: reason });
export const backlog = (id: string, reviewedBy: string, reason?: string) =>
  reviewChangeRequest({ id, action: "BACKLOG", reviewedBy, decisionReason: reason });

/** Lifecycle bookkeeping for changes applied/rolled back ELSEWHERE (governed flow). */
export async function markApplied(id: string, appliedBy: string): Promise<BrainChangeRequestRow> {
  const request = await findChangeRequest(id);
  if (!request) throw new Error(`Change request ${id} não encontrado.`);
  if (request.status !== "APPROVED") throw new Error("Só uma mudança APPROVED pode ser marcada como aplicada.");
  return updateChangeRequest(id, { status: "APPLIED", decisionReason: `Aplicada por ${appliedBy} via fluxo governado.` });
}

export async function markRolledBack(id: string, rolledBackBy: string, reason?: string): Promise<BrainChangeRequestRow> {
  const request = await findChangeRequest(id);
  if (!request) throw new Error(`Change request ${id} não encontrado.`);
  if (request.status !== "APPLIED") throw new Error("Só uma mudança APPLIED pode ser revertida.");
  return updateChangeRequest(id, { status: "ROLLED_BACK", decisionReason: reason?.slice(0, 500) ?? `Revertida por ${rolledBackBy}.` });
}

export async function listChangeRequests(params: { status?: string; limit?: number } = {}) {
  return listChangeRequestRows(params);
}

export interface RiskSummary extends RiskSummaryCounts {
  runtimeTouched: false;
}

export async function getRiskSummary(): Promise<RiskSummary> {
  const counts = await countRiskSummary();
  return { ...counts, runtimeTouched: false };
}
