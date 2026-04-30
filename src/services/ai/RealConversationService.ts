/**
 * RealConversationService
 *
 * Analyzes real customer conversations stored in the DB to extract:
 *   - Classification per conversation (high_conversion, abandoned, etc.)
 *   - Behavioral patterns (what worked vs. what failed)
 *   - Benchmarks (best and worst performing conversations)
 *
 * All customer data is anonymized before being returned — no names,
 * phone numbers, or other PII is exposed to the UI.
 */

import { prisma } from "@/lib/prisma";

// ─── public types ─────────────────────────────────────────────

export type ConversationClass =
  | "high_conversion"   // Converted + cart value above target
  | "low_conversion"    // Converted but cart value below target
  | "abandoned"         // No order confirmed
  | "high_ticket"       // Cart value in top quartile
  | "low_ticket";       // Cart value in bottom quartile

export interface ClassifiedConversation {
  id:               string;
  customerLabel:    string;        // Anonymized: "Cliente #XXXX"
  label:            ConversationClass;
  score:            number;        // 0–100 quality score
  cartValue:        number;
  turns:            number;
  converted:        boolean;
  upsellAttempts:   number;
  upsellAccepted:   number;        // OrderDraftItems with isUpsell = true
  drinkAttempted:   boolean;
  dessertAttempted: boolean;
  preview:          string;        // Anonymized last AI message snippet
  createdAt:        string;
  resolvedAt:       string | null;
}

export interface ConversationPattern {
  description: string;
  impact:      "positive" | "negative" | "neutral";
  count:       number;
  frequency:   number;   // 0–1 rate across analyzed conversations
  metric?:     string;   // e.g., "ticket médio +R$18"
}

export interface RealConversationReport {
  total:               number;
  classBreakdown:      Record<ConversationClass, number>;
  topConversations:    ClassifiedConversation[];
  bottomConversations: ClassifiedConversation[];
  patterns:            ConversationPattern[];
  avgCartValue:        number;
  avgTurns:            number;
  conversionRate:      number;
  upsellCoverageRate:  number;   // % of conversations with ≥1 upsell attempt
  generatedAt:         string;
}

// ─── constants ────────────────────────────────────────────────

const HIGH_TICKET_THRESHOLD = 80;   // R$80 target
const LOW_TICKET_THRESHOLD  = 30;   // R$30 min meaningful order

// Keywords to detect drink/dessert tool call categories
const DRINK_TOOL_KWS   = ["bebida", "suco", "refrigerante", "agua", "cerveja", "drink", "limonada", "cha", "cafe"];
const DESSERT_TOOL_KWS = ["sobremesa", "doce", "pudim", "sorvete", "brownie", "torta", "bolo", "acai"];

function normStr(s: string) {
  return s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
}

function looksLikeDrink(itemName: string, catName: string): boolean {
  const t = normStr(`${itemName} ${catName}`);
  return DRINK_TOOL_KWS.some((k) => t.includes(k));
}

function looksLikeDesset(itemName: string, catName: string): boolean {
  const t = normStr(`${itemName} ${catName}`);
  return DESSERT_TOOL_KWS.some((k) => t.includes(k));
}

// Scrub any content that might contain PII (phone patterns, e-mails)
function anonymizeText(text: string): string {
  return text
    .replace(/\+?\d[\d\s\-().]{8,}\d/g, "***")                       // phones
    .replace(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, "***") // emails
    .slice(0, 120);
}

// ─── service ──────────────────────────────────────────────────

