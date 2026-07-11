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
import type { TranscriptTurn } from "@/services/simulation/types";
import { reasonAboutWaiterCase } from "@/services/agents/reasoning/WaiterReasoningService";
import { mapReasoningToSuggestionFields } from "./reasoningSuggestionMapping";

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
export async function generatePendingTrainingSuggestions(
  agentSlug = AGENT,
  limit = 100,
  options: { useLLM?: boolean } = {},
): Promise<{ created: number; scanned: number }> {
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
    if (!customer) continue;

    // Reasoning Layer: intent guardrails + safe context + ideal answer + coherence.
    // Default to the deterministic path in batch (safe, cheap); admin can opt-in to LLM.
    const reasoning = await reasonAboutWaiterCase(
      {
        restaurantId: ex.restaurantId,
        customerMessage: customer,
        waiterResponse: waiter,
        sanitizedConversation: ex.sanitizedTranscript,
        sourceType: "REAL_CONVERSATION",
      },
      { useLLM: options.useLLM ?? false },
    ).catch(() => null);
    if (!reasoning) continue;

    const f = mapReasoningToSuggestionFields(reasoning, { customerExcerpt: customer, waiterExcerpt: waiter });
    try {
      await prisma.waiterTrainingSuggestion.create({
        data: {
          agentSlug, restaurantId: ex.restaurantId, sourceType: "REAL_CONVERSATION", sourceId: ex.id,
          status: "PENDING_REVIEW",
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
          sanitizedCustomerExcerpt: customer,
          sanitizedWaiterExcerpt: waiter,
          technicalDetails: f.technicalDetails as never,
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

/**
 * Inserts a learning DIRECTLY as APPROVED in the canonical pool. Only for flows
 * where a HUMAN already approved the underlying item (approved BrainChangeRequest
 * being applied, approved proposal/opportunity from the training inbox) — the
 * human decision happened upstream, this just materializes it as a reusable
 * learning. Never called by agents/system on their own.
 */
export async function insertApprovedLearning(params: {
  agentSlug: string;
  title: string;
  trainingRule: string;
  sourceType?: SuggestionSourceType;
  riskLevel?: "LOW" | "MEDIUM" | "HIGH";
  restaurantId?: string | null;
  /** Dedupe key — e.g. "cr:<id>" / "improvement:<id>" (unique agentSlug+sourceType+sourceId). */
  sourceId?: string | null;
  suggestedActionType?: string;
  approvedBy?: string | null;
}) {
  const trainingRule = params.trainingRule.trim();
  if (!trainingRule) throw new Error("insertApprovedLearning: trainingRule vazio.");
  const title = params.title.trim() || trainingRule.slice(0, 120);
  return prisma.waiterTrainingSuggestion.create({
    data: {
      agentSlug: params.agentSlug,
      restaurantId: params.restaurantId ?? null,
      sourceType: params.sourceType ?? "RESULT_EVIDENCE",
      sourceId: params.sourceId ?? null,
      status: "APPROVED",
      title,
      situationSummary: title,
      customerIntent: "N/A — regra aprovada diretamente por humano",
      whatHappened: "Aprovação humana direta (fila de aprovação / change request) — sem transcript de origem.",
      problemDetected: title,
      idealResponse: trainingRule,
      trainingRule,
      expectedImpact: "Agente passa a seguir a regra aprovada no atendimento.",
      suggestedActionType: params.suggestedActionType ?? "RESPONSE_PATTERN",
      riskLevel: params.riskLevel ?? "LOW",
      reviewedAt: new Date(),
      reviewedBy: params.approvedBy ?? "admin",
    },
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
