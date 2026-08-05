/**
 * A conta da economia — em UM lugar só, e já descontando a mensalidade.
 *
 * ⚠️ POR QUE ESTE ARQUIVO EXISTE (defeito real, corrigido em 05/08/2026):
 *
 * A calculadora da home e o bloco "Faz a conta" de `/site/precos` faziam a mesma
 * conta em dois lugares, e as DUAS erravam do mesmo jeito: multiplicavam a comissão
 * pela fatia migrada e chamavam o resultado de "o que fica no seu caixa" — **sem
 * descontar a mensalidade do Foocci**, que é justamente o que a pessoa passa a pagar
 * nesse cenário.
 *
 *   Antes: R$ 20.000/mês a 23% → "já ficam R$ 920 a R$ 1.610 por mês no seu caixa".
 *   Certo: R$ 920 − R$ 429 = **R$ 491** a R$ 1.181.
 *
 * Com faturamento baixo o vício virava promessa de lucro em cenário de prejuízo:
 * R$ 2.000/mês a 23% mostrava "já ficam R$ 92 no seu caixa" para quem pagaria
 * R$ 429/mês. O número certo é **−R$ 337**.
 *
 * Isso é o guardrail 7 da casa ("nunca vender como pronto o que está em piloto")
 * na sua forma numérica: **nunca mostrar um número melhor do que o real**. Quando a
 * faixa conservadora não fecha, a tela diz isso — e mostra a partir de quanto ela
 * fecha, que é honesto e ainda vende.
 *
 * Módulo PURO e sem dependência de React de propósito: é o que permite provar os
 * dois casos numéricos em teste (`savings.test.ts`). Este é o tipo de defeito que
 * volta quando só existe na marcação.
 */

import { MIGRATION_RANGE } from "./commissionRates";

/**
 * Como termina a faixa conservadora, depois de descontada a mensalidade:
 *
 *  - `positivo` — até a ponta baixa da migração já sobra dinheiro.
 *  - `parcial`  — a ponta baixa ainda não paga a mensalidade; a alta já paga.
 *  - `negativo` — nem a ponta alta paga a mensalidade nesse faturamento.
 */
export type MigrationOutcome = "positivo" | "parcial" | "negativo";

export interface MigrationSavings {
  /** O que sai hoje de comissão, com a taxa informada pelo dono. */
  monthlyCommission: number;
  /** Comissão evitada ao migrar a ponta baixa/alta da faixa — ainda BRUTA. */
  grossLow: number;
  grossHigh: number;
  /** O que de fato sobra: a comissão evitada MENOS a mensalidade fixa. */
  netLow: number;
  netHigh: number;
  /** Faturamento a partir do qual cada cenário cobre a mensalidade. */
  breakEvenFull: number;
  breakEvenLow: number;
  breakEvenHigh: number;
  outcome: MigrationOutcome;
}

/** Fração migrada da ponta baixa/alta — reexportada para a tela não recalcular. */
export const MIGRATION_LOW = MIGRATION_RANGE.low;
export const MIGRATION_HIGH = MIGRATION_RANGE.high;

function safe(n: number): number {
  return Number.isFinite(n) && n > 0 ? n : 0;
}

/**
 * Total: entrada inutilizável devolve zeros em vez de `NaN` ou `Infinity`. Uma
 * calculadora que imprime "R$ NaN" numa página pública derruba o argumento inteiro.
 *
 * @param monthlyRevenue faturamento mensal no delivery, em reais.
 * @param ratePercent    a taxa que o dono informou, em % (23 = 23%).
 * @param planMonthly    a mensalidade fixa do Foocci, em reais.
 */
export function migrationSavings({
  monthlyRevenue,
  ratePercent,
  planMonthly,
}: {
  monthlyRevenue: number;
  ratePercent: number;
  planMonthly: number;
}): MigrationSavings {
  const revenue = safe(monthlyRevenue);
  const rate = safe(ratePercent) / 100;
  const fixed = safe(planMonthly);

  const monthlyCommission = revenue * rate;
  const grossLow = monthlyCommission * MIGRATION_LOW;
  const grossHigh = monthlyCommission * MIGRATION_HIGH;

  // O desconto que faltava. É ele, e só ele, que transforma "comissão evitada"
  // em "dinheiro que sobra".
  const netLow = grossLow - fixed;
  const netHigh = grossHigh - fixed;

  // Sem taxa não existe ponto de equilíbrio para calcular: devolver 0 em vez de
  // uma divisão por zero que imprimiria "R$ ∞ por mês".
  const breakEvenFull = rate > 0 ? fixed / rate : 0;
  const breakEvenLow = rate > 0 ? fixed / (rate * MIGRATION_LOW) : 0;
  const breakEvenHigh = rate > 0 ? fixed / (rate * MIGRATION_HIGH) : 0;

  const outcome: MigrationOutcome = netLow > 0 ? "positivo" : netHigh > 0 ? "parcial" : "negativo";

  return {
    monthlyCommission,
    grossLow,
    grossHigh,
    netLow,
    netHigh,
    breakEvenFull,
    breakEvenLow,
    breakEvenHigh,
    outcome,
  };
}
