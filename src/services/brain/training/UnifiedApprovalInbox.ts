/**
 * Unified Approval Inbox — READ-ONLY aggregation of every pending approval
 * queue in the Brain ecosystem into one normalized list for the human reviewer.
 *
 * v1 NEVER moves the writes: approving/rejecting still happens in each source's
 * own service/endpoint. This module only reads, normalizes and deduplicates.
 *
 * Sources aggregated (each isolated in its own try/catch — an unavailable
 * source degrades to count 0 and never breaks the inbox):
 *   1. BrainChangeRequest            status PENDING_APPROVAL (Brain Director)
 *   2. WaiterTrainingSuggestion      status PENDING_REVIEW, agentSlug = whatsapp
 *      (WhatsApp learning queue — same table, isolated by agentSlug)
 *   3. WaiterTrainingSuggestion      status PENDING_REVIEW, other agentSlugs
 *      (waiter training suggestions)
 *   4. AgentImprovementProposal      status PENDING_APPROVAL (Training Center)
 *   5. AgentSimulationExample        status PENDING_REVIEW (Simulation Lab)
 *   6. AgentSimulationOpportunity    status PENDING_REVIEW (Simulation Lab)
 *   7. RestaurantKnowledgeItem       status SUGGESTED (knowledge base)
 */

import { prisma } from "@/lib/prisma";
import { WHATSAPP_LEARNING_AGENT_SLUG } from "@/services/whatsapp/learning/constants";

// ── Public types ─────────────────────────────────────────────────────────────

export type InboxSource =
  | "BRAIN_CHANGE_REQUEST"
  | "WHATSAPP_LEARNING"
  | "WAITER_TRAINING"
  | "AGENT_IMPROVEMENT_PROPOSAL"
  | "SIMULATION_EXAMPLE"
  | "SIMULATION_OPPORTUNITY"
  | "KNOWLEDGE_ITEM";

export interface UnifiedInboxItem {
  source: InboxSource;
  id: string;
  title: string;
  summary: string;
  riskLevel?: string;
  createdAt: Date;
  conversationId?: string;
}

export interface UnifiedInbox {
  items: UnifiedInboxItem[];
  countsBySource: Record<InboxSource, number>;
  totalPending: number;
  duplicatesCollapsed: number;
}

// ── Dedupe priority — lower number wins when two sources share a conversation.
// BrainChangeRequest > training queues > simulation > knowledge, per governance.
const SOURCE_PRIORITY: Record<InboxSource, number> = {
  BRAIN_CHANGE_REQUEST: 0,
  WHATSAPP_LEARNING: 1,
  WAITER_TRAINING: 2,
  AGENT_IMPROVEMENT_PROPOSAL: 3,
  SIMULATION_EXAMPLE: 4,
  SIMULATION_OPPORTUNITY: 5,
  KNOWLEDGE_ITEM: 6,
};

const ALL_SOURCES: InboxSource[] = [
  "BRAIN_CHANGE_REQUEST",
  "WHATSAPP_LEARNING",
  "WAITER_TRAINING",
  "AGENT_IMPROVEMENT_PROPOSAL",
  "SIMULATION_EXAMPLE",
  "SIMULATION_OPPORTUNITY",
  "KNOWLEDGE_ITEM",
];

// ── Helpers ──────────────────────────────────────────────────────────────────

function asString(v: unknown): string | undefined {
  return typeof v === "string" && v.length > 0 ? v : undefined;
}

/** Extracts the first conversation id from a WaiterTrainingSuggestion.technicalDetails Json. */
function conversationFromTechnicalDetails(td: unknown): string | undefined {
  if (!td || typeof td !== "object") return undefined;
  const ids = (td as { exampleConversationIds?: unknown }).exampleConversationIds;
  if (Array.isArray(ids)) return asString(ids[0]);
  return asString((td as { conversationId?: unknown }).conversationId);
}

interface SourceResult {
  items: UnifiedInboxItem[];
  pendingCount: number;
}

const EMPTY: SourceResult = { items: [], pendingCount: 0 };

/** Runs one source fetcher; any failure degrades to an empty result. */
async function safeFetch(fn: () => Promise<SourceResult>): Promise<SourceResult> {
  try {
    return await fn();
  } catch {
    return EMPTY;
  }
}

// ── Per-source fetchers (READ-ONLY) ─────────────────────────────────────────

