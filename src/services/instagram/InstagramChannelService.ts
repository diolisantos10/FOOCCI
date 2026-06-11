/**
 * InstagramChannelService — orchestrates inbound persistence and manual outbound
 * for the Instagram Direct channel, reusing the SAME Customer/Conversation/Message
 * central tables. No AI auto-reply in v1; no order, no Pix; idempotent by
 * externalMessageId; mode-gated sending.
 */

import { prisma } from "@/lib/prisma";
import type { Channel, MessageType } from "@prisma/client";
import {
  getInstagramConfig,
  resolveConfigByInstagramAccountId,
  decryptPageToken,
  recordWebhookReceived,
  recordWebhookError,
  type InstagramConfigRow,
} from "./InstagramConfigService";
import { normalizeInstagramPayload } from "./InstagramWebhookParser";
import { sendInstagramText } from "./InstagramSendClient";
import type { NormalizedInstagramMessage, InstagramSendResult } from "./types";

const IG: Channel = "INSTAGRAM_DIRECT";

export interface WebhookHandleResult {
  ok: boolean;
  resolved: boolean; // a config matched the account id
  restaurantId: string | null;
  persisted: number; // inbound messages persisted
  skippedDuplicates: number;
  skippedNonMessage: number; // echo/delivery/read/reaction/unsupported-without-text
  skippedNotAllowlisted: number;
  noRealInstagramSend: true;
  runtimeTouched: false;
}

/** Whether a sender is routed in, honoring scope + allowlist. */
function isSenderAllowed(config: InstagramConfigRow, senderId: string): boolean {
  if (config.scope === "RESTAURANT_WIDE") return true;
  return config.allowlistedExternalUserIds.includes(senderId);
}

/** Upserts the per-channel identity (and a lightweight Customer when missing). */
export async function upsertInstagramCustomerIdentity(
  config: InstagramConfigRow,
  msg: NormalizedInstagramMessage,
): Promise<{ customerId: string; identityId: string }> {
  const existing = await prisma.customerChannelIdentity.findUnique({
    where: { restaurantId_channel_externalUserId: { restaurantId: config.restaurantId, channel: IG, externalUserId: msg.senderId } },
  });

  let customerId = existing?.customerId ?? null;
  if (!customerId) {
    // No phone for Instagram — create a phone-less Customer linked via identity.
    const customer = await prisma.customer.create({
      data: {
        restaurantId: config.restaurantId,
        name: `Instagram ${msg.senderId.slice(-6)}`,
        phone: null,
        crmContactable: false, // no valid phone → excluded from WhatsApp campaigns
        contactStatus: "SEM_TELEFONE",
      },
      select: { id: true },
    });
    customerId = customer.id;
  }

  const identity = await prisma.customerChannelIdentity.upsert({
    where: { restaurantId_channel_externalUserId: { restaurantId: config.restaurantId, channel: IG, externalUserId: msg.senderId } },
    create: { restaurantId: config.restaurantId, customerId, channel: IG, externalUserId: msg.senderId },
    update: { customerId },
    select: { id: true },
  });

  return { customerId, identityId: identity.id };
}

/** Finds an open/recent Instagram conversation for this sender, or creates one. */
export async function findOrCreateConversation(
  config: InstagramConfigRow,
  customerId: string,
  senderId: string,
): Promise<string> {
  const existing = await prisma.conversation.findFirst({
    where: {
      restaurantId: config.restaurantId,
      channel: IG,
      customerId,
      status: { in: ["OPEN", "HUMAN", "HUMANO_ASSUMIU", "AI_ATENDENDO"] },
    },
    orderBy: { lastMessageAt: "desc" },
    select: { id: true },
  });
  if (existing) return existing.id;

  const conv = await prisma.conversation.create({
    data: {
      restaurantId: config.restaurantId,
      customerId,
      channel: IG,
      status: "OPEN",
      aiEnabled: false, // v1: manual only — AI never auto-replies on Instagram
      contextType: "INBOUND",
      customerName: `Instagram ${senderId.slice(-6)}`,
    },
    select: { id: true },
  });
  return conv.id;
}

function messageTypeFor(msg: NormalizedInstagramMessage): MessageType {
  if (msg.text) return "TEXT";
  const first = msg.attachments[0]?.type ?? "";
  if (first === "image") return "IMAGE";
  if (first === "audio") return "AUDIO";
  if (first === "video" || first === "file") return "DOCUMENT";
  return "TEXT";
}

function contentFor(msg: NormalizedInstagramMessage): string {
  if (msg.text) return msg.text;
  if (msg.attachments.length > 0) return `[anexo: ${msg.attachments.map(a => a.type).join(", ")}]`;
  return "[mensagem não suportada]";
}

