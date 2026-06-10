/**
 * BrainDirectorRepository — thin Prisma access for persistent BrainChangeRequests.
 * No business rules here (those live in PersistentBrainDirectorService); just
 * durable storage with history preserved (rows are never deleted).
 */

import { prisma } from "@/lib/prisma";
import type { Prisma } from "@prisma/client";

export type BrainChangeRequestRow = Awaited<ReturnType<typeof prisma.brainChangeRequest.create>>;

export async function insertChangeRequest(data: Prisma.BrainChangeRequestCreateInput): Promise<BrainChangeRequestRow> {
  return prisma.brainChangeRequest.create({ data });
}

export async function findChangeRequest(id: string): Promise<BrainChangeRequestRow | null> {
  return prisma.brainChangeRequest.findUnique({ where: { id } });
}

export async function updateChangeRequest(
  id: string,
  data: Prisma.BrainChangeRequestUpdateInput,
): Promise<BrainChangeRequestRow> {
  return prisma.brainChangeRequest.update({ where: { id }, data });
}

export async function listChangeRequestRows(params: { status?: string; limit?: number } = {}): Promise<BrainChangeRequestRow[]> {
  return prisma.brainChangeRequest.findMany({
    where: params.status ? { status: params.status } : undefined,
    orderBy: { createdAt: "desc" },
    take: Math.min(Math.max(params.limit ?? 50, 1), 200),
  });
}

export interface RiskSummaryCounts {
  pendingCount: number;
  highRiskCount: number;
  productionImpactCount: number;
  decidedCount: number;
}

export async function countRiskSummary(): Promise<RiskSummaryCounts> {
  const [pendingCount, highRiskCount, productionImpactCount, decidedCount] = await Promise.all([
    prisma.brainChangeRequest.count({ where: { status: "PENDING_APPROVAL" } }),
    prisma.brainChangeRequest.count({ where: { status: "PENDING_APPROVAL", riskLevel: { in: ["HIGH", "CRITICAL"] } } }),
    prisma.brainChangeRequest.count({ where: { status: "PENDING_APPROVAL", runtimeImpact: "PRODUCTION" } }),
    prisma.brainChangeRequest.count({ where: { status: { in: ["APPROVED", "REJECTED", "BACKLOG", "APPLIED", "ROLLED_BACK"] } } }),
  ]);
  return { pendingCount, highRiskCount, productionImpactCount, decidedCount };
}
