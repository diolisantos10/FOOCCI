/**
 * Approval Inbox — the single, unified approval queue for the AI Training Center.
 *
 * Phase 1 of the simulators/trainers consolidation. Today the things a human must
 * approve live in several different tables with different shapes and status names
 * (AgentImprovementProposal, AgentSimulationOpportunity, WaiterTrainingSuggestion,
 * …). This service is a thin, ADDITIVE aggregator: it reads each source, normalizes
 * every item into ONE rich, marketing-friendly shape (problem + real example +
 * suggestion + business impact), and routes an approve/reject decision back to the
 * right table. It never changes the producers and never touches production runtime.
 *
 * Extensible by design: add a new queue by adding one entry to SOURCES.
 */

import { prisma } from "@/lib/prisma";

export type ApprovalAgentKey = "whatsapp" | "waiter" | "crm" | "analytics" | "outro";
export type ApprovalRisk = "LOW" | "MEDIUM" | "HIGH";
export type ApprovalDecision = "APPROVE" | "REJECT";
export type ApprovalSourceKey = "improvement" | "opportunity" | "waiter_suggestion";

/** One normalized, human-readable item in the unified inbox. */
export interface ApprovalItem {
  id: string; // composite `${source}:${rawId}` — unique across sources
  source: ApprovalSourceKey;
  sourceLabel: string;
  rawId: string;
  agentKey: ApprovalAgentKey; // for the per-agent "salas" filter
  agentLabel: string;
  title: string;
  problem: string; // what's going wrong, in plain language
  context: string | null; // the situation / what happened
  example: string | null; // a real excerpt or concrete example
  recommendation: string; // the suggested fix, in plain language
  impact: string | null; // why it matters (expected business impact)
  changeLabel: string | null; // friendly label for the kind of change
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

/** Translates the technical change-type codes into business/marketing language. */
const CHANGE_LABELS: Record<string, string> = {
  PROMPT_PATCH: "Ajuste de fala do agente",
  ROUTING_RULE: "Regra de roteamento",
  STATE_MACHINE_RULE: "Regra de fluxo",
  COPY_CHANGE: "Ajuste de texto",
  MENU_MATCHING_RULE: "Reconhecimento do cardápio",
  HANDOFF_RULE: "Quando chamar um humano",
  CONFIG_CHANGE: "Configuração",
  RESPONSE_PATTERN: "Padrão de resposta",
  PAYMENT_RULE: "Regra de pagamento",
  MENU_GUIDANCE: "Orientação de cardápio",
  UPSELL_BEHAVIOR: "Venda extra (upsell)",
  OBJECTION_HANDLING: "Lidar com objeção",
  RESTRICTION_HANDLING: "Lidar com restrição alimentar",
  CHECKOUT_GUIDANCE: "Fechamento do pedido",
  TONE_ADJUSTMENT: "Ajuste de tom",
  BUG: "Correção de erro",
  MISSED_SALE: "Venda perdida",
  UX_FRICTION: "Atrito na experiência",
  PROMPT_GAP: "Falha de instrução",
  POLICY_GAP: "Falha de política",
};
export function friendlyChange(raw: string | null | undefined): string | null {
  if (!raw) return null;
  return CHANGE_LABELS[raw.toUpperCase()] ?? null;
}

function clean(s: string | null | undefined): string | null {
  return s && s.trim() ? s.trim() : null;
}
function joinParts(parts: Array<string | null | undefined>, sep = " · "): string | null {
  const xs = parts.map(clean).filter(Boolean) as string[];
  return xs.length ? xs.join(sep) : null;
}
function excerptExample(customer?: string | null, agent?: string | null): string | null {
  const parts: string[] = [];
  if (clean(customer)) parts.push(`Cliente: "${clean(customer)}"`);
  if (clean(agent)) parts.push(`Agente: "${clean(agent)}"`);
  return parts.length ? parts.join("\n") : null;
}
function scoreLine(before?: number | null, after?: number | null): string | null {
  if (before == null || after == null) return null;
  return `Nota esperada: ${Math.round(before)} → ${Math.round(after)}`;
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
        context: clean(r.rootCause),
        example: null,
        recommendation: clean(r.proposedPatchText) ?? clean(r.expectedImpact) ?? "—",
        impact: joinParts([r.expectedImpact, scoreLine(r.beforeScore, r.afterScoreEstimate)]),
        changeLabel: friendlyChange(r.proposedChangeType),
        riskLevel: normalizeRisk(r.riskLevel),
        createdAt: r.createdAt.toISOString(),
      }),
    );
  },
  async decide(rawId, decision, reviewer) {
    await prisma.agentImprovementProposal.update({
      where: { id: rawId },
      data: { status: decision === "APPROVE" ? "APPROVED" : "REJECTED", approvedBy: reviewer, approvedAt: new Date() },
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
        context: null,
        example: null,
        recommendation: r.recommendation,
        impact: clean(r.expectedImpact),
        changeLabel: friendlyChange(String(r.type)),
        riskLevel: normalizeRisk(String(r.severity)),
        createdAt: r.createdAt.toISOString(),
      }),
    );
  },
  async decide(rawId, decision, reviewer) {
    await prisma.agentSimulationOpportunity.update({
      where: { id: rawId },
      data: { status: decision === "APPROVE" ? "APPROVED" : "REJECTED", reviewedBy: reviewer, reviewedAt: new Date() },
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
        context: joinParts([r.situationSummary, r.customerIntent], " — "),
        example: excerptExample(r.sanitizedCustomerExcerpt, r.sanitizedWaiterExcerpt),
        recommendation: clean(r.idealResponse) ?? r.trainingRule,
        impact: clean(r.expectedImpact),
        changeLabel: friendlyChange(r.suggestedActionType),
        riskLevel: normalizeRisk(r.riskLevel),
        createdAt: r.createdAt.toISOString(),
      }),
    );
  },
  async decide(rawId, decision, reviewer) {
    await prisma.waiterTrainingSuggestion.update({
      where: { id: rawId },
      data: { status: decision === "APPROVE" ? "APPROVED" : "REJECTED", reviewedBy: reviewer, reviewedAt: new Date() },
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
