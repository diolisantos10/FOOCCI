/**
 * FONTE ÚNICA do preço de plano da Foocci. Tudo que fala em dinheiro de plano —
 * a página pública `/site/precos`, o checkout self-service, o motor de assinatura
 * e o admin — lê DAQUI. Antes deste arquivo havia quatro tabelas de preço
 * separadas no repositório e nenhuma garantia de que o valor anunciado era o
 * valor cobrado; num checkout self-service isso vira cobrança diferente do
 * anunciado no primeiro cliente.
 *
 * ── A regra do CEO (04/08/2026), à risca ────────────────────────────────────
 * 1. O valor de cada CICLO na tabela É o valor cobrado. O anual já embute os dois
 *    meses grátis; o trimestral já embute os 10%. NÃO há desconto adicional a
 *    calcular sobre eles, e NÃO existe "preço fundador" no motor.
 * 2. O ÚNICO desconto é 50% no PRIMEIRO MÊS, para todo cliente novo, em qualquer
 *    plano e qualquer ciclo. A partir do segundo mês, valor cheio.
 *
 * ── Como "50% do primeiro mês" se aplica a um ciclo pago à vista ────────────
 * No mensal o desconto é a metade da cobrança. No trimestral e no anual o cliente
 * paga o ciclo inteiro de uma vez, então o abatimento é de MEIO MÊS daquele ciclo
 * — a leitura fiel de "só o primeiro mês pela metade". `firstChargeCents` é a
 * única função que expressa isso; ninguém mais calcula desconto.
 *
 * ── Por que nada aqui é arredondado "para ficar bonito" ─────────────────────
 * Metade de R$ 179,00 é R$ 89,50, não R$ 89,00. A página lê estes mesmos centavos
 * e imprime R$ 89,50. Arredondar o anúncio para baixo e cobrar outra coisa é
 * exatamente o furo que este arquivo fecha (guardrail: dinheiro não admite chute).
 */

// Type-only: apagado na compilação, não cria dependência de runtime do Prisma
// Client em componente de cliente. Serve só para travar os literais abaixo aos
// enums do banco — se alguém renomear o enum, isto quebra o `tsc`.
import type { BillingCycle, Plan } from "@prisma/client";

/** Código do plano no banco. */
export type PlanCode = "STARTER" | "GROWTH" | "PRO";
/** Código do ciclo no banco. */
export type CycleCode = "MENSAL" | "TRIMESTRAL" | "ANUAL";

// Travas de compilação: os literais acima TÊM de ser exatamente os enums do Prisma.
type _AssertPlan = PlanCode extends Plan ? (Plan extends PlanCode ? true : never) : never;
type _AssertCycle = CycleCode extends BillingCycle ? (BillingCycle extends CycleCode ? true : never) : never;
const _assertPlan: _AssertPlan = true;
const _assertCycle: _AssertCycle = true;
void _assertPlan;
void _assertCycle;

/** Como o plano se chama no site público. O banco fala STARTER; o cliente lê Essencial. */
export type SitePlanId = "essencial" | "crescimento" | "performance";

/**
 * O mapa que faltava: nome comercial do site → enum do banco. Sem ele o botão
 * "Contratar" da página de preços não tem como dizer ao servidor qual plano é.
 */
export const SITE_PLAN_TO_CODE: Record<SitePlanId, PlanCode> = {
  essencial: "STARTER",
  crescimento: "GROWTH",
  performance: "PRO",
};

export const CODE_TO_SITE_PLAN: Record<PlanCode, SitePlanId> = {
  STARTER: "essencial",
  GROWTH: "crescimento",
  PRO: "performance",
};

export const PLAN_LABEL: Record<PlanCode, string> = {
  STARTER: "Essencial",
  GROWTH: "Crescimento",
  PRO: "Performance",
};

export const CYCLE_LABEL: Record<CycleCode, string> = {
  MENSAL: "Mensal",
  TRIMESTRAL: "Trimestral",
  ANUAL: "Anual",
};

export const CYCLE_MONTHS: Record<CycleCode, number> = {
  MENSAL: 1,
  TRIMESTRAL: 3,
  ANUAL: 12,
};

export const SITE_PLAN_IDS: SitePlanId[] = ["essencial", "crescimento", "performance"];
export const CYCLE_CODES: CycleCode[] = ["MENSAL", "TRIMESTRAL", "ANUAL"];

