/**
 * POST /api/pedido/[slug]/delivery-quote
 *
 * Returns the delivery fee for a given address before the customer finalizes.
 * Frontend calls this after address confirmation so the customer sees the exact
 * fee (including geocoded distance) before committing to the order.
 *
 * If calculationStatus === "distance_blocked", the frontend must prevent checkout.
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { resolveDeliveryFee } from "@/lib/delivery-fee-resolver";
import { geocodeAddress, type LatLng } from "@/lib/geocoding";
import { rateLimit, getClientIp, rateLimitResponse } from "@/lib/rate-limit";

const bodySchema = z.object({
  deliveryType: z.enum(["delivery", "pickup"]),
  subtotal:     z.number().nonnegative(),
  address:      z.object({
    cep:          z.string().default(""),
    street:       z.string().default(""),
    number:       z.string().default(""),
    neighborhood: z.string().default(""),
    city:         z.string().default(""),
    state:        z.string().default(""),
  }).optional().nullable(),
});

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  const ip = getClientIp(req);
  const rl = rateLimit({ key: `delivery-quote:${ip}`, limit: 20, windowMs: 60_000 });
  if (rl.limited) return rateLimitResponse(rl.retryAfter);

  const { slug } = await params;

  const restaurant = await prisma.restaurant.findUnique({
    where:  { slug },
    select: {
      id: true,
      storeProfile: {
        select: {
          latitude: true, longitude: true,
          cep: true, street: true, streetNumber: true,
          neighborhood: true, city: true, state: true,
        },
      },
    },
  });
  if (!restaurant) {
    return NextResponse.json({ error: "Restaurante não encontrado" }, { status: 404 });
  }

  const raw    = await req.json().catch(() => null);
  const parsed = bodySchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ error: "Dados inválidos", issues: parsed.error.issues }, { status: 400 });
  }

  const { deliveryType, subtotal, address } = parsed.data;

  const deliveryCfg = await prisma.deliveryConfig.findUnique({
    where:  { restaurantId: restaurant.id },
    select: {
      mode: true, fee: true, freeDeliveryAbove: true,
      distanceBaseFee: true, distancePricePerKm: true,
      distanceMinFee: true, distanceMinFeeKm: true, distanceMaxKm: true, distanceMaxFee: true,
    },
  });

  // Resolve restaurant coordinates — geocode on the fly when missing so distance
  // mode works even for restaurants that were registered before auto-geocoding.
  let restaurantCoords: LatLng | null = null;
  const sp = restaurant.storeProfile;
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
      // Save coords to DB so subsequent requests don't need to geocode again.
      prisma.storeProfile.update({
        where: { restaurantId: restaurant.id },
        data:  { latitude: coords.lat, longitude: coords.lng },
      }).catch((err: unknown) => console.error("[delivery-quote] failed to persist geocode", err));
    }
  }

  const result = await resolveDeliveryFee({
    mode:         deliveryCfg?.mode ?? "simple",
    deliveryType,
    subtotal,
    address:      address ?? null,
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
    distanceKm:        result.distanceKm,
    maxDistanceKm:     result.maxDistanceKm,
    calculationStatus: result.calculationStatus,
    reason:            result.reason,
    totalPreview:      subtotal + result.deliveryFee,
  });
}
