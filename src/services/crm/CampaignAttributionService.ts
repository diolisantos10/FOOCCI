/**
 * CampaignAttributionService — W7
 *
 * Combines campaign send metrics with coupon/promotion performance to produce
 * a unified attribution view with explicit quality labels.
 *
 * Attribution quality tiers (from strongest to weakest):
 *   COUPON_PROVEN  — campaign has a linked coupon AND orders redeemed it.
 *                    Revenue is directly attributable via Order.promotionId /
 *                    Order.couponCode. Label: "Comprovado por cupom".
 *   CAMPAIGN_COUPON— campaign has a linked coupon BUT no orders yet used it
 *                    in this period.
 *                    Label: "Atribuído por campanha + cupom".
 *   ASSISTED       — no coupon link; revenue comes from time-window post-send
 *                    attribution (CampaignExecution.converted).
 *                    Label: "Assistido por proximidade".
 *   NONE           — no coupon, no conversions.
 *                    Label: "Sem atribuição confiável".
 *
 * Rules that are never violated:
 *   - No invented attribution.
 *   - couponRevenue and assistedRevenue are always separate columns.
 *   - Cancelled / awaiting-payment orders excluded (mirrors promotions metrics).
 *   - Tenant-scoped — never leaks data across restaurants.
 *   - Read-only — no mutations, no sends.
 */

import { prisma } from "@/lib/prisma";
import type { OrderStatus, PaymentStatus } from "@prisma/client";

// ── Constants ─────────────────────────────────────────────────────────────────

const VALID_ORDER_STATUSES: OrderStatus[] = [
  "CONFIRMED", "PREPARING", "READY", "OUT_FOR_DELIVERY", "DELIVERED",
];
const VALID_PAYMENT_STATUSES: PaymentStatus[] = ["PAID", "PAY_ON_DELIVERY", "PAY_ON_PICKUP"];

// ── Period helpers ────────────────────────────────────────────────────────────

export type AttributionPeriod = "7d" | "30d" | "90d" | "all";

export function attributionPeriodSince(period: AttributionPeriod, now = Date.now()): Date | null {
  switch (period) {
    case "7d":  return new Date(now - 7  * 86_400_000);
    case "30d": return new Date(now - 30 * 86_400_000);
    case "90d": return new Date(now - 90 * 86_400_000);
    case "all": return null;
  }
}

// ── Attribution quality ───────────────────────────────────────────────────────

export type AttributionQuality = "COUPON_PROVEN" | "CAMPAIGN_COUPON" | "ASSISTED" | "NONE";

/** Pure function — determines attribution quality from observable facts. */
export function classifyAttributionQuality(
  hasCouponLink: boolean,
  couponOrderCount: number,
  assistedConversions: number,
): AttributionQuality {
  if (hasCouponLink && couponOrderCount > 0) return "COUPON_PROVEN";
  if (hasCouponLink)                         return "CAMPAIGN_COUPON";
  if (assistedConversions > 0)               return "ASSISTED";
  return "NONE";
}

const QUALITY_LABELS: Record<AttributionQuality, string> = {
  COUPON_PROVEN:   "Comprovado por cupom",
  CAMPAIGN_COUPON: "Atribuído por campanha + cupom",
  ASSISTED:        "Assistido por proximidade",
  NONE:            "Sem atribuição confiável",
};

const QUALITY_DESCRIPTIONS: Record<AttributionQuality, string> = {
  COUPON_PROVEN:
    "Pedidos com este cupom confirmados no período — atribuição direta e confiável.",
  CAMPAIGN_COUPON:
    "Campanha tem cupom vinculado mas nenhum uso registrado neste período.",
  ASSISTED:
    "Clientes pediram dentro de 7 dias após receber a campanha — sem confirmação por cupom.",
  NONE:
    "Sem cupom vinculado e sem conversões registradas neste período.",
};

export function attributionQualityLabel(quality: AttributionQuality): string {
  return QUALITY_LABELS[quality];
}

export function attributionQualityDescription(quality: AttributionQuality): string {
  return QUALITY_DESCRIPTIONS[quality];
}

