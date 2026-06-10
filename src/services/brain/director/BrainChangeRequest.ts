/**
 * BrainChangeRequest — the unit of governance of the Foocci Brain.
 * Any structural change is proposed, classified, decided (by a HUMAN) and only
 * then executed elsewhere via the governed path (test version + Quality Gate).
 */

export type BrainChangeRequester = "CEO" | "AGENT" | "SYSTEM" | "TRAINING_CENTER";

export type BrainChangeTarget =
  | "REASONING_RULE"
  | "KNOWLEDGE_SCHEMA"
  | "AGENT_POLICY"
  | "QUALITY_GATE"
  | "TRAINING_RULE"
  | "AI_ENGINE_ROUTING";

export type BrainChangeRisk = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
export type BrainChangeStatus = "DRAFT" | "PENDING_APPROVAL" | "APPROVED" | "REJECTED" | "BACKLOG";
export type BrainChangeDecision = "APPROVED" | "REJECTED" | "BACKLOG";
export type BrainRuntimeImpact = "NONE" | "TEST_VERSION_ONLY" | "PRODUCTION";

export interface BrainChangeRequestInput {
  requestedBy: BrainChangeRequester;
  target: BrainChangeTarget;
  summary: string;
  rationale: string;
  riskLevel?: BrainChangeRisk;
  runtimeImpact?: BrainRuntimeImpact;
}

export interface BrainChangeRequest {
  id: string;
  requestedBy: BrainChangeRequester;
  target: BrainChangeTarget;
  summary: string;
  rationale: string;
  riskLevel: BrainChangeRisk;
  status: BrainChangeStatus;
  requiresQualityGate: boolean;
  runtimeImpact: BrainRuntimeImpact;
  createdAt: string;
  decidedAt: string | null;
  decidedBy: string | null;
}
