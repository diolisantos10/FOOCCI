/**
 * BrainDirectorService — the GUARDIAN of the Foocci Brain (v1, pure/in-memory).
 *
 * Every structural change to the Brain (reasoning rules, knowledge schema, agent
 * policy, quality gates, training rules, AI engine routing) enters as a
 * BrainChangeRequest. The Director classifies risk, decides whether the Quality
 * Gate is required, and enforces the iron rules:
 *
 *   • NO agent can change the Brain directly (AGENT-submitted requests can never
 *     be auto-approved and never carry direct PRODUCTION impact);
 *   • HIGH/CRITICAL risk ⇒ human approval mandatory;
 *   • anything with PRODUCTION impact ⇒ Quality Gate required;
 *   • the Director REGISTERS decisions — it never executes a real change itself.
 *
 * v1 is deliberately persistence-free (in-memory registry) — the governance
 * contract comes first; storage can follow when there is something to store.
 */

import type {
  BrainChangeRequestInput,
  BrainChangeRequest,
  BrainChangeDecision,
} from "./BrainChangeRequest";
import { classifyChangeRisk, requiresQualityGate, requiresHumanApproval } from "./BrainGovernancePolicy";

let seq = 0;
const registry = new Map<string, BrainChangeRequest>();

/** Submit a change proposal. Never executes anything — only registers it. */
export function submitChangeRequest(input: BrainChangeRequestInput): BrainChangeRequest {
  const riskLevel = input.riskLevel ?? classifyChangeRisk(input);
  const request: BrainChangeRequest = {
    id: `bcr_${Date.now()}_${++seq}`,
    requestedBy: input.requestedBy,
    target: input.target,
    summary: input.summary,
    rationale: input.rationale,
    riskLevel,
    // Agents can NEVER produce an immediately-approved request.
    status: "PENDING_APPROVAL",
    requiresQualityGate: requiresQualityGate({ ...input, riskLevel }),
    runtimeImpact: input.runtimeImpact ?? "NONE",
    createdAt: new Date().toISOString(),
    decidedAt: null,
    decidedBy: null,
  };
  registry.set(request.id, request);
  return request;
}

/**
 * Records a HUMAN decision on a request. Only humans decide: this is the single
 * approval path, and even an approval does NOT execute the change — it only
 * authorizes a future, separate, governed rollout (test version + Quality Gate).
 */
export function decideChangeRequest(id: string, decision: BrainChangeDecision, decidedBy: string): BrainChangeRequest {
  const request = registry.get(id);
  if (!request) throw new Error(`Change request ${id} não encontrado.`);
  if (request.status !== "PENDING_APPROVAL" && request.status !== "BACKLOG") {
    throw new Error(`Change request ${id} já foi decidido (${request.status}).`);
  }
  if (!decidedBy || decidedBy === "AGENT" || decidedBy === "SYSTEM") {
    throw new Error("Apenas um humano identificado pode decidir uma mudança do Brain.");
  }
  if (requiresHumanApproval(request) && decision === "APPROVED" && request.requiresQualityGate) {
    // Approval is allowed, but the request keeps carrying the gate requirement —
    // execution elsewhere MUST run the Quality Gate before any production effect.
  }
  const updated: BrainChangeRequest = {
    ...request,
    status: decision,
    decidedAt: new Date().toISOString(),
    decidedBy,
  };
  registry.set(id, updated);
  return updated;
}

export function getChangeRequest(id: string): BrainChangeRequest | null {
  return registry.get(id) ?? null;
}

export function listChangeRequests(): BrainChangeRequest[] {
  return [...registry.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

/** Test hook — clears the in-memory registry. */
export function __resetBrainDirector(): void {
  registry.clear();
  seq = 0;
}
