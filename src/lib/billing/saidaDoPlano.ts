/**
 * A SAÍDA DO PLANO — a regra do cancelamento e a conta da devolução, num lugar só.
 *
 * ── Por que este arquivo nasceu (29/08/2026) ────────────────────────────────
 *
 * A casa tinha TRÊS textos que discordavam sobre cancelamento: o site prometia
 * uma coisa ("cancela avisando 30 dias antes"), o contrato assinado prometia
 * outra ("valores de ciclos já pagos não são reembolsados") e os termos que o
 * cliente realmente aceita não falavam de dinheiro nenhum. Três bocas, três
 * regras. O CEO decidiu qual vale, e ela mora AQUI — em código, para que o texto
 * das telas seja leitura desta regra e não uma quarta versão dela.
 *
 * ── A REGRA, palavra do CEO (29/08/2026) ────────────────────────────────────
 *
 *  1. Cancela **a qualquer momento**, sem multa e sem fidelidade obrigatória.
 *  2. O **mês corrente já pago segue até o fim, sem devolução** — porque o
 *     serviço continua sendo prestado. Reter o mês em curso não é reter dinheiro:
 *     é cobrar por serviço entregue.
 *  3. Nos ciclos **abaixo de 6 meses** (hoje: trimestral), devolve-se
 *     **proporcionalmente** o período que ainda não foi entregue. Reter dinheiro
 *     de meses não prestados num plano pré-pago é vantagem excessiva (CDC art.
 *     51, IV) — é exatamente o que a v1 do contrato fazia, e o que se corrigiu.
 *  4. Nos ciclos de **6 meses ou mais** (hoje: anual), a conta é única:
 *       (a) recalcula-se o período já usado pelo **preço mensal** — o de quem não
 *           se comprometeu com plano longo;
 *       (b) devolve-se a **diferença** entre o que foi pago e esse recálculo;
 *       (c) o resultado **nunca é negativo**: no pior caso a devolução é zero, e
 *           o cliente **nunca deve dinheiro a mais** por ter cancelado;
 *       (d) o **teto da recuperação é o desconto efetivamente concedido** —
 *           nunca mais que isso, em hipótese nenhuma.
 *     Isto não é multa. Multa de valor arbitrário é penalidade sem lastro no
 *     prejuízo e cai. Aqui o desconto do plano longo é **condicionado à
 *     permanência**: quem sai antes devolve apenas o desconto que já usufruiu, e
 *     o valor **diminui a cada mês que ele fica**.
 *  5. **7 dias de arrependimento** para quem contratou pelo site, com devolução
 *     **integral** (CDC art. 49). Está acima de qualquer cláusula: nenhum
 *     contrato afasta esse direito.
 *
 * ── ⛔ O QUE ESTE ARQUIVO NÃO FAZ: MOVER DINHEIRO ───────────────────────────
 *
 * Aqui só se **calcula** e se **explica**. Nenhuma função daqui chama gateway,
 * emite estorno, toca em credencial ou grava cobrança. A execução do reembolso é
 * decisão e ato do CEO — pendência declarada, não esquecimento. Quem quiser
 * ligar isto a dinheiro de verdade precisa passar por essa decisão primeiro.
 *
 * ── Centavos inteiros, sempre ───────────────────────────────────────────────
 *
 * Todo valor entra e sai em centavos inteiros. Ponto flutuante em dinheiro é
 * como nasce a devolução de R$ 161,10000000000002 — e a função REJEITA um valor
 * fracionário na entrada em vez de arredondá-lo em silêncio (guardrail: prompt é
 * aviso, código é trava).
 */

import {
  CYCLE_MONTHS,
  PLAN_CYCLE_CENTS,
  firstMonthDiscountCents,
  type CycleCode,
  type PlanCode,
} from "./pricing";

/**
 * A partir de quantos meses um ciclo é "longo" e entra na conta do recálculo.
 * Palavra do CEO: *"pelo menos a partir de seis meses"*.
 *
 * ⚠️ Hoje o único ciclo que alcança esse limite é o ANUAL: o enum `BillingCycle`
 * do banco conhece MENSAL, TRIMESTRAL e ANUAL — **não existe semestral**. A
 * regra já está escrita para o dia em que existir; até lá ela tem um só objeto.
 */
export const MESES_DE_CICLO_LONGO = 6;

/** Dias de arrependimento de quem contratou à distância (CDC art. 49). */
export const DIAS_DE_ARREPENDIMENTO = 7;

/** Um ciclo é longo quando dura `MESES_DE_CICLO_LONGO` meses ou mais. */
export function cicloLongo(ciclo: CycleCode): boolean {
  return CYCLE_MONTHS[ciclo] >= MESES_DE_CICLO_LONGO;
}

