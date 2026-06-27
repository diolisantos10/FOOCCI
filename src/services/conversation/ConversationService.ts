/**
 * ConversationService
 *
 * All conversation lifecycle operations: listing, status transitions,
 * agent assignment, and read state.
 *
 * Status transition rules:
 *   OPEN   → HUMAN    (assign to agent)
 *   OPEN   → RESOLVED (resolve without agent)
 *   HUMAN  → RESOLVED (agent closes)
 *   HUMAN  → OPEN     (unassign)
 *   RESOLVED → OPEN   (manual reopen)
 *   BOT slot reserved for Phase 4 AI integration.
 *
 * Future (Phase 4): Methods here will accept an optional brandConfig
 * parameter carrying per-restaurant AI persona settings, which will be
 * forwarded to the AI layer for brand-aligned automated responses.
 */

import { prisma } from "@/lib/prisma";
import { serviceOk, serviceFail, ServiceResult, PaginatedResult } from "@/types";
import { ConversationStatus } from "@prisma/client";
import type { ConversationListQuery, PatchConversationInput } from "@/validators/conversation";

// ─── types ────────────────────────────────────────────────────

export type ConversationWithCustomer = Awaited<
  ReturnType<typeof prisma.conversation.findFirst>
> & {
  customer: { id: string; name: string; phone: string };
};

export type ConversationDetail = ConversationWithCustomer & {
  messages: Array<{
    id: string;
    direction: string;
    content: string;
    type: string;
    mediaUrl: string | null;
    isRead: boolean;
    sentAt: Date;
    deliveredAt: Date | null;
    readAt: Date | null;
    externalMessageId: string | null;
    externalStatus: string | null;
  }>;
};

// ─── service ─────────────────────────────────────────────────

export class ConversationService {
  /**
   * Paginated conversation list, ordered by most recent message.
   * Supports filtering by status, assignedTo, and full-text search on customer name/phone.
   */
  static async list(
    restaurantId: string,
    query: ConversationListQuery
  ): Promise<ServiceResult<PaginatedResult<unknown>>> {
    const { page, limit, status, assignedTo, search } = query;
    const skip = (page - 1) * limit;

    const where = {
      restaurantId,
      ...(status && { status: status as ConversationStatus }),
      ...(assignedTo && { assignedTo }),
      ...(search && {
        customer: {
          OR: [
            { name: { contains: search, mode: "insensitive" as const } },
            { phone: { contains: search } },
          ],
        },
      }),
    };

    const [data, total] = await Promise.all([
      prisma.conversation.findMany({
        where,
        orderBy: [
          { lastMessageAt: "desc" },
          { createdAt: "desc" },
        ],
        skip,
        take: limit,
        include: {
          customer: { select: { id: true, name: true, phone: true } },
          messages: {
            orderBy: { sentAt: "desc" },
            take: 1,
            select: { content: true, direction: true, sentAt: true, type: true },
          },
        },
      }),
      prisma.conversation.count({ where }),
    ]);

    return serviceOk({
      data,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    });
  }

  /**
   * Full conversation detail with the customer's UNIFIED cross-channel thread.
   *
   * A single customer can have separate conversations per channel — e.g. an
   * anonymous Cardápio (QR_AGENT) session that only later identifies, plus a
   * WhatsApp thread. The inbox (`/api/chat/conversations`) dedups these into a
   * single row per customer, so the thread view must mirror that: it shows the
   * messages of EVERY conversation that shares this customer's canonical key.
   * Otherwise the Cardápio AI's replies (living in the sibling conversation) go
   * missing from the operator's view — the reported "não aparece o que o chat do
   * cardápio está falando" bug.
   *
   * The selected conversation supplies the envelope (status/channel/customer);
   * replies still target it. Merging is read-only — no data is moved.
   */
  static async getById(
    restaurantId: string,
    conversationId: string
  ): Promise<ServiceResult<unknown>> {
    const conversation = await prisma.conversation.findUnique({
      where: { id: conversationId },
      include: {
        customer: { select: { id: true, name: true, phone: true, email: true } },
      },
    });

    if (!conversation || conversation.restaurantId !== restaurantId) {
      return serviceFail("Conversation not found", 404);
    }

    // Resolve the sibling conversations that the inbox dedups under this same
    // customer (same key it uses: customerId, else anonymous-by-phone).
    const conversationIds = await this.relatedConversationIds(restaurantId, conversation);

    const messages = await prisma.message.findMany({
      where: { conversationId: { in: conversationIds } },
      orderBy: { sentAt: "asc" },
      select: {
        id: true,
        direction: true,
        senderType: true,
        content: true,
        type: true,
        mediaUrl: true,
        metadata: true,
        isRead: true,
        sentAt: true,
        deliveredAt: true,
        readAt: true,
        externalMessageId: true,
        externalStatus: true,
      },
    });

    return serviceOk({ ...conversation, messages });
  }

