/**
 * simulationEvaluator — generic helpers to turn behavioural checks into a
 * PASS/WARNING/FAIL + severity + score. Domain adapters decide WHICH checks ran;
 * this module decides how the counts map to a verdict, consistently across agents.
 *
 *  - any CRITICAL violation (hallucination, fake product/price, safety) → FAIL/P0
 *  - any disallowed behaviour                                          → FAIL/P1
 *  - missing expected behaviours only                                  → WARNING/P2
 *  - everything met                                                    → PASS/INFO
 */

import type { ScenarioEvaluation, ScenarioStatus, Severity } from "./types";

export interface BehaviorTally {
  expectedTotal: number;
  expectedMet: number;
  /** Disallowed behaviours that were violated (non-critical). */
  disallowedViolations: string[];
  /** Critical violations (P0): hallucination, fake product/price, safety breach. */
  criticalViolations: string[];
}

export function classifyEvaluation(tally: BehaviorTally): ScenarioEvaluation {
  const { expectedTotal, expectedMet, disallowedViolations, criticalViolations } = tally;
  const missingExpected = Math.max(0, expectedTotal - expectedMet);

  let status: ScenarioStatus;
  let severity: Severity;
  const evidence: string[] = [];

  if (criticalViolations.length > 0) {
    status = "FAIL";
    severity = "P0";
    evidence.push(...criticalViolations.map((c) => `CRÍTICO: ${c}`));
  } else if (disallowedViolations.length > 0) {
    status = "FAIL";
    severity = "P1";
    evidence.push(...disallowedViolations.map((d) => `Comportamento proibido: ${d}`));
  } else if (missingExpected > 0) {
    status = "WARNING";
    severity = "P2";
    evidence.push(`${missingExpected} comportamento(s) esperado(s) não atendido(s).`);
  } else {
    status = "PASS";
    severity = "INFO";
  }

  // Score: expected coverage minus penalties for violations.
  const coverage = expectedTotal === 0 ? 1 : expectedMet / expectedTotal;
  const penalty = criticalViolations.length * 0.5 + disallowedViolations.length * 0.25;
  const score = Math.max(0, Math.min(100, Math.round((coverage - penalty) * 100)));

  const summary =
    status === "PASS"
      ? "Comportamento dentro do esperado."
      : status === "WARNING"
        ? "Comportamento aceitável, com oportunidade de melhoria."
        : severity === "P0"
          ? "Falha crítica de comportamento detectada."
          : "Falha de comportamento (comercial/fluxo) detectada.";

  return { status, severity, score, summary, evidence };
}

/** Aggregates per-scenario severities into run-level counts. */
export function tallySeverities(evals: ScenarioEvaluation[]): {
  passed: number; warning: number; failed: number; p0: number; p1: number; p2: number;
} {
  let passed = 0, warning = 0, failed = 0, p0 = 0, p1 = 0, p2 = 0;
  for (const e of evals) {
    if (e.status === "PASS") passed++;
    else if (e.status === "WARNING") warning++;
    else failed++;
    if (e.severity === "P0") p0++;
    else if (e.severity === "P1") p1++;
    else if (e.severity === "P2") p2++;
  }
  return { passed, warning, failed, p0, p1, p2 };
}
