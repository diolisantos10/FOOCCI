/**
 * Approval Inbox — the single, unified approval queue for the AI Training Center.
 *
 * Phase 1 of the simulators/trainers consolidation. Today the things a human must
 * approve live in several different tables with different shapes and status names
 * (AgentImprovementProposal, AgentSimulationOpportunity, WaiterTrainingSuggestion,
 * …). This service is a thin, ADDITIVE aggregator: it reads each source, normalizes
 * every item into ONE shape, and routes an approve/reject decision back to the right
 * table. It never changes the producers and never touches production runtime.
 *
 * Extensible by design: add a new queue by adding one entry to SOURCES.
 */

import { prisma } from "@/lib/prisma";

export type ApprovalAgentKey = "whatsapp" | "waiter" | "crm" | "analytics" | "outro";
export type ApprovalRisk = "LOW" | "MEDIUM" | "HIGH";
export type ApprovalDecision = "APPROVE" | "REJECT";
export type ApprovalSourceKey = "improvement" | "opportunity" | "waiter_suggestion";

/** One normalized item in the unified inbox (regardless of which table it came from). */
export interface ApprovalItem {
  id: string; // composite `${source}:${rawId}` — unique across sources
  source: ApprovalSourceKey;
  sourceLabel: string;
  rawId: string;
  agentKey: ApprovalAgentKey; // for the per-agent "salas" filter
  agentLabel: string;
  title: string;
  problem: string;
  recommendation: string;
  riskLevel: ApprovalRisk;
  createdAt: string; // ISO
}

// ── Normalizers ───────────────────────────────────────────────────────────────

const AGENT_LABELS: Record<ApprovalAgentKey, string> = {
  whatsapp: "WhatsApp",
  waiter: "Garçom",
  crm: "CRM",
  analytics: "Analytics",
  outro: "Outro",
};

/** Maps the many agent identifiers (agentType / agentSlug) to one canonical key. */
export function normalizeAgent(raw: string | null | undefined): ApprovalAgentKey {
  const u = (raw ?? "").toUpperCase();
  if (u.includes("WAITER") || u.includes("GARC")) return "waiter";
  if (u.includes("CRM")) return "crm";
  if (u.includes("ANALY")) return "analytics";
  if (u.includes("WHATS") || u.includes("RECEPTION") || u.startsWith("WA")) return "whatsapp";
  return "outro";
}

/** Collapses the various risk/severity vocabularies (P0/P1/P2, INFO, CRITICAL…) to 3. */
export function normalizeRisk(raw: string | null | undefined): ApprovalRisk {
  const u = (raw ?? "").toUpperCase();
  if (u === "HIGH" || u === "CRITICAL" || u === "P0") return "HIGH";
  if (u === "MEDIUM" || u === "P1") return "MEDIUM";
  return "LOW";
}

function makeItem(p: Omit<ApprovalItem, "id" | "agentLabel">): ApprovalItem {
  return { ...p, id: `${p.source}:${p.rawId}`, agentLabel: AGENT_LABELS[p.agentKey] };
}

// ── Source registry ─────────────────────────────────────────────────────────────

interface InboxSource {
  key: ApprovalSourceKey;
  listPending(): Promise<ApprovalItem[]>;
  decide(rawId: string, decision: ApprovalDecision, reviewer: string): Promise<void>;
}

const improvementSource: InboxSource = {
  key: "improvement",
  async listPending() {
    const rows = await prisma.agentImprovementProposal.findMany({
      where: { status: "PENDING_APPROVAL" },
      orderBy: { createdAt: "desc" },
      take: 200,
    });
    return rows.map((r) =>
      makeItem({
        source: "improvement",
        sourceLabel: "Proposta de melhoria",
        rawId: r.id,
        agentKey: normalizeAgent(r.agentType),
        title: r.title,
        problem: r.problemSummary,
        recommendation: r.proposedPatchText ?? r.expectedImpact ?? "—",
        riskLevel: normalizeRisk(r.riskLevel),
        createdAt: r.createdAt.toISOString(),
      }),
    );
  },
  async decide(rawId, decision, reviewer) {
    await prisma.agentImprovementProposal.update({
      where: { id: rawId },
      data: {
        status: decision === "APPROVE" ? "APPROVED" : "REJECTED",
        approvedBy: reviewer,
        approvedAt: new Date(),
      },
    });
  },
};

