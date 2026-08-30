/**
 * ⭐⭐ A TRADUÇÃO — do jeito que o Foocci fala para o jeito que a casa fala.
 *
 * ─── O QUE ESTE ARQUIVO CONSERTA (medido em 30/08/2026, contra o núcleo real) ─
 *
 * A escalada do Foocci **não passava**. Duas recusas, as duas por vocabulário:
 *
 *   1. `de: "diretor-foocci"` → `remetente_desconhecido`. O crachá do Diretor da
 *      Foocci **no diretório corporativo** tem a chave `diretor`
 *      (`dioli.foocci.direcao.diretor`). `diretor-foocci` é o slug do
 *      **organograma interno** do produto — outro namespace, outra lista.
 *   2. `permuta`, `escopoAcimaDaCapacidade`, `prazoDeImplantacao` →
 *      `assunto_fora_do_vocabulario`. **Zero interseção** com o vocabulário
 *      fechado do núcleo.
 *
 * ─── ⛔ E POR QUE A CORREÇÃO É AQUI, E NÃO LÁ ──────────────────────────────
 *
 * Decisão **D3** do CEO: *"produto que use nomes diferentes traduz no conector
 * local. Ninguém altera o contrato corporativo para acomodar o vocabulário de um
 * produto — é assim que um contrato vira quatro."*
 *
 * E o vocabulário do núcleo é fechado por um motivo que vale ser lido devagar:
 * texto livre produz cinco jeitos de escrever "pagamento diferente" e **nenhum
 * jeito de contar quantas vezes cada um subiu ao diretor** — que é justamente a
 * pergunta que decide se a alçada do gerente está apertada ou frouxa demais.
 *
 * ─── ⚠️ E POR QUE `cadastro.ts` NÃO FOI ALTERADO ───────────────────────────
 *
 * Seria a correção "óbvia": trocar `DIRETOR_DO_PRODUTO` para `"diretor"` e
 * pronto. **Seria um estrago.** Aquela constante é a autoridade da porta de
 * ENTRADA do Foocci (`QUEM_PODE_DESPACHAR`) — quem a Control Room pode dizer
 * que é ao acionar ESTE produto —, e ela é o slug do organograma canônico, que
 * saiu de auditoria. Trocar ali mudaria quem pode entrar, para consertar quem
 * pode sair.
 *
 * São dois namespaces, e eles são dois de verdade:
 *
 *   organograma do Foocci   →  `diretor-foocci`, `agente-gerente-produto`
 *   diretório corporativo   →  `diretor`,        `gerente-de-produto-e-ia`
 *
 * Este arquivo é a ponte entre eles, e é o único lugar onde ela existe.
 */

import {
  ASSUNTOS_DE_DECISAO,
  type AssuntoDeDecisao,
  type AssuntoForaDaAlcada,
} from "../contrato";
import type { AssuntoDePreco } from "@/services/salaDeVendas/precos";

// ═══════════════════════════════════════════════════════════════════════════
// 1. QUEM FALA E QUEM RECEBE, no diretório corporativo
// ═══════════════════════════════════════════════════════════════════════════

/**
 * ⚠️⛔ **ESTE NÃO É MAIS O REMETENTE DO DESPACHO.** Ver `origem.ts`.
 *
 * O nome ficou (nada se apaga), e o crachá continua correto: `diretor` é mesmo
 * a chave do Diretor da Foocci no diretório corporativo, e a medição de
 * 30/08/2026 continua valendo — `diretor-foocci`, o slug interno, responde
 * `remetente_desconhecido`.
 *
 * O que mudou é **quem assina a consulta**. Usar este crachá como `de` foi o
 * defeito que o CEO mediu em produção: o Diretor abria a consulta, o núcleo
 * escalava de volta para ele por `alcada_nao_declarada`, e o gatilho do Postgres
 * barrava — *"quem perguntou nao assina a propria resposta"*. Hoje quem assina é
 * o TA (`dioli.foocci.vendas.sdr-ia-ta`), que é quem de fato perguntou.
 *
 * Este par sobrevive como o endereço do **Diretor**, que segue sendo quem recebe
 * a escalada — o terceiro papel do circuito, e o único que ele deve ocupar.
 *
 * ⚠️ O núcleo aceita **os dois formatos** — a chave local (`diretor`) ou o
 * endereço corporativo inteiro (`dioli.foocci.direcao.diretor`). Ficou a chave
 * porque foi a que se **mediu passando**; o endereço está escrito abaixo porque
 * é a saída se um dia a mesma chave aparecer em duas salas do produto (o núcleo
 * recusa ambiguidade em vez de escolher, e faz certo).
 */
export const REMETENTE_NO_NUCLEO = "diretor" as const;
export const ENDERECO_DO_REMETENTE = "dioli.foocci.direcao.diretor" as const;

