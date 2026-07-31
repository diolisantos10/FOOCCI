/**
 * GET  /api/settings/crm-safety  — Return current safety config (with defaults)
 * PATCH /api/settings/crm-safety — Upsert safety config on RestaurantCRMProfile
 */

import { NextRequest } from "next/server";
import { getTenantContext } from "@/lib/tenant";
import { prisma } from "@/lib/prisma";
import { ok, unauthorized, serverError } from "@/lib/api-response";
import {
  parseSafetyConfig, getTodayGlobalSendCount, getWeekGlobalSendCount, getConsumedContactCount,
  getNumberAgeDays, warmupDailyLimit, applyEffectiveSafety,
} from "@/lib/crm-safety";
import { CustomerCouponService } from "@/services/crm/CustomerCouponService";

export async function GET(req: NextRequest) {
  try {
    const ctx = getTenantContext(req);
    if (!ctx) return unauthorized();

    const [profile, todaySent, weekSent, contactBudgetUsed, ageDays, couponSpentThisMonth, couponUsedThisMonth, metaCfg] = await Promise.all([
      prisma.restaurantCRMProfile.findUnique({
        where:  { restaurantId: ctx.restaurantId },
        select: { whatsAppSafetyConfig: true },
      }),
      getTodayGlobalSendCount(ctx.restaurantId),
      getWeekGlobalSendCount(ctx.restaurantId),
      getConsumedContactCount(ctx.restaurantId),
      getNumberAgeDays(ctx.restaurantId),
      CustomerCouponService.monthlySpend(ctx.restaurantId),
      CustomerCouponService.monthlyUsedStats(ctx.restaurantId),
      prisma.metaWhatsAppConfig.findUnique({
        where:  { restaurantId: ctx.restaurantId },
        select: { metaCrmEnabled: true, connectionStatus: true, qualityRating: true, messagingLimit: true },
      }).catch(() => null),
    ]);

    const metaOfficial = metaCfg?.metaCrmEnabled === true && metaCfg.connectionStatus === "CONNECTED";
    const raw       = parseSafetyConfig(profile?.whatsAppSafetyConfig);
    const effective = applyEffectiveSafety(raw, ageDays, { metaOfficial });
    // The UI binds the form to `raw`; when manualOverride is OFF it shows `effective`
    // (locked). `warmup` explains the auto daily number — on Meta official the safe
    // limit is the Meta-tier ceiling, not the Web-session warmup ramp.
    return ok({
      ...raw,
      todaySent, weekSent, contactBudgetUsed, couponSpentThisMonth,
      couponUsedCount: couponUsedThisMonth.count, couponUsedSpend: couponUsedThisMonth.spend,
      warmup:    {
        ageDays,
        safeDailyLimit: metaOfficial ? effective.dailyGlobalCap : warmupDailyLimit(ageDays),
        metaOfficial,
        qualityRating:  metaOfficial ? (metaCfg?.qualityRating ?? null) : null,
        messagingLimit: metaOfficial ? (metaCfg?.messagingLimit ?? null) : null,
      },
      effective,
    });
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

    // Return the live consumed count too so the "saldo" display stays correct
    // right after saving (used count is unaffected by saving the total).
    const contactBudgetUsed = await getConsumedContactCount(ctx.restaurantId);
    return ok({ ...config, contactBudgetUsed });
  } catch (err) {
    console.error("[PATCH /api/settings/crm-safety]", err);
    return serverError();
  }
}
