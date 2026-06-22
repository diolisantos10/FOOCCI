/**
 * Real-conversation scanner — the single, canonical reader of real customer
 * conversations for training (Phase 2 of the consolidation).
 *
 * Today several miners each read the Conversation table and mask PII on their own
 * (with slightly different rules). This module is the ONE place that:
 *   1. reads real conversations (flexible filters),
 *   2. masks PII once, with a unified masker stronger than any previous one,
 *   3. returns a normalized, role-tagged, PII-safe shape the producers consume.
 *
 * Read-only. Never mutates conversations. The masked text is what downstream
 * training/learning persists, so masking lives here and only here.
 */

import { prisma } from "@/lib/prisma";

// ── Unified PII masking (superset of the previous maskers) ──────────────────────

/**
 * Masks Brazilian PII before any text is stored, summarized, or shown to a human.
 * Covers e-mail, phones (all formats), CPF, street names + numbers, CEP, and any
 * long digit run (ids/tokens).
 *
 * Order matters. Phone runs BEFORE CPF on purpose: a bare 11-digit mobile
 * (DDD + 9-digit number) has the same length as a CPF, so CPF-first would
 * mislabel every unformatted cell number as "[CPF]". A *formatted* CPF
 * (123.456.789-09) won't match the phone pattern (the dots break it), and a bare
 * CPF whose 3rd digit isn't 9 still falls through to the CPF rule — so the common
 * cases stay correctly labeled. Either way the digits are always removed.
 */
export function maskPII(text: string): string {
  return (text ?? "")
    .replace(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g, "[EMAIL]")
    .replace(/(?:\+?55\s*)?(?:\(?\d{2}\)?\s*)?9?\d{4}[-\s]?\d{4}\b/g, "[TELEFONE]")
    .replace(/\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/g, "[CPF]")
    .replace(
      /\b(?:rua|av(?:enida)?|r\.|estrada|alameda|travessa|pra[çc]a|rod(?:ovia)?)\s+[^\n,]{2,40}(?:,?\s*(?:n[º°.]?\s*)?\d+)?/gi,
      "[ENDEREÇO]",
    )
    .replace(/\b(?:n[º°]|número|n\.)\s*\d+/gi, "[NÚMERO]")
    .replace(/\b\d{5}-?\d{3}\b/g, "[CEP]")
    .replace(/\b\d{8,}\b/g, "[ID]");
}

// ── Normalized shape ────────────────────────────────────────────────────────────

export type ScannedRole = "customer" | "bot" | "system";

export interface ScannedMessage {
  role: ScannedRole;
  content: string; // PII-masked — safe to store, summarize, or show a human
  /**
   * UNMASKED original text. Present ONLY when scanRealConversations is called
   * with { includeRaw: true }. Some deterministic detectors (intent, address,
   * order classifiers) must read the original text to work, then mask their own
   * excerpts. NEVER persist or display `raw` — use `content` for anything stored.
   */
  raw?: string;
  senderType: string | null;
  direction: string | null;
  type: string | null;
  sentAt: string; // ISO
}

export interface ScannedConversation {
  id: string;
  restaurantId: string | null;
  channel: string | null;
  status: string;
  orderId: string | null;
  messages: ScannedMessage[];
}

export interface ScanOptions {
  restaurantId?: string;
  channel?: string; // e.g. "WHATSAPP"
  conversationType?: string; // e.g. "CUSTOMER"
  sinceHours?: number; // default 24
  maxConversations?: number; // default 200
  minMessages?: number; // default 2
  /** Also expose each message's UNMASKED text as `raw` (for in-memory detectors). */
  includeRaw?: boolean;
}

function roleOf(senderType: string | null | undefined): ScannedRole {
  const s = (senderType ?? "").toUpperCase();
  if (s === "AI" || s === "HUMAN") return "bot";
  if (s === "SYSTEM") return "system";
  return "customer";
}

/** Reads + masks + normalizes real conversations once. Read-only. */
export async function scanRealConversations(opts: ScanOptions = {}): Promise<ScannedConversation[]> {
  const since = new Date(Date.now() - (opts.sinceHours ?? 24) * 3_600_000);

  const where: Record<string, unknown> = { lastMessageAt: { gte: since } };
  if (opts.restaurantId) where.restaurantId = opts.restaurantId;
  if (opts.channel) where.channel = opts.channel;
  if (opts.conversationType) where.conversationType = opts.conversationType;

  const rows = await prisma.conversation.findMany({
    where,
    orderBy: { lastMessageAt: "desc" },
    take: opts.maxConversations ?? 200,
    select: {
      id: true,
      restaurantId: true,
      channel: true,
      status: true,
      orderId: true,
      messages: {
        orderBy: { sentAt: "asc" },
        select: { content: true, senderType: true, direction: true, type: true, sentAt: true },
      },
    },
  });

  const minMessages = opts.minMessages ?? 2;
  const includeRaw = opts.includeRaw === true;
  const out: ScannedConversation[] = [];
  for (const c of rows) {
    if (c.messages.length < minMessages) continue;
    out.push({
      id: c.id,
      restaurantId: c.restaurantId ?? null,
      channel: c.channel ?? null,
      status: c.status,
      orderId: c.orderId ?? null,
      messages: c.messages.map((m) => {
        const rawContent = m.content ?? "";
        return {
          role: roleOf(m.senderType),
          content: maskPII(rawContent),
          ...(includeRaw ? { raw: rawContent } : {}),
          senderType: m.senderType ?? null,
          direction: m.direction ?? null,
          type: m.type ?? null,
          sentAt: (m.sentAt ?? new Date()).toISOString(),
        };
      }),
    });
  }
  return out;
}
