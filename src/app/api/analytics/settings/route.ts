/**
 * GET   /api/analytics/settings — get GA4/GTM IDs for the restaurant
 * PATCH /api/analytics/settings — save GA4/GTM IDs
 */

import { NextRequest } from "next/server";
import { z } from "zod";
import { getTenantContext } from "@/lib/tenant";
import { prisma } from "@/lib/prisma";
import { ok, badRequest, unauthorized, serverError } from "@/lib/api-response";

const patchSchema = z.object({
  ga4MeasurementId: z.string().max(30).nullable().optional(),
  gtmId:            z.string().max(20).nullable().optional(),
});

export async function GET(req: NextRequest) {
  try {
    const ctx = getTenantContext(req);
    if (!ctx) return unauthorized();

    const config = await prisma.restaurantBrandConfig.findUnique({
      where:  { restaurantId: ctx.restaurantId },
      select: { ga4MeasurementId: true, gtmId: true },
    });

    return ok({ ga4MeasurementId: config?.ga4MeasurementId ?? null, gtmId: config?.gtmId ?? null });
  } catch (err) {
    console.error("[GET /api/analytics/settings]", err);
    return serverError();
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const ctx = getTenantContext(req);
    if (!ctx) return unauthorized();

    const raw    = await req.json().catch(() => null);
    const parsed = patchSchema.safeParse(raw);
    if (!parsed.success) return badRequest("Validation failed", parsed.error.flatten());

    const config = await prisma.restaurantBrandConfig.upsert({
      where:  { restaurantId: ctx.restaurantId },
      update: parsed.data,
      create: { restaurantId: ctx.restaurantId, ...parsed.data },
      select: { ga4MeasurementId: true, gtmId: true },
    });

    return ok(config);
  } catch (err) {
    console.error("[PATCH /api/analytics/settings]", err);
    return serverError();
  }
}
