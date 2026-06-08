/**
 * Quality Control — dashboard model (pure, v1).
 *
 * Presentation helpers consumed by the /admin/quality page: executive summary
 * derived from a real `AuditRunResult`, plus copyable JSON/TXT report builders.
 * Pure module (no React, no runtime) so the dashboard logic is unit-testable in
 * the node test environment.
 */

import type { AuditFinding, AuditRunResult, FindingStatus } from "./types";
import { AUDITOR_META_LIST } from "./registryMeta";

export interface ExecutiveSummary {
  /** Total auditors registered in the engine (not just the ones that ran). */
  auditors: number;
  /** Auditors executed in this run. */
  auditorsRun: number;
  passed: number;
  attention: number;
  failed: number;
  p0Open: number;
  globalStatus: FindingStatus;
}

/** Summary shown before any manual run has happened. */
export function emptyExecutiveSummary(): ExecutiveSummary {
  return {
    auditors: AUDITOR_META_LIST.length,
    auditorsRun: 0,
    passed: 0,
    attention: 0,
    failed: 0,
    p0Open: 0,
    globalStatus: "PASS",
  };
}

/** Derives the executive summary cards from a real run result. */
export function buildExecutiveSummary(result: AuditRunResult): ExecutiveSummary {
  return {
    auditors: AUDITOR_META_LIST.length,
    auditorsRun: result.auditorIds.length,
    passed: result.countsByStatus.PASS,
    attention: result.countsByStatus.WARNING,
    failed: result.countsByStatus.FAIL,
    p0Open: result.countsBySeverity.P0,
    globalStatus: result.globalStatus,
  };
}

/** PT-BR label for a global/finding status. */
export function statusLabel(status: FindingStatus): string {
  switch (status) {
    case "PASS": return "Verde";
    case "WARNING": return "Atenção";
    case "FAIL": return "Falhou";
  }
}

/** Pretty JSON report (copyable). */
export function buildAuditJson(result: AuditRunResult): string {
  return JSON.stringify(result, null, 2);
}

/** Plain-text report (copyable). */
export function buildAuditTxt(result: AuditRunResult): string {
  const s = buildExecutiveSummary(result);
  const lines: string[] = [
    "===========================================",
    "CONTROLE DE QUALIDADE — RELATÓRIO",
    "===========================================",
    `Run:          ${result.runId}`,
    `Início:       ${new Date(result.startedAt).toLocaleString("pt-BR")}`,
    `Status geral: ${statusLabel(result.globalStatus)} (${result.globalStatus})`,
    `Auditores:    ${s.auditorsRun}/${s.auditors} executados`,
    `Passou: ${s.passed} · Atenção: ${s.attention} · Falhou: ${s.failed} · P0: ${s.p0Open}`,
    "",
    "-------------------------------------------",
    `FINDINGS (${result.findings.length})`,
    "-------------------------------------------",
    "",
  ];
  for (const f of result.findings) {
    lines.push(`[${f.status} · ${f.severity}] ${f.auditorId} — ${f.title}`);
    lines.push(`  Área:          ${f.affectedArea}`);
    lines.push(`  Resumo:        ${f.summary}`);
    if (f.evidence.length > 0) lines.push(`  Evidências:    ${f.evidence.join(" | ")}`);
    lines.push(`  Recomendação:  ${f.recommendation}`);
    lines.push("");
  }
  return lines.join("\n");
}

/** Severity ordering used to sort findings (worst first). */
const SEVERITY_RANK: Record<AuditFinding["severity"], number> = { P0: 0, P1: 1, P2: 2, INFO: 3 };

/** Findings sorted worst-first for display (generic over the severity field). */
export function sortFindings<T extends { severity: AuditFinding["severity"] }>(findings: readonly T[]): T[] {
  return [...findings].sort((a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity]);
}