// ── Result types ──────────────────────────────────────────────────────────────

export interface AttributionRow {
  campaignId:        string;
  name:              string;
  status:            string;
  linkedCouponCode:  string | null;
  linkedPromotionId: string | null;
  audienceSize:      number;
  sentCount:         number;
  failedCount:       number;
  responseCount:     number;
  // Coupon-driven (reliable — only present when hasCouponLink=true AND orders exist)
  couponOrderCount:  number | null;
  couponRevenue:     number | null;
  discountGiven:     number | null;
  uniqueCouponCustomers: number | null;
  // Assisted (time-window post-send — always present)
  assistedConversions: number;
  assistedRevenue:     number;
  conversionRate:      number | null;
  // Attribution
  attributionQuality: AttributionQuality;
  attributionLabel:   string;
  attributionDescription: string;
  lastExecutionAt:   string | null;
}

export interface AttributionSummary {
  period:      AttributionPeriod;
  since:       string | null;
  generatedAt: string;
  totals: {
    campaigns:              number;
    campaignsWithCoupon:    number;
    campaignsWithoutCoupon: number;
    couponProvenRevenue:    number;
    assistedRevenue:        number;
    qualityCounts: Record<AttributionQuality, number>;
  };
  warnings: string[];
  rows: AttributionRow[];
}

