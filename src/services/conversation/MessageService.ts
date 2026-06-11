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
import { EvolutionClient, EvolutionApiError } from "@/lib/evolution/EvolutionClient";
import { EvolutionConfigService } from "@/services/evolution/EvolutionConfigService";
import { sendManualReply as sendInstagramManualReply } from "@/services/instagram/InstagramChannelService";
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
          data: { lastMessageAt: now },
        }),
      ]);
      // Cardápio replies are delivered to the customer via /pedido polling.
      return serviceOk({ ...message, _internalOnly: !isCardapio, _deliveredVia: isCardapio ? "CARDAPIO" : null });
    }

    // WhatsApp: fetch decrypted credentials
    const configResult = await EvolutionConfigService.getSnapshot(restaurantId);
    if (!configResult.ok) {
      return serviceFail("WHATSAPP_NOT_CONFIGURED", 502);
    }

    const config = configResult.data;

    if (!conv.customer) {
      return serviceFail("Conversation has no linked customer — cannot send via Evolution", 422);
    }

    // Strip '+' prefix — Evolution expects bare number string
    const toNumber = conv.customer.phone!.replace(/^\+/, "");

    let externalMessageId: string | null = null;

    try {
      if (input.type === "TEXT") {
        const result = await EvolutionClient.sendTextMessage(config, toNumber, input.content);
        externalMessageId = result.key.id;
      } else if (input.mediaUrl) {
        const mediaType = input.type.toLowerCase() as "image" | "audio" | "document";
        const result = await EvolutionClient.sendMediaMessage(
          config,
          toNumber,
          mediaType,
          input.mediaUrl,
          input.content || undefined
        );
        externalMessageId = result.key.id;
      } else {
        return serviceFail("mediaUrl is required for non-text messages", 400);
      }
    } catch (err) {
      if (err instanceof EvolutionApiError) {
        console.error("[MessageService.sendOutbound] Evolution API error", err.status, err.body);
        return serviceFail(`Failed to deliver message via WhatsApp: ${err.message}`, 502);
      }
      throw err;
    }

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
          metadata:   { source: "WHATSAPP" } as object,
        },
      }),
      prisma.conversation.update({
        where: { id: conversationId },
        data: { lastMessageAt: now },
      }),
    ]);

    return serviceOk(message);
  }
}
