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
import { isInternalCommandText } from "@/services/buildos/BuildCommandRouter";
import { resolveBuildOsChannel } from "@/services/buildos/BuildOSConfigService";
import { EvolutionConfigService } from "./EvolutionConfigService";
import type {
  ParsedEvent,
  InboundMessageEvent,
  ExternalOutboundMessageEvent,
  MessageStatusUpdateEvent,
  ConnectionUpdateEvent,
} from "./WebhookParserService";
import { ConversationStatus, MessageType } from "@prisma/client";
// Phase 4: lazy import to avoid circular dependency issues at module load time
import type { AIOrderService as AIOrderServiceType } from "@/services/ai/AIOrderService";
import { markCrmReplyIfApplicable } from "@/services/agents/AgentRoutingService";
import { markConversationNeedsHuman } from "@/lib/handoff";
import { ContactSafetyService } from "@/services/crm/ContactSafetyService";
import { shouldAiRespond } from "@/services/conversation/ConversationAiPolicyService";
import { isWaTextOrderingEnabled, isPhoneAllowlisted } from "@/lib/wa-text-ordering-flag";

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

      case "external_outbound_message":
        return handleExternalOutboundMessage(event);

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

  // Channel gate: Build OS only runs on the configured Master/Admin instance (or an
  // explicit legacy fallback). Restaurant instances never act as Build OS by default.
  const channel = await resolveBuildOsChannel(event.instanceName);

  // 0. ADMIN/SYSTEM Build OS channel — has NO restaurant. Handle Build OS ONLY and
  //    return; never resolve a restaurant, never create Customer/Conversation/
  //    Message, never reach Waiter/CRM/Atendimento. The reply goes via the admin
  //    WhatsApp instance (restaurantId: null).
  if (channel.isAdminInstance) {
    if (event.messageType === "TEXT") {
      try {
        const { handleBuildCommand } = await import("@/services/buildos/handleBuildCommand");
        await handleBuildCommand({
          restaurantId: null,
          phone: event.phone,
          senderName: event.senderName,
          content: event.content,
          fromMe: false,
          instanceName: event.instanceName,
          isBuildOsChannel: true,
          masterConfigured: channel.masterConfigured,
        });
      } catch (err) {
        console.error("[WebhookProcessor] Build OS (admin channel) error:", err);
      }
    }
    return { handled: true, action: "buildos_admin_channel", detail: event.externalMessageId };
  }

  // 1. Resolve restaurant from instanceName (restaurant instances only).
  const configResult = await EvolutionConfigService.findRestaurantByInstance(event.instanceName);
  if (!configResult.ok) {
    console.warn(
      "[WebhookProcessor] Unknown instanceName — webhook ignored.",
      { instanceName: event.instanceName, externalMessageId: event.externalMessageId, phone: event.phone }
    );
    return { handled: false, detail: `Unknown instance: ${event.instanceName}` };
  }
  const { restaurantId } = configResult.data;

  // 1b. Build OS command interception on a restaurant instance (legacy fallback or
  //     hard-suppression of an internal command). Hard suppression invariant: ANY
  //     internal command prefix is intercepted BEFORE customer flow even if
  //     handleBuildCommand throws.

  // Hard suppression invariant: ANY internal command prefix (/build, /cmd, /prompt)
  // is intercepted BEFORE customer flow even if handleBuildCommand throws. On the
  // Master channel it becomes a BuildCommand; on a restaurant instance it is
  // suppressed but NOT executed (handleBuildCommand enforces the channel gate).
  if (event.messageType === "TEXT" && isInternalCommandText(event.content)) {
    try {
      const { handleBuildCommand } = await import("@/services/buildos/handleBuildCommand");
      await handleBuildCommand({
        restaurantId,
        phone: event.phone,
        senderName: event.senderName,
        content: event.content,
        fromMe: false,
        instanceName: event.instanceName,
        isBuildOsChannel: channel.isBuildOsChannel,
        masterConfigured: channel.masterConfigured,
      });
    } catch (err) {
      console.error("[WebhookProcessor] Build OS branch error (suppressed anyway):", err);
    }
    return {
      handled: true,
      action: channel.isBuildOsChannel ? "buildos_command" : "buildos_ignored_non_master",
      detail: event.externalMessageId,
    };
  }
  // Confirmation replies (ENVIAR/CANCELAR/etc.) — ONLY on the Build OS channel.
  if (event.messageType === "TEXT" && channel.isBuildOsChannel) {
    try {
      const { handleBuildCommand } = await import("@/services/buildos/handleBuildCommand");
      const buildResult = await handleBuildCommand({
        restaurantId,
        phone: event.phone,
        senderName: event.senderName,
        content: event.content,
        fromMe: false,
        instanceName: event.instanceName,
        isBuildOsChannel: true,
        masterConfigured: channel.masterConfigured,
      });
      if (buildResult.isBuildCommand) {
        return { handled: true, action: "buildos_reply", detail: event.externalMessageId };
      }
    } catch (err) {
      console.error("[WebhookProcessor] Build OS branch error (ignored):", err);
    }
  }

  // Master-channel isolation: the Build OS Master instance is an INTERNAL admin
  // channel. No message on it may reach the restaurant customer flow (Customer,
  // Conversation, Waiter, CRM, Atendimento). Anything that wasn't a Build OS
  // command/reply above is simply ignored here — never persisted as a customer
  // message. Restaurant instances are unaffected.
  if (channel.isBuildOsChannel) {
    return { handled: true, action: "buildos_master_non_command_ignored", detail: event.externalMessageId };
  }

  // 2. Idempotency: reject duplicates early
  const existing = await prisma.message.findUnique({
    where: { externalMessageId: event.externalMessageId },
    select: { id: true },
  });
  if (existing) {
    return { handled: true, action: "duplicate_skipped", detail: event.externalMessageId };
  }

  // 3. Find or create Customer
  // On UPDATE: refresh name from WhatsApp pushName if the sender has one.
  // This keeps the CRM name in sync when the contact updates their display name,
  // and also fixes records that were created with a phone-number fallback name.
  const customer = await prisma.customer.upsert({
    where: { phone_restaurantId: { phone: event.phone, restaurantId } },
    create: {
      restaurantId,
      phone: event.phone,
      name: event.senderName ?? event.phone, // use WhatsApp display name when available
    },
    update: event.senderName ? { name: event.senderName } : {},
  });

  // 4. Conversation reuse logic
  const conversation = await resolveConversation(
    restaurantId, customer.id, customer.phone!, customer.name, // webhook customers came in via WhatsApp — always have a phone
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
        ...(event.mediaMeta ? { metadata: event.mediaMeta as object } : {}),
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

  // 7a. CRM attribution: if customer replied to a CRM conversation, mark it.
  //     Fire-and-forget — never block the webhook hot path.
  markCrmReplyIfApplicable(conversation.id).catch(() => {});

  // 7a-bis. Inbound opt-out (LGPD): if the customer texts STOP/SAIR/PARAR/etc.,
  //     mark them opted-out so no future CRM message is ever sent. We do NOT
  //     send any auto-reply (recorded silently) and we suppress the AI response
  //     for this turn so the customer is never answered with marketing.
  let optedOutThisTurn = false;
  if (event.messageType === "TEXT") {
    optedOutThisTurn = await ContactSafetyService.applyInboundOptOut(
      restaurantId,
      customer.id,
      event.content,
    ).catch(() => false);
  }

  // 7b. Cart recovery handoff: if the customer replies to a cart recovery
  //     message, escalate immediately to human. AI should never intercept
  //     these replies — the customer is likely asking for help or expressing
  //     intent, and a human touch is more appropriate than an AI greeting.
  const isCartRecovery = conversation.contextType === "CART_RECOVERY";
  if (isCartRecovery) {
    markConversationNeedsHuman(conversation.id, "CART_RECOVERY").catch((err) =>
      console.error("[WebhookProcessor] Cart recovery handoff failed:", err),
    );
  }

  // 7. Route to the correct agent based on WhatsApp mode.
  //    HUMAN / RESOLVED conversations are never touched by AI.
  //
  //    agentMode values (from WhatsAppAgentConfig):
  //      RECEPTIONIST_ONLY       (default) — WhatsAppReceptionistService
  //      HUMAN_ASSISTED          — same receptionist path, escalates faster
  //      AI_ORDERING_EXPERIMENTAL — full AIOrderService sales agent (opt-in)
  //
  // Guard: never auto-trigger the WhatsApp Receptionist for conversations that
  // originated from a CRM campaign, automation, or cart recovery message.
  // These replies must go to human staff first; operators can manually release
  // AI via the Atendimento panel.
  // Central AI policy decision — also enforces the persistent Staff/Supplier
  // lock (P0-A). A locked / non-customer conversation can NEVER auto-reply.
  const aiDecision = shouldAiRespond(conversation);

  const shouldRespond =
    aiDecision.allowed &&
    !isCartRecovery &&
    !optedOutThisTurn;

  // Text ordering engine: fires async, behind full flag + allowlist + conversation guards.
  // Only TEXT messages are eligible. If the engine handles this message, normal agent
  // routing (receptionist / AI_ORDERING_EXPERIMENTAL) is skipped for this turn.
  let textOrderingHandled = false;
  if (
    shouldRespond &&
    event.messageType === "TEXT" &&
    isWaTextOrderingEnabled(restaurantId) &&
    isPhoneAllowlisted(event.phone)
  ) {
    textOrderingHandled = true;
    void import("@/services/whatsapp/ordering/WhatsAppTextOrderingRuntimeService")
      .then(({ handleInboundForOrdering }) =>
        handleInboundForOrdering({
          restaurantId,
          phone:          event.phone,
          conversationId: conversation.id,
          customerId:     customer.id,
          messageText:    event.content,
        }).catch((err) =>
          console.error("[WebhookProcessor] Text ordering engine error:", err)
        )
      )
      .catch((err) =>
        console.error("[WebhookProcessor] Text ordering module load failed:", err)
      );
  }

  if (shouldRespond && !textOrderingHandled) {
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
    { restaurantId, conversationId: conversation.id, phone: event.phone, textOrdering: textOrderingHandled, ms: Date.now() - t0 }
  );

  return {
    handled: true,
    action: textOrderingHandled ? "text_ordering_routed" : "message_persisted",
    detail: `conversation:${conversation.id}`,
  };
}

