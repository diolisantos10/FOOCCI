/**
 * GET /api/dashboard
 *
 * Comprehensive operational dashboard data — tenant-scoped.
 * Accepts optional ?period= query param for historical analysis.
 *
 * Period values: today (default) | yesterday | this_week | 7d | current_month | 30d | custom
 * Custom range:  ?period=custom&startDate=YYYY-MM-DD&endDate=YYYY-MM-DD
 *
 * Always real-time (never period-filtered):
 *   pipeline, delayedCount, pendingPaymentsCount, activeCampaigns, totalCustomers,
 *   crmSegments
 *
 * Period-sensitive:
 *   revenue, orders, avgTicket, topProducts, ordersByType, chartBuckets,
 *   newCustomersPeriod, foocciProof
 */

import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { OrderStatus, CampaignStatus } from "@prisma/client";
import { getTenantContext } from "@/lib/tenant";
import { ok, unauthorized, serverError } from "@/lib/api-response";
import { computePeriodRange, buildChartBuckets, type Period } from "@/lib/dashboard-periods";

const TERMINAL: OrderStatus[]        = ["DELIVERED", "CANCELLED"];
const REVENUE_STATUS: OrderStatus[]  = ["DELIVERED", "CONFIRMED", "PREPARING", "READY", "OUT_FOR_DELIVERY"];
const ACTIVE_CAMP: CampaignStatus[]  = ["ACTIVE", "SCHEDULED", "SENDING"];
const DELAY_MS                       = 20 * 60 * 1_000;
const DELAY_OK: OrderStatus[]        = ["READY", "OUT_FOR_DELIVERY", "AWAITING_PAYMENT"];

