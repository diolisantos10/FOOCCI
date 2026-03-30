/**
 * FOOCCI QA — Scenario Runner
 *
 * Iterates over a list of scenarios, drives each one through the
 * action driver, evaluates post-run checkpoints, and assembles the
 * full QARunLog.
 */

import type {
  QAScenario,
  QAScenarioResult,
  QACheckpointResult,
  QAFailure,
  QARunLog,
  QASummary,
  Severity,
  MenuCategoryFixture,
} from "./types";
import { initialState } from "./state";
import { driveScenario } from "./driver";

// ─── Recommendation logic ─────────────────────────────────────

function computeRecommendation(
  s: Omit<QASummary, "recommendation">,
): QASummary["recommendation"] {
  if (s.critical > 0) return "NOT_READY";
  if (s.failed / Math.max(s.total, 1) > 0.3) return "NOT_READY";
  if (s.high > 0 || s.failed > 0) return "READY_FOR_CONTROLLED_PILOT";
  return "READY";
}

// ─── Runner ───────────────────────────────────────────────────

export function runScenarios(
  scenarios: QAScenario[],
  menu: MenuCategoryFixture[],
): QARunLog {
  const runId = `run-${new Date().toISOString().replace(/[:.]/g, "-")}`;
  const globalStart = Date.now();
  const results: QAScenarioResult[] = [];

  for (const scenario of scenarios) {
    const scenarioStart = Date.now();
    const timestamp = new Date().toISOString();

    // Fresh state for every scenario — scenarios are independent
    const state0 = initialState(menu);
    const { logs, finalState, loopDetected, abortedReason } = driveScenario(
      state0,
      scenario.actions,
      menu,
    );

    // ── Evaluate checkpoints against final state ───────────────
    const checkpointResults: QACheckpointResult[] = scenario.checkpoints.map(
      (cp) => {
        const { passed, detail } = cp.validate(finalState);
        return {
          checkpointId: cp.id,
          description: cp.description,
          severity: cp.severity,
          passed,
          detail,
        };
      },
    );

    // ── Collect all failures ───────────────────────────────────
    const failures: QAFailure[] = [];

    // From inline assertion errors in action logs
    for (const log of logs) {
      if (log.assertionError) {
        failures.push({
          source: "action",
          id: `assert-seq-${log.seq}`,
          description: `Assertion failed at action ${log.seq} (${log.action.type})`,
          severity: "high",
          detail: log.assertionError,
          actionSeq: log.seq,
        });
      }
      if (log.error) {
        failures.push({
          source: "action",
          id: `error-seq-${log.seq}`,
          description: `Error at action ${log.seq} (${log.action.type})`,
          severity: "critical",
          detail: log.error,
          actionSeq: log.seq,
        });
      }
    }

    // From failed checkpoints
    for (const cp of checkpointResults) {
      if (!cp.passed) {
        failures.push({
          source: "checkpoint",
          id: cp.checkpointId,
          description: cp.description,
          severity: cp.severity,
          detail: cp.detail ?? "Checkpoint condition not met",
        });
      }
    }

    // From loop / abort detection
    if (loopDetected) {
      failures.push({
        source: "loop",
        id: "loop-detected",
        description: "Infinite loop detected — stage visited too many times",
        severity: "critical",
        detail: "Stage visit count exceeded MAX_STAGE_VISITS",
      });
    }
    if (abortedReason) {
      failures.push({
        source: "loop",
        id: "max-actions-exceeded",
        description: "Scenario exceeded maximum action count",
        severity: "critical",
        detail: abortedReason,
      });
    }

    // ── Determine outcome ──────────────────────────────────────
    const hasCritical = failures.some((f) => f.severity === "critical");
    const outcome: QAScenarioResult["outcome"] =
      failures.length === 0 ? "pass" : hasCritical ? "error" : "fail";

    results.push({
      scenarioId: scenario.id,
      scenarioName: scenario.name,
      persona: scenario.persona,
      timestamp,
      durationMs: Date.now() - scenarioStart,
      outcome,
      actions: logs,
      checkpointResults,
      failures,
    });
  }

  // ── Aggregate summary ────────────────────────────────────────
  const total    = results.length;
  const passed   = results.filter((r) => r.outcome === "pass").length;
  const failed   = results.filter((r) => r.outcome === "fail").length;
  const errored  = results.filter((r) => r.outcome === "error").length;

  const allFailures = results.flatMap((r) => r.failures);
  const bySeverity = (sev: Severity) =>
    allFailures.filter((f) => f.severity === sev).length;

  const base = {
    total, passed, failed, errored,
    critical: bySeverity("critical"),
    high:     bySeverity("high"),
    medium:   bySeverity("medium"),
    low:      bySeverity("low"),
  };

  return {
    runId,
    timestamp: new Date().toISOString(),
    totalDurationMs: Date.now() - globalStart,
    scenarios: results,
    summary: { ...base, recommendation: computeRecommendation(base) },
  };
}