export class RealConversationService {
  /**
   * Fetch and analyze the last `limit` real conversations for a restaurant.
   * Returns a full RealConversationReport without any customer PII.
   */
  static async analyze(
    restaurantId: string,
    limit = 50,
  ): Promise<RealConversationReport> {
    // ── 1. Load conversations ────────────────────────────────
    const conversations = await prisma.conversation.findMany({
      where: {
        restaurantId,
        // Exclude purely-simulated conversations ([SIM] prefix in customer name)
        customer: { NOT: { name: { startsWith: "[SIM]" } } },
      },
      orderBy: { createdAt: "desc" },
      take: limit,
      select: {
        id:         true,
        customerId: true,
        status:     true,
        createdAt:  true,
        resolvedAt: true,
        // Inbound messages = customer turns
        messages: {
          where:   { direction: "INBOUND" },
          select:  { id: true },
        },
        // Last outbound message for preview
        _count: { select: { messages: true } },
      },
    });

    if (conversations.length === 0) {
      return emptyReport();
    }

    const conversationIds = conversations.map((c: { id: string }) => c.id);

    // ── 2. Load linked OrderDrafts ────────────────────────────
    const drafts = await prisma.orderDraft.findMany({
      where: { conversationId: { in: conversationIds } },
      select: {
        id:             true,
        conversationId: true,
        status:         true,
        totalAmount:    true,
        items: {
          select: {
            id:       true,
            isUpsell: true,
            quantity: true,
            menuItem: { select: { name: true, category: { select: { name: true } } } },
          },
        },
      },
    });

    type DraftRow = (typeof drafts)[number];
    const draftByConvId = new Map<string, DraftRow>();
    for (const d of drafts) {
      if (d.conversationId) draftByConvId.set(d.conversationId, d);
    }

    // ── 3. Aggregate AIInteractionLog tool calls per conversation ─
    const logs = await prisma.aIInteractionLog.findMany({
      where: { conversationId: { in: conversationIds } },
      select: { conversationId: true, toolCalls: true },
    });

    const toolCallsByConvId = new Map<string, Array<{ name: string; args?: unknown }>>();
    for (const log of logs) {
      if (!log.conversationId) continue;
      const existing = toolCallsByConvId.get(log.conversationId) ?? [];
      if (Array.isArray(log.toolCalls)) {
        existing.push(...(log.toolCalls as Array<{ name: string; args?: unknown }>));
      }
      toolCallsByConvId.set(log.conversationId, existing);
    }

    // ── 4. Load last outbound AI message per conversation ─────
    const lastAiMessages = await prisma.message.findMany({
      where: {
        conversationId: { in: conversationIds },
        direction: "OUTBOUND",
      },
      orderBy: { sentAt: "desc" },
      distinct: ["conversationId"],
      select: { conversationId: true, content: true },
    });

    const lastAiByConvId = new Map<string, string>(
      lastAiMessages.map((m: { conversationId: string; content: string }) => [m.conversationId, m.content]),
    );

    // ── 5. Classify each conversation ─────────────────────────
    const classified: ClassifiedConversation[] = [];

    for (const conv of conversations) {
      const draft    = draftByConvId.get(conv.id);
      const toolCalls = toolCallsByConvId.get(conv.id) ?? [];
      const lastAiText = lastAiByConvId.get(conv.id) ?? "";

      const cartValue  = draft ? Number(draft.totalAmount) : 0;
      const converted  = draft?.status === "CONFIRMED";
      const turns      = conv.messages.length; // inbound messages only

      // Upsell counts
      const upsellCalls = toolCalls.filter((tc) => tc.name === "suggest_upsell");
      const upsellAttempts = upsellCalls.length;
      const upsellAccepted = draft?.items.filter((i: { isUpsell: boolean }) => i.isUpsell).length ?? 0;

      // Drink / dessert detection from draft items and tool call args
      let drinkAttempted   = false;
      let dessertAttempted = false;

      for (const item of draft?.items ?? []) {
        const name = item.menuItem?.name ?? "";
        const cat  = item.menuItem?.category?.name ?? "";
        if (looksLikeDrink(name, cat))   drinkAttempted = true;
        if (looksLikeDesset(name, cat))  dessertAttempted = true;
      }

      // Also check suggest_upsell args for itemId → category name
      // (best-effort; falls back to item analysis above)
      for (const tc of upsellCalls) {
        const args = tc.args as Record<string, unknown> | undefined;
        if (typeof args?.menuItemId === "string") {
          // We'd need a join to resolve category — skip here, covered by items above
        }
      }

      const label = classifyConversation(converted, cartValue);

      const score = computeScore({
        converted, cartValue, upsellAttempts, upsellAccepted, turns,
        drinkAttempted, dessertAttempted,
      });

      classified.push({
        id:            conv.id,
        customerLabel: `Cliente #${conv.customerId.slice(-4).toUpperCase()}`,
        label,
        score,
        cartValue,
        turns,
        converted,
        upsellAttempts,
        upsellAccepted,
        drinkAttempted,
        dessertAttempted,
        preview:    anonymizeText(lastAiText),
        createdAt:  conv.createdAt.toISOString(),
        resolvedAt: conv.resolvedAt?.toISOString() ?? null,
      });
    }

    // ── 6. Aggregate metrics ───────────────────────────────────
    const n = classified.length || 1;
    const avgCartValue    = classified.reduce((s, c) => s + c.cartValue, 0) / n;
    const avgTurns        = classified.reduce((s, c) => s + c.turns,     0) / n;
    const conversionRate  = classified.filter((c) => c.converted).length / n;
    const upsellCoverage  = classified.filter((c) => c.upsellAttempts > 0).length / n;

    const classBreakdown: Record<ConversationClass, number> = {
      high_conversion: 0,
      low_conversion:  0,
      abandoned:       0,
      high_ticket:     0,
      low_ticket:      0,
    };
    for (const c of classified) classBreakdown[c.label]++;

    // ── 7. Patterns ───────────────────────────────────────────
    const patterns = extractPatterns(classified, n);

    // ── 8. Benchmarks ─────────────────────────────────────────
    const sorted = [...classified].sort((a, b) => b.score - a.score);
    const topConversations    = sorted.slice(0, 5);
    const bottomConversations = sorted.slice(-5).reverse();

    return {
      total:             classified.length,
      classBreakdown,
      topConversations,
      bottomConversations,
      patterns,
      avgCartValue,
      avgTurns,
      conversionRate,
      upsellCoverageRate: upsellCoverage,
      generatedAt:        new Date().toISOString(),
    };
  }
}

