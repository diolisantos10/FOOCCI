/**
 * POST /api/admin/training/proposals/grouped
 *
 * Generates a grouped improvement proposal for a repeated failure category.
 *
 * Body: { category: string, scenarioIds: string[], agentType: string, restaurantId?: string }
 *
 * Auth: admin-protected
 * SAFETY: proposal stored as PENDING_APPROVAL — never applied automatically.
 */

import { NextRequest, NextResponse } from "next/server";
import { checkAdminRequest } from "@/lib/admin-auth";
import { prisma } from "@/lib/prisma";
import { generateProposal } from "@/services/agent-training/AgentTrainingImprovementService";
import type { AgentType, TranscriptTurn } from "@/services/agent-training/types";

export async function POST(req: NextRequest) {
  if (!checkAdminRequest(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json() as {
    category?:     string;
    scenarioIds?:  string[];
    agentType?:    string;
    restaurantId?: string;
    runId?:        string;
  };

  const { scenarioIds, agentType = "WHATSAPP_ORDERING", restaurantId, runId } = body;

  if (!scenarioIds || scenarioIds.length === 0) {
    return NextResponse.json({ error: "scenarioIds obrigatório" }, { status: 400 });
  }

  const scenarios = await prisma.agentTrainingScenario.findMany({
    where: { id: { in: scenarioIds } },
    select: { id: true, title: true, failureSummary: true, transcriptJson: true, runId: true },
  });

  if (scenarios.length === 0) {
    return NextResponse.json({ error: "Nenhum cenário encontrado" }, { status: 404 });
  }

  const sourceRunId = runId ?? scenarios[0]!.runId;

  await generateProposal({
    runId:       sourceRunId,
    agentType:   agentType as AgentType,
    restaurantId: restaurantId,
    scenarios:   scenarios.map((s) => ({
      id:            s.id,
      title:         s.title,
      failureSummary: s.failureSummary,
      transcript:    s.transcriptJson as unknown as TranscriptTurn[],
    })),
  });

  const proposal = await prisma.agentImprovementProposal.findFirst({
    where:   { sourceRunId },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json({ ok: true, proposal });
}
