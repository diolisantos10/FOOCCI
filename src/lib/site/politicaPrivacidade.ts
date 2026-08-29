/**
 * A POLÍTICA DE PRIVACIDADE — uma só, e a fonte única de qual é ela.
 *
 * ── O defeito que este arquivo passou a fechar em 29/08/2026 ────────────────
 *
 * Havia DUAS políticas no ar, com datas diferentes:
 *
 *   · `/privacidade` — pública, completa (produto inteiro: WhatsApp/Meta,
 *     Google, pagamentos, fiscal, IA), datada de 30/07/2026. É a URL que a
 *     revisão de app da Meta e do Google exige e a que `/termos` já apontava.
 *   · `/site/politica-de-privacidade` — escrita no PRÉ-LANÇAMENTO, datada de
 *     04/06/2026, cobrindo só o formulário de demonstração do site comercial.
 *
 * E o consentimento do formulário gravava a **mais velha**: a constante daqui
 * valia `2026-06-04`. Ou seja: a pessoa preenchia o formulário de um site que
 * já estava no ar e vendendo, e o registro dizia que ela havia consentido a um
 * texto de pré-lançamento — escrito quando ainda não havia formulário nenhum.
 *
 * Duas políticas vivas com datas diferentes não é um detalhe de organização: é
 * ambiguidade sobre QUAL texto rege. E um registro de consentimento que aponta
 * para o texto errado é pior que um registro vazio, porque parece prova.
 *
 * ── A regra agora ───────────────────────────────────────────────────────────
 *
 * **Uma política, um caminho, uma versão** — e a versão gravada é a MESMA que a
 * pessoa vê, porque a tela e o registro leem daqui. `/site/politica-de-privacidade`
 * deixou de ser um segundo documento e passou a redirecionar para o canônico.
 *
 * ⚠️ REGRA DE MANUTENÇÃO: mudou o TEXTO da política em `/privacidade`? Então:
 *   1. mova `POLITICA_PRIVACIDADE_VERSAO` e `..._ATUALIZADA_EM` na mesma sessão;
 *   2. empurre a versão que saiu para `POLITICAS_RECOLHIDAS`, com o porquê.
 * O passo 2 não é burocracia: é o que mantém legível um consentimento antigo.
 * Sem ele, uma versão gravada no banco vira um código que ninguém sabe traduzir.
 *
 * ⛔ O QUE NÃO SE FAZ: reescrever `consentPolicyVersion` de quem já consentiu.
 * O que foi consentido foi consentido, e a versão gravada é o registro do que a
 * pessoa viu naquele dia — não do que está no ar hoje. `POLITICAS_RECOLHIDAS`
 * existe justamente para esse passado continuar visível e nomeado.
 */

/** O único caminho da política. Tela e registro leem daqui — nunca do teclado. */
export const POLITICA_PRIVACIDADE_CAMINHO = "/privacidade";

/** Chave estável, gravada no banco. Formato ISO para ordenar sozinha. */
export const POLITICA_PRIVACIDADE_VERSAO = "2026-07-30";

/** A mesma data como a pessoa lê na página. */
export const POLITICA_PRIVACIDADE_ATUALIZADA_EM = "30 de julho de 2026";

/** Uma versão que já esteve no ar e não está mais. Nunca se apaga daqui. */
export interface PoliticaRecolhida {
  /** O valor exato que está gravado em `SiteLead.consentPolicyVersion`. */
  versao: string;
  /** Como a data aparecia na página daquela versão. */
  atualizadaEm: string;
  /** Onde ela era publicada enquanto esteve no ar. */
  ondeFicava: string;
  /** Quando saiu do ar, e por quê — em uma frase que se lê sem contexto. */
  recolhidaEm: string;
  porque: string;
}

/**
 * O passado, por extenso.
 *
 * Contato gravado ANTES de 14/08/2026 fica com `consentPolicyVersion` nulo — e
 * nulo aqui significa exatamente "versão não registrada", **nunca** "não
 * consentiu" (guardrail 1: ausência de informação não é informação).
 */
export const POLITICAS_RECOLHIDAS: readonly PoliticaRecolhida[] = [
  {
    versao: "2026-06-04",
    atualizadaEm: "4 de junho de 2026",
    ondeFicava: "/site/politica-de-privacidade",
    recolhidaEm: "2026-08-29",
    porque:
      "Texto de pré-lançamento, cobrindo apenas o formulário do site comercial. " +
      "Convivia com a política completa em /privacidade, com data diferente — duas " +
      "políticas no ar ao mesmo tempo. O site passou a apontar para a única.",
  },
];

/** Em que situação está uma versão que apareceu num registro de consentimento. */
export type SituacaoDaVersao = "atual" | "recolhida" | "naoRegistrada" | "desconhecida";

export interface VersaoConsentida {
  situacao: SituacaoDaVersao;
  /** Frase pronta para a ficha do contato. Nunca diz "não consentiu". */
  rotulo: string;
}

/**
 * Traduz o que está gravado em `consentPolicyVersion` para uma frase honesta.
 *
 * Os quatro casos são deliberadamente diferentes entre si, e nenhum deles é
 * "não consentiu":
 *
 *   · **atual** — consentiu à política que está no ar.
 *   · **recolhida** — consentiu a uma versão anterior, que existiu de verdade.
 *     A ficha diz QUAL e QUANDO ela saiu; o consentimento continua valendo pelo
 *     que era naquele dia. É o caso de todo contato de 14/08 a 29/08/2026.
 *   · **naoRegistrada** — `null`: o contato é anterior a existir o campo. Não
 *     se sabe a versão, e é isso que a ficha diz.
 *   · **desconhecida** — veio uma versão que este arquivo não conhece. Só
 *     acontece se alguém mexer na constante sem registrar a que saiu; a ficha
 *     mostra o valor cru em vez de fingir que entendeu.
 */
export function descreveVersaoConsentida(versao: string | null | undefined): VersaoConsentida {
  if (!versao) {
    return {
      situacao: "naoRegistrada",
      rotulo: "versão não registrada (contato anterior ao registro de versão)",
    };
  }
  if (versao === POLITICA_PRIVACIDADE_VERSAO) {
    return { situacao: "atual", rotulo: `${versao} — a política em vigor` };
  }
  const antiga = POLITICAS_RECOLHIDAS.find((p) => p.versao === versao);
  if (antiga) {
    return {
      situacao: "recolhida",
      rotulo: `${versao} — versão anterior, recolhida em ${antiga.recolhidaEm}`,
    };
  }
  return { situacao: "desconhecida", rotulo: `${versao} — versão não catalogada` };
}