// ─── classification logic ─────────────────────────────────────

function classifyConversation(converted: boolean, cartValue: number): ConversationClass {
  if (!converted)                              return "abandoned";
  if (cartValue >= HIGH_TICKET_THRESHOLD)      return "high_ticket";
  if (cartValue >= LOW_TICKET_THRESHOLD)       return "high_conversion";
  if (cartValue > 0)                           return "low_ticket";
  return "low_conversion";
}

// ─── scoring ──────────────────────────────────────────────────

function computeScore(params: {
  converted:       boolean;
  cartValue:       number;
  upsellAttempts:  number;
  upsellAccepted:  number;
  turns:           number;
  drinkAttempted:  boolean;
  dessertAttempted: boolean;
}): number {
  const { converted, cartValue, upsellAttempts, upsellAccepted, turns, drinkAttempted, dessertAttempted } = params;

  let score = 0;

  // Conversion: 40 pts
  if (converted) score += 40;

  // Cart value relative to target: up to 30 pts
  if (converted && cartValue > 0) {
    const ratio = Math.min(1, cartValue / HIGH_TICKET_THRESHOLD);
    score += Math.round(ratio * 30);
  }

  // Upsell coverage: up to 20 pts
  if (drinkAttempted)   score += 10;
  if (dessertAttempted) score += 10;

  // Upsell acceptance bonus: up to 10 pts
  if (upsellAttempts > 0) {
    const acceptRate = upsellAccepted / upsellAttempts;
    score += Math.round(acceptRate * 10);
  }

  // Efficiency penalty: penalize if too many turns (>12)
  if (turns > 12) score -= Math.min(10, (turns - 12) * 2);

  return Math.round(Math.max(0, Math.min(100, score)));
}

// ─── pattern extraction ───────────────────────────────────────

