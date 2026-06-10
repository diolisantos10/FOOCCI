/**
 * WhatsAppAiReturnDiagnostic — read-only diagnosis of HUMAN-mode conversations and
 * how many would be ELIGIBLE for the AI again under WhatsAppAiReturnPolicy.
 *
 * Reads Conversation/Message READ-ONLY, computes eligibility with the pure policy,
 * and returns counts. It changes NOTHING — no aiEnabled flip, no message, no
 * runtime. (Acting on eligibility is a separate, governed step, not this round.)
 */

import { prisma } from "@/lib/prisma";
import { evaluateAiReturn, type AiReturnReason } from "./WhatsAppAiReturnPolicy";

const HANDOFF_RE = /^\[handoff:([A-Z_]+)\]/i;

export interface AiReturnDiagnosticResult {
  ok: boolean;
  scanned: number;
  humanConversations: number;
  eligibleForReturn: number;
  blockedByLock: number;
  blockedByRecentHuman: number;
  blockedByCriticalHandoff: number;
  byReason: Record<AiReturnReason, number>;
  runtimeTouched: false;
}

export interface DiagnosticConversation {
  id: string;
  status: string;
  aiLocked: boolean;
  conversationType: string;
  messages: Array<{ senderType: string | null; content: string; sentAt: Date }>;
}

export type FetchHumanConversations = (opts: { restaurantId?: string; limit: number }) => Promise<DiagnosticConversation[]>;

const defaultFetch: FetchHumanConversations = async ({ restaurantId, limit }) => {
  const rows = await prisma.conversation.findMany({
    where: {
      ...(restaurantId ? { restaurantId } : {}),
      status: { in: ["HUMAN", "HUMANO_ASSUMIU"] as never[] },
    },
    orderBy: { lastMessageAt: "desc" },
    take: limit,
    select: {
      id: true, status: true, aiLocked: true, conversationType: true,
      messages: { orderBy: { sentAt: "desc" }, take: 20, select: { senderType: true, content: true, sentAt: true } },
    },
  });
  return rows.map((r) => ({ ...r, conversationType: String(r.conversationType), messages: r.messages }));
};

export async function diagnoseAiReturn(
  options: { restaurantId?: string; limit?: number; now?: Date } = {},
  deps: { fetch?: FetchHumanConversations } = {},
): Promise<AiReturnDiagnosticResult> {
  const limit = Math.min(Math.max(options.limit ?? 200, 1), 1000);
  const fetch = deps.fetch ?? defaultFetch;
  const now = options.now ?? new Date();

  const conversations = await fetch({ restaurantId: options.restaurantId, limit });

  const byReason: Record<AiReturnReason, number> = {
    NEW_DAY: 0, INACTIVITY_12H: 0, CUSTOMER_REOPENED: 0, LOCKED: 0,
    RECENT_HUMAN_ACTIVITY: 0, CRITICAL_HANDOFF: 0, NOT_HUMAN: 0,
  };
  let eligibleForReturn = 0;

  for (const conv of conversations) {
    const lastHuman = conv.messages.find((m) => m.senderType === "HUMAN");
    const lastCustomer = conv.messages.find((m) => m.senderType === "CUSTOMER");
    const handoffMsg = conv.messages.find((m) => HANDOFF_RE.test(m.content));
    const lastHandoffReason = handoffMsg ? (handoffMsg.content.match(HANDOFF_RE)?.[1] ?? null) : null;
    // Reference: last human message, else the handoff event time.
    const lastHumanActivityAt = lastHuman?.sentAt ?? handoffMsg?.sentAt ?? null;

    const decision = evaluateAiReturn({
      status: conv.status,
      aiLocked: conv.aiLocked,
      conversationType: conv.conversationType,
      lastHumanActivityAt,
      lastCustomerMessageAt: lastCustomer?.sentAt ?? null,
      lastHandoffReason,
      now,
    });
    byReason[decision.reason] += 1;
    if (decision.shouldReturnToAi) eligibleForReturn += 1;
  }

  return {
    ok: true,
    scanned: conversations.length,
    humanConversations: conversations.length,
    eligibleForReturn,
    blockedByLock: byReason.LOCKED,
    blockedByRecentHuman: byReason.RECENT_HUMAN_ACTIVITY,
    blockedByCriticalHandoff: byReason.CRITICAL_HANDOFF,
    byReason,
    runtimeTouched: false,
  };
}
