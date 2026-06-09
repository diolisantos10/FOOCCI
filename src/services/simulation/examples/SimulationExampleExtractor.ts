/**
 * SimulationExampleExtractor — turns REAL conversations into sanitized, classified
 * examples (PENDING human approval). Read-only on conversations; never mutates a
 * conversation, never messages a customer, never stores raw PII.
 *
 * The conversation source is injectable so it can be unit-tested with synthetic
 * fixtures (no DB) — the production source reads Conversation/Message read-only.
 */

import { prisma } from "@/lib/prisma";
import { sanitizeText, detectRiskFlags } from "../simulationSanitizer";
import { classifyIntent } from "./intentClassifier";
import type { TranscriptTurn } from "../types";

const AGENT = "waiter";

export interface RawConversation {
  id: string;
  channel: string;
  restaurantId: string | null;
  messages: Array<{ senderType: string | null; direction: string; content: string }>;
}

export type FetchConversations = (opts: { restaurantId?: string; limit: number; days: number }) => Promise<RawConversation[]>;

export interface ExtractOptions {
  restaurantId?: string;
  limit?: number;
  days?: number;
}

export interface ExtractResult {
  ok: boolean;
  created: number;
  skipped: number;
  pendingReview: number;
}

/** Production source — reads Conversation + Message READ-ONLY. */
const defaultFetch: FetchConversations = async ({ restaurantId, limit, days }) => {
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
      channel: true,
      restaurantId: true,
      messages: { orderBy: { sentAt: "asc" }, take: 12, select: { senderType: true, direction: true, content: true } },
    },
  });
  return rows.map((r) => ({ id: r.id, channel: String(r.channel), restaurantId: r.restaurantId, messages: r.messages }));
};

function toRole(m: { senderType: string | null; direction: string }): "customer" | "agent" {
  if (m.senderType === "CUSTOMER") return "customer";
  if (m.senderType === "AI" || m.senderType === "HUMAN") return "agent";
  return m.direction === "INBOUND" ? "customer" : "agent";
}

/**
 * Extracts sanitized examples from real conversations. Each new example is created
 * as PENDING_REVIEW (never auto-approved). Deduplicates by source conversation id.
 */
export async function extractExamples(
  options: ExtractOptions = {},
  deps: { fetch?: FetchConversations } = {},
): Promise<ExtractResult> {
  const limit = Math.min(Math.max(options.limit ?? 50, 1), 200);
  const days = Math.min(Math.max(options.days ?? 30, 1), 365);
  const fetch = deps.fetch ?? defaultFetch;

  const conversations = await fetch({ restaurantId: options.restaurantId, limit, days });

  // Dedupe against already-extracted source ids.
  const sourceIds = conversations.map((c) => c.id);
  const existing = await prisma.agentSimulationExample.findMany({
    where: { agentSlug: AGENT, sourceType: "REAL_CONVERSATION", sourceId: { in: sourceIds } },
    select: { sourceId: true },
  });
  const seen = new Set(existing.map((e) => e.sourceId));

  let created = 0;
  let skipped = 0;

  for (const conv of conversations) {
    if (seen.has(conv.id)) { skipped += 1; continue; }

    const rawTranscript = conv.messages.map((m) => ({ role: toRole(m), content: m.content }));
    const firstCustomer = rawTranscript.find((t) => t.role === "customer");
    if (!firstCustomer || !firstCustomer.content.trim()) { skipped += 1; continue; }

    // Detect risk on the RAW text (to record what was masked), then sanitize.
    const rawJoined = conv.messages.map((m) => m.content).join("\n");
    const riskFlags = detectRiskFlags(rawJoined);
    const sanitized: TranscriptTurn[] = rawTranscript.map((t) => ({ role: t.role as "customer" | "agent", content: sanitizeText(t.content) }));
    const { intent, scenarioType } = classifyIntent(sanitizeText(firstCustomer.content));

    try {
      await prisma.agentSimulationExample.create({
        data: {
          agentSlug: AGENT,
          restaurantId: conv.restaurantId,
          sourceType: "REAL_CONVERSATION",
          sourceId: conv.id,
          channel: conv.channel || "UNKNOWN",
          intent,
          scenarioType,
          customerProfile: null,
          sanitizedTranscript: JSON.stringify(sanitized),
          summary: `${intent} · ${scenarioType} (${conv.channel})`,
          labels: JSON.stringify([scenarioType, intent]),
          riskFlags: JSON.stringify(riskFlags),
          status: "PENDING_REVIEW",
          isApprovedForSimulation: false,
        },
      });
      created += 1;
      seen.add(conv.id);
    } catch {
      // Unique-constraint race or bad row — skip without failing the batch.
      skipped += 1;
    }
  }

  return { ok: true, created, skipped, pendingReview: created };
}