async function fetchBrainChangeRequests(limit: number): Promise<SourceResult> {
  const where = { status: "PENDING_APPROVAL" };
  const [rows, pendingCount] = await Promise.all([
    prisma.brainChangeRequest.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: limit,
      select: { id: true, summary: true, rationale: true, riskLevel: true, createdAt: true, metadata: true },
    }),
    prisma.brainChangeRequest.count({ where }),
  ]);
  return {
    pendingCount,
    items: rows.map((r) => ({
      source: "BRAIN_CHANGE_REQUEST" as const,
      id: r.id,
      title: r.summary,
      summary: r.rationale,
      riskLevel: r.riskLevel,
      createdAt: r.createdAt,
      conversationId:
        r.metadata && typeof r.metadata === "object" && !Array.isArray(r.metadata)
          ? asString((r.metadata as Record<string, unknown>).conversationId)
          : undefined,
    })),
  };
}

const SUGGESTION_SELECT = {
  id: true,
  title: true,
  situationSummary: true,
  riskLevel: true,
  createdAt: true,
  technicalDetails: true,
} as const;

async function fetchWhatsAppLearnings(limit: number): Promise<SourceResult> {
  const where = { status: "PENDING_REVIEW", agentSlug: WHATSAPP_LEARNING_AGENT_SLUG };
  const [rows, pendingCount] = await Promise.all([
    prisma.waiterTrainingSuggestion.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: limit,
      select: SUGGESTION_SELECT,
    }),
    prisma.waiterTrainingSuggestion.count({ where }),
  ]);
  return {
    pendingCount,
    items: rows.map((r) => ({
      source: "WHATSAPP_LEARNING" as const,
      id: r.id,
      title: r.title,
      summary: r.situationSummary,
      riskLevel: r.riskLevel,
      createdAt: r.createdAt,
      conversationId: conversationFromTechnicalDetails(r.technicalDetails),
    })),
  };
}

async function fetchWaiterTrainingSuggestions(limit: number): Promise<SourceResult> {
  const where = { status: "PENDING_REVIEW", agentSlug: { not: WHATSAPP_LEARNING_AGENT_SLUG } };
  const [rows, pendingCount] = await Promise.all([
    prisma.waiterTrainingSuggestion.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: limit,
      select: SUGGESTION_SELECT,
    }),
    prisma.waiterTrainingSuggestion.count({ where }),
  ]);
  return {
    pendingCount,
    items: rows.map((r) => ({
      source: "WAITER_TRAINING" as const,
      id: r.id,
      title: r.title,
      summary: r.situationSummary,
      riskLevel: r.riskLevel,
      createdAt: r.createdAt,
      conversationId: conversationFromTechnicalDetails(r.technicalDetails),
    })),
  };
}

async function fetchImprovementProposals(limit: number): Promise<SourceResult> {
  const where = { status: "PENDING_APPROVAL" };
  const [rows, pendingCount] = await Promise.all([
    prisma.agentImprovementProposal.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: limit,
      select: { id: true, title: true, problemSummary: true, riskLevel: true, createdAt: true },
    }),
    prisma.agentImprovementProposal.count({ where }),
  ]);
  return {
    pendingCount,
    items: rows.map((r) => ({
      source: "AGENT_IMPROVEMENT_PROPOSAL" as const,
      id: r.id,
      title: r.title,
      summary: r.problemSummary,
      riskLevel: r.riskLevel,
      createdAt: r.createdAt,
    })),
  };
}

async function fetchSimulationExamples(limit: number): Promise<SourceResult> {
  const where = { status: "PENDING_REVIEW" as const };
  const [rows, pendingCount] = await Promise.all([
    prisma.agentSimulationExample.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: limit,
      select: { id: true, intent: true, summary: true, sourceType: true, sourceId: true, createdAt: true },
    }),
    prisma.agentSimulationExample.count({ where }),
  ]);
  return {
    pendingCount,
    items: rows.map((r) => ({
      source: "SIMULATION_EXAMPLE" as const,
      id: r.id,
      title: r.intent,
      summary: r.summary,
      createdAt: r.createdAt,
      // For REAL_CONVERSATION examples, sourceId is the originating Conversation id.
      conversationId: r.sourceType === "REAL_CONVERSATION" ? asString(r.sourceId) : undefined,
    })),
  };
}

async function fetchSimulationOpportunities(limit: number): Promise<SourceResult> {
  const where = { status: "PENDING_REVIEW" as const };
  const [rows, pendingCount] = await Promise.all([
    prisma.agentSimulationOpportunity.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: limit,
      select: { id: true, title: true, summary: true, severity: true, createdAt: true },
    }),
    prisma.agentSimulationOpportunity.count({ where }),
  ]);
  return {
    pendingCount,
    items: rows.map((r) => ({
      source: "SIMULATION_OPPORTUNITY" as const,
      id: r.id,
      title: r.title,
      summary: r.summary,
      riskLevel: String(r.severity),
      createdAt: r.createdAt,
    })),
  };
}