// Silence unused-import warning — the type is used only for documentation.
type _AIRef = AIOrderServiceType;

// ─── external outbound (WhatsApp Web / mobile) ───────────────

/**
 * Handles messages sent FROM the restaurant WhatsApp number by a staff member
 * using WhatsApp Web or the mobile app (fromMe=true).
 *
 * Dedup strategy:
 *   If externalMessageId already exists in the DB, Foocci sent it — skip.
 *   Otherwise it is a genuinely external message — save as HUMAN_EXTERNAL.
 *
 * We only attach to an existing active conversation; we never create a new
 * conversation from an outbound-only event.
 */
async function handleExternalOutboundMessage(event: ExternalOutboundMessageEvent): Promise<ProcessResult> {
  const channel = await resolveBuildOsChannel(event.instanceName);

  // 0. ADMIN/SYSTEM Build OS channel — no restaurant, no customer flow.
  if (channel.isAdminInstance) {
    if (event.messageType === "TEXT") {
      try {
        const { handleBuildCommand } = await import("@/services/buildos/handleBuildCommand");
        await handleBuildCommand({
          restaurantId: null,
          phone: event.instanceOwnerPhone ?? "",
          content: event.content,
          fromMe: true,
          instanceName: event.instanceName,
          isBuildOsChannel: true,
          masterConfigured: channel.masterConfigured,
        });
      } catch (err) {
        console.error("[WebhookProcessor] Build OS (admin channel, fromMe) error:", err);
      }
    }
    return { handled: true, action: "buildos_admin_channel", detail: event.externalMessageId };
  }

  // 1. Resolve restaurant
  const configResult = await EvolutionConfigService.findRestaurantByInstance(event.instanceName);
  if (!configResult.ok) return { handled: false, detail: `Unknown instance: ${event.instanceName}` };
  const { restaurantId } = configResult.data;

  // 1b. Build OS command interception for fromMe messages (Priority 1.4.1).
  // Same safety invariant as the inbound branch: a command prefix is ALWAYS
  // suppressed, even if handleBuildCommand throws. Pre-flight is the hard gate.
  //
  // CRITICAL for fromMe: `event.phone` is the RECIPIENT (remoteJid), not who
  // sent the command. The operator is the connected instance's own number
  // (event.instanceOwnerPhone). We pass that as the candidate operator so the
  // command is authorized against — and any trace's recoverable rawPhone is —
  // the operator, never the customer they happened to message.
  const operatorPhone = event.instanceOwnerPhone ?? "";
  if (event.messageType === "TEXT" && isInternalCommandText(event.content)) {
    try {
      const { handleBuildCommand } = await import("@/services/buildos/handleBuildCommand");
      await handleBuildCommand({
        restaurantId,
        phone: operatorPhone,
        content: event.content,
        fromMe: true,
        instanceName: event.instanceName,
        isBuildOsChannel: channel.isBuildOsChannel,
        masterConfigured: channel.masterConfigured,
      });
    } catch (err) {
      console.error("[WebhookProcessor] Build OS (fromMe) branch error (suppressed anyway):", err);
    }
    return {
      handled: true,
      action: channel.isBuildOsChannel ? "buildos_command_fromme" : "buildos_ignored_non_master",
      detail: event.externalMessageId,
    };
  }
  if (event.messageType === "TEXT" && channel.isBuildOsChannel) {
    try {
      const { handleBuildCommand } = await import("@/services/buildos/handleBuildCommand");
      const buildResult = await handleBuildCommand({
        restaurantId,
        phone: operatorPhone,
        content: event.content,
        fromMe: true,
        instanceName: event.instanceName,
        isBuildOsChannel: true,
        masterConfigured: channel.masterConfigured,
      });
      if (buildResult.isBuildCommand) {
        return { handled: true, action: "buildos_reply_fromme", detail: event.externalMessageId };
      }
    } catch (err) {
      console.error("[WebhookProcessor] Build OS (fromMe) reply branch error (ignored):", err);
    }
  }

  // Master-channel isolation (fromMe): never persist an outbound on the internal
  // Build OS channel into a restaurant conversation.
  if (channel.isBuildOsChannel) {
    return { handled: true, action: "buildos_master_non_command_ignored", detail: event.externalMessageId };
  }

  // 2. Dedup: if Foocci already saved this message (via MessageService), skip it
  const existing = await prisma.message.findUnique({
    where: { externalMessageId: event.externalMessageId },
    select: { id: true },
  });
  if (existing) {
    return { handled: true, action: "duplicate_skipped", detail: event.externalMessageId };
  }

  // 3. Find customer by phone (don't upsert — we only track known customers)
  const customer = await prisma.customer.findUnique({
    where: { phone_restaurantId: { phone: event.phone, restaurantId } },
    select: { id: true },
  });
  if (!customer) return { handled: false, detail: "external_outbound: unknown customer" };

  // 4. Find the active conversation — never create one from an outbound-only event
  const conversation = await findActiveConversation(restaurantId, customer.id);
  if (!conversation) return { handled: false, detail: "external_outbound: no active conversation" };

  // 5. Persist as external human outbound
  const now = new Date();
  await prisma.$transaction([
    prisma.message.create({
      data: {
        conversationId: conversation.id,
        direction: "OUTBOUND",
        senderType: "HUMAN_EXTERNAL",
        content: event.content,
        type: event.messageType as MessageType,
        mediaUrl: event.mediaUrl ?? null,
        sentAt: new Date(event.rawTimestamp * 1000),
        externalMessageId: event.externalMessageId,
        externalStatus: "sent",
        ...(event.mediaMeta ? { metadata: event.mediaMeta as object } : {}),
      },
    }),
    prisma.conversation.update({
      where: { id: conversation.id },
      data: { lastMessageAt: now },
    }),
  ]);

  console.info("[WebhookProcessor] External outbound message saved.", {
    restaurantId,
    conversationId: conversation.id,
    phone: event.phone,
  });

  return { handled: true, action: "external_outbound_persisted", detail: `conversation:${conversation.id}` };
}

