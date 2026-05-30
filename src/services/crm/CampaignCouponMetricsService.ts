/**
 * CampaignCouponMetricsService
 *
 * First reliable campaign + coupon performance layer for restaurant owners.
 * Read-only aggregation over EXISTING data — no schema changes, no invented
 * attribution.
 *
 * ── Attribution model ──────────────────────────────────────────────────────
 * Coupon / promotion performance (RELIABLE):
 *   An order is attributed to a promotion when:
 *     Order.promotionId === promo.id
 *       OR (Order.promotionId is null AND Order.couponCode === promo.couponCode,
 *           case-insensitive — legacy orders written before promotionId existed)
 *   This mirrors /api/promotions/[id]/metrics exactly.
 *
 * Campaign performance:
 *   Campaigns have NO couponCode / promotionId link in the schema, so a
 *   campaign's coupon-driven revenue is UNAVAILABLE. We surface only what the
 *   campaign runner already records on CampaignExecution and aggregates onto
 *   Campaign: audience, sent, failed, responded, and post-send "assisted"
 *   conversions/revenue (a customer who ordered after receiving the campaign).
 *   Assisted figures are clearly labelled and never presented as coupon revenue.
 *
 * ── Revenue convention (matches /api/promotions/[id]/metrics) ───────────────
 *   Valid order = status in [CONFIRMED, PREPARING, READY, OUT_FOR_DELIVERY,
 *   DELIVERED] AND (no payment row OR payment.status in [PAID, PAY_ON_DELIVERY,
 *   PAY_ON_PICKUP]). Cancelled, pending, and awaiting-payment orders excluded.
 *   revenue = Σ Order.total ; discount = Σ Order.discount.
 *   orderCount (not Promotion.usedCount) is the source of truth for revenue.
 */

import { prisma } from "@/lib/prisma";
import type { OrderStatus, PaymentStatus } from "@prisma/client";

const VALID_ORDER_STATUSES: OrderStatus[] = [
  "CONFIRMED", "PREPARING", "READY", "OUT_FOR_DELIVERY", "DELIVERED",
];
const VALID_PAYMENT_STATUSES: PaymentStatus[] = ["PAID", "PAY_ON_DELIVERY", "PAY_ON_PICKUP"];

export type MetricsPeriod = "7d" | "30d" | "90d" | "all";

export interface CouponRow {
  promotionId:   string;
  couponCode:    string | null;
  name:          string;
  type:          string;
  status:        string;
  usedCount:     number;   // denormalized counter on Promotion (may differ from orderCount)
  orderCount:    number;   // SOURCE OF TRUTH for revenue — valid orders in period
  revenue:       number;   // Σ Order.total
  discount:      number;   // Σ Order.discount
  averageTicket: number;
  uniqueCustomers: number;
  firstUsedAt:   string | null;
  lastUsedAt:    string | null;
  conversion:    number | null; // no per-coupon denominator available → null
}

export interface CampaignRow {
  campaignId:        string;
  name:              string;
  status:            string;
  audienceSize:      number;
  sentCount:         number;
  failedCount:       number;
  responseCount:     number;
  assistedConversions: number;   // post-send order attribution from CampaignExecution
  assistedRevenue:   number;     // Σ CampaignExecution.revenue (NOT coupon revenue)
  conversionRate:    number | null; // assistedConversions / sentCount
  lastExecutionAt:   string | null;
  // Coupon attribution is unavailable — no campaign↔coupon link in schema.
  couponCode:        null;
  couponOrderCount:  null;
  couponRevenue:     null;
  discountGiven:     null;
}

export interface CampaignCouponMetrics {
  period:    MetricsPeriod;
  since:     string | null; // ISO; null when period === "all"
  generatedAt: string;
  coupons: {
    totalCouponsActive: number;
    totalCouponOrders:  number;
    couponRevenue:      number;
    totalDiscountGiven: number;
    rows:               CouponRow[];
  };
  campaigns: {
    totalCampaigns:        number;
    totalSent:             number;
    totalFailed:           number;
    totalAssistedRevenue:  number;
    couponAttribution:     "unavailable";
    couponAttributionNote: string;
    rows:                  CampaignRow[];
  };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function periodSince(period: MetricsPeriod, now = Date.now()): Date | null {
  switch (period) {
    case "7d":  return new Date(now - 7  * 86_400_000);
    case "30d": return new Date(now - 30 * 86_400_000);
    case "90d": return new Date(now - 90 * 86_400_000);
    case "all": return null;
  }
}

export class CampaignCouponMetricsService {
  static async getMetrics(
    restaurantId: string,
    period: MetricsPeriod = "30d",
  ): Promise<CampaignCouponMetrics> {
    const since = periodSince(period);

    const [coupons, campaigns] = await Promise.all([
      this.getCouponMetrics(restaurantId, since),
      this.getCampaignMetrics(restaurantId, since),
    ]);

    return {
      period,
      since: since?.toISOString() ?? null,
      generatedAt: new Date().toISOString(),
      coupons,
      campaigns,
    };
  }

