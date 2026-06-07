/**
 * WhatsAppDeliveryService — delivery/freight wrapper for WhatsApp text ordering.
 *
 * Reuses the canonical resolveDeliveryFee() — does NOT implement parallel freight
 * logic. Loads the restaurant's delivery config + coords and returns a
 * WhatsApp-friendly quote. Read-only (no mutation).
 */

import { prisma } from "@/lib/prisma";
import { resolveDeliveryFee } from "@/lib/delivery-fee-resolver";
import type { WaAddress, WaDeliveryQuote } from "./types";

export interface WaDeliveryInput {
  restaurantId: string;
  subtotal:     number;
  address:      WaAddress;
}

/** Quotes the delivery fee for an address using the shared resolver. */
export async function quoteWhatsAppDelivery(input: WaDeliveryInput): Promise<WaDeliveryQuote> {
  const { restaurantId, subtotal, address } = input;

  // Need at least a street to attempt geocoding
  if (!address.street || !address.number) {
    return { fee: 0, status: "unknown", reason: "endereço incompleto" };
  }

  const [deliveryCfg, restaurant] = await Promise.all([
    prisma.deliveryConfig.findUnique({
      where:  { restaurantId },
      select: {
        mode: true, fee: true, freeDeliveryAbove: true,
        distanceBaseFee: true, distancePricePerKm: true,
        distanceMinFee: true, distanceMinFeeKm: true, distanceMaxKm: true, distanceMaxFee: true,
      },
    }),
    prisma.restaurant.findUnique({
      where:  { id: restaurantId },
      select: { storeProfile: { select: { latitude: true, longitude: true } } },
    }),
  ]);

  if (!deliveryCfg) {
    return { fee: 0, status: "unknown", reason: "entrega não configurada" };
  }

  const restaurantCoords =
    restaurant?.storeProfile?.latitude != null && restaurant?.storeProfile?.longitude != null
      ? { lat: Number(restaurant.storeProfile.latitude), lng: Number(restaurant.storeProfile.longitude) }
      : null;

  const result = await resolveDeliveryFee({
    mode:         deliveryCfg.mode ?? "simple",
    deliveryType: "delivery",
    subtotal,
    address: {
      street:       address.street ?? "",
      number:       address.number ?? "",
      neighborhood: address.neighborhood ?? "",
      city:         address.city ?? "",
      state:        address.state ?? "",
      cep:          address.cep ?? "",
    },
    restaurantCoords,
    deliveryConfig: {
      fee:                deliveryCfg.fee               != null ? Number(deliveryCfg.fee)               : null,
      freeDeliveryAbove:  deliveryCfg.freeDeliveryAbove != null ? Number(deliveryCfg.freeDeliveryAbove) : null,
      distanceBaseFee:    deliveryCfg.distanceBaseFee   != null ? Number(deliveryCfg.distanceBaseFee)   : null,
      distancePricePerKm: deliveryCfg.distancePricePerKm != null ? Number(deliveryCfg.distancePricePerKm) : null,
      distanceMinFee:     deliveryCfg.distanceMinFee    != null ? Number(deliveryCfg.distanceMinFee)    : null,
      distanceMinFeeKm:   deliveryCfg.distanceMinFeeKm  != null ? Number(deliveryCfg.distanceMinFeeKm)  : null,
      distanceMaxKm:      deliveryCfg.distanceMaxKm     != null ? Number(deliveryCfg.distanceMaxKm)     : null,
      distanceMaxFee:     deliveryCfg.distanceMaxFee    != null ? Number(deliveryCfg.distanceMaxFee)    : null,
    },
  });

  // Map resolver status → WhatsApp quote status
  if (result.calculationStatus === "out_of_range") {
    return { fee: 0, distanceKm: result.distanceKm ?? undefined, status: "out_of_range", reason: result.reason };
  }
  if (result.calculationStatus === "distance_blocked" || result.calculationStatus === "error") {
    return { fee: 0, status: "blocked", reason: result.reason };
  }
  return {
    fee:        result.deliveryFee,
    distanceKm: result.distanceKm ?? undefined,
    status:     "ok",
    reason:     result.reason,
  };
}
