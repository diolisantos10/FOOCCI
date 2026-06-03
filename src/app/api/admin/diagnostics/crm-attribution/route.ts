/**
 * GET /api/admin/diagnostics/crm-attribution
 *
 * Attribution health diagnostics:
 *   1. campaigns_without_coupon  — active campaigns that lack a coupon link
 *   2. promotions_not_linked     — promotions with coupon codes not linked to any campaign
 *   3. orders_coupon_no_promo    — recent valid orders that have couponCode but no promotionId
 *      (indicates legacy data or coupon code mismatches)
 *
 * Auth: x-admin-secret header OR foocci-admin-token cookie.
 * Read-only. Never mutates data.
 *
 * Query params:
 *   restaurantId — filter (optional)
 *   limit        — max items per section (default 50, max 200)
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { checkAdminRequest } from "@/lib/admin-auth";

export async function GET(req: NextRequest) {
  if (!process.env.ADMIN_SECRET) {
    return NextResponse.json({ error: "Endpoint disabled — ADMIN_SECRET not configured." }, { status: 403 });
  }
  if (!checkAdminRequest(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const sp           = req.nextUrl.searchParams;
  const restaurantId = sp.get("restaurantId") ?? undefined;
  const limit        = Math.min(Number(sp.get("limit") ?? "50"), 200);
  const since30d     = new Date(Date.now() - 30 * 86_400_000);

  try {
    const [
      campaignsWithoutCoupon,
      promotionsNotLinked,
      ordersWithCouponNoPromo,
    ] = await Promise.all([
      // 1. Active/Sending campaigns that have no coupon link
      prisma.campaign.findMany({
        where: {
          ...(restaurantId ? { restaurantId } : {}),
          status: { in: ["ACTIVE", "SENT", "SENDING", "SCHEDULED"] as never[] },
          couponCode: null,
        },
        orderBy: { createdAt: "desc" },
        take: limit,
        select: {
          id: true, restaurantId: true, name: true, status: true,
          totalSent: true, totalConverted: true, createdAt: true,
        },
      }),

      // 2. Promotions with coupon codes NOT referenced by any campaign
      (async () => {
        const promotions = await prisma.promotion.findMany({
          where: {
            ...(restaurantId ? { restaurantId } : {}),
            couponCode: { not: null },
            status: "ACTIVE" as never,
          },
          take: limit,
          select: { id: true, restaurantId: true, name: true, couponCode: true, usedCount: true },
        });

        if (promotions.length === 0) return [];

        const codes = promotions
          .map((p) => p.couponCode!)
          .filter(Boolean);

        const linkedCodes = await prisma.campaign.findMany({
          where: {
            ...(restaurantId ? { restaurantId } : {}),
            couponCode: { in: codes },
          },
          select: { couponCode: true },
        });
        const linkedSet = new Set(linkedCodes.map((c) => c.couponCode?.toLowerCase()));

        return promotions.filter((p) => !linkedSet.has(p.couponCode!.toLowerCase()));
      })(),

      // 3. Recent orders with couponCode but no promotionId (data integrity check)
      prisma.order.findMany({
        where: {
          ...(restaurantId ? { restaurantId } : {}),
          couponCode: { not: null },
          promotionId: null,
          createdAt: { gte: since30d },
          status: { in: ["CONFIRMED", "PREPARING", "READY", "OUT_FOR_DELIVERY", "DELIVERED"] as never[] },
        },
        orderBy: { createdAt: "desc" },
        take: limit,
        select: {
          id: true, restaurantId: true, couponCode: true, total: true,
          createdAt: true, customerId: true,
        },
      }),
    ]);

    return NextResponse.json({
      generatedAt: new Date().toISOString(),
      summary: {
        campaignsWithoutCoupon:    campaignsWithoutCoupon.length,
        promotionsNotLinked:       promotionsNotLinked.length,
        ordersWithCouponNoPromo:   ordersWithCouponNoPromo.length,
        hint: campaignsWithoutCoupon.length > 0
          ? "Vincule cupons às campanhas para obter atribuição confiável de receita."
          : "Todas as campanhas ativas têm cupom vinculado — atribuição confiável disponível.",
      },
      campaignsWithoutCoupon: campaignsWithoutCoupon.map((c) => ({
        id:            c.id,
        restaurantId:  c.restaurantId,
        name:          c.name,
        status:        c.status,
        totalSent:     c.totalSent,
        totalConverted: c.totalConverted,
        createdAt:     c.createdAt.toISOString(),
        linkHint:      `Para vincular: PATCH /api/crm/campaigns/${c.id} + couponCode`,
      })),
      promotionsNotLinked: promotionsNotLinked.map((p) => ({
        id:          p.id,
        restaurantId: p.restaurantId,
        name:        p.name,
        couponCode:  p.couponCode,
        usedCount:   p.usedCount,
      })),
      ordersWithCouponNoPromo: ordersWithCouponNoPromo.map((o) => ({
        id:          o.id,
        restaurantId: o.restaurantId,
        couponCode:  o.couponCode,
        total:       Number(o.total),
        createdAt:   o.createdAt.toISOString(),
        customerId:  o.customerId,
        note:        "Cupom usado mas promotionId não preenchido — pode ser legacy ou código não encontrado no catálogo.",
      })),
    });
  } catch (err) {
    console.error("[diag/crm-attribution] error:", err);
    return NextResponse.json(
      { error: "Internal error", detail: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}
