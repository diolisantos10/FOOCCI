/**
 * MetaWhatsAppCloudProvider — official Meta WhatsApp Business Platform / Cloud API.
 *
 * Sends via POST graph.facebook.com/{PHONE_NUMBER_ID}/messages with a Bearer token.
 * The token is decrypted server-side only and never logged (responses are masked).
 */

import type {
  WhatsAppProvider, SendTextInput, SendTemplateInput, SendMediaInput, SendResult,
  ConnectionStatus, WebhookValidationResult, NormalizedWebhookResult,
} from "./types";
import { MetaConfigService, type MetaConfigResolved } from "../MetaConfigService";
import { metaGraphUrl, metaAppSecret } from "../metaFlag";
import {
  buildMetaTextPayload, buildMetaTemplatePayload, buildMetaMediaPayload, toMetaRecipient,
  extractMetaMessageId, maskGraphResponse,
} from "./metaPayload";
import { validateMetaSignature, normalizeMetaWebhook } from "./metaWebhook";

const PROVIDER = "META_CLOUD_API" as const;

function fail(error: string, errorCode: string, retryable = false): SendResult {
  return { ok: false, provider: PROVIDER, status: "FAILED", providerMessageId: null, error, errorCode, retryable };
}

export class MetaWhatsAppCloudProvider implements WhatsAppProvider {
  readonly id = PROVIDER;

  async sendText(input: SendTextInput): Promise<SendResult> {
    const cfg = await MetaConfigService.getResolved(input.restaurantId);
    if (!cfg) return fail("WhatsApp Meta não conectado.", "META_NOT_CONNECTED");
    const recipient = toMetaRecipient(input.to);
    if (!recipient) return fail("Telefone inválido para envio.", "INVALID_PHONE");
    return this.post(cfg, buildMetaTextPayload(recipient, input.text));
  }

  async sendTemplate(input: SendTemplateInput): Promise<SendResult> {
    const cfg = await MetaConfigService.getResolved(input.restaurantId);
    if (!cfg) return fail("WhatsApp Meta não conectado.", "META_NOT_CONNECTED");
    const recipient = toMetaRecipient(input.to);
    if (!recipient) return fail("Telefone inválido para envio.", "INVALID_PHONE");
    return this.post(cfg, buildMetaTemplatePayload(recipient, input.templateName, input.language, input.bodyParams ?? []));
  }

  async sendMedia(input: SendMediaInput): Promise<SendResult> {
    const cfg = await MetaConfigService.getResolved(input.restaurantId);
    if (!cfg) return fail("WhatsApp Meta não conectado.", "META_NOT_CONNECTED");
    const recipient = toMetaRecipient(input.to);
    if (!recipient) return fail("Telefone inválido para envio.", "INVALID_PHONE");
    return this.post(cfg, buildMetaMediaPayload(recipient, input.mediaType, input.mediaUrl, input.caption));
  }

  /** Validates X-Hub-Signature-256 against the app secret (provider-neutral entry). */
  validateWebhook(rawBody: string, headers: Record<string, string | null>): WebhookValidationResult {
    const sig = headers["x-hub-signature-256"] ?? headers["X-Hub-Signature-256"] ?? null;
    const secret = metaAppSecret();
    if (!secret) return { valid: false, reason: "META_APP_SECRET_MISSING" };
    return validateMetaSignature(rawBody, sig, secret)
      ? { valid: true }
      : { valid: false, reason: "INVALID_SIGNATURE" };
  }

  normalizeIncomingWebhook(payload: unknown): NormalizedWebhookResult {
    const n = normalizeMetaWebhook(payload);
    return { provider: PROVIDER, channelIds: n.phoneNumberIds, messages: n.messages, statuses: n.statuses };
  }

  private async post(cfg: MetaConfigResolved, payload: object): Promise<SendResult> {
    try {
      const res = await fetch(metaGraphUrl(`${cfg.phoneNumberId}/messages`), {
        method:  "POST",
        headers: { Authorization: `Bearer ${cfg.accessToken}`, "Content-Type": "application/json" },
        body:    JSON.stringify(payload),
      });
      const json: unknown = await res.json().catch(() => ({}));
      if (!res.ok) {
        const err = (json as { error?: { message?: string; code?: number } }).error ?? {};
        return {
          ok: false, provider: PROVIDER, status: "FAILED", providerMessageId: null,
          error:     maskGraphResponse(err.message ?? json),
          errorCode: err.code != null ? `META_${err.code}` : `HTTP_${res.status}`,
          retryable: res.status >= 500 || res.status === 429,
        };
      }
      return { ok: true, provider: PROVIDER, status: "SENT", providerMessageId: extractMetaMessageId(json) };
    } catch (e) {
      return fail(maskGraphResponse(e instanceof Error ? e.message : String(e)), "NETWORK", true);
    }
  }

  async getConnectionStatus(restaurantId: string): Promise<ConnectionStatus> {
    const cfg = await MetaConfigService.getResolved(restaurantId);
    return {
      provider:  PROVIDER,
      connected: !!cfg && cfg.connectionStatus === "CONNECTED",
      detail:    cfg?.displayPhoneNumber ?? null,
    };
  }

  /** Verifies the token works by reading the phone-number node (no message sent). */
  async healthCheck(restaurantId: string): Promise<ConnectionStatus> {
    const cfg = await MetaConfigService.getResolved(restaurantId);
    if (!cfg) return { provider: PROVIDER, connected: false, detail: "não conectado" };
    try {
      const res = await fetch(
        metaGraphUrl(`${cfg.phoneNumberId}?fields=display_phone_number,quality_rating`),
        { headers: { Authorization: `Bearer ${cfg.accessToken}` } },
      );
      const json: unknown = await res.json().catch(() => ({}));
      if (!res.ok) {
        const err = (json as { error?: { message?: string } }).error ?? {};
        await MetaConfigService.setHealth(restaurantId, { connectionStatus: "ERROR", lastError: maskGraphResponse(err.message ?? json) });
        return { provider: PROVIDER, connected: false, detail: "falha na verificação" };
      }
      const data = json as { display_phone_number?: string; quality_rating?: string };
      await MetaConfigService.setHealth(restaurantId, {
        connectionStatus: "CONNECTED",
        lastError:        null,
        qualityRating:    data.quality_rating ?? null,
      });
      return { provider: PROVIDER, connected: true, detail: data.display_phone_number ?? cfg.displayPhoneNumber };
    } catch (e) {
      await MetaConfigService.setHealth(restaurantId, { connectionStatus: "ERROR", lastError: maskGraphResponse(e instanceof Error ? e.message : String(e)) });
      return { provider: PROVIDER, connected: false, detail: "erro de rede" };
    }
  }
}
