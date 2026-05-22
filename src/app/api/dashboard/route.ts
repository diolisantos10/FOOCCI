/**
 * GET /api/dashboard
 *
 * Comprehensive operational dashboard data — tenant-scoped.
 * Returns KPIs, order pipeline, top products, hourly breakdown,
 * 7-day trend, and active campaign summary in a single request.
 */

import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { OrderStatus, CampaignStatus } from "@prisma/client";
import { getTenantContext } from "@/lib/tenant";
import { ok, unauthorized, serverError } from "@/lib/api-response";

const TERMINAL: OrderStatus[]        = ["DELIVERED", "CANCELLED"];
const REVENUE_STATUS: OrderStatus[]  = ["DELIVERED", "CONFIRMED", "PREPARING", "READY", "OUT_FOR_DELIVERY"];
const ACTIVE_CAMP: CampaignStatus[]  = ["ACTIVE", "SCHEDULED", "SENDING"];
const DELAY_MS                       = 20 * 60 * 1_000;
// These statuses are not operationally "delayed" (already served or awaiting payment)
const DELAY_OK: OrderStatus[]        = ["READY", "OUT_FOR_DELIVERY", "AWAITING_PAYMENT"];

/** Start of the current business day in Brazil time (UTC-3 = 03:00 UTC). */
function brazilMidnight(offsetDays = 0): Date {
  const now = new Date();
  const d = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate() + offsetDays, 3, 0, 0));
  if (offsetDays === 0 && Date.now() < d.getTime()) d.setUTCDate(d.getUTCDate() - 1);
  return d;
}

