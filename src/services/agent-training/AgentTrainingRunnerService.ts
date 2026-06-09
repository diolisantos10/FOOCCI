/**
 * AgentTrainingRunnerService
 *
 * Runs training scenarios through the WhatsApp state machine.
 * SAFETY INVARIANTS (never negotiable):
 *   allowSideEffects = false always
 *   no real WhatsApp messages
 *   no real orders / Pix
 */

import { prisma } from "@/lib/prisma";
import {
  processCustomerMessage,
  newTransientSession,
} from "@/services/whatsapp/ordering/WhatsAppTextOrderService";
import type { WaPersistedSession } from "@/services/whatsapp/ordering/types";
import type {
  AgentType,
  TrainingSource,
  TrainingMode,
  ScenarioStatus,
  TranscriptTurn,
  ScenarioRunResult,
} from "./types";

const SIMULATOR_PHONE = "+5511999990000";
const SIMULATOR_MODE  = "ALLOWLIST_REPLY_ONLY" as const;

// ── Create / manage runs ──────────────────────────────────────────────────────

export async function createRun(opts: {
  agentType:     AgentType;
  source:        TrainingSource;
  mode?:         TrainingMode;
  restaurantId?: string;
}) {
  return prisma.agentTrainingRun.create({
    data: {
      agentType:    opts.agentType,
      source:       opts.source,
      mode:         opts.mode ?? null,
      restaurantId: opts.restaurantId ?? null,
      status:       "RUNNING",
      startedAt:    new Date(),
    },
  });
}

export async function finalizeRun(runId: string) {
  const scenarios = await prisma.agentTrainingScenario.findMany({
    where:  { runId },
    select: { status: true, score: true },
  });

  const passCount  = scenarios.filter((s) => s.status === "PASS").length;
  const warnCount  = scenarios.filter((s) => s.status === "WARN").length;
  const failCount  = scenarios.filter((s) => s.status === "FAIL").length;
  const scores     = scenarios.map((s) => s.score).filter((s): s is number => s !== null);
  const avgScore   = scores.length ? scores.reduce((a, b) => a + b, 0) / scores.length : null;

  return prisma.agentTrainingRun.update({
    where: { id: runId },
    data:  {
      status:        "COMPLETED",
      completedAt:   new Date(),
      totalScenarios: scenarios.length,
      passCount,
      warnCount,
      failCount,
      score:         avgScore,
    },
  });
}

export async function failRun(runId: string, error: string) {
  return prisma.agentTrainingRun.update({
    where: { id: runId },
    data:  {
      status:      "FAILED",
      completedAt: new Date(),
      score:       null,
    },
  });
}

// ── Run a single scenario ─────────────────────────────────────────────────────

