/**
 * WebhookParserService
 *
 * Pure transformation layer — no DB access, no side effects.
 * Converts raw Evolution API webhook payloads into typed internal events.
 *
 * Evolution API webhook docs:
 *   https://doc.evolution-api.com/webhooks/events
 *
 * Handled event types:
 *   - messages.upsert   → inbound customer message or outbound status echo
 *   - messages.update   → delivery / read receipt update
 *   - connection.update → instance connection state change
 */

export type ParsedEventType =
  | "inbound_message"
  | "external_outbound_message"
  | "message_status_update"
  | "connection_update"
  | "ignored";

export interface InboundMessageEvent {
  type: "inbound_message";
  instanceName: string;
  externalMessageId: string;      // Evolution/WhatsApp message ID
  fromJid: string;                // e.g. "5511999990000@s.whatsapp.net"
  phone: string;                  // normalized E.164: "+5511999990000"
  senderName?: string;            // WhatsApp pushName (contact display name)
  messageType: "TEXT" | "IMAGE" | "AUDIO" | "DOCUMENT";
  content: string;                // text body or caption
  mediaUrl?: string;
  rawTimestamp: number;           // unix seconds from Evolution
}

export interface MessageStatusUpdateEvent {
  type: "message_status_update";
  instanceName: string;
  externalMessageId: string;
  status: "sent" | "delivered" | "read" | "failed";
}

export interface ConnectionUpdateEvent {
  type: "connection_update";
  instanceName: string;
  state: "open" | "close" | "connecting";
}

/** Staff sent a message from WhatsApp Web / mobile (fromMe=true, not sent by Foocci). */
export interface ExternalOutboundMessageEvent {
  type: "external_outbound_message";
  instanceName: string;
  externalMessageId: string;
  phone: string;                 // customer's phone (from remoteJid)
  messageType: "TEXT" | "IMAGE" | "AUDIO" | "DOCUMENT";
  content: string;
  mediaUrl?: string;
  rawTimestamp: number;
}

export interface IgnoredEvent {
  type: "ignored";
  reason: string;
}

export type ParsedEvent =
  | InboundMessageEvent
  | ExternalOutboundMessageEvent
  | MessageStatusUpdateEvent
  | ConnectionUpdateEvent
  | IgnoredEvent;

// ─── internal type maps ──────────────────────────────────────

const STATUS_MAP: Record<string, MessageStatusUpdateEvent["status"]> = {
  DELIVERY_ACK: "delivered",
  READ: "read",
  PLAYED: "read",
  ERROR: "failed",
};

// ─── parser ──────────────────────────────────────────────────

export class WebhookParserService {
  static parse(payload: unknown): ParsedEvent {
    if (!payload || typeof payload !== "object") {
      return { type: "ignored", reason: "Empty or non-object payload" };
    }

    const raw = payload as Record<string, unknown>;
    const event = raw.event as string | undefined;
    const instance = (raw.instance as string | undefined) ?? "";

    if (!event) {
      return { type: "ignored", reason: "Missing event field" };
    }

    switch (event) {
      case "messages.upsert":
        return parseMessageUpsert(instance, raw);

      case "messages.update":
        return parseMessageUpdate(instance, raw);

      case "connection.update":
        return parseConnectionUpdate(instance, raw);

      default:
        return { type: "ignored", reason: `Unhandled event type: ${event}` };
    }
  }
}

// ─── event-specific parsers ──────────────────────────────────

