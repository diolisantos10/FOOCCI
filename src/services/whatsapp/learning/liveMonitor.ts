/**
 * WhatsApp Live Monitor — read-only, business-language health snapshot of the
 * WhatsApp sales channel for a period (default 24h). NEVER sends WhatsApp,
 * NEVER creates an order/Pix, NEVER exposes PII.
 *
 * The pure builder `buildMonitorSnapshot` is unit-tested with synthetic data;
 * the async `getWhatsAppLiveMonitor` wires it to Prisma.
 */

import { prisma } from "@/lib/prisma";
import { reviewConversation, type ConversationOutcome, type ReviewMessage } from "./conversationReview";
import {
  WHATSAPP_LEARNING_AGENT_SLUG,
  WHATSAPP_LEARNING_SOURCE_TYPE,
  LEARNING_STATUS,
} from "./constants";

export interface MonitorErrorCount {
  category: ConversationOutcome;
  label: string;
  count: number;
}

export interface MonitorSnapshot {
  ok: boolean;
  restaurantSlug: string | null;
  periodHours: number;
  conversations: number;
  ordersGenerated: number;
  revenue: number;
  conversationToOrderRate: number; // 0..1
  handoffs: number;
  abandonos: number;
  errorsByCategory: MonitorErrorCount[];
  topErrors: MonitorErrorCount[]; // up to 5
  pendingLearnings: number;
  /** Safety: this endpoint never sends nor charges. Always true/true/true. */
  safety: { noEvolution: true; noRealOrder: true; noRealPix: true; noMessageSent: true };
  generatedAt: string;
  error: string | null;
}

const OUTCOME_LABELS: Record<ConversationOutcome, string> = {
  VENDA_CONCLUIDA:               "Venda concluída",
  ATENDENTE_ASSUMIU:             "Atendente assumiu",
  CLIENTE_ABANDONOU:             "Cliente abandonou",
  ERRO_DE_RESPOSTA:              "Resposta inadequada",
  ERRO_DE_PRODUTO:               "Dúvida de produto",
  ERRO_DE_ENDERECO:              "Endereço incorreto",
  ERRO_DE_PAGAMENTO:             "Pagamento mal respondido",
  LOOP:                          "Loop de respostas",
  PERGUNTA_NAO_RESPONDIDA:       "Pergunta sem resposta",
  OPORTUNIDADE_DE_VENDA_PERDIDA: "Oportunidade perdida",
  OK_SEM_ACAO:                   "Sem ação",
};

const ERROR_OUTCOMES: ConversationOutcome[] = [
  "ERRO_DE_RESPOSTA", "ERRO_DE_PRODUTO", "ERRO_DE_ENDERECO",
  "ERRO_DE_PAGAMENTO", "LOOP", "PERGUNTA_NAO_RESPONDIDA",
];
const ABANDON_OUTCOMES: ConversationOutcome[] = ["CLIENTE_ABANDONOU", "OPORTUNIDADE_DE_VENDA_PERDIDA"];

export interface MonitorInputs {
  restaurantSlug: string | null;
  periodHours: number;
  /** Headline outcome of each WhatsApp conversation in the window. */
  outcomes: ConversationOutcome[];
  ordersGenerated: number;
  revenue: number;
  handoffs: number;
  pendingLearnings: number;
}

/** Pure aggregation of monitor inputs → a no-PII snapshot. */
export function buildMonitorSnapshot(input: MonitorInputs): MonitorSnapshot {
  const conversations = input.outcomes.length;
  const abandonos = input.outcomes.filter((o) => ABANDON_OUTCOMES.includes(o)).length;

  const errorCounts = new Map<ConversationOutcome, number>();
  for (const o of input.outcomes) {
    if (ERROR_OUTCOMES.includes(o)) errorCounts.set(o, (errorCounts.get(o) ?? 0) + 1);
  }
  const errorsByCategory: MonitorErrorCount[] = [...errorCounts.entries()]
    .map(([category, count]) => ({ category, label: OUTCOME_LABELS[category], count }))
    .sort((a, b) => b.count - a.count);

  return {
    ok: true,
    restaurantSlug: input.restaurantSlug,
    periodHours: input.periodHours,
    conversations,
    ordersGenerated: input.ordersGenerated,
    revenue: input.revenue,
    conversationToOrderRate: conversations > 0 ? input.ordersGenerated / conversations : 0,
    handoffs: input.handoffs,
    abandonos,
    errorsByCategory,
    topErrors: errorsByCategory.slice(0, 5),
    pendingLearnings: input.pendingLearnings,
    safety: { noEvolution: true, noRealOrder: true, noRealPix: true, noMessageSent: true },
    generatedAt: new Date().toISOString(),
    error: null,
  };
}

