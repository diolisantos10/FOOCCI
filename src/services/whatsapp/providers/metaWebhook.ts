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
  timestamp:         Date;
  type:              string;    // normalized display type used by downstream routing
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

type RawSharedContact = {
  name?: {
    formatted_name?: string;
    first_name?: string;
    last_name?: string;
  };
  phones?: Array<{ phone?: string; wa_id?: string; type?: string }>;
  emails?: Array<{ email?: string; type?: string }>;
  org?: { company?: string; department?: string; title?: string };
};

type RawMessage = {
  from?: string; id?: string; timestamp?: string; type?: string;
  text?:     { body?: string };
  image?:    { id?: string; mime_type?: string; caption?: string };
  audio?:    { id?: string; mime_type?: string };
  video?:    { id?: string; mime_type?: string; caption?: string };
  document?: { id?: string; mime_type?: string; filename?: string; caption?: string };
  sticker?:  { id?: string; mime_type?: string; animated?: boolean };
  contacts?: RawSharedContact[];
  location?: { latitude?: number | string; longitude?: number | string; name?: string; address?: string };
  interactive?: {
    type?: string;
    button_reply?: { id?: string; title?: string };
    list_reply?: { id?: string; title?: string; description?: string };
  };
  button?: { text?: string; payload?: string };
  reaction?: { message_id?: string; emoji?: string };
};

interface RawValue {
  metadata?: { phone_number_id?: string; display_phone_number?: string };
  contacts?: Array<{ profile?: { name?: string }; wa_id?: string }>;
  messages?: RawMessage[];
  statuses?: Array<{ id?: string; status?: string; timestamp?: string; errors?: Array<{ code?: number | string }> }>;
}

function tsToDate(ts?: string): Date | null {
  if (!ts) return null;
  const n = Number(ts);
  return Number.isFinite(n) ? new Date(n * 1000) : null;
}

function textoLimpo(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const s = value.trim();
  return s || null;
}

function telefoneExibivel(value: unknown): string | null {
  const s = textoLimpo(value);
  if (!s) return null;
  const digits = s.replace(/\D/g, "");
  if (!digits) return s;
  return s.startsWith("+") ? s : `+${digits}`;
}

function descricaoDoContato(c: RawSharedContact): string {
  const partesDoNome = [textoLimpo(c.name?.first_name), textoLimpo(c.name?.last_name)]
    .filter((x): x is string => Boolean(x))
    .join(" ")
    .trim();
  const nome = textoLimpo(c.name?.formatted_name) ?? (partesDoNome || "Contato");
  const telefone = telefoneExibivel(c.phones?.[0]?.phone ?? c.phones?.[0]?.wa_id);
  const empresa = textoLimpo(c.org?.company);
  const cargo = textoLimpo(c.org?.title);
  const detalhes = [telefone, cargo, empresa].filter((x): x is string => Boolean(x));
  return detalhes.length ? `👤 ${nome} — ${detalhes.join(" — ")}` : `👤 ${nome}`;
}

/**
 * Structured WhatsApp messages are still human-readable conversation content.
 * Converting the known shapes here prevents the commercial inbox from showing
 * a generic "unsupported" bubble for things the seller can act on immediately.
 */
function extractStructuredText(m: RawMessage): string | null {
  const type = (m.type ?? "").toLowerCase();

  if (type === "contacts") {
    const contacts = m.contacts ?? [];
    if (contacts.length === 0) return "👤 Contato compartilhado";
    if (contacts.length === 1) return descricaoDoContato(contacts[0]!);
    const exibidos = contacts.slice(0, 8).map(descricaoDoContato);
    const restante = contacts.length - exibidos.length;
    return [`👥 ${contacts.length} contatos compartilhados`, ...exibidos, ...(restante > 0 ? [`… +${restante}`] : [])].join("\n");
  }

  if (type === "location") {
    const nome = textoLimpo(m.location?.name);
    const endereco = textoLimpo(m.location?.address);
    const detalhes = [nome, endereco].filter((x): x is string => Boolean(x));
    if (detalhes.length > 0) return `📍 ${detalhes.join(" — ")}`;
    const lat = m.location?.latitude;
    const lon = m.location?.longitude;
    if (lat != null && lon != null) return `📍 Localização compartilhada (${lat}, ${lon})`;
    return "📍 Localização compartilhada";
  }

  if (type === "interactive") {
    const button = m.interactive?.button_reply;
    const list = m.interactive?.list_reply;
    const buttonText = textoLimpo(button?.title) ?? textoLimpo(button?.id);
    if (buttonText) return buttonText;
    const listTitle = textoLimpo(list?.title) ?? textoLimpo(list?.id);
    const listDescription = textoLimpo(list?.description);
    if (listTitle && listDescription) return `${listTitle} — ${listDescription}`;
    return listTitle ?? "Resposta interativa recebida";
  }

  if (type === "button") {
    return textoLimpo(m.button?.text) ?? textoLimpo(m.button?.payload) ?? "Resposta de botão recebida";
  }

  if (type === "reaction") {
    const emoji = textoLimpo(m.reaction?.emoji);
    return emoji ? `Reagiu ${emoji}` : "Reação removida";
  }

  return null;
}

function displayType(rawType: string | undefined, structuredText: string | null): string {
  const type = (rawType ?? "unknown").toLowerCase();
  if (structuredText && ["contacts", "location", "interactive", "button", "reaction"].includes(type)) {
    return "text";
  }
  return rawType ?? "unknown";
}

/** Extracts the media descriptor from a raw inbound message (null for text/interactive). */
function extractMedia(m: RawMessage): NormalizedInboundMedia | null {
  const kinds: NormalizedInboundMedia["kind"][] = ["image", "video", "audio", "document", "sticker"];
  for (const kind of kinds) {
    const obj = m[kind] as { id?: string; mime_type?: string; caption?: string; filename?: string } | undefined;
    if (obj?.id) {
      return {
        id:       String(obj.id),
        mimeType: obj.mime_type ?? null,
        caption:  obj.caption ?? null,
        filename: obj.filename ?? null,
        // The commercial renderer already knows how to show images. A sticker is
        // an image payload from the same Meta media endpoint, so classify it as
        // image while preserving m.type="sticker" at the raw webhook boundary.
        kind:     kind === "sticker" ? "image" : kind,
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
        const structuredText = extractStructuredText(m);
        out.messages.push({
          providerMessageId: m.id,
          fromPhone:         m.from,
          phoneNumberId,
          timestamp:         tsToDate(m.timestamp) ?? new Date(),
          type:              displayType(m.type, structuredText),
          // Media captions and known structured messages are conversation content too.
          text:              m.text?.body ?? media?.caption ?? structuredText,
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
