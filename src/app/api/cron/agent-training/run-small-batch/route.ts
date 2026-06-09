/**
 * POST /api/cron/agent-training/run-small-batch
 *
 * Quick training batch: runs ~10 AI-generated scenarios for WHATSAPP_ORDERING.
 * Intended to run every 30-60 minutes.
 *
 * Auth: Authorization: Bearer {CRON_SECRET}
 *
 * SAFETY:
 *   allowSideEffects=false always
 *   no real WhatsApp, no real orders, no Pix
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { generateBatch } from "@/services/agent-training/AgentTrainingScenarioGenerator";
import { createRun, runBatch, finalizeRun, failRun } from "@/services/agent-training/AgentTrainingRunnerService";

function checkCronAuth(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  return req.headers.get("authorization") === `Bearer ${secret}`;
}

export async function POST(req: NextRequest) {
  if (!checkCronAuth(req)) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  // Check if continuous training is enabled for WHATSAPP_ORDERING
  const config = await prisma.agentTrainingConfig.findUnique({
    where: { agentType: "WHATSAPP_ORDERING" },
  });
  if (config && !config.enableContinuousTraining) {
    return NextResponse.json({ ok: true, skipped: true, reason: "continuous training disabled" });
  }

  // Pick a restaurant to train against
  const restaurant = await prisma.restaurant.findFirst({
    select: { id: true, slug: true, name: true },
    orderBy: { createdAt: "asc" },
  });
  if (!restaurant) {
    return NextResponse.json({ ok: false, error: "No restaurant found" }, { status: 404 });
  }

  const maxScenarios = config?.maxScenariosPerHour
    ? Math.min(10, config.maxScenariosPerHour)
    : 10;

  const run = await createRun({
    agentType:    "WHATSAPP_ORDERING",
    source:       "AI_SIMULATION",
    mode:         "QUICK",
    restaurantId: restaurant.id,
  });

  try {
    const templates = generateBatch(maxScenarios);
    const scenarios = templates.map((t) => ({
      title:           t.title,
      persona:         t.customerPersona,
      goal:            t.goal,
      messages:        t.messageSequence,
      source:          "AI_SIMULATION" as const,
      expectedOutcome: t.expectedOutcome,
    }));

    await runBatch({ runId: run.id, restaurantId: restaurant.id, scenarios });
    const finalRun = await finalizeRun(run.id);

    return NextResponse.json({
      ok:        true,
      runId:     run.id,
      total:     finalRun.totalScenarios,
      pass:      finalRun.passCount,
      warn:      finalRun.warnCount,
      fail:      finalRun.failCount,
      score:     finalRun.score,
      restaurant: restaurant.name,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[cron/agent-training/run-small-batch]", err);
    await failRun(run.id, msg);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
