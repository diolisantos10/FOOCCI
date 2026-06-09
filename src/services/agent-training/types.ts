// Shared types for the Agent Training Center.
// These mirror the Prisma model string-enum values as TypeScript types.

export type AgentType =
  | "WHATSAPP_ORDERING"
  | "WA_RECEPTIONIST"
  | "WA_WAITER"
  | "CRM"
  | "ANALYTICS";

export type TrainingRunStatus =
  | "QUEUED"
  | "RUNNING"
  | "COMPLETED"
  | "FAILED"
  | "CANCELLED";

export type TrainingSource =
  | "REAL_CONVERSATION"
  | "AI_SIMULATION"
  | "MIXED"
  | "REGRESSION";

export type TrainingMode =
  | "QUICK"
  | "REGRESSION"
  | "REAL_CONVERSATION_REPLAY"
  | "AI_SIMULATION_BATCH"
  | "NIGHTLY"
  | "CONTINUOUS";

export type ScenarioStatus = "PENDING" | "PASS" | "WARN" | "FAIL";

export type ProposalChangeType =
  | "PROMPT_PATCH"
  | "ROUTING_RULE"
  | "STATE_MACHINE_RULE"
  | "COPY_CHANGE"
  | "MENU_MATCHING_RULE"
  | "HANDOFF_RULE"
  | "CONFIG_CHANGE";

export type ProposalStatus =
  | "PENDING_APPROVAL"
  | "APPROVED"
  | "REJECTED"
  | "NEEDS_REVISION"
  | "APPLIED_TO_SANDBOX"
  | "APPLIED_TO_PRODUCTION";

export type BrainVersionStatus = "DRAFT" | "SANDBOX" | "ACTIVE" | "ARCHIVED";

export type RiskLevel = "LOW" | "MEDIUM" | "HIGH";

export type CustomerPersona =
  | "DIRECT"
  | "CONFUSED"
  | "IMPATIENT"
  | "POLITE"
  | "ANGRY"
  | "RECURRING"
  | "TYPO_HEAVY"
  | "CHANGING_MIND"
  | "PRICE_ASKER"
  | "DELIVERY_ASKER"
  | "HUMAN_ASKER"
  | "ABANDONING"
  | "UNAVAILABLE_ITEM"
  | "PAYMENT_FIRST"
  | "ADDRESS_FIRST";

export type ScenarioGoal =
  | "COMPLETE_ORDER"
  | "ASK_MENU_THEN_ORDER"
  | "ORDER_AMBIGUOUS"
  | "ADD_ITEM_MID_FLOW"
  | "REMOVE_PENDING_ITEM"
  | "CHANGE_QUANTITY"
  | "CANCEL_ORDER"
  | "CHOOSE_DELIVERY"
  | "CHOOSE_PICKUP"
  | "CHOOSE_PIX"
  | "CHOOSE_CASH"
  | "ASK_ATTENDANT"
  | "TEST_GREETING";

export interface TranscriptTurn {
  role:    "customer" | "bot";
  content: string;
  ts:      string; // ISO timestamp
  debug?:  Record<string, unknown>;
}

export interface EvaluationScores {
  conversionScore:     number; // 0-100
  clarityScore:        number;
  safetyScore:         number;
  frictionScore:       number;
  menuAccuracyScore:   number;
  orderCompletionScore: number;
  handoffScore:        number;
  overallScore:        number;
}

export interface ScenarioRunResult {
  transcript:          TranscriptTurn[];
  finalSession:        Record<string, unknown> | null;
  finalStage:          string;
  comanda:             Record<string, unknown> | null;
  sideEffectsPerformed: string[];
  status:              ScenarioStatus;
  score:               number | null;
  failureSummary:      string | null;
  actualOutcome:       Record<string, unknown>;
}

export interface GeneratedScenario {
  title:               string;
  customerPersona:     CustomerPersona;
  goal:                ScenarioGoal;
  messageSequence:     string[];
  expectedOutcome:     Record<string, unknown>;
  riskTags:            string[];
}
