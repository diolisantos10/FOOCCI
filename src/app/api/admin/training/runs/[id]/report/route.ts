/**
 * GET /api/admin/training/runs/[id]/report — copyable text report for a run
 */

import { NextRequest, NextResponse } from "next/server";
import { checkAdminRequest } from "@/lib/admin-auth";
import { prisma } from "@/lib/prisma";

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  if (!checkAdminRequest(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const run = await prisma.agentTrainingRun.findUnique({
    where:   { id: params.id },
    include: {
      scenarios: {
        select: { title: true, status: true, score: true, failureSummary: true, goal: true },
        orderBy: { createdAt: "asc" },
      },
      proposals: {
        select: { title: true, riskLevel: true, beforeScore: true, afterScoreEstimate: true, status: true },
      },
    },
  });
  if (!run) return NextResponse.json({ error: "Run não encontrado" }, { status: 404 });

  const { format } = Object.fromEntries(new URL(req.url).searchParams);

  const failures  = run.scenarios.filter((s) => s.status === "FAIL");
  const warnings  = run.scenarios.filter((s) => s.status === "WARN");

  // Group failures by goal
  const failByGoal = new Map<string, number>();
  for (const s of failures) {
    const key = s.goal ?? "UNKNOWN";
    failByGoal.set(key, (failByGoal.get(key) ?? 0) + 1);
  }

  const pendingProposals = run.proposals.filter((p) => p.status === "PENDING_APPROVAL");
  const hasSafetyIssue   = run.scenarios.some((s) => s.failureSummary?.includes("SAFETY VIOLATION"));

  const topFailures = Array.from(failByGoal.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([goal, count], i) => `  ${i + 1}. ${goal.replace(/_/g, " ")} (${count} caso${count > 1 ? "s" : ""})`)
    .join("\n");

  const proposalLines = pendingProposals
    .map((p) => `  - ${p.title} (risco ${p.riskLevel}, score ${p.beforeScore ?? "?"}→${p.afterScoreEstimate ?? "?"})`)
    .join("\n");

  const report = [
    "=== Agent Training Report ===",
    `Run ID:     ${run.id}`,
    `Agent:      ${run.agentType}`,
    `Mode:       ${run.mode ?? "QUICK"}`,
    `Source:     ${run.source}`,
    `Status:     ${run.status}`,
    `Iniciado:   ${run.startedAt?.toISOString() ?? "—"}`,
    `Concluído:  ${run.completedAt?.toISOString() ?? "—"}`,
    "",
    `Resultado: ${run.totalScenarios} cenários — Pass: ${run.passCount} | Warn: ${run.warnCount} | Fail: ${run.failCount}`,
    `Score geral: ${run.score !== null ? run.score.toFixed(2) : "—"}`,
    "",
    topFailures ? `Principais falhas:\n${topFailures}` : "Sem falhas.",
    "",
    `Segurança: ${hasSafetyIssue ? "⚠ SAFETY VIOLATION detectado" : "✓ 0 side effects. allowSideEffects=false enforced."}`,
    "",
    pendingProposals.length
      ? `Propostas pendentes (${pendingProposals.length}):\n${proposalLines}`
      : "Sem propostas pendentes.",
    "",
    `=== Fim do relatório ===`,
  ].join("\n");

  if (format === "json") {
    return NextResponse.json({
      runId:         run.id,
      agentType:     run.agentType,
      mode:          run.mode,
      source:        run.source,
      status:        run.status,
      startedAt:     run.startedAt,
      completedAt:   run.completedAt,
      totalScenarios: run.totalScenarios,
      passCount:     run.passCount,
      warnCount:     run.warnCount,
      failCount:     run.failCount,
      score:         run.score,
      topFailures:   Object.fromEntries(failByGoal),
      safetyOk:      !hasSafetyIssue,
      pendingProposals: pendingProposals.length,
      report,
    });
  }

  return new NextResponse(report, {
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}
