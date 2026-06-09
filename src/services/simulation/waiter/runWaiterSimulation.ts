/**
 * runWaiterSimulation — convenience entrypoints that wire the Waiter adapter into
 * the generic runner. Pure run (no DB) + run-and-persist (for API/cron).
 */

import { runSimulation, type RunSimulationOptions } from "../AgentSimulationService";
import { persistSimulationRun } from "../SimulationStore";
import { WaiterSimulationAdapter } from "./WaiterSimulationAdapter";
import type { SimulationRunResult } from "../types";

/** Runs the Waiter simulation in-memory (no persistence) — fully dry-run. */
export async function runWaiterSimulation(opts: RunSimulationOptions = {}): Promise<SimulationRunResult> {
  return runSimulation(WaiterSimulationAdapter, opts);
}

/** Runs and persists the Waiter simulation; returns the new runId + result. */
export async function runAndPersistWaiterSimulation(
  opts: RunSimulationOptions = {},
): Promise<{ runId: string; result: SimulationRunResult }> {
  const result = await runSimulation(WaiterSimulationAdapter, opts);
  const runId = await persistSimulationRun(result);
  return { runId, result };
}