function emptySnapshot(slug: string | null, periodHours: number, error: string): MonitorSnapshot {
  return {
    ok: false, restaurantSlug: slug, periodHours, conversations: 0, ordersGenerated: 0,
    revenue: 0, conversationToOrderRate: 0, handoffs: 0, abandonos: 0,
    errorsByCategory: [], topErrors: [], pendingLearnings: 0,
    safety: { noEvolution: true, noRealOrder: true, noRealPix: true, noMessageSent: true },
    generatedAt: new Date().toISOString(), error,
  };
}

const HANDOFF_STATUSES = ["HUMAN", "HUMANO_ASSUMIU"];

/** Async: loads real WhatsApp data for the window and returns a health snapshot. */
export async function getWhatsAppLiveMonitor(input: {
  restaurantId?: string;
  restaurantSlug?: string;
  periodHours?: number;
}): Promise<MonitorSnapshot> {
  const periodHours = Math.min(Math.max(input.periodHours ?? 24, 1), 168);
  const slug = input.restaurantSlug ?? null;

  let restaurantId = input.restaurantId ?? null;
  if (!restaurantId && input.restaurantSlug) {
    const r = await prisma.restaurant
      .findFirst({ where: { slug: input.restaurantSlug }, select: { id: true } })
      .catch(() => null);
    restaurantId = r?.id ?? null;
  }
  if (!restaurantId) return emptySnapshot(slug, periodHours, "restaurante não encontrado");

  const since = new Date(Date.now() - periodHours * 60 * 60 * 1000);

  try {
    const [conversations, whatsappOrders, pendingLearnings] = await Promise.all([
      prisma.conversation.findMany({
        where: { restaurantId, channel: "WHATSAPP", lastMessageAt: { gte: since } },
        select: {
          id: true, status: true, orderId: true,
          messages: {
            where: { senderType: { not: null } },
            orderBy: { sentAt: "asc" },
            select: { direction: true, senderType: true, content: true, type: true, sentAt: true },
          },
        },
        take: 500,
      }),
      // Channel-attributed orders (source="whatsapp") for revenue/conversion.
      prisma.order.findMany({
        where: { restaurantId, source: "whatsapp", createdAt: { gte: since } },
        select: { total: true },
      }).catch(() => [] as { total: unknown }[]),
      prisma.waiterTrainingSuggestion.count({
        where: {
          agentSlug: WHATSAPP_LEARNING_AGENT_SLUG,
          sourceType: WHATSAPP_LEARNING_SOURCE_TYPE,
          status: LEARNING_STATUS.PENDING,
        },
      }).catch(() => 0),
    ]);

    const outcomes: ConversationOutcome[] = [];
    let handoffs = 0;
    for (const c of conversations) {
      const handoff = HANDOFF_STATUSES.includes(c.status);
      if (handoff) handoffs += 1;
      const messages: ReviewMessage[] = c.messages.map((m) => ({
        direction: m.direction as "INBOUND" | "OUTBOUND",
        senderType: m.senderType,
        content: m.content,
        type: m.type,
        sentAt: m.sentAt,
      }));
      const hasPix = messages.some((m) => /pix/i.test(m.content) && /copia e cola|qr|chave/i.test(m.content));
      const review = reviewConversation({
        conversationId: c.id,
        status: c.status,
        hasOrder: !!c.orderId,
        hasPix,
        handoff,
        messages,
      });
      outcomes.push(review.outcome);
    }

    const revenue = whatsappOrders.reduce((sum, o) => sum + Number(o.total ?? 0), 0);

    return buildMonitorSnapshot({
      restaurantSlug: slug,
      periodHours,
      outcomes,
      ordersGenerated: whatsappOrders.length,
      revenue,
      handoffs,
      pendingLearnings,
    });
  } catch (err) {
    return emptySnapshot(slug, periodHours, err instanceof Error ? err.message : "erro ao montar monitor");
  }
}
