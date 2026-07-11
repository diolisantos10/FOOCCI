/**
 * RestaurantKnowledgeAdapter — maps what Foocci ALREADY knows about a restaurant
 * into the generic BusinessKnowledgeSnapshot. Read-only — no customer PII ever
 * enters the snapshot (no names, phones, addresses).
 *
 * v2 is FACT-LEVEL: real menu items with prices (incl. channel prices), real
 * business hours, active promotions and the curated Q&A knowledge base
 * (RestaurantKnowledgeItem ACTIVE) — not just counts. This is the truth the
 * LLM reasons over; the count-only v1 snapshot is why the model once denied
 * that rodízio existed. Everything is capped by a token budget and whatever
 * is not loaded goes to missingContext so the agent never invents.
 */

import { prisma } from "@/lib/prisma";
import type {
  BusinessKnowledgeAdapter,
  BusinessKnowledgeSnapshot,
  KnowledgeSnapshotOptions,
} from "./BusinessKnowledgeContract";
import { rankByEmbedding } from "./KnowledgeEmbeddingService";

// Token budget caps — keep the snapshot prompt-sized.
const MAX_MENU_ITEMS = 120;
const MAX_KNOWLEDGE_ITEMS = 30;
const KNOWLEDGE_FETCH_POOL = 200; // fetched for query-relevance ranking
const MAX_PROMOTIONS = 10;
const MAX_ANSWER_CHARS = 240;

const DAY_NAMES = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"] as const;

function money(v: unknown): number | undefined {
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}

// ── Query-relevant retrieval (embeddings v2 quando há OPENAI_API_KEY; keyword v1 como fallback) ──
interface KnowledgeRow {
  id?: string;
  category: string;
  title: string;
  answer: string;
  questionPatterns: unknown;
  embedding?: unknown; // number[] persistido (Json) ou null
  embeddingModel?: string | null;
}

