/**
 * Meta WhatsApp Cloud API — pure webhook helpers (verification, signature,
 * normalization). No DB, no network — unit-testable. The route persists the
 * normalized result.
 *
 * Official payload shape (object="whatsapp_business_account"):
 *   entry[].changes[].value.metadata.phone_number_id  → maps to a restaurant
 *   entry[].changes[].value.messages[]                → inbound customer messages
 *   entry[].changes[].value.statuses[]                → delivery status for outbound
 *   entry[].changes[].value.contacts[]               → profile name / wa_id
 */

import { createHmac, timingSafeEqual } from "crypto";

// ── GET verification challenge ────────────────────────────────────────────────

export interface MetaVerifyParams {
  mode:      string | null; // hub.mode
  token:     string | null; // hub.verify_token
  challenge: string | null; // hub.challenge
}

/** Returns the challenge to echo back when the verify token matches, else null. */
export function verifyMetaChallenge(params: MetaVerifyParams, expectedToken: string | undefined | null): string | null {
  if (!expectedToken) return null;
  if (params.mode === "subscribe" && params.token === expectedToken && params.challenge != null) {
    return params.challenge;
  }
  return null;
}

// ── POST signature (X-Hub-Signature-256) ──────────────────────────────────────

/** Validates the `sha256=<hex>` HMAC of the raw body using the app secret. */
export function validateMetaSignature(
  rawBody:         string,
  signatureHeader: string | null | undefined,
  appSecret:       string | undefined | null,
): boolean {
  if (!appSecret || !signatureHeader) return false;
  const expected = signatureHeader.startsWith("sha256=") ? signatureHeader.slice(7) : signatureHeader;
  const computed = createHmac("sha256", appSecret).update(rawBody, "utf8").digest("hex");
  if (expected.length !== computed.length) return false;
  try {
    return timingSafeEqual(Buffer.from(expected, "hex"), Buffer.from(computed, "hex"));
  } catch {
    return false;
  }
}

// ── Normalization ─────────────────────────────────────────────────────────────

export interface NormalizedInboundMedia {
  id:       string;                 // Meta media id — download via Graph /{id}
  mimeType: string | null;
  caption:  string | null;
  filename: string | null;
  kind:     "image" | "audio" | "video" | "document" | "sticker";
}

export interface NormalizedInboundMessage {
  providerMessageId: string;   // wamid... — dedupe key
  fromPhone:         string;    // customer wa_id (digits)
  phoneNumberId:     string;    // Meta phone_number_id → restaurant mapping
  /**
   * Número legível DO NEGÓCIO (`value.metadata.display_phone_number`) — não o do
   * cliente. Só serve quando o `phoneNumberId` NÃO resolve nenhum restaurante: é a
   * única coisa no payload que diz, em português, QUAL número ficou órfão. Um id da
   * Graph não ajuda ninguém a reconhecer o próprio número.
   */
  displayPhoneNumber: string | null;
  timestamp:         Date;
  type:              string;    // text | image | interactive | ...
  text:              string | null;
  profileName:       string | null;
  media:             NormalizedInboundMedia | null; // set for image/audio/video/document/sticker
}

export interface NormalizedStatus {
  providerMessageId: string;   // wamid... of an OUTBOUND message
  status:            string;    // sent | delivered | read | failed
  timestamp:         Date | null;
  errorCode:         string | null;
}

export interface NormalizedMetaWebhook {
  phoneNumberIds: string[];                  // all phone_number_ids seen
  messages:       NormalizedInboundMessage[];
  statuses:       NormalizedStatus[];
}

interface RawValue {
  metadata?: { phone_number_id?: string; display_phone_number?: string };
  contacts?: Array<{ profile?: { name?: string }; wa_id?: string }>;
  messages?: Array<{
    from?: string; id?: string; timestamp?: string; type?: string;
    text?:     { body?: string };
    image?:    { id?: string; mime_type?: string; caption?: string };
    audio?:    { id?: string; mime_type?: string };
    video?:    { id?: string; mime_type?: string; caption?: string };
    document?: { id?: string; mime_type?: string; filename?: string; caption?: string };
    sticker?:  { id?: string; mime_type?: string };
  }>;
  statuses?: Array<{ id?: string; status?: string; timestamp?: string; errors?: Array<{ code?: number | string }> }>;
}

function tsToDate(ts?: string): Date | null {
  if (!ts) return null;
  const n = Number(ts);
  return Number.isFinite(n) ? new Date(n * 1000) : null;
}

/** Extracts the media descriptor from a raw inbound message (null for text/interactive). */
function extractMedia(m: NonNullable<RawValue["messages"]>[number]): NormalizedInboundMedia | null {
  const kinds: NormalizedInboundMedia["kind"][] = ["image", "video", "audio", "document", "sticker"];
  for (const kind of kinds) {
    const obj = m[kind] as { id?: string; mime_type?: string; caption?: string; filename?: string } | undefined;
    if (obj?.id) {
      return {
        id:       String(obj.id),
        mimeType: obj.mime_type ?? null,
        caption:  obj.caption ?? null,
        filename: obj.filename ?? null,
        kind,
      };
    }
  }
  return null;
}

/** Normalizes a Meta webhook body into the internal inbound/status shape. */
export function normalizeMetaWebhook(payload: unknown): NormalizedMetaWebhook {
  const out: NormalizedMetaWebhook = { phoneNumberIds: [], messages: [], statuses: [] };
  const body = payload as { object?: string; entry?: Array<{ changes?: Array<{ value?: RawValue }> }> };
  if (!body?.entry || !Array.isArray(body.entry)) return out;

  const seenPhoneIds = new Set<string>();

  for (const entry of body.entry) {
    for (const change of entry.changes ?? []) {
      const value = change.value;
      if (!value) continue;

      const phoneNumberId = value.metadata?.phone_number_id ?? "";
      if (phoneNumberId && !seenPhoneIds.has(phoneNumberId)) {
        seenPhoneIds.add(phoneNumberId);
        out.phoneNumberIds.push(phoneNumberId);
      }

      const profileByWaId = new Map<string, string>();
      for (const c of value.contacts ?? []) {
        if (c.wa_id && c.profile?.name) profileByWaId.set(c.wa_id, c.profile.name);
      }

      for (const m of value.messages ?? []) {
        if (!m.id || !m.from) continue;
        const media = extractMedia(m);
        out.messages.push({
          providerMessageId: m.id,
          fromPhone:         m.from,
          phoneNumberId,
          displayPhoneNumber: value.metadata?.display_phone_number ?? null,
          timestamp:         tsToDate(m.timestamp) ?? new Date(),
          type:              m.type ?? "unknown",
          // Media captions carry the customer's text — surface it as the message body.
          text:              m.text?.body ?? media?.caption ?? null,
          profileName:       profileByWaId.get(m.from) ?? null,
          media,
        });
      }

      for (const s of value.statuses ?? []) {
        if (!s.id || !s.status) continue;
        out.statuses.push({
          providerMessageId: s.id,
          status:            s.status,
          timestamp:         tsToDate(s.timestamp),
          errorCode:         s.errors?.[0]?.code != null ? String(s.errors[0].code) : null,
        });
      }
    }
  }

  return out;
}
