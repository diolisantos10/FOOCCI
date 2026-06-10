/**
 * WaiterTrainingSuggestionStore — persists/reads/reviews the training proposals
 * built from real cases (and later simulations/library/evidence).
 *
 * Approval is a HUMAN decision that records an "approved learning". It does NOT
 * touch the real runtime, the live prompt, or activate anything — approved
 * learnings are a reusable pool (technique drafting, Library-Assisted versions,
 * simulator fuel) consumed only via the existing governed paths.
 */

import { prisma } from "@/lib/prisma";
import { buildTrainingProposal } from "./WaiterRealCaseTrainingBuilder";
import type { TranscriptTurn } from "@/services/simulation/types";

const AGENT = "waiter";

export type SuggestionStatus = "PENDING_REVIEW" | "APPROVED" | "REJECTED" | "BACKLOG";
export type SuggestionSourceType = "REAL_CONVERSATION" | "SIMULATION" | "LIBRARY" | "RESULT_EVIDENCE";

function firstExcerpts(sanitizedTranscript: string | null): { customer: string | null; waiter: string | null } {
  if (!sanitizedTranscript) return { customer: null, waiter: null };
  try {
    const turns = JSON.parse(sanitizedTranscript) as TranscriptTurn[];
    return {
      customer: turns.find((t) => t.role === "customer")?.content ?? null,
      waiter: turns.find((t) => t.role === "agent")?.content ?? null,
    };
  } catch {
    return { customer: null, waiter: null };
  }
}

/**
 * Generates training proposals for REAL_CONVERSATION cases that don't have one yet.
 * Idempotent via the unique (agentSlug, sourceType, sourceId) constraint. Reads the
 * already-sanitized examples — never touches raw data.
 */
export async function generatePendingTrainingSuggestions(agentSlug = AGENT, limit = 100): Promise<{ created: number; scanned: number }> {
  const examples = await prisma.agentSimulationExample.findMany({
    where: { agentSlug, sourceType: "REAL_CONVERSATION" },
    orderBy: { createdAt: "desc" },
    take: Math.min(Math.max(limit, 1), 500),
    select: {
      id: true, restaurantId: true, intent: true, scenarioType: true, sanitizedTranscript: true,
    },
  });

  if (examples.length === 0) return { created: 0, scanned: 0 };

  const existing = await prisma.waiterTrainingSuggestion.findMany({
    where: { agentSlug, sourceType: "REAL_CONVERSATION", sourceId: { in: examples.map((e) => e.id) } },
    select: { sourceId: true },
  });
  const seen = new Set(existing.map((e) => e.sourceId));

  let created = 0;
  for (const ex of examples) {
    if (seen.has(ex.id)) continue;
    const { customer, waiter } = firstExcerpts(ex.sanitizedTranscript);
    const p = buildTrainingProposal({
      scenarioType: ex.scenarioType,
      customerIntent: ex.intent,
      customerExcerpt: customer,
      waiterExcerpt: waiter,
    });
    try {
      await prisma.waiterTrainingSuggestion.create({
        data: {
          agentSlug, restaurantId: ex.restaurantId, sourceType: "REAL_CONVERSATION", sourceId: ex.id,
          status: "PENDING_REVIEW",
          title: p.title,
          situationSummary: p.situationSummary,
          customerIntent: ex.intent,
          whatHappened: waiter ? `O Waiter respondeu: “${waiter}”` : "Não há resposta registrada do Waiter neste trecho.",
          problemDetected: p.problemDetected,
          idealResponse: p.idealResponse,
          trainingRule: p.trainingRule,
          expectedImpact: p.expectedImpact,
          suggestedActionType: p.suggestedActionType,
          riskLevel: p.riskLevel,
          sanitizedCustomerExcerpt: customer,
          sanitizedWaiterExcerpt: waiter,
          technicalDetails: { scenarioType: ex.scenarioType, source: "real-case-builder" } as never,
        },
      });
      created += 1;
      seen.add(ex.id);
    } catch {
      // unique race / bad row — skip without failing the batch
    }
  }
  return { created, scanned: examples.length };
}

export async function listSuggestions(params: { agentSlug?: string; status?: SuggestionStatus; limit?: number } = {}) {
  const agentSlug = params.agentSlug ?? AGENT;
  return prisma.waiterTrainingSuggestion.findMany({
    where: { agentSlug, ...(params.status ? { status: params.status } : {}) },
    orderBy: { createdAt: "desc" },
    take: Math.min(Math.max(params.limit ?? 50, 1), 200),
  });
}

export async function suggestionStats(agentSlug = AGENT) {
  const [total, pending, approved, rejected] = await Promise.all([
    prisma.waiterTrainingSuggestion.count({ where: { agentSlug } }),
    prisma.waiterTrainingSuggestion.count({ where: { agentSlug, status: "PENDING_REVIEW" } }),
    prisma.waiterTrainingSuggestion.count({ where: { agentSlug, status: "APPROVED" } }),
    prisma.waiterTrainingSuggestion.count({ where: { agentSlug, status: "REJECTED" } }),
  ]);
  return { total, pending, approved, rejected };
}

/**
 * Human review. Approving only records the decision — it NEVER changes the runtime
 * or the live prompt. The approved row becomes part of the reusable learning pool.
 */
export async function reviewSuggestion(id: string, status: SuggestionStatus, reviewedBy?: string | null) {
  return prisma.waiterTrainingSuggestion.update({
    where: { id },
    data: { status, reviewedAt: new Date(), reviewedBy: reviewedBy ?? null },
  });
}

/** The "approved learning" pool — reusable downstream (technique/version/simulator). */
export async function listApprovedLearnings(agentSlug = AGENT, limit = 100) {
  return prisma.waiterTrainingSuggestion.findMany({
    where: { agentSlug, status: "APPROVED" },
    orderBy: { reviewedAt: "desc" },
    take: Math.min(Math.max(limit, 1), 500),
    select: { id: true, title: true, trainingRule: true, suggestedActionType: true, riskLevel: true, sourceType: true },
  });
}
