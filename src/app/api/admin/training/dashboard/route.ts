/**
 * GET /api/admin/training/dashboard — training center dashboard stats
 */

import { NextRequest, NextResponse } from "next/server";
import { checkAdminRequest } from "@/lib/admin-auth";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  if (!checkAdminRequest(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const since24h = new Date(Date.now() - 24 * 3_600_000);

  const [
    runsToday,
    activeRun,
    totalScenarios,
    passCount,
    warnCount,
    failCount,
    pendingProposals,
    latestRun,
  ] = await Promise.all([
    prisma.agentTrainingRun.count({ where: { createdAt: { gte: since24h } } }),
    prisma.agentTrainingRun.findFirst({ where: { status: "RUNNING" }, orderBy: { startedAt: "desc" } }),
    prisma.agentTrainingScenario.count(),
    prisma.agentTrainingScenario.count({ where: { status: "PASS" } }),
    prisma.agentTrainingScenario.count({ where: { status: "WARN" } }),
    prisma.agentTrainingScenario.count({ where: { status: "FAIL" } }),
    prisma.agentImprovementProposal.count({ where: { status: "PENDING_APPROVAL" } }),
    prisma.agentTrainingRun.findFirst({
      where:   { status: "COMPLETED" },
      orderBy: { completedAt: "desc" },
    }),
  ]);

  // Top failure categories from recent runs
  const recentFails = await prisma.agentTrainingScenario.findMany({
    where:   { status: "FAIL", createdAt: { gte: since24h } },
    select:  { goal: true },
    take:    100,
  });
  const failByGoal = new Map<string, number>();
  for (const s of recentFails) {
    const k = s.goal ?? "UNKNOWN";
    failByGoal.set(k, (failByGoal.get(k) ?? 0) + 1);
  }
  const topFailureCategories = Array.from(failByGoal.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([category, count]) => ({ category, count }));

  return NextResponse.json({
    activeRun:            activeRun ?? null,
    runsToday,
    totalScenarios,
    passCount,
    warnCount,
    failCount,
    latestScore:          latestRun?.score ?? null,
    pendingProposals,
    topFailureCategories,
    latestRun:            latestRun ?? null,
  });
}
