/**
 * POST /api/cron/agent-training/run-nightly
 *
 * Nightly training batch: 30 AI-generated + real conversation scenarios,
 * runs evaluator on each, creates improvement proposals for failures.
 * Intended to run once per night.
 *
 * Auth: Authorization: Bearer {CRON_SECRET}
 *
 * SAFETY:
 *   allowSideEffects=false always
 *   proposals stored as PENDING_APPROVAL — never auto-applied to production
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { generateBatch } from "@/services/agent-training/AgentTrainingScenarioGenerator";
import { createRun, runBatch, finalizeRun, failRun } from "@/services/agent-training/AgentTrainingRunnerService";
import { evaluateRun } from "@/services/agent-training/AgentTrainingEvaluatorService";
import { processRunForProposals } from "@/services/agent-training/AgentTrainingImprovementService";
import { mineRealConversations } from "@/services/agent-training/AgentTrainingConversationMiner";

function checkCronAuth(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  return req.headers.get("authorization") === `Bearer ${secret}`;
}

export async function POST(req: NextRequest) {
  if (!checkCronAuth(req)) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const restaurant = await prisma.restaurant.findFirst({
    select: { id: true, slug: true, name: true },
    orderBy: { createdAt: "asc" },
  });
  if (!restaurant) {
    return NextResponse.json({ ok: false, error: "No restaurant found" }, { status: 404 });
  }

  const config = await prisma.agentTrainingConfig.findUnique({
    where: { agentType: "WHATSAPP_ORDERING" },
  });

  const useReal     = config?.useRealConversationMining   ?? true;
  const useAi       = config?.useAiGeneratedScenarios     ?? true;
  const makeProposal = config?.autoCreateProposals        ?? true;

  const run = await createRun({
    agentType:    "WHATSAPP_ORDERING",
    source:       "MIXED",
    mode:         "NIGHTLY",
    restaurantId: restaurant.id,
  });

  try {
    const scenarios: Array<{
      title: string; persona: string; goal: string;
      messages: string[]; source: "AI_SIMULATION" | "REAL_CONVERSATION";
      sourceConversationId?: string; expectedOutcome?: Record<string, unknown>;
    }> = [];

    // AI-generated
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

    // Real conversation replay
    if (useReal) {
      const mined = await mineRealConversations({
        restaurantId:    restaurant.id,
        sinceHours:      48,
        maxConversations: 15,
      });
      for (const m of mined) {
        const customerMessages = m.transcriptJson
          .filter((t) => t.role === "customer")
          .map((t) => t.content)
          .slice(0, 8); // cap to avoid overly long runs
        if (customerMessages.length < 1) continue;
        scenarios.push({
          title:               m.title,
          persona:             m.customerPersona,
          goal:                m.goal,
          messages:            customerMessages,
          source:              "REAL_CONVERSATION",
          sourceConversationId: m.sourceConversationId,
          expectedOutcome:     m.expectedOutcomeJson,
        });
      }
    }

    if (scenarios.length === 0) {
      await finalizeRun(run.id);
      return NextResponse.json({ ok: true, runId: run.id, total: 0, skipped: "no scenarios" });
    }

    await runBatch({ runId: run.id, restaurantId: restaurant.id, scenarios });

    // AI evaluation
    await evaluateRun(run.id);

    const finalRun = await finalizeRun(run.id);

    // Improvement proposals (PENDING_APPROVAL — never auto-applied)
    if (makeProposal) {
      await processRunForProposals({
        runId:       run.id,
        agentType:   "WHATSAPP_ORDERING",
        restaurantId: restaurant.id,
      });
    }

    const proposalCount = await prisma.agentImprovementProposal.count({
      where: { sourceRunId: run.id },
    });

    return NextResponse.json({
      ok:              true,
      runId:           run.id,
      total:           finalRun.totalScenarios,
      pass:            finalRun.passCount,
      warn:            finalRun.warnCount,
      fail:            finalRun.failCount,
      score:           finalRun.score,
      proposalsCreated: proposalCount,
      restaurant:      restaurant.name,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[cron/agent-training/run-nightly]", err);
    await failRun(run.id, msg);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
