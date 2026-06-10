/**
 * realConversationIntake — "Coleta automática de casos reais".
 *
 * The recurring (cron-safe) entry point that feeds the Waiter Training Center with
 * REAL conversations, automatically: reads Conversation/Message READ-ONLY via the
 * existing SimulationExampleExtractor, which sanitizes every turn BEFORE persisting
 * (phone/name/email/address/CPF-CNPJ/order/tokens masked — raw transcript is never
 * stored), classifies the situation and creates a training case as PENDING_REVIEW.
 *
 * Idempotent: the extractor dedupes by source conversation id, so running the
 * intake twice never duplicates a case. Never mutates a conversation, never sends
 * anything, never touches the real runtime.
 */

import { prisma } from "@/lib/prisma";
import { extractExamples, type ExtractResult, type FetchConversations } from "./SimulationExampleExtractor";
import { generatePendingTrainingSuggestions } from "@/services/waiterTraining/WaiterTrainingSuggestionStore";

const AGENT = "waiter";

/** The intake cron runs daily at 06:15 UTC (≈ 03:15 BRT), before the simulation. */
export function nextIntakeEstimate(now: Date = new Date()): string {
  const next = new Date(now);
  next.setUTCHours(6, 15, 0, 0);
  if (next.getTime() <= now.getTime()) next.setUTCDate(next.getUTCDate() + 1);
  return next.toISOString();
}

export interface IntakeOptions {
  restaurantId?: string;
  /** Max conversations scanned per run (default 50). */
  limit?: number;
  /** Look-back window in days (default 2 — daily cadence with safety overlap). */
  days?: number;
}

export interface IntakeResult extends ExtractResult {
  agentSlug: string;
  intakeAt: string;
  nextIntakeEstimate: string;
  /** Training proposals generated from the (new + pending) real cases. */
  suggestionsCreated: number;
  runtimeTouched: false;
}

export async function intakeRealConversations(
  options: IntakeOptions = {},
  deps: { fetch?: FetchConversations } = {},
): Promise<IntakeResult> {
  const result = await extractExamples(
    { restaurantId: options.restaurantId, limit: options.limit ?? 50, days: options.days ?? 2 },
    deps,
  );
  // Each real case becomes a clear training PROPOSAL (problem + ideal response +
  // training rule + impact). Idempotent — only cases without a proposal get one.
  const suggestions = await generatePendingTrainingSuggestions(AGENT).catch(() => ({ created: 0, scanned: 0 }));
  return {
    ...result,
    agentSlug: AGENT,
    intakeAt: new Date().toISOString(),
    nextIntakeEstimate: nextIntakeEstimate(),
    suggestionsCreated: suggestions.created,
    runtimeTouched: false,
  };
}

/** Summary for the Training Center UI: last collection + today's volume. */
export interface IntakeStatus {
  lastIntakeAt: string | null;
  collectedToday: number;
  nextIntakeEstimate: string;
}

export async function getIntakeStatus(agentSlug = AGENT): Promise<IntakeStatus> {
  const startOfToday = new Date();
  startOfToday.setUTCHours(0, 0, 0, 0);
  const [latest, collectedToday] = await Promise.all([
    prisma.agentSimulationExample.findFirst({
      where: { agentSlug, sourceType: "REAL_CONVERSATION" },
      orderBy: { createdAt: "desc" },
      select: { createdAt: true },
    }),
    prisma.agentSimulationExample.count({
      where: { agentSlug, sourceType: "REAL_CONVERSATION", createdAt: { gte: startOfToday } },
    }),
  ]);
  return {
    lastIntakeAt: latest?.createdAt.toISOString() ?? null,
    collectedToday,
    nextIntakeEstimate: nextIntakeEstimate(),
  };
}
