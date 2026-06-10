/**
 * WaiterTrainingSuggestionRegenerationService — re-runs OLD pending training
 * proposals through the new Agent Reasoning Layer, so stale/wrong proposals
 * (e.g. "Aceita Alelo Refeição?" classified as INDECISIVE) are corrected before
 * Diego approves them.
 *
 * Safe by design:
 *  • only touches status PENDING_REVIEW / BACKLOG — never APPROVED / REJECTED;
 *  • reasons over the ALREADY-SANITIZED excerpts stored on the suggestion (never
 *    re-reads raw conversation, never re-introduces PII);
 *  • preserves the row (id / sourceId / createdAt / status) — only the proposal
 *    content + technicalDetails are updated (history-friendly);
 *  • dry-run by default; never sends, never touches the runtime.
 */

import { prisma } from "@/lib/prisma";
import { reasonAboutWaiterCase } from "@/services/agents/reasoning/WaiterReasoningService";
import { mapReasoningToSuggestionFields } from "./reasoningSuggestionMapping";

const AGENT = "waiter";
const REGENERABLE = ["PENDING_REVIEW", "BACKLOG"] as const;
type RegenerableStatus = (typeof REGENERABLE)[number];

export interface RegenerateOptions {
  dryRun?: boolean;
  /** Subset of PENDING_REVIEW/BACKLOG — anything else is ignored for safety. */
  status?: string[];
  limit?: number;
  /** Use the LLM reasoning (default false: deterministic guardrails are enough). */
  useLLM?: boolean;
}

export interface IntentChangeSample {
  title: string;
  fromIntent: string;
  toIntent: string;
}

export interface RegenerateResult {
  ok: boolean;
  dryRun: boolean;
  found: number;
  wouldRegenerate: number;
  regenerated: number;
  /** APPROVED/REJECTED that are PRESERVED (never touched). */
  protectedApprovedRejected: number;
  intentChanged: number;
  intentChangeSamples: IntentChangeSample[];
  coherencePass: number;
  coherenceNeedsReviewOrHigh: number;
  reasoningMode: { LLM: number; FALLBACK: number };
  runtimeTouched: false;
}

function oldIntentOf(s: { customerIntent: string; technicalDetails: unknown }): string {
  const td = (s.technicalDetails ?? {}) as Record<string, unknown>;
  if (typeof td.primaryIntent === "string") return td.primaryIntent;
  if (typeof td.scenarioType === "string") return td.scenarioType;
  return s.customerIntent || "UNKNOWN";
}

export async function regenerateSuggestions(options: RegenerateOptions = {}): Promise<RegenerateResult> {
  const dryRun = options.dryRun !== false;
  const limit = Math.min(Math.max(options.limit ?? 100, 1), 500);
  const useLLM = options.useLLM ?? false;

  // Only PENDING_REVIEW / BACKLOG can be regenerated. Filter any APPROVED/REJECTED
  // out of the requested statuses so they can NEVER be overwritten.
  const requested = (options.status ?? [...REGENERABLE]).filter((s): s is RegenerableStatus =>
    (REGENERABLE as readonly string[]).includes(s),
  );
  const statuses = requested.length ? requested : [...REGENERABLE];

  const [rows, protectedApprovedRejected] = await Promise.all([
    prisma.waiterTrainingSuggestion.findMany({
      where: { agentSlug: AGENT, status: { in: statuses } },
      orderBy: { createdAt: "desc" },
      take: limit,
    }),
    prisma.waiterTrainingSuggestion.count({ where: { agentSlug: AGENT, status: { in: ["APPROVED", "REJECTED"] } } }),
  ]);

  let wouldRegenerate = 0;
  let regenerated = 0;
  let intentChanged = 0;
  let coherencePass = 0;
  let coherenceNeedsReviewOrHigh = 0;
  const reasoningMode = { LLM: 0, FALLBACK: 0 };
  const intentChangeSamples: IntentChangeSample[] = [];

  for (const s of rows) {
    const customer = s.sanitizedCustomerExcerpt;
    if (!customer || !customer.trim()) continue; // can't reason without the (sanitized) message

    const reasoning = await reasonAboutWaiterCase(
      {
        restaurantId: s.restaurantId,
        customerMessage: customer,
        waiterResponse: s.sanitizedWaiterExcerpt,
        sourceType: "REAL_CONVERSATION",
      },
      { useLLM },
    ).catch(() => null);
    if (!reasoning) continue;

    wouldRegenerate += 1;
    reasoningMode[reasoning.reasoningMode] += 1;

    const oldIntent = oldIntentOf(s);
    const newIntent = reasoning.primaryIntent;
    if (oldIntent !== newIntent) {
      intentChanged += 1;
      if (intentChangeSamples.length < 12) intentChangeSamples.push({ title: s.title, fromIntent: oldIntent, toIntent: newIntent });
    }
    if (reasoning.coherenceCheck.verdict === "PASS") coherencePass += 1;
    else coherenceNeedsReviewOrHigh += 1;

    if (!dryRun) {
      const f = mapReasoningToSuggestionFields(reasoning, {
        customerExcerpt: customer,
        waiterExcerpt: s.sanitizedWaiterExcerpt,
      });
      try {
        await prisma.waiterTrainingSuggestion.update({
          where: { id: s.id },
          // Preserve id / sourceId / status / createdAt. Update content + details only.
          data: {
            title: f.title,
            situationSummary: f.situationSummary,
            customerIntent: f.customerIntent,
            whatHappened: f.whatHappened,
            problemDetected: f.problemDetected,
            idealResponse: f.idealResponse,
            trainingRule: f.trainingRule,
            expectedImpact: f.expectedImpact,
            suggestedActionType: f.suggestedActionType,
            riskLevel: f.riskLevel,
            technicalDetails: { ...f.technicalDetails, regeneratedAt: new Date().toISOString() } as never,
          },
        });
        regenerated += 1;
      } catch {
        // skip a bad row without failing the batch
      }
    }
  }

  return {
    ok: true,
    dryRun,
    found: rows.length,
    wouldRegenerate,
    regenerated,
    protectedApprovedRejected,
    intentChanged,
    intentChangeSamples,
    coherencePass,
    coherenceNeedsReviewOrHigh,
    reasoningMode,
    runtimeTouched: false,
  };
}
