/**
 * opportunityBuilder — generic factory for review-ready opportunities.
 *
 * The Lab NEVER fixes anything itself. It only proposes: every opportunity starts
 * as PENDING_REVIEW so a human (Diego) approves / rejects / backlogs it.
 */

import type { EvaluatedScenario, SimulationOpportunity, OpportunityType, Severity } from "./types";

export interface OpportunitySeed {
  type: OpportunityType;
  severity?: Severity;
  title: string;
  summary: string;
  evidence?: string[];
  recommendation: string;
  expectedImpact?: string;
}

/** Builds a normalized opportunity (always PENDING_REVIEW) from a scenario + seed. */
export function makeOpportunity(evaluated: EvaluatedScenario, seed: OpportunitySeed): SimulationOpportunity {
  return {
    scenarioKey: evaluated.scenario.scenarioKey,
    type: seed.type,
    severity: seed.severity ?? evaluated.evaluation.severity,
    title: seed.title,
    summary: seed.summary,
    evidence: seed.evidence ?? evaluated.evaluation.evidence,
    recommendation: seed.recommendation,
    expectedImpact: seed.expectedImpact ?? "A definir (revisão humana).",
    status: "PENDING_REVIEW",
  };
}
