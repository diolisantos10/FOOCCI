/**
 * Central delivery fee resolver.
 *
 * Single source of truth for delivery fee calculation used by the
 * delivery-quote endpoint and the finalize route.
 *
 * Distance mode formula:
 *   if distanceKm <= includedKm:  fee = baseFee (flat rate for included range)
 *   else:                         fee = baseFee + (distanceKm - includedKm) × pricePerKm
 *
 * DB field mapping for distance mode (owner-facing labels → DB columns):
 *   "Até X km: R$ Y"        → distanceBaseFee (Y)  +  distanceMinFeeKm (X)
 *   "Depois R$ Z/km"        → distancePricePerKm
 *   "Máximo de W km"        → distanceMaxKm
 *   "Taxa segura fallback"  → distanceMinFee  (ONLY used when distance is unknown)
 *
 * distanceMinFee is NOT a formula floor — it is exclusively the safe fallback
 * fee charged when the customer's distance cannot be geocoded.
 */

import { calcDeliveryFeeFromConfig, type DeliveryDistanceConfig } from "./delivery";
import { geocodeAddress, haversineDistanceKm, type LatLng, type GeocodableAddress } from "./geocoding";

// ── Types ─────────────────────────────────────────────────────────────────────

export type DeliveryCalculationStatus =
  | "pickup"                    // pickup / QR — fee is always 0
  | "manual"                    // manual mode — fee confirmed by operator
  | "simple"                    // flat fee
  | "free_delivery"             // free-delivery threshold applied
  | "distance_calculated"       // per-km formula applied with known distance
  | "distance_min_fee_fallback" // distance unknown; fallback safe fee used
  | "distance_blocked"          // distance unknown AND no safe fallback → block
  | "error";                    // unexpected / unknown mode

export interface DeliveryFeeResult {
  deliveryFee:         number;
  mode:                string;
  distanceKm:          number | null;
  baseFee:             number;
  includedKm:          number;
  pricePerKm:          number;
  minFee:              number | null;
  maxFee:              number | null;
  freeDeliveryApplied: boolean;
  calculationStatus:   DeliveryCalculationStatus;
  reason:              string;
}

export interface DeliveryResolverInput {
  mode:             string;
  deliveryType:     "delivery" | "pickup";
  subtotal:         number;
  address?:         GeocodableAddress | null;
  restaurantCoords?: LatLng | null;
  deliveryConfig: {
    fee?:               number | null;
    freeDeliveryAbove?: number | null;
    distanceBaseFee?:   number | null;
    distancePricePerKm?: number | null;
    distanceMinFee?:    number | null; // fallback safe fee (NOT a formula floor)
    distanceMinFeeKm?:  number | null; // km covered by the flat rate
    distanceMaxFee?:    number | null;
  };
}

// ── Resolver ──────────────────────────────────────────────────────────────────

