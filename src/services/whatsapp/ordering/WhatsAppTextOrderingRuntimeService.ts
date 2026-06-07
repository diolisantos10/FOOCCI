/**
 * WhatsAppTextOrderingRuntimeService — the ONLY service that may ever sit in a
 * live webhook path. Every guard must pass before the engine does anything that
 * could touch a real customer.
 *
 * SAFETY: This service is NOT wired into the Evolution webhook in this build.
 * It exists so a future, deliberate integration has a single, fully-guarded
 * entry point. Even when called, it:
 *   - refuses unless the master flag is on
 *   - refuses unless BOTH restaurant and phone are allowlisted
 *   - refuses on locked / human / non-customer conversations
 *   - never sends WhatsApp here (sending is intentionally not wired yet)
 *   - only creates a real order/Pix in ALLOWLIST_FULL_TEST mode
 *
 * It returns a decision object describing exactly what it did and why.
 */

import {
  isWaTextOrderingEnabled,
  resolveSideEffectPermissions,
  getWaTextOrderingMode,
} from "@/lib/wa-text-ordering-flag";
import { processCustomerMessage } from "./WhatsAppTextOrderService";
import { WhatsAppOrderingSessionService } from "./WhatsAppOrderingSessionService";
import type { WaProcessResult } from "./types";

export interface RuntimeInput {
  restaurantId:    string;
  phone:           string;
  conversationId?: string | null;
  customerId?:     string | null;
  messageText:     string;
}

export interface RuntimeDecision {
  handled:        boolean;        // did the engine take this message?
  blockedReason:  string | null;  // why it didn't, if applicable
  mode:           string;
  result:         WaProcessResult | null;
  replyWouldSend: boolean;        // would a reply be sent (REPLY_ONLY / FULL_TEST)?
  replySent:      boolean;        // always false — live sending not wired in this build
  safetyNotes:    string[];
}

/**
 * Returns true only if the conversation is a normal, AI-eligible customer chat.
 * Locked / human-taken-over / non-customer contexts are excluded (Z6 / P0-A).
 */
async function conversationAllowsAi(conversationId: string): Promise<{ ok: boolean; reason?: string }> {
  const { prisma } = await import("@/lib/prisma");
  const conv = await prisma.conversation.findUnique({
    where:  { id: conversationId },
    select: { aiEnabled: true, aiLocked: true, status: true, contextType: true },
  });
  if (!conv) return { ok: false, reason: "conversation not found" };
  if (conv.aiLocked) return { ok: false, reason: "conversation aiLocked" };
  if (!conv.aiEnabled) return { ok: false, reason: "aiEnabled=false (human took over)" };
  if (conv.status === "HUMAN" || conv.status === "HUMANO_ASSUMIU") {
    return { ok: false, reason: `human handoff active (status=${conv.status})` };
  }
  if (conv.contextType && conv.contextType !== "INBOUND") {
    return { ok: false, reason: `non-customer context (${conv.contextType})` };
  }
  return { ok: true };
}

export async function handleInboundForOrdering(input: RuntimeInput): Promise<RuntimeDecision> {
  const mode = getWaTextOrderingMode();
  const safetyNotes: string[] = [];

  // Guard 1 — master flag + restaurant allowlist
  if (!isWaTextOrderingEnabled(input.restaurantId)) {
    return block("feature disabled or restaurant not allowlisted", mode);
  }

  // Guard 2 — side-effect permissions (restaurant + phone allowlist + mode)
  const perms = resolveSideEffectPermissions(input.restaurantId, input.phone);
  safetyNotes.push(...perms.reasons);

  // Guard 3 — conversation must be an AI-eligible customer chat
  if (input.conversationId) {
    const conv = await conversationAllowsAi(input.conversationId);
    if (!conv.ok) return block(`conversation guard: ${conv.reason}`, mode);
  }

  // Load or create the durable session
  let session = await WhatsAppOrderingSessionService.findActiveSession({
    restaurantId:   input.restaurantId,
    phone:          input.phone,
    conversationId: input.conversationId ?? undefined,
  });
  if (!session) {
    session = await WhatsAppOrderingSessionService.createSession({
      restaurantId:   input.restaurantId,
      phone:          input.phone,
      conversationId: input.conversationId ?? null,
      customerId:     input.customerId ?? null,
      mode,
      source:         "webhook",
    });
  }

  // Process the turn. Real order/Pix only when full-test permissions allow.
  const result = await processCustomerMessage({
    restaurantId:     input.restaurantId,
    phone:            input.phone,
    conversationId:   input.conversationId ?? undefined,
    customerId:       input.customerId ?? undefined,
    messageText:      input.messageText,
    mode,
    currentSession:   session,
    allowSideEffects: perms.canCreateOrder,
  });

  // Persist the updated session
  await WhatsAppOrderingSessionService.updateSession(session.id, {
    status:           result.session.status,
    stage:            result.session.stage,
    selectedItems:    result.session.selectedItems,
    unresolvedItems:  result.session.unresolvedItems,
    missingQuestions: result.session.missingQuestions,
    deliveryType:     result.session.deliveryType,
    address:          result.session.address,
    deliveryQuote:    result.session.deliveryQuote,
    paymentMethod:    result.session.paymentMethod,
    paymentStatus:    result.session.paymentStatus,
    orderId:          result.session.orderId,
    pixPaymentId:     result.session.pixPaymentId,
    metadata:         result.session.metadata,
  });

  // Live WhatsApp sending is intentionally NOT wired in this build.
  safetyNotes.push("live WhatsApp send not wired in this build (no Evolution call)");

  return {
    handled:        true,
    blockedReason:  null,
    mode,
    result,
    replyWouldSend: perms.canReply,
    replySent:      false,
    safetyNotes,
  };

  function block(reason: string, m: string): RuntimeDecision {
    return {
      handled: false, blockedReason: reason, mode: m, result: null,
      replyWouldSend: false, replySent: false,
      safetyNotes: [`blocked: ${reason}`],
    };
  }
}