export async function GET(req: NextRequest) {
  const ctx = getTenantContext(req);
  if (!ctx) return unauthorized();

  try {
    const sp        = req.nextUrl.searchParams;
    const rawPeriod = sp.get("period") ?? "today";
    const periodKey = (["today","yesterday","this_week","7d","current_month","30d","custom"].includes(rawPeriod)
      ? rawPeriod : "today") as Period;

    const pr = computePeriodRange(periodKey, sp.get("startDate"), sp.get("endDate"));
    const { rangeStart, rangeEnd, prevStart, prevEnd, label: periodLabel, prevLabel, days, granularity } = pr;

    const [
      periodOrders,
      prevOrders,
      allOpenOrders,
      pendingPaymentsCount,
      totalCustomers,
      newCustomersPeriod,
      activeCampaigns,
      recoveryStats,
      crmSegmentCounts,
      cancelledPeriodCount,
      orderSourceCounts,
    ] = await Promise.all([
      // 1. Period orders (KPIs + products + types + chart)
      prisma.order.findMany({
        where: {
          restaurantId: ctx.restaurantId,
          createdAt:    { gte: rangeStart, lte: rangeEnd },
          status:       { in: REVENUE_STATUS },
        },
        select: {
          total: true, type: true, createdAt: true, source: true,
          items: {
            select: {
              name: true, menuItemId: true, quantity: true, total: true, categoryName: true,
              isUpsell: true,
              menuItem: { select: { imageUrl: true } },
            },
          },
        },
      }),
      // 2. Previous period orders (comparison KPIs + chart)
      prisma.order.findMany({
        where: {
          restaurantId: ctx.restaurantId,
          createdAt:    { gte: prevStart, lt: prevEnd },
          status:       { in: REVENUE_STATUS },
        },
        select: { total: true, createdAt: true },
      }),
      // 3. All live (non-terminal) orders — pipeline + delayed (always real-time)
      prisma.order.findMany({
        where:  { restaurantId: ctx.restaurantId, status: { notIn: TERMINAL } },
        select: { status: true, createdAt: true },
      }),
      // 4. Awaiting payment count (real-time)
      prisma.order.count({
        where: { restaurantId: ctx.restaurantId, status: "AWAITING_PAYMENT" },
      }),
      // 5. Total CRM customers (real-time)
      prisma.customer.count({
        where: { restaurantId: ctx.restaurantId, isGuest: false, isActive: true },
      }),
      // 6. New customers in selected period
      prisma.customer.count({
        where: {
          restaurantId: ctx.restaurantId,
          isGuest:      false,
          createdAt:    { gte: rangeStart, lte: rangeEnd },
        },
      }),
      // 7. Active/scheduled campaigns (real-time)
      prisma.campaign.findMany({
        where:   { restaurantId: ctx.restaurantId, status: { in: ACTIVE_CAMP } },
        select:  { id: true, name: true, status: true, totalSent: true, totalFailed: true, totalResponded: true, totalAudience: true },
        orderBy: { createdAt: "desc" },
        take:    3,
      }),
      // 8. Recovery stats for period
      prisma.orderDraft.findMany({
        where: {
          restaurantId:     ctx.restaurantId,
          recoveryAttempts: { gt: 0 },
          createdAt:        { gte: rangeStart, lte: rangeEnd },
        },
        select: { status: true },
      }),
      // 9. CRM segment counts (real-time)
      prisma.customer.groupBy({
        by:    ["segment"],
        where: { restaurantId: ctx.restaurantId, isGuest: false, isActive: true },
        _count: { id: true },
      }),
      // 10. Cancelled orders in period
      prisma.order.count({
        where: {
          restaurantId: ctx.restaurantId,
          createdAt:    { gte: rangeStart, lte: rangeEnd },
          status:       "CANCELLED",
        },
      }),
      // 11. Order source breakdown (channel attribution) for period
      prisma.order.groupBy({
        by:    ["source"],
        where: {
          restaurantId: ctx.restaurantId,
          createdAt:    { gte: rangeStart, lte: rangeEnd },
          status:       { in: REVENUE_STATUS },
        },
        _count: { id: true },
      }),
    ]);

    // ── Period KPIs ────────────────────────────────────────────────────────────
    const revenuePeriod = periodOrders.reduce((s, o) => s + Number(o.total), 0);
    const ordersPeriod  = periodOrders.length;
    const avgTicket     = ordersPeriod > 0 ? revenuePeriod / ordersPeriod : 0;

    // ── Previous period comparison ─────────────────────────────────────────────
    const revenuePrev = prevOrders.reduce((s, o) => s + Number(o.total), 0);
    const ordersPrev  = prevOrders.length;

    // ── Order pipeline (real-time) ─────────────────────────────────────────────
    const pipeline = {
      pending:        allOpenOrders.filter(o => o.status === "PENDING" || o.status === "AWAITING_PAYMENT").length,
      confirmed:      allOpenOrders.filter(o => o.status === "CONFIRMED").length,
      preparing:      allOpenOrders.filter(o => o.status === "PREPARING").length,
      ready:          allOpenOrders.filter(o => o.status === "READY").length,
      outForDelivery: allOpenOrders.filter(o => o.status === "OUT_FOR_DELIVERY").length,
    };
    const openOrders = allOpenOrders.length;

    // ── Delayed orders (real-time) ─────────────────────────────────────────────
    const now_ms       = Date.now();
    const delayedCount = allOpenOrders.filter(
      o => !DELAY_OK.includes(o.status) && (now_ms - o.createdAt.getTime()) > DELAY_MS
    ).length;

    // ── Top products (period) ──────────────────────────────────────────────────
    const productMap = new Map<string, { name: string; quantity: number; revenue: number; imageUrl: string | null; categoryName: string | null }>();
    for (const order of periodOrders) {
      for (const item of order.items) {
        const key = item.menuItemId ?? item.name;
        const p   = productMap.get(key);
        if (p) { p.quantity += item.quantity; p.revenue += Number(item.total); }
        else    { productMap.set(key, { name: item.name, quantity: item.quantity, revenue: Number(item.total), imageUrl: item.menuItem?.imageUrl ?? null, categoryName: item.categoryName ?? null }); }
      }
    }
    const topProducts = [...productMap.values()]
      .sort((a, b) => b.quantity - a.quantity)
      .slice(0, 10)
      .map(p => ({ ...p, revenue: Math.round(p.revenue * 100) / 100 }));

    // ── Order type breakdown (period) ──────────────────────────────────────────
    const ordersByType = {
      DELIVERY: periodOrders.filter(o => o.type === "DELIVERY").length,
      PICKUP:   periodOrders.filter(o => o.type === "PICKUP").length,
      DINE_IN:  periodOrders.filter(o => o.type === "DINE_IN").length,
    };

    // ── Chart buckets (current + previous period) ──────────────────────────────
    const numBuckets       = granularity === "hour" ? 24 : days;
    const chartBuckets     = buildChartBuckets(
      periodOrders.map(o => ({ createdAt: o.createdAt, total: Number(o.total) })),
      rangeStart, numBuckets, granularity,
    );
    const chartBucketsPrev = buildChartBuckets(
      prevOrders.map(o => ({ createdAt: o.createdAt, total: Number(o.total) })),
      prevStart, numBuckets, granularity,
    );

    // ── Foocci proof (upsell + recovery) ──────────────────────────────────────
    let upsellRevenue   = 0;
    let upsellItemCount = 0;
    for (const order of periodOrders) {
      for (const item of order.items) {
        if (item.isUpsell) { upsellRevenue += Number(item.total); upsellItemCount += item.quantity; }
      }
    }
    const recoveryTotal     = recoveryStats.length;
    const recoveryConverted = recoveryStats.filter(d => d.status === "CONFIRMED").length;
    const recoveryRate      = recoveryTotal > 0 ? Math.round((recoveryConverted / recoveryTotal) * 100) : null;

    // ── CRM segment breakdown (real-time) ─────────────────────────────────────
    const segMap: Record<string, number> = {};
    for (const row of crmSegmentCounts) {
      segMap[row.segment] = row._count.id;
    }

    // ── Order source / channel breakdown (period) ──────────────────────────────
    const sourceMap: Record<string, number> = {};
    for (const row of orderSourceCounts) {
      const key = row.source ?? "manual";
      sourceMap[key] = (sourceMap[key] ?? 0) + row._count.id;
    }

    return ok({
      // Period metadata
      period:          periodKey,
      periodLabel,
      periodDays:      days,
      granularity,

      // Period KPIs
      ordersPeriod,
      revenuePeriod:   Math.round(revenuePeriod  * 100) / 100,
      avgTicket:       Math.round(avgTicket       * 100) / 100,
      ordersPrev,
      revenuePrev:     Math.round(revenuePrev     * 100) / 100,

      // Real-time
      openOrders,
      totalCustomers,
      newCustomersPeriod,
      pipeline,
      delayedCount,
      pendingPaymentsCount,

      // Period charts
      topProducts,
      chartBuckets,
      chartBucketsPrev,
      prevPeriodLabel: prevLabel,
      ordersByType,

      // Period: cancelled count
      cancelledPeriod: cancelledPeriodCount,

      // Period: order source / channel attribution
      ordersBySource: sourceMap,

      // Campaigns (real-time)
      activeCampaigns: activeCampaigns.map(c => ({
        id:             c.id,
        name:           c.name,
        status:         c.status as string,
        totalSent:      c.totalSent,
        totalFailed:    c.totalFailed,
        totalResponded: c.totalResponded,
        totalAudience:  c.totalAudience,
      })),

      // Foocci proof (period)
      foocciProof: {
        upsellRevenue:      Math.round(upsellRevenue  * 100) / 100,
        upsellItemCount,
        recoveryTotal,
        recoveryConverted,
        recoveryRate,
      },

      // CRM segment breakdown (real-time)
      crmSegments: {
        quente:      segMap["QUENTE"]      ?? 0,
        morno:       segMap["MORNO"]       ?? 0,
        frio:        segMap["FRIO"]        ?? 0,
        semPedidos:  segMap["SEM_PEDIDOS"] ?? 0,
      },
    });
  } catch (err) {
    console.error("[GET /api/dashboard]", err);
    return serverError();
  }
}
