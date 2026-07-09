/**
 * GET /api/crm/coupons — coupons available to attach to a campaign.
 *
 * Sourced from the Promoções tab: active promotions that carry a coupon code.
 * The owner creates coupons there; the ready-made campaign editor lets them pick
 * one from this list.
 */

import { NextRequest } from "next/server";
import { getTenantContext } from "@/lib/tenant";
import { ok, unauthorized, serverError } from "@/lib/api-response";
import { prisma } from "@/lib/prisma";

function discountLabel(type: string, value: number): string {
  switch (type) {
    case "PERCENTAGE":    return value > 0 ? `${value}% OFF` : "Desconto";
    case "FIXED":         return value > 0 ? `R$ ${value.toFixed(2).replace(".", ",")} OFF` : "Desconto";
    case "FREE_DELIVERY": return "Frete grátis";
    case "COMBO":         return "Combo";
    default:              return value > 0 ? `${value}% OFF` : "Cupom";
  }
}

export async function GET(req: NextRequest) {
  const ctx = getTenantContext(req);
  if (!ctx) return unauthorized();
  try {
    const rows = await prisma.promotion.findMany({
      where: {
        restaurantId: ctx.restaurantId,
        status:       "ACTIVE",
        couponCode:   { not: null },
      },
      orderBy: { createdAt: "desc" },
      select:  { couponCode: true, name: true, type: true, discountValue: true },
    });

    const coupons = rows
      .filter((r) => (r.couponCode ?? "").trim() !== "")
      .map((r) => ({
        code:  (r.couponCode as string).toUpperCase(),
        name:  r.name,
        label: discountLabel(r.type as string, Number(r.discountValue)),
      }));

    return ok({ coupons });
  } catch (err) {
    console.error("[GET /api/crm/coupons]", err);
    return serverError();
  }
}
