/**
 * Unified delivery fee formula.
 *
 * The minimum fee covers the first `includedKm` kilometres.
 * Beyond that, each additional km is charged at `pricePerKm`.
 *
 *   extraKm     = max(0, distanceKm - includedKm)
 *   deliveryFee = minimumFee + extraKm × pricePerKm
 *
 * Capped at maxFee when provided.
 * Returns minimumFee when distanceKm ≤ includedKm (or when distanceKm = 0).
 *
 * All inputs are coerced to safe non-negative numbers before calculation.
 * Result is rounded to 2 decimal places (monetary precision).
 *
 * Examples (minimumFee=5, includedKm=3, pricePerKm=2):
 *   distance=0   → 5
 *   distance=2.5 → 5
 *   distance=3   → 5
 *   distance=4   → 7
 *   distance=5   → 9
 *   distance=NaN → 5 (falls back to minimumFee)
 */
export function calcDeliveryFee(
  distanceKm:  number,
  minimumFee:  number,
  pricePerKm:  number,
  includedKm:  number,   // km included in minimumFee; default 0 for backwards compat
  maxFee:      number | null,
): number {
  const safeKm   = Number.isFinite(distanceKm)  && distanceKm  >= 0 ? distanceKm  : 0;
  const safeMin  = Number.isFinite(minimumFee)   && minimumFee  >= 0 ? minimumFee  : 0;
  const safeRate = Number.isFinite(pricePerKm)   && pricePerKm  >= 0 ? pricePerKm  : 0;
  const safeIncl = Number.isFinite(includedKm)   && includedKm  >= 0 ? includedKm  : 0;

  const extraKm = Math.max(0, safeKm - safeIncl);
  let fee = safeMin + extraKm * safeRate;

  if (maxFee != null && Number.isFinite(maxFee) && maxFee > 0 && fee > maxFee) {
    fee = maxFee;
  }

  return Math.round(fee * 100) / 100;
}
