/**
 * MessageService
 *
 * Handles message reads (cursor-based pagination) and outbound sending.
 *
 * Outbound flow:
 *   1. Validate conversation belongs to restaurant and is not resolved.
 *   2. Fetch decrypted EvolutionConfig for the restaurant.
 *   3. Call EvolutionClient to deliver the message.
 *   4. Persist the outbound Message with the returned externalMessageId.
 *   5. Update Conversation.lastMessageAt.
 *
 * Note: The content sent here is authored by a human agent.
 * In Phase 4, AI-generated content will also flow through this method,
 * carrying per-restaurant brand config (tone, vocabulary, formality, etc.)
 * set in RestaurantBrandConfig. This method is intentionally content-agnostic.
 */

import { prisma } from "@/lib/prisma";
import { serviceOk, serviceFail, ServiceResult } from "@/types";
import { activeWhatsAppProvider } from "@/services/whatsapp/activeProvider";
import type { SendResult } from "@/services/whatsapp/providers/types";
import { sendManualReply as sendInstagramManualReply, sendCommentReply as sendInstagramCommentReply } from "@/services/instagram/InstagramChannelService";
import type { SendMessageInput, MessageListQuery } from "@/validators/conversation";
import { ConversationStatus, MessageType } from "@prisma/client";

export class MessageService {
  /**
   * Cursor-based message list (oldest first, paginate backward from `before`).
   */
  static async list(
    restaurantId: string,
    conversationId: string,
    query: MessageListQuery
  ): Promise<ServiceResult<unknown>> {
    const conv = await prisma.conversation.findUnique({
      where: { id: conversationId },
      select: { restaurantId: true },
    });

    if (!conv || conv.restaurantId !== restaurantId) {
      return serviceFail("Conversation not found", 404);
    }

    const { limit, before } = query;

    const messages = await prisma.message.findMany({
      where: {
        conversationId,
        ...(before && { sentAt: { lt: new Date(before) } }),
      },
      orderBy: { sentAt: "desc" }, // newest-first for cursor loading; UI reverses for display
      take: limit,
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

    const ordered = messages.reverse(); // oldest-first for chat display
    return serviceOk({
      data: ordered,
      hasMore: messages.length === limit,
      nextCursor: ordered.length > 0 ? ordered[0]!.sentAt.toISOString() : null,
    });
  }

  /**
   * Send an outbound message and persist it.
   * WhatsApp conversations are delivered via Evolution API.
   * All other channels (QR_AGENT, WEB_AGENT, MANUAL, EMAIL, SMS) are persisted
   * internally only — no external delivery is attempted.
   */
  static async sendOutbound(
    restaurantId: string,
    conversationId: string,
    input: SendMessageInput
  ): Promise<ServiceResult<unknown>> {
    // Validate conversation ownership and state
    const conv = await prisma.conversation.findUnique({
      where: { id: conversationId },
      include: { customer: { select: { phone: true } } },
    });

    if (!conv || conv.restaurantId !== restaurantId) {
      return serviceFail("Conversation not found", 404);
    }

    if (conv.status === ConversationStatus.RESOLVED) {
      return serviceFail(
        "Cannot send messages to a resolved conversation. Reopen it first.",
        400
      );
    }

    const now = new Date();

    // Instagram Direct: route the manual reply through the Instagram channel
    // service (mode-gated, dry-run aware, persists the outbound itself). Never
    // falls into the internal-only bucket below. WhatsApp path is untouched.
    if (conv.channel === "INSTAGRAM_DIRECT") {
      if (input.type !== "TEXT") {
        return serviceFail("Instagram v1 suporta apenas resposta de texto.", 400);
      }
      const identity = await prisma.customerChannelIdentity.findFirst({
        where: { restaurantId, channel: "INSTAGRAM_DIRECT", customerId: conv.customerId ?? undefined },
        select: { externalUserId: true },
        orderBy: { updatedAt: "desc" },
      });
      if (!identity) {
        return serviceFail("Conversa do Instagram sem identidade vinculada — não é possível responder.", 422);
      }
      const result = await sendInstagramManualReply(restaurantId, conversationId, identity.externalUserId, input.content);
      if (!result.ok) {
        // Operational (not a crash): surface the reason; the outbound was persisted as pending/failed.
        return serviceFail(result.reason ?? "Não foi possível enviar pelo Instagram.", 502);
      }
      return serviceOk({ id: result.messageId, _channel: "INSTAGRAM_DIRECT", _dryRun: result.send.dryRun });
    }

    // Instagram comments: the reply is PUBLIC, posted under the original comment
    // on the post (not a DM). The channel service resolves the target comment id
    // from the conversation's latest inbound comment and persists the outbound.
    if (conv.channel === "INSTAGRAM_COMMENT") {
      if (input.type !== "TEXT") {
        return serviceFail("Resposta a comentário do Instagram suporta apenas texto.", 400);
      }
      const result = await sendInstagramCommentReply(restaurantId, conversationId, input.content);
      if (!result.ok) {
        return serviceFail(result.reason ?? "Não foi possível responder o comentário no Instagram.", 502);
      }
      return serviceOk({ id: result.messageId, _channel: "INSTAGRAM_COMMENT", _dryRun: result.send.dryRun });
    }

    // Non-WhatsApp channels: persist internally. For Cardápio (QR/WEB agent)
    // conversations the message is delivered to the customer's /pedido chat via
    // polling, so it is NOT "internal only" — flag accordingly so the operator
    // sees the correct status. MANUAL/EMAIL/SMS remain internal notes.
    if (conv.channel !== "WHATSAPP") {
      const isCardapio = conv.channel === "QR_AGENT" || conv.channel === "WEB_AGENT";
      const source     = isCardapio ? "CARDAPIO" : conv.channel;
      const [message] = await prisma.$transaction([
        prisma.message.create({
          data: {
            conversationId,
            direction:  "OUTBOUND",
            senderType: "HUMAN",
            content:    input.content,
            type:       input.type as MessageType,
            mediaUrl:   input.mediaUrl ?? null,
            sentAt:     now,
            externalMessageId: null,
            externalStatus:    null,
            metadata:   { source } as object,
          },
        }),
        prisma.conversation.update({
          where: { id: conversationId },
          // Replying IS acknowledging: a human answer silences the handoff alarm
          // durably (all pages/devices). The conversation stays HUMAN/visible.
          data: { lastMessageAt: now, handoffAlarmAckAt: now },
        }),
      ]);
      // Cardápio replies are delivered to the customer via /pedido polling.
      return serviceOk({ ...message, _internalOnly: !isCardapio, _deliveredVia: isCardapio ? "CARDAPIO" : null });
    }

    // WhatsApp: route through the restaurant's ACTIVE provider (Meta Cloud API or
    // Evolution). A restaurant that migrated its number to the official Meta Cloud API
    // has no live Evolution instance, so a hardcoded Evolution send fails with HTTP 400
    // and the agent can't reply. Routing by the active provider fixes that while leaving
    // Evolution-only restaurants untouched.
    const provider = await activeWhatsAppProvider(restaurantId);

    // Channel phone (customerPhone) is the authoritative recipient: for Meta it's the
    // wa_id the inbound webhook self-heals; fall back to the CRM customer.phone. Both
    // providers normalize/validate the number themselves.
    const toNumber = (conv.customerPhone ?? conv.customer?.phone ?? "").trim().replace(/^\+/, "");
    if (!toNumber) {
      return serviceFail("Conversa sem telefone — não é possível enviar.", 422);
    }

    let sendResult: SendResult;
    if (input.type === "TEXT") {
      sendResult = await provider.sendText({ restaurantId, to: toNumber, text: input.content });
    } else if (input.mediaUrl) {
      if (!provider.sendMedia) {
        return serviceFail("Este provedor de WhatsApp não suporta envio de mídia.", 400);
      }
      const mediaType = input.type.toLowerCase() as "image" | "audio" | "video" | "document";
      sendResult = await provider.sendMedia({
        restaurantId, to: toNumber, mediaType, mediaUrl: input.mediaUrl, caption: input.content || undefined,
      });
    } else {
      return serviceFail("mediaUrl is required for non-text messages", 400);
    }

    if (!sendResult.ok) {
      console.error("[MessageService.sendOutbound] provider send failed", sendResult.provider, sendResult.errorCode, sendResult.error);
      return serviceFail(`Failed to deliver message via WhatsApp: ${sendResult.error ?? sendResult.errorCode ?? "erro no envio"}`, 502);
    }
    const externalMessageId = sendResult.providerMessageId;

    const [message] = await prisma.$transaction([
      prisma.message.create({
        data: {
          conversationId,
          direction:  "OUTBOUND",
          senderType: "HUMAN",
          content:    input.content,
          type:       input.type as MessageType,
          mediaUrl:   input.mediaUrl ?? null,
          sentAt:     now,
          externalMessageId,
          externalStatus: "sent",
          provider:          sendResult.provider,
          ...(externalMessageId ? { providerMessageId: externalMessageId } : {}),
          metadata:   { source: "WHATSAPP", provider: sendResult.provider } as object,
        },
      }),
      prisma.conversation.update({
        where: { id: conversationId },
        // Replying IS acknowledging: a human answer silences the handoff alarm
        // durably (all pages/devices). The conversation stays HUMAN/visible.
        data: { lastMessageAt: now, handoffAlarmAckAt: now },
      }),
    ]);

    return serviceOk(message);
  }
}