export async function GET(req: NextRequest) {
  const ctx = getTenantContext(req);
  if (!ctx) return unauthorized();

  try {
    const todayStart     = brazilMidnight(0);
    const yesterdayStart = new Date(todayStart.getTime() - 86_400_000);
    const sevenDaysAgo   = new Date(todayStart.getTime() - 7 * 86_400_000);

    const [
      todayOrders,
      yesterdayOrders,
      allOpenOrders,
      pendingPaymentsCount,
      totalCustomers,
      newCustomersToday,
      last7DaysOrders,
      activeCampaigns,
    ] = await Promise.all([
      // 1. Today's valid orders with items (KPIs + products + types + hourly)
      prisma.order.findMany({
        where:  { restaurantId: ctx.restaurantId, createdAt: { gte: todayStart }, status: { in: REVENUE_STATUS } },
        select: {
          total: true, type: true, createdAt: true,
          items: {
            select: {
              name: true, menuItemId: true, quantity: true, total: true, categoryName: true,
              menuItem: { select: { imageUrl: true } },
            },
          },
        },
      }),
      // 2. Yesterday's valid orders (comparison)
      prisma.order.findMany({
        where:  { restaurantId: ctx.restaurantId, createdAt: { gte: yesterdayStart, lt: todayStart }, status: { in: REVENUE_STATUS } },
        select: { total: true },
      }),
      // 3. All live (non-terminal) orders — pipeline + delayed
      prisma.order.findMany({
        where:  { restaurantId: ctx.restaurantId, status: { notIn: TERMINAL } },
        select: { status: true, createdAt: true },
      }),
      // 4. Orders waiting for customer payment
      prisma.order.count({
        where: { restaurantId: ctx.restaurantId, status: "AWAITING_PAYMENT" },
      }),
      // 5. Total active CRM customers
      prisma.customer.count({
        where: { restaurantId: ctx.restaurantId, isGuest: false, isActive: true },
      }),
      // 6. New customers acquired today
      prisma.customer.count({
        where: { restaurantId: ctx.restaurantId, isGuest: false, createdAt: { gte: todayStart } },
      }),
      // 7. Last 7 days for trend chart
      prisma.order.findMany({
        where:   { restaurantId: ctx.restaurantId, createdAt: { gte: sevenDaysAgo }, status: { in: REVENUE_STATUS } },
        select:  { total: true, createdAt: true },
        orderBy: { createdAt: "asc" },
      }),
      // 8. Top 3 active/scheduled campaigns for dashboard summary
      prisma.campaign.findMany({
        where:   { restaurantId: ctx.restaurantId, status: { in: ACTIVE_CAMP } },
        select:  { id: true, name: true, status: true, totalSent: true, totalResponded: true, totalAudience: true },
        orderBy: { createdAt: "desc" },
        take:    3,
      }),
    ]);

    // ── Today KPIs ─────────────────────────────────────────────────────────────
    const revenueToday = todayOrders.reduce((s, o) => s + Number(o.total), 0);
    const ordersCount  = todayOrders.length;
    const avgTicket    = ordersCount > 0 ? revenueToday / ordersCount : 0;

    // ── Yesterday comparison ───────────────────────────────────────────────────
    const revenueYesterday = yesterdayOrders.reduce((s, o) => s + Number(o.total), 0);
    const ordersYesterday  = yesterdayOrders.length;

    // ── Order pipeline ─────────────────────────────────────────────────────────
    const pipeline = {
      pending:        allOpenOrders.filter(o => o.status === "PENDING" || o.status === "AWAITING_PAYMENT").length,
      confirmed:      allOpenOrders.filter(o => o.status === "CONFIRMED").length,
      preparing:      allOpenOrders.filter(o => o.status === "PREPARING").length,
      ready:          allOpenOrders.filter(o => o.status === "READY").length,
      outForDelivery: allOpenOrders.filter(o => o.status === "OUT_FOR_DELIVERY").length,
    };
    const openOrders = allOpenOrders.length;

    // ── Delayed orders ─────────────────────────────────────────────────────────
    const now          = Date.now();
    const delayedCount = allOpenOrders.filter(
      o => !DELAY_OK.includes(o.status) && (now - o.createdAt.getTime()) > DELAY_MS
    ).length;

    // ── Top products today ─────────────────────────────────────────────────────
    const productMap = new Map<string, { name: string; quantity: number; revenue: number; imageUrl: string | null; categoryName: string | null }>();
    for (const order of todayOrders) {
      for (const item of order.items) {
        const key = item.menuItemId ?? item.name;
        const p   = productMap.get(key);
        if (p) { p.quantity += item.quantity; p.revenue += Number(item.total); }
        else    { productMap.set(key, { name: item.name, quantity: item.quantity, revenue: Number(item.total), imageUrl: item.menuItem?.imageUrl ?? null, categoryName: item.categoryName ?? null }); }
      }
    }
    const topProducts = [...productMap.values()]
      .sort((a, b) => b.quantity - a.quantity)
      .slice(0, 5)
      .map(p => ({ ...p, revenue: Math.round(p.revenue * 100) / 100 }));

    // ── Hourly breakdown ───────────────────────────────────────────────────────
    const hourlyMap = new Map<number, { orders: number; revenue: number }>();
    for (const order of todayOrders) {
      const hour = new Date(order.createdAt.getTime() - 3 * 3_600_000).getUTCHours();
      const slot = hourlyMap.get(hour) ?? { orders: 0, revenue: 0 };
      slot.orders += 1; slot.revenue += Number(order.total);
      hourlyMap.set(hour, slot);
    }
    const hourlyOrders = Array.from({ length: 24 }, (_, h) => ({
      hour:    h,
      orders:  hourlyMap.get(h)?.orders  ?? 0,
      revenue: Math.round((hourlyMap.get(h)?.revenue ?? 0) * 100) / 100,
    }));

    // ── Order type breakdown ───────────────────────────────────────────────────
    const ordersByType = {
      DELIVERY: todayOrders.filter(o => o.type === "DELIVERY").length,
      PICKUP:   todayOrders.filter(o => o.type === "PICKUP").length,
      DINE_IN:  todayOrders.filter(o => o.type === "DINE_IN").length,
    };

    // ── 7-day trend ────────────────────────────────────────────────────────────
    const dayRev: Record<string, number> = {};
    const dayOrd: Record<string, number> = {};
    for (let i = 6; i >= 0; i--) {
      const k = new Date(todayStart.getTime() - i * 86_400_000).toISOString().slice(0, 10);
      dayRev[k] = 0; dayOrd[k] = 0;
    }
    for (const o of last7DaysOrders) {
      const k = new Date(o.createdAt.getTime() - 3 * 3_600_000).toISOString().slice(0, 10);
      if (k in dayRev) { dayRev[k] = (dayRev[k] ?? 0) + Number(o.total); dayOrd[k] = (dayOrd[k] ?? 0) + 1; }
    }
    const trend7Days   = Object.entries(dayRev).map(([date, rev]) => ({ date, revenue: Math.round(rev * 100) / 100, orders: dayOrd[date] ?? 0 }));
    const revenue7Days = trend7Days.reduce((s, d) => s + d.revenue, 0);

    return ok({
      ordersToday:          ordersCount,
      revenueToday:         Math.round(revenueToday         * 100) / 100,
      avgTicket:            Math.round(avgTicket             * 100) / 100,
      openOrders,
      totalCustomers,
      newCustomersToday,
      ordersYesterday,
      revenueYesterday:     Math.round(revenueYesterday      * 100) / 100,
      revenue7Days:         Math.round(revenue7Days          * 100) / 100,
      trend7Days,
      pipeline,
      delayedCount,
      pendingPaymentsCount,
      topProducts,
      hourlyOrders,
      ordersByType,
      activeCampaigns: activeCampaigns.map(c => ({
        id:             c.id,
        name:           c.name,
        status:         c.status as string,
        totalSent:      c.totalSent,
        totalResponded: c.totalResponded,
        totalAudience:  c.totalAudience,
      })),
    });
  } catch (err) {
    console.error("[GET /api/dashboard]", err);
    return serverError();
  }
}