function normalizeText(s: string): string {
  return s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

function tokensOf(s: string): Set<string> {
  return new Set(normalizeText(s).split(/[^a-z0-9]+/).filter((w) => w.length >= 4));
}

/**
 * Sem queryHint: top-N por uso (comportamento estável). Com queryHint: os itens
 * que batem com a pergunta REAL do cliente sobem — mesmo os raramente usados.
 * É isto que garante que "vocês têm rodízio?" encontra o RODIZIO_INFO curado.
 */
function selectRelevantKnowledge(rows: KnowledgeRow[], queryHint?: string): KnowledgeRow[] {
  if (!queryHint) return rows.slice(0, MAX_KNOWLEDGE_ITEMS);
  const query = tokensOf(queryHint);
  if (!query.size) return rows.slice(0, MAX_KNOWLEDGE_ITEMS);

  const scored = rows.map((row, order) => {
    const patterns = Array.isArray(row.questionPatterns) ? (row.questionPatterns as string[]).join(" ") : "";
    const haystack = tokensOf(`${row.title} ${patterns}`);
    let score = 0;
    for (const t of query) if (haystack.has(t)) score += 1;
    return { row, order, score };
  });
  scored.sort((a, b) => b.score - a.score || a.order - b.order);
  return scored.slice(0, MAX_KNOWLEDGE_ITEMS).map((s) => s.row);
}

/**
 * Retrieval v2: com queryHint E OPENAI_API_KEY, tenta similaridade de embedding
 * (backfill lazy dos vetores). null/vazio (erro de API, mock ausente em teste,
 * chave inválida) → cai no keyword acima EXATAMENTE como antes. Sem queryHint
 * ou sem chave: nem tenta — comportamento atual intacto.
 */
async function selectKnowledgeForQuery(rows: KnowledgeRow[], queryHint?: string): Promise<KnowledgeRow[]> {
  if (queryHint && process.env.OPENAI_API_KEY && rows.length) {
    const ranked = await rankByEmbedding(queryHint, rows).catch(() => null);
    if (ranked && ranked.length) return ranked.slice(0, MAX_KNOWLEDGE_ITEMS);
  }
  return selectRelevantKnowledge(rows, queryHint);
}

export const restaurantKnowledgeAdapter: BusinessKnowledgeAdapter = {
  businessType: "RESTAURANT",

  async getSnapshot(businessId: string, opts?: KnowledgeSnapshotOptions): Promise<BusinessKnowledgeSnapshot> {
    const agentId = opts?.agentId ?? "waiter";
    const missingContext: string[] = [];
    const safetyNotes: string[] = [
      "Nunca inventar produto, preço, forma de pagamento ou promoção que não esteja cadastrado.",
      "Snapshot é agregado — nunca contém nome/telefone/endereço de cliente.",
    ];

    const [restaurant, menuItemCount, menuItems, businessHours, promotions, knowledgeItems, materialCount, approvedEvidenceCount] =
      await Promise.all([
        prisma.restaurant
          .findUnique({
            where: { id: businessId },
            select: {
              name: true,
              paymentSettings: { select: { acceptPix: true, acceptCash: true, acceptCard: true, acceptLink: true } },
              deliveryConfig: { select: { enabled: true, pickupEnabled: true } },
              brandConfig: { select: { tone: true } },
            },
          })
          .catch(() => null),
        prisma.menuItem.count({ where: { category: { restaurantId: businessId } } }).catch(() => 0),
        prisma.menuItem
          .findMany({
            where: { category: { restaurantId: businessId }, isActive: true },
            select: {
              name: true,
              price: true,
              priceDelivery: true,
              priceDineIn: true,
              isAvailable: true,
              category: { select: { name: true } },
            },
            orderBy: [{ category: { sortOrder: "asc" } }, { sortOrder: "asc" }],
            take: MAX_MENU_ITEMS,
          })
          .catch(() => [] as Array<{
            name: string;
            price: unknown;
            priceDelivery: unknown;
            priceDineIn: unknown;
            isAvailable: boolean;
            category: { name: string } | null;
          }>),
        prisma.businessHours
          .findMany({
            where: { restaurantId: businessId },
            select: { dayOfWeek: true, isOpen: true, openTime: true, closeTime: true, periodsJson: true },
            orderBy: { dayOfWeek: "asc" },
          })
          .catch(() => [] as Array<{ dayOfWeek: number; isOpen: boolean; openTime: string; closeTime: string; periodsJson: unknown }>),
        prisma.promotion
          .findMany({
            where: { restaurantId: businessId, status: "ACTIVE" },
            select: { name: true, description: true, type: true, discountValue: true, couponCode: true },
            take: MAX_PROMOTIONS,
          })
          .catch(() => [] as Array<{ name: string; description: string | null; type: string; discountValue: unknown; couponCode: string | null }>),
        prisma.restaurantKnowledgeItem
          .findMany({
            where: { restaurantId: businessId, status: "ACTIVE" },
            select: { id: true, category: true, title: true, answer: true, questionPatterns: true, embedding: true, embeddingModel: true },
            orderBy: { usageCount: "desc" },
            take: KNOWLEDGE_FETCH_POOL,
          })
          .catch(() => [] as KnowledgeRow[]),
        prisma.agentLibrarySource.count({ where: { agentSlug: agentId } }).catch(() => 0),
        prisma.waiterResultEvidence.count({ where: { restaurantId: businessId, status: "APPROVED" } }).catch(() => 0),
      ]);

    if (!restaurant) {
      return {
        businessId,
        businessType: "RESTAURANT",
        truthSources: {},
        missingContext: ["perfil do restaurante", "formas de pagamento", "cardápio", "delivery/retirada"],
        safetyNotes,
        snapshotAsOf: new Date().toISOString(),
        completenessScore: 0,
      };
    }

    const payments = restaurant.paymentSettings
      ? {
          pix: restaurant.paymentSettings.acceptPix,
          cartao: restaurant.paymentSettings.acceptCard,
          dinheiro: restaurant.paymentSettings.acceptCash,
          link: restaurant.paymentSettings.acceptLink,
        }
      : undefined;
    if (!payments) missingContext.push("formas de pagamento");
    // The schema has no meal-voucher (Alelo/VR/Sodexo) configuration; only a curated
    // PAYMENT_INFO knowledge item can answer it — otherwise the agent must not claim it.
    const hasPaymentKnowledge = knowledgeItems.some((k) => k.category === "PAYMENT_INFO");
    if (!hasPaymentKnowledge) missingContext.push("benefício refeição (Alelo/VR/Sodexo) — não cadastrado");

    // ── Products: real names + prices (channel prices when set) ────────────────
    const items = menuItems.map((i) => ({
      nome: i.name,
      categoria: i.category?.name ?? "",
      preco: money(i.price),
      ...(i.priceDelivery != null ? { precoDelivery: money(i.priceDelivery) } : {}),
      ...(i.priceDineIn != null ? { precoSalao: money(i.priceDineIn) } : {}),
      ...(i.isAvailable ? {} : { indisponivel: true }),
    }));
    const products: unknown[] = [{ totalItens: menuItemCount, listados: items.length }, ...items];
    if (menuItemCount > items.length) {
      missingContext.push(`cardápio parcial no contexto (${items.length} de ${menuItemCount} itens) — confirmar antes de negar um item`);
    }
    if (items.length === 0) missingContext.push("cardápio");

    // ── Hours: real weekly schedule + delivery/pickup flags ────────────────────
    const funcionamento: Record<string, string> = {};
    for (const h of businessHours) {
      const day = DAY_NAMES[h.dayOfWeek] ?? String(h.dayOfWeek);
      if (!h.isOpen) {
        funcionamento[day] = "fechado";
      } else if (Array.isArray(h.periodsJson) && h.periodsJson.length) {
        funcionamento[day] = (h.periodsJson as Array<{ open?: string; close?: string }>)
          .map((p) => `${p.open ?? "?"}-${p.close ?? "?"}`)
          .join(", ");
      } else {
        funcionamento[day] = `${h.openTime}-${h.closeTime}`;
      }
    }
    const hours = {
      ...(businessHours.length ? { funcionamento } : {}),
      delivery: restaurant.deliveryConfig?.enabled ?? false,
      retirada: restaurant.deliveryConfig?.pickupEnabled ?? false,
    };
    if (!restaurant.deliveryConfig) missingContext.push("delivery/retirada");
    if (!businessHours.length) missingContext.push("horários de funcionamento detalhados");

    // ── Policies: identity + the curated, human-approved Q&A (highest-quality truth).
    // Com queryHint, os itens relevantes à pergunta REAL sobem (embeddings quando
    // configurados; keyword como fallback determinístico).
    const selectedKnowledge = await selectKnowledgeForQuery(knowledgeItems as KnowledgeRow[], opts?.queryHint);
    const policies: unknown[] = [
      { tone: restaurant.brandConfig?.tone ?? "friendly", nome: restaurant.name },
      ...selectedKnowledge.map((k) => ({
        categoria: k.category,
        pergunta: k.title,
        resposta: k.answer.slice(0, MAX_ANSWER_CHARS),
      })),
    ];

    const prices = promotions.length
      ? promotions.map((p) => ({
          promocao: p.name,
          ...(p.description ? { descricao: p.description.slice(0, MAX_ANSWER_CHARS) } : {}),
          tipo: p.type,
          valor: money(p.discountValue),
          ...(p.couponCode ? { cupom: p.couponCode } : {}),
        }))
      : undefined;

    // ── Completeness: quanto da verdade essencial existe (gate de promoção futura) ──
    const signals = [
      Boolean(payments),
      businessHours.length > 0,
      items.length > 0,
      knowledgeItems.length > 0,
      Boolean(restaurant.deliveryConfig),
    ];
    const completenessScore = signals.filter(Boolean).length / signals.length;

    return {
      businessId,
      businessType: "RESTAURANT",
      truthSources: {
        products,
        ...(prices ? { prices } : {}),
        payments,
        hours,
        policies,
        materials: [{ librarySources: materialCount }],
        evidence: [{ approved: approvedEvidenceCount }],
      },
      missingContext,
      safetyNotes,
      snapshotAsOf: new Date().toISOString(),
      completenessScore,
    };
  },
};
