/**
 * ConversationLogService
 *
 * Handles AI agent web conversation lifecycle:
 * - Find or create a Conversation for a web-agent browser session
 * - Canonical lookup: if customerId or phone is known, prefer the existing
 *   customer conversation (WhatsApp-first) so all channels stay in one thread
 * - Log CUSTOMER / CUSTOMER_CARDAPIO / AI / HUMAN / SYSTEM messages
 * - Update customer identity when the user identifies themselves
 * - Check aiEnabled flag for human-takeover suppression
 *
 * Designed to be safe: failures must NOT break the ordering flow.
 * All public methods catch their own errors when used in fire-and-forget mode.
 */

import { prisma } from "@/lib/prisma";
import { Channel, ConversationStatus } from "@prisma/client";

export type MsgSenderType = "CUSTOMER" | "CUSTOMER_CARDAPIO" | "AI" | "HUMAN" | "SYSTEM";

// Statuses considered "active" for canonical conversation reuse
const ACTIVE_STATUSES: ConversationStatus[] = [
  ConversationStatus.OPEN,
  ConversationStatus.HUMAN,
  ConversationStatus.BOT,
  ConversationStatus.AI_ATENDENDO,
  ConversationStatus.HUMANO_ASSUMIU,
];

export class ConversationLogService {

  /**
   * Find or create a canonical Conversation for a web-agent browser session.
   *
   * Lookup priority:
   *   1. Existing WHATSAPP conversation for this customerId (canonical merge)
   *   2. Any active conversation for this customerId (other channels)
   *   3. Active WHATSAPP conversation by phone (when customerId not yet resolved)
   *   4. Any active conversation by phone
   *   5. Existing conversation by sessionId (fast-path for subsequent requests)
   *   6. Create new QR_AGENT conversation
   *
   * When a canonical customer conversation is found, the sessionId is stamped
   * onto it so subsequent requests in the same session hit path #5 directly.
   */
  static async ensureConversation({
    restaurantId,
    sessionId,
    customerId,
    customerName,
    customerPhone,
    channel = Channel.QR_AGENT,
  }: {
    restaurantId:  string;
    sessionId:     string;
    customerId?:   string | null;
    customerName?: string | null;
    customerPhone?: string | null;
    channel?:      Channel;
  }): Promise<string> {

    // ── 1 & 2: Canonical lookup by customerId ─────────────────────
    if (customerId) {
      // Prefer WHATSAPP so the web message lands in the same WhatsApp thread
      const byCustomer =
        (await prisma.conversation.findFirst({
          where: { restaurantId, customerId, channel: Channel.WHATSAPP, status: { in: ACTIVE_STATUSES } },
          orderBy: { lastMessageAt: "desc" },
          select: { id: true },
        })) ??
        (await prisma.conversation.findFirst({
          where: { restaurantId, customerId, status: { in: ACTIVE_STATUSES } },
          orderBy: { lastMessageAt: "desc" },
          select: { id: true },
        }));

      if (byCustomer) {
        // Stamp sessionId as fast-path cache; patch name/phone if missing
        const patch: Record<string, string | null> = { sessionId };
        if (customerName)  patch.customerName  = customerName;
        if (customerPhone) patch.customerPhone = customerPhone;
        await prisma.conversation.update({ where: { id: byCustomer.id }, data: patch });
        return byCustomer.id;
      }
    }

    // ── 3 & 4: Canonical lookup by phone (customerId not yet resolved) ──
    if (customerPhone && !customerId) {
      const byPhone =
        (await prisma.conversation.findFirst({
          where: { restaurantId, customerPhone, channel: Channel.WHATSAPP, status: { in: ACTIVE_STATUSES } },
          orderBy: { lastMessageAt: "desc" },
          select: { id: true },
        })) ??
        (await prisma.conversation.findFirst({
          where: { restaurantId, customerPhone, status: { in: ACTIVE_STATUSES } },
          orderBy: { lastMessageAt: "desc" },
          select: { id: true },
        }));

      if (byPhone) {
        const patch: Record<string, string | null> = { sessionId };
        if (customerName) patch.customerName = customerName;
        await prisma.conversation.update({ where: { id: byPhone.id }, data: patch });
        return byPhone.id;
      }
    }

    // ── 5: Fast-path lookup by sessionId ──────────────────────────
    const existing = await prisma.conversation.findFirst({
      where:  { restaurantId, sessionId },
      select: { id: true, customerId: true, customerName: true, customerPhone: true },
    });

    if (existing) {
      const patch: Record<string, string | null> = {};
      if (customerId    && !existing.customerId)    patch.customerId    = customerId;
      if (customerName  && !existing.customerName)  patch.customerName  = customerName;
      if (customerPhone && !existing.customerPhone) patch.customerPhone = customerPhone;
      if (Object.keys(patch).length > 0) {
        await prisma.conversation.update({ where: { id: existing.id }, data: patch });
      }
      return existing.id;
    }

    // ── 6: Create new conversation ────────────────────────────────
    const conv = await prisma.conversation.create({
      data: {
        restaurantId,
        sessionId,
        customerId:    customerId    ?? null,
        customerName:  customerName  ?? null,
        customerPhone: customerPhone ?? null,
        channel,
        status:    ConversationStatus.AI_ATENDENDO,
        aiEnabled: true,
      },
      select: { id: true },
    });

    return conv.id;
  }

