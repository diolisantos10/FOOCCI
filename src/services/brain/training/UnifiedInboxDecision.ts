/**
 * UnifiedInboxDecision — routes ONE human APPROVE/REJECT from the Caixa Única
 * (the 7-source Unified Approval Inbox) to the correct source-of-truth.
 *
 * Governance rules enforced here:
 *  • reviewedBy is REQUIRED and must identify a real human — generic identities
 *    (admin/agent/system/bot/ai) are rejected;
 *  • BRAIN_CHANGE_REQUEST goes through reviewChangeRequest (which re-enforces
 *    the human-reviewer rule and the status machine);
 *  • approving NEVER applies anything to production — every write here is
 *    triage only (status + audit trail), exactly like each source's own
 *    review endpoint.
 */

import { prisma } from "@/lib/prisma";
import { reviewChangeRequest } from "@/services/brain/director/PersistentBrainDirectorService";
import { reviewSuggestion } from "@/services/waiterTraining/WaiterTrainingSuggestionStore";
import { reviewExample } from "@/services/simulation/examples/SimulationExampleStore";
import type { InboxSource } from "./UnifiedApprovalInbox";

export type InboxDecision = "APPROVE" | "REJECT";

export interface DecideInboxItemInput {
  source: InboxSource;
  id: string;
  decision: InboxDecision;
  reviewedBy: string;
}

export interface DecideInboxItemResult {
  ok: true;
  source: InboxSource;
  id: string;
  decision: InboxDecision;
  /** The status the underlying row was moved to. */
  status: string;
  runtimeTouched: false;
}

/** Identities that don't name a human — refused for every decision. */
const GENERIC_REVIEWERS = /^(admin|agent|system|bot|ai)$/i;

const VALID_SOURCES: InboxSource[] = [
  "BRAIN_CHANGE_REQUEST",
  "WHATSAPP_LEARNING",
  "WAITER_TRAINING",
  "AGENT_IMPROVEMENT_PROPOSAL",
  "SIMULATION_EXAMPLE",
  "SIMULATION_OPPORTUNITY",
  "KNOWLEDGE_ITEM",
];

export function isInboxSource(v: unknown): v is InboxSource {
  return typeof v === "string" && (VALID_SOURCES as string[]).includes(v);
}

/** Validates the reviewer identity; throws for empty or generic names. */
export function validateReviewer(raw: unknown): string {
  const reviewer = typeof raw === "string" ? raw.trim() : "";
  if (!reviewer || GENERIC_REVIEWERS.test(reviewer)) {
    throw new Error(
      "reviewedBy é obrigatório e deve identificar um humano — nomes genéricos (admin/agent/system/bot/ai) são recusados.",
    );
  }
  return reviewer;
}

export async function decideInboxItem(input: DecideInboxItemInput): Promise<DecideInboxItemResult> {
  const { source, id, decision } = input;
  if (!isInboxSource(source)) throw new Error(`source inválido: ${String(source)}`);
  if (!id || typeof id !== "string") throw new Error("id é obrigatório.");
  if (decision !== "APPROVE" && decision !== "REJECT") throw new Error("decision deve ser APPROVE ou REJECT.");
  const reviewer = validateReviewer(input.reviewedBy);

  const approved = decision === "APPROVE";
  const now = new Date();
  let status: string;

  switch (source) {
    case "BRAIN_CHANGE_REQUEST": {
      // Human-only decision — the service re-validates and never applies anything.
      status = approved ? "APPROVED" : "REJECTED";
      await reviewChangeRequest({ id, action: approved ? "APPROVED" : "REJECTED", reviewedBy: reviewer });
      break;
    }

    case "WAITER_TRAINING":
    case "WHATSAPP_LEARNING": {
      // Same table, isolated by agentSlug — same review function for both queues.
      status = approved ? "APPROVED" : "REJECTED";
      await reviewSuggestion(id, approved ? "APPROVED" : "REJECTED", reviewer);
      break;
    }

    case "AGENT_IMPROVEMENT_PROPOSAL": {
      // Mirrors PATCH /api/admin/training/proposals/[id] (approvedBy/approvedAt on approval).
      status = approved ? "APPROVED" : "REJECTED";
      await prisma.agentImprovementProposal.update({
        where: { id },
        data: {
          status,
          approvedBy: approved ? reviewer : undefined,
          approvedAt: approved ? now : undefined,
        },
      });
      break;
    }

    case "SIMULATION_EXAMPLE": {
      // reviewExample also flips isApprovedForSimulation (only APPROVED fuels the generator).
      status = approved ? "APPROVED" : "REJECTED";
      await reviewExample(id, approved ? "APPROVED" : "REJECTED", reviewer);
      break;
    }

    case "SIMULATION_OPPORTUNITY": {
      status = approved ? "APPROVED" : "REJECTED";
      await prisma.agentSimulationOpportunity.update({
        where: { id },
        data: { status: approved ? "APPROVED" : "REJECTED", reviewedBy: reviewer, reviewedAt: now },
      });
      break;
    }

    case "KNOWLEDGE_ITEM": {
      // Lifecycle: SUGGESTED → ACTIVE (approve) | REJECTED (reject).
      status = approved ? "ACTIVE" : "REJECTED";
      await prisma.restaurantKnowledgeItem.update({
        where: { id },
        data: { status },
      });
      break;
    }
  }

  return { ok: true, source, id, decision, status, runtimeTouched: false };
}
