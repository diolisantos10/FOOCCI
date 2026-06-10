/**
 * WaiterResultEvidenceCollector — populates "Provas de Resultado" from REAL orders
 * attributed to Foocci/Waiter, read-only and honest.
 *
 * Attribution mirrors the dashboard: completed orders whose `source` is an agent
 * channel (pedido | qr | whatsapp) count as Foocci-generated revenue. For each:
 *   • SALE_CONVERSION — orderValue = Order.total;
 *   • UPSELL — when the order has items flagged isUpsell, incrementalValue =
 *     SUM(isUpsell item totals).
 *
 * Confidence:
 *   • HIGH   — a related conversation was found (via OrderDraft.conversationId)
 *              and a sanitized excerpt is attached;
 *   • MEDIUM — attributed by order channel only (no conversation found) — the
 *              summary says so and NO dialogue is invented.
 *
 * DRAFT only (human review required); excerpts sanitized BEFORE persisting;
 * idempotent by (sourceType=ORDER, sourceId=orderId, evidenceType). Never mutates
 * an order/conversation, never sends anything, never touches the runtime.
 */

import { prisma } from "@/lib/prisma";
import { sanitizeText } from "@/services/simulation/simulationSanitizer";
import { createEvidence } from "./WaiterEvidenceService";

const AGENT = "waiter";
const AGENT_SOURCES = ["pedido", "qr", "whatsapp"] as const;
const COMPLETED = ["CONFIRMED", "PREPARING", "READY", "OUT_FOR_DELIVERY", "DELIVERED"] as const;

export interface OrderForEvidence {
  id: string;
  restaurantId: string;
  source: string | null;
  total: number;
  createdAt: Date;
  conversationId: string | null;
  upsellTotal: number; // SUM of isUpsell item totals (0 if none)
}

export type FetchOrdersForEvidence = (opts: { restaurantId?: string; limit: number; days: number }) => Promise<OrderForEvidence[]>;
/** Returns the first sanitized customer message of a conversation, or null. */
export type FetchConversationExcerpt = (conversationId: string) => Promise<string | null>;

const defaultFetchOrders: FetchOrdersForEvidence = async ({ restaurantId, limit, days }) => {
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  const rows = await prisma.order.findMany({
    where: {
      ...(restaurantId ? { restaurantId } : {}),
      source: { in: [...AGENT_SOURCES] },
      status: { in: [...COMPLETED] as never[] },
      createdAt: { gte: since },
    },
    orderBy: { createdAt: "desc" },
    take: limit,
    select: {
      id: true, restaurantId: true, source: true, total: true, createdAt: true,
      orderDraft: { select: { conversationId: true } },
      items: { where: { isUpsell: true }, select: { total: true } },
    },
  });
  return rows.map((o) => ({
    id: o.id,
    restaurantId: o.restaurantId,
    source: o.source,
    total: Number(o.total),
    createdAt: o.createdAt,
    conversationId: o.orderDraft?.conversationId ?? null,
    upsellTotal: o.items.reduce((s, it) => s + Number(it.total), 0),
  }));
};

const defaultFetchExcerpt: FetchConversationExcerpt = async (conversationId) => {
  const msg = await prisma.message.findFirst({
    where: { conversationId, content: { not: "" } },
    orderBy: { sentAt: "asc" },
    select: { content: true },
  });
  return msg?.content ?? null;
};

const channelLabel = (s: string | null) =>
  s === "pedido" ? "cardápio digital" : s === "qr" ? "QR na mesa" : s === "whatsapp" ? "WhatsApp" : (s ?? "Foocci");

export interface CollectRevenueResult {
  ok: boolean;
  scanned: number;
  created: number;
  skipped: number;
  byType: Record<string, number>;
  documentedRevenue: number;
  documentedIncremental: number;
  runtimeTouched: false;
}

