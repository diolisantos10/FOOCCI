/**
 * WaiterEvidenceService — "Provas de Resultado / Evidências Comerciais" do Waiter.
 *
 * Stores documented, SANITIZED proof that the Waiter generates commercial value
 * (sale conducted, upsell, recovery, friction reduction, qualitative praise,
 * before/after). Separate from Training by design: evidence is for COMMERCIAL
 * storytelling, training cases are for LEARNING.
 *
 * Safety contract:
 *  • excerpts pass through the simulation sanitizer BEFORE persisting (no PII);
 *  • soft references only — never mutates an order/conversation;
 *  • DRAFT by default; human review (APPROVED/REJECTED/BACKLOG) required;
 *  • public/commercial use requires BOTH isPublicCandidate AND APPROVED.
 */

import { prisma } from "@/lib/prisma";
import { sanitizeText } from "@/services/simulation/simulationSanitizer";

const AGENT = "waiter";

export type EvidenceType =
  | "SALE_CONVERSION"
  | "UPSELL"
  | "RECOVERY"
  | "FRICTION_REDUCTION"
  | "QUALITATIVE_PROOF"
  | "BEFORE_AFTER";

export type EvidenceStatus = "DRAFT" | "APPROVED" | "REJECTED" | "BACKLOG";
export type EvidenceSourceType = "ORDER" | "CONVERSATION" | "SIMULATION" | "MANUAL_NOTE" | "ANALYTICS";

export interface CreateEvidenceInput {
  restaurantId: string;
  sourceType: EvidenceSourceType;
  sourceId?: string | null;
  title: string;
  summary: string;
  evidenceType: EvidenceType;
  valueBefore?: number | null;
  valueAfter?: number | null;
  orderValue?: number | null;
  customerSegment?: string | null;
  /** Raw excerpt — ALWAYS sanitized here before persisting. */
  excerpt?: string | null;
  proofScore?: number | null;
  isPublicCandidate?: boolean;
  metadata?: Record<string, unknown> | null;
}

/** valueAfter - valueBefore when both exist; null otherwise (never invented). */
export function computeIncrementalValue(valueBefore?: number | null, valueAfter?: number | null): number | null {
  if (typeof valueBefore !== "number" || typeof valueAfter !== "number") return null;
  return Math.round((valueAfter - valueBefore) * 100) / 100;
}

export async function createEvidence(input: CreateEvidenceInput) {
  const incrementalValue = computeIncrementalValue(input.valueBefore, input.valueAfter);
  return prisma.waiterResultEvidence.create({
    data: {
      restaurantId: input.restaurantId,
      agentSlug: AGENT,
      sourceType: input.sourceType,
      sourceId: input.sourceId ?? null,
      title: input.title.slice(0, 200),
      summary: input.summary.slice(0, 2000),
      evidenceType: input.evidenceType,
      valueBefore: input.valueBefore ?? null,
      valueAfter: input.valueAfter ?? null,
      incrementalValue,
      orderValue: input.orderValue ?? null,
      customerSegment: input.customerSegment ?? null,
      // PII protection: the excerpt is sanitized BEFORE it ever reaches the DB.
      sanitizedExcerpt: input.excerpt ? sanitizeText(input.excerpt).slice(0, 1500) : null,
      proofScore: typeof input.proofScore === "number" ? Math.max(0, Math.min(100, Math.round(input.proofScore))) : null,
      status: "DRAFT",
      isPublicCandidate: input.isPublicCandidate === true,
      metadata: (input.metadata ?? undefined) as never,
    },
  });
}

export async function listEvidence(params: {
  restaurantId?: string;
  evidenceType?: EvidenceType;
  status?: EvidenceStatus;
  limit?: number;
} = {}) {
  return prisma.waiterResultEvidence.findMany({
    where: {
      agentSlug: AGENT,
      ...(params.restaurantId ? { restaurantId: params.restaurantId } : {}),
      ...(params.evidenceType ? { evidenceType: params.evidenceType } : {}),
      ...(params.status ? { status: params.status } : {}),
    },
    orderBy: { createdAt: "desc" },
    take: Math.min(Math.max(params.limit ?? 50, 1), 200),
  });
}

export async function evidenceStats(restaurantId?: string) {
  const where = { agentSlug: AGENT, ...(restaurantId ? { restaurantId } : {}) };
  const [total, approved, pending, byType, incremental] = await Promise.all([
    prisma.waiterResultEvidence.count({ where }),
    prisma.waiterResultEvidence.count({ where: { ...where, status: "APPROVED" } }),
    prisma.waiterResultEvidence.count({ where: { ...where, status: "DRAFT" } }),
    prisma.waiterResultEvidence.groupBy({ by: ["evidenceType"], where, _count: { _all: true } }),
    prisma.waiterResultEvidence.aggregate({ where: { ...where, status: "APPROVED" }, _sum: { incrementalValue: true } }),
  ]);
  const countsByType: Record<string, number> = {};
  for (const g of byType) countsByType[g.evidenceType] = g._count._all;
  return {
    total,
    approved,
    pending,
    countsByType,
    approvedIncrementalValue: Number(incremental._sum.incrementalValue ?? 0),
  };
}

export async function reviewEvidence(id: string, status: EvidenceStatus, reviewedBy?: string | null) {
  return prisma.waiterResultEvidence.update({
    where: { id },
    data: { status, reviewedAt: new Date(), reviewedBy: reviewedBy ?? null },
  });
}
