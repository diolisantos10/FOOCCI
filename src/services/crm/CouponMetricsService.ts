/**
 * CouponMetricsService — results of the coupon actions for the CRM "Cupons" tab.
 *
 * Aggregates the customer coupon wallet: how many coupons each campaign granted,
 * how many are active, used or expired. Redemption/revenue metrics fill in once
 * cart redemption (Fase B) is live — until then `used` is honestly 0.
 */

import { prisma } from "@/lib/prisma";

export interface CouponCampaignRow {
  campaignId:   string | null;
  campaignName: string;
  granted:      number;
  active:       number;
  used:         number;
}

export interface CouponMetrics {
  totalGranted:      number;
  active:            number;
  used:              number;
  expired:           number;
  grantedLast30Days: number;
  /** Whether redemption is tracked yet (cart redemption / Fase B). */
  redemptionTracked: boolean;
  byCampaign:        CouponCampaignRow[];
}

export class CouponMetricsService {
  static async getMetrics(restaurantId: string, now: Date = new Date()): Promise<CouponMetrics> {
    const cutoff30 = new Date(now.getTime() - 30 * 86_400_000);

    const [total, used, expiredStatus, expiredActive, active, granted30, byCampaignStatus] = await Promise.all([
      prisma.customerCoupon.count({ where: { restaurantId } }),
      prisma.customerCoupon.count({ where: { restaurantId, status: "USED" } }),
      prisma.customerCoupon.count({ where: { restaurantId, status: "EXPIRED" } }),
      // ACTIVE rows whose expiry has passed count as expired for display.
      prisma.customerCoupon.count({ where: { restaurantId, status: "ACTIVE", expiresAt: { lt: now } } }),
      prisma.customerCoupon.count({ where: { restaurantId, status: "ACTIVE", OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] } }),
      prisma.customerCoupon.count({ where: { restaurantId, grantedAt: { gte: cutoff30 } } }),
      prisma.customerCoupon.groupBy({
        by:     ["sourceCampaignId", "status"],
        where:  { restaurantId },
        _count: { _all: true },
      }),
    ]);

    // Fold the per-(campaign,status) counts into per-campaign rows.
    const map = new Map<string, { granted: number; active: number; used: number }>();
    for (const g of byCampaignStatus) {
      const key = g.sourceCampaignId ?? "__none__";
      const row = map.get(key) ?? { granted: 0, active: 0, used: 0 };
      const n = g._count._all;
      row.granted += n;
      if (g.status === "USED") row.used += n;
      if (g.status === "ACTIVE") row.active += n;
      map.set(key, row);
    }

    // Resolve campaign names.
    const ids = [...map.keys()].filter((k) => k !== "__none__");
    const campaigns = ids.length
      ? await prisma.campaign.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } })
      : [];
    const nameById = new Map(campaigns.map((c) => [c.id, c.name]));

    const byCampaign: CouponCampaignRow[] = [...map.entries()]
      .map(([key, row]) => ({
        campaignId:   key === "__none__" ? null : key,
        campaignName: key === "__none__" ? "Sem campanha" : (nameById.get(key) ?? "Campanha removida"),
        granted:      row.granted,
        active:       row.active,
        used:         row.used,
      }))
      .sort((a, b) => b.granted - a.granted);

    return {
      totalGranted:      total,
      active,
      used,
      expired:           expiredStatus + expiredActive,
      grantedLast30Days: granted30,
      redemptionTracked: used > 0, // becomes meaningful once cart redemption exists
      byCampaign,
    };
  }
}
