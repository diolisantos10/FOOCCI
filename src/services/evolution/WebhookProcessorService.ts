/**
 * WebhookProcessorService
 *
 * Orchestrates parsed webhook events into DB state.
 * Responsibilities:
 *   1. Resolve restaurantId from instanceName.
 *   2. Idempotency: skip duplicate messages using externalMessageId.
 *   3. Find or create Customer.
 *   4. Conversation reuse logic:
 *        a. Prefer OPEN or HUMAN conversation (HUMAN messages are only read by staff).
 *        b. Reopen a recently-RESOLVED conversation (< REOPEN_WINDOW_HOURS).
 *        c. Create a new conversation otherwise.
 *   5. Persist Message with externalMessageId.
 *   6. Update Conversation.lastMessageAt and unreadCount.
 *   7. Phase 4: If conversation is OPEN or BOT, trigger AIOrderService.processTurn().
 *      HUMAN conversations are skipped — human agent is handling them.
 *   8. Handle message status updates (deliveredAt, readAt).
 *   9. Handle connection state changes.
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
// Phase 4: lazy import to avoid circular dependency issues at module load time
import type { AIOrderService as AIOrderServiceType } from "@/services/ai/AIOrderService";

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
  const t0 = Date.now();

  // 1. Resolve restaurant from instanceName
  const configResult = await EvolutionConfigService.findRestaurantByInstance(event.instanceName);
  if (!configResult.ok) {
    console.warn(
      "[WebhookProcessor] Unknown instanceName — webhook ignored.",
      { instanceName: event.instanceName, externalMessageId: event.externalMessageId, phone: event.phone }
    );
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
      name: event.senderName ?? event.phone, // use WhatsApp display name when available
    },
    update: {}, // do not overwrite existing customer data
  });

  // 4. Conversation reuse logic
  const conversation = await resolveConversation(
    restaurantId, customer.id, customer.phone, customer.name,
  );

  // 5 & 6. Persist message + update conversation atomically
  const now = new Date();
  await prisma.$transaction([
    prisma.message.create({
      data: {
        conversationId: conversation.id,
        direction: "INBOUND",
        senderType: "CUSTOMER",
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

  // 7. Route to the correct agent based on WhatsApp mode.
  //    HUMAN / RESOLVED conversations are never touched by AI.
  //
  //    agentMode values (from WhatsAppAgentConfig):
  //      RECEPTIONIST_ONLY       (default) — WhatsAppReceptionistService
  //      HUMAN_ASSISTED          — same receptionist path, escalates faster
  //      AI_ORDERING_EXPERIMENTAL — full AIOrderService sales agent (opt-in)
  const shouldRespond =
    conversation.status === ConversationStatus.OPEN ||
    conversation.status === ConversationStatus.BOT;

  if (shouldRespond) {
    // Read agent mode; default to RECEPTIONIST_ONLY if no config row exists.
    const agentCfg = await prisma.whatsAppAgentConfig.findUnique({
      where:  { restaurantId },
      select: { agentMode: true },
    });
    const agentMode = agentCfg?.agentMode ?? "RECEPTIONIST_ONLY";

    if (agentMode === "AI_ORDERING_EXPERIMENTAL") {
      // Opt-in only — full sales/ordering agent.
      void import("@/services/ai/AIOrderService")
        .then(({ AIOrderService }) =>
          AIOrderService.processTurn(conversation.id).catch((err) =>
            console.error("[WebhookProcessor] AI ordering turn failed:", err)
          )
        )
        .catch((err) =>
          console.error("[WebhookProcessor] AI ordering module load failed:", err)
        );
    } else {
      // Default path — receptionist handles RECEPTIONIST_ONLY and HUMAN_ASSISTED.
      void import("@/services/ai/WhatsAppReceptionistService")
        .then(({ WhatsAppReceptionistService }) =>
          WhatsAppReceptionistService.respond(conversation.id).catch((err) =>
            console.error("[WebhookProcessor] Receptionist failed:", err)
          )
        )
        .catch((err) =>
          console.error("[WebhookProcessor] Receptionist module load failed:", err)
        );
    }
  }

  console.log(
    "[WebhookProcessor] Inbound message processed.",
    { restaurantId, conversationId: conversation.id, phone: event.phone, ms: Date.now() - t0 }
  );

  return {
    handled: true,
    action: "message_persisted",
    detail: `conversation:${conversation.id}`,
  };
}

// Silence unused-import warning — the type is used only for documentation.
type _AIRef = AIOrderServiceType;

// ─── conversation reuse ───────────────────────────────────────

async function resolveConversation(
  restaurantId: string,
  customerId: string,
  customerPhone: string,
  customerName: string,
) {
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

  // Create a fresh conversation with denormalized contact info for fast lookup
  return prisma.conversation.create({
    data: {
      restaurantId,
      customerId,
      channel: "WHATSAPP",
      status: ConversationStatus.OPEN,
      customerPhone,
      customerName,
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
    // Silently ignore — happens for messages sent before Chat Inbox go-live.
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
    const restaurantId = await instanceToRestaurantId(event.instanceName);
    console.warn("[WebhookProcessor] Evolution instance disconnected.", { instanceName: event.instanceName, restaurantId });
    await EvolutionConfigService.deactivate(restaurantId);
    return { handled: true, action: "instance_deactivated" };
  }

  if (event.state === "open") {
    console.log("[WebhookProcessor] Evolution instance connected.", { instanceName: event.instanceName });
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
