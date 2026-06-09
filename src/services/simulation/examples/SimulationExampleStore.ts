/**
 * SimulationExampleStore — read/curate the example library. Approval is a human
 * step: an example only becomes generator fuel when APPROVED. The store never
 * returns raw transcripts (they are stored already-sanitized).
 */

import { prisma } from "@/lib/prisma";
import type { ExampleSeed } from "../types";

const AGENT = "waiter";

export type ExampleReviewStatus = "APPROVED" | "REJECTED" | "BACKLOGGED" | "PENDING_REVIEW";

export async function listExamples(params: { agentSlug?: string; status?: ExampleReviewStatus; limit?: number } = {}) {
  const agentSlug = params.agentSlug ?? AGENT;
  return prisma.agentSimulationExample.findMany({
    where: { agentSlug, ...(params.status ? { status: params.status } : {}) },
    orderBy: { createdAt: "desc" },
    take: Math.min(Math.max(params.limit ?? 50, 1), 200),
  });
}

export async function exampleStats(agentSlug = AGENT) {
  const [total, approved, pending, rejected] = await Promise.all([
    prisma.agentSimulationExample.count({ where: { agentSlug } }),
    prisma.agentSimulationExample.count({ where: { agentSlug, status: "APPROVED" } }),
    prisma.agentSimulationExample.count({ where: { agentSlug, status: "PENDING_REVIEW" } }),
    prisma.agentSimulationExample.count({ where: { agentSlug, status: "REJECTED" } }),
  ]);
  return { total, approved, pending, rejected };
}

export async function reviewExample(id: string, status: ExampleReviewStatus, reviewedBy?: string | null) {
  return prisma.agentSimulationExample.update({
    where: { id },
    data: {
      status,
      // ONLY an explicit APPROVED makes an example usable by the generator.
      isApprovedForSimulation: status === "APPROVED",
      reviewedAt: new Date(),
      reviewedBy: reviewedBy ?? null,
    },
  });
}

/**
 * Approved examples shaped for the scenario generator (inspiration only — the
 * generator must produce VARIATIONS, never copy the literal text).
 */
export async function getApprovedExampleSeeds(agentSlug = AGENT, limit = 40): Promise<ExampleSeed[]> {
  const rows = await prisma.agentSimulationExample.findMany({
    where: { agentSlug, isApprovedForSimulation: true, status: "APPROVED" },
    orderBy: { updatedAt: "desc" },
    take: limit,
    select: { id: true, intent: true, scenarioType: true },
  });
  return rows.map((r) => ({ exampleId: r.id, intent: r.intent, scenarioType: r.scenarioType }));
}