const opportunitySource: InboxSource = {
  key: "opportunity",
  async listPending() {
    const rows = await prisma.agentSimulationOpportunity.findMany({
      where: { status: "PENDING_REVIEW" },
      orderBy: { createdAt: "desc" },
      take: 200,
    });
    return rows.map((r) =>
      makeItem({
        source: "opportunity",
        sourceLabel: "Oportunidade (simulação)",
        rawId: r.id,
        agentKey: normalizeAgent(r.agentSlug),
        title: r.title,
        problem: r.summary,
        recommendation: r.recommendation,
        riskLevel: normalizeRisk(String(r.severity)),
        createdAt: r.createdAt.toISOString(),
      }),
    );
  },
  async decide(rawId, decision, reviewer) {
    await prisma.agentSimulationOpportunity.update({
      where: { id: rawId },
      data: {
        status: decision === "APPROVE" ? "APPROVED" : "REJECTED",
        reviewedBy: reviewer,
        reviewedAt: new Date(),
      },
    });
  },
};

const waiterSuggestionSource: InboxSource = {
  key: "waiter_suggestion",
  async listPending() {
    const rows = await prisma.waiterTrainingSuggestion.findMany({
      where: { status: "PENDING_REVIEW" },
      orderBy: { createdAt: "desc" },
      take: 200,
    });
    return rows.map((r) =>
      makeItem({
        source: "waiter_suggestion",
        sourceLabel: "Sugestão de treino",
        rawId: r.id,
        agentKey: normalizeAgent(r.agentSlug),
        title: r.title,
        problem: r.problemDetected,
        recommendation: r.idealResponse || r.trainingRule,
        riskLevel: normalizeRisk(r.riskLevel),
        createdAt: r.createdAt.toISOString(),
      }),
    );
  },
  async decide(rawId, decision, reviewer) {
    await prisma.waiterTrainingSuggestion.update({
      where: { id: rawId },
      data: {
        status: decision === "APPROVE" ? "APPROVED" : "REJECTED",
        reviewedBy: reviewer,
        reviewedAt: new Date(),
      },
    });
  },
};

const SOURCES: Record<ApprovalSourceKey, InboxSource> = {
  improvement: improvementSource,
  opportunity: opportunitySource,
  waiter_suggestion: waiterSuggestionSource,
};

// ── Public API ──────────────────────────────────────────────────────────────────

export interface InboxResult {
  items: ApprovalItem[];
  countsByAgent: Record<ApprovalAgentKey, number>;
  total: number;
}

/** Lists every pending approval across all sources. Optionally filtered by agent. */
export async function listInbox(agentFilter?: ApprovalAgentKey): Promise<InboxResult> {
  const lists = await Promise.all(
    Object.values(SOURCES).map((s) =>
      s.listPending().catch((err) => {
        console.error(`[approvalInbox] source ${s.key} failed`, err);
        return [] as ApprovalItem[];
      }),
    ),
  );
  const all = lists.flat().sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));

  const countsByAgent: Record<ApprovalAgentKey, number> = {
    whatsapp: 0,
    waiter: 0,
    crm: 0,
    analytics: 0,
    outro: 0,
  };
  for (const it of all) countsByAgent[it.agentKey] += 1;

  const items = agentFilter ? all.filter((i) => i.agentKey === agentFilter) : all;
  return { items, countsByAgent, total: all.length };
}

/** Approve/reject one item by composite id, routing to the correct underlying table. */
export async function decideInbox(
  compositeId: string,
  decision: ApprovalDecision,
  reviewer = "admin",
): Promise<void> {
  const sep = compositeId.indexOf(":");
  const sourceKey = compositeId.slice(0, sep) as ApprovalSourceKey;
  const rawId = compositeId.slice(sep + 1);
  const source = SOURCES[sourceKey];
  if (sep < 0 || !source || !rawId) throw new Error("Item de aprovação inválido.");
  await source.decide(rawId, decision, reviewer);
}
