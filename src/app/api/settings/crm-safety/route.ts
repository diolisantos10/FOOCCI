/**
 * GET  /api/settings/crm-safety  — Return current safety config (with defaults)
 * PATCH /api/settings/crm-safety — Upsert safety config on RestaurantCRMProfile
 */

import { NextRequest } from "next/server";
import { getTenantContext } from "@/lib/tenant";
import { prisma } from "@/lib/prisma";
import { ok, unauthorized, serverError } from "@/lib/api-response";
import { parseSafetyConfig, getTodayGlobalSendCount, getWeekGlobalSendCount, getConsumedContactCount } from "@/lib/crm-safety";

export async function GET(req: NextRequest) {
  try {
    const ctx = getTenantContext(req);
    if (!ctx) return unauthorized();

    const [profile, todaySent, weekSent, contactBudgetUsed] = await Promise.all([
      prisma.restaurantCRMProfile.findUnique({
        where:  { restaurantId: ctx.restaurantId },
        select: { whatsAppSafetyConfig: true },
      }),
      getTodayGlobalSendCount(ctx.restaurantId),
      getWeekGlobalSendCount(ctx.restaurantId),
      getConsumedContactCount(ctx.restaurantId),
    ]);

    return ok({ ...parseSafetyConfig(profile?.whatsAppSafetyConfig), todaySent, weekSent, contactBudgetUsed });
  } catch (err) {
    console.error("[GET /api/settings/crm-safety]", err);
    return serverError();
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const ctx = getTenantContext(req);
    if (!ctx) return unauthorized();

    const body   = await req.json().catch(() => ({}));
    const config = parseSafetyConfig(body);

    await prisma.restaurantCRMProfile.upsert({
      where:  { restaurantId: ctx.restaurantId },
      create: {
        restaurantId:         ctx.restaurantId,
        whatsAppSafetyConfig: config as object,
      },
      update: {
        whatsAppSafetyConfig: config as object,
      },
    });

    return ok(config);
  } catch (err) {
    console.error("[PATCH /api/settings/crm-safety]", err);
    return serverError();
  }
}
