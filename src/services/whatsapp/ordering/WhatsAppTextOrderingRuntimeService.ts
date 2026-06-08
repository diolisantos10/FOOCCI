/**
 * WhatsAppTextOrderingRuntimeService — the ONLY service that may ever sit in a
 * live webhook path. Every guard must pass before the engine does anything that
 * could touch a real customer.
 *
 * Guards (all must pass):
 *   1. DB-aware: enabled, not paused, global kill switch not engaged
 *   2. DB-aware: scope + phone allowlist + mode permits reply
 *   3. Conversation is AI-eligible (not locked / human / non-customer)
 *
 * IMPORTANT: guards use the DB-aware config (WhatsAppTextOrderingConfigService),
 * which is the same source as the webhook routing decision. The previous env-only
 * guards caused a fatal mismatch: webhook approved routing (DB config), runtime
 * denied it (env vars not set) → engine returned handled=false silently, old
 * Receptionist already blocked → customer got no reply.
 *
 * Side-effect permissions:
 *   ALLOWLIST_REPLY_ONLY  — may send reply; no order, no Pix
 *   ALLOWLIST_FULL_TEST   — may send reply + create order + generate Pix
 *   DRY_RUN_ONLY          — no side effects (never reaches live path)
 */

import {
  isGlobalKillSwitchEngaged,
  isGlobalPauseEngaged,
  isPhoneInList,
} from "@/lib/wa-text-ordering-flag";
import {
  resolveWaConfig,
} from "@/services/whatsapp/ordering/WhatsAppTextOrderingConfigService";
import { processCustomerMessage } from "./WhatsAppTextOrderService";
import { WhatsAppOrderingSessionService } from "./WhatsAppOrderingSessionService";
import type { WaProcessResult, WaRuntimeMode } from "./types";

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
  replySent:      boolean;        // did a real WhatsApp reply go out this turn?
  handoffApplied: boolean;        // was an intentional human handoff applied + saved?
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
  // ── DB-aware config resolution ────────────────────────────────────────────
  // Must use the same config source as the webhook routing decision
  // (WhatsAppTextOrderingConfigService). Using env-only flags here caused a
  // fatal mismatch: webhook approved (DB config), runtime denied (env vars not
  // set) → engine returned handled=false silently, old Receptionist already
  // blocked, customer received no reply.
  const config   = await resolveWaConfig(input.restaurantId);
  const mode     = config.mode as WaRuntimeMode;
  const safetyNotes: string[] = [];

  // Guard 1 — DB-aware: feature enabled + not paused (global and restaurant-level)
  if (isGlobalKillSwitchEngaged()) return block("global kill switch active (WHATSAPP_TEXT_ORDERING_ENABLED=false)", mode);
  if (isGlobalPauseEngaged())      return block("global pause active (WHATSAPP_TEXT_ORDERING_PAUSED=true)", mode);
  if (!config.enabled)             return block("feature disabled for restaurant in admin panel", mode);
  if (config.paused)               return block("text ordering paused for restaurant in admin panel", mode);

  // Guard 2 — DB-aware: scope + phone allowlist + mode permits reply
  const phoneOk = config.scope === "RESTAURANT_WIDE"
    || isPhoneInList(input.phone, config.allowlistedPhones);
  if (!phoneOk) return block("phone not in restaurant allowlist", mode);

  const canReply       = mode === "ALLOWLIST_REPLY_ONLY" || mode === "ALLOWLIST_FULL_TEST";
  const canCreateOrder = mode === "ALLOWLIST_FULL_TEST";

  if (canReply)       safetyNotes.push(`mode=${mode} → reply allowed`);
  else                safetyNotes.push(`mode=${mode} → no reply (dry-run only)`);
  if (canCreateOrder) safetyNotes.push("mode=ALLOWLIST_FULL_TEST → order + Pix allowed");

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
    allowSideEffects: canCreateOrder,
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

  // Handle handoff: mark conversation for human BEFORE sending the handoff message
  // so the final AI message is still delivered but the AI won't handle the next turn.
  let handoffApplied = false;
  if (result.handoff && input.conversationId) {
    try {
      const { markConversationNeedsHuman } = await import("@/lib/handoff");
      await markConversationNeedsHuman(input.conversationId, "CUSTOMER_REQUEST");
      handoffApplied = true;
      safetyNotes.push("handoff: conversation marked for human (CUSTOMER_REQUEST)");
    } catch (err) {
      console.error("[TextOrderingRuntime] markConversationNeedsHuman failed:", err);
    }
  }

  // Live reply sending: only when mode + allowlist permit it and there is a reply.
  let replySent = false;
  if (canReply && result.suggestedReply && input.conversationId) {
    try {
      const { EvolutionConfigService } = await import("@/services/evolution/EvolutionConfigService");
      const { EvolutionClient } = await import("@/lib/evolution/EvolutionClient");
      const { prisma } = await import("@/lib/prisma");

      const cfgResult = await EvolutionConfigService.getSnapshot(input.restaurantId);
      if (cfgResult.ok) {
        const sendResult = await EvolutionClient.sendTextMessage(
          cfgResult.data,
          input.phone,
          result.suggestedReply,
        );
        const now = new Date();
        await prisma.$transaction([
          prisma.message.create({
            data: {
              conversationId: input.conversationId,
              direction:      "OUTBOUND",
              senderType:     "AI",
              content:        result.suggestedReply,
              type:           "TEXT",
              sentAt:         now,
              externalMessageId: sendResult.key.id,
              externalStatus: "sent",
              metadata: {
                source:           "PEDIDO_TEXTO",
                waOrderingStage:  result.session.stage,
                waOrderingMode:   mode,
              },
            },
          }),
          prisma.conversation.update({
            where: { id: input.conversationId },
            data:  { lastMessageAt: now },
          }),
        ]);
        replySent = true;
        safetyNotes.push(`reply sent via Evolution (mode=${mode})`);
      } else {
        safetyNotes.push("reply skipped: Evolution config not found for restaurant");
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error("[TextOrderingRuntime] Failed to send reply:", msg);
      safetyNotes.push(`reply failed: ${msg.slice(0, 80)}`);
    }
  } else if (!canReply) {
    safetyNotes.push(`reply not sent: mode=${mode} does not permit replies`);
  }

  return {
    handled:        true,
    blockedReason:  null,
    mode,
    result,
    replyWouldSend: canReply,
    replySent,
    handoffApplied,
    safetyNotes,
  };

  function block(reason: string, m: string): RuntimeDecision {
    return {
      handled: false, blockedReason: reason, mode: m, result: null,
      replyWouldSend: false, replySent: false, handoffApplied: false,
      safetyNotes: [`blocked: ${reason}`],
    };
  }
}
