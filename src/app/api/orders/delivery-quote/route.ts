/**
 * POST /api/orders/delivery-quote
 *
 * Delivery-fee calculator for the dashboard ManualOrderModal.
 * Uses IDENTICAL logic to /api/pedido/[slug]/delivery-quote so operators
 * always see the same fee/authorization result as customers in /pedido.
 *
 * Key differences from the old /api/admin/delivery-quote:
 *   - Protected by Next.js middleware (JWT → x-restaurant-id headers injected).
 *     The admin path (/api/admin/**) bypasses middleware, so getTenantContext
 *     was always returning null → every call returned 401 "Não autorizado".
 *   - No `deliveryConfig.enabled` early-exit. The public /pedido route never
 *     checks `enabled`; this route matches that behavior exactly.
 *   - Falls back to mode:"simple" / empty config when no deliveryConfig,
 *     same as /api/pedido/[slug]/delivery-quote.
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getTenantContext } from "@/lib/tenant";
import { resolveDeliveryFee } from "@/lib/delivery-fee-resolver";
import { geocodeAddress, type LatLng } from "@/lib/geocoding";

const bodySchema = z.object({
  subtotal:     z.number().nonnegative(),
  cep:          z.string().default(""),
  street:       z.string().default(""),
  number:       z.string().default(""),
  neighborhood: z.string().default(""),
  city:         z.string().default(""),
  state:        z.string().default(""),
});

export async function POST(req: NextRequest) {
  const ctx = getTenantContext(req);
  if (!ctx) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const raw    = await req.json().catch(() => null);
  const parsed = bodySchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ error: "Dados inválidos" }, { status: 400 });
  }

  const { subtotal, cep, street, number, neighborhood, city, state } = parsed.data;
  const { restaurantId } = ctx;

  const [restaurant, deliveryCfg] = await Promise.all([
    prisma.restaurant.findUnique({
      where:  { id: restaurantId },
      select: {
        storeProfile: {
          select: {
            latitude: true, longitude: true,
            cep: true, street: true, streetNumber: true,
            neighborhood: true, city: true, state: true,
          },
        },
      },
    }),
    prisma.deliveryConfig.findUnique({
      where:  { restaurantId },
      // Intentionally not selecting `enabled` — same as public /pedido route.
      select: {
        mode: true, fee: true, freeDeliveryAbove: true,
        distanceBaseFee: true, distancePricePerKm: true,
        distanceMinFee: true, distanceMinFeeKm: true, distanceMaxKm: true, distanceMaxFee: true,
      },
    }),
  ]);

  let restaurantCoords: LatLng | null = null;
  const sp = restaurant?.storeProfile;
  if (sp?.latitude != null && sp?.longitude != null) {
    restaurantCoords = { lat: Number(sp.latitude), lng: Number(sp.longitude) };
  } else if (deliveryCfg?.mode === "distance" && sp?.city) {
    const coords = await geocodeAddress({
      cep:          sp.cep          ?? undefined,
      street:       sp.street       ?? undefined,
      number:       sp.streetNumber ?? undefined,
      neighborhood: sp.neighborhood ?? undefined,
      city:         sp.city         ?? undefined,
      state:        sp.state        ?? undefined,
    });
    if (coords) {
      restaurantCoords = coords;
      prisma.storeProfile.update({
        where: { restaurantId },
        data:  { latitude: coords.lat, longitude: coords.lng },
      }).catch((err: unknown) => console.error("[orders/delivery-quote] geocode persist failed", err));
    }
  }

  const result = await resolveDeliveryFee({
    mode:         deliveryCfg?.mode ?? "simple",
    deliveryType: "delivery",
    subtotal,
    address:      { cep, street, number, neighborhood, city, state },
    restaurantCoords,
    deliveryConfig: deliveryCfg
      ? {
          fee:                deliveryCfg.fee               != null ? Number(deliveryCfg.fee)               : null,
          freeDeliveryAbove:  deliveryCfg.freeDeliveryAbove != null ? Number(deliveryCfg.freeDeliveryAbove) : null,
          distanceBaseFee:    deliveryCfg.distanceBaseFee   != null ? Number(deliveryCfg.distanceBaseFee)   : null,
          distancePricePerKm: deliveryCfg.distancePricePerKm != null ? Number(deliveryCfg.distancePricePerKm) : null,
          distanceMinFee:     deliveryCfg.distanceMinFee    != null ? Number(deliveryCfg.distanceMinFee)    : null,
          distanceMinFeeKm:   deliveryCfg.distanceMinFeeKm  != null ? Number(deliveryCfg.distanceMinFeeKm)  : null,
          distanceMaxKm:      deliveryCfg.distanceMaxKm     != null ? Number(deliveryCfg.distanceMaxKm)     : null,
          distanceMaxFee:     deliveryCfg.distanceMaxFee    != null ? Number(deliveryCfg.distanceMaxFee)    : null,
        }
      : {},
  });

  return NextResponse.json({
    deliveryFee:       result.deliveryFee,
    calculationStatus: result.calculationStatus,
    reason:            result.reason,
    totalPreview:      subtotal + result.deliveryFee,
    distanceKm:        result.distanceKm ?? null,
    maxDistanceKm:     result.maxDistanceKm ?? null,
  });
}