/** Persists one inbound message idempotently. Returns false when it was a duplicate. */
export async function persistInboundMessage(
  config: InstagramConfigRow,
  conversationId: string,
  msg: NormalizedInstagramMessage,
): Promise<boolean> {
  const existing = await prisma.message.findUnique({ where: { externalMessageId: msg.messageId }, select: { id: true } });
  if (existing) return false;

  const now = new Date(msg.timestamp);
  await prisma.$transaction([
    prisma.message.create({
      data: {
        conversationId,
        direction: "INBOUND",
        senderType: "CUSTOMER",
        content: contentFor(msg),
        type: messageTypeFor(msg),
        mediaUrl: msg.attachments[0]?.url ?? null,
        sentAt: now,
        externalMessageId: msg.messageId,
        externalStatus: "delivered",
        metadata: { source: "INSTAGRAM_DIRECT", rawType: msg.rawType, attachments: msg.attachments } as object,
      },
    }),
    prisma.conversation.update({
      where: { id: conversationId },
      data: { lastMessageAt: now, unreadCount: { increment: 1 } },
    }),
  ]);
  return true;
}

/**
 * Handles a full webhook payload: resolve config, normalize, and persist allowed
 * inbound text/attachment messages. Never sends, never calls AI.
 */
export async function handleWebhookEvent(payload: unknown): Promise<WebhookHandleResult> {
  const base: WebhookHandleResult = {
    ok: true, resolved: false, restaurantId: null, persisted: 0,
    skippedDuplicates: 0, skippedNonMessage: 0, skippedNotAllowlisted: 0,
    noRealInstagramSend: true, runtimeTouched: false,
  };

  const messages = normalizeInstagramPayload(payload);
  if (messages.length === 0) return base;

  // All events in one payload share the account id.
  const accountId = messages.find(m => m.instagramAccountId)?.instagramAccountId ?? null;
  if (!accountId) return base;

  const config = await resolveConfigByInstagramAccountId(accountId);
  if (!config) return base; // unknown account — ignored (logged by caller)
  base.resolved = true;
  base.restaurantId = config.restaurantId;

  await recordWebhookReceived(config.restaurantId);

  // Paused or DISABLED/sub-RECEIVE modes still RECEIVE in v1 unless DISABLED.
  if (config.mode === "DISABLED" || config.paused) {
    return base;
  }

  for (const msg of messages) {
    if (msg.isEcho || msg.rawType === "delivery" || msg.rawType === "read" || msg.rawType === "reaction") {
      base.skippedNonMessage++;
      continue;
    }
    if (!msg.text && msg.attachments.length === 0) { base.skippedNonMessage++; continue; }
    if (!isSenderAllowed(config, msg.senderId)) { base.skippedNotAllowlisted++; continue; }

    try {
      const { customerId } = await upsertInstagramCustomerIdentity(config, msg);
      const conversationId = await findOrCreateConversation(config, customerId, msg.senderId);
      const persisted = await persistInboundMessage(config, conversationId, msg);
      if (persisted) base.persisted++;
      else base.skippedDuplicates++;
    } catch (err) {
      await recordWebhookError(config.restaurantId, err instanceof Error ? err.message : "erro ao persistir inbound");
    }
  }

  return base;
}

export interface ManualReplyResult {
  ok: boolean;
  send: InstagramSendResult;
  messageId: string | null; // persisted outbound message id (when stored)
  reason: string | null;
}

/**
 * Sends a manual operator reply, gated by mode:
 *   DISABLED / RECEIVE_ONLY → never sends (returns a clear reason).
 *   REPLY_ONLY / FULL       → attempts send (dry-run under tests / no token).
 * The outbound message is persisted to the central reflecting the real result.
 */
export async function sendManualReply(
  restaurantId: string,
  conversationId: string,
  externalUserId: string,
  text: string,
  opts: { dryRun?: boolean } = {},
): Promise<ManualReplyResult> {
  const config = await getInstagramConfig(restaurantId);
  if (!config) {
    return { ok: false, send: dryStub("Instagram não configurado para responder por aqui."), messageId: null, reason: "Instagram não configurado." };
  }
  if (config.mode === "DISABLED" || config.mode === "RECEIVE_ONLY") {
    return { ok: false, send: dryStub("Instagram conectado em modo somente recebimento."), messageId: null, reason: "Modo somente recebimento." };
  }

  const token = decryptPageToken(config);
  const send = await sendInstagramText({ recipientId: externalUserId, text, pageAccessToken: token, dryRun: opts.dryRun });

  // Persist outbound: stored as failed/pending when not really sent (central pattern).
  const now = new Date();
  const message = await prisma.message.create({
    data: {
      conversationId,
      direction: "OUTBOUND",
      senderType: "HUMAN",
      content: text,
      type: "TEXT",
      sentAt: now,
      externalMessageId: send.externalMessageId,
      externalStatus: send.sent ? "sent" : send.dryRun ? "pending" : "failed",
      errorMessage: send.error ?? undefined,
      metadata: { source: "INSTAGRAM_DIRECT", dryRun: send.dryRun } as object,
    },
    select: { id: true },
  });
  await prisma.conversation.update({ where: { id: conversationId }, data: { lastMessageAt: now } }).catch(() => undefined);

  return { ok: send.ok, send, messageId: message.id, reason: send.reason };
}

function dryStub(reason: string): InstagramSendResult {
  return { ok: false, sent: false, dryRun: true, externalMessageId: null, error: null, reason };
}
