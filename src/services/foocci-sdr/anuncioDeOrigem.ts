/**
 * ANÚNCIO CLIQUE-PARA-WHATSAPP (CTWA) — de onde veio a pessoa que escreveu primeiro.
 *
 * ── O DEFEITO, MEDIDO EM 19/09/2026 ─────────────────────────────────────────
 *
 * O CEO trocou o anúncio de formulário por clique-para-WhatsApp. Nesse formato a
 * pessoa **não preenche nada**: ela clica no anúncio e cai no nosso WhatsApp
 * mandando a primeira mensagem. A Meta anexa a essa mensagem um objeto
 * `referral` dizendo de qual anúncio ela veio.
 *
 * Esse objeto **sempre chegou e sempre foi jogado fora**: o tipo `RawMessage`
 * de `providers/metaWebhook.ts` declarava `text`, `image`, `audio`, `location`…
 * e nenhuma linha da casa lia `referral`. Resultado: o lead mais caro que
 * existe — o que veio de mídia paga — nascia como "escreveu direto no WhatsApp,
 * sem passar pelo formulário", com fonte `WHATSAPP_DIRETO`, e a campanha que o
 * trouxe não aparecia em lugar nenhum. Pagávamos pelo clique e não sabíamos
 * qual anúncio o produziu.
 *
 * Não é dado que falta: é dado que a gente descartava — o mesmo defeito do
 * `entry[].id` (o WABA da Sala), e pela mesma causa: um tipo que não declarava
 * o campo.
 *
 * ── ESTE ARQUIVO É PURO, E DE PROPÓSITO ─────────────────────────────────────
 *
 * Só traduz `referral` → campos de origem. Não escreve no banco, não cria lead,
 * não manda mensagem. Quem grava é `FoocciSalesInbound`, pela porta de
 * nascimento que já existe — um segundo caminho de nascimento produziria duas
 * verdades sobre a origem do lead, que é exatamente o que
 * `meta-leads/importarMetaLead.ts` existe para impedir.
 */

import type { SiteLeadSource } from "@prisma/client";

/** O `referral` da Meta, com os nomes já normalizados pelo webhook. */
export interface ReferralDeAnuncio {
  /** `ad` (anúncio) ou `post` (publicação). Outro valor = não é mídia paga. */
  sourceType: string | null;
  /** O id do anúncio/publicação no Gerenciador. */
  sourceId: string | null;
  sourceUrl: string | null;
  /** O título do anúncio — é o que um humano reconhece na tela. */
  headline: string | null;
  body: string | null;
  /** O id do clique. É ele que casa a conversa com o gasto, do lado da Meta. */
  ctwaClid: string | null;
}

/** A fonte que um lead de clique-para-WhatsApp recebe. Um teste a confere. */
export const FONTE_DO_ANUNCIO: SiteLeadSource = "CAMPANHA_PAGA";

/**
 * O prefixo do campo `origem`.
 *
 * É constante porque `painelDoVendedor` o reconhece para saber que esta
 * `origem` NÃO é uma página de site (que qualquer redirecionamento embaralha),
 * e sim dado de máquina vindo do próprio webhook.
 */
export const ORIGEM_DE_ANUNCIO = "Anúncio clique-para-WhatsApp";

function limpo(v: string | null | undefined): string | null {
  const s = typeof v === "string" ? v.trim() : "";
  return s === "" ? null : s;
}

/**
 * Veio de mídia paga?
 *
 * Exige tipo conhecido **e** algum identificador. `referral` sem id nenhum não
 * é atribuição: é ruído, e carimbar `CAMPANHA_PAGA` em cima dele inventaria uma
 * campanha que ninguém consegue achar no Gerenciador depois.
 */
export function veioDeAnuncio(r: ReferralDeAnuncio | null | undefined): boolean {
  if (!r) return false;
  const tipo = (limpo(r.sourceType) ?? "").toLowerCase();
  if (tipo !== "ad" && tipo !== "post") return false;
  return Boolean(limpo(r.sourceId) ?? limpo(r.ctwaClid));
}

