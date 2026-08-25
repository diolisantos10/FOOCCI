/**
 * Quality Control — persistence store (server-only).
 *
 * The ONLY place in the Quality module that writes to the DB, and it writes
 * exclusively to the standalone quality_audit_* tables — never to business data.
 * It persists the sanitized audit result and reads history for the dashboard.
 *
 * Excluded from the no-side-effects scan (lives under persistence/): this layer
 * is allowed to use prisma; the pure engine + auditors are not.
 */

import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import type { AuditRunResult } from "../types";
import { buildRunRecord, type PersistRunOptions } from "./auditRecord";

export interface HistoryRunSummary {
  id: string;
  source: string;
  globalStatus: string;
  startedAt: Date;
  finishedAt: Date;
  durationMs: number;
  auditorId: string | null;
  countsBySeverity: unknown;
  countsByStatus: unknown;
  createdAt: Date;
}

/** Persists a run + its sanitized findings (nested create). Returns the run id. */
export async function persistRun(result: AuditRunResult, opts: PersistRunOptions): Promise<string> {
  const record = buildRunRecord(result, opts);
  const run = await prisma.qualityAuditRun.create({
    data: {
      source: record.source,
      globalStatus: record.globalStatus,
      startedAt: record.startedAt,
      finishedAt: record.finishedAt,
      durationMs: record.durationMs,
      triggeredBy: record.triggeredBy,
      auditorId: record.auditorId,
      countsBySeverity: record.countsBySeverity as Prisma.InputJsonValue,
      countsByStatus: record.countsByStatus as Prisma.InputJsonValue,
      metadata: (record.metadata ?? undefined) as Prisma.InputJsonValue | undefined,
      findings: { create: record.findings.map((f) => ({ ...f })) },
    },
    select: { id: true },
  });
  return run.id;
}

/** Lists the most recent runs (summary only, capped). */
export async function listHistory(limit = 20): Promise<HistoryRunSummary[]> {
  const safeLimit = Math.min(Math.max(1, limit), 50);
  return prisma.qualityAuditRun.findMany({
    orderBy: { createdAt: "desc" },
    take: safeLimit,
    select: {
      id: true, source: true, globalStatus: true, startedAt: true, finishedAt: true,
      durationMs: true, auditorId: true, countsBySeverity: true, countsByStatus: true, createdAt: true,
    },
  });
}

/** The single most recent run summary, or null. */
export async function getLatestRun(): Promise<HistoryRunSummary | null> {
  const [latest] = await listHistory(1);
  return latest ?? null;
}

/** A run with its full findings, or null. */
export async function getRunWithFindings(id: string) {
  return prisma.qualityAuditRun.findUnique({
    where: { id },
    include: { findings: { orderBy: { createdAt: "asc" } } },
  });
}

/**
 * O veredito PERSISTIDO mais recente de UM agente (auditorId), com a prova.
 *
 * Lê a run mais recente que CONTÉM pelo menos um achado daquele auditor — é a
 * única evidência de que o auditor realmente rodou. Uma run sem achado nenhum
 * do agente NÃO é veredito dele: "não estourou" não é verde.
 *
 * Devolve o dado cru (sem política). Quem decide se isso libera degrau é o
 * LiveStageGuard — aqui só se lê.
 */
export interface AgentVerdictRow {
  runId: string;
  finishedAt: Date;
  /** Achados DAQUELE auditor nesta run (severidade + status), sanitizados. */
  findings: { severity: string; status: string }[];
}

export async function getLatestAgentVerdictRow(auditorId: string): Promise<AgentVerdictRow | null> {
  const run = await prisma.qualityAuditRun.findFirst({
    where: { findings: { some: { auditorId } } },
    orderBy: { finishedAt: "desc" },
    select: {
      id: true,
      finishedAt: true,
      findings: { where: { auditorId }, select: { severity: true, status: true } },
    },
  });
  if (!run) return null;
  return { runId: run.id, finishedAt: run.finishedAt, findings: run.findings };
}