export async function collectResultEvidenceFromOrders(
  options: { restaurantId?: string; limit?: number; days?: number } = {},
  deps: { fetchOrders?: FetchOrdersForEvidence; fetchExcerpt?: FetchConversationExcerpt } = {},
): Promise<CollectRevenueResult> {
  const limit = Math.min(Math.max(options.limit ?? 100, 1), 500);
  const days = Math.min(Math.max(options.days ?? 30, 1), 180);
  const fetchOrders = deps.fetchOrders ?? defaultFetchOrders;
  const fetchExcerpt = deps.fetchExcerpt ?? defaultFetchExcerpt;

  const orders = await fetchOrders({ restaurantId: options.restaurantId, limit, days });

  const ids = orders.map((o) => o.id);
  const existing = await prisma.waiterResultEvidence.findMany({
    where: { agentSlug: AGENT, sourceType: "ORDER", sourceId: { in: ids } },
    select: { sourceId: true, evidenceType: true },
  });
  const seen = new Set(existing.map((e) => `${e.sourceId}:${e.evidenceType}`));

  let created = 0;
  let skipped = 0;
  let documentedRevenue = 0;
  let documentedIncremental = 0;
  const byType: Record<string, number> = {};

  for (const o of orders) {
    // Optional related conversation → HIGH confidence + sanitized excerpt.
    let excerpt: string | null = null;
    if (o.conversationId) {
      const raw = await fetchExcerpt(o.conversationId).catch(() => null);
      if (raw && raw.trim()) excerpt = sanitizeText(raw);
    }
    const confidence: "HIGH" | "MEDIUM" = excerpt ? "HIGH" : "MEDIUM";
    const where = channelLabel(o.source);

    // 1) SALE_CONVERSION — always, for an attributed completed order.
    const saleKey = `${o.id}:SALE_CONVERSION`;
    if (!seen.has(saleKey)) {
      const summary = excerpt
        ? `Pedido concluído pelo ${where} após conversa com o Waiter.`
        : `Venda atribuída ao Foocci pelo canal do pedido (${where}). Conversa relacionada não encontrada.`;
      try {
        await createEvidence({
          restaurantId: o.restaurantId,
          sourceType: "ORDER",
          sourceId: o.id,
          title: "Venda conduzida pelo Waiter",
          summary,
          evidenceType: "SALE_CONVERSION",
          orderValue: o.total,
          excerpt: excerpt ?? undefined,
          confidence,
          metadata: { channel: o.source, detectedBy: "WaiterResultEvidenceCollector", hasConversation: !!excerpt },
        });
        created += 1; documentedRevenue += o.total;
        byType.SALE_CONVERSION = (byType.SALE_CONVERSION ?? 0) + 1;
        seen.add(saleKey);
      } catch { skipped += 1; }
    } else { skipped += 1; }

    // 2) UPSELL — only when there is real upsell value in the order.
    if (o.upsellTotal > 0) {
      const upKey = `${o.id}:UPSELL`;
      if (!seen.has(upKey)) {
        try {
          await createEvidence({
            restaurantId: o.restaurantId,
            sourceType: "ORDER",
            sourceId: o.id,
            title: "Venda extra (upsell) sugerida pelo Waiter",
            summary: `Itens adicionais sugeridos pelo Waiter somaram R$ ${o.upsellTotal.toFixed(2)} neste pedido (${where}).`,
            evidenceType: "UPSELL",
            orderValue: o.total,
            valueBefore: o.total - o.upsellTotal,
            valueAfter: o.total,
            excerpt: excerpt ?? undefined,
            confidence,
            metadata: { channel: o.source, detectedBy: "WaiterResultEvidenceCollector", upsellTotal: o.upsellTotal },
          });
          created += 1; documentedIncremental += o.upsellTotal;
          byType.UPSELL = (byType.UPSELL ?? 0) + 1;
          seen.add(upKey);
        } catch { skipped += 1; }
      }
    }
  }

  return {
    ok: true,
    scanned: orders.length,
    created,
    skipped,
    byType,
    documentedRevenue: Math.round(documentedRevenue * 100) / 100,
    documentedIncremental: Math.round(documentedIncremental * 100) / 100,
    runtimeTouched: false,
  };
}
