/**
 * ConversationDeleteService — permanent, destructive deletion of a conversation.
 *
 * Authorized callers: OWNER role only.
 *
 * Side-effects on delete:
 *  1. Messages         → deleted via Prisma cascade (onDelete: Cascade on Message.conversationId)
 *  2. AIInteractionLog → conversationId nulled out (nullable field, no FK — best-effort cleanup)
 *  3. Conversation     → deleted
 *
 * What is NOT touched:
 *  - Customer record (preserved)
 *  - Customer orders (preserved)
 *  - CRM campaign history (CampaignExecution has no FK to conversations)
 *  - OrderDraft.conversationId (nullable, no FK — left as-is)
 *
 * TODO: When staff accounts and granular permissions are implemented,
 * destructive delete actions must remain restricted to MASTER_ADMIN / OWNER only.
 */

import { prisma } from "@/lib/prisma";
import { serviceOk, serviceFail, type ServiceResult } from "@/types";

export class ConversationDeleteService {
  static async deleteConversation(
    restaurantId: string,
    conversationId: string,
  ): Promise<ServiceResult<{ deletedId: string }>> {

    const conversation = await prisma.conversation.findUnique({
      where:  { id: conversationId },
      select: { id: true, restaurantId: true },
    });

    if (!conversation || conversation.restaurantId !== restaurantId) {
      return serviceFail("Conversa não encontrada", 404);
    }

    // Null out AIInteractionLog.conversationId references (no FK constraint, best-effort)
    await prisma.aIInteractionLog.updateMany({
      where: { conversationId },
      data:  { conversationId: null },
    }).catch((err) =>
      console.error("[ConversationDeleteService] Failed to null AI interaction log conversationId:", err)
    );

    // Delete the conversation — Messages cascade automatically
    await prisma.conversation.delete({ where: { id: conversationId } });

    return serviceOk({ deletedId: conversationId });
  }
}
