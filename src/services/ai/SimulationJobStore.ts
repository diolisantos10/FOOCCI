/**
 * SimulationJobStore
 *
 * Module-level singleton that persists simulation state across SSE connections.
 * One active job per restaurant at a time (new run overwrites previous).
 *
 * Guarantees:
 *  - Simulation continues even when the client disconnects (SSE drops).
 *  - Client can reconnect via GET /api/ai-simulator/status to retrieve
 *    partial results and final report without re-running.
 *  - Completed jobs are kept in memory until the next run starts.
 */

import type { ScenarioResult, SimulationReport } from "./AISimulatorService";

export interface SimulationJob {
  restaurantId: string;
  jobId:        string;
  status:       "running" | "done" | "error";
  startedAt:    Date;
  progress:     { current: number; total: number; scenarioName: string };
  results:      ScenarioResult[];
  report:       SimulationReport | null;
  error:        string | null;
}

// One job per restaurantId — persists for the lifetime of the Node.js process
const jobs = new Map<string, SimulationJob>();

export const SimulationJobStore = {
  start(restaurantId: string, total: number): SimulationJob {
    const job: SimulationJob = {
      restaurantId,
      jobId:     `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
      status:    "running",
      startedAt: new Date(),
      progress:  { current: 0, total, scenarioName: "" },
      results:   [],
      report:    null,
      error:     null,
    };
    jobs.set(restaurantId, job);
    return job;
  },

  updateProgress(restaurantId: string, p: { current: number; total: number; scenarioName: string }) {
    const job = jobs.get(restaurantId);
    if (job) job.progress = p;
  },

  addResult(restaurantId: string, result: ScenarioResult) {
    const job = jobs.get(restaurantId);
    if (job) job.results.push(result);
  },

  complete(restaurantId: string, report: SimulationReport) {
    const job = jobs.get(restaurantId);
    if (job) { job.status = "done"; job.report = report; }
  },

  fail(restaurantId: string, error: string) {
    const job = jobs.get(restaurantId);
    if (job) { job.status = "error"; job.error = error; }
  },

  get(restaurantId: string): SimulationJob | null {
    return jobs.get(restaurantId) ?? null;
  },
};
