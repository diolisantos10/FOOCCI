/**
 * GET /api/settings/store/geocode-status
 *
 * Lightweight status check used by the delivery settings page readiness box.
 * Returns whether the restaurant has GPS coordinates and a usable address.
 */

import { NextRequest } from "next/server";
import { getTenantContext } from "@/lib/tenant";
import { prisma } from "@/lib/prisma";
import { ok, unauthorized, serverError } from "@/lib/api-response";

export async function GET(req: NextRequest) {
  try {
    const ctx = getTenantContext(req);
    if (!ctx) return unauthorized();

    const profile = await prisma.storeProfile.findUnique({
      where:  { restaurantId: ctx.restaurantId },
      select: { latitude: true, longitude: true, cep: true, street: true, city: true, state: true },
    });

    const hasCoords  = profile?.latitude != null && profile?.longitude != null;
    const hasAddress = !!(profile?.city && (profile?.cep || profile?.street));

    return ok({ hasCoords, hasAddress });
  } catch (err) {
    console.error("[GET /api/settings/store/geocode-status]", err);
    return serverError();
  }
}
