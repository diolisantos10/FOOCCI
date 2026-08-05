/**
 * BuildOsMetaChannel — o Canal Master do Build OS num número DEDICADO da Meta.
 *
 * ── Por que este arquivo existe ──────────────────────────────────────────────
 * Até 04/08/2026 o Build OS só era dirigido por WhatsApp através do webhook da
 * Evolution: uma *instância* dedicada ("futi-admin"), pareada por QR, com
 * `instanceName` como identidade do canal. A Evolution saiu do Foocci por ordem
 * do CEO — e com ela saíram instância, QR e pareamento, que **não existem na
 * Meta**.
 *
 * A identidade do canal na Meta é o `phone_number_id`. Este módulo é o
 * equivalente exato do `SupportWhatsAppService`: um número que **não pertence a
 * nenhum restaurante**, com credencial própria, que recebe e responde comandos.
 *
 * ── Gated por construção ─────────────────────────────────────────────────────
 * Só liga quando `BUILDOS_META_PHONE_NUMBER_ID` **e** `BUILDOS_META_ACCESS_TOKEN`
 * estão configurados. Meio-configurado = desligado: sequestrar a mensagem sem
 * poder responder é pior que não sequestrar (o operador ficaria falando sozinho).
 *
 * ⚠️ Registrar o número dentro do aplicativo da Meta e emitir o token é trabalho
 * do especialista `meta` + decisão do CEO. Este módulo só usa a porta.
 *
 * 🔒 O token nunca é logado, nem mascarado, nem devolvido em resposta de API.
 */

import { metaGraphUrl } from "@/services/whatsapp/metaFlag";
import { buildMetaTextPayload, toMetaRecipient, maskGraphResponse } from "@/services/whatsapp/providers/metaPayload";

/** `phone_number_id` do número Master do Build OS (presença, nunca o segredo). */
export function buildOsPhoneNumberId(): string | null {
  const v = process.env.BUILDOS_META_PHONE_NUMBER_ID;
  return v && v.trim() ? v.trim() : null;
}

function buildOsAccessToken(): string | null {
  const v = process.env.BUILDOS_META_ACCESS_TOKEN;
  return v && v.trim() ? v.trim() : null;
}

/** O canal só está pronto quando número E token existem. */
export function isBuildOsMetaChannelEnabled(): boolean {
  return buildOsPhoneNumberId() !== null && buildOsAccessToken() !== null;
}

/**
 * Esta mensagem chegou no número Master do Build OS **e** o canal consegue
 * responder? Exige o canal inteiro ligado, pelo motivo do cabeçalho.
 */
export function isBuildOsPhoneNumberId(phoneNumberId: string | null | undefined): boolean {
  return isBuildOsMetaChannelEnabled() && phoneNumberId === buildOsPhoneNumberId();
}

/**
 * Estado do canal para telas de diagnóstico — **sem segredo**, só presença.
 * `configured` responde a única pergunta que importa: "dá para mandar /build
 * pelo WhatsApp agora?".
 */
export function describeBuildOsMetaChannel(): {
  configured:          boolean;
  phoneNumberIdSet:    boolean;
  accessTokenSet:      boolean;
  phoneNumberIdMasked: string | null;
} {
  const id = buildOsPhoneNumberId();
  return {
    configured:       isBuildOsMetaChannelEnabled(),
    phoneNumberIdSet: id !== null,
    accessTokenSet:   buildOsAccessToken() !== null,
    // phone_number_id não é segredo, mas também não precisa aparecer inteiro.
    phoneNumberIdMasked: id ? `…${id.slice(-4)}` : null,
  };
}

/**
 * Envia texto pelo número Master do Build OS. Devolve o motivo real da falha
 * (mascarado) em vez de um booleano mudo — guardrail 6: o alerta carrega a
 * própria evidência.
 */
export async function sendBuildOsMetaText(
  toPhone: string,
  text: string,
): Promise<{ ok: boolean; error?: string }> {
  const phoneNumberId = buildOsPhoneNumberId();
  const token         = buildOsAccessToken();
  if (!phoneNumberId || !token) return { ok: false, error: "canal Master do Build OS não configurado" };

  const recipient = toMetaRecipient(toPhone);
  if (!recipient) return { ok: false, error: "telefone inválido" };

  try {
    const res = await fetch(metaGraphUrl(`${phoneNumberId}/messages`), {
      method:  "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body:    JSON.stringify(buildMetaTextPayload(recipient, text)),
    });
    if (!res.ok) {
      const json: unknown = await res.json().catch(() => ({}));
      const err = (json as { error?: { message?: string } }).error ?? {};
      return { ok: false, error: maskGraphResponse(err.message ?? `HTTP_${res.status}`) };
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, error: maskGraphResponse(e instanceof Error ? e.message : String(e)) };
  }
}
