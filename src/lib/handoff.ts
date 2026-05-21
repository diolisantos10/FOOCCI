import { prisma } from "@/lib/prisma";
import { ConversationStatus } from "@prisma/client";

export type HandoffReason =
  | "MENU_OPTION"
  | "AI_ESCALATION"
  | "WAITER_ESCALATION"
  | "CUSTOMER_REQUEST"
  | "COMPLAINT"
  | "UNKNOWN";

/**
 * Atomically marks a conversation as needing human attention.
 * Idempotent — no-ops if already in human mode.
 * Writes a SYSTEM message so the inactivity-timeout check can track when the handoff happened.
 * Returns true when the transition actually happened (false = already human, no-op).
 */
export async function markConversationNeedsHuman(
  conversationId: string,
  reason: HandoffReason,
): Promise<boolean> {
  const conv = await prisma.conversation.findUnique({
    where:  { id: conversationId },
    select: { id: true, status: true, aiEnabled: true },
  });
  if (!conv) return false;
  if (
    !conv.aiEnabled ||
    conv.status === ConversationStatus.HUMAN ||
    conv.status === ConversationStatus.HUMANO_ASSUMIU
  ) return false;

  const now = new Date();
  await prisma.$transaction([
    prisma.conversation.update({
      where: { id: conversationId },
      data:  { status: ConversationStatus.HUMAN, aiEnabled: false },
    }),
    prisma.message.create({
      data: {
        conversationId,
        direction:  "OUTBOUND",
        senderType: "SYSTEM",
        content:    `[handoff:${reason}]`,
        type:       "TEXT",
        sentAt:     now,
        metadata:   { isHandoffEvent: true, handoffReason: reason, handoffAt: now.toISOString() },
      },
    }),
  ]);

  return true;
}