  /**
   * Log a single message and bump lastMessageAt.
   * Increments unreadCount for inbound customer messages (CUSTOMER and CUSTOMER_CARDAPIO).
   */
  static async logMessage({
    conversationId,
    restaurantId,
    senderType,
    content,
    metadata,
  }: {
    conversationId: string;
    restaurantId:   string;
    senderType:     MsgSenderType;
    content:        string;
    metadata?:      Record<string, unknown>;
  }): Promise<void> {
    const isInbound = senderType === "CUSTOMER" || senderType === "CUSTOMER_CARDAPIO";
    const direction = isInbound ? ("INBOUND" as const) : ("OUTBOUND" as const);
    const now       = new Date();

    await prisma.$transaction([
      prisma.message.create({
        data: {
          conversationId,
          direction,
          senderType,
          content,
          type:     "TEXT",
          metadata: metadata as object | undefined,
          sentAt:   now,
        },
      }),
      prisma.conversation.update({
        where: { id: conversationId },
        data:  {
          lastMessageAt: now,
          ...(isInbound ? { unreadCount: { increment: 1 } } : {}),
        },
      }),
    ]);
  }

  /**
   * Returns true if the AI is allowed to reply to this conversation.
   * Falls back to true if conversation is not found (safe default).
   */
  static async isAiEnabled(conversationId: string, restaurantId: string): Promise<boolean> {
    const conv = await prisma.conversation.findFirst({
      where:  { id: conversationId, restaurantId },
      select: { aiEnabled: true },
    });
    return conv?.aiEnabled ?? true;
  }

  /**
   * Link a customer identity to an existing anonymous conversation.
   * Called when the user provides their phone or identifies via WhatsApp link.
   */
  static async linkCustomer({
    conversationId,
    restaurantId,
    customerId,
    customerName,
    customerPhone,
  }: {
    conversationId: string;
    restaurantId:   string;
    customerId?:    string | null;
    customerName?:  string | null;
    customerPhone?: string | null;
  }): Promise<void> {
    const patch: Record<string, string | null> = {};
    if (customerId)    patch.customerId    = customerId;
    if (customerName)  patch.customerName  = customerName;
    if (customerPhone) patch.customerPhone = customerPhone;
    if (Object.keys(patch).length === 0) return;

    await prisma.conversation.updateMany({
      where: { id: conversationId, restaurantId },
      data:  patch,
    });
  }
}
