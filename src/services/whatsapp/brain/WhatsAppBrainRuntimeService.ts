/**
 * WhatsAppBrainRuntimeService — the Brain as the WhatsApp front door.
 *
 * Flag-gated cutover (WHATSAPP_BRAIN_ENABLED, default OFF). When ON, this REPLACES
 * the old rule-based Receptionist as the intelligent default host: every TEXT
 * message that is not active order-building is answered by the Brain
 * (reasonAsAgent with the WhatsApp scope) — understanding the real intent, using
 * the restaurant knowledge as truth, and NEVER matching words against a menu.
 *
 * What it does NOT touch: order intent and active ordering sessions are routed to
 * the ordering engine BEFORE this runs (the routing contract). This is the smart
 * receptionist, not the order builder.
 *
 * Mirrors WhatsAppReceptionistService.respond(conversationId) so the webhook swap
 * is a one-line, flag-gated change. The Brain itself is read-only
 * (runtimeTouched:false); the only side effects here are sending the reply and,
 * when the Brain asks, a human handoff.
 */

import { ConversationStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { EvolutionClient } from "@/lib/evolution/EvolutionClient";
import { EvolutionConfigService } from "@/services/evolution/EvolutionConfigService";
import { markConversationNeedsHuman } from "@/lib/handoff";
import { reasonAsAgent } from "@/services/brain/reasoning/BrainReasoner";

/** The live cutover is OFF until an operator turns it on (env: WHATSAPP_BRAIN_ENABLED=true). */
export function isWhatsAppBrainEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.WHATSAPP_BRAIN_ENABLED === "true";
}

export interface BrainReplyOutcome {
  status: "REPLIED" | "HANDOFF" | "SKIPPED";
  reason?: string;
}

export const WhatsAppBrainRuntimeService = {
  /** Mirror of the Receptionist entry point — never throws into the webhook. */
  async respond(conversationId: string): Promise<BrainReplyOutcome> {
    try {
      return await run(conversationId);
    } catch (err) {
      console.error("[WhatsAppBrain] respond failed:", err);
      return { status: "SKIPPED", reason: "error" };
    }
  },
};

async function run(conversationId: string): Promise<BrainReplyOutcome> {
  const conversation = await prisma.conversation.findUnique({
    where: { id: conversationId },
    select: {
      id: true,
      restaurantId: true,
      status: true,
      aiEnabled: true,
      customer: { select: { id: true, phone: true, name: true } },
    },
  });

  if (
    !conversation ||
    !conversation.aiEnabled ||
    conversation.status === ConversationStatus.HUMAN ||
    conversation.status === ConversationStatus.HUMANO_ASSUMIU ||
    conversation.status === ConversationStatus.RESOLVED
  ) {
    return { status: "SKIPPED", reason: "conversation not AI-eligible" };
  }
  if (!conversation.customer?.phone) {
    return { status: "SKIPPED", reason: "no customer phone" };
  }

  const lastMessage = await prisma.message.findFirst({
    where: { conversationId, direction: "INBOUND" },
    orderBy: { sentAt: "desc" },
    select: { content: true, type: true, sentAt: true },
  });
  if (!lastMessage || lastMessage.type !== "TEXT" || !lastMessage.content.trim()) {
    return { status: "SKIPPED", reason: "no usable inbound text" };
  }

  // Idempotency: skip if the AI already replied after this inbound message.
  const alreadyReplied = await prisma.message.findFirst({
    where: { conversationId, direction: "OUTBOUND", senderType: "AI", sentAt: { gte: lastMessage.sentAt } },
    select: { id: true },
  });
  if (alreadyReplied) return { status: "SKIPPED", reason: "already replied" };

  const { restaurantId } = conversation;

  // Reason via the Brain (WhatsApp scope). Truth (menu/prices/payments/hours) is
  // loaded inside the Brain from the knowledge snapshot — we only pass the message.
  const outcome = await reasonAsAgent({
    businessId: restaurantId,
    businessType: "RESTAURANT",
    agentId: "whatsapp",
    agentRole: "WhatsApp",
    sourceType: "REAL_CONVERSATION",
    sanitizedInput: lastMessage.content.trim(),
  });

  const reply = outcome.result.idealResponse?.trim();
  if (!reply) return { status: "SKIPPED", reason: "brain produced no reply" };

  const cfg = await EvolutionConfigService.getSnapshot(restaurantId);
  if (!cfg.ok) return { status: "SKIPPED", reason: "evolution config missing" };

  await sendReply(cfg.data, conversation.customer.phone, reply, conversationId, {
    source: "WHATSAPP_BRAIN",
    brainIntent: outcome.result.primaryIntent,
    brainMode: outcome.reasoningMode,
    brainEngine: `${outcome.engine.provider}:${outcome.engine.model}`,
  });

  // Escalate AFTER the reply is sent, so the customer still gets the Brain's
  // message and the next turn goes to a human.
  if (outcome.result.shouldEscalate) {
    await markConversationNeedsHuman(conversationId, "AI_ESCALATION").catch((err) =>
      console.error("[WhatsAppBrain] handoff failed:", err),
    );
    return { status: "HANDOFF", reason: outcome.result.escalationReason };
  }

  return { status: "REPLIED", reason: outcome.result.primaryIntent };
}

async function sendReply(
  config: { instanceName: string; baseUrl: string; apiKey: string },
  toPhone: string,
  text: string,
  conversationId: string,
  metadata?: Record<string, unknown>,
): Promise<void> {
  const result = await EvolutionClient.sendTextMessage(config, toPhone, text);
  const now = new Date();
  await prisma.$transaction([
    prisma.message.create({
      data: {
        conversationId,
        direction: "OUTBOUND",
        senderType: "AI",
        content: text,
        type: "TEXT",
        sentAt: now,
        externalMessageId: result.key.id,
        externalStatus: "sent",
        ...(metadata ? { metadata: metadata as object } : {}),
      },
    }),
    prisma.conversation.update({ where: { id: conversationId }, data: { lastMessageAt: now } }),
  ]);
}
