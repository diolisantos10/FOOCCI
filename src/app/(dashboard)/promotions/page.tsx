import { prisma } from "@/lib/prisma";
import { getTenantId } from "@/lib/tenant";
import { TopBar } from "@/components/layout/TopBar";
import { PromotionsClient } from "./PromotionsClient";
import type { PromotionRow, PromotionMetricsSummary } from "@/services/promotions/PromotionService";
import type { Promotion, OrderStatus, PaymentStatus } from "@prisma/client";

const VALID_ORDER_STATUSES_METRICS: OrderStatus[] = [
  "CONFIRMED", "PREPARING", "READY", "OUT_FOR_DELIVERY", "DELIVERED",
];
const VALID_PAYMENT_STATUSES_METRICS: PaymentStatus[] = ["PAID", "PAY_ON_DELIVERY", "PAY_ON_PICKUP"];

export const metadata = { title: "Promoções" };
export const dynamic = "force-dynamic";

export default async function PromotionsPage() {
  let restaurantId: string | null = null;
  try { restaurantId = getTenantId(); } catch { /* not authenticated */ }

  let initialPromotions: PromotionRow[] = [];
  let metricsMap: Record<string, PromotionMetricsSummary> = {};

  if (restaurantId) {
    const rows = await prisma.promotion.findMany({
      where: { restaurantId },
      orderBy: { createdAt: "desc" },
      take: 50,
    });

    const now = new Date();

    // ── Batch metrics for all promotions (one query) ─────────────────────────
    const promotionIds = rows.map((p) => p.id);
    const couponCodes  = rows.map((p) => p.couponCode).filter((c): c is string => !!c);

    let metricsOrders: Array<{
      promotionId: string | null;
      couponCode:  string | null;
      total:       unknown;
      discount:    unknown;
      customerId:  string;
      createdAt:   Date;
    }> = [];

    if (promotionIds.length > 0) {
      const couponConditions = couponCodes.length > 0
        ? [{ couponCode: { in: couponCodes } }]
        : [];
      metricsOrders = await prisma.order.findMany({
        where: {
          restaurantId,
          status: { in: VALID_ORDER_STATUSES_METRICS },
          AND: [
            { OR: [{ promotionId: { in: promotionIds } }, ...couponConditions] },
            { OR: [{ payment: null }, { payment: { status: { in: VALID_PAYMENT_STATUSES_METRICS } } }] },
          ],
        },
        select: { promotionId: true, couponCode: true, total: true, discount: true, customerId: true, createdAt: true },
      });
    }

    // Map couponCode (lowercase) → promotionId for legacy-order matching
    const couponToPromoId: Record<string, string> = {};
    for (const p of rows) {
      if (p.couponCode) couponToPromoId[p.couponCode.toLowerCase()] = p.id;
    }

    // Aggregate per promotionId
    const grouped: Record<string, { total: number; discount: number; customerId: string; createdAt: Date }[]> = {};
    for (const o of metricsOrders) {
      const promoId = o.promotionId ?? (o.couponCode ? (couponToPromoId[o.couponCode.toLowerCase()] ?? null) : null);
      if (!promoId) continue;
      if (!grouped[promoId]) grouped[promoId] = [];
      grouped[promoId].push({ total: Number(o.total), discount: Number(o.discount), customerId: o.customerId, createdAt: o.createdAt });
    }

    for (const [promoId, ords] of Object.entries(grouped)) {
      const uses = ords.length;
      const revenue = ords.reduce((s, o) => s + o.total, 0);
      const discountGiven = ords.reduce((s, o) => s + o.discount, 0);
      const uniqueCustomers = new Set(ords.map((o) => o.customerId)).size;
      const lastUsedAt = ords.reduce<Date | null>((mx, o) => (!mx || o.createdAt > mx ? o.createdAt : mx), null);
      metricsMap[promoId] = {
        uses,
        revenue:       Math.round(revenue * 100) / 100,
        discountGiven: Math.round(discountGiven * 100) / 100,
        uniqueCustomers,
        lastUsedAt: lastUsedAt?.toISOString() ?? null,
      };
    }
    // ── End batch metrics ────────────────────────────────────────────────────

    initialPromotions = rows.map((p: Promotion) => {
      let displayStatus: PromotionRow["displayStatus"] = "DRAFT";
      if (p.status === "PAUSED") {
        displayStatus = "PAUSED";
      } else if (p.status === "DRAFT") {
        displayStatus = "DRAFT";
      } else {
        if (p.endsAt && p.endsAt < now) {
          displayStatus = "EXPIRED";
        } else if (p.startsAt && p.startsAt > now) {
          displayStatus = "SCHEDULED";
        } else {
          displayStatus = "ACTIVE";
        }
      }

      return {
        id:                p.id,
        name:              p.name,
        description:       p.description ?? null,
        type:              p.type,
        status:            p.status,
        displayStatus,
        discountValue:     Number(p.discountValue),
        target:            p.target,
        targetProductIds:  p.targetProductIds ?? [],
        targetCategoryIds: p.targetCategoryIds ?? [],
        channel:           p.channel,
        couponCode:        p.couponCode ?? null,
        startsAt:          p.startsAt ? p.startsAt.toISOString() : null,
        endsAt:            p.endsAt ? p.endsAt.toISOString() : null,
        daysOfWeek:        p.daysOfWeek ?? [],
        timeFrom:          p.timeFrom ?? null,
        timeTo:            p.timeTo ?? null,
        minOrderValue:     p.minOrderValue != null ? Number(p.minOrderValue) : null,
        minQuantity:       p.minQuantity ?? null,
        maxUses:           p.maxUses ?? null,
        usedCount:         p.usedCount,
        oneTimePerUser:    p.oneTimePerUser,
        combinable:        p.combinable,
        bannerImageUrl:    p.bannerImageUrl ?? null,
        createdAt:         p.createdAt.toISOString(),
        updatedAt:         p.updatedAt.toISOString(),
      };
    });
  }

  return (
    <>
      <TopBar title="Promoções" />
      <PromotionsClient initialPromotions={initialPromotions} metricsMap={metricsMap} />
    </>
  );
}
