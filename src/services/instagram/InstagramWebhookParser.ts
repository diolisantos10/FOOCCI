/**
 * InstagramWebhookParser / Normalizer — turns a Meta Instagram messaging webhook
 * payload into our channel-agnostic NormalizedInstagramMessage[]. Pure (no DB),
 * defensive (never throws on unexpected shapes), and PII-light (no raw payload
 * persisted from here).
 *
 * Meta payload shape (messaging):
 *   { object: "instagram", entry: [ { id: <igAccountId>, time, messaging: [
 *       { sender:{id}, recipient:{id}, timestamp,
 *         message?: { mid, text?, is_echo?, attachments?: [{type, payload:{url}}] },
 *         delivery?, read?, reaction? } ] } ] }
 */

import { createHmac, timingSafeEqual } from "crypto";
import type { NormalizedInstagramMessage, NormalizedAttachment } from "./types";

/**
 * Verifies Meta's `X-Hub-Signature-256: sha256=<hex>` over the RAW body using the
 * app secret. Returns true when no secret is configured (signature optional in v1
 * manual setup) OR when the signature matches. Never throws.
 */
export function verifyInstagramSignature(rawBody: string, signatureHeader: string | null, appSecret: string | null): boolean {
  if (!appSecret) return true; // not enforced when no app secret configured yet
  if (!signatureHeader) return false;
  const expected = "sha256=" + createHmac("sha256", appSecret).update(rawBody, "utf8").digest("hex");
  const a = Buffer.from(signatureHeader);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  try {
    return timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

/** The account id this payload targets (entry[].id) — used to resolve config. */
export function extractAccountId(payload: unknown): string | null {
  const entry = (payload as { entry?: unknown[] } | null)?.entry;
  if (!Array.isArray(entry) || entry.length === 0) return null;
  const id = (entry[0] as { id?: unknown })?.id;
  return typeof id === "string" ? id : null;
}

function parseAttachments(raw: unknown): NormalizedAttachment[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((a) => {
    const att = a as { type?: unknown; payload?: { url?: unknown } };
    return {
      type: typeof att.type === "string" ? att.type : "unknown",
      url: typeof att.payload?.url === "string" ? att.payload.url : undefined,
    };
  });
}

/**
 * Normalizes a full webhook payload into zero or more inbound messages.
 * Echo, delivery, read and reaction events are classified (so the caller can skip
 * them) and never produce a duplicate inbound message.
 */
export function normalizeInstagramPayload(payload: unknown): NormalizedInstagramMessage[] {
  const out: NormalizedInstagramMessage[] = [];
  const root = payload as { object?: string; entry?: unknown[] } | null;
  if (!root || !Array.isArray(root.entry)) return out;

  for (const entryRaw of root.entry) {
    const entry = entryRaw as { id?: string; messaging?: unknown[] };
    const accountId = typeof entry.id === "string" ? entry.id : null;
    const events = Array.isArray(entry.messaging) ? entry.messaging : [];

    for (const evRaw of events) {
      const ev = evRaw as {
        sender?: { id?: string }; recipient?: { id?: string }; timestamp?: number;
        message?: { mid?: string; text?: string; is_echo?: boolean; attachments?: unknown };
        delivery?: unknown; read?: unknown; reaction?: { mid?: string };
      };
      const senderId = ev.sender?.id;
      const recipientId = ev.recipient?.id ?? null;
      const timestamp = typeof ev.timestamp === "number" ? ev.timestamp : Date.now();

      // Non-message events — classified, no inbound persisted.
      if (ev.delivery) { out.push(stub("delivery", accountId, senderId, recipientId, timestamp)); continue; }
      if (ev.read) { out.push(stub("read", accountId, senderId, recipientId, timestamp)); continue; }
      if (ev.reaction) { out.push(stub("reaction", accountId, senderId, recipientId, timestamp, ev.reaction.mid)); continue; }

      const msg = ev.message;
      if (!msg || !senderId) continue; // unknown/unsupported event — ignored

      const attachments = parseAttachments(msg.attachments);
      const isEcho = msg.is_echo === true;
      const rawType: NormalizedInstagramMessage["rawType"] =
        isEcho ? "echo" : msg.text ? "text" : attachments.length > 0 ? "attachment" : "unsupported";

      out.push({
        channel: "INSTAGRAM_DIRECT",
        instagramAccountId: accountId,
        pageId: accountId,
        senderId,
        recipientId,
        messageId: typeof msg.mid === "string" ? msg.mid : `ig-${senderId}-${timestamp}`,
        text: typeof msg.text === "string" ? msg.text : null,
        attachments,
        timestamp,
        rawType,
        isEcho,
      });
    }
  }
  return out;
}

function stub(
  rawType: NormalizedInstagramMessage["rawType"],
  accountId: string | null,
  senderId: string | undefined,
  recipientId: string | null,
  timestamp: number,
  mid?: string,
): NormalizedInstagramMessage {
  return {
    channel: "INSTAGRAM_DIRECT",
    instagramAccountId: accountId,
    pageId: accountId,
    senderId: senderId ?? "unknown",
    recipientId,
    messageId: mid ?? `ig-${rawType}-${senderId ?? "x"}-${timestamp}`,
    text: null,
    attachments: [],
    timestamp,
    rawType,
    isEcho: rawType === "echo",
  };
}
