/**
 * FoocciSalesChannel — o número de VENDAS da Foocci. A porta do SDR.
 *
 * ── O buraco que este arquivo tapa ───────────────────────────────────────────
 * Todo envio de WhatsApp do Foocci é **por restaurante**: o provedor busca a
 * credencial pelo `restaurantId`. A Foocci vendendo o Foocci não tem restaurante.
 * Antes daqui existiam exatamente dois números sem dono — o do suporte técnico e
 * o Master do Build OS — e usar qualquer um deles para vender misturaria prospecto
 * com comando de sistema. `docs/sdr-foocci-desenho.md` já dizia: *"não é opção"*.
 *
 * Este é o terceiro número sem restaurante, e o primeiro que existe para falar
 * com quem ainda não é cliente. Por isso ele nasce com mais travas, não menos.
 *
 * ── DESLIGADO POR CONSTRUÇÃO, em três chaves independentes ───────────────────
 *   1. `FOOCCI_SALES_PHONE_NUMBER_ID` + `FOOCCI_SALES_ACCESS_TOKEN` ausentes →
 *      o canal não existe: não recebe e não envia.
 *   2. `FOOCCI_SDR_SEND_ENABLED` ≠ "true" → RECEBE (a conversa entra e fica
 *      registrada) mas NÃO ENVIA. É este o estado de hoje, e é deliberado: a
 *      escada de liberação do Cérebro exige evidência antes da primeira mensagem.
 *   3. Nenhum envio acontece sem uma decisão APROVADA do portão de lead — e a
 *      decisão é o primeiro parâmetro da função, não uma checagem que alguém
 *      pode esquecer de fazer. Guardrail 4: prompt é aviso, código é trava.
 *
 * Meio-configurado é desligado, como no resto da casa: sequestrar a mensagem sem
 * poder responder deixaria o lead falando sozinho.
 *
 * ── A COSTURA DO PROVEDOR — por que ela existe e o que ela NÃO é ─────────────
 * Hoje o Foocci tem **um** provedor: a Meta homologada (a Evolution saiu em
 * 04/08/2026 por ordem do CEO — ver `src/services/whatsapp/activeProvider.ts`).
 * `resolverProvedorDeVendas()` existe para que a escolha do canal do SDR seja
 * **uma variável de ambiente**, e para que um provedor não previsto **falhe
 * declarando**, em vez de cair silenciosamente na Meta.
 *
 * Isto NÃO é a Evolution voltando. É a diferença entre trocar de canal amanhã
 * mexendo num arquivo e ter que caçar o envio espalhado por dez chamadas.
 *
 * 🔒 O token nunca é logado, nem mascarado, nem devolvido em resposta de API.
 */

import { metaGraphUrl } from "@/services/whatsapp/metaFlag";
import { buildMetaTextPayload, toMetaRecipient, maskGraphResponse } from "@/services/whatsapp/providers/metaPayload";
import type { LeadSafetyDecision } from "./LeadContactSafety";

// ─── Identidade do canal ────────────────────────────────────────────────────────

/**
 * Provedores que este canal sabe operar.
 *
 * `NAO_SUPORTADO` não é um erro de digitação — é a resposta honesta para um valor
 * que ninguém implementou. O que ele evita é a falha mais cara que já aconteceu
 * neste repositório: um `else` tratado como sucesso.
 */
export type ProvedorDeVendas = "META_CLOUD_API" | "NAO_SUPORTADO";

export function resolverProvedorDeVendas(): ProvedorDeVendas {
  const v = (process.env.FOOCCI_SALES_PROVIDER ?? "META_CLOUD_API").trim().toUpperCase();
  return v === "META_CLOUD_API" ? "META_CLOUD_API" : "NAO_SUPORTADO";
}

/** `phone_number_id` do número de vendas (presença, nunca o segredo). */
export function foocciSalesPhoneNumberId(): string | null {
  const v = process.env.FOOCCI_SALES_PHONE_NUMBER_ID;
  return v && v.trim() ? v.trim() : null;
}

function foocciSalesAccessToken(): string | null {
  const v = process.env.FOOCCI_SALES_ACCESS_TOKEN;
  return v && v.trim() ? v.trim() : null;
}

/** O canal existe? (recebe e, se autorizado, envia). */
export function isFoocciSalesChannelConfigured(): boolean {
  return (
    resolverProvedorDeVendas() === "META_CLOUD_API" &&
    foocciSalesPhoneNumberId() !== null &&
    foocciSalesAccessToken() !== null
  );
}

