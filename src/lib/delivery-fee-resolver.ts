/**
 * Central delivery fee resolver.
 *
 * Single source of truth for delivery fee calculation used by both the
 * delivery-quote endpoint and the finalize route. Handles all delivery modes.
 *
 * Distance mode: attempts geocoding via Nominatim (free) or Google Maps
 * (GOOGLE_MAPS_API_KEY). If distance cannot be computed:
 *   - Uses distanceMinFee as a safe fallback when configured.
 *   - Returns calculationStatus="distance_blocked" (checkout must be rejected)
 *     when no safe fallback is available.
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
  | "distance_min_fee_fallback" // distance unknown; distanceMinFee used as floor
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
    distanceMinFee?:    number | null;
    distanceMinFeeKm?:  number | null;
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
    const cfg: DeliveryDistanceConfig = {
      baseFee:    deliveryConfig.distanceBaseFee    != null ? Number(deliveryConfig.distanceBaseFee)    : 0,
      minimumFee: deliveryConfig.distanceMinFee     != null ? Number(deliveryConfig.distanceMinFee)     : null,
      includedKm: deliveryConfig.distanceMinFeeKm   != null ? Number(deliveryConfig.distanceMinFeeKm)   : 0,
      pricePerKm: deliveryConfig.distancePricePerKm != null ? Number(deliveryConfig.distancePricePerKm) : 0,
      maxFee:     deliveryConfig.distanceMaxFee     != null ? Number(deliveryConfig.distanceMaxFee)     : null,
    };
    const baseFee    = Number(cfg.baseFee    ?? 0);
    const includedKm = Number(cfg.includedKm ?? 0);
    const pricePerKm = Number(cfg.pricePerKm ?? 0);
    const minFee     = cfg.minimumFee != null ? Number(cfg.minimumFee) : null;
    const maxFee     = cfg.maxFee     != null ? Number(cfg.maxFee)     : null;

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
      return mkResult(fee, mode, distanceKm, baseFee, includedKm, pricePerKm, minFee, maxFee, false,
        "distance_calculated",
        `${distanceKm.toFixed(1)} km → R$ ${baseFee} + max(0, ${distanceKm}−${includedKm}) × ${pricePerKm} = R$ ${fee.toFixed(2)}`);
    }

    // Distance unknown — use distanceMinFee as guaranteed fallback
    if (minFee != null && minFee > 0) {
      console.warn("[delivery-fee] distance unavailable — applying distanceMinFee fallback", { baseFee, minFee, pricePerKm });
      return mkResult(minFee, mode, null, baseFee, includedKm, pricePerKm, minFee, maxFee, false,
        "distance_min_fee_fallback",
        `Distância não calculada — taxa mínima de R$ ${minFee.toFixed(2)} aplicada`);
    }

    // Distance unknown AND no minFee → must block
    console.error("[delivery-fee] BLOCKED: distance mode, distance unavailable, no distanceMinFee configured", {
      baseFee, pricePerKm, address: address?.city,
      hint: "Configure distanceMinFee to avoid blocking orders when distance cannot be calculated",
    });
    return mkResult(0, mode, null, baseFee, includedKm, pricePerKm, null, maxFee, false,
      "distance_blocked",
      "Não foi possível calcular a distância para esse endereço. Verifique o endereço ou entre em contato com o restaurante.");
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
