/**
 * POST /api/admin/delivery-quote
 *
 * Calculates the delivery fee for a given address using the restaurant's
 * delivery configuration. Used by the Atendimento manual order modal so
 * operators see the exact fee before creating an order.
 *
 * Restricted to OWNER and MANAGER roles (session-based, no slug required).
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
  if (!["OWNER", "MANAGER"].includes(ctx.role)) {
    return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
  }

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
      select: {
        enabled: true,
        mode: true, fee: true, freeDeliveryAbove: true,
        distanceBaseFee: true, distancePricePerKm: true,
        distanceMinFee: true, distanceMinFeeKm: true, distanceMaxKm: true, distanceMaxFee: true,
      },
    }),
  ]);

  if (!deliveryCfg || !deliveryCfg.enabled) {
    return NextResponse.json({
      deliveryFee:       0,
      calculationStatus: "manual",
      reason:            "Entrega não configurada. Defina o frete manualmente.",
      totalPreview:      subtotal,
      distanceKm:        null,
      maxDistanceKm:     null,
    });
  }

  // Resolve restaurant coordinates
  let restaurantCoords: LatLng | null = null;
  const sp = restaurant?.storeProfile;
  if (sp?.latitude != null && sp?.longitude != null) {
    restaurantCoords = { lat: Number(sp.latitude), lng: Number(sp.longitude) };
  } else if (deliveryCfg.mode === "distance" && sp?.city) {
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
      }).catch((err: unknown) => console.error("[admin/delivery-quote] geocode persist failed", err));
    }
  }

  const result = await resolveDeliveryFee({
    mode:         deliveryCfg.mode,
    deliveryType: "delivery",
    subtotal,
    address:      { cep, street, number, neighborhood, city, state },
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

  return NextResponse.json({
    deliveryFee:       result.deliveryFee,
    calculationStatus: result.calculationStatus,
    reason:            result.reason,
    totalPreview:      subtotal + result.deliveryFee,
    distanceKm:        result.distanceKm ?? null,
    maxDistanceKm:     result.maxDistanceKm ?? null,
  });
}