async function fetchKnowledgeItems(limit: number): Promise<SourceResult> {
  const where = { status: "SUGGESTED" };
  const [rows, pendingCount] = await Promise.all([
    prisma.restaurantKnowledgeItem.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: limit,
      select: {
        id: true,
        title: true,
        answer: true,
        category: true,
        createdAt: true,
        createdFromConversationId: true,
      },
    }),
    prisma.restaurantKnowledgeItem.count({ where }),
  ]);
  return {
    pendingCount,
    items: rows.map((r) => ({
      source: "KNOWLEDGE_ITEM" as const,
      id: r.id,
      title: r.title,
      summary: r.answer || `Sugestão de conhecimento (${r.category})`,
      createdAt: r.createdAt,
      conversationId: asString(r.createdFromConversationId),
    })),
  };
}

// ── Dedupe ───────────────────────────────────────────────────────────────────

/**
 * Collapses items that reference the SAME conversation across different sources,
 * keeping the one from the highest-priority source (BrainChangeRequest > training
 * > simulation > knowledge). Items without a conversationId are never collapsed.
 */
function dedupeByConversation(items: UnifiedInboxItem[]): {
  items: UnifiedInboxItem[];
  duplicatesCollapsed: number;
} {
  const byConversation = new Map<string, UnifiedInboxItem>();
  const passthrough: UnifiedInboxItem[] = [];
  let duplicatesCollapsed = 0;

  for (const item of items) {
    if (!item.conversationId) {
      passthrough.push(item);
      continue;
    }
    const existing = byConversation.get(item.conversationId);
    if (!existing) {
      byConversation.set(item.conversationId, item);
      continue;
    }
    duplicatesCollapsed += 1;
    const keepNew =
      SOURCE_PRIORITY[item.source] < SOURCE_PRIORITY[existing.source] ||
      (SOURCE_PRIORITY[item.source] === SOURCE_PRIORITY[existing.source] &&
        item.createdAt.getTime() > existing.createdAt.getTime());
    if (keepNew) byConversation.set(item.conversationId, item);
  }

  return { items: [...passthrough, ...byConversation.values()], duplicatesCollapsed };
}

// ── Public API ───────────────────────────────────────────────────────────────

/**
 * Aggregates all pending approval queues into one normalized, deduplicated
 * inbox. READ-ONLY: never writes anything. A failing source degrades to
 * count 0 — this function never throws because one queue is unavailable.
 */
export async function getUnifiedInbox(limitPerSource = 20): Promise<UnifiedInbox> {
  const limit = Math.max(1, Math.min(100, Math.floor(limitPerSource) || 20));

  const [
    brainChangeRequests,
    whatsappLearnings,
    waiterTraining,
    improvementProposals,
    simulationExamples,
    simulationOpportunities,
    knowledgeItems,
  ] = await Promise.all([
    safeFetch(() => fetchBrainChangeRequests(limit)),
    safeFetch(() => fetchWhatsAppLearnings(limit)),
    safeFetch(() => fetchWaiterTrainingSuggestions(limit)),
    safeFetch(() => fetchImprovementProposals(limit)),
    safeFetch(() => fetchSimulationExamples(limit)),
    safeFetch(() => fetchSimulationOpportunities(limit)),
    safeFetch(() => fetchKnowledgeItems(limit)),
  ]);

  const bySource: Record<InboxSource, SourceResult> = {
    BRAIN_CHANGE_REQUEST: brainChangeRequests,
    WHATSAPP_LEARNING: whatsappLearnings,
    WAITER_TRAINING: waiterTraining,
    AGENT_IMPROVEMENT_PROPOSAL: improvementProposals,
    SIMULATION_EXAMPLE: simulationExamples,
    SIMULATION_OPPORTUNITY: simulationOpportunities,
    KNOWLEDGE_ITEM: knowledgeItems,
  };

  const countsBySource = Object.fromEntries(
    ALL_SOURCES.map((s) => [s, bySource[s].pendingCount]),
  ) as Record<InboxSource, number>;

  const merged = ALL_SOURCES.flatMap((s) => bySource[s].items);
  const { items, duplicatesCollapsed } = dedupeByConversation(merged);
  items.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

  return {
    items,
    countsBySource,
    totalPending: ALL_SOURCES.reduce((sum, s) => sum + bySource[s].pendingCount, 0),
    duplicatesCollapsed,
  };
}