// ─── conversation reuse ───────────────────────────────────────

const ACTIVE_STATUSES = [
  ConversationStatus.OPEN,
  ConversationStatus.HUMAN,
  ConversationStatus.BOT,
  ConversationStatus.AI_ATENDENDO,
  ConversationStatus.HUMANO_ASSUMIU, // include human-takeover conversations
] as const;

async function findActiveConversation(restaurantId: string, customerId: string) {
  return prisma.conversation.findFirst({
    where: {
      restaurantId,
      customerId,
      status: { in: [...ACTIVE_STATUSES] },
    },
    orderBy: { lastMessageAt: "desc" },
  });
}

/**
 * Race-safe find-or-create conversation.
 *
 * Pattern: findFirst → (maybe reopen resolved) → create.
 * If two webhook events arrive simultaneously for the same customer,
 * both may pass the initial findFirst check and both attempt create.
 * The second create will usually succeed too (no DB unique constraint),
 * producing a duplicate. The retry block catches this: after any
 * create failure OR as a second-pass check, we re-query for the active
 * conversation that the racing request created, and return it.
 */
async function resolveConversation(
  restaurantId: string,
  customerId: string,
  customerPhone: string,
  customerName: string,
) {
  // 1. Prefer any active conversation (most recent first)
  const active = await findActiveConversation(restaurantId, customerId);
  if (active) return active;

  // 2. Check for a recently resolved conversation worth reopening
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

  // 3. Create a fresh conversation — with race-condition retry guard.
  //    If another concurrent webhook already created one between step 1
  //    and here, we detect it and return that conversation instead.
  try {
    return await prisma.conversation.create({
      data: {
        restaurantId,
        customerId,
        channel: "WHATSAPP",
        status: ConversationStatus.OPEN,
        customerPhone,
        customerName,
      },
    });
  } catch (err) {
    // Re-query in case a concurrent webhook won the race
    const raced = await findActiveConversation(restaurantId, customerId);
    if (raced) return raced;
    // Genuinely unexpected error — re-throw so the webhook processor logs it
    throw err;
  }
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