/**
 * A CHAVE DO ENVIO, separada da chave do canal — e a separação é o ponto.
 *
 * Receber é seguro: a mensagem já chegou, e não registrá-la só perde informação.
 * Enviar é o que fala em nome da empresa com um estranho. Por isso "estar
 * configurado" nunca liga o envio sozinho; é preciso dizer sim de novo, aqui.
 */
export function isFoocciSdrSendEnabled(): boolean {
  return (process.env.FOOCCI_SDR_SEND_ENABLED ?? "").trim().toLowerCase() === "true";
}

/** Pronto para ENVIAR = canal configurado **e** envio autorizado. */
export function canalDeVendasPronto(): boolean {
  return isFoocciSalesChannelConfigured() && isFoocciSdrSendEnabled();
}

/**
 * Esta mensagem chegou no número de vendas da Foocci?
 *
 * Com o canal desligado devolve sempre `false` — e é assim que o webhook do
 * WhatsApp continua se comportando exatamente como hoje enquanto ninguém
 * configurar nada. Aditivo, risco zero.
 */
export function isFoocciSalesPhoneNumberId(phoneNumberId: string | null | undefined): boolean {
  return isFoocciSalesChannelConfigured() && phoneNumberId === foocciSalesPhoneNumberId();
}

/** Estado do canal para tela de diagnóstico — sem segredo, só presença. */
export function describeFoocciSalesChannel(): {
  provedor: ProvedorDeVendas;
  configurado: boolean;
  envioLigado: boolean;
  phoneNumberIdSet: boolean;
  accessTokenSet: boolean;
  phoneNumberIdMasked: string | null;
} {
  const id = foocciSalesPhoneNumberId();
  return {
    provedor: resolverProvedorDeVendas(),
    configurado: isFoocciSalesChannelConfigured(),
    envioLigado: canalDeVendasPronto(),
    phoneNumberIdSet: id !== null,
    accessTokenSet: foocciSalesAccessToken() !== null,
    phoneNumberIdMasked: id ? `…${id.slice(-4)}` : null,
  };
}

// ─── Envio ──────────────────────────────────────────────────────────────────────

export interface EnvioDeVendasResult {
  ok: boolean;
  /** Motivo real, mascarado. Nunca um booleano mudo (guardrail 6). */
  error?: string;
}

/**
 * Envia texto pelo número de vendas da Foocci.
 *
 * ⚠️ O PRIMEIRO PARÂMETRO É A DECISÃO DO PORTÃO, e é de propósito. Não existe
 * assinatura desta função que permita enviar sem ter avaliado o lead: quem tenta
 * precisa fabricar uma decisão aprovada, e isso é visível em revisão de código —
 * ao contrário de "esqueci de chamar o portão", que não aparece em lugar nenhum.
 *
 * Ordem das recusas: decisão → autorização de envio → configuração → formato.
 * A decisão vem primeiro porque é a única que fala do DESTINATÁRIO; as outras
 * falam de nós.
 */
export async function enviarTextoDeVendas(
  decisao: LeadSafetyDecision,
  toPhone: string,
  text: string,
): Promise<EnvioDeVendasResult> {
  if (!decisao.sendable) {
    return { ok: false, error: `portão do lead reprovou: ${decisao.reason ?? "sem motivo declarado"}` };
  }

  if (!isFoocciSdrSendEnabled()) {
    // NÃO é erro — é o estado normal de hoje. O SDR redige e não envia enquanto
    // a escada de liberação não tiver evidência suficiente.
    return { ok: false, error: "envio do SDR desligado (FOOCCI_SDR_SEND_ENABLED)" };
  }

  const provedor = resolverProvedorDeVendas();
  if (provedor !== "META_CLOUD_API") {
    // Guardrail 1 na costura: provedor desconhecido não vira "manda pela Meta".
    return { ok: false, error: `provedor de vendas não suportado (FOOCCI_SALES_PROVIDER=${provedor})` };
  }

  const phoneNumberId = foocciSalesPhoneNumberId();
  const token = foocciSalesAccessToken();
  if (!phoneNumberId || !token) {
    return { ok: false, error: "canal de vendas da Foocci não configurado" };
  }

  const recipient = toMetaRecipient(toPhone);
  if (!recipient) return { ok: false, error: "telefone inválido" };

  try {
    const res = await fetch(metaGraphUrl(`${phoneNumberId}/messages`), {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(buildMetaTextPayload(recipient, text)),
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
