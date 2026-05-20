/**
 * Low-level formula used internally and in tests.
 *
 *   extraKm     = max(0, distanceKm - includedKm)
 *   deliveryFee = minimumFee + extraKm × pricePerKm
 *
 * `minimumFee` acts as both the base for the km calculation and the floor.
 * For the richer config-based formula (separate baseFee vs. minimumFee floor)
 * use `calcDeliveryFeeFromConfig` instead.
 */
export function calcDeliveryFee(
  distanceKm:  number,
  minimumFee:  number,
  pricePerKm:  number,
  includedKm:  number,
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

// ── Config-based formula (canonical, used in checkout and settings preview) ────

export interface DeliveryDistanceConfig {
  baseFee:    number | null | undefined;
  minimumFee: number | null | undefined; // floor; defaults to baseFee when null/undefined
  includedKm: number | null | undefined; // km covered by baseFee; 0 → every km is extra
  pricePerKm: number | null | undefined;
  maxFee:     number | null | undefined;
}

/**
 * Canonical distance delivery fee formula used across checkout, settings preview,
 * and order finalization.
 *
 *   baseFee    = base charge (always applied; also the starting point for per-km calc)
 *   minimumFee = floor guarantee (defaults to baseFee when not configured)
 *   extraKm    = max(0, distanceKm - includedKm)
 *   calculated = baseFee + extraKm × pricePerKm
 *   finalFee   = max(minimumFee, calculated)   ← floor applied here
 *
 * When distanceKm is null/undefined/NaN, treats distance as 0 (unknown distance
 * → baseFee is the safe fallback; never returns 0/Grátis when baseFee > 0).
 *
 * Examples (baseFee=5, minimumFee=null, includedKm=3, pricePerKm=1.8):
 *   distance=1    → 5.00   (≤ includedKm → only baseFee)
 *   distance=3    → 5.00   (exactly includedKm → only baseFee)
 *   distance=5    → 8.60   (5 + (5-3)*1.8)
 *   distance=null → 5.00   (unknown distance → baseFee fallback)
 */
export function calcDeliveryFeeFromConfig(
  config:     DeliveryDistanceConfig,
  distanceKm: number | null | undefined,
): number {
  const safeNum = (v: number | null | undefined) =>
    v != null && Number.isFinite(Number(v)) ? Math.max(0, Number(v)) : 0;

  const baseFee    = safeNum(config.baseFee);
  const minimumFee = (config.minimumFee != null && Number.isFinite(Number(config.minimumFee)))
    ? Math.max(0, Number(config.minimumFee))
    : baseFee; // when not configured, floor = baseFee
  const includedKm = safeNum(config.includedKm);
  const pricePerKm = safeNum(config.pricePerKm);
  const maxFee     = (config.maxFee != null && Number.isFinite(Number(config.maxFee)) && Number(config.maxFee) > 0)
    ? Number(config.maxFee) : null;

  const safeKm   = (distanceKm != null && Number.isFinite(Number(distanceKm)) && Number(distanceKm) >= 0)
    ? Number(distanceKm) : 0;

  const extraKm    = Math.max(0, safeKm - includedKm);
  const calculated = baseFee + extraKm * pricePerKm;
  const finalFee   = Math.max(minimumFee, calculated);
  const capped     = maxFee != null ? Math.min(finalFee, maxFee) : finalFee;

  return Math.round(capped * 100) / 100;
}
