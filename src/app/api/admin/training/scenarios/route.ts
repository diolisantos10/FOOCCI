/**
 * GET /api/admin/training/scenarios — list scenarios (filter by runId, status)
 */

import { NextRequest, NextResponse } from "next/server";
import { checkAdminRequest } from "@/lib/admin-auth";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  if (!checkAdminRequest(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const runId  = searchParams.get("runId")  ?? undefined;
  const status = searchParams.get("status") ?? undefined;
  const page   = Math.max(1, parseInt(searchParams.get("page") ?? "1", 10));

  const where: Record<string, unknown> = {};
  if (runId)  where.runId  = runId;
  if (status) where.status = status;

  const [scenarios, total] = await Promise.all([
    prisma.agentTrainingScenario.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip:    (page - 1) * 20,
      take:    20,
      select: {
        id: true, runId: true, title: true, status: true, score: true,
        customerPersona: true, goal: true, source: true, riskLevel: true,
        failureSummary: true, createdAt: true,
      },
    }),
    prisma.agentTrainingScenario.count({ where }),
  ]);

  return NextResponse.json({ scenarios, total, page });
}
