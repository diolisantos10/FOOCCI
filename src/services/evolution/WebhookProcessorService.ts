/**
 * WebhookProcessorService
 *
 * Orchestrates parsed webhook events into DB state.
 * Responsibilities:
 *   1. Resolve restaurantId from instanceName.
 *   2. Idempotency: skip duplicate messages using externalMessageId.
 *   3. Find or create Customer.
 *   4. Conversation reuse logic:
 *        a. Prefer OPEN or HUMAN conversation.
 *        b. Reopen a recently-RESOLVED conversation (< REOPEN_WINDOW_HOURS).
 *        c. Create a new conversation otherwise.
 *   5. Persist Message with externalMessageId.
 *   6. Update Conversation.lastMessageAt and unreadCount.
 *   7. Handle message status updates (deliveredAt, readAt).
 *   8. Handle connection state changes.
 *
 * Note: No AI or automated reply logic lives here (Phase 4).
 * This processor is intentionally passive — it records what happened
 * and notifies the human inbox layer. The future AI layer will hook
 * in here with per-restaurant brand config (tone, vocabulary, etc.).
 */

import { prisma } from "@/lib/prisma";
import { EvolutionConfigService } from "./EvolutionConfigService";
import type {
  ParsedEvent,
  InboundMessageEvent,
  MessageStatusUpdateEvent,
  ConnectionUpdateEvent,
} from "./WebhookParserService";
import { ConversationStatus, MessageType } from "@prisma/client";

// Resolved conversations older than this are treated as new threads.
const REOPEN_WINDOW_HOURS = 24;

export interface ProcessResult {
  handled: boolean;
  action?: string;
  detail?: string;
}

export class WebhookProcessorService {
  static async process(event: ParsedEvent): Promise<ProcessResult> {
    switch (event.type) {
      case "inbound_message":
        return handleInboundMessage(event);

      case "message_status_update":
        return handleStatusUpdate(event);

      case "connection_update":
        return handleConnectionUpdate(event);

      case "ignored":
      default:
        return { handled: false, detail: event.reason };
    }
  }
}

// ─── inbound message ─────────────────────────────────────────

async function handleInboundMessage(event: InboundMessageEvent): Promise<ProcessResult> {
  // 1. Resolve restaurant from instanceName
  const configResult = await EvolutionConfigService.findRestaurantByInstance(event.instanceName);
  if (!configResult.ok) {
    return { handled: false, detail: `Unknown instance: ${event.instanceName}` };
  }
  const { restaurantId } = configResult.data;

  // 2. Idempotency: reject duplicates early
  const existing = await prisma.message.findUnique({
    where: { externalMessageId: event.externalMessageId },
    select: { id: true },
  });
  if (existing) {
    return { handled: true, action: "duplicate_skipped", detail: event.externalMessageId };
  }

  // 3. Find or create Customer
  const customer = await prisma.customer.upsert({
    where: { phone_restaurantId: { phone: event.phone, restaurantId } },
    create: {
      restaurantId,
      phone: event.phone,
      name: event.phone, // placeholder; agents can update name later
    },
    update: {}, // do not overwrite existing customer data
  });

  // 4. Conversation reuse logic
  const conversation = await resolveConversation(restaurantId, customer.id);

  // 5 & 6. Persist message + update conversation atomically
  const now = new Date();
  await prisma.$transaction([
    prisma.message.create({
      data: {
        conversationId: conversation.id,
        direction: "INBOUND",
        content: event.content,
        type: event.messageType as MessageType,
        mediaUrl: event.mediaUrl ?? null,
        sentAt: new Date(event.rawTimestamp * 1000),
        externalMessageId: event.externalMessageId,
        externalStatus: "delivered",
      },
    }),
    prisma.conversation.update({
      where: { id: conversation.id },
      data: {
        lastMessageAt: now,
        unreadCount: { increment: 1 },
      },
    }),
  ]);

  return {
    handled: true,
    action: "message_persisted",
    detail: `conversation:${conversation.id}`,
  };
}

// ─── conversation reuse ───────────────────────────────────────

async function resolveConversation(restaurantId: string, customerId: string) {
  // Prefer any OPEN or HUMAN conversation (most recent first)
  const active = await prisma.conversation.findFirst({
    where: {
      restaurantId,
      customerId,
      status: { in: [ConversationStatus.OPEN, ConversationStatus.HUMAN] },
    },
    orderBy: { lastMessageAt: "desc" },
  });

  if (active) return active;

  // Check for a recently resolved conversation worth reopening
  const reopenThreshold = new Date();
  reopenThreshold.setHours(reopenThreshold.getHours() - REOPEN_WINDOW_HOURS);

  const recentlyResolved = await prisma.conversation.findFirst({
    where: {
      restaurantId,
      customerId,
      status: ConversationStatus.RESOLVED,
      resolvedAt: { gte: reopenThreshold },
    },
    orderBy: { resolvedAt: "desc" },
  });

  if (recentlyResolved) {
    return prisma.conversation.update({
      where: { id: recentlyResolved.id },
      data: {
        status: ConversationStatus.OPEN,
        resolvedAt: null,
        assignedTo: null,
      },
    });
  }

  // Create a fresh conversation
  return prisma.conversation.create({
    data: {
      restaurantId,
      customerId,
      channel: "WHATSAPP",
      status: ConversationStatus.OPEN,
    },
  });
}

// ─── message status update ────────────────────────────────────

async function handleStatusUpdate(event: MessageStatusUpdateEvent): Promise<ProcessResult> {
  const message = await prisma.message.findUnique({
    where: { externalMessageId: event.externalMessageId },
    select: { id: true },
  });

  if (!message) {
    // Can happen for messages sent before Phase 3 go-live — safe to ignore.
    return { handled: false, detail: `Message not found: ${event.externalMessageId}` };
  }

  const now = new Date();
  await prisma.message.update({
    where: { id: message.id },
    data: {
      externalStatus: event.status,
      ...(event.status === "delivered" && { deliveredAt: now }),
      ...(event.status === "read" && { readAt: now, isRead: true }),
    },
  });

  return { handled: true, action: `status_updated:${event.status}` };
}

// ─── connection update ────────────────────────────────────────

async function handleConnectionUpdate(event: ConnectionUpdateEvent): Promise<ProcessResult> {
  if (event.state === "close") {
    await EvolutionConfigService.deactivate(
      await instanceToRestaurantId(event.instanceName)
    );
    return { handled: true, action: "instance_deactivated" };
  }

  if (event.state === "open") {
    // Reactivate if it was previously marked inactive
    await prisma.evolutionConfig.updateMany({
      where: { instanceName: event.instanceName },
      data: { isActive: true },
    });
    return { handled: true, action: "instance_reactivated" };
  }

  return { handled: true, action: `connection_state:${event.state}` };
}

async function instanceToRestaurantId(instanceName: string): Promise<string> {
  const config = await prisma.evolutionConfig.findFirst({
    where: { instanceName },
    select: { restaurantId: true },
  });
  return config?.restaurantId ?? "";
}
