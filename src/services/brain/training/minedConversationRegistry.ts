/**
 * minedConversationRegistry — cross-table dedupe for the 4 conversation miners.
 *
 * Problem: 4 miners write to 3 different tables from the SAME pool of real
 * conversations, so one conversation could spawn pending items in 2+ approval
 * queues at once. This registry answers "was this conversation already mined
 * by another lane?" so the FIRST miner to claim a conversation wins.
 *
 * Implemented WITHOUT a new table: the durable "mark" is the row each miner
 * already writes. The registry checks existence across the 3 sinks:
 *   1. AgentTrainingScenario.sourceConversationId   (training lane)
 *   2. WaiterTrainingSuggestion.technicalDetails.exampleConversationIds
 *      (agentSlug = whatsapp learning — whatsapp lane)
 *   3. AgentSimulationExample.sourceId              (waiter-intake lane)
 *
 * Lanes, not purposes, define ownership: SIMULATION_EXAMPLE and
 * WAITER_SUGGESTION share the waiter-intake lane because
 * generatePendingTrainingSuggestions intentionally DERIVES suggestions from
 * AgentSimulationExample rows — that pipeline step is not a duplicate.
 *
 * Fail-open by design: a failing existence check degrades to "not mined" so a
 * DB hiccup never silently halts mining. READ-ONLY — never writes anything.
 */

import { prisma } from "@/lib/prisma";
import { WHATSAPP_LEARNING_AGENT_SLUG } from "@/services/whatsapp/learning/constants";

/** Who is asking / who mined. One value per miner integration point. */
export type MinerPurpose =
  | "TRAINING_SCENARIO" // AgentTrainingConversationMiner → AgentTrainingScenario
  | "WHATSAPP_LEARNING" // liveLearningReview → WaiterTrainingSuggestion (whatsapp slug)
  | "SIMULATION_EXAMPLE" // realConversationIntake/extractExamples → AgentSimulationExample
  | "WAITER_SUGGESTION"; // generatePendingTrainingSuggestions (derives from examples)

type MiningLane = "TRAINING" | "WHATSAPP" | "WAITER_INTAKE";

const LANE_OF_PURPOSE: Record<MinerPurpose, MiningLane> = {
  TRAINING_SCENARIO: "TRAINING",
  WHATSAPP_LEARNING: "WHATSAPP",
  SIMULATION_EXAMPLE: "WAITER_INTAKE",
  WAITER_SUGGESTION: "WAITER_INTAKE",
};

// ── In-process marks ─────────────────────────────────────────────────────────
// Cheap same-run visibility (e.g. a nightly job running two miners in sequence
// before the first write is queried back). Bounded so it can never grow
// unchecked in a long-lived process. The DB row remains the durable mark.

const MAX_LOCAL_MARKS = 5000;
const localMarks = new Map<string, Set<MiningLane>>();

/**
 * Records that `conversationId` was just mined for `purpose`. In-process only —
 * the durable mark is the row the miner itself persisted.
 */
export function markConversationMined(conversationId: string, purpose: MinerPurpose): void {
  if (!conversationId) return;
  const lane = LANE_OF_PURPOSE[purpose];
  const existing = localMarks.get(conversationId);
  if (existing) {
    existing.add(lane);
    return;
  }
  if (localMarks.size >= MAX_LOCAL_MARKS) {
    // Drop the oldest entry (Map preserves insertion order).
    const oldest = localMarks.keys().next().value;
    if (oldest !== undefined) localMarks.delete(oldest);
  }
  localMarks.set(conversationId, new Set([lane]));
}

/** Test hook — clears the in-process marks between test cases. */
export function resetMinedConversationRegistry(): void {
  localMarks.clear();
}

// ── Existence checks (READ-ONLY, fail-open) ─────────────────────────────────

async function safeExists(fn: () => Promise<unknown>): Promise<boolean> {
  try {
    return Boolean(await fn());
  } catch {
    return false; // fail-open: never block mining on a broken check
  }
}

async function lanesFor(conversationId: string): Promise<Set<MiningLane>> {
  const lanes = new Set<MiningLane>(localMarks.get(conversationId) ?? []);

  const checks: Array<[MiningLane, () => Promise<unknown>]> = [
    [
      "TRAINING",
      () =>
        prisma.agentTrainingScenario.findFirst({
          where: { source: "REAL_CONVERSATION", sourceConversationId: conversationId },
          select: { id: true },
        }),
    ],
    [
      "WHATSAPP",
      () =>
        prisma.waiterTrainingSuggestion.findFirst({
          where: {
            agentSlug: WHATSAPP_LEARNING_AGENT_SLUG,
            technicalDetails: { path: ["exampleConversationIds"], array_contains: [conversationId] },
          },
          select: { id: true },
        }),
    ],
    [
      "WAITER_INTAKE",
      () =>
        prisma.agentSimulationExample.findFirst({
          where: { sourceType: "REAL_CONVERSATION", sourceId: conversationId },
          select: { id: true },
        }),
    ],
  ];

  const pending = checks.filter(([lane]) => !lanes.has(lane));
  const results = await Promise.all(pending.map(([, fn]) => safeExists(fn)));
  pending.forEach(([lane], i) => {
    if (results[i]) lanes.add(lane);
  });
  return lanes;
}

/**
 * True when ANOTHER lane already mined this conversation — the caller should
 * skip it (first miner wins). The caller's own lane never blocks itself, so
 * each miner's internal idempotence/dedup keeps working unchanged.
 */
export async function wasConversationMined(conversationId: string, purpose: MinerPurpose): Promise<boolean> {
  if (!conversationId) return false;
  const ownLane = LANE_OF_PURPOSE[purpose];
  const lanes = await lanesFor(conversationId);
  for (const lane of lanes) {
    if (lane !== ownLane) return true;
  }
  return false;
}
