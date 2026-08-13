/**
 * RevenueAttributionService — "de onde vem a venda".
 *
 * Splits a period's revenue into THREE buckets so the shares sum to exactly the
 * dashboard's "Faturamento". Attribution is VALUE-SPLIT, not whole-order:
 *
 *   • garcom      — the agent's own merit: the value of the SPECIFIC items the
 *                   customer was upsold/recommended (Σ isUpsell item totals),
 *                   PLUS the remaining value of orders that closed a validated
 *                   indicação (Referral).
 *   • crm         — a CRM campaign/automation brought the customer back: the
 *                   remaining order value (order total minus any upsold items)
 *                   of converted orders (campaign execution, AI/automation
 *                   action, or a campaign coupon).
 *   • espontanea  — whatever is left: the customer bought on their own.
 *
 * The upsold item is ALWAYS credited to garçom — the specific product is the
 * agent's merit even when CRM/referral drove the visit — while the rest of that
 * same order is credited to whoever drove the whole purchase. Every cent is
 * counted exactly once and the buckets sum to the period total. The pure
 * `bucketRevenueSources` holds the rule (unit-tested); `getRevenueSources` runs
 * the tenant-scoped queries and feeds it.
 */

import { prisma } from "@/lib/prisma";
import { OrderStatus } from "@prisma/client";
import { REVENUE_STATUS_LIST } from "@/lib/order-revenue";

// A definição de venda é única e mora em @/lib/order-revenue — assim este
// detalhamento sempre soma exatamente o número do quadrado de Faturamento.
const REVENUE_STATUS: OrderStatus[] = REVENUE_STATUS_LIST;

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
 * Pure classifier — VALUE-SPLIT per order. The upsold items' value always goes to
 * garçom (the specific product is the agent's merit); the rest of the order goes
 * to whoever drove the whole purchase, by priority referral > crm > espontânea.
 * Every cent is counted once and the buckets sum to the orders' total.
 *
 * `upsellValueByOrder[orderId]` = Σ of that order's upsold (isUpsell) item totals.
 */
export function bucketRevenueSources(
  orders: Array<{ id: string; total: number }>,
  sets: { referral: Set<string>; crm: Set<string> },
  upsellValueByOrder: Record<string, number> = {},
): RevenueSourcesResult {
  const acc: Record<RevenueSourceKey, { revenue: number; orders: number }> = {
    crm:        { revenue: 0, orders: 0 },
    garcom:     { revenue: 0, orders: 0 },
    espontanea: { revenue: 0, orders: 0 },
  };
  let total = 0;
  for (const o of orders) {
    total += o.total;
    // The specific upsold product is always the agent's (garçom) merit — clamp to
    // [0, total] so a stale/oversized figure can never exceed the order.
    const upsellValue = Math.min(o.total, Math.max(0, upsellValueByOrder[o.id] ?? 0));
    const remainder   = o.total - upsellValue;
    acc.garcom.revenue += upsellValue;
    // The rest of the order is attributed to whoever drove the whole purchase.
    const baseKey: RevenueSourceKey =
      sets.referral.has(o.id) ? "garcom"     // indicação validada trouxe o cliente
      : sets.crm.has(o.id)    ? "crm"        // CRM trouxe de volta
      : "espontanea";                        // cliente por conta própria
    acc[baseKey].revenue += remainder;
    // Count the order once, under its primary driver — or garçom when the only
    // Foocci influence on an otherwise-spontaneous order was the upsell.
    const countKey: RevenueSourceKey =
      baseKey === "espontanea" && upsellValue > 0 ? "garcom" : baseKey;
    acc[countKey].orders += 1;
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

  const [crmExec, crmActions, campaignCoupons, referrals, upsellAgg] = await Promise.all([
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
    // Garçom: value of the SPECIFIC items the agent upsold, summed per order —
    // only this delta is the agent's merit, not the whole order it rode on.
    prisma.orderItem.groupBy({
      by:     ["orderId"],
      where:  { orderId: { in: orderIds }, isUpsell: true },
      _sum:   { total: true },
    }),
  ]);

  const crm = new Set<string>();
  for (const e of crmExec)         if (e.convertedOrderId) crm.add(e.convertedOrderId);
  for (const a of crmActions)      if (a.orderId)          crm.add(a.orderId);
  for (const c of campaignCoupons) if (c.usedOrderId)      crm.add(c.usedOrderId);

  const referral = new Set<string>();
  for (const r of referrals) if (r.orderId) referral.add(r.orderId);

  const upsellValueByOrder: Record<string, number> = {};
  for (const u of upsellAgg) if (u.orderId) upsellValueByOrder[u.orderId] = Number(u._sum.total ?? 0);

  return bucketRevenueSources(
    orders.map((o) => ({ id: o.id, total: Number(o.total) })),
    { referral, crm },
    upsellValueByOrder,
  );
}
