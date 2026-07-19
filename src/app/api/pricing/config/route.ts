import { NextRequest } from "next/server";
import { getTenantContext } from "@/lib/tenant";
import { prisma } from "@/lib/prisma";
import { ok, badRequest, unauthorized, forbidden, serverError } from "@/lib/api-response";
import { pricingConfigSchema } from "@/validators/pricing";
import {
  fetchItemsState,
  getOrCreateConfig,
  repriceAllAfterConfigChange,
} from "@/services/menu/RepriceService";
import type { RestaurantPricingConfig } from "@prisma/client";
import { Decimal } from "@prisma/client/runtime/library";

const num = (d: Decimal | null): number | null => (d === null ? null : Number(d));

function serializeConfig(config: RestaurantPricingConfig) {
  return {
    monthlyRevenue: num(config.monthlyRevenue),
    fixedExpensesMonthly: num(config.fixedExpensesMonthly),
    taxesFeesPct: Number(config.taxesFeesPct),
    targetProfitPct: Number(config.targetProfitPct),
    autoRepriceMode: config.autoRepriceMode,
    rounding: config.rounding,
    maxAutoChangePct: Number(config.maxAutoChangePct),
    periodOpeningStock: num(config.periodOpeningStock),
    periodPurchases: num(config.periodPurchases),
    periodClosingStock: num(config.periodClosingStock),
    periodRevenue: num(config.periodRevenue),
    updatedAt: config.updatedAt.toISOString(),
  };
}

export type SerializedPricingConfig = ReturnType<typeof serializeConfig>;

export async function GET(req: NextRequest) {
  try {
    const ctx = getTenantContext(req);
    if (!ctx) return unauthorized();

    const config = await getOrCreateConfig(ctx.restaurantId);
    return ok(serializeConfig(config));
  } catch (err) {
    console.error("[GET /api/pricing/config]", err);
    return serverError();
  }
}

export async function PUT(req: NextRequest) {
  try {
    const ctx = getTenantContext(req);
    if (!ctx) return unauthorized();
    if (!["OWNER", "MANAGER"].includes(ctx.role)) return forbidden();

    const body = await req.json();
    const parsed = pricingConfigSchema.safeParse(body);
    if (!parsed.success) return badRequest("Validation failed", parsed.error.flatten());

    const d = parsed.data;
    const toDecimal = (v: number | null | undefined) =>
      v === null || v === undefined ? null : new Decimal(v.toFixed(2));

    const data = {
      monthlyRevenue: toDecimal(d.monthlyRevenue),
      fixedExpensesMonthly: toDecimal(d.fixedExpensesMonthly),
      taxesFeesPct: new Decimal(d.taxesFeesPct.toFixed(2)),
      targetProfitPct: new Decimal(d.targetProfitPct.toFixed(2)),
      autoRepriceMode: d.autoRepriceMode,
      rounding: d.rounding,
      maxAutoChangePct: new Decimal(d.maxAutoChangePct.toFixed(2)),
      periodOpeningStock: toDecimal(d.periodOpeningStock),
      periodPurchases: toDecimal(d.periodPurchases),
      periodClosingStock: toDecimal(d.periodClosingStock),
      periodRevenue: toDecimal(d.periodRevenue),
    };

    const config = await prisma.restaurantPricingConfig.upsert({
      where: { restaurantId: ctx.restaurantId },
      update: data,
      create: { restaurantId: ctx.restaurantId, ...data },
    });

    // AUTO mode reacts to assumption changes (guardrail applies); OFF/SUGGEST → null.
    const auto = await repriceAllAfterConfigChange(ctx.restaurantId, ctx.userId);
    const items = auto ? await fetchItemsState(ctx.restaurantId, auto.changedIds) : [];

    return ok({ config: serializeConfig(config), auto, items });
  } catch (err) {
    console.error("[PUT /api/pricing/config]", err);
    return serverError();
  }
}