// ── Service ───────────────────────────────────────────────────────────────────

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export class CampaignAttributionService {
  /**
   * Full attribution view for all campaigns in the period.
   * Optionally filtered by campaignId, promotionId, or couponCode.
   */
  static async getAttribution(
    restaurantId: string,
    period: AttributionPeriod = "30d",
    filters: {
      campaignId?:  string;
      promotionId?: string;
      couponCode?:  string;
    } = {},
  ): Promise<AttributionSummary> {
    const since = attributionPeriodSince(period);

    // ── Load campaigns ──────────────────────────────────────────────────────
    const campaigns = await prisma.campaign.findMany({
      where: {
        restaurantId,
        ...(filters.campaignId  ? { id: filters.campaignId }          : {}),
        ...(filters.promotionId ? { promotionId: filters.promotionId } : {}),
        ...(filters.couponCode  ? { couponCode: { equals: filters.couponCode, mode: "insensitive" } } : {}),
        ...(since ? {
          OR: [{ createdAt: { gte: since } }, { sentAt: { gte: since } }],
        } : {}),
      },
      orderBy: { createdAt: "desc" },
      take:    200,
      select: {
        id:           true,
        name:         true,
        status:       true,
        couponCode:   true,
        promotionId:  true,
        totalAudience: true,
        totalSent:    true,
        totalFailed:  true,
        totalResponded: true,
        totalConverted: true,
        totalRevenue:  true,
        sentAt:        true,
      },
    });

    // ── Gather all distinct coupon codes from these campaigns ───────────────
    const linkedCouponCodes = [
      ...new Set(
        campaigns
          .map((c) => c.couponCode?.toLowerCase())
          .filter((v): v is string => !!v),
      ),
    ];

    // ── Load coupon-bearing valid orders in this period ─────────────────────
    // Only for coupon codes that are actually linked to a campaign.
    let couponOrdersByCode: Map<string, {
      orderCount: number; revenue: number; discount: number; customers: Set<string>;
    }> = new Map();

    if (linkedCouponCodes.length > 0) {
      const couponOrders = await prisma.order.findMany({
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
          promotionId: true,
          couponCode:  true,
          total:       true,
          discount:    true,
          customerId:  true,
        },
        take: 10_000,
      });

      // Load promotions to map promotionId → couponCode
      const promotions = linkedCouponCodes.length > 0
        ? await prisma.promotion.findMany({
            where: {
              restaurantId,
              couponCode: { in: linkedCouponCodes.map((c) => c.toUpperCase()) },
            },
            select: { id: true, couponCode: true },
          })
        : [];

      const promoIdToCode = new Map(
        promotions
          .filter((p) => p.couponCode)
          .map((p) => [p.id, p.couponCode!.toLowerCase()]),
      );

      for (const o of couponOrders) {
        // Resolve to a normalized coupon code
        let code: string | null = null;
        if (o.promotionId && promoIdToCode.has(o.promotionId)) {
          code = promoIdToCode.get(o.promotionId)!;
        } else if (!o.promotionId && o.couponCode) {
          code = o.couponCode.toLowerCase();
        }
        if (!code || !linkedCouponCodes.includes(code)) continue;

        let agg = couponOrdersByCode.get(code);
        if (!agg) {
          agg = { orderCount: 0, revenue: 0, discount: 0, customers: new Set() };
          couponOrdersByCode.set(code, agg);
        }
        agg.orderCount++;
        agg.revenue  += Number(o.total);
        agg.discount += Number(o.discount);
        if (o.customerId) agg.customers.add(o.customerId);
      }
    }

    // ── Build rows ──────────────────────────────────────────────────────────
    const warnings: string[] = [];

    const rows: AttributionRow[] = campaigns.map((c) => {
      const hasCouponLink      = !!c.couponCode;
      const normalizedCode     = c.couponCode?.toLowerCase() ?? null;
      const couponAgg          = normalizedCode ? couponOrdersByCode.get(normalizedCode) : null;
      const couponOrderCount   = couponAgg?.orderCount ?? 0;
      const assistedConversions = c.totalConverted;
      const quality            = classifyAttributionQuality(hasCouponLink, couponOrderCount, assistedConversions);

      return {
        campaignId:        c.id,
        name:              c.name,
        status:            c.status,
        linkedCouponCode:  c.couponCode ?? null,
        linkedPromotionId: c.promotionId ?? null,
        audienceSize:      c.totalAudience,
        sentCount:         c.totalSent,
        failedCount:       c.totalFailed,
        responseCount:     c.totalResponded,
        couponOrderCount:  hasCouponLink ? couponOrderCount : null,
        couponRevenue:     hasCouponLink ? round2(couponAgg?.revenue ?? 0) : null,
        discountGiven:     hasCouponLink ? round2(couponAgg?.discount ?? 0) : null,
        uniqueCouponCustomers: hasCouponLink ? (couponAgg?.customers.size ?? 0) : null,
        assistedConversions,
        assistedRevenue:   round2(Number(c.totalRevenue)),
        conversionRate:    c.totalSent > 0
          ? round2((assistedConversions / c.totalSent) * 100)
          : null,
        attributionQuality:    quality,
        attributionLabel:      attributionQualityLabel(quality),
        attributionDescription: attributionQualityDescription(quality),
        lastExecutionAt: c.sentAt?.toISOString() ?? null,
      };
    });

    // Warn about campaigns with no coupon
    const withoutCoupon = rows.filter((r) => !r.linkedCouponCode).length;
    if (withoutCoupon > 0 && rows.length > 0) {
      warnings.push(
        `${withoutCoupon} campanha(s) sem cupom vinculado — apenas atribuição assistida disponível.`,
      );
    }

    // ── Summary ─────────────────────────────────────────────────────────────
    const qualityCounts: Record<AttributionQuality, number> = {
      COUPON_PROVEN: 0, CAMPAIGN_COUPON: 0, ASSISTED: 0, NONE: 0,
    };
    let couponProvenRevenue = 0;
    let assistedRevenue = 0;
    for (const r of rows) {
      qualityCounts[r.attributionQuality]++;
      if (r.attributionQuality === "COUPON_PROVEN") {
        couponProvenRevenue += r.couponRevenue ?? 0;
      }
      assistedRevenue += r.assistedRevenue;
    }

    return {
      period,
      since:       since?.toISOString() ?? null,
      generatedAt: new Date().toISOString(),
      totals: {
        campaigns:              rows.length,
        campaignsWithCoupon:    rows.filter((r) => r.linkedCouponCode).length,
        campaignsWithoutCoupon: withoutCoupon,
        couponProvenRevenue:    round2(couponProvenRevenue),
        assistedRevenue:        round2(assistedRevenue),
        qualityCounts,
      },
      warnings,
      rows,
    };
  }
}