function extractPatterns(
  convs: ClassifiedConversation[],
  n: number,
): ConversationPattern[] {
  const patterns: ConversationPattern[] = [];

  // ── Pattern A: Upsell impact on ticket ────────────────────
  const withUpsell    = convs.filter((c) => c.upsellAttempts > 0);
  const withoutUpsell = convs.filter((c) => c.upsellAttempts === 0 && c.converted);

  if (withUpsell.length > 0 && withoutUpsell.length > 0) {
    const avgWith    = avg(withUpsell.filter((c) => c.converted).map((c) => c.cartValue));
    const avgWithout = avg(withoutUpsell.map((c) => c.cartValue));
    const diff       = avgWith - avgWithout;
    if (Math.abs(diff) >= 5) {
      patterns.push({
        description: diff > 0
          ? "Conversas com upsell geraram ticket maior"
          : "Upsell não aumentou o ticket médio nesse período",
        impact:    diff > 0 ? "positive" : "negative",
        count:     withUpsell.length,
        frequency: withUpsell.length / n,
        metric:    `ticket médio ${diff > 0 ? "+" : ""}R$${Math.abs(diff).toFixed(0)} vs sem upsell`,
      });
    }
  }

  // ── Pattern B: Drink coverage ──────────────────────────────
  const withDrink    = convs.filter((c) => c.drinkAttempted && c.converted);
  const withoutDrink = convs.filter((c) => !c.drinkAttempted && c.converted);

  if (withDrink.length > 0) {
    const avgWith    = avg(withDrink.map((c) => c.cartValue));
    const avgWithout = avg(withoutDrink.map((c) => c.cartValue));
    const diff       = avgWith - avgWithout;
    patterns.push({
      description: "Pedidos com bebida sugerida",
      impact:      diff >= 0 ? "positive" : "neutral",
      count:       withDrink.length,
      frequency:   withDrink.length / n,
      metric:      `ticket médio R$${avgWith.toFixed(0)}${withoutDrink.length > 0 ? ` vs R$${avgWithout.toFixed(0)} sem bebida` : ""}`,
    });
  }

  // ── Pattern C: Abandoned rate ──────────────────────────────
  const abandoned = convs.filter((c) => !c.converted);
  if (abandoned.length > 0) {
    const avgAbandonedTurns = avg(abandoned.map((c) => c.turns));
    patterns.push({
      description: "Conversas abandonadas sem pedido",
      impact:      "negative",
      count:       abandoned.length,
      frequency:   abandoned.length / n,
      metric:      `média de ${avgAbandonedTurns.toFixed(1)} turnos antes do abandono`,
    });
  }

  // ── Pattern D: Short vs long conversations ─────────────────
  const short = convs.filter((c) => c.turns <= 5 && c.converted);
  const long  = convs.filter((c) => c.turns >  8 && c.converted);

  if (short.length > 0 && long.length > 0) {
    const avgShort = avg(short.map((c) => c.cartValue));
    const avgLong  = avg(long.map((c) => c.cartValue));
    patterns.push({
      description: "Conversas curtas (≤5 turnos) fechadas com sucesso",
      impact:      "positive",
      count:       short.length,
      frequency:   short.length / n,
      metric:      `ticket médio R$${avgShort.toFixed(0)} vs R$${avgLong.toFixed(0)} em conversas longas`,
    });
  }

  // ── Pattern E: High-ticket drivers ────────────────────────
  const highTicket = convs.filter((c) => c.cartValue >= HIGH_TICKET_THRESHOLD);
  if (highTicket.length > 0) {
    const withBothUpsells = highTicket.filter((c) => c.drinkAttempted && c.dessertAttempted);
    patterns.push({
      description: `Pedidos acima de R$${HIGH_TICKET_THRESHOLD}`,
      impact:      "positive",
      count:       highTicket.length,
      frequency:   highTicket.length / n,
      metric:      withBothUpsells.length > 0
        ? `${Math.round((withBothUpsells.length / highTicket.length) * 100)}% com bebida e sobremesa`
        : `ticket médio R$${avg(highTicket.map((c) => c.cartValue)).toFixed(0)}`,
    });
  }

  // ── Pattern F: No upsell → missed revenue ─────────────────
  const noUpsell = convs.filter((c) => c.converted && c.upsellAttempts === 0);
  if (noUpsell.length > 0) {
    patterns.push({
      description: "Pedidos convertidos SEM nenhum upsell tentado",
      impact:      "negative",
      count:       noUpsell.length,
      frequency:   noUpsell.length / n,
      metric:      `receita potencial não capturada nesses ${noUpsell.length} pedido${noUpsell.length > 1 ? "s" : ""}`,
    });
  }

  return patterns.sort((a, b) => Math.abs(b.frequency) - Math.abs(a.frequency)).slice(0, 6);
}

// ─── helpers ──────────────────────────────────────────────────

function avg(nums: number[]): number {
  return nums.length === 0 ? 0 : nums.reduce((s, n) => s + n, 0) / nums.length;
}

function emptyReport(): RealConversationReport {
  return {
    total:             0,
    classBreakdown:    { high_conversion: 0, low_conversion: 0, abandoned: 0, high_ticket: 0, low_ticket: 0 },
    topConversations:  [],
    bottomConversations: [],
    patterns:          [],
    avgCartValue:      0,
    avgTurns:          0,
    conversionRate:    0,
    upsellCoverageRate: 0,
    generatedAt:       new Date().toISOString(),
  };
}
