/**
 * Meta WhatsApp Cloud API — pure payload builders + result masking.
 *
 * No network, no DB — unit-testable. The MetaWhatsAppCloudProvider uses these to
 * POST /{PHONE_NUMBER_ID}/messages on the Graph API.
 *
 * Recipient phone: Graph API accepts an E.164 number; we send digits-only
 * (e.g. "5511999990000") produced by the SAME normalizador de telefone BR do projeto,
 * so phone handling stays consistent across providers.
 */

import { normalizePhoneBR, isValidPhoneBR } from "@/lib/crm/normalizePhone";

export interface MetaTextPayload {
  messaging_product: "whatsapp";
  recipient_type:    "individual";
  to:                string;
  type:              "text";
  text:              { body: string; preview_url: boolean };
}

export interface MetaTemplateComponentParameter {
  type:  "text";
  text:  string;
}
export interface MetaTemplateComponent {
  type:       "body" | "header" | "button";
  parameters: MetaTemplateComponentParameter[];
}
export interface MetaTemplatePayload {
  messaging_product: "whatsapp";
  recipient_type:    "individual";
  to:                string;
  type:              "template";
  template: {
    name:       string;
    language:   { code: string };
    components?: MetaTemplateComponent[];
  };
}

/** Normalizes a raw phone to Meta's recipient format (digits, E.164 w/o '+'). */
export function toMetaRecipient(rawPhone: string | null | undefined): string | null {
  const normalized = normalizePhoneBR(rawPhone ?? "");
  return normalized && isValidPhoneBR(normalized) ? normalized : null;
}

/** Builds a freeform text message payload (only valid inside the 24h window). */
export function buildMetaTextPayload(to: string, body: string): MetaTextPayload {
  return {
    messaging_product: "whatsapp",
    recipient_type:    "individual",
    to,
    type:              "text",
    text:              { body, preview_url: false },
  };
}

/** Builds an approved-template message payload (business-initiated / outside 24h). */
export function buildMetaTemplatePayload(
  to:        string,
  name:      string,
  language:  string,
  bodyParams: string[] = [],
): MetaTemplatePayload {
  const components: MetaTemplateComponent[] = bodyParams.length > 0
    ? [{ type: "body", parameters: bodyParams.map((text) => ({ type: "text", text })) }]
    : [];
  return {
    messaging_product: "whatsapp",
    recipient_type:    "individual",
    to,
    type:              "template",
    template: {
      name,
      language:   { code: language },
      ...(components.length > 0 ? { components } : {}),
    },
  };
}

export type MetaMediaType = "image" | "audio" | "video" | "document";

export interface MetaMediaPayload {
  messaging_product: "whatsapp";
  recipient_type:    "individual";
  to:                string;
  type:              MetaMediaType;
  image?:    { link: string; caption?: string };
  audio?:    { link: string };
  video?:    { link: string; caption?: string };
  document?: { link: string; caption?: string };
}

/** Builds a media message payload by URL ("link"). Audio carries no caption. */
export function buildMetaMediaPayload(
  to:        string,
  mediaType: MetaMediaType,
  mediaUrl:  string,
  caption?:  string,
): MetaMediaPayload {
  const base = { messaging_product: "whatsapp", recipient_type: "individual", to, type: mediaType } as const;
  if (mediaType === "audio") return { ...base, audio: { link: mediaUrl } };
  const media = caption ? { link: mediaUrl, caption } : { link: mediaUrl };
  if (mediaType === "image")    return { ...base, image: media };
  if (mediaType === "video")    return { ...base, video: media };
  return { ...base, document: media };
}

/** Extracts the provider message id from a Graph send response (if present). */
export function extractMetaMessageId(raw: unknown): string | null {
  const r = raw as { messages?: Array<{ id?: string }> } | null;
  return r?.messages?.[0]?.id ?? null;
}

/**
 * Masks a Graph API response/error for safe logging — strips any token-like fields
 * and truncates. NEVER log raw Graph bodies (they can echo headers/tokens).
 */
export function maskGraphResponse(raw: unknown): string {
  let s: string;
  try { s = typeof raw === "string" ? raw : JSON.stringify(raw); }
  catch { return "[unserializable]"; }
  // Redact anything that looks like a token / bearer / access_token value.
  s = s.replace(/(access_token"?\s*[:=]\s*"?)[A-Za-z0-9._-]+/gi, "$1***")
       .replace(/(Bearer\s+)[A-Za-z0-9._-]+/gi, "$1***")
       .replace(/EAA[A-Za-z0-9]{20,}/g, "EAA***"); // Meta long-lived tokens start with EAA
  return s.length > 500 ? s.slice(0, 500) + "…" : s;
}