/**
 * ⚠️⛔ **ESTE NÃO É MAIS O DESTINATÁRIO DA CONSULTA COMERCIAL.** Ver `origem.ts`.
 *
 * O crachá continua certo e o aviso abaixo continua valendo: `agente-gerente-produto`
 * (o slug interno) **não existe** no diretório, onde a chave é
 * `gerente-de-produto-e-ia`, na sala `produto`.
 *
 * O que mudou é o **endereçamento**. A ficha 3.1 governa backlog e rollout de
 * agente — ela não tem alçada sobre preço, permuta ou prazo comercial. Mandar
 * uma decisão comercial para ela foi a causa medida do `alcada_nao_declarada`
 * que disparava a escalada. A consulta comercial vai ao Gerente Comercial
 * (ficha 1.1), que é quem a fonte declara como *"único que altera política
 * comercial"* — e que é o superior do TA.
 *
 * Este par continua sendo o endereço correto do Gerente de Produto e IA, para
 * quando o assunto for de fato dele (versão de agente, rollout, avaliação).
 */
export const DESTINATARIO_NO_NUCLEO = "gerente-de-produto-e-ia" as const;
export const ENDERECO_DO_DESTINATARIO = "dioli.foocci.produto.gerente-de-produto-e-ia" as const;

// ═══════════════════════════════════════════════════════════════════════════
// 2. O VOCABULÁRIO
// ═══════════════════════════════════════════════════════════════════════════

/**
 * ⭐ O MAPA: assunto do Foocci → assunto de decisão da casa.
 *
 * ⚠️ **Só entram aqui os assuntos que ESCALAM.** O que a Sala sabe responder
 * (`tabela`, `descontoPublicado`, `comoFecha`, `formaDePagamento`,
 * `descontoAlemDaTabela`) nunca chega a virar consulta, e pôr esses no mapa
 * faria parecer que um dia eles vão.
 *
 * O critério de cada linha, conferido contra o que o gatilho de fato lê
 * (`GATILHOS_DE_ASSUNTO`, em `precos.ts`) e não contra o nome dele:
 */
export const ASSUNTO_NO_NUCLEO: Readonly<Partial<Record<AssuntoDePreco, AssuntoDeDecisao>>> = {
  /**
   * O gatilho lê "permuta, escambo, ou parceria/troca dita perto de
   * pagamento/dinheiro" — isto é, o cliente propondo **pagar de um jeito que
   * não é o jeito padrão**. É a definição de `forma_de_pagamento_nao_padrao`.
   *
   * ⛔ E não é `preco_ou_desconto`: permuta não é um valor menor, é outro meio
   * de pagamento — a mesma distinção que já está escrita em `precos.ts` sobre
   * permuta não ser `formaDePagamento` do checkout.
   */
  permuta: "forma_de_pagamento_nao_padrao",

  /**
   * O gatilho lê "volume pedido em peças/posts/carrosséis, **ou** escopo dito
   * acima do plano".
   *
   * ⚠️ Aqui há uma imprecisão que vale declarar em vez de esconder: este
   * gatilho local cobre DOIS assuntos da casa — `volume_acima_da_capacidade` e
   * `escopo_fora_do_contratado`. Ele fica em `volume_acima_da_capacidade`
   * porque é o que o padrão dominante mede (número + unidade de entrega: "28–30
   * posts/mês") e é o caso que originou tudo isto.
   *
   * ⛔ Não se conserta isso mapeando para os dois: mandar dois assuntos numa
   * pergunta que tem um faria a contagem da alçada mentir — e contar é o motivo
   * de o vocabulário ser fechado. O conserto certo, se o CEO quiser a distinção,
   * é **separar o gatilho local em dois**, e aí cada um tem seu par aqui.
   */
  escopoAcimaDaCapacidade: "volume_acima_da_capacidade",

  /** "quanto tempo leva", "prazo de implantação" → prazo de entrega. */
  prazoDeImplantacao: "prazo_de_entrega",
};

export interface AssuntosTraduzidos {
  /** O que vai no fio, já no vocabulário da casa. */
  paraONucleo: AssuntoForaDaAlcada[];
  /**
   * ⚠️ O que NÃO tem par no vocabulário fechado. Nunca é descartado em
   * silêncio: sai nomeado, para o dossiê da fila humana dizer o que a consulta
   * não conseguiu perguntar.
   */
  semTraducao: string[];
}

/**
 * ⭐ Traduz, e **declara o que não soube traduzir**.
 *
 * ⚠️ O motivo (texto livre, escrito pela Sala) atravessa **intacto**: o
 * vocabulário fechado é do ASSUNTO, que é o que se conta; o motivo é o que o
 * gerente lê para decidir, e reescrevê-lo aqui seria este arquivo opinando
 * sobre um caso comercial que ele não viu.
 *
 * ⚠️ E a ordem é preservada. O caso do Marcos trouxe duas perguntas na mesma
 * mensagem, e a ordem em que ele as fez é a ordem em que ele espera a resposta.
 */
export function traduzirAssuntos(
  fora: ReadonlyArray<{ assunto: string; motivo: string }>,
): AssuntosTraduzidos {
  const paraONucleo: AssuntoForaDaAlcada[] = [];
  const semTraducao: string[] = [];

  for (const f of fora) {
    const traduzido = ASSUNTO_NO_NUCLEO[f.assunto as AssuntoDePreco];
    if (traduzido) paraONucleo.push({ assunto: traduzido, motivo: f.motivo });
    else semTraducao.push(f.assunto);
  }

  return { paraONucleo, semTraducao };
}

/** Um assunto está no vocabulário fechado da casa? */
export function ehAssuntoDaCasa(assunto: string): assunto is AssuntoDeDecisao {
  return (ASSUNTOS_DE_DECISAO as readonly string[]).includes(assunto);
}
