/**
 * RestaurantKnowledgeService
 *
 * Manages the restaurant knowledge base used by the WhatsApp Agent to answer
 * customer questions without hallucinating.
 *
 * Knowledge lifecycle:
 *   SUGGESTED → (owner reviews) → APPROVED / REJECTED
 *   APPROVED  → (owner activates) → ACTIVE
 *
 * The agent only reads ACTIVE items. SUGGESTED items appear in the approval UI.
 * No knowledge is ever activated automatically — owner must explicitly approve.
 */

import { prisma } from "@/lib/prisma";

// ── Types ──────────────────────────────────────────────────────────────────────

export type KnowledgeStatus   = "SUGGESTED" | "APPROVED" | "REJECTED" | "ACTIVE";
export type KnowledgeSource   = "HUMAN_REPLY" | "MANUAL" | "AI_SUGGESTED" | "IMPORTED";
export type KnowledgeCategory =
  | "FAQ"
  | "POLICY"
  | "PROMOTION"
  | "BUSINESS_HOURS"
  | "DELIVERY_INFO"
  | "RODIZIO_INFO"
  | "BIRTHDAY_BENEFIT"
  | "PAYMENT_INFO"
  | "HUMAN_HANDOFF_RULE"
  | "UNKNOWN_GAP";

export const KNOWLEDGE_CATEGORIES: { id: KnowledgeCategory; label: string }[] = [
  { id: "FAQ",               label: "FAQ geral"           },
  { id: "BUSINESS_HOURS",   label: "Horários"             },
  { id: "BIRTHDAY_BENEFIT", label: "Benefício aniversário"},
  { id: "RODIZIO_INFO",     label: "Rodízio"              },
  { id: "PROMOTION",        label: "Promoção"             },
  { id: "DELIVERY_INFO",    label: "Entrega / Delivery"   },
  { id: "PAYMENT_INFO",     label: "Formas de pagamento"  },
  { id: "POLICY",           label: "Política"             },
  { id: "HUMAN_HANDOFF_RULE", label: "Regra de encaminhamento" },
  { id: "UNKNOWN_GAP",      label: "Gap sem resposta"     },
];

export interface KnowledgeItem {
  id:                        string;
  restaurantId:              string;
  title:                     string;
  category:                  string;
  questionPatterns:          string[];
  answer:                    string;
  status:                    string;
  source:                    string;
  confidence:                number | null;
  createdFromConversationId: string | null;
  createdFromMessageIds:     string[] | null;
  usageCount:                number;
  lastUsedAt:                Date | null;
  createdAt:                 Date;
  updatedAt:                 Date;
}

export interface CreateKnowledgeInput {
  title:                     string;
  category:                  KnowledgeCategory;
  questionPatterns:          string[];
  answer:                    string;
  status:                    KnowledgeStatus;
  source:                    KnowledgeSource;
  confidence?:               number;
  createdFromConversationId?: string;
  createdFromMessageIds?:    string[];
}

export interface UpdateKnowledgeInput {
  title?:            string;
  category?:         string;
  questionPatterns?: string[];
  answer?:           string;
  status?:           KnowledgeStatus;
  confidence?:       number | null;
}

// ── Keyword matching ───────────────────────────────────────────────────────────

const PT_STOPWORDS = new Set([
  "a","o","e","é","em","de","da","do","dos","das","que","se","por","com",
  "um","uma","mais","como","para","não","nao","sim","mas","ou","eu","tu",
  "ele","ela","nós","vocês","eles","tem","ter","ser","foi","são","sao",
  "esse","esta","este","essa","isso","aqui","ali","lá","la","já","ja",
  "pode","pois","pelo","pela","meu","minha","seu","sua","qual","quando",
  "onde","quem","há","ha","até","ate","ai","aí","tudo","todo","toda","bem",
]);

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")   // strip accents
    .replace(/[^\w\s]/g, " ")           // remove punctuation
    .split(/\s+/)
    .filter((w) => w.length > 2 && !PT_STOPWORDS.has(w));
}

