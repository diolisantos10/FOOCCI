/**
 * runWaiterSimulation — convenience entrypoints that wire the Waiter adapter into
 * the generic runner. Pure run (no DB) + run-and-persist (for API/cron).
 */

import { runSimulation, type RunSimulationOptions } from "../AgentSimulationService";
import { persistSimulationRun } from "../SimulationStore";
import { getApprovedExampleSeeds } from "../examples/SimulationExampleStore";
import { WaiterSimulationAdapter } from "./WaiterSimulationAdapter";
import type { SimulationRunResult } from "../types";

/** Runs the Waiter simulation in-memory (no persistence) — fully dry-run. */
export async function runWaiterSimulation(opts: RunSimulationOptions = {}): Promise<SimulationRunResult> {
  return runSimulation(WaiterSimulationAdapter, opts);
}

/**
 * Runs and persists the Waiter simulation; returns the new runId + result.
 * Loads APPROVED real-conversation example seeds (if any) to bias scenario
 * selection toward real patterns — unless the caller already passed examples.
 */
export async function runAndPersistWaiterSimulation(
  opts: RunSimulationOptions = {},
): Promise<{ runId: string; result: SimulationRunResult }> {
  let examples = opts.examples;
  if (!examples) {
    try {
      examples = await getApprovedExampleSeeds("waiter");
    } catch {
      examples = []; // never block a run if the example library is unavailable
    }
  }
  const result = await runSimulation(WaiterSimulationAdapter, { ...opts, examples });
  const runId = await persistSimulationRun(result);
  return { runId, result };
}