/**
 * O desconto que o cliente ganha por se comprometer com o ciclo, em centavos.
 *
 * É a diferença entre pagar mês a mês (`MENSAL` × meses do ciclo) e o preço de
 * tabela do ciclo. É este número — e só ele — que pode ser recuperado na saída
 * antecipada. Sai da tabela de preços, nunca de um valor digitado.
 */
export function descontoDoCicloCents(plano: PlanCode, ciclo: CycleCode): number {
  const semCompromisso = PLAN_CYCLE_CENTS[plano].MENSAL * CYCLE_MONTHS[ciclo];
  return Math.max(0, semCompromisso - PLAN_CYCLE_CENTS[plano][ciclo]);
}

export interface PedidoDeDevolucao {
  plano: PlanCode;
  ciclo: CycleCode;
  /** O que a pessoa REALMENTE pagou por este ciclo, em centavos inteiros. */
  pagoCents: number;
  /**
   * Meses já iniciados, **o mês em curso incluído**. É o que faz o mês corrente
   * não ser devolvido: começou, foi prestado, conta como usado.
   */
  mesesUsados: number;
  /** Contratou pelo site (checkout self-service)? Só aí corre o arrependimento. */
  contratadoPeloSite: boolean;
  /** Dias corridos entre a contratação e o pedido de cancelamento. */
  diasDesdeAContratacao: number;
  /**
   * Recebeu os 50% do primeiro mês (degustação)?
   *
   * Importa no recálculo do ciclo longo: quem assina MENSAL também ganha meio
   * mês. Cobrar do que sai o mês 1 cheio seria cobrar dele MAIS do que o cliente
   * mensal pagou — o oposto de "o preço de quem não se comprometeu".
   */
  teveDegustacaoDoPrimeiroMes?: boolean;
}

export type MotivoDaDevolucao =
  /** 7 dias, contratação pelo site: volta tudo. */
  | "arrependimento"
  /** Ciclo abaixo de 6 meses: proporcional simples do que não foi entregue. */
  | "proporcional"
  /** Ciclo de 6 meses ou mais: recalcula o usado pelo preço mensal. */
  | "recalculoPeloMensal";

export interface Devolucao {
  motivo: MotivoDaDevolucao;
  /** ⛔ Valor a devolver, em centavos. CALCULADO — nunca executado por este código. */
  devolverCents: number;
  mesesDoCiclo: number;
  mesesUsados: number;
  mesesNaoEntregues: number;
  /** O desconto embutido no ciclo — o teto absoluto da recuperação. */
  descontoDoCicloCents: number;
  /** Quanto do desconto deixou de ser devolvido por causa da saída antecipada. */
  descontoRecuperadoCents: number;
  /** A conta em português de dono de restaurante, para a tela e para o e-mail. */
  explicacao: string;
}

/** Centavo é inteiro. Fração aqui é defeito de quem chamou, não coisa a arredondar. */
function exigirCentavosInteiros(nome: string, valor: number): void {
  if (!Number.isInteger(valor) || valor < 0) {
    throw new Error(
      `${nome} precisa ser um número inteiro de centavos, não negativo — recebi ${valor}. ` +
        `Dinheiro nesta casa não passa por ponto flutuante.`,
    );
  }
}

/**
 * Quanto devolver a quem cancela — a conta, e só a conta.
 *
 * As três travas que valem mais que o texto:
 *  · **Nunca negativo.** `Math.max(0, …)`: ninguém sai devendo por ter saído.
 *  · **Nunca maior que o pago.** Devolver mais do que entrou é inventar dinheiro.
 *  · **Teto no desconto concedido.** A recuperação não passa do desconto do ciclo.
 */
