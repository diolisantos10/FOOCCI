/**
 * ConversationAiPolicyService — single source of truth for "should the AI reply
 * in this conversation?" and for applying / lifting the persistent Staff/Supplier
 * AI lock (P0-A).
 *
 * Why this exists:
 *  - `Conversation.aiEnabled = false` is a *temporary* human takeover.
 *  - Some conversations are NOT customers ordering food (staff, suppliers,
 *    partners, internal/admin). For those, the AI must NEVER reply automatically
 *    and must NOT be re-enabled by any auto-return rule. Only an explicit manual
 *    unlock restores the AI.
 *
 * This is enforced by `Conversation.aiLocked` + `Conversation.conversationType`.
 * Every AI response path must consult `shouldAiRespond()` so the rule can't be
 * bypassed by one code path forgetting to check.
 *
 * The decision function is PURE (no I/O) so it is trivially unit-testable.
 */

import { prisma } from "@/lib/prisma";
import { ConversationStatus, ConversationType } from "@prisma/client";

// ─── Decision types ───────────────────────────────────────────────────────────

export type AiPolicyReason =
  | "AI_ACTIVE"        // AI may respond
  | "HUMAN_TAKEOVER"   // temporary human handling (aiEnabled=false, not locked)
  | "STAFF_LOCK"       // permanent lock — conversation is staff/equipe
  | "SUPPLIER_LOCK"    // permanent lock — supplier/fornecedor
  | "INTERNAL_LOCK"    // permanent lock — internal/admin
  | "MANUAL_LOCK"      // permanent lock — other non-customer (partner/other)
  | "CRM_CONTEXT"      // CRM campaign/automation origin — human handles reply
  | "RESOLVED"         // conversation closed
  | "UNKNOWN";         // status not in an AI-eligible state

export interface AiPolicyDecision {
  allowed: boolean;
  reason:  AiPolicyReason;
  /** True only for the permanent Staff/Supplier lock (not normal takeover). */
  locked:  boolean;
}

/** Minimal shape needed to decide — accepts any object with these fields. */
export interface AiPolicyConversation {
  aiEnabled:        boolean;
  aiLocked:         boolean;
  conversationType: ConversationType;
  status:           ConversationStatus;
  contextType:      string | null;
}

// ─── Pure decision ────────────────────────────────────────────────────────────

function lockReasonFor(type: ConversationType): AiPolicyReason {
  switch (type) {
    case ConversationType.STAFF:    return "STAFF_LOCK";
    case ConversationType.SUPPLIER: return "SUPPLIER_LOCK";
    case ConversationType.INTERNAL: return "INTERNAL_LOCK";
    default:                        return "MANUAL_LOCK"; // PARTNER / OTHER_NON_CUSTOMER / CUSTOMER-but-locked
  }
}

/**
 * Decide whether the AI is allowed to respond automatically in a conversation.
 *
 * Precedence (highest first):
 *  1. Permanent lock (aiLocked OR non-customer classification) → never reply.
 *  2. Resolved → never auto-reply.
 *  3. CRM campaign/automation context → human handles the reply.
 *  4. Temporary human takeover (aiEnabled=false) → don't reply.
 *  5. Status not AI-eligible → don't reply.
 *  6. Otherwise → allowed.
 */
export function shouldAiRespond(conv: AiPolicyConversation): AiPolicyDecision {
  // 1. Permanent lock — strongest. A non-customer classification implies a lock
  //    even if a stale aiEnabled=true slipped through, and aiLocked alone also
  //    counts (e.g. OTHER_NON_CUSTOMER kept as CUSTOMER type but locked).
  const isNonCustomer = conv.conversationType !== ConversationType.CUSTOMER;
  if (conv.aiLocked || isNonCustomer) {
    return { allowed: false, reason: lockReasonFor(conv.conversationType), locked: true };
  }

  // 2. Resolved conversations never auto-reply.
  if (conv.status === ConversationStatus.RESOLVED) {
    return { allowed: false, reason: "RESOLVED", locked: false };
  }

  // 3. CRM-origin conversations go to a human first.
  if (conv.contextType === "CRM_CAMPAIGN" || conv.contextType === "CRM_AUTOMATION") {
    return { allowed: false, reason: "CRM_CONTEXT", locked: false };
  }

  // 4. Temporary human takeover.
  if (!conv.aiEnabled) {
    return { allowed: false, reason: "HUMAN_TAKEOVER", locked: false };
  }

  // 5. Status must be an AI-eligible state.
  const aiEligible =
    conv.status === ConversationStatus.OPEN ||
    conv.status === ConversationStatus.BOT ||
    conv.status === ConversationStatus.AI_ATENDENDO;
  if (!aiEligible) {
    return { allowed: false, reason: "UNKNOWN", locked: false };
  }

  return { allowed: true, reason: "AI_ACTIVE", locked: false };
}

// ─── DB mutations ─────────────────────────────────────────────────────────────

export interface LockResult {
  ok:    boolean;
  error?: string;
}

/**
 * Permanently lock the AI for a conversation and classify it as a non-customer
 * context (staff/supplier/etc.). Also flips `aiEnabled=false` so existing gates
 * that only check `aiEnabled` are covered too. Tenant-scoped.
 */
export async function lockAiForConversation(
  restaurantId:   string,
  conversationId: string,
  type:           ConversationType,
  reason:         string | null,
  userId:         string | null,
): Promise<LockResult> {
  const conv = await prisma.conversation.findFirst({
    where:  { id: conversationId, restaurantId },
    select: { id: true },
  });
  if (!conv) return { ok: false, error: "Conversa não encontrada" };

  await prisma.conversation.update({
    where: { id: conversationId },
    data: {
      conversationType: type,
      aiLocked:         true,
      aiLockedReason:   reason,
      aiLockedAt:       new Date(),
      aiLockedByUserId: userId,
      // Persistently keep the AI off and the conversation in human mode.
      aiEnabled:        false,
      status:           ConversationStatus.HUMANO_ASSUMIU,
      assignedTo:       userId,
    },
  });

  return { ok: true };
}

/**
 * Lift the permanent lock and restore normal customer/AI behavior.
 * Resets classification to CUSTOMER and re-enables the AI. Tenant-scoped.
 */
export async function unlockAiForConversation(
  restaurantId:   string,
  conversationId: string,
  userId:         string | null,
): Promise<LockResult> {
  const conv = await prisma.conversation.findFirst({
    where:  { id: conversationId, restaurantId },
    select: { id: true },
  });
  if (!conv) return { ok: false, error: "Conversa não encontrada" };

  await prisma.conversation.update({
    where: { id: conversationId },
    data: {
      conversationType: ConversationType.CUSTOMER,
      aiLocked:         false,
      aiLockedReason:   null,
      aiLockedAt:       null,
      aiLockedByUserId: null,
      // Restore AI control.
      aiEnabled:        true,
      status:           ConversationStatus.AI_ATENDENDO,
      assignedTo:       null,
      contextType:      null,
    },
  });

  return { ok: true, ...(userId ? {} : {}) };
}

export const ConversationAiPolicyService = {
  shouldAiRespond,
  lockAiForConversation,
  unlockAiForConversation,
};
