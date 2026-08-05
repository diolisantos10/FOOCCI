/**
 * Raio-X — persistência (server-only).
 *
 * A ÚNICA parte do módulo que escreve, e escreve só nas tabelas `raiox_*`.
 * Nunca toca dado de negócio. Guardar cada execução é metade do valor do
 * raio-x: "37 mensagens presas" não diz nada; "37, contra 4 ontem" diz tudo.
 */

import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import type { PreviousMetrics, RaioXReport } from "../types";
import { buildRunRecord, type PersistOptions } from "./raioxRecord";

export async function persistRun(report: RaioXReport, opts: PersistOptions): Promise<string> {
  const record = buildRunRecord(report, opts);
  const run = await prisma.raioXRun.create({
    data: {
      source: record.source,
      globalStatus: record.globalStatus,
      startedAt: record.startedAt,
      finishedAt: record.finishedAt,
      durationMs: record.durationMs,
      triggeredBy: record.triggeredBy,
      countsByStatus: record.countsByStatus as Prisma.InputJsonValue,
      countsBySeverity: record.countsBySeverity as Prisma.InputJsonValue,
      comparedToRunId: record.comparedToRunId,
      unavailableBlocks: record.unavailableBlocks as unknown as Prisma.InputJsonValue,
      findings: {
        create: record.findings.map((f) => ({
          probeId: f.probeId,
          area: f.area,
          status: f.status,
          severity: f.severity,
          title: f.title,
          summary: f.summary,
          evidence: f.evidence as unknown as Prisma.InputJsonValue,
          metrics: f.metrics as unknown as Prisma.InputJsonValue,
          deltas: f.deltas as unknown as Prisma.InputJsonValue,
          recommendation: f.recommendation,
        })),
      },
    },
    select: { id: true },
  });
  return run.id;
}

/**
 * Métricas da execução anterior, para o cálculo de variação.
 * Devolve `null` quando não há execução anterior — e quem chama precisa dizer
 * "sem base de comparação" em vez de mostrar zero.
 */
export async function getPreviousMetrics(): Promise<{ runId: string; at: Date; metrics: PreviousMetrics } | null> {
  const last = await prisma.raioXRun.findFirst({
    orderBy: { createdAt: "desc" },
    select: { id: true, createdAt: true, findings: { select: { probeId: true, metrics: true } } },
  });
  if (!last) return null;
  const metrics: PreviousMetrics = {};
  for (const f of last.findings) {
    const m = (f.metrics ?? {}) as Record<string, unknown>;
    for (const [k, v] of Object.entries(m)) {
      if (typeof v === "number") metrics[`${f.probeId}.${k}`] = v;
    }
  }
  return { runId: last.id, at: last.createdAt, metrics };
}

export async function listHistory(limit = 14) {
  const safe = Math.min(Math.max(1, limit), 60);
  return prisma.raioXRun.findMany({
    orderBy: { createdAt: "desc" },
    take: safe,
    select: {
      id: true, source: true, globalStatus: true, startedAt: true, finishedAt: true,
      durationMs: true, countsByStatus: true, countsBySeverity: true, comparedToRunId: true,
      unavailableBlocks: true, createdAt: true,
    },
  });
}

export async function getRunWithFindings(id: string) {
  return prisma.raioXRun.findUnique({
    where: { id },
    include: { findings: { orderBy: [{ severity: "asc" }, { probeId: "asc" }] } },
  });
}

export async function getLatestRunWithFindings() {
  const [latest] = await prisma.raioXRun.findMany({
    orderBy: { createdAt: "desc" },
    take: 1,
    select: { id: true },
  });
  return latest ? getRunWithFindings(latest.id) : null;
}