function parseMessageUpsert(instance: string, raw: Record<string, unknown>): ParsedEvent {
  const data = raw.data as Record<string, unknown> | undefined;
  if (!data) return { type: "ignored", reason: "messages.upsert: missing data" };

  const key = data.key as Record<string, unknown> | undefined;
  if (!key) return { type: "ignored", reason: "messages.upsert: missing key" };

  const externalMessageId = key.id as string | undefined;
  const fromMe = key.fromMe as boolean | undefined;
  const remoteJid = key.remoteJid as string | undefined;

  if (!externalMessageId || !remoteJid) {
    return { type: "ignored", reason: "messages.upsert: missing key.id or remoteJid" };
  }

  // Skip group chats and status broadcasts
  if (remoteJid.endsWith("@g.us") || remoteJid === "status@broadcast") {
    return { type: "ignored", reason: `Skipping non-DM jid: ${remoteJid}` };
  }

  const phone = jidToPhone(remoteJid);
  const senderName = (data.pushName as string | undefined) || undefined;
  const message = data.message as Record<string, unknown> | undefined;
  const timestamp = (data.messageTimestamp as number | undefined) ?? Math.floor(Date.now() / 1000);

  let messageType: InboundMessageEvent["messageType"] = "TEXT";
  let content = "";
  let mediaUrl: string | undefined;

  if (message) {
    if (message.conversation) {
      content = message.conversation as string;
    } else if (message.extendedTextMessage) {
      const ext = message.extendedTextMessage as Record<string, unknown>;
      content = (ext.text as string) ?? "";
    } else if (message.imageMessage) {
      messageType = "IMAGE";
      const img = message.imageMessage as Record<string, unknown>;
      content = (img.caption as string) ?? "";
      mediaUrl = (img.url as string) ?? undefined;
    } else if (message.audioMessage) {
      messageType = "AUDIO";
      const aud = message.audioMessage as Record<string, unknown>;
      content = "[Áudio]";
      mediaUrl = (aud.url as string) ?? undefined;
    } else if (message.documentMessage) {
      messageType = "DOCUMENT";
      const doc = message.documentMessage as Record<string, unknown>;
      content = (doc.fileName as string) ?? "[Documento]";
      mediaUrl = (doc.url as string) ?? undefined;
    } else {
      // Unknown message type — store as text placeholder
      content = "[Mensagem não suportada]";
    }
  }

  // fromMe=true: message sent FROM the restaurant WhatsApp number.
  // Could be Foocci itself (already persisted via MessageService) or an external
  // staff member using WhatsApp Web / mobile. The processor handles dedup.
  if (fromMe) {
    return {
      type: "external_outbound_message",
      instanceName: instance,
      externalMessageId,
      phone,              // customer's phone (recipient)
      messageType,
      content,
      mediaUrl,
      rawTimestamp: timestamp,
    };
  }

  return {
    type: "inbound_message",
    instanceName: instance,
    externalMessageId,
    fromJid: remoteJid,
    phone,
    senderName,
    messageType,
    content,
    mediaUrl,
    rawTimestamp: timestamp,
  };
}

function parseMessageUpdate(instance: string, raw: Record<string, unknown>): ParsedEvent {
  // Evolution sends updates as an array in data
  const data = raw.data as Array<Record<string, unknown>> | Record<string, unknown> | undefined;
  const first = Array.isArray(data) ? data[0] : data;

  if (!first) return { type: "ignored", reason: "messages.update: empty data" };

  const key = first.key as Record<string, unknown> | undefined;
  const externalMessageId = key?.id as string | undefined;
  const rawStatus = first.update as Record<string, unknown> | undefined;
  const statusStr = (rawStatus?.status ?? first.status) as string | undefined;

  if (!externalMessageId || !statusStr) {
    return { type: "ignored", reason: "messages.update: missing id or status" };
  }

  const status = STATUS_MAP[statusStr];
  if (!status) {
    return { type: "ignored", reason: `messages.update: unknown status ${statusStr}` };
  }

  return {
    type: "message_status_update",
    instanceName: instance,
    externalMessageId,
    status,
  };
}

function parseConnectionUpdate(instance: string, raw: Record<string, unknown>): ParsedEvent {
  const data = raw.data as Record<string, unknown> | undefined;
  const state = ((data?.state as string) ?? "").toLowerCase();

  const validState = (["open", "close", "connecting"] as const).find((s) => s === state);
  if (!validState) {
    return { type: "ignored", reason: `connection.update: unknown state ${state}` };
  }

  return {
    type: "connection_update",
    instanceName: instance,
    state: validState,
  };
}

// ─── utility ─────────────────────────────────────────────────

/**
 * Convert a WhatsApp JID to an E.164 phone number.
 * "5511999990000@s.whatsapp.net" → "+5511999990000"
 */
function jidToPhone(jid: string): string {
  const numberPart = jid.split("@")[0];
  // Remove the extra 9 that some Brazilian numbers include in JID but not E.164
  return `+${numberPart}`;
}
