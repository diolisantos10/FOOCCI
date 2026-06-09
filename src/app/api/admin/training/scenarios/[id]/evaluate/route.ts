/**
 * POST /api/admin/training/scenarios/[id]/evaluate
 *
 * Triggers GPT-4o evaluation for a single scenario.
 * Returns the new AgentTrainingEvaluation.
 *
 * Auth: admin-protected (checkAdminRequest)
 * SAFETY: read-only — no side effects, no production changes.
 */

import { NextRequest, NextResponse } from "next/server";
import { checkAdminRequest } from "@/lib/admin-auth";
import { prisma } from "@/lib/prisma";
import { evaluateScenario } from "@/services/agent-training/AgentTrainingEvaluatorService";
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

  if (scenario.status === "PENDING") {
    return NextResponse.json(
      { error: "Cenário ainda está PENDING — aguarde o runner finalizar." },
      { status: 400 },
    );
  }

  await evaluateScenario({
    scenarioId:      scenario.id,
    transcript:      scenario.transcriptJson as unknown as TranscriptTurn[],
    expectedOutcome: scenario.expectedOutcomeJson as unknown as Record<string, unknown> | undefined,
  });

  const evaluation = await prisma.agentTrainingEvaluation.findFirst({
    where:   { scenarioId: scenario.id },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json({ ok: true, evaluation });
}
