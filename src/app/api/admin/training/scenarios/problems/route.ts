/**
 * GET /api/admin/training/scenarios/problems
 *
 * Returns WARN/FAIL scenarios grouped by goal/category for the last 48h.
 * Used by the "Principais problemas" section in the Sugestões tab.
 */

import { NextRequest, NextResponse } from "next/server";
import { checkAdminRequest } from "@/lib/admin-auth";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  if (!checkAdminRequest(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const since = new Date(Date.now() - 48 * 60 * 60 * 1000);

  const scenarios = await prisma.agentTrainingScenario.findMany({
    where:  { status: { in: ["FAIL", "WARN"] }, createdAt: { gte: since } },
    select: { id: true, title: true, goal: true, status: true, score: true, createdAt: true },
    orderBy: { createdAt: "desc" },
  });

  const byGoal = new Map<string, typeof scenarios>();
  for (const s of scenarios) {
    const key = s.goal ?? "UNKNOWN";
    if (!byGoal.has(key)) byGoal.set(key, []);
    byGoal.get(key)!.push(s);
  }

  const groups = Array.from(byGoal.entries()).map(([category, items]) => {
    const scores = items.map(i => i.score).filter((s): s is number => s !== null);
    const avgScore = scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : null;
    return {
      category,
      count:      items.length,
      avgScore,
      scenarioIds: items.map(i => i.id),
      examples:   items.slice(0, 2).map(i => ({ id: i.id, title: i.title, status: i.status })),
      latestAt:   items[0]?.createdAt ?? null,
    };
  }).sort((a, b) => b.count - a.count);

  return NextResponse.json({ groups });
}
