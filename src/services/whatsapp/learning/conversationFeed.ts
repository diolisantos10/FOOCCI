/**
 * Conversation feed for the "Conversas de hoje" tab — a read-only, PII-masked
 * list of recent WhatsApp conversations with their business outcome + summary.
 * Never sends WhatsApp, never creates an order/Pix.
 */

import { prisma } from "@/lib/prisma";
import { reviewConversation, type ConversationOutcome, type ReviewMessage } from "./conversationReview";

export interface ConversationFeedItem {
  conversationId: string;
  outcome: ConversationOutcome;
  summary: string;       // masked, business language
  outcomeReason: string;
  issueCount: number;
  lastMessageAt: string | null;
}

const HANDOFF_STATUSES = ["HUMAN", "HUMANO_ASSUMIU"];

export async function listConversationReviews(input: {
  restaurantId: string;
  windowHours?: number;
  limit?: number;
}): Promise<ConversationFeedItem[]> {
  const windowHours = Math.min(Math.max(input.windowHours ?? 24, 1), 168);
  const limit = Math.min(Math.max(input.limit ?? 100, 1), 300);
  const since = new Date(Date.now() - windowHours * 60 * 60 * 1000);

  const conversations = await prisma.conversation.findMany({
    where: { restaurantId: input.restaurantId, channel: "WHATSAPP", lastMessageAt: { gte: since } },
    orderBy: { lastMessageAt: "desc" },
    take: limit,
    select: {
      id: true, status: true, orderId: true, lastMessageAt: true,
      messages: {
        orderBy: { sentAt: "asc" },
        select: { direction: true, senderType: true, content: true, type: true, sentAt: true },
      },
    },
  });

  return conversations.map((c) => {
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
      conversationId: c.id, status: c.status, hasOrder: !!c.orderId, hasPix, handoff, messages,
    });
    return {
      conversationId: c.id,
      outcome: review.outcome,
      summary: review.summary,
      outcomeReason: review.outcomeReason,
      issueCount: review.issues.length,
      lastMessageAt: c.lastMessageAt ? c.lastMessageAt.toISOString() : null,
    };
  });
}
