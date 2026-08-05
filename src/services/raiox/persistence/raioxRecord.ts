/**
 * Raio-X — mapeamento para persistência (PURO).
 *
 * Traduz o relatório em linhas de banco e SANITIZA toda evidência: telefone,
 * e-mail, token e segredo são redigidos antes de qualquer gravação. Reusa o
 * sanitizador já provado do Controle de Qualidade em vez de abrir um segundo —
 * duas maneiras de redigir dado sensível é uma a mais para envelhecer errado.
 */

import { sanitizeText, sanitizeEvidence } from "@/services/quality/persistence/auditRecord";
import type { RaioXReport } from "../types";

export type RaioXSource = "CRON" | "MANUAL";

export interface PersistOptions {
  source: RaioXSource;
  triggeredBy?: string | null;
}

export interface RaioXFindingRecord {
  probeId: string;
  area: string;
  status: string;
  severity: string;
  title: string;
  summary: string;
  evidence: string[];
  metrics: Record<string, number>;
  deltas: Record<string, number | null>;
  recommendation: string;
}

export interface RaioXRunRecord {
  source: RaioXSource;
  globalStatus: string;
  startedAt: Date;
  finishedAt: Date;
  durationMs: number;
  triggeredBy: string | null;
  countsByStatus: RaioXReport["countsByStatus"];
  countsBySeverity: RaioXReport["countsBySeverity"];
  comparedToRunId: string | null;
  /** Blocos que não vieram — viajam junto para o relatório poder dizer o que não sabe. */
  unavailableBlocks: { block: string; reason: string }[];
  findings: RaioXFindingRecord[];
}

export function buildRunRecord(report: RaioXReport, opts: PersistOptions): RaioXRunRecord {
  return {
    source: opts.source,
    globalStatus: report.globalStatus,
    startedAt: report.startedAt,
    finishedAt: report.finishedAt,
    durationMs: Math.max(0, report.finishedAt.getTime() - report.startedAt.getTime()),
    triggeredBy: opts.triggeredBy ? sanitizeText(opts.triggeredBy) : null,
    countsByStatus: report.countsByStatus,
    countsBySeverity: report.countsBySeverity,
    comparedToRunId: report.comparedToRunId,
    unavailableBlocks: report.unavailableBlocks.map((b) => ({
      block: b.block,
      reason: sanitizeText(b.reason),
    })),
    findings: report.findings.map((f) => ({
      probeId: f.probeId,
      area: f.area,
      status: f.status,
      severity: f.severity,
      title: sanitizeText(f.title),
      summary: sanitizeText(f.summary),
      evidence: sanitizeEvidence(f.evidence),
      metrics: f.metrics,
      deltas: f.deltas ?? {},
      recommendation: sanitizeText(f.recommendation),
    })),
  };
}
