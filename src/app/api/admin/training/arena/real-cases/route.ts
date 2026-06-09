/**
 * GET /api/admin/training/arena/real-cases
 *
 * Returns recent AgentTrainingScenario records captured from live failures
 * (source = REAL_CONVERSATION or LIVE_FAILURE), for the Arena "Casos reais" section.
 */

import { NextRequest, NextResponse } from "next/server";
import { checkAdminRequest } from "@/lib/admin-auth";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  if (!checkAdminRequest(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const url    = new URL(req.url);
  const limit  = Math.min(50, parseInt(url.searchParams.get("limit") ?? "20", 10));

  const scenarios = await prisma.agentTrainingScenario.findMany({
    where: {
      source: { in: ["REAL_CONVERSATION", "LIVE_FAILURE"] },
    },
    orderBy: { createdAt: "desc" },
    take:    limit,
    select: {
      id:               true,
      title:            true,
      source:           true,
      status:           true,
      riskLevel:        true,
      goal:             true,
      restaurantId:     true,
      failureSummary:   true,
      createdAt:        true,
      actualOutcomeJson: true,
      transcriptJson:   true,
    },
  });

  // Extract failureCategory from actualOutcomeJson (stored there by captureFailure)
  const items = scenarios.map((s) => {
    const actual = s.actualOutcomeJson as Record<string, unknown> | null;
    return {
      id:              s.id,
      title:           s.title,
      source:          s.source,
      status:          s.status,
      riskLevel:       s.riskLevel ?? "MEDIUM",
      failureCategory: (actual?.failureCategory as string | null) ?? s.goal ?? "UNKNOWN",
      restaurantId:    s.restaurantId ?? null,
      failureSummary:  s.failureSummary ?? null,
      createdAt:       s.createdAt.toISOString(),
      transcriptLength: Array.isArray(s.transcriptJson)
        ? (s.transcriptJson as unknown[]).length
        : 0,
    };
  });

  return NextResponse.json({ ok: true, items, total: items.length });
}
