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
 *
 * ── O FREIO (14/08/2026) ─────────────────────────────────────────────────────
 * Até aqui este era **o único caminho de envio do Foocci sem freio nenhum**: sem
 * horário, sem teto, sem descanso, sem opt-out — e o único que envia **sem
 * restaurante**, que é exatamente o que um SDR precisaria. `docs/sdr-foocci-desenho.md`
 * marcou isso como P0 e escreveu a frase certa: *"é a função mais parecida com o
 * que o SDR precisa e a mais perigosa"*.
 *
 * O que existia contra o abuso era um comentário dizendo "é interno". Guardrail 4:
 * prompt é aviso, código é trava. Agora existe teto — ver `RATE` abaixo.
 *
 * ⚠️ HONESTIDADE SOBRE O QUE ESTE FREIO É: ele é **por processo**, em memória.
 * Numa infra com várias instâncias, cada uma tem o próprio contador. Ele NÃO é
 * um teto global e NÃO substitui o portão de contato — é o para-choque contra as
 * duas formas de acidente que já aconteceram nesta casa: **o laço que retenta
 * para sempre** e **o caminho reaproveitado para falar com estranho em massa**.
 * Uso normal (confirmação de `/build` para o operador, aviso de Instagram) nunca
 * chega perto do teto.
 *
 * 🚫 QUEM NÃO PODE USAR ESTE MÓDULO: o SDR da Foocci. Ele tem porta própria, com
 * portão próprio — `src/services/foocci-sdr/`. Travado por teste estrutural em
 * `src/services/foocci-sdr/tests/portaSeparada.test.ts`.
 */

import { metaGraphUrl } from "@/services/whatsapp/metaFlag";
import { buildMetaTextPayload, toMetaRecipient, maskGraphResponse } from "@/services/whatsapp/providers/metaPayload";

// ─── Freio de volume ────────────────────────────────────────────────────────────

/**
 * Os tetos, numa janela deslizante de uma hora.
 *
 * Os dois números não são palpite de conforto: são a folga entre o uso real e a
 * forma do acidente. O uso real é uma confirmação por comando, para um ou dois
 * operadores. O acidente é dezenas de destinos (lista de leads) ou centenas de
 * mensagens para o mesmo destino (laço de retentativa).
 */
export const RATE = {
  janelaMs: 60 * 60 * 1000,
  /** Mensagens no total. Um laço de retentativa morre aqui. */
  maxMensagens: 40,
  /** Destinos DISTINTOS. Uma lista de leads morre aqui, na 6ª pessoa. */
  maxDestinos: 5,
} as const;

/** Histórico da janela corrente: um carimbo por envio ACEITO. */
let enviosNaJanela: { at: number; destino: string }[] = [];

function podeEnviar(destino: string, agora: number): { ok: true } | { ok: false; error: string } {
  enviosNaJanela = enviosNaJanela.filter((e) => agora - e.at < RATE.janelaMs);

  if (enviosNaJanela.length >= RATE.maxMensagens) {
    return {
      ok: false,
      // Guardrail 6: o alerta carrega a própria evidência — quantas, em quanto tempo.
      error: `freio do canal Master: ${enviosNaJanela.length} mensagens na última hora (teto ${RATE.maxMensagens})`,
    };
  }

  const destinos = new Set(enviosNaJanela.map((e) => e.destino));
  if (!destinos.has(destino) && destinos.size >= RATE.maxDestinos) {
    return {
      ok: false,
      error: `freio do canal Master: ${destinos.size} destinos distintos na última hora (teto ${RATE.maxDestinos}) — este canal é interno, não lista de contatos`,
    };
  }

  return { ok: true };
}

/**
 * Zera o freio. Existe **só para teste** — nenhum caminho de produção chama.
 * Sem isto, um arquivo de teste contaminaria o seguinte pelo módulo compartilhado.
 */
export function __resetFreioDoCanalMaster(): void {
  enviosNaJanela = [];
}

/** Estado do freio para diagnóstico — sem telefone, sem conteúdo. */
export function freioDoCanalMaster(agora = Date.now()): { mensagens: number; destinos: number } {
  const vivas = enviosNaJanela.filter((e) => agora - e.at < RATE.janelaMs);
  return { mensagens: vivas.length, destinos: new Set(vivas.map((e) => e.destino)).size };
}

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

  // O freio vem ANTES da rede: um caminho barrado não pode custar uma chamada à
  // Meta, senão o "teto" só protege a nossa consciência e não o número.
  const agora = Date.now();
  const freio = podeEnviar(recipient, agora);
  if (!freio.ok) {
    console.error(`[BuildOsMetaChannel] envio recusado — ${freio.error}`);
    return { ok: false, error: freio.error };
  }
  enviosNaJanela.push({ at: agora, destino: recipient });

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
