/**
 * Marketplace commission rates used by the public site's calculator.
 *
 * These numbers appear on a PUBLIC page, so two rules apply and neither is optional:
 *
 *   1. They live HERE, in one place. Rates change; a stale percentage copied into
 *      three components is a commercial liability that nobody notices until a lead
 *      quotes it back in a sales call.
 *   2. Every rate carries its `source` and `checkedAt`, and the page RENDERS them.
 *      A number without an origin is an invented number (guardrail 1) — and the one
 *      thing worse than not making the argument is making it with a figure we cannot
 *      defend in front of the restaurant owner.
 *
 * Origin: docs/foocci-site/os-repaginacao-comercial.md §2.2, public research of
 * 2026-08-02. The internal document names the marketplace; the PUBLIC PAGE must not.
 */

export interface CommissionRate {
  /** Fraction of revenue, e.g. 0.152 = 15,2%. */
  rate: number;
  label: string;
  /** Human-readable breakdown shown under the result. */
  breakdown: string;
}

/**
 * O nome do marketplace, EM UM LUGAR SÓ.
 *
 * HISTÓRICO, porque as duas decisões são do CEO e se contradizem — quem mexer aqui
 * precisa saber disso:
 *   - 2026-08-03: o marketplace NÃO era nomeado em lugar nenhum do site (nomear
 *     concorrente em comparação numa página comercial pública é exposição jurídica).
 *   - 2026-08-04: o CEO pediu o nome no gancho da home e no comparativo da
 *     calculadora — a pergunta "quanto o iFood leva" é o que faz o dono parar.
 *
 * A decisão nova venceu por ser posterior e explícita, mas o nome vive nesta
 * constante: se a exposição jurídica pesar mais que o gancho, some do site inteiro
 * numa linha. Nunca escreva o nome direto no componente.
 *
 * As porcentagens abaixo continuam sendo as tabelas públicas dos principais
 * marketplaces — a fonte é renderizada na página, com nome ou sem.
 */
export const MARKETPLACE_NAME = "iFood";

/**
 * A TAXA-PREMISSA — o único percentual que o site usa quando não há um informado
 * pelo próprio dono. Ler antes de mexer:
 *
 * Publicidade comparativa é lícita no Brasil desde que o dado seja **verdadeiro,
 * comprovável e não deprecie** o concorrente. Nós não temos como comprovar a tabela
 * de ninguém — cada contrato é diferente. Por isso o site NUNCA afirma "o
 * marketplace X cobra N%". Ele DECLARA uma premissa e faz a conta em cima dela:
 *
 *   ✅ "Considerando uma comissão de 23% — ajuste para a sua —, quem fatura
 *       R$ 20 mil paga R$ 4.600."
 *   ❌ "Restaurante de R$ 20 mil/mês no iFood paga R$ 3.040 de comissão."
 *
 * A calculadora da home deixa o visitante EDITAR esse número (o melhor caso: a conta
 * fica com os números dele). Onde a página é estática — `/site/precos` — o número
 * entra rotulado como premissa, com o convite para conferir na calculadora.
 *
 * Um lugar só, de propósito: premissa copiada em três arquivos vira três premissas
 * diferentes, e aí uma delas é mentira.
 */
export const ASSUMED_RATE_PERCENT = 23;

/** A premissa como fração, para as contas. */
export const ASSUMED_RATE = ASSUMED_RATE_PERCENT / 100;

/**
 * Where the percentages came from — rendered on the page, never hidden.
 *
 * The rates are the real, published ones. If anyone asks in a sales meeting, the
 * number is defensible.
 */
export const COMMISSION_SOURCE = {
  label: "Tabelas públicas dos principais marketplaces de delivery, consultadas em 08/2026",
  checkedAt: "2026-08-02",
} as const;

export const COMMISSION_RATES: Record<"own" | "marketplace", CommissionRate> = {
  own: {
    rate: 0.152,
    label: "Entrega própria",
    breakdown: "12% de comissão + 3,2% de taxa de pagamento",
  },
  marketplace: {
    rate: 0.265,
    label: "Entrega do marketplace",
    breakdown: "comissão, taxa de pagamento e logística do marketplace",
  },
};

/**
 * Share of revenue a restaurant realistically moves to its own channel in the first
 * months. Deliberately conservative: the argument has to survive the owner halving it.
 */
export const MIGRATION_RANGE = { low: 0.2, high: 0.35 } as const;

/**
 * What the four separate contracts cost when bought apart — the anchor.
 * Menu + POS + AI service + loyalty CRM, priced as four Brazilian categories.
 */
export const SEPARATE_STACK_MONTHLY = 700;

export interface CommissionResult {
  /** Monthly commission paid to the marketplace today. */
  monthlyCommission: number;
  /** Savings if the conservative share migrates to the direct channel. */
  savingsLow: number;
  /** Savings at the optimistic end of the range. */
  savingsHigh: number;
}

/**
 * Pure and total: an unusable input returns zeros rather than NaN. A calculator that
 * prints "R$ NaN" on a public page destroys the credibility of the whole argument.
 */
export function calculateCommission(
  monthlyRevenue: number,
  delivery: keyof typeof COMMISSION_RATES,
): CommissionResult {
  const revenue = Number.isFinite(monthlyRevenue) && monthlyRevenue > 0 ? monthlyRevenue : 0;
  const { rate } = COMMISSION_RATES[delivery];

  const monthlyCommission = revenue * rate;
  return {
    monthlyCommission,
    savingsLow: monthlyCommission * MIGRATION_RANGE.low,
    savingsHigh: monthlyCommission * MIGRATION_RANGE.high,
  };
}

export function formatBRL(value: number): string {
  return value.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
    maximumFractionDigits: 0,
  });
}
