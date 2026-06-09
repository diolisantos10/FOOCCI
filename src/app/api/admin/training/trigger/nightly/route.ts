/**
 * POST /api/admin/training/trigger/nightly
 *
 * Admin-accessible endpoint to trigger the full nightly training pipeline:
 * AI scenarios + real conversation mining + GPT-4o evaluation + proposals.
 *
 * Runs asynchronously — returns immediately with runId.
 *
 * Auth: admin session (checkAdminRequest)
 * Safety: allowSideEffects=false · no WhatsApp · no orders · proposals = PENDING_APPROVAL
 */

import { NextRequest, NextResponse } from "next/server";
import { checkAdminRequest } from "@/lib/admin-auth";
import { prisma } from "@/lib/prisma";
import { generateBatch } from "@/services/agent-training/AgentTrainingScenarioGenerator";
import { createRun, runBatch, finalizeRun, failRun } from "@/services/agent-training/AgentTrainingRunnerService";
import { evaluateRun } from "@/services/agent-training/AgentTrainingEvaluatorService";
import { processRunForProposals } from "@/services/agent-training/AgentTrainingImprovementService";
import { mineRealConversations } from "@/services/agent-training/AgentTrainingConversationMiner";

export async function POST(req: NextRequest) {
  if (!checkAdminRequest(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const restaurant = await prisma.restaurant.findFirst({
    select: { id: true, name: true },
    orderBy: { createdAt: "asc" },
  });
  if (!restaurant) return NextResponse.json({ error: "No restaurant found" }, { status: 404 });

  const config = await prisma.agentTrainingConfig.findUnique({
    where: { agentType: "WHATSAPP_ORDERING" },
  });

  const useReal      = config?.useRealConversationMining ?? true;
  const useAi        = config?.useAiGeneratedScenarios   ?? true;
  const makeProposal = config?.autoCreateProposals        ?? true;

  const run = await createRun({
    agentType:    "WHATSAPP_ORDERING",
    source:       "MIXED",
    mode:         "NIGHTLY",
    restaurantId: restaurant.id,
  });

  void (async () => {
    try {
      const scenarios: Array<{
        title: string; persona: string; goal: string;
        messages: string[]; source: "AI_SIMULATION" | "REAL_CONVERSATION";
        sourceConversationId?: string; expectedOutcome?: Record<string, unknown>;
      }> = [];

      if (useAi) {
        const templates = generateBatch(20);
        for (const t of templates) {
          scenarios.push({
            title:           t.title,
            persona:         t.customerPersona,
            goal:            t.goal,
            messages:        t.messageSequence,
            source:          "AI_SIMULATION",
            expectedOutcome: t.expectedOutcome,
          });
        }
      }

      if (useReal) {
        const mined = await mineRealConversations({
          restaurantId:    restaurant.id,
          sinceHours:      48,
          maxConversations: 15,
        });
        for (const m of mined) {
          const msgs = m.transcriptJson
            .filter((t) => t.role === "customer")
            .map((t) => t.content)
            .slice(0, 8);
          if (msgs.length < 1) continue;
          scenarios.push({
            title:               m.title,
            persona:             m.customerPersona,
            goal:                m.goal,
            messages:            msgs,
            source:              "REAL_CONVERSATION",
            sourceConversationId: m.sourceConversationId,
            expectedOutcome:     m.expectedOutcomeJson,
          });
        }
      }

      if (scenarios.length > 0) {
        await runBatch({ runId: run.id, restaurantId: restaurant.id, scenarios });
        await evaluateRun(run.id);
      }

      await finalizeRun(run.id);

      if (makeProposal) {
        await processRunForProposals({
          runId:        run.id,
          agentType:    "WHATSAPP_ORDERING",
          restaurantId: restaurant.id,
        });
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error("[admin/training/trigger/nightly]", err);
      await failRun(run.id, msg);
    }
  })();

  return NextResponse.json({ ok: true, runId: run.id, status: "RUNNING" }, { status: 202 });
}
