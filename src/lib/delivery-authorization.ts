/**
 * Single source of truth for deciding whether a delivery quote authorizes a
 * DELIVERY order to proceed. Shared by the manual-order modal (frontend) and
 * POST /api/orders/manual (backend) so the guard cannot be bypassed.
 *
 * Allowlist semantics: a quote is authorized ONLY when its calculationStatus is
 * explicitly listed here. Anything else — out_of_range, distance_blocked,
 * error, a 401/"Não autorizado" response, or any future/unknown status — blocks.
 */

export const AUTHORIZED_QUOTE_STATUSES: ReadonlySet<string> = new Set([
  "manual",                    // operator confirms the fee manually
  "simple",                    // flat fee
  "free_delivery",             // free-delivery threshold applied
  "distance_calculated",       // per-km formula applied with known distance
  "distance_min_fee_fallback", // distance unknown; safe fallback fee used
]);

/** A status is blocked unless it is on the authorized allowlist. */
export function isQuoteStatusBlocked(status: string | null | undefined): boolean {
  return !status || !AUTHORIZED_QUOTE_STATUSES.has(status);
}

/**
 * A delivery quote authorizes proceeding only when it carries an authorized
 * status AND a valid non-negative numeric fee.
 */
export function isDeliveryQuoteAuthorized(
  quote: { calculationStatus?: string | null; deliveryFee?: number | null } | null | undefined,
): boolean {
  if (!quote) return false;
  if (isQuoteStatusBlocked(quote.calculationStatus)) return false;
  const fee = quote.deliveryFee;
  return typeof fee === "number" && Number.isFinite(fee) && fee >= 0;
}
