/**
 * GET /api/chat/conversations/[id]
 *
 * Full conversation detail with all messages (oldest-first).
 * Marks unread messages as read and resets unreadCount.
 */

import { NextRequest } from "next/server";
import { getTenantContext } from "@/lib/tenant";
import { prisma } from "@/lib/prisma";
import { ConversationDeleteService } from "@/services/conversation/ConversationDeleteService";
import { auditLog } from "@/lib/audit";
import { ok, unauthorized, forbidden, notFound, serverError } from "@/lib/api-response";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const ctx = getTenantContext(req);
    if (!ctx) return unauthorized();

    const { id } = await params;

    const conversation = await prisma.conversation.findUnique({
      where: { id },
      include: {
        customer: { select: { id: true, name: true, phone: true, tier: true } },
        messages: {
          orderBy: { sentAt: "asc" },
          select: {
            id:             true,
            direction:      true,
            senderType:     true,
            content:        true,
            type:           true,
            mediaUrl:       true,
            isRead:         true,
            sentAt:         true,
            externalStatus: true,
            metadata:       true,
          },
        },
      },
    });

    if (!conversation || conversation.restaurantId !== ctx.restaurantId) {
      return notFound();
    }

    // Reset unread counter when agent opens the thread
    if (conversation.unreadCount > 0) {
      await prisma.conversation.update({
        where: { id },
        data:  { unreadCount: 0 },
      });
    }

    return ok(conversation);
  } catch (err) {
    console.error("[GET /api/chat/conversations/[id]]", err);
    return serverError();
  }
}

/**
 * DELETE /api/chat/conversations/[id]
 *
 * Permanently removes a conversation and all its messages.
 * Does NOT delete the customer record or their orders.
 *
 * Restricted to OWNER role only.
 * TODO: When MASTER_ADMIN role is added, also allow MASTER_ADMIN here.
 */
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const ctx = getTenantContext(req);
    if (!ctx) return unauthorized();

    // Destructive delete: OWNER only
    if (ctx.role !== "OWNER") {
      return forbidden("Apenas proprietários podem apagar conversas permanentemente.");
    }

    const { id } = await params;

    const result = await ConversationDeleteService.deleteConversation(ctx.restaurantId, id);
    if (!result.ok) {
      if (result.status === 404) return notFound(result.error);
      return serverError(result.error);
    }

    auditLog({
      action:       "conversation.delete",
      restaurantId: ctx.restaurantId,
      userId:       ctx.userId,
      targetId:     id,
    });

    return ok({ deletedId: id });
  } catch (err) {
    console.error("[DELETE /api/chat/conversations/[id]]", err);
    return serverError();
  }
}
