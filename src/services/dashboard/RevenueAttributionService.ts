/**
 * RevenueAttributionService — "de onde vem a venda".
 *
 * Splits a period's revenue into THREE mutually exclusive buckets of INFLUENCE,
 * so the shares sum to exactly the dashboard's "Faturamento":
 *
 *   • garcom      — the Foocci agent drove the sale: a validated indicação
 *                   (Referral) OR the order carried an item the agent upsold /
 *                   recommended.
 *   • crm         — a CRM campaign/automation brought the customer (campaign
 *                   execution, AI/automation action, or a campaign coupon).
 *   • espontanea  — none of the above: the customer bought on their own.
 *
 * Priority (referral > crm > upsell > espontânea) resolves overlaps so each order
 * lands in exactly one bucket — nothing double-counted. The pure
 * `bucketRevenueSources` holds the rule (unit-tested); `getRevenueSources` runs
 * the tenant-scoped queries and feeds it.
 */

import { prisma } from "@/lib/prisma";
import { OrderStatus } from "@prisma/client";

// Same set the dashboard "Faturamento" KPI uses (route.ts) — no AWAITING_PAYMENT —
// so this breakdown always sums to the number shown in the KPI square.
const REVENUE_STATUS: OrderStatus[] = ["DELIVERED", "CONFIRMED", "PREPARING", "READY", "OUT_FOR_DELIVERY"];

export type RevenueSourceKey = "crm" | "garcom" | "espontanea";

export interface RevenueSourceBucket {
  key: RevenueSourceKey;
  revenue: number;
  orders: number;
}

export interface RevenueSourcesResult {
  total: number;
  buckets: RevenueSourceBucket[]; // always the 3 keys, in display order
}

/** Display order for the buckets (also the shape of an empty result). */
const DISPLAY_ORDER: RevenueSourceKey[] = ["crm", "garcom", "espontanea"];

const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Pure classifier. Each order → exactly one bucket by priority
 * referral > crm > upsell > espontânea. Sums to the orders' total.
 */
export function bucketRevenueSources(
  orders: Array<{ id: string; total: number }>,
  sets: { referral: Set<string>; crm: Set<string>; upsell: Set<string> },
): RevenueSourcesResult {
  const acc: Record<RevenueSourceKey, { revenue: number; orders: number }> = {
    crm:        { revenue: 0, orders: 0 },
    garcom:     { revenue: 0, orders: 0 },
    espontanea: { revenue: 0, orders: 0 },
  };
  let total = 0;
  for (const o of orders) {
    total += o.total;
    const key: RevenueSourceKey =
      sets.referral.has(o.id) ? "garcom"     // agente indicou (referral)
      : sets.crm.has(o.id)    ? "crm"        // CRM trouxe de volta
      : sets.upsell.has(o.id) ? "garcom"     // agente recomendou (upsell)
      : "espontanea";                        // cliente por conta própria
    acc[key].revenue += o.total;
    acc[key].orders  += 1;
  }
  return {
    total: round2(total),
    buckets: DISPLAY_ORDER.map((key) => ({ key, revenue: round2(acc[key].revenue), orders: acc[key].orders })),
  };
}

function emptyResult(): RevenueSourcesResult {
  return { total: 0, buckets: DISPLAY_ORDER.map((key) => ({ key, revenue: 0, orders: 0 })) };
}

/**
 * Compute the period's revenue attribution for one restaurant.
 * `rangeStart`/`rangeEnd` come from computePeriodRange (the same "régua de tempo"
 * the rest of the dashboard uses), so the breakdown moves with the period.
 */
export async function getRevenueSources(
  restaurantId: string,
  rangeStart: Date,
  rangeEnd: Date,
): Promise<RevenueSourcesResult> {
  const orders = await prisma.order.findMany({
    where: {
      restaurantId,
      createdAt: { gte: rangeStart, lte: rangeEnd },
      status:    { in: REVENUE_STATUS },
    },
    select: { id: true, total: true },
  });
  if (orders.length === 0) return emptyResult();

  const orderIds = orders.map((o) => o.id);

  const [crmExec, crmActions, campaignCoupons, referrals, upsellItems] = await Promise.all([
    // CRM: a campaign recipient that converted on one of these orders
    prisma.campaignExecution.findMany({
      where:  { convertedOrderId: { in: orderIds } },
      select: { convertedOrderId: true },
    }),
    // CRM: an AI/automation action that converted on one of these orders
    prisma.cRMActionLog.findMany({
      where:  { orderId: { in: orderIds }, converted: true },
      select: { orderId: true },
    }),
    // CRM: a campaign-credited coupon redeemed on one of these orders
    prisma.customerCoupon.findMany({
      where:  { usedOrderId: { in: orderIds }, sourceCampaignId: { not: null } },
      select: { usedOrderId: true },
    }),
    // Garçom: the order that validated a Foocci indicação (referral)
    prisma.referral.findMany({
      where:  { restaurantId, orderId: { in: orderIds } },
      select: { orderId: true },
    }),
    // Garçom: the order carried an item the agent upsold / recommended
    prisma.orderItem.findMany({
      where:  { orderId: { in: orderIds }, isUpsell: true },
      select: { orderId: true },
    }),
  ]);

  const crm = new Set<string>();
  for (const e of crmExec)         if (e.convertedOrderId) crm.add(e.convertedOrderId);
  for (const a of crmActions)      if (a.orderId)          crm.add(a.orderId);
  for (const c of campaignCoupons) if (c.usedOrderId)      crm.add(c.usedOrderId);

  const referral = new Set<string>();
  for (const r of referrals) if (r.orderId) referral.add(r.orderId);

  const upsell = new Set<string>();
  for (const u of upsellItems) if (u.orderId) upsell.add(u.orderId);

  return bucketRevenueSources(
    orders.map((o) => ({ id: o.id, total: Number(o.total) })),
    { referral, crm, upsell },
  );
}
