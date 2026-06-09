/**
 * POST /api/admin/training/scenarios/[id]/proposal
 *
 * Generates an improvement proposal from a single WARN/FAIL scenario.
 * Requires the scenario to have at least one evaluation.
 *
 * Auth: admin-protected (checkAdminRequest)
 * SAFETY: proposal is stored as PENDING_APPROVAL — never applied automatically.
 */

import { NextRequest, NextResponse } from "next/server";
import { checkAdminRequest } from "@/lib/admin-auth";
import { prisma } from "@/lib/prisma";
import { generateProposal } from "@/services/agent-training/AgentTrainingImprovementService";
import type { TranscriptTurn } from "@/services/agent-training/types";

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  if (!checkAdminRequest(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const scenario = await prisma.agentTrainingScenario.findUnique({
    where:   { id: params.id },
    include: { evaluations: { orderBy: { createdAt: "desc" }, take: 1 } },
  });

  if (!scenario) {
    return NextResponse.json({ error: "Cenário não encontrado" }, { status: 404 });
  }

  if (scenario.evaluations.length === 0) {
    return NextResponse.json(
      { error: "Gere um diagnóstico primeiro (POST /evaluate)." },
      { status: 400 },
    );
  }

  if (scenario.status === "PASS") {
    return NextResponse.json(
      { error: "Cenário com status PASS não precisa de proposta de melhoria." },
      { status: 400 },
    );
  }

  await generateProposal({
    runId:      scenario.runId,
    agentType:  "WHATSAPP_ORDERING",
    restaurantId: scenario.restaurantId ?? undefined,
    scenarios: [{
      id:            scenario.id,
      title:         scenario.title,
      failureSummary: scenario.failureSummary,
      transcript:    scenario.transcriptJson as unknown as TranscriptTurn[],
    }],
  });

  const proposal = await prisma.agentImprovementProposal.findFirst({
    where:   { sourceRunId: scenario.runId },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json({ ok: true, proposal });
}