/** Como o anúncio se chama para gente: título, e só na falta dele o id. */
export function nomeDoAnuncio(r: ReferralDeAnuncio): string {
  return limpo(r.headline) ?? limpo(r.sourceId) ?? "anúncio sem identificador";
}

/**
 * A marca do primeiro clique.
 *
 * `ctwa_clid` vem primeiro porque é ÚNICO por clique; `sourceId` é o anúncio e
 * se repete em toda pessoa que clicar nele — usá-lo como chave faria o segundo
 * lead da campanha parecer o primeiro de volta.
 */
export function marcadorDoClique(r: ReferralDeAnuncio): string | null {
  const clid = limpo(r.ctwaClid);
  if (clid) return `ctwa:${clid}`;
  const id = limpo(r.sourceId);
  return id ? `ctwa-ad:${id}` : null;
}

/**
 * A plataforma, lida da URL do anúncio.
 *
 * ⚠️ A Meta **não manda** a plataforma no `referral`. O host da `source_url` é
 * a única pista, e `facebook` é o palpite padrão — declarado como palpite aqui
 * em vez de ser apresentado adiante como se fosse dado medido.
 */
export function plataformaDoAnuncio(r: ReferralDeAnuncio): "facebook" | "instagram" {
  return /instagram/i.test(limpo(r.sourceUrl) ?? "") ? "instagram" : "facebook";
}

/** Os campos de origem que a ficha grava. Nenhum deles é inventado. */
export interface CamposDeOrigem {
  origem: string;
  utmSource: string;
  utmMedium: string;
  utmCampaign: string | null;
  utmContent: string | null;
  clickId: string | null;
  referrer: string;
}

export function camposDeOrigemDoAnuncio(r: ReferralDeAnuncio): CamposDeOrigem {
  return {
    origem: `${ORIGEM_DE_ANUNCIO} — ${nomeDoAnuncio(r)}`,
    utmSource: plataformaDoAnuncio(r),
    utmMedium: "click_to_whatsapp",
    // É o que a tela mostra em "Campanha". O título do anúncio é o que o CEO
    // reconhece; o id sozinho não diz nada a ninguém olhando a conversa.
    utmCampaign: limpo(r.headline) ?? limpo(r.sourceId),
    utmContent: limpo(r.sourceId),
    clickId: marcadorDoClique(r),
    referrer: "meta-click-to-whatsapp",
  };
}

/**
 * A nota de auditoria — tudo que a Meta mandou, conferível depois.
 *
 * Mesmo formato de `importarMetaLead.notaDeAuditoria`: `chave=valor | …`. Dois
 * formatos para a mesma pergunta produziriam dois jeitos de investigar a mesma
 * origem.
 */
export function notaDoAnuncio(r: ReferralDeAnuncio): string {
  const pares: Array<readonly [string, string | null]> = [
    ["source_type", limpo(r.sourceType)],
    ["source_id", limpo(r.sourceId)],
    ["headline", limpo(r.headline)],
    ["body", limpo(r.body)?.slice(0, 200) ?? null],
    ["source_url", limpo(r.sourceUrl)],
    ["ctwa_clid", limpo(r.ctwaClid)],
  ];
  const corpo = pares
    .filter(([, v]) => v !== null)
    .map(([k, v]) => `${k}=${v}`)
    .join(" | ");
  return `${ORIGEM_DE_ANUNCIO} | ${corpo}`;
}

/** O motivo da promoção de um contato frio. É a PROVA, e vai na linha do tempo. */
export function motivoDaPromocaoPorAnuncio(r: ReferralDeAnuncio): string {
  return `Clicou no anúncio "${nomeDoAnuncio(r)}" e escreveu no nosso WhatsApp`;
}