export function devolucaoNaSaida(pedido: PedidoDeDevolucao): Devolucao {
  exigirCentavosInteiros("pagoCents", pedido.pagoCents);

  const mesesDoCiclo = CYCLE_MONTHS[pedido.ciclo];
  // O mês em curso conta como usado; e ninguém "usa" mais meses do que o ciclo tem.
  const mesesUsados = Math.min(Math.max(1, Math.trunc(pedido.mesesUsados)), mesesDoCiclo);
  const mesesNaoEntregues = mesesDoCiclo - mesesUsados;
  const descontoDoCiclo = descontoDoCicloCents(pedido.plano, pedido.ciclo);

  // ── 1. Arrependimento: está acima de tudo, e por isso vem antes de tudo ────
  if (pedido.contratadoPeloSite && pedido.diasDesdeAContratacao <= DIAS_DE_ARREPENDIMENTO) {
    return {
      motivo: "arrependimento",
      devolverCents: pedido.pagoCents,
      mesesDoCiclo,
      mesesUsados,
      mesesNaoEntregues,
      descontoDoCicloCents: descontoDoCiclo,
      descontoRecuperadoCents: 0,
      explicacao:
        `Você contratou pelo site há ${pedido.diasDesdeAContratacao} dia(s) e desistiu dentro dos ` +
        `${DIAS_DE_ARREPENDIMENTO} dias de arrependimento: devolvemos tudo o que você pagou, ` +
        `integralmente.`,
    };
  }

  // O que o proporcional simples daria. Serve de conta para o ciclo curto E de
  // régua para medir quanto de desconto o ciclo longo recuperou.
  // Arredonda PARA CIMA — a fração de centavo fica com o cliente, não com a casa.
  const proporcionalSimples = Math.min(
    pedido.pagoCents,
    Math.ceil((pedido.pagoCents * mesesNaoEntregues) / mesesDoCiclo),
  );

  // ── 2. Ciclo curto: proporcional simples, sem recuperar desconto nenhum ────
  if (!cicloLongo(pedido.ciclo)) {
    return {
      motivo: "proporcional",
      devolverCents: proporcionalSimples,
      mesesDoCiclo,
      mesesUsados,
      mesesNaoEntregues,
      descontoDoCicloCents: descontoDoCiclo,
      descontoRecuperadoCents: 0,
      explicacao:
        mesesNaoEntregues === 0
          ? `O mês que você já pagou segue até o fim — o serviço continua sendo prestado até lá. ` +
            `Não há período por entregar, então não há o que devolver.`
          : `Dos ${mesesDoCiclo} meses do seu plano, ${mesesUsados} já foram usados e ` +
            `${mesesNaoEntregues} ainda não foram entregues. Devolvemos esses ` +
            `${mesesNaoEntregues} de forma proporcional.`,
    };
  }

  // ── 3. Ciclo longo: recalcula o usado pelo preço de quem não se comprometeu ─
  const mensalCheio = PLAN_CYCLE_CENTS[pedido.plano].MENSAL;
  const degustacaoDoMensal = pedido.teveDegustacaoDoPrimeiroMes
    ? firstMonthDiscountCents(pedido.plano, "MENSAL")
    : 0;
  const recalculoDoUsado = Math.max(0, mensalCheio * mesesUsados - degustacaoDoMensal);

  // As duas travas de uma vez: nunca negativo, nunca maior que o pago.
  const devolver = Math.min(pedido.pagoCents, Math.max(0, pedido.pagoCents - recalculoDoUsado));

  // Quanto de desconto a saída antecipada recuperou — e o teto do CEO, explícito
  // no código mesmo sendo redundante: a conta acima já não passa do desconto
  // usufruído, e uma trava que só se prova por álgebra não é trava.
  const descontoRecuperado = Math.max(
    0,
    Math.min(proporcionalSimples - devolver, descontoDoCiclo),
  );

  return {
    motivo: "recalculoPeloMensal",
    devolverCents: devolver,
    mesesDoCiclo,
    mesesUsados,
    mesesNaoEntregues,
    descontoDoCicloCents: descontoDoCiclo,
    descontoRecuperadoCents: descontoRecuperado,
    explicacao:
      `Você pagou ${mesesDoCiclo} meses adiantado e usou ${mesesUsados}. Refazemos a conta ` +
      `desses ${mesesUsados} meses pelo preço do plano mensal — o de quem não se comprometeu — ` +
      `e devolvemos a diferença. Se a diferença der zero, a devolução é zero: ` +
      `você nunca fica devendo por cancelar.`,
  };
}

/**
 * A REGRA NA VITRINE — as mesmas frases que a página de preços publica.
 *
 * ⚠️ ISTO É EXIGÊNCIA DE VALIDADE, NÃO DE MARKETING. Cláusula que o cliente não
 * teve como conhecer **no momento da contratação** não o obriga. Se a regra do
 * plano longo só aparecer no contrato, ela não protege ninguém: por isso ela
 * fica junto do preço, na tela de planos, antes de qualquer assinatura.
 *
 * As frases vivem aqui — e não digitadas dentro da página — para que a vitrine,
 * os termos aceitos e o contrato sejam leituras da MESMA regra. É a divergência
 * de 29/08 que isto impede de renascer.
 */
export const REGRA_DE_SAIDA: readonly string[] = [
  "Você cancela a qualquer momento, sem multa e sem fidelidade obrigatória.",
  "O mês em curso, que você já pagou, segue funcionando até o fim — sem devolução, " +
    "porque o serviço continua sendo prestado até lá.",
  "No plano trimestral, devolvemos de forma proporcional os meses que ainda não " +
    "foram entregues.",
  "Nos planos de 6 meses ou mais, refazemos a conta dos meses que você usou pelo " +
    "preço do plano mensal e devolvemos a diferença: você fica com o desconto dos " +
    "meses que ficou, e devolve só o desconto dos meses que não vai usar. A " +
    "devolução nunca fica negativa — no pior caso ela é zero, e você nunca paga a " +
    "mais por cancelar.",
  "Contratou pelo site? Você tem 7 dias para desistir e receber tudo de volta, " +
    "integralmente: é o direito de arrependimento, e ele vale acima de qualquer " +
    "outra regra desta página.",
];
