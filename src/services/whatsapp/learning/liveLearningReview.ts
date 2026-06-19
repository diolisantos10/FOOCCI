/**
 * WhatsApp Live Learning Review — the daily (and on-demand) routine that reads
 * recent REAL WhatsApp conversations, classifies each outcome, extracts learning
 * cards, deduplicates them, and queues DISTINCT learnings for HUMAN approval.
 *
 * Hard guarantees (verified by tests + production dry-run):
 *   - NEVER sends WhatsApp (no Evolution).
 *   - NEVER creates an order or Pix.
 *   - NEVER changes the live agent. Approving a learning only marks it for the
 *     next training round — it does NOT alter production automatically.
 *   - PII is masked before persistence.
 *   - dryRun=true performs the full analysis but writes nothing.
 *
 * Persistence reuses the existing WaiterTrainingSuggestion table (isolated by
 * agentSlug). Dedup key = signature → one queued learning per problem type;
 * already-decided learnings (APPROVED/REJECTED) are respected (not resurrected).
 */

import { prisma } from "@/lib/prisma";
import {
  reviewConversation,
  type ConversationOutcome,
  type DetectedIssue,
  type ReviewMessage,
} from "./conversationReview";
import { buildLearningQueue, type QueuedLearning } from "./learningAnalysis";
import {
  WHATSAPP_LEARNING_AGENT_SLUG,
  WHATSAPP_LEARNING_SOURCE_TYPE,
  LEARNING_STATUS,
} from "./constants";

export interface LiveLearningSafety {
  noEvolution: boolean;
  noRealOrder: boolean;
  noRealPix: boolean;
  noMessageSent: boolean;
}

export interface LiveLearningResult {
  ok: boolean;
  restaurantSlug: string | null;
  windowHours: number;
  dryRun: boolean;
  conversationsReviewed: number;
  outcomeCounts: Record<string, number>;
  learnings: QueuedLearning[];
  created: number;
  updated: number;
  skippedAlreadyDecided: number;
  safety: LiveLearningSafety;
  notes: string[];
  error: string | null;
}

const HANDOFF_STATUSES = ["HUMAN", "HUMANO_ASSUMIU"];

export interface LiveLearningInput {
  restaurantId?: string;
  restaurantSlug?: string;
  windowHours?: number;
  /** When true (default for diagnostics), analyze but persist nothing. */
  dryRun?: boolean;
}

export async function runLiveLearningReview(input: LiveLearningInput): Promise<LiveLearningResult> {
  const windowHours = Math.min(Math.max(input.windowHours ?? 24, 1), 168);
  const dryRun = input.dryRun === true;
  const slug = input.restaurantSlug ?? null;
  const safety: LiveLearningSafety = { noEvolution: true, noRealOrder: true, noRealPix: true, noMessageSent: true };
  const notes: string[] = [];

  let restaurantId = input.restaurantId ?? null;
  if (!restaurantId && input.restaurantSlug) {
    const r = await prisma.restaurant
      .findFirst({ where: { slug: input.restaurantSlug }, select: { id: true } })
      .catch(() => null);
    restaurantId = r?.id ?? null;
  }
  if (!restaurantId) {
    return {
      ok: false, restaurantSlug: slug, windowHours, dryRun, conversationsReviewed: 0,
      outcomeCounts: {}, learnings: [], created: 0, updated: 0, skippedAlreadyDecided: 0,
      safety, notes, error: "restaurante não encontrado",
    };
  }

  const since = new Date(Date.now() - windowHours * 60 * 60 * 1000);

  let conversations: {
    id: string; status: string; orderId: string | null;
    messages: { direction: string; senderType: string | null; content: string; type: string; sentAt: Date }[];
  }[] = [];
  try {
    conversations = await prisma.conversation.findMany({
      where: { restaurantId, channel: "WHATSAPP", lastMessageAt: { gte: since } },
      select: {
        id: true, status: true, orderId: true,
        messages: {
          orderBy: { sentAt: "asc" },
          select: { direction: true, senderType: true, content: true, type: true, sentAt: true },
        },
      },
      take: 500,
    });
  } catch (err) {
    return {
      ok: false, restaurantSlug: slug, windowHours, dryRun, conversationsReviewed: 0,
      outcomeCounts: {}, learnings: [], created: 0, updated: 0, skippedAlreadyDecided: 0,
      safety, notes, error: err instanceof Error ? err.message : "erro ao ler conversas",
    };
  }

  const outcomeCounts: Record<string, number> = {};
  const perConversation: { conversationId: string; issues: DetectedIssue[] }[] = [];

  for (const c of conversations) {
    const messages: ReviewMessage[] = c.messages.map((m) => ({
      direction: m.direction as "INBOUND" | "OUTBOUND",
      senderType: m.senderType,
      content: m.content,
      type: m.type,
      sentAt: m.sentAt,
    }));
    const handoff = HANDOFF_STATUSES.includes(c.status) ||
      messages.some((m) => m.senderType === "SYSTEM" && /handoff|atendente/i.test(m.content));
    const hasPix = messages.some((m) => /pix/i.test(m.content) && /copia e cola|qr|chave/i.test(m.content));

    const review = reviewConversation({
      conversationId: c.id,
      status: c.status,
      hasOrder: !!c.orderId,
      hasPix,
      handoff,
      messages,
    });
    outcomeCounts[review.outcome] = (outcomeCounts[review.outcome] ?? 0) + 1;
    if (review.issues.length > 0) perConversation.push({ conversationId: c.id, issues: review.issues });
  }

  const learnings = buildLearningQueue(perConversation);

  let created = 0;
  let updated = 0;
  let skippedAlreadyDecided = 0;

  if (!dryRun) {
    for (const ql of learnings) {
      try {
        const result = await persistLearning(restaurantId, windowHours, ql);
        if (result === "created") created += 1;
        else if (result === "updated") updated += 1;
        else skippedAlreadyDecided += 1;
      } catch {
        notes.push(`Falha ao gravar aprendizado "${ql.card.title}" — ignorado.`);
      }
    }
  } else {
    notes.push("Modo dry-run: análise completa, nenhum aprendizado gravado.");
  }

  notes.push(
    "Aprovar um aprendizado NÃO altera a produção automaticamente — ele entra na base de " +
    "treinamento e será usado na próxima rodada de melhoria do agente.",
  );

  return {
    ok: true, restaurantSlug: slug, windowHours, dryRun,
    conversationsReviewed: conversations.length, outcomeCounts, learnings,
    created, updated, skippedAlreadyDecided, safety, notes, error: null,
  };
}

