/**
 * POST /api/cron/agent-training/mine-real-conversations
 *
 * Mines recent real conversations and stores them as REAL_CONVERSATION training
 * scenarios in a dedicated REAL_CONVERSATION_REPLAY run.
 *
 * Auth: Authorization: Bearer {CRON_SECRET}
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { mineRealConversations } from "@/services/agent-training/AgentTrainingConversationMiner";
import { createRun, finalizeRun, failRun } from "@/services/agent-training/AgentTrainingRunnerService";

function checkCronAuth(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  return req.headers.get("authorization") === `Bearer ${secret}`;
}

export async function POST(req: NextRequest) {
  if (!checkCronAuth(req)) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const config = await prisma.agentTrainingConfig.findUnique({
    where: { agentType: "WHATSAPP_ORDERING" },
  });
  if (config && !config.useRealConversationMining) {
    return NextResponse.json({ ok: true, skipped: true, reason: "real conversation mining disabled" });
  }

  const restaurant = await prisma.restaurant.findFirst({
    select: { id: true, name: true },
    orderBy: { createdAt: "asc" },
  });
  if (!restaurant) {
    return NextResponse.json({ ok: false, error: "No restaurant found" }, { status: 404 });
  }

  const run = await createRun({
    agentType:    "WHATSAPP_ORDERING",
    source:       "REAL_CONVERSATION",
    mode:         "REAL_CONVERSATION_REPLAY",
    restaurantId: restaurant.id,
  });

  try {
    const mined = await mineRealConversations({
      restaurantId:    restaurant.id,
      sinceHours:      24,
      maxConversations: 20,
    });

    // Store mined scenarios directly (no runner execution — just store for review)
    for (const m of mined) {
      await prisma.agentTrainingScenario.create({
        data: {
          runId:               run.id,
          restaurantId:        m.restaurantId,
          source:              "REAL_CONVERSATION",
          sourceConversationId: m.sourceConversationId,
          title:               m.title,
          customerPersona:     m.customerPersona,
          goal:                m.goal,
          transcriptJson:      m.transcriptJson as unknown as Parameters<typeof prisma.agentTrainingScenario.create>[0]["data"]["transcriptJson"],
          expectedOutcomeJson: m.expectedOutcomeJson as unknown as Parameters<typeof prisma.agentTrainingScenario.create>[0]["data"]["expectedOutcomeJson"],
          status:              "PENDING",
        },
      });
    }

    // Update total count
    await prisma.agentTrainingRun.update({
      where: { id: run.id },
      data:  {
        totalScenarios: mined.length,
        completedAt:    new Date(),
        status:         "COMPLETED",
      },
    });

    return NextResponse.json({
      ok:         true,
      runId:      run.id,
      mined:      mined.length,
      restaurant: restaurant.name,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[cron/agent-training/mine-real-conversations]", err);
    await failRun(run.id, msg);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
