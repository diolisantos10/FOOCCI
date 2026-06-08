/**
 * Quality Control — executive summary helpers (pure, v3.2).
 *
 * Turns the audit history into the "10-second read" the dashboard needs:
 * overall status + human text, worst auditor, open P0/P1/P2, auditor rollup,
 * a primary recommendation and a simple trend. Pure module (no React, no
 * prisma, no runtime) so every helper is unit-tested.
 */

import type { FindingSeverity, FindingStatus } from "./types";

/** Minimal finding shape the helpers need (works for engine + DB findings). */
export interface FindingLike {
  auditorId: string;
  status: FindingStatus;
  severity: FindingSeverity;
  title: string;
  recommendation: string;
}

/** Minimal run-summary shape (the history rows). */
export interface RunLike {
  globalStatus: FindingStatus;
}

export type Trend = "improving" | "worsening" | "stable" | "insufficient";

const SEV_RANK: Record<FindingSeverity, number> = { P0: 0, P1: 1, P2: 2, INFO: 3 };
const STATUS_SCORE: Record<FindingStatus, number> = { FAIL: 0, WARNING: 1, PASS: 2 };

export interface WorstAuditor {
  auditorId: string;
  severity: FindingSeverity;
  status: FindingStatus;
  title: string;
}

/** The auditor with the most severe finding (worst severity, then worst status). */
export function getWorstAuditor(findings: readonly FindingLike[]): WorstAuditor | null {
  let worst: FindingLike | null = null;
  for (const f of findings) {
    if (
      !worst ||
      SEV_RANK[f.severity] < SEV_RANK[worst.severity] ||
      (SEV_RANK[f.severity] === SEV_RANK[worst.severity] && STATUS_SCORE[f.status] < STATUS_SCORE[worst.status])
    ) {
      worst = f;
    }
  }
  if (!worst) return null;
  return { auditorId: worst.auditorId, severity: worst.severity, status: worst.status, title: worst.title };
}

/** The recommendation that matters most right now (from the worst finding). */
export function getPrimaryRecommendation(findings: readonly FindingLike[]): string {
  if (findings.length === 0) return "Rode a auditoria manual para ter um diagnóstico.";
  const worst = getWorstAuditor(findings)!;
  // Find the worst finding object to read its recommendation.
  const target = findings.find(
    (f) => f.auditorId === worst.auditorId && f.severity === worst.severity && f.status === worst.status,
  );
  if (worst.severity === "INFO" && worst.status === "PASS") {
    return "Nenhuma ação necessária — sistema saudável.";
  }
  return target?.recommendation ?? "Revisar o auditor mais crítico.";
}

export interface AuditorRollup {
  ok: number;
  attention: number;
  /** Worst status per auditor id. */
  byAuditor: Record<string, FindingStatus>;
}

/** Counts auditors that are clean (only PASS) vs. with attention (WARNING/FAIL). */
export function rollupAuditors(findings: readonly FindingLike[]): AuditorRollup {
  const byAuditor: Record<string, FindingStatus> = {};
  for (const f of findings) {
    const cur = byAuditor[f.auditorId];
    if (cur === undefined || STATUS_SCORE[f.status] < STATUS_SCORE[cur]) byAuditor[f.auditorId] = f.status;
  }
  let ok = 0;
  let attention = 0;
  for (const status of Object.values(byAuditor)) {
    if (status === "PASS") ok += 1;
    else attention += 1;
  }
  return { ok, attention, byAuditor };
}

/**
 * Trend over the recent window (runs newest-first). Compares the latest run to
 * the previous one: better score => improving, worse => worsening, equal =>
 * stable. Fewer than 2 runs => insufficient.
 */
export function getTrend(runs: readonly RunLike[]): Trend {
  const window = runs.slice(0, 7);
  if (window.length < 2) return "insufficient";
  const latest = STATUS_SCORE[window[0]!.globalStatus];
  const prev = STATUS_SCORE[window[1]!.globalStatus];
  if (latest > prev) return "improving";
  if (latest < prev) return "worsening";
  return "stable";
}

export const TREND_LABEL: Record<Trend, string> = {
  improving: "Melhorando",
  worsening: "Piorando",
  stable: "Estável",
  insufficient: "Sem histórico suficiente",
};

/** Short human sentence for the overall status. */
export function statusText(status: FindingStatus | null): string {
  switch (status) {
    case "PASS": return "Sistema saudável na última auditoria.";
    case "WARNING": return "Há pontos de atenção, mas nenhum bloqueio crítico.";
    case "FAIL": return "Existe falha crítica que precisa de ação.";
    default: return "Nenhuma auditoria registrada ainda.";
  }
}

export interface ExecutiveOverview {
  hasHistory: boolean;
  globalStatus: FindingStatus | null;
  statusText: string;
  p0: number;
  p1: number;
  p2: number;
  worstAuditor: WorstAuditor | null;
  recommendation: string;
  auditorsOk: number;
  auditorsAttention: number;
  trend: Trend;
}

export interface ExecutiveInput {
  /** Latest run's counts by severity (from the latest summary). */
  counts?: Record<FindingSeverity, number> | null;
  /** Latest run global status. */
  globalStatus?: FindingStatus | null;
  /** Latest run findings (for worst auditor + recommendation + rollup). */
  findings?: readonly FindingLike[];
  /** Recent run summaries, newest-first (for the trend). */
  runs?: readonly RunLike[];
}

/** Builds the full executive overview from the history. */
export function buildExecutiveOverview(input: ExecutiveInput): ExecutiveOverview {
  const findings = input.findings ?? [];
  const runs = input.runs ?? [];
  const counts = input.counts ?? null;
  const hasHistory = runs.length > 0 || findings.length > 0;
  const status = input.globalStatus ?? (hasHistory ? "PASS" : null);
  const rollup = rollupAuditors(findings);

  return {
    hasHistory,
    globalStatus: status,
    statusText: statusText(status),
    p0: counts?.P0 ?? 0,
    p1: counts?.P1 ?? 0,
    p2: counts?.P2 ?? 0,
    worstAuditor: getWorstAuditor(findings),
    recommendation: getPrimaryRecommendation(findings),
    auditorsOk: rollup.ok,
    auditorsAttention: rollup.attention,
    trend: getTrend(runs),
  };
}
