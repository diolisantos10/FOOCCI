/**
 * Quality Control — regression detector (pure, v3.3).
 *
 * Compares the latest audit run with the previous one and classifies the change
 * (improved / worsened / stable), including the critical cases of a NEW P0 or a
 * RESOLVED P0. Pure module (no runtime, no alerts) — it only describes the
 * change; sending notifications is intentionally out of scope.
 */

import type { FindingSeverity, FindingStatus } from "./types";

export type RegressionTrend = "IMPROVED" | "WORSENED" | "STABLE" | "INSUFFICIENT_HISTORY";

/** Minimal run shape needed to compare two runs. */
export interface RegressionRunLike {
  id: string;
  globalStatus: FindingStatus;
  countsBySeverity: Record<FindingSeverity, number>;
}

export interface RegressionResult {
  trend: RegressionTrend;
  /** INFO (improved/stable), WARNING (worsened), P0 (new critical regression). */
  severity: "INFO" | "WARNING" | "P0";
  title: string;
  summary: string;
  previousRunId?: string;
  latestRunId?: string;
}

const STATUS_SCORE: Record<FindingStatus, number> = { FAIL: 0, WARNING: 1, PASS: 2 };

/**
 * Detects a regression between the latest and the previous run.
 * Priority: a new P0 (or a resolved P0) wins over a plain status change.
 */
export function detectRegression(
  latest?: RegressionRunLike | null,
  previous?: RegressionRunLike | null,
): RegressionResult {
  if (!latest || !previous) {
    return {
      trend: "INSUFFICIENT_HISTORY",
      severity: "INFO",
      title: "Sem histórico suficiente",
      summary: "É preciso pelo menos duas auditorias para comparar.",
      latestRunId: latest?.id,
      previousRunId: previous?.id,
    };
  }

  const base = { previousRunId: previous.id, latestRunId: latest.id };
  const latestP0 = latest.countsBySeverity.P0 ?? 0;
  const prevP0 = previous.countsBySeverity.P0 ?? 0;

  // ── Critical: a P0 that did not exist before ──
  if (latestP0 > 0 && prevP0 === 0) {
    return {
      ...base,
      trend: "WORSENED",
      severity: "P0",
      title: "Novo P0",
      summary: "Surgiu um P0 que não existia na rodada anterior — regressão crítica.",
    };
  }

  // ── Critical improvement: a P0 was resolved ──
  if (prevP0 > 0 && latestP0 === 0) {
    return {
      ...base,
      trend: "IMPROVED",
      severity: "INFO",
      title: "P0 resolvido",
      summary: "Um P0 da rodada anterior foi resolvido — melhora crítica.",
    };
  }

  // ── Plain status change ──
  const delta = STATUS_SCORE[latest.globalStatus] - STATUS_SCORE[previous.globalStatus];
  const path = `${previous.globalStatus} → ${latest.globalStatus}`;

  if (delta < 0) {
    return {
      ...base,
      trend: "WORSENED",
      severity: "WARNING",
      title: delta <= -2 ? "Piorou muito" : "Piorou",
      summary: `Status caiu (${path}).`,
    };
  }
  if (delta > 0) {
    return {
      ...base,
      trend: "IMPROVED",
      severity: "INFO",
      title: delta >= 2 ? "Melhorou muito" : "Melhorou",
      summary: `Status melhorou (${path}).`,
    };
  }
  return {
    ...base,
    trend: "STABLE",
    severity: "INFO",
    title: "Estável",
    summary: `Sem mudança de status (${latest.globalStatus}).`,
  };
}
