/**
 * BrainGovernancePolicy — pure risk/approval rules of the Brain Director.
 *
 * Iron rules:
 *  • agents never mutate the Brain directly — an AGENT-submitted request is at
 *    least MEDIUM risk and always needs human approval;
 *  • engine routing and quality-gate changes are HIGH by default (they shape how
 *    everything else thinks/ships);
 *  • anything aimed at PRODUCTION requires the Quality Gate;
 *  • HIGH/CRITICAL always requires human approval (in v1, EVERY request does —
 *    there is no auto-approval path at all).
 */

import type { BrainChangeRequestInput, BrainChangeRequest, BrainChangeRisk } from "./BrainChangeRequest";

export function classifyChangeRisk(input: BrainChangeRequestInput): BrainChangeRisk {
  if (input.runtimeImpact === "PRODUCTION") return "CRITICAL";
  if (input.target === "AI_ENGINE_ROUTING" || input.target === "QUALITY_GATE") return "HIGH";
  if (input.target === "KNOWLEDGE_SCHEMA" || input.target === "AGENT_POLICY") return "MEDIUM";
  if (input.requestedBy === "AGENT") return "MEDIUM"; // agents never produce LOW-risk structural change
  return "LOW";
}

export function requiresQualityGate(input: BrainChangeRequestInput & { riskLevel: BrainChangeRisk }): boolean {
  if (input.runtimeImpact === "PRODUCTION" || input.runtimeImpact === "TEST_VERSION_ONLY") return true;
  return input.riskLevel === "HIGH" || input.riskLevel === "CRITICAL";
}

/** v1: every change requires a human — there is NO auto-approval path. */
export function requiresHumanApproval(_request: BrainChangeRequest): boolean {
  return true;
}