type PersistOutcome = "created" | "updated" | "skipped";

/** Upserts one learning, respecting prior human decisions (APPROVED/REJECTED). */
async function persistLearning(
  restaurantId: string,
  windowHours: number,
  ql: QueuedLearning,
): Promise<PersistOutcome> {
  const { card, occurrences, exampleConversationIds } = ql;
  const sourceId = card.signature; // one row per problem type → built-in dedup

  const existing = await prisma.waiterTrainingSuggestion.findUnique({
    where: {
      agentSlug_sourceType_sourceId: {
        agentSlug: WHATSAPP_LEARNING_AGENT_SLUG,
        sourceType: WHATSAPP_LEARNING_SOURCE_TYPE,
        sourceId,
      },
    },
    select: { id: true, status: true },
  });

  // Respect a human decision: never resurrect an APPROVED/REJECTED learning.
  if (existing && (existing.status === LEARNING_STATUS.APPROVED || existing.status === LEARNING_STATUS.REJECTED)) {
    return "skipped";
  }

  const data = {
    restaurantId,
    agentSlug: WHATSAPP_LEARNING_AGENT_SLUG,
    sourceType: WHATSAPP_LEARNING_SOURCE_TYPE,
    sourceId,
    status: LEARNING_STATUS.PENDING,
    title: card.title,
    situationSummary: `Encontrado em ${occurrences} conversa(s) nas últimas ${windowHours}h.`,
    customerIntent: card.customerWanted,
    whatHappened: card.agentAnswered,
    problemDetected: card.problem,
    idealResponse: card.idealAnswer,
    trainingRule: card.learningRule,
    expectedImpact: card.salesImpact,
    suggestedActionType: card.suggestedAction,
    riskLevel: card.severity === "P0" ? "HIGH" : card.severity === "P1" ? "MEDIUM" : "LOW",
    sanitizedCustomerExcerpt: card.customerWanted,
    sanitizedWaiterExcerpt: card.agentAnswered,
    technicalDetails: {
      signature: card.signature,
      severity: card.severity,
      suggestedAction: card.suggestedAction,
      occurrences,
      exampleConversationIds,
      windowHours,
    } as object,
  };

  if (existing) {
    await prisma.waiterTrainingSuggestion.update({ where: { id: existing.id }, data });
    return "updated";
  }
  await prisma.waiterTrainingSuggestion.create({ data });
  return "created";
}
