/**
 * WaiterEvidenceCollector — initial AUTOMATIC detection of result evidence from
 * real data, read-only and conservative:
 *
 *  • QUALITATIVE_PROOF — customer praise in recent conversations;
 *  • SALE_CONVERSION  — conversation where the customer asked to finish the order
 *    (strong conduction signal in the transcript itself).
 *
 * Upsell/recovery/before-after detection needs reliable order↔conversation linkage
 * and is intentionally NOT auto-detected yet (documented as partial) — those are
 * captured manually via "Criar evidência manual" until the data is trustworthy.
 *
 * Everything created here is DRAFT (human review required), the excerpt is
 * sanitized BEFORE persisting, and the collector NEVER mutates a conversation,
 * order or anything else. Idempotent by (sourceType, sourceId, evidenceType).
 */

import { prisma } from "@/lib/prisma";
import { sanitizeText } from "@/services/simulation/simulationSanitizer";
import { createEvidence } from "./WaiterEvidenceService";

const AGENT = "waiter";

const PRAISE_RE = /\bobrigad|parab[ée]ns|excelente|maravilh|adorei|amei|muito bom|top demais|atendimento [óo]timo\b/i;
const CONVERSION_RE = /\bfinaliz|fechar (?:o )?pedido|fecha a[íi]\b/i;

export interface RawConversationForEvidence {
  id: string;
  restaurantId: string | null;
  messages: Array<{ senderType: string | null; direction: string; content: string }>;
}

export type FetchConversationsForEvidence = (opts: { restaurantId?: string; limit: number; days: number }) => Promise<RawConversationForEvidence[]>;

/** Production source — reads Conversation + Message READ-ONLY. */
const defaultFetch: FetchConversationsForEvidence = async ({ restaurantId, limit, days }) => {
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  const rows = await prisma.conversation.findMany({
    where: {
      ...(restaurantId ? { restaurantId } : {}),
      createdAt: { gte: since },
      messages: { some: { content: { not: "" } } },
    },
    orderBy: { lastMessageAt: "desc" },
    take: limit,
    select: {
      id: true,
      restaurantId: true,
      messages: { orderBy: { sentAt: "asc" }, take: 16, select: { senderType: true, direction: true, content: true } },
    },
  });
  return rows;
};

function isCustomer(m: { senderType: string | null; direction: string }): boolean {
  if (m.senderType === "CUSTOMER") return true;
  if (m.senderType === "AI" || m.senderType === "HUMAN") return false;
  return m.direction === "INBOUND";
}

export interface CollectResult {
  ok: boolean;
  scanned: number;
  created: number;
  skipped: number;
  byType: Record<string, number>;
  runtimeTouched: false;
}

export async function collectEvidence(
  options: { restaurantId?: string; limit?: number; days?: number } = {},
  deps: { fetch?: FetchConversationsForEvidence } = {},
): Promise<CollectResult> {
  const limit = Math.min(Math.max(options.limit ?? 50, 1), 200);
  const days = Math.min(Math.max(options.days ?? 7, 1), 90);
  const fetch = deps.fetch ?? defaultFetch;

  const conversations = await fetch({ restaurantId: options.restaurantId, limit, days });

  // Idempotency: skip conversations that already produced evidence.
  const ids = conversations.map((c) => c.id);
  const existing = await prisma.waiterResultEvidence.findMany({
    where: { agentSlug: AGENT, sourceType: "CONVERSATION", sourceId: { in: ids } },
    select: { sourceId: true, evidenceType: true },
  });
  const seen = new Set(existing.map((e) => `${e.sourceId}:${e.evidenceType}`));

  let created = 0;
  let skipped = 0;
  const byType: Record<string, number> = {};

  for (const conv of conversations) {
    if (!conv.restaurantId) { skipped += 1; continue; }
    const customerTexts = conv.messages.filter(isCustomer).map((m) => m.content);
    const praise = customerTexts.find((t) => PRAISE_RE.test(t));
    const conversion = customerTexts.find((t) => CONVERSION_RE.test(t));

    const candidates: Array<{ type: "QUALITATIVE_PROOF" | "SALE_CONVERSION"; text: string; title: string; summary: string }> = [];
    if (praise) {
      candidates.push({
        type: "QUALITATIVE_PROOF",
        text: praise,
        title: "Cliente elogiou o atendimento",
        summary: "Cliente demonstrou satisfação espontânea durante a conversa com o Waiter.",
      });
    }
    if (conversion) {
      candidates.push({
        type: "SALE_CONVERSION",
        text: conversion,
        title: "Cliente conduzido até a finalização",
        summary: "O cliente pediu para finalizar o pedido durante a condução do Waiter.",
      });
    }

    for (const cand of candidates) {
      const key = `${conv.id}:${cand.type}`;
      if (seen.has(key)) { skipped += 1; continue; }
      try {
        await createEvidence({
          restaurantId: conv.restaurantId,
          sourceType: "CONVERSATION",
          sourceId: conv.id,
          title: cand.title,
          summary: cand.summary,
          evidenceType: cand.type,
          excerpt: sanitizeText(cand.text),
          metadata: { detectedBy: "WaiterEvidenceCollector" },
        });
        created += 1;
        byType[cand.type] = (byType[cand.type] ?? 0) + 1;
        seen.add(key);
      } catch {
        skipped += 1; // race/bad row — never fail the batch
      }
    }
  }

  return { ok: true, scanned: conversations.length, created, skipped, byType, runtimeTouched: false };
}
