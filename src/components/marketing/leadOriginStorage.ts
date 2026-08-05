/**
 * Memória de origem do visitante — primeiro toque, no navegador.
 *
 * NÃO É TAG DE RASTREAMENTO. Nenhum pixel, nenhuma requisição, nenhum terceiro:
 * é `sessionStorage` do próprio site, lido de volta no envio do formulário. O
 * bloco de analytics do /site (GA4 + Meta Pixel) continua sendo o de
 * `SiteAnalytics` + `SiteSettingsService`, e nada aqui o substitui nem o duplica.
 *
 * POR QUE PRECISA EXISTIR: o anúncio joga a pessoa na home com `?utm_campaign=…`;
 * ela navega e só depois abre o formulário, já sem os parâmetros na URL. Sem
 * guardar o primeiro toque, a atribuição morre na segunda página — e era isso que
 * fazia todo contato chegar com `origem = "/site/demonstracao"`, que é sempre a
 * mesma resposta e portanto nenhuma resposta.
 *
 * `sessionStorage` e não `localStorage`: a origem vale para esta visita. Um
 * `localStorage` de 30 dias faria a campanha de julho levar crédito por um
 * formulário preenchido em agosto.
 */

import { extrairOrigem, ORIGEM_VAZIA, type OrigemCapturada } from "@/services/foocci-crm/leadOrigin";

const CHAVE = "foocci-site-origem";

/** Tem sinal de campanha? É isso que decide se vale substituir um toque "direto". */
function temSinalDeCampanha(o: OrigemCapturada): boolean {
  return Boolean(o.utmSource || o.utmCampaign || o.clickId);
}

/**
 * Grava o primeiro toque, se ainda não houver um.
 *
 * A ÚNICA exceção à regra do primeiro toque: se o que está guardado não tem
 * NENHUM sinal de campanha (a pessoa entrou direto) e a URL de agora tem, o
 * guardado é substituído. Guardar "direto" por cima de um anúncio real seria
 * jogar fora a informação que o CEO está pagando para ter — e continua sendo
 * primeiro toque *identificado*, não último toque.
 */
export function registraPrimeiroToque(): void {
  if (typeof window === "undefined") return;

  try {
    const params = new URLSearchParams(window.location.search);
    const atual = extrairOrigem(
      params,
      document.referrer || null,
      window.location.pathname + window.location.search,
    );

    const bruto = window.sessionStorage.getItem(CHAVE);
    if (bruto) {
      const guardado = JSON.parse(bruto) as OrigemCapturada;
      if (temSinalDeCampanha(guardado) || !temSinalDeCampanha(atual)) return;
    }

    window.sessionStorage.setItem(CHAVE, JSON.stringify(atual));
  } catch {
    // Navegador com storage bloqueado: o formulário simplesmente vai sem origem.
    // Perder atribuição é aceitável; quebrar a página do visitante não é.
  }
}

/** Lê o primeiro toque para mandar junto com o formulário. Nunca lança. */
export function leOrigemGuardada(): OrigemCapturada {
  if (typeof window === "undefined") return ORIGEM_VAZIA;
  try {
    const bruto = window.sessionStorage.getItem(CHAVE);
    if (!bruto) return ORIGEM_VAZIA;
    return { ...ORIGEM_VAZIA, ...(JSON.parse(bruto) as Partial<OrigemCapturada>) };
  } catch {
    return ORIGEM_VAZIA;
  }
}
