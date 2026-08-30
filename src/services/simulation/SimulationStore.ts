/**
 * SimulationStore — persistence for simulation runs (separated from the pure core
 * so the runner stays DB-free and testable). Writes run → scenarios →
 * opportunities. Reading/curation supports the admin cockpit.
 *
 * This stores ONLY synthetic simulation data + reviewable opportunities. It never
 * writes to any business table.
 */

import { prisma } from "@/lib/prisma";
import type { OpportunityStatus, SimulationRunResult } from "./types";

/**
 * Persists a finished run and returns the new runId.
 *
 * ── `metadataExtra`, e por que ele NÃO pode apagar `runtimeTouched` ──────────
 *
 * O segundo parâmetro é aditivo e opcional: quem chama pode anexar contexto seu
 * aos metadados da rodada (o Dioli Connect anexa o registro da caixa postal —
 * fio, turno, quem falou). Nenhum chamador existente muda de comportamento.
 *
 * A ordem do spread é a trava: `runtimeTouched: false` vem DEPOIS e por isso
 * sempre vence. Um chamador não consegue, nem por engano nem de propósito,
 * gravar uma rodada que se declare tendo tocado o runtime — a garantia do
 * laboratório não é negociável por quem escreve nele.
 */
export async function persistSimulationRun(
  result: SimulationRunResult,
  metadataExtra: Record<string, unknown> = {},
): Promise<string> {
  const run = await prisma.agentSimulationRun.create({
    data: {
      agentSlug: result.agentSlug,
      departmentSlug: result.departmentSlug,
      restaurantId: result.restaurantId,
      mode: result.mode,
      driver: result.driver,
      status: result.status,
      seed: result.seed,
      startedAt: new Date(result.startedAt),
      finishedAt: new Date(result.finishedAt),
      durationMs: result.durationMs,
      scenariosTotal: result.scenariosTotal,
      scenariosPassed: result.scenariosPassed,
      scenariosWarning: result.scenariosWarning,
      scenariosFailed: result.scenariosFailed,
      p0Count: result.p0Count,
      p1Count: result.p1Count,
      p2Count: result.p2Count,
      opportunityCount: result.opportunityCount,
      metadata: JSON.stringify({ ...metadataExtra, runtimeTouched: false }),
    },
    select: { id: true },
  });

  // Scenarios first — collect key → id so opportunities can link back.
  const keyToId = new Map<string, string>();
  for (const e of result.scenarios) {
    const row = await prisma.agentSimulationScenario.create({
      data: {
        runId: run.id,
        agentSlug: result.agentSlug,
        scenarioKey: e.scenario.scenarioKey,
        scenarioType: e.scenario.scenarioType,
        persona: e.scenario.persona,
        customerGoal: e.scenario.customerGoal,
        customerConstraints: JSON.stringify(e.scenario.customerConstraints ?? {}),
        initialMessage: e.scenario.initialMessage,
        status: e.evaluation.status,
        severity: e.evaluation.severity,
        score: e.evaluation.score,
        summary: e.evaluation.summary,
        evidence: JSON.stringify(e.evaluation.evidence ?? []),
        transcript: JSON.stringify(e.output.transcript ?? []),
      },
      select: { id: true },
    });
    keyToId.set(e.scenario.scenarioKey, row.id);
  }

  if (result.opportunities.length > 0) {
    await prisma.agentSimulationOpportunity.createMany({
      data: result.opportunities.map((o) => ({
        runId: run.id,
        scenarioId: o.scenarioKey ? keyToId.get(o.scenarioKey) ?? null : null,
        agentSlug: result.agentSlug,
        type: o.type,
        severity: o.severity,
        title: o.title,
        summary: o.summary,
        evidence: JSON.stringify(o.evidence ?? []),
        recommendation: o.recommendation,
        expectedImpact: o.expectedImpact,
        status: o.status,
      })),
    });
  }

  return run.id;
}

export async function listRuns(agentSlug: string, limit = 20) {
  return prisma.agentSimulationRun.findMany({
    where: { agentSlug },
    orderBy: { createdAt: "desc" },
    take: Math.min(Math.max(limit, 1), 100),
    select: {
      id: true, agentSlug: true, mode: true, driver: true, status: true, seed: true, restaurantId: true,
      startedAt: true, finishedAt: true, durationMs: true, scenariosTotal: true,
      scenariosPassed: true, scenariosWarning: true, scenariosFailed: true,
      p0Count: true, p1Count: true, p2Count: true, opportunityCount: true, createdAt: true,
    },
  });
}

export async function getRunDetail(runId: string) {
  return prisma.agentSimulationRun.findUnique({
    where: { id: runId },
    include: {
      scenarios: { orderBy: { createdAt: "asc" } },
      opportunities: { orderBy: { severity: "asc" } },
    },
  });
}

export async function updateOpportunityStatus(id: string, status: OpportunityStatus, reviewedBy?: string | null) {
  return prisma.agentSimulationOpportunity.update({
    where: { id },
    data: { status, reviewedAt: new Date(), reviewedBy: reviewedBy ?? null },
  });
}
