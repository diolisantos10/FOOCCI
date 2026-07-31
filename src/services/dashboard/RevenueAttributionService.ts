/**
 * RevenueAttributionService — "de onde vem o faturamento".
 *
 * Splits a period's revenue into four MUTUALLY EXCLUSIVE buckets so the shares
 * sum to exactly the dashboard's "Faturamento":
 *
 *   • referral — the order that validated a Foocci indicação (Referral.orderId).
 *   • new      — the customer's FIRST order (acquisition), when not a referral.
 *   • crm      — a returning order the CRM engine brought back (campaign execution,
 *                AI/automation action log, or a redeemed campaign coupon).
 *   • organic  — everything else: a returning customer ordering on their own,
 *                plus imported/historical orders (no Foocci attribution).
 *
 * Priority (referral > new > crm > organic) resolves overlaps: a referral order
 * is also a first order, so we credit the referral; a new customer isn't "CRM".
 * Nothing is double-counted — each order lands in exactly one bucket.
 *
 * The pure `bucketRevenueSources` holds the classification rule (unit-tested);
 * `getRevenueSources` does the tenant-scoped queries and feeds it.
 */

import { prisma } from "@/lib/prisma";
import { OrderStatus } from "@prisma/client";

// Same set the dashboard "Faturamento" KPI uses (route.ts) — no AWAITING_PAYMENT —
// so this breakdown always sums to the number shown in the KPI square.
const REVENUE_STATUS: OrderStatus[] = ["DELIVERED", "CONFIRMED", "PREPARING", "READY", "OUT_FOR_DELIVERY"];

export type RevenueSourceKey = "crm" | "referral" | "new" | "organic";

export interface RevenueSourceBucket {
  key: RevenueSourceKey;
  revenue: number;
  orders: number;
}

export interface RevenueSourcesResult {
  total: number;
  buckets: RevenueSourceBucket[]; // always the 4 keys, in display order
}

/** Display order for the buckets (also the shape of an empty result). */
const DISPLAY_ORDER: RevenueSourceKey[] = ["crm", "referral", "new", "organic"];

const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Pure classifier. Each order → exactly one bucket by priority
 * referral > new > crm > organic. Sums to the orders' total.
 */
export function bucketRevenueSources(
  orders: Array<{ id: string; total: number; isFirst: boolean }>,
  crmOrderIds: Set<string>,
  referralOrderIds: Set<string>,
): RevenueSourcesResult {
  const acc: Record<RevenueSourceKey, { revenue: number; orders: number }> = {
    crm:      { revenue: 0, orders: 0 },
    referral: { revenue: 0, orders: 0 },
    new:      { revenue: 0, orders: 0 },
    organic:  { revenue: 0, orders: 0 },
  };
  let total = 0;
  for (const o of orders) {
    total += o.total;
    const key: RevenueSourceKey =
      referralOrderIds.has(o.id) ? "referral"
      : o.isFirst               ? "new"
      : crmOrderIds.has(o.id)   ? "crm"
      : "organic";
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
    select: { id: true, total: true, customerId: true, importedAt: true, createdAt: true },
  });
  if (orders.length === 0) return emptyResult();

  const orderIds    = orders.map((o) => o.id);
  const customerIds = [...new Set(orders.filter((o) => o.customerId).map((o) => o.customerId as string))];

  const [crmExec, crmActions, campaignCoupons, referrals, firstOrderAgg] = await Promise.all([
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
    // Referral: the order that validated a Foocci indicação
    prisma.referral.findMany({
      where:  { restaurantId, orderId: { in: orderIds } },
      select: { orderId: true },
    }),
    // New customer: each customer's earliest valid, non-imported order (all time).
    // If that earliest order falls inside the period, it's an acquisition here.
    customerIds.length > 0
      ? prisma.order.groupBy({
          by:    ["customerId"],
          where: { restaurantId, customerId: { in: customerIds }, importedAt: null, status: { in: REVENUE_STATUS } },
          _min:  { createdAt: true },
        })
      : Promise.resolve([] as Array<{ customerId: string | null; _min: { createdAt: Date | null } }>),
  ]);

  const crmOrderIds = new Set<string>();
  for (const e of crmExec)         if (e.convertedOrderId) crmOrderIds.add(e.convertedOrderId);
  for (const a of crmActions)      if (a.orderId)          crmOrderIds.add(a.orderId);
  for (const c of campaignCoupons) if (c.usedOrderId)      crmOrderIds.add(c.usedOrderId);

  const referralOrderIds = new Set<string>();
  for (const r of referrals) if (r.orderId) referralOrderIds.add(r.orderId);

  const firstOrderAtByCustomer = new Map<string, number>();
  for (const g of firstOrderAgg) {
    if (g.customerId && g._min.createdAt) firstOrderAtByCustomer.set(g.customerId, g._min.createdAt.getTime());
  }

  const mapped = orders.map((o) => ({
    id:      o.id,
    total:   Number(o.total),
    // First order = non-imported, has a customer, and this row IS that customer's
    // earliest valid order (its createdAt equals the per-customer minimum).
    isFirst: !o.importedAt && !!o.customerId && firstOrderAtByCustomer.get(o.customerId) === o.createdAt.getTime(),
  }));

  return bucketRevenueSources(mapped, crmOrderIds, referralOrderIds);
}
