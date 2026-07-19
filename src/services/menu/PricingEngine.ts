/**
 * PricingEngine — pure math for CMV & markup pricing (/precificacao).
 *
 * Markup model (industry standard for food service):
 *   markup = 100 / (100 − (fixas% + impostos/taxas% + margem%))
 *   ideal  = cost × markup, then rounded per PriceRounding
 *
 * Everything here is PURE (no I/O, plain numbers) so the same functions drive
 * the page preview, the API endpoints and the auto-reprice device, and are
 * unit-tested in isolation. Prisma Decimals must be converted by the caller.
 */

export type RoundingMode = "NONE" | "ENDING_90" | "ENDING_99";

export type PriceStatus = "BELOW" | "ON_TARGET" | "ABOVE";

export interface MarkupAssumptions {
  fixedPct: number;        // despesas fixas como % do faturamento
  taxesFeesPct: number;    // impostos + taxas de cartão/apps
  targetProfitPct: number; // margem de lucro desejada
}

export interface MarkupResult {
  markup: number;   // multiplier, e.g. 2.86
  totalPct: number; // sum of the three assumption percentages
}

/** Healthy CMV band for restaurants (sector benchmark). */
export const CMV_HEALTHY_MIN_PCT = 25;
export const CMV_HEALTHY_MAX_PCT = 35;

/** Within this % of the current price, current and ideal count as "on target". */
export const ON_TARGET_TOLERANCE_PCT = 2;

function isFiniteNonNegative(n: number | null | undefined): n is number {
  return typeof n === "number" && Number.isFinite(n) && n >= 0;
}

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/**
 * Fixed expenses as % of revenue (R$ 17.000 / R$ 85.000 → 20).
 * Null when either input is missing or revenue is zero — the caller shows
 * "informe o faturamento" instead of a bogus percentage.
 */
export function computeFixedPct(
  monthlyRevenue: number | null | undefined,
  fixedExpensesMonthly: number | null | undefined
): number | null {
  if (!isFiniteNonNegative(monthlyRevenue) || monthlyRevenue <= 0) return null;
  if (!isFiniteNonNegative(fixedExpensesMonthly)) return null;
  return round2((fixedExpensesMonthly / monthlyRevenue) * 100);
}

/**
 * markup = 100 / (100 − totalPct). Null when the assumptions are impossible
 * (totalPct ≥ 100 would mean the price is 100%+ consumed before the cost).
 */
export function computeMarkup(a: MarkupAssumptions): MarkupResult | null {
  const parts = [a.fixedPct, a.taxesFeesPct, a.targetProfitPct];
  if (!parts.every((p) => Number.isFinite(p) && p >= 0)) return null;
  const totalPct = round2(a.fixedPct + a.taxesFeesPct + a.targetProfitPct);
  if (totalPct >= 100) return null;
  return { markup: 100 / (100 - totalPct), totalPct };
}

/**
 * Round a raw price UP to the configured psychological ending.
 *   ENDING_90: 48.05 → 48.90 · 48.95 → 49.90 · 30.90 → 30.90
 *   ENDING_99: 48.05 → 48.99 · 49.00 → 49.99
 * Rounding never goes below the raw value, so a rounded ideal price never
 * undercuts the margin the formula asked for.
 */
export function roundPrice(value: number, mode: RoundingMode): number {
  if (!Number.isFinite(value) || value <= 0) return round2(Math.max(value, 0));
  if (mode === "NONE") return round2(value);

  const ending = mode === "ENDING_90" ? 0.9 : 0.99;
  const floor = Math.floor(value);
  const candidate = round2(floor + ending);
  // round2 both sides: 48.90 must not bump to 49.90 from float noise
  return candidate >= round2(value) ? candidate : round2(floor + 1 + ending);
}

/**
 * The ideal selling price for a unit cost under a markup, after rounding.
 * Null when there is no usable cost (null/0) or no valid markup.
 */
export function idealPrice(
  cost: number | null | undefined,
  markup: number | null,
  rounding: RoundingMode
): number | null {
  if (!isFiniteNonNegative(cost) || cost <= 0) return null;
  if (markup === null || !Number.isFinite(markup) || markup < 1) return null;
  const rounded = roundPrice(cost * markup, rounding);
  // Guardrail: never suggest selling below cost (markup 1.0 + NONE lands at cost).
  return rounded < cost ? roundPrice(cost, rounding) : rounded;
}

/** CMV of one item = cost / price, as %. Null without a usable cost/price. */
export function cmvPct(
  cost: number | null | undefined,
  price: number | null | undefined
): number | null {
  if (!isFiniteNonNegative(cost) || cost <= 0) return null;
  if (!isFiniteNonNegative(price) || price <= 0) return null;
  return round2((cost / price) * 100);
}

export interface PeriodCmvInput {
  openingStock: number | null | undefined;
  purchases: number | null | undefined;
  closingStock: number | null | undefined;
  revenue: number | null | undefined;
}

/**
 * CMV do período = (estoque inicial + compras − estoque final) / faturamento.
 * Null until all four figures are informed (revenue > 0).
 */
export function periodCmvPct(input: PeriodCmvInput): number | null {
  const { openingStock, purchases, closingStock, revenue } = input;
  if (
    !isFiniteNonNegative(openingStock) ||
    !isFiniteNonNegative(purchases) ||
    !isFiniteNonNegative(closingStock) ||
    !isFiniteNonNegative(revenue) ||
    revenue <= 0
  ) {
    return null;
  }
  const cmv = openingStock + purchases - closingStock;
  return round2((cmv / revenue) * 100);
}

/**
 * Compare current price vs ideal:
 *   BELOW     → current is under the ideal (candidate to raise)
 *   ON_TARGET → within tolerance of the ideal
 *   ABOVE     → current already carries extra margin (keep or lower by choice)
 */
export function classifyPrice(
  currentPrice: number,
  ideal: number,
  tolerancePct: number = ON_TARGET_TOLERANCE_PCT
): PriceStatus {
  const tolerance = Math.max((currentPrice * tolerancePct) / 100, 0.05);
  const diff = ideal - currentPrice;
  if (Math.abs(diff) <= tolerance) return "ON_TARGET";
  return diff > 0 ? "BELOW" : "ABOVE";
}

/** Signed % variation from oldPrice to newPrice (e.g. 42.90 → 48.90 = +13.99). */
export function changePct(oldPrice: number, newPrice: number): number | null {
  if (!isFiniteNonNegative(oldPrice) || oldPrice <= 0) return null;
  if (!isFiniteNonNegative(newPrice)) return null;
  return round2(((newPrice - oldPrice) / oldPrice) * 100);
}

export const PricingEngine = {
  computeFixedPct,
  computeMarkup,
  roundPrice,
  idealPrice,
  cmvPct,
  periodCmvPct,
  classifyPrice,
  changePct,
  CMV_HEALTHY_MIN_PCT,
  CMV_HEALTHY_MAX_PCT,
  ON_TARGET_TOLERANCE_PCT,
};
