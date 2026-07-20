/**
 * GET /api/admin/brain/delivery-xray?restaurantId=..
 *
 * Raio-x da configuração de ENTREGA do restaurante: DeliveryConfig completo
 * (modo simple/advanced/distance + todos os campos) + DeliveryZones (tiers por
 * distância/bairro). Read-only, só config de negócio (sem PII). Serve para
 * diagnosticar por que o Brain lê "taxa/área/mínimo não cadastrado": o dado
 * pode estar em outro modo (zonas/distância) que o snapshot ainda não lê.
 */

import { NextRequest, NextResponse } from "next/server";
import { checkAdminRequest } from "@/lib/admin-auth";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function num(v: unknown): number | null {
  if (v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

export async function GET(req: NextRequest) {
  if (!checkAdminRequest(req)) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }
  const restaurantId = req.nextUrl.searchParams.get("restaurantId");
  if (!restaurantId) {
    return NextResponse.json({ ok: false, error: "restaurantId é obrigatório." }, { status: 400 });
  }

  const [restaurant, cfg, zones] = await Promise.all([
    prisma.restaurant.findUnique({ where: { id: restaurantId }, select: { name: true, address: true } }).catch(() => null),
    prisma.deliveryConfig.findUnique({ where: { restaurantId } }).catch(() => null),
    prisma.deliveryZone
      .findMany({ where: { restaurantId }, orderBy: { sortOrder: "asc" } })
      .catch(() => [] as Array<Record<string, unknown>>),
  ]);

  const config = cfg
    ? {
        mode: cfg.mode,
        enabled: cfg.enabled,
        pickupEnabled: cfg.pickupEnabled,
        // simple
        fee: num(cfg.fee),
        estimatedMinutes: cfg.estimatedMinutes,
        areaDescription: cfg.areaDescription,
        // commercial (all modes)
        minOrderValue: num(cfg.minOrderValue),
        freeDeliveryAbove: num(cfg.freeDeliveryAbove),
        // distance
        distanceBaseFee: num(cfg.distanceBaseFee),
        distancePricePerKm: num(cfg.distancePricePerKm),
        distanceMaxKm: cfg.distanceMaxKm,
        distanceMinFee: num(cfg.distanceMinFee),
        distanceMaxFee: num(cfg.distanceMaxFee),
        // geo
        geoRadiusKm: cfg.geoRadiusKm,
        hasGeoCenter: Boolean(cfg.geoCenter),
      }
    : null;

  const zoneRows = zones.map((z) => ({
    name: z.name,
    maxDistanceKm: z.maxDistanceKm,
    fee: num(z.fee),
    estimatedMinutes: z.estimatedMinutes,
    minOrderValue: num(z.minOrderValue),
    isActive: z.isActive,
  }));

  // Diagnóstico: o que o adapter ATUAL do Brain leria vs o que existe.
  const brainSeesFee = config?.fee != null;
  const brainSeesArea = Boolean(config?.areaDescription) || config?.geoRadiusKm != null;
  const brainSeesMin = config?.minOrderValue != null;
  const dataExistsElsewhere = {
    feeInZones: zoneRows.some((z) => z.fee != null),
    feeInDistance: config?.distanceBaseFee != null || config?.distancePricePerKm != null,
    areaInZones: zoneRows.length > 0,
    minInZones: zoneRows.some((z) => z.minOrderValue != null),
  };

  return NextResponse.json({
    ok: true,
    restaurantId,
    restaurant: restaurant ? { name: restaurant.name, address: restaurant.address } : null,
    config,
    zonesCount: zoneRows.length,
    zones: zoneRows,
    diagnostico: {
      brainLeAtualmente: { taxa: brainSeesFee, area: brainSeesArea, minimo: brainSeesMin },
      dadoExisteEmOutroLugar: dataExistsElsewhere,
    },
    runtimeTouched: false,
  });
}
