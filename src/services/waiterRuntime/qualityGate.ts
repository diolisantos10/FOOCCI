/**
 * Waiter Quality Gate — blocks activation of a LIBRARY_ASSISTED version while the
 * Waiter has any P0 (critical: hallucination / item-out-of-catalog / forbidden
 * denial). Runs the existing Waiter auditor under SafeMode (read-only, dry-run).
 *
 * Rollback NEVER goes through this gate — reverting to a safe state must be fast.
 */

import { runOne } from "@/services/quality/QualityControlService";
import type { WaiterQualityGateResult } from "./types";

export const WAITER_AUDITOR_ID = "waiter";

/**
 * Runs the Waiter auditor and reports whether activation is allowed (P0 === 0).
 * Throws nothing the caller can't handle — a runner error is reported as a
 * non-passing gate so activation is blocked, never silently allowed.
 */
export async function runWaiterQualityGate(): Promise<WaiterQualityGateResult> {
  const ranAt = new Date().toISOString();
  try {
    const result = await runOne(WAITER_AUDITOR_ID);
    const p0Count = result.countsBySeverity.P0;
    const passed = p0Count === 0;
    return {
      passed,
      p0Count,
      globalStatus: result.globalStatus,
      runId: result.runId,
      ranAt,
      reason: passed
        ? "Quality gate OK — 0 P0 no Waiter."
        : `Bloqueado: ${p0Count} P0 aberto(s) no Waiter (status ${result.globalStatus}).`,
    };
  } catch (err) {
    const reason = err instanceof Error ? err.message.slice(0, 160) : "erro desconhecido";
    return {
      passed: false,
      p0Count: -1,
      globalStatus: "FAIL",
      runId: "",
      ranAt,
      reason: `Quality gate não pôde rodar — ativação bloqueada: ${reason}`,
    };
  }
}
