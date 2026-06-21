/**
 * EvolutionWhatsAppProvider — wraps the EXISTING Evolution client/config so the
 * current behavior is preserved exactly. This is the default provider; the live
 * send paths continue to work unchanged whether or not they migrate to the
 * provider-agnostic service.
 */

import type { WhatsAppProvider, SendTextInput, SendMediaInput, SendResult, ConnectionStatus } from "./types";
import { EvolutionConfigService } from "@/services/evolution/EvolutionConfigService";
import { EvolutionClient, EvolutionApiError } from "@/lib/evolution/EvolutionClient";
import { normalizePhoneForEvolution, isValidEvolutionPhone } from "@/lib/crm/normalizePhone";

const PROVIDER = "EVOLUTION" as const;

export class EvolutionWhatsAppProvider implements WhatsAppProvider {
  readonly id = PROVIDER;

  async sendText(input: SendTextInput): Promise<SendResult> {
    const snap = await EvolutionConfigService.getSnapshot(input.restaurantId);
    if (!snap.ok) {
      return { ok: false, provider: PROVIDER, status: "FAILED", providerMessageId: null, error: "WhatsApp (Evolution) não configurado.", errorCode: "EVOLUTION_NOT_CONFIGURED", retryable: false };
    }
    const phone = normalizePhoneForEvolution(input.to);
    if (!phone || !isValidEvolutionPhone(phone)) {
      return { ok: false, provider: PROVIDER, status: "FAILED", providerMessageId: null, error: "Telefone inválido para envio.", errorCode: "INVALID_PHONE", retryable: false };
    }
    try {
      const res = await EvolutionClient.sendTextMessage(snap.data, phone, input.text);
      return { ok: true, provider: PROVIDER, status: "SENT", providerMessageId: res.key?.id ?? null };
    } catch (err) {
      const isEvo = err instanceof EvolutionApiError;
      const status = isEvo ? (err as EvolutionApiError).status : 0;
      return {
        ok: false, provider: PROVIDER, status: "FAILED", providerMessageId: null,
        error:     isEvo ? `HTTP ${status}` : (err instanceof Error ? err.message : "Erro desconhecido"),
        errorCode: isEvo ? `EVOLUTION_HTTP_${status}` : "ERROR",
        retryable: isEvo ? status >= 500 : true,
      };
    }
  }

  async sendMedia(input: SendMediaInput): Promise<SendResult> {
    if (input.mediaType === "video") {
      return { ok: false, provider: PROVIDER, status: "FAILED", providerMessageId: null, error: "Vídeo por URL não é suportado no Evolution.", errorCode: "EVOLUTION_VIDEO_UNSUPPORTED", retryable: false };
    }
    const snap = await EvolutionConfigService.getSnapshot(input.restaurantId);
    if (!snap.ok) {
      return { ok: false, provider: PROVIDER, status: "FAILED", providerMessageId: null, error: "WhatsApp (Evolution) não configurado.", errorCode: "EVOLUTION_NOT_CONFIGURED", retryable: false };
    }
    const phone = normalizePhoneForEvolution(input.to);
    if (!phone || !isValidEvolutionPhone(phone)) {
      return { ok: false, provider: PROVIDER, status: "FAILED", providerMessageId: null, error: "Telefone inválido para envio.", errorCode: "INVALID_PHONE", retryable: false };
    }
    try {
      const res = await EvolutionClient.sendMediaMessage(snap.data, phone, input.mediaType, input.mediaUrl, input.caption);
      return { ok: true, provider: PROVIDER, status: "SENT", providerMessageId: res.key?.id ?? null };
    } catch (err) {
      const isEvo = err instanceof EvolutionApiError;
      const status = isEvo ? (err as EvolutionApiError).status : 0;
      return {
        ok: false, provider: PROVIDER, status: "FAILED", providerMessageId: null,
        error:     isEvo ? `HTTP ${status}` : (err instanceof Error ? err.message : "Erro desconhecido"),
        errorCode: isEvo ? `EVOLUTION_HTTP_${status}` : "ERROR",
        retryable: isEvo ? status >= 500 : true,
      };
    }
  }

  async getConnectionStatus(restaurantId: string): Promise<ConnectionStatus> {
    const snap = await EvolutionConfigService.getSnapshot(restaurantId);
    if (!snap.ok) return { provider: PROVIDER, connected: false, detail: "não configurado" };
    try {
      const st = await EvolutionClient.getInstanceStatus(snap.data);
      return { provider: PROVIDER, connected: st.state === "open", detail: st.state };
    } catch {
      return { provider: PROVIDER, connected: false, detail: "erro de conexão" };
    }
  }

  async healthCheck(restaurantId: string): Promise<ConnectionStatus> {
    return this.getConnectionStatus(restaurantId);
  }
}
