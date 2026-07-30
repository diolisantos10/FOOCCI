/**
 * Agent Simulation Lab — shared types (generic, reusable across agents).
 *
 * The Lab simulates artificial customers interacting with an agent in a SAFE,
 * dry-run environment. It can test, diagnose and SUGGEST — never change
 * production. Every type below is provider-agnostic so the same core can later
 * drive Waiter, WhatsApp, CRM, Analytics and future agents.
 */

export type SimulationMode = "MANUAL" | "CRON" | "DIAGNOSTIC";
export type SimulationDriver = "SERVICE" | "API" | "UI_STUB" | "PLAYWRIGHT";
export type SimulationRunStatus = "RUNNING" | "COMPLETED" | "FAILED" | "PARTIAL";
export type ScenarioStatus = "PASS" | "WARNING" | "FAIL";
export type Severity = "P0" | "P1" | "P2" | "INFO";

export type OpportunityType =
  | "BUG"
  | "MISSED_SALE"
  | "UX_FRICTION"
  | "PROMPT_GAP"
  | "POLICY_GAP"
  | "LIBRARY_OPPORTUNITY"
  | "TRAINING_OPPORTUNITY";

export type OpportunityStatus = "PENDING_REVIEW" | "APPROVED" | "REJECTED" | "BACKLOGGED";

/** A generated artificial-customer scenario (before it is run). */
export interface SimulationScenario {
  scenarioKey: string;
  scenarioType: string;
  persona: string;
  customerGoal: string;
  customerConstraints: Record<string, unknown>;
  initialMessage: string;
  expectedBehaviors: string[];
  disallowedBehaviors: string[];
}

/** One turn of a (possibly multi-turn) simulated conversation. */
export interface TranscriptTurn {
  role: "customer" | "agent";
  content: string;
  cards?: string[];
  mode?: string;
}

/** The raw output of running a scenario through a driver. */
export interface ScenarioRunOutput {
  transcript: TranscriptTurn[];
  /** Agent's final/primary message (convenience). */
  finalMessage: string;
  /** Product card IDs the agent showed. */
  cards: string[];
  mode: string;
  /** Number of quick-reply options the agent offered (CTA signal). */
  optionsCount: number;
  /** Whether the driver had to use an LLM (false for the SERVICE MVP). */
  usedLLM: boolean;
  /**
   * Valor do carrinho no turno. O checador de preço precisa dele para saber
   * que um TOTAL dito pelo agente é legítimo, e não preço inventado.
   */
  cartValue?: number;
}

/** The evaluation of a scenario run. */
export interface ScenarioEvaluation {
  status: ScenarioStatus;
  severity: Severity;
  score: number; // 0–100
  summary: string;
  evidence: string[];
}

/** A combined evaluated scenario (generated + run + evaluated). */
export interface EvaluatedScenario {
  scenario: SimulationScenario;
  output: ScenarioRunOutput;
  evaluation: ScenarioEvaluation;
}

/** A detected opportunity/problem awaiting human review. */
export interface SimulationOpportunity {
  scenarioKey?: string;
  type: OpportunityType;
  severity: Severity;
  title: string;
  summary: string;
  evidence: string[];
  recommendation: string;
  expectedImpact: string;
  status: OpportunityStatus;
}

/** The full in-memory result of a simulation run (before/after persistence). */
export interface SimulationRunResult {
  agentSlug: string;
  departmentSlug: string;
  restaurantId: string | null;
  mode: SimulationMode;
  driver: SimulationDriver;
  status: SimulationRunStatus;
  seed: string;
  startedAt: string;
  finishedAt: string;
  durationMs: number;
  scenariosTotal: number;
  scenariosPassed: number;
  scenariosWarning: number;
  scenariosFailed: number;
  p0Count: number;
  p1Count: number;
  p2Count: number;
  opportunityCount: number;
  scenarios: EvaluatedScenario[];
  opportunities: SimulationOpportunity[];
  /** Hard proof no side effect was allowed (echoed from SafeMode). */
  runtimeTouched: false;
}

/**
 * An APPROVED real-conversation example, shaped for the generator. It carries only
 * the classification (intent + scenarioType) — never raw text — so it can INSPIRE
 * scenario selection without ever copying literal customer wording.
 */
export interface ExampleSeed {
  exampleId: string;
  intent: string;
  scenarioType: string;
}

export interface GenerateScenariosInput {
  seed: string;
  count: number;
  scenarioTypes?: string[];
  /** Approved real-conversation examples to bias scenario selection (optional). */
  examples?: ExampleSeed[];
}

/**
 * The contract every agent must implement to plug into the Simulation Lab.
 * Implementations MUST be pure / dry-run and never cause a real side effect.
 */
export interface AgentSimulationAdapter {
  agentSlug: string;
  departmentSlug: string;
  displayName: string;
  /** Deterministic, seeded generation of varied artificial-customer scenarios. */
  generateScenarios(input: GenerateScenariosInput): SimulationScenario[];
  /** Runs one scenario through the chosen (safe) driver — NO side effects. */
  runScenario(scenario: SimulationScenario): Promise<ScenarioRunOutput>;
  /** Classifies the run into PASS/WARNING/FAIL + severity + evidence. */
  evaluateScenario(scenario: SimulationScenario, output: ScenarioRunOutput): ScenarioEvaluation;
  /** Turns failures/warnings into reviewable opportunities. */
  buildOpportunities(evaluated: EvaluatedScenario): SimulationOpportunity[];
}
