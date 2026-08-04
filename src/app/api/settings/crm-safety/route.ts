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
  applyEffectiveSafety,
} from "@/lib/crm-safety";
import { CustomerCouponService } from "@/services/crm/CustomerCouponService";

export async function GET(req: NextRequest) {
  try {
    const ctx = getTenantContext(req);
    if (!ctx) return unauthorized();

    const [profile, todaySent, weekSent, contactBudgetUsed, couponSpentThisMonth, couponUsedThisMonth, metaCfg] = await Promise.all([
      prisma.restaurantCRMProfile.findUnique({
        where:  { restaurantId: ctx.restaurantId },
        select: { whatsAppSafetyConfig: true },
      }),
      getTodayGlobalSendCount(ctx.restaurantId),
      getWeekGlobalSendCount(ctx.restaurantId),
      getConsumedContactCount(ctx.restaurantId),
      CustomerCouponService.monthlySpend(ctx.restaurantId),
      CustomerCouponService.monthlyUsedStats(ctx.restaurantId),
      prisma.metaWhatsAppConfig.findUnique({
        where:  { restaurantId: ctx.restaurantId },
        select: { metaCrmEnabled: true, connectionStatus: true, qualityRating: true, messagingLimit: true },
      }).catch(() => null),
    ]);

    const raw       = parseSafetyConfig(profile?.whatsAppSafetyConfig);
    const effective = applyEffectiveSafety(raw);
    // A UI liga o formulário em `raw`; com manualOverride DESLIGADO ela mostra
    // `effective` (travado). O bloco `limite` explica o número automático: desde
    // 04/08 ele é o teto do tier da Meta, e não mais a rampa de aquecimento da
    // sessão Web, que saiu junto com a Evolution.
    return ok({
      ...raw,
      todaySent, weekSent, contactBudgetUsed, couponSpentThisMonth,
      couponUsedCount: couponUsedThisMonth.count, couponUsedSpend: couponUsedThisMonth.spend,
      warmup:    {
        safeDailyLimit: effective.dailyGlobalCap,
        qualityRating:  metaCfg?.qualityRating  ?? null,
        messagingLimit: metaCfg?.messagingLimit ?? null,
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
    // right after saving (used count is unaffected by saving the total). Also
    // recompute `effective`/`warmup` (mirrors GET) so the UI keeps showing the
    // ENFORCED daily limit — e.g. 900 on Meta official — instead of falling back
    // to the raw saved number the instant after a save.
    const [contactBudgetUsed, metaCfg] = await Promise.all([
      getConsumedContactCount(ctx.restaurantId),
      prisma.metaWhatsAppConfig.findUnique({
        where:  { restaurantId: ctx.restaurantId },
        select: { qualityRating: true, messagingLimit: true },
      }).catch(() => null),
    ]);
    const effective = applyEffectiveSafety(config);
    return ok({
      ...config,
      contactBudgetUsed,
      warmup: {
        safeDailyLimit: effective.dailyGlobalCap,
        qualityRating:  metaCfg?.qualityRating  ?? null,
        messagingLimit: metaCfg?.messagingLimit ?? null,
      },
      effective,
    });
  } catch (err) {
    console.error("[PATCH /api/settings/crm-safety]", err);
    return serverError();
  }
}