  /**
   * Conversation ids whose messages belong in this customer's unified thread.
   * Mirrors the inbox dedup key so the thread shows exactly what the inbox
   * collapsed into one row:
   *   - identified customer → every conversation with that customerId
   *   - anonymous (no customer) but has a phone → anonymous siblings by phone
   *   - otherwise → just this conversation
   * The selected conversation id is always included.
   */
  private static async relatedConversationIds(
    restaurantId: string,
    conversation: { id: string; customerId: string | null; customerPhone: string | null }
  ): Promise<string[]> {
    let where: { restaurantId: string; customerId?: string; customerPhone?: string } | null = null;
    if (conversation.customerId) {
      where = { restaurantId, customerId: conversation.customerId };
    } else if (conversation.customerPhone) {
      // Anonymous sessions only — an identified customer sharing this phone is a
      // different inbox key (customerId), so it stays a separate thread.
      where = { restaurantId, customerPhone: conversation.customerPhone };
    }
    if (!where) return [conversation.id];

    const rows = await prisma.conversation.findMany({
      where: conversation.customerId
        ? where
        : { ...where, customerId: null },
      select: { id: true },
    });
    const ids = rows.map((r) => r.id);
    if (!ids.includes(conversation.id)) ids.push(conversation.id);
    return ids;
  }

  /**
   * Apply a status action to a conversation.
   * Enforces valid transitions; rejects invalid ones with 400.
   */
  static async applyAction(
    restaurantId: string,
    conversationId: string,
    input: PatchConversationInput
  ): Promise<ServiceResult<unknown>> {
    const conv = await prisma.conversation.findUnique({
      where: { id: conversationId },
      select: { id: true, restaurantId: true, status: true },
    });

    if (!conv || conv.restaurantId !== restaurantId) {
      return serviceFail("Conversation not found", 404);
    }

    const { action, userId } = input;

    switch (action) {
      case "assign": {
        if (conv.status === ConversationStatus.RESOLVED) {
          return serviceFail("Cannot assign a resolved conversation. Reopen it first.", 400);
        }
        const updated = await prisma.conversation.update({
          where: { id: conversationId },
          data: { assignedTo: userId!, status: ConversationStatus.HUMAN },
        });
        return serviceOk(updated);
      }

      case "unassign": {
        const updated = await prisma.conversation.update({
          where: { id: conversationId },
          data: { assignedTo: null, status: ConversationStatus.OPEN },
        });
        return serviceOk(updated);
      }

      case "resolve": {
        if (conv.status === ConversationStatus.RESOLVED) {
          return serviceFail("Conversation is already resolved.", 400);
        }
        const updated = await prisma.conversation.update({
          where: { id: conversationId },
          data: {
            status: ConversationStatus.RESOLVED,
            resolvedAt: new Date(),
          },
        });
        return serviceOk(updated);
      }

      case "reopen": {
        if (conv.status !== ConversationStatus.RESOLVED) {
          return serviceFail("Only resolved conversations can be reopened.", 400);
        }
        const updated = await prisma.conversation.update({
          where: { id: conversationId },
          data: {
            status: ConversationStatus.OPEN,
            resolvedAt: null,
            assignedTo: null,
          },
        });
        return serviceOk(updated);
      }

      default:
        return serviceFail("Invalid action", 400);
    }
  }

  /**
   * Reset unread counter when agent opens a conversation.
   */
  static async markRead(
    restaurantId: string,
    conversationId: string
  ): Promise<ServiceResult<void>> {
    const conv = await prisma.conversation.findUnique({
      where: { id: conversationId },
      select: { restaurantId: true },
    });

    if (!conv || conv.restaurantId !== restaurantId) {
      return serviceFail("Conversation not found", 404);
    }

    await prisma.conversation.update({
      where: { id: conversationId },
      data: { unreadCount: 0 },
    });

    return serviceOk(undefined);
  }
}
