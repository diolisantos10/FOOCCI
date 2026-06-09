/**
 * POST /api/admin/training/trigger/mine
 *
 * Admin-accessible endpoint to trigger real conversation mining.
 * Stores mined conversations as training scenarios (no runner execution).
 *
 * Runs asynchronously — returns immediately with runId.
 *
 * Auth: admin session (checkAdminRequest)
 * Safety: read-only · PII masked · no WhatsApp · no customer mutation
 */

import { NextRequest, NextResponse } from "next/server";
import { checkAdminRequest } from "@/lib/admin-auth";
import { prisma } from "@/lib/prisma";
import { mineRealConversations } from "@/services/agent-training/AgentTrainingConversationMiner";
import { createRun, failRun } from "@/services/agent-training/AgentTrainingRunnerService";

export async function POST(req: NextRequest) {
  if (!checkAdminRequest(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const config = await prisma.agentTrainingConfig.findUnique({
    where: { agentType: "WHATSAPP_ORDERING" },
  });
  if (config && !config.useRealConversationMining) {
    return NextResponse.json({ ok: true, skipped: true, reason: "real conversation mining disabled in config" });
  }

  const restaurant = await prisma.restaurant.findFirst({
    select: { id: true, name: true },
    orderBy: { createdAt: "asc" },
  });
  if (!restaurant) return NextResponse.json({ error: "No restaurant found" }, { status: 404 });

  const run = await createRun({
    agentType:    "WHATSAPP_ORDERING",
    source:       "REAL_CONVERSATION",
    mode:         "REAL_CONVERSATION_REPLAY",
    restaurantId: restaurant.id,
  });

  void (async () => {
    try {
      const mined = await mineRealConversations({
        restaurantId:    restaurant.id,
        sinceHours:      24,
        maxConversations: 20,
      });

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

      await prisma.agentTrainingRun.update({
        where: { id: run.id },
        data:  { totalScenarios: mined.length, completedAt: new Date(), status: "COMPLETED" },
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error("[admin/training/trigger/mine]", err);
      await failRun(run.id, msg);
    }
  })();

  return NextResponse.json({ ok: true, runId: run.id, status: "RUNNING" }, { status: 202 });
}