  // ── Coupon / promotion performance ────────────────────────────────────────
  private static async getCouponMetrics(
    restaurantId: string,
    since: Date | null,
  ): Promise<CampaignCouponMetrics["coupons"]> {
    // Promotions that can be redeemed via a code (coupons).
    const promotions = await prisma.promotion.findMany({
      where:  { restaurantId, couponCode: { not: null } },
      select: {
        id: true, couponCode: true, name: true, type: true,
        status: true, usedCount: true,
      },
    });

    // Valid coupon-bearing orders in the period — fetched once, grouped in memory.
    const orders = await prisma.order.findMany({
      where: {
        restaurantId,
        status: { in: VALID_ORDER_STATUSES },
        ...(since ? { createdAt: { gte: since } } : {}),
        AND: [
          { OR: [{ promotionId: { not: null } }, { couponCode: { not: null } }] },
          { OR: [{ payment: null }, { payment: { status: { in: VALID_PAYMENT_STATUSES } } }] },
        ],
      },
      select: {
        promotionId: true, couponCode: true, total: true, discount: true,
        customerId: true, createdAt: true,
      },
      orderBy: { createdAt: "asc" },
      take: 10_000,
    });

    // Build lookup: promotionId → promo, and lowercased couponCode → promo.
    const byId   = new Map(promotions.map((p) => [p.id, p]));
    const byCode = new Map(
      promotions
        .filter((p) => p.couponCode)
        .map((p) => [p.couponCode!.toLowerCase(), p]),
    );

    interface Agg {
      orderCount: number; revenue: number; discount: number;
      customers: Set<string>; first: Date | null; last: Date | null;
    }
    const aggById = new Map<string, Agg>();
    const ensure = (id: string): Agg => {
      let a = aggById.get(id);
      if (!a) { a = { orderCount: 0, revenue: 0, discount: 0, customers: new Set(), first: null, last: null }; aggById.set(id, a); }
      return a;
    };

    for (const o of orders) {
      // Attribution priority: promotionId first, then couponCode for legacy orders.
      let promoId: string | null = null;
      if (o.promotionId && byId.has(o.promotionId)) {
        promoId = o.promotionId;
      } else if (!o.promotionId && o.couponCode) {
        const p = byCode.get(o.couponCode.toLowerCase());
        if (p) promoId = p.id;
      }
      if (!promoId) continue;

      const a = ensure(promoId);
      a.orderCount++;
      a.revenue  += Number(o.total);
      a.discount += Number(o.discount);
      if (o.customerId) a.customers.add(o.customerId);
      if (!a.first || o.createdAt < a.first) a.first = o.createdAt;
      if (!a.last  || o.createdAt > a.last)  a.last  = o.createdAt;
    }

    const rows: CouponRow[] = promotions.map((p) => {
      const a = aggById.get(p.id);
      const orderCount = a?.orderCount ?? 0;
      const revenue    = round2(a?.revenue  ?? 0);
      const discount   = round2(a?.discount ?? 0);
      return {
        promotionId:     p.id,
        couponCode:      p.couponCode,
        name:            p.name,
        type:            p.type,
        status:          p.status,
        usedCount:       p.usedCount,
        orderCount,
        revenue,
        discount,
        averageTicket:   orderCount > 0 ? round2(revenue / orderCount) : 0,
        uniqueCustomers: a?.customers.size ?? 0,
        firstUsedAt:     a?.first?.toISOString() ?? null,
        lastUsedAt:      a?.last?.toISOString()  ?? null,
        conversion:      null,
      };
    });

    // Sort: most orders first, then revenue, then active coupons before paused.
    rows.sort((x, y) =>
      y.orderCount - x.orderCount ||
      y.revenue    - x.revenue ||
      (x.status === "ACTIVE" ? -1 : 1) - (y.status === "ACTIVE" ? -1 : 1),
    );

    return {
      totalCouponsActive: promotions.filter((p) => p.status === "ACTIVE").length,
      totalCouponOrders:  rows.reduce((s, r) => s + r.orderCount, 0),
      couponRevenue:      round2(rows.reduce((s, r) => s + r.revenue, 0)),
      totalDiscountGiven: round2(rows.reduce((s, r) => s + r.discount, 0)),
      rows,
    };
  }

  // ── Campaign performance ──────────────────────────────────────────────────
  private static async getCampaignMetrics(
    restaurantId: string,
    since: Date | null,
  ): Promise<CampaignCouponMetrics["campaigns"]> {
    // A campaign is in-period if it was created OR sent within the window.
    const campaigns = await prisma.campaign.findMany({
      where: {
        restaurantId,
        ...(since ? { OR: [{ createdAt: { gte: since } }, { sentAt: { gte: since } }] } : {}),
      },
      orderBy: { createdAt: "desc" },
      take: 100,
      select: {
        id: true, name: true, status: true,
        totalAudience: true, totalSent: true, totalFailed: true,
        totalResponded: true, totalConverted: true, totalRevenue: true,
        sentAt: true,
      },
    });

    const rows: CampaignRow[] = campaigns.map((c) => {
      const sentCount = c.totalSent;
      const assistedConversions = c.totalConverted;
      const assistedRevenue = round2(Number(c.totalRevenue));
      return {
        campaignId:          c.id,
        name:                c.name,
        status:              c.status,
        audienceSize:        c.totalAudience,
        sentCount,
        failedCount:         c.totalFailed,
        responseCount:       c.totalResponded,
        assistedConversions,
        assistedRevenue,
        conversionRate:      sentCount > 0 ? round2((assistedConversions / sentCount) * 100) : null,
        lastExecutionAt:     c.sentAt?.toISOString() ?? null,
        couponCode:          null,
        couponOrderCount:    null,
        couponRevenue:       null,
        discountGiven:       null,
      };
    });

    return {
      totalCampaigns:       rows.length,
      totalSent:            rows.reduce((s, r) => s + r.sentCount, 0),
      totalFailed:          rows.reduce((s, r) => s + r.failedCount, 0),
      totalAssistedRevenue: round2(rows.reduce((s, r) => s + r.assistedRevenue, 0)),
      couponAttribution:    "unavailable",
      couponAttributionNote:
        "Campanhas não possuem vínculo direto com cupons no schema atual. " +
        "A receita exibida é atribuição assistida (cliente pediu após receber a campanha), " +
        "não receita de cupom. Veja a tabela de cupons para performance de desconto.",
      rows,
    };
  }
}