export async function resolveDeliveryFee(input: DeliveryResolverInput): Promise<DeliveryFeeResult> {
  const { mode, deliveryType, subtotal, address, restaurantCoords, deliveryConfig } = input;

  // Pickup / QR — always free
  if (deliveryType === "pickup") {
    return mkResult(0, mode, null, 0, 0, 0, null, null, false, "pickup", "Retirada — sem taxa de entrega");
  }

  // Manual mode — operator agrees fee with customer
  if (mode === "manual") {
    return mkResult(0, mode, null, 0, 0, 0, null, null, false, "manual", "Taxa manual — a combinar com o restaurante");
  }

  // Free-delivery threshold (applies to all delivery modes)
  const freeAbove = deliveryConfig.freeDeliveryAbove != null ? Number(deliveryConfig.freeDeliveryAbove) : null;
  if (freeAbove != null && freeAbove > 0 && subtotal >= freeAbove) {
    return mkResult(0, mode, null, 0, 0, 0, null, null, true, "free_delivery",
      `Entrega grátis para pedidos acima de R$ ${freeAbove.toFixed(2)}`);
  }

  // Simple flat fee
  if (mode === "simple") {
    const fee = deliveryConfig.fee != null ? Number(deliveryConfig.fee) : 0;
    return mkResult(fee, mode, null, fee, 0, 0, null, null, false, "simple", "Taxa fixa de entrega");
  }

  // Distance-based fee
  if (mode === "distance") {
    const baseFee    = deliveryConfig.distanceBaseFee    != null ? Number(deliveryConfig.distanceBaseFee)    : 0;
    const pricePerKm = deliveryConfig.distancePricePerKm != null ? Number(deliveryConfig.distancePricePerKm) : 0;
    const includedKm = deliveryConfig.distanceMinFeeKm   != null ? Number(deliveryConfig.distanceMinFeeKm)   : 0;
    const maxFee     = deliveryConfig.distanceMaxFee     != null ? Number(deliveryConfig.distanceMaxFee)     : null;
    // fallbackSafeFee: used ONLY when distance cannot be calculated — never a formula floor
    const fallbackSafeFee = deliveryConfig.distanceMinFee != null ? Number(deliveryConfig.distanceMinFee) : null;

    const cfg: DeliveryDistanceConfig = {
      baseFee,
      minimumFee: null, // intentionally null — distanceMinFee is fallback only, not formula floor
      includedKm,
      pricePerKm,
      maxFee,
    };

    // Attempt distance calculation
    let distanceKm: number | null = null;
    if (address && restaurantCoords) {
      const customerCoords = await geocodeAddress(address);
      if (customerCoords) {
        const raw = haversineDistanceKm(restaurantCoords, customerCoords);
        distanceKm = Math.round(raw * 10) / 10; // round to 1 decimal
      }
    }

    // Distance known — apply per-km formula
    if (distanceKm != null) {
      const fee = calcDeliveryFeeFromConfig(cfg, distanceKm);
      console.info("[delivery-fee] distance calculated", { baseFee, includedKm, pricePerKm, distanceKm, fee });
      return mkResult(fee, mode, distanceKm, baseFee, includedKm, pricePerKm, fallbackSafeFee, maxFee, false,
        "distance_calculated",
        `${distanceKm.toFixed(1)} km → R$ ${fee.toFixed(2)}`);
    }

    // Distance unknown — use fallbackSafeFee if configured
    if (fallbackSafeFee != null && fallbackSafeFee > 0) {
      console.warn("[delivery-fee] distance unavailable — applying fallback safe fee", { baseFee, fallbackSafeFee, pricePerKm });
      return mkResult(fallbackSafeFee, mode, null, baseFee, includedKm, pricePerKm, fallbackSafeFee, maxFee, false,
        "distance_min_fee_fallback",
        `Distância não calculada — taxa segura de R$ ${fallbackSafeFee.toFixed(2)} aplicada`);
    }

    // Distance unknown AND no fallback → must block
    console.error("[delivery-fee] BLOCKED: distance mode, distance unavailable, no fallback safe fee configured", {
      baseFee, pricePerKm, address: address?.city,
    });
    return mkResult(0, mode, null, baseFee, includedKm, pricePerKm, null, maxFee, false,
      "distance_blocked",
      "Não conseguimos calcular a entrega para esse endereço. Confira o endereço ou fale com o restaurante.");
  }

  // Unknown / advanced mode
  return mkResult(0, mode, null, 0, 0, 0, null, null, false, "error", `Modo de entrega não reconhecido: ${mode}`);
}

function mkResult(
  deliveryFee: number, mode: string, distanceKm: number | null,
  baseFee: number, includedKm: number, pricePerKm: number,
  minFee: number | null, maxFee: number | null,
  freeDeliveryApplied: boolean,
  calculationStatus: DeliveryCalculationStatus, reason: string,
): DeliveryFeeResult {
  return { deliveryFee, mode, distanceKm, baseFee, includedKm, pricePerKm, minFee, maxFee, freeDeliveryApplied, calculationStatus, reason };
}
