/**
 * Meta WhatsApp feature flag + app-level config (env). Disabled by default so the
 * integration ships dark; restaurants stay on Evolution until explicitly switched.
 *
 * App-level (one Foocci Meta app, Embedded Signup):
 *   META_WHATSAPP_ENABLED       — "true" to enable the Meta provider/UI
 *   META_APP_ID                 — Meta app id (Embedded Signup)
 *   META_APP_SECRET             — app secret (webhook signature + token exchange)
 *   META_CONFIG_ID              — Embedded Signup configuration id
 *   META_WEBHOOK_VERIFY_TOKEN   — app-level webhook verify token (GET challenge)
 *   META_GRAPH_VERSION          — Graph API version (default v21.0)
 */

export function isMetaWhatsAppEnabled(): boolean {
  return process.env.META_WHATSAPP_ENABLED === "true";
}

export const META_GRAPH_VERSION = process.env.META_GRAPH_VERSION || "v21.0";

export function metaAppId():             string | undefined { return process.env.META_APP_ID; }
export function metaAppSecret():         string | undefined { return process.env.META_APP_SECRET; }
export function metaConfigId():          string | undefined { return process.env.META_CONFIG_ID; }
export function metaWebhookVerifyToken(): string | undefined { return process.env.META_WEBHOOK_VERIFY_TOKEN; }

/**
 * Embedded Signup configuration id for the COEXISTENCE flow (Business App number →
 * Cloud API, keeping the number on the phone). Set META_COEXISTENCE_CONFIG_ID to a
 * config whose feature is "WhatsApp Business App Onboarding"; falls back to the
 * standard config id when unset.
 */
export function metaCoexistenceConfigId(): string | undefined {
  return process.env.META_COEXISTENCE_CONFIG_ID || process.env.META_CONFIG_ID;
}

export function metaGraphUrl(path: string): string {
  return `https://graph.facebook.com/${META_GRAPH_VERSION}/${path.replace(/^\//, "")}`;
}
