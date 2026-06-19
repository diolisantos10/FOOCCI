/**
 * WhatsApp Learning Queue Service — read/list + approve/reject/backlog over the
 * WhatsApp learning suggestions (stored in WaiterTrainingSuggestion, isolated by
 * agentSlug). Approving a learning ONLY changes its status — it never alters the
 * live agent or production behavior. The next training round consumes APPROVED
 * learnings via the existing gate.
 */

import { prisma } from "@/lib/prisma";
import {
  WHATSAPP_LEARNING_AGENT_SLUG,
  WHATSAPP_LEARNING_SOURCE_TYPE,
  LEARNING_STATUS,
  type LearningStatus,
} from "./constants";

export interface LearningCardView {
  id: string;
  status: string;
  title: string;
  situationSummary: string;
  customerWanted: string;
  agentAnswered: string;
  problem: string;
  idealAnswer: string;
  learningRule: string;
  salesImpact: string;
  severity: "P0" | "P1" | "P2";
  suggestedAction: string;
  occurrences: number;
  technicalDetails: unknown;
  createdAt: string;
  updatedAt: string;
}

function riskToSeverity(risk: string): "P0" | "P1" | "P2" {
  return risk === "HIGH" ? "P0" : risk === "MEDIUM" ? "P1" : "P2";
}

function toView(row: {
  id: string; status: string; title: string; situationSummary: string;
  customerIntent: string; whatHappened: string; problemDetected: string;
  idealResponse: string; trainingRule: string; expectedImpact: string;
  suggestedActionType: string; riskLevel: string; technicalDetails: unknown;
  createdAt: Date; updatedAt: Date;
}): LearningCardView {
  const td = (row.technicalDetails ?? {}) as { occurrences?: number };
  return {
    id: row.id,
    status: row.status,
    title: row.title,
    situationSummary: row.situationSummary,
    customerWanted: row.customerIntent,
    agentAnswered: row.whatHappened,
    problem: row.problemDetected,
    idealAnswer: row.idealResponse,
    learningRule: row.trainingRule,
    salesImpact: row.expectedImpact,
    severity: riskToSeverity(row.riskLevel),
    suggestedAction: row.suggestedActionType,
    occurrences: td.occurrences ?? 1,
    technicalDetails: row.technicalDetails,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

const SELECT = {
  id: true, status: true, title: true, situationSummary: true, customerIntent: true,
  whatHappened: true, problemDetected: true, idealResponse: true, trainingRule: true,
  expectedImpact: true, suggestedActionType: true, riskLevel: true, technicalDetails: true,
  createdAt: true, updatedAt: true,
} as const;

/** Lists WhatsApp learnings, optionally filtered by status. */
export async function listLearnings(opts?: {
  restaurantId?: string;
  status?: LearningStatus;
}): Promise<LearningCardView[]> {
  const rows = await prisma.waiterTrainingSuggestion.findMany({
    where: {
      agentSlug: WHATSAPP_LEARNING_AGENT_SLUG,
      sourceType: WHATSAPP_LEARNING_SOURCE_TYPE,
      ...(opts?.restaurantId ? { restaurantId: opts.restaurantId } : {}),
      ...(opts?.status ? { status: opts.status } : {}),
    },
    orderBy: [{ riskLevel: "asc" }, { updatedAt: "desc" }],
    select: SELECT,
    take: 200,
  });
  return rows.map(toView);
}

export type LearningDecision = "APPROVE" | "REJECT" | "BACKLOG";

const DECISION_STATUS: Record<LearningDecision, LearningStatus> = {
  APPROVE: LEARNING_STATUS.APPROVED,
  REJECT: LEARNING_STATUS.REJECTED,
  BACKLOG: LEARNING_STATUS.BACKLOG,
};

/**
 * Applies a human decision to a learning. ONLY updates status + review metadata.
 * Does NOT touch the live agent, config, prompt, or any production behavior.
 */
export async function decideLearning(
  id: string,
  decision: LearningDecision,
  reviewedBy?: string,
): Promise<LearningCardView | null> {
  const existing = await prisma.waiterTrainingSuggestion.findFirst({
    where: { id, agentSlug: WHATSAPP_LEARNING_AGENT_SLUG },
    select: { id: true },
  });
  if (!existing) return null;

  const row = await prisma.waiterTrainingSuggestion.update({
    where: { id },
    data: {
      status: DECISION_STATUS[decision],
      reviewedAt: new Date(),
      reviewedBy: reviewedBy ?? "dashboard",
    },
    select: SELECT,
  });
  return toView(row);
}