export async function runScenario(opts: {
  runId:        string;
  restaurantId: string;
  title:        string;
  persona:      string;
  goal:         string;
  messages:     string[];
  source:       TrainingSource;
  sourceConversationId?: string;
  expectedOutcome?: Record<string, unknown>;
}): Promise<ScenarioRunResult> {
  const scenario = await prisma.agentTrainingScenario.create({
    data: {
      runId:               opts.runId,
      restaurantId:        opts.restaurantId,
      source:              opts.source,
      sourceConversationId: opts.sourceConversationId ?? null,
      title:               opts.title,
      customerPersona:     opts.persona,
      goal:                opts.goal,
      transcriptJson:      [] as unknown as Parameters<typeof prisma.agentTrainingScenario.create>[0]["data"]["transcriptJson"],
      expectedOutcomeJson: (opts.expectedOutcome ?? null) as unknown as Parameters<typeof prisma.agentTrainingScenario.create>[0]["data"]["expectedOutcomeJson"],
      status:              "PENDING",
    },
  });

  const transcript: TranscriptTurn[] = [];
  let session: WaPersistedSession | null = newTransientSession({
    restaurantId: opts.restaurantId,
    phone:        SIMULATOR_PHONE,
    mode:         SIMULATOR_MODE,
  });

  let sideEffectsPerformed: string[] = [];
  let failureSummary: string | null = null;

  for (const msg of opts.messages) {
    const ts = new Date().toISOString();
    transcript.push({ role: "customer", content: msg, ts });

    try {
      const result = await processCustomerMessage({
        restaurantId:     opts.restaurantId,
        restaurantSlug:   opts.restaurantId, // runner uses id as slug fallback
        phone:            SIMULATOR_PHONE,
        messageText:      msg,
        mode:             SIMULATOR_MODE,
        currentSession:   session,
        allowSideEffects: false,             // ← never changes
      });

      session = result.session;
      sideEffectsPerformed = [...sideEffectsPerformed, ...(result.sideEffectsPerformed ?? [])];

      transcript.push({
        role:    "bot",
        content: result.suggestedReply,
        ts:      new Date().toISOString(),
        debug:   {
          stage:  result.stage,
          intent: result.intent,
        },
      });
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      transcript.push({
        role:    "bot",
        content: `[ERROR: ${errMsg}]`,
        ts:      new Date().toISOString(),
      });
      failureSummary = `Runtime error on message "${msg}": ${errMsg}`;
      break;
    }
  }

  // Sanity check: side effects must always be empty
  if (sideEffectsPerformed.length > 0) {
    failureSummary = `SAFETY VIOLATION: sideEffectsPerformed not empty: ${sideEffectsPerformed.join(", ")}`;
  }

  const finalStage = session?.stage ?? "IDLE";
  const actualOutcome: Record<string, unknown> = {
    finalStage,
    hasItems:         (session?.selectedItems?.length ?? 0) > 0,
    deliveryType:     session?.deliveryType ?? null,
    paymentMethod:    session?.paymentMethod ?? null,
    unresolvedItems:  session?.unresolvedItems?.length ?? 0,
    sideEffectsCount: sideEffectsPerformed.length,
  };

  // Preliminary PASS/WARN/FAIL based on safety and basic flow
  let status: ScenarioStatus = "PASS";
  let score: number | null = null;

  if (sideEffectsPerformed.length > 0) {
    status = "FAIL";
    score  = 0;
  } else if (failureSummary) {
    status = "FAIL";
    score  = 20;
  } else if ((session?.unresolvedItems?.length ?? 0) > 0 && opts.messages.length > 3) {
    status = "WARN";
    score  = 60;
  } else {
    status = "PASS";
    score  = 80; // preliminary — AI evaluator may adjust
  }

  await prisma.agentTrainingScenario.update({
    where: { id: scenario.id },
    data:  {
      transcriptJson:    transcript as unknown as Parameters<typeof prisma.agentTrainingScenario.update>[0]["data"]["transcriptJson"],
      actualOutcomeJson: actualOutcome as unknown as Parameters<typeof prisma.agentTrainingScenario.update>[0]["data"]["actualOutcomeJson"],
      status,
      score,
      failureSummary,
    },
  });

  return {
    transcript,
    finalSession:         session as unknown as Record<string, unknown> | null,
    finalStage,
    comanda:              null,
    sideEffectsPerformed,
    status,
    score,
    failureSummary,
    actualOutcome,
  };
}

// ── Run a batch of scenarios ──────────────────────────────────────────────────

export async function runBatch(opts: {
  runId:         string;
  restaurantId:  string;
  scenarios:     Array<{
    title:       string;
    persona:     string;
    goal:        string;
    messages:    string[];
    source:      TrainingSource;
    sourceConversationId?: string;
    expectedOutcome?: Record<string, unknown>;
  }>;
}) {
  const results: ScenarioRunResult[] = [];

  for (const s of opts.scenarios) {
    const result = await runScenario({
      runId:               opts.runId,
      restaurantId:        opts.restaurantId,
      title:               s.title,
      persona:             s.persona,
      goal:                s.goal,
      messages:            s.messages,
      source:              s.source,
      sourceConversationId: s.sourceConversationId,
      expectedOutcome:     s.expectedOutcome,
    });
    results.push(result);
  }

  return results;
}