/**
 * O VALOR COBRADO A CADA COBRANÇA, em centavos, por plano e ciclo.
 * É o total do ciclo — não a mensalidade equivalente. Tabela aprovada pelo CEO.
 *
 * Conferência com a tabela publicada:
 *   Essencial    179/mês · 483/trimestre · 1.790/ano
 *   Crescimento  429/mês · 1.158/trimestre · 4.290/ano
 *   Performance  899/mês · 2.427/trimestre · 8.990/ano
 */
export const PLAN_CYCLE_CENTS: Record<PlanCode, Record<CycleCode, number>> = {
  STARTER: { MENSAL: 17_900, TRIMESTRAL: 48_300, ANUAL: 179_000 },
  GROWTH: { MENSAL: 42_900, TRIMESTRAL: 115_800, ANUAL: 429_000 },
  PRO: { MENSAL: 89_900, TRIMESTRAL: 242_700, ANUAL: 899_000 },
};

/** Preço mensal de tabela por plano (compatibilidade com o motor antigo). */
export const PLAN_MONTHLY_CENTS: Record<PlanCode, number> = {
  STARTER: PLAN_CYCLE_CENTS.STARTER.MENSAL,
  GROWTH: PLAN_CYCLE_CENTS.GROWTH.MENSAL,
  PRO: PLAN_CYCLE_CENTS.PRO.MENSAL,
};

/** O que sai do cartão a cada renovação: o valor cheio do ciclo. */
export function recurringChargeCents(plan: PlanCode, cycle: CycleCode): number {
  return PLAN_CYCLE_CENTS[plan][cycle];
}

/** Mensalidade EQUIVALENTE do ciclo (só para exibição — ninguém é cobrado neste valor). */
export function monthlyEquivalentCents(plan: PlanCode, cycle: CycleCode): number {
  return Math.round(PLAN_CYCLE_CENTS[plan][cycle] / CYCLE_MONTHS[cycle]);
}

/** O abatimento do primeiro mês: metade de UM mês daquele ciclo. */
export function firstMonthDiscountCents(plan: PlanCode, cycle: CycleCode): number {
  const total = PLAN_CYCLE_CENTS[plan][cycle];
  return Math.round(total / CYCLE_MONTHS[cycle] / 2);
}

/**
 * O que sai do cartão na PRIMEIRA cobrança: o ciclo cheio menos meio mês.
 * No ciclo mensal isto é exatamente metade — a leitura literal da regra do CEO.
 */
export function firstChargeCents(plan: PlanCode, cycle: CycleCode): number {
  return PLAN_CYCLE_CENTS[plan][cycle] - firstMonthDiscountCents(plan, cycle);
}

/** Formata centavos em BRL. Uma única função — nenhuma tela improvisa a própria. */
export function formatBRL(cents: number): string {
  return (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

/** Converte o id do site em código do banco, ou null. Nunca chuta um plano. */
export function planCodeFromSiteId(id: string | null | undefined): PlanCode | null {
  if (!id) return null;
  return SITE_PLAN_TO_CODE[id as SitePlanId] ?? null;
}

/** Aceita tanto o id do site ("essencial") quanto o código ("STARTER"). */
export function normalizePlanCode(value: string | null | undefined): PlanCode | null {
  if (!value) return null;
  const upper = value.toUpperCase();
  if (upper === "STARTER" || upper === "GROWTH" || upper === "PRO") return upper;
  return planCodeFromSiteId(value.toLowerCase());
}

export function normalizeCycleCode(value: string | null | undefined): CycleCode | null {
  if (!value) return null;
  const upper = value.toUpperCase();
  if (upper === "MENSAL" || upper === "TRIMESTRAL" || upper === "ANUAL") return upper;
  return null;
}

/** Tudo o que uma tela precisa saber sobre um plano+ciclo, num objeto só. */
export interface PriceQuote {
  plan: PlanCode;
  cycle: CycleCode;
  months: number;
  /** Cobrado hoje (com os 50% do primeiro mês). */
  firstChargeCents: number;
  /** Cobrado a cada renovação. */
  recurringCents: number;
  discountCents: number;
  monthlyEquivalentCents: number;
}

export function quote(plan: PlanCode, cycle: CycleCode): PriceQuote {
  return {
    plan,
    cycle,
    months: CYCLE_MONTHS[cycle],
    firstChargeCents: firstChargeCents(plan, cycle),
    recurringCents: recurringChargeCents(plan, cycle),
    discountCents: firstMonthDiscountCents(plan, cycle),
    monthlyEquivalentCents: monthlyEquivalentCents(plan, cycle),
  };
}
