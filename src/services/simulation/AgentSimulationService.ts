/**
 * AgentSimulationService — the generic, agent-agnostic simulation runner.
 *
 * Given any AgentSimulationAdapter, it: asserts SafeMode → generates seeded
 * scenarios → runs each through the adapter's safe driver → evaluates → sanitizes
 * the transcript → builds opportunities → aggregates a SimulationRunResult.
 *
 * It is PURE (no DB): persistence is handled separately by SimulationStore, so the
 * core can be unit-tested without a database and never causes a side effect.
 */

import { SIMULATION_SAFE_MODE, assertSimulationSafeMode } from "./SimulationSafeMode";
import { sanitizeTranscript } from "./simulationSanitizer";
import { tallySeverities } from "./simulationEvaluator";
import { dailySeed } from "./scenarioGenerator";
import type {
  AgentSimulationAdapter,
  EvaluatedScenario,
  SimulationMode,
  SimulationOpportunity,
  SimulationRunResult,
} from "./types";

export interface RunSimulationOptions {
  scenarioCount?: number;
  seed?: string;
  scenarioTypes?: string[];
  mode?: SimulationMode;
  restaurantId?: string | null;
  now?: Date;
}

const MAX_SCENARIOS = 50;

export async function runSimulation(
  adapter: AgentSimulationAdapter,
  options: RunSimulationOptions = {},
): Promise<SimulationRunResult> {
  // Hard safety gate — the Lab can never run outside the sandbox.
  assertSimulationSafeMode(SIMULATION_SAFE_MODE);

  const now = options.now ?? new Date();
  const seed = options.seed?.trim() || dailySeed(now);
  const count = Math.max(1, Math.min(options.scenarioCount ?? 10, MAX_SCENARIOS));
  const mode: SimulationMode = options.mode ?? "MANUAL";
  const startedAt = now;

  const scenarios = adapter.generateScenarios({ seed, count, scenarioTypes: options.scenarioTypes });

  const evaluated: EvaluatedScenario[] = [];
  const opportunities: SimulationOpportunity[] = [];
  let failedRuns = 0;

  for (const scenario of scenarios) {
    try {
      const rawOutput = await adapter.runScenario(scenario);
      // Sanitize the transcript before it can ever be stored/displayed.
      const output = { ...rawOutput, transcript: sanitizeTranscript(rawOutput.transcript) };
      const evaluation = adapter.evaluateScenario(scenario, output);
      const item: EvaluatedScenario = { scenario, output, evaluation };
      evaluated.push(item);
      opportunities.push(...adapter.buildOpportunities(item));
    } catch {
      failedRuns += 1;
    }
  }

  const t = tallySeverities(evaluated.map((e) => e.evaluation));
  const finishedAt = new Date();
  const status: SimulationRunResult["status"] =
    failedRuns === 0 ? "COMPLETED" : evaluated.length === 0 ? "FAILED" : "PARTIAL";

  return {
    agentSlug: adapter.agentSlug,
    departmentSlug: adapter.departmentSlug,
    restaurantId: options.restaurantId ?? null,
    mode,
    driver: "SERVICE",
    status,
    seed,
    startedAt: startedAt.toISOString(),
    finishedAt: finishedAt.toISOString(),
    durationMs: finishedAt.getTime() - startedAt.getTime(),
    scenariosTotal: evaluated.length,
    scenariosPassed: t.passed,
    scenariosWarning: t.warning,
    scenariosFailed: t.failed,
    p0Count: t.p0,
    p1Count: t.p1,
    p2Count: t.p2,
    opportunityCount: opportunities.length,
    scenarios: evaluated,
    opportunities,
    runtimeTouched: false,
  };
}
