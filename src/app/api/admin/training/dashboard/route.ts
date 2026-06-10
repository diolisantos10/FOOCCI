/**
 * GET /api/admin/training/dashboard — training center dashboard stats
 */

import { NextRequest, NextResponse } from "next/server";
import { checkAdminRequest } from "@/lib/admin-auth";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  if (!checkAdminRequest(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const since24h = new Date(Date.now() - 24 * 3_600_000);

  const sinceSod = new Date(new Date().setHours(0, 0, 0, 0));

  const [
    runsToday,
    activeRun,
    totalScenarios,
    passCount,
    warnCount,
    failCount,
    pendingProposals,
    latestRun,
    liveFailuresToday,
    approvedSandboxCandidates,
    latestRealFailure,
    trainingConfig,
    lastSmallBatchRun,
    lastNightlyRun,
    lastMiningRun,
    scenariosToday,
    warnFailToday,
    proposalsCreatedToday,
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
    prisma.agentTrainingScenario.count({
      where: {
        source:    { in: ["REAL_CONVERSATION", "LIVE_FAILURE"] },
        createdAt: { gte: sinceSod },
      },
    }),
    prisma.agentBrainVersion.count({ where: { status: "SANDBOX" } }),
    prisma.agentTrainingScenario.findFirst({
      where:   { source: { in: ["REAL_CONVERSATION", "LIVE_FAILURE"] } },
      orderBy: { createdAt: "desc" },
      select:  { id: true, title: true, status: true, riskLevel: true, createdAt: true },
    }),
    prisma.agentTrainingConfig.findUnique({ where: { agentType: "WHATSAPP_ORDERING" } }),
    prisma.agentTrainingRun.findFirst({
      where:   { mode: "QUICK", status: "COMPLETED" },
      orderBy: { completedAt: "desc" },
      select:  { completedAt: true },
    }),
    prisma.agentTrainingRun.findFirst({
      where:   { mode: "NIGHTLY", status: "COMPLETED" },
      orderBy: { completedAt: "desc" },
      select:  { completedAt: true },
    }),
    prisma.agentTrainingRun.findFirst({
      where:   { mode: "REAL_CONVERSATION_REPLAY", status: "COMPLETED" },
      orderBy: { completedAt: "desc" },
      select:  { completedAt: true },
    }),
    prisma.agentTrainingScenario.count({ where: { createdAt: { gte: sinceSod } } }),
    prisma.agentTrainingScenario.count({
      where: { status: { in: ["WARN", "FAIL"] }, createdAt: { gte: sinceSod } },
    }),
    prisma.agentImprovementProposal.count({ where: { createdAt: { gte: sinceSod } } }),
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

  // WARN/FAIL backlog: scenarios in last 7 days not covered by any proposal
  const since7d = new Date(Date.now() - 7 * 24 * 3_600_000);
  const [recentWarnFail, recentProposals, warnFailWithoutEval] = await Promise.all([
    prisma.agentTrainingScenario.findMany({
      where:  { status: { in: ["WARN", "FAIL"] }, createdAt: { gte: since7d } },
      select: { id: true },
      take:   500,
    }),
    prisma.agentImprovementProposal.findMany({
      where:  { createdAt: { gte: since7d } },
      select: { sourceScenarioIds: true },
    }),
    prisma.agentTrainingScenario.count({
      where: {
        status:      { in: ["WARN", "FAIL"] },
        createdAt:   { gte: since7d },
        evaluations: { none: {} },
      },
    }),
  ]);
  const coveredIds = new Set(
    recentProposals.flatMap((p) => (p.sourceScenarioIds as string[] | null) ?? []),
  );
  const unproposedWarnFail = recentWarnFail.filter((s) => !coveredIds.has(s.id)).length;

  return NextResponse.json({
    activeRun:                 activeRun ?? null,
    runsToday,
    totalScenarios,
    passCount,
    warnCount,
    failCount,
    latestScore:               latestRun?.score ?? null,
    pendingProposals,
    topFailureCategories,
    latestRun:                 latestRun ?? null,
    liveFailuresToday,
    approvedSandboxCandidates,
    latestRealFailure:         latestRealFailure
      ? { ...latestRealFailure, createdAt: latestRealFailure.createdAt.toISOString() }
      : null,
    // Continuous training status
    continuousEnabled:         trainingConfig?.enableContinuousTraining ?? false,
    lastSmallBatch:            lastSmallBatchRun?.completedAt?.toISOString() ?? null,
    lastNightlyBatch:          lastNightlyRun?.completedAt?.toISOString()    ?? null,
    lastMiningRun:             lastMiningRun?.completedAt?.toISOString()     ?? null,
    scenariosToday,
    warnFailToday,
    proposalsCreatedToday,
    // Pipeline backlog (7-day window)
    unproposedWarnFail,
    warnFailWithoutEval,
    automationHealth: {
      autoDiagnoseOnFailure: trainingConfig?.autoDiagnoseOnFailure ?? true,
      autoCreateProposals:   trainingConfig?.autoCreateProposals   ?? true,
      continuousEnabled:     trainingConfig?.enableContinuousTraining ?? false,
    },
  });
}
