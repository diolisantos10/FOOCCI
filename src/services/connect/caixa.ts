/**
 * A CAIXA POSTAL DO DIOLI CONNECT — e a única palavra que esta porta pode gravar.
 *
 * ─── OS QUATRO ESTADOS, E POR QUE ELES NÃO PODEM SER UM SÓ ──────────────────
 *
 * O relatório de entendimento do Dioli Connect (30/08/2026) mediu, na própria
 * plataforma, um mecanismo de acionamento que **devolve "sucesso" e não entrega
 * nada**. A conclusão virou lei do projeto:
 *
 *   "'O despachante disse ok' fica proibido como prova, por construção."
 *
 * Daí os quatro estados, separados de propósito:
 *
 *   entregue         → a mensagem está gravada e endereçada.
 *   acionado         → o executor SE MOVEU, e devolveu evidência disso.
 *   respondido       → veio conteúdo de volta no mesmo fio.
 *   nao_verificavel  → não deu para saber. NUNCA vira verde.
 *
 * ─── ⭐ ESTA PORTA GRAVA `entregue`. E NUNCA GRAVA `acionado`. ──────────────
 *
 * Não é modéstia, é a definição. `acionado` só existe **com evidência devolvida
 * por quem executou — carimbo do lado de lá, não do lado de cá**. Esta porta É o
 * lado de cá: ela é quem despacha. Se ela mesma escrevesse `acionado` na caixa,
 * estaria fazendo exatamente o que o projeto existe para matar — o despachante
 * carimbando o próprio recibo.
 *
 * Quem pode carimbar `acionado` é a Control Room, **depois** de ler a prova que
 * esta porta devolve (a linha relida do banco). O carimbo é dela, não nosso.
 *
 * E a regra não é aviso: é trava. `carimboDeEntrega()` é o ÚNICO construtor do
 * registro de caixa deste kit, ele fixa `entregue` no literal, e
 * `recusarCarimboIndevido()` **lança** se algum código futuro tentar escrever
 * outro estado. Guardrail 4 da casa: prompt é aviso; código é trava.
 */

/** Os quatro estados da caixa postal do Dioli Connect. */
export const ESTADOS_DA_CAIXA = ["entregue", "acionado", "respondido", "nao_verificavel"] as const;
export type EstadoDaCaixa = (typeof ESTADOS_DA_CAIXA)[number];

/** O único estado que ESTA porta escreve. */
export const ESTADO_QUE_ESTA_PORTA_GRAVA = "entregue" as const;

/** O estado que ESTA porta nunca escreve, e o motivo colado nele. */
export const ESTADO_QUE_ESTA_PORTA_NUNCA_GRAVA = "acionado" as const;

export const POR_QUE_NUNCA_ACIONADO =
  "esta porta grava 'entregue' — a mensagem está gravada e endereçada — e NUNCA grava 'acionado'. " +
  "'acionado' exige evidência devolvida por quem executou, carimbo do lado de lá; quem despacha carimbando " +
  "o próprio recibo é justamente o defeito que o Dioli Connect existe para matar. A prova da execução vai " +
  "nesta resposta relida do banco: quem lê é que decide carimbar 'acionado', do lado dele.";

export class CarimboIndevido extends Error {
  constructor(estado: string) {
    super(
      `a porta do Dioli Connect tentou gravar "${estado}" na caixa e foi impedida: ela só pode gravar ` +
        `"${ESTADO_QUE_ESTA_PORTA_GRAVA}". ${POR_QUE_NUNCA_ACIONADO}`,
    );
    this.name = "CarimboIndevido";
  }
}

/** A trava. Lança para qualquer estado que não seja `entregue`. */
export function recusarCarimboIndevido(estado: string): asserts estado is typeof ESTADO_QUE_ESTA_PORTA_GRAVA {
  if (estado !== ESTADO_QUE_ESTA_PORTA_GRAVA) throw new CarimboIndevido(estado);
}

/** O que a porta escreveu na caixa — e o que ela declara não ter escrito. */
export interface CarimboDaCaixa {
  /**
   * O que foi gravado NESTA rodada: `entregue`, ou `null` quando nada chegou a
   * ser gravado. `null` é uma afirmação, não um buraco: dizer "entregue" quando
   * a linha não existe seria a mesma mentira, só que na outra ponta.
   */
  estado: typeof ESTADO_QUE_ESTA_PORTA_GRAVA | null;
  gravado: boolean;
  nunca_grava: typeof ESTADO_QUE_ESTA_PORTA_NUNCA_GRAVA;
  porque: string;
  /** Os quatro estados do vocabulário, para quem lê saber o que existe. */
  vocabulario: readonly EstadoDaCaixa[];
}

/**
 * O ÚNICO construtor do carimbo positivo. Passa pela trava antes de devolver,
 * para que nem um erro de digitação futuro consiga escrever outra coisa.
 */
export function carimboDeEntrega(): CarimboDaCaixa {
  const estado: string = ESTADO_QUE_ESTA_PORTA_GRAVA;
  recusarCarimboIndevido(estado);
  return {
    estado,
    gravado: true,
    nunca_grava: ESTADO_QUE_ESTA_PORTA_NUNCA_GRAVA,
    porque: POR_QUE_NUNCA_ACIONADO,
    vocabulario: ESTADOS_DA_CAIXA,
  };
}

/** Nada foi gravado nesta rodada — e a resposta diz isso, em vez de omitir. */
export function caixaSemRegistro(): CarimboDaCaixa {
  return {
    estado: null,
    gravado: false,
    nunca_grava: ESTADO_QUE_ESTA_PORTA_NUNCA_GRAVA,
    porque: POR_QUE_NUNCA_ACIONADO,
    vocabulario: ESTADOS_DA_CAIXA,
  };
}