/**
 * Score how well a customer message matches a knowledge item's question patterns.
 * Returns 0.0–1.0. A score ≥ MATCH_THRESHOLD means the item is relevant.
 */
const MATCH_THRESHOLD = 0.25;

function scoreMatch(customerTokens: string[], questionPatterns: string[]): number {
  if (questionPatterns.length === 0 || customerTokens.length === 0) return 0;

  const patternTokens = new Set(
    questionPatterns.flatMap((p) => tokenize(p))
  );
  if (patternTokens.size === 0) return 0;

  const matchCount = customerTokens.filter((t) => patternTokens.has(t)).length;
  return matchCount / Math.max(customerTokens.length, patternTokens.size);
}

// ── Service ────────────────────────────────────────────────────────────────────

export const RestaurantKnowledgeService = {
  // ── Read ───────────────────────────────────────────────────────────────────

  async list(restaurantId: string, status?: KnowledgeStatus): Promise<KnowledgeItem[]> {
    const rows = await prisma.restaurantKnowledgeItem.findMany({
      where:   { restaurantId, ...(status ? { status } : {}) },
      orderBy: [{ createdAt: "desc" }],
    });
    return rows.map(toKnowledgeItem);
  },

  async getById(id: string, restaurantId: string): Promise<KnowledgeItem | null> {
    const row = await prisma.restaurantKnowledgeItem.findFirst({
      where: { id, restaurantId },
    });
    return row ? toKnowledgeItem(row) : null;
  },

  /** Returns all ACTIVE knowledge items — used by the WhatsApp Agent at runtime. */
  async getActive(restaurantId: string): Promise<KnowledgeItem[]> {
    const rows = await prisma.restaurantKnowledgeItem.findMany({
      where:   { restaurantId, status: "ACTIVE" },
      orderBy: { usageCount: "desc" },
    });
    return rows.map(toKnowledgeItem);
  },

  /**
   * Find the best matching ACTIVE knowledge item for a customer message.
   * Returns null if no item scores above the threshold.
   */
  async findMatch(restaurantId: string, customerMessage: string): Promise<KnowledgeItem | null> {
    const active = await RestaurantKnowledgeService.getActive(restaurantId);
    if (active.length === 0) return null;

    const tokens = tokenize(customerMessage);
    if (tokens.length === 0) return null;

    let best: KnowledgeItem | null = null;
    let bestScore = MATCH_THRESHOLD;

    for (const item of active) {
      if (item.category === "UNKNOWN_GAP") continue; // gaps have no answer to give
      const score = scoreMatch(tokens, item.questionPatterns);
      if (score > bestScore) {
        bestScore = score;
        best = item;
      }
    }

    return best;
  },

  // ── Create ─────────────────────────────────────────────────────────────────

  async create(restaurantId: string, input: CreateKnowledgeInput): Promise<KnowledgeItem> {
    const row = await prisma.restaurantKnowledgeItem.create({
      data: {
        restaurantId,
        title:            input.title,
        category:         input.category,
        questionPatterns: input.questionPatterns,
        answer:           input.answer,
        status:           input.status,
        source:           input.source,
        confidence:       input.confidence ?? null,
        createdFromConversationId: input.createdFromConversationId ?? null,
        createdFromMessageIds:     input.createdFromMessageIds ?? undefined,
      },
    });
    return toKnowledgeItem(row);
  },

  // ── Update ─────────────────────────────────────────────────────────────────

  async update(id: string, restaurantId: string, input: UpdateKnowledgeInput): Promise<KnowledgeItem> {
    const row = await prisma.restaurantKnowledgeItem.update({
      where: { id },
      data: {
        ...(input.title            !== undefined && { title:            input.title            }),
        ...(input.category         !== undefined && { category:         input.category         }),
        ...(input.questionPatterns !== undefined && { questionPatterns: input.questionPatterns }),
        ...(input.answer           !== undefined && { answer:           input.answer           }),
        ...(input.status           !== undefined && { status:           input.status           }),
        ...(input.confidence       !== undefined && { confidence:       input.confidence       }),
      },
    });
    // Verify ownership
    if (row.restaurantId !== restaurantId) {
      throw new Error("Unauthorized");
    }
    return toKnowledgeItem(row);
  },

  // ── Delete ─────────────────────────────────────────────────────────────────

  async delete(id: string, restaurantId: string): Promise<void> {
    const row = await prisma.restaurantKnowledgeItem.findFirst({ where: { id, restaurantId } });
    if (!row) throw new Error("Not found");
    await prisma.restaurantKnowledgeItem.delete({ where: { id } });
  },

  // ── Usage tracking ─────────────────────────────────────────────────────────

  async incrementUsage(id: string): Promise<void> {
    await prisma.restaurantKnowledgeItem.update({
      where: { id },
      data:  { usageCount: { increment: 1 }, lastUsedAt: new Date() },
    });
  },

  // ── Learning ───────────────────────────────────────────────────────────────

  /**
   * Create a SUGGESTED knowledge item from a human-reply message pair.
   * The item is never ACTIVE until owner explicitly approves it.
   */
  async suggestFromHumanReply(
    restaurantId:              string,
    customerQuestion:          string,
    humanAnswer:               string,
    suggestedCategory:         KnowledgeCategory,
    createdFromConversationId: string,
    createdFromMessageIds:     string[],
  ): Promise<KnowledgeItem> {
    return RestaurantKnowledgeService.create(restaurantId, {
      title:            `Aprendizado: "${customerQuestion.slice(0, 60)}"`,
      category:         suggestedCategory,
      questionPatterns: [customerQuestion],
      answer:           humanAnswer,
      status:           "SUGGESTED",
      source:           "HUMAN_REPLY",
      confidence:       0.7,
      createdFromConversationId,
      createdFromMessageIds,
    });
  },

  /**
   * Create an UNKNOWN_GAP item when AI cannot confidently answer.
   * These appear in the approval UI as "gaps to fill".
   */
  async createGap(
    restaurantId:     string,
    customerQuestion: string,
    conversationId:   string,
  ): Promise<void> {
    // De-duplicate: don't create gap if similar one already exists
    const existing = await prisma.restaurantKnowledgeItem.findFirst({
      where: {
        restaurantId,
        category: "UNKNOWN_GAP",
        status:   { not: "REJECTED" },
      },
    });

    // Rough de-dup: if a gap exists with >50% token overlap, skip
    if (existing) {
      const existingPatterns = existing.questionPatterns as string[];
      const score = scoreMatch(tokenize(customerQuestion), existingPatterns);
      if (score > 0.4) return;
    }

    await RestaurantKnowledgeService.create(restaurantId, {
      title:            `Gap detectado: "${customerQuestion.slice(0, 60)}"`,
      category:         "UNKNOWN_GAP",
      questionPatterns: [customerQuestion],
      answer:           "",
      status:           "SUGGESTED",
      source:           "AI_SUGGESTED",
      confidence:       0,
      createdFromConversationId: conversationId,
    });
  },
};

// ── Internal helper ────────────────────────────────────────────────────────────

function toKnowledgeItem(row: {
  id: string;
  restaurantId: string;
  title: string;
  category: string;
  questionPatterns: unknown;
  answer: string;
  status: string;
  source: string;
  confidence: number | null;
  createdFromConversationId: string | null;
  createdFromMessageIds: unknown;
  usageCount: number;
  lastUsedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}): KnowledgeItem {
  return {
    ...row,
    questionPatterns:      Array.isArray(row.questionPatterns) ? (row.questionPatterns as string[]) : [],
    createdFromMessageIds: Array.isArray(row.createdFromMessageIds) ? (row.createdFromMessageIds as string[]) : null,
  };
}
