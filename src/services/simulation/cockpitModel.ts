/**
 * Simulation cockpit model — assembles everything the Simulador tab needs into a
 * single admin payload, so the operator sees the lab as ONE living control center:
 * automation status, last cron/manual run, next run estimate, the PENDING
 * opportunities queue (the human-decision surface), latest simulated transcripts,
 * real-example stats, and a plain-language safety summary.
 *
 * Read-only. No side effects, never touches a real customer.
 */

import { prisma } from "@/lib/prisma";
import { exampleStats } from "./examples/SimulationExampleStore";

const AGENT = "waiter";

/** The Waiter sim cron runs daily at 06:45 UTC (≈ 03:45 BRT). */
export function nextScheduledRun(now: Date = new Date()): string {
  const next = new Date(now);
  next.setUTCHours(6, 45, 0, 0);
  if (next.getTime() <= now.getTime()) next.setUTCDate(next.getUTCDate() + 1);
  return next.toISOString();
}

const runSelect = {
  id: true, mode: true, driver: true, status: true, seed: true, createdAt: true,
  scenariosTotal: true, scenariosPassed: true, scenariosWarning: true, scenariosFailed: true,
  p0Count: true, p1Count: true, p2Count: true, opportunityCount: true,
} as const;

export async function getSimulationCockpit(agentSlug = AGENT) {
  const [latestRun, latestManualRun, latestCronRun, pendingOpportunities, statusGroups, stats] = await Promise.all([
    prisma.agentSimulationRun.findFirst({ where: { agentSlug }, orderBy: { createdAt: "desc" }, select: runSelect }),
    prisma.agentSimulationRun.findFirst({ where: { agentSlug, mode: "MANUAL" }, orderBy: { createdAt: "desc" }, select: runSelect }),
    prisma.agentSimulationRun.findFirst({ where: { agentSlug, mode: "CRON" }, orderBy: { createdAt: "desc" }, select: runSelect }),
    prisma.agentSimulationOpportunity.findMany({
      where: { agentSlug, status: "PENDING_REVIEW" },
      orderBy: [{ severity: "asc" }, { createdAt: "desc" }],
      take: 50,
      include: { scenario: { select: { scenarioType: true, persona: true, initialMessage: true } }, run: { select: { mode: true } } },
    }),
    prisma.agentSimulationOpportunity.groupBy({ by: ["status"], where: { agentSlug }, _count: { _all: true } }),
    exampleStats(agentSlug).catch(() => ({ total: 0, approved: 0, pending: 0, rejected: 0 })),
  ]);

  // Latest simulated transcripts (compact) from the most recent run.
  const latestScenarios = latestRun
    ? await prisma.agentSimulationScenario.findMany({
        where: { runId: latestRun.id },
        orderBy: { createdAt: "asc" },
        take: 12,
        select: {
          id: true, scenarioType: true, persona: true, initialMessage: true,
          status: true, severity: true, score: true, summary: true, transcript: true,
        },
      })
    : [];

  const opportunitiesByStatus = { PENDING_REVIEW: 0, APPROVED: 0, REJECTED: 0, BACKLOGGED: 0 } as Record<string, number>;
  for (const g of statusGroups) opportunitiesByStatus[g.status] = g._count._all;

  return {
    automation: {
      isAutomated: true,
      scheduleLabel: "Diário ~03:45 BRT (cron 45 6 * * *)",
      nextScheduledRunEstimate: nextScheduledRun(),
    },
    latestRun,
    latestManualRun,
    latestCronRun,
    pendingOpportunities,
    pendingOpportunityCount: pendingOpportunities.length,
    opportunitiesByStatus,
    latestScenarios,
    exampleStats: stats,
    runtimeSafety: {
      runtimeTouched: false,
      dryRun: true,
      createsOrder: false,
      sendsWhatsApp: false,
      generatesPix: false,
      label: "Seguro: não toca cliente real · runtime real intocado",
    },
  };
}

export type SimulationCockpit = Awaited<ReturnType<typeof getSimulationCockpit>>;
