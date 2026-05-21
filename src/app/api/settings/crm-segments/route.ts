/**
 * GET  /api/settings/crm-segments  — Return current segment config (with defaults)
 * PATCH /api/settings/crm-segments — Upsert segmentConfig on RestaurantCRMProfile
 */

import { NextRequest } from "next/server";
import { getTenantContext } from "@/lib/tenant";
import { prisma } from "@/lib/prisma";
import { ok, unauthorized, serverError } from "@/lib/api-response";
import { parseSegmentConfig } from "@/lib/crm-segments";

export async function GET(req: NextRequest) {
  try {
    const ctx = getTenantContext(req);
    if (!ctx) return unauthorized();

    const profile = await prisma.restaurantCRMProfile.findUnique({
      where:  { restaurantId: ctx.restaurantId },
      select: { segmentConfig: true },
    });

    return ok(parseSegmentConfig(profile?.segmentConfig));
  } catch (err) {
    console.error("[GET /api/settings/crm-segments]", err);
    return serverError();
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const ctx = getTenantContext(req);
    if (!ctx) return unauthorized();

    const body   = await req.json().catch(() => ({}));
    const config = parseSegmentConfig(body);

    await prisma.restaurantCRMProfile.upsert({
      where:  { restaurantId: ctx.restaurantId },
      create: {
        restaurantId:  ctx.restaurantId,
        segmentConfig: config as object,
      },
      update: {
        segmentConfig: config as object,
      },
    });

    return ok(config);
  } catch (err) {
    console.error("[PATCH /api/settings/crm-segments]", err);
    return serverError();
  }
}
