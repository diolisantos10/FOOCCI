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
 *   revenue, orders, avgTicket, topProducts, ordersByType, trendDays, hourlyOrders,
 *   newCustomersPeriod, foocciProof
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
const DELAY_OK: OrderStatus[]        = ["READY", "OUT_FOR_DELIVERY", "AWAITING_PAYMENT"];

/** Start of a business day in Brazil time (UTC-3 = 03:00 UTC). */
function brazilMidnight(offsetDays = 0): Date {
  const now = new Date();
  const d = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate() + offsetDays, 3, 0, 0));
  if (offsetDays === 0 && Date.now() < d.getTime()) d.setUTCDate(d.getUTCDate() - 1);
  return d;
}

/** Parse YYYY-MM-DD as Brazil midnight (03:00 UTC). */
function parseBrazilDate(s: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const d = new Date(`${s}T03:00:00.000Z`);
  return isNaN(d.getTime()) ? null : d;
}

type Period = "today" | "yesterday" | "this_week" | "7d" | "current_month" | "30d" | "custom";

interface PeriodRange {
  rangeStart: Date;
  rangeEnd:   Date;
  prevStart:  Date;
  prevEnd:    Date;
  period:     Period;
  label:      string;
  days:       number;
  isToday:    boolean;
}

function computePeriodRange(
  period:         Period,
  startDateParam: string | null,
  endDateParam:   string | null,
): PeriodRange {
  const now        = new Date();
  const todayStart = brazilMidnight(0);

  if (period === "today") {
    return {
      rangeStart: todayStart, rangeEnd: now,
      prevStart:  new Date(todayStart.getTime() - 86_400_000), prevEnd: todayStart,
      period, label: "Hoje", days: 1, isToday: true,
    };
  }

  if (period === "yesterday") {
    const yStart = new Date(todayStart.getTime() - 86_400_000);
    const yEnd   = todayStart;
    return {
      rangeStart: yStart, rangeEnd: yEnd,
      prevStart:  new Date(yStart.getTime() - 86_400_000), prevEnd: yStart,
      period, label: "Ontem", days: 1, isToday: false,
    };
  }

  if (period === "this_week") {
    // Monday 00:00 Brazil time
    const brazilNow  = new Date(now.getTime() - 3 * 3_600_000);
    const dayOfWeek  = brazilNow.getUTCDay(); // 0=Sun,1=Mon...6=Sat
    const daysSinceMon = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
    const weekStart  = new Date(todayStart.getTime() - daysSinceMon * 86_400_000);
    const days       = Math.max(1, daysSinceMon + 1);
    return {
      rangeStart: weekStart, rangeEnd: now,
      prevStart:  new Date(weekStart.getTime() - 7 * 86_400_000), prevEnd: weekStart,
      period, label: "Esta semana", days, isToday: false,
    };
  }

  if (period === "7d") {
    const rangeStart = new Date(todayStart.getTime() - 6 * 86_400_000);
    return {
      rangeStart, rangeEnd: now,
      prevStart: new Date(rangeStart.getTime() - 7 * 86_400_000), prevEnd: rangeStart,
      period, label: "Últimos 7 dias", days: 7, isToday: false,
    };
  }

  if (period === "current_month") {
    const brazilNow = new Date(now.getTime() - 3 * 3_600_000);
    const y = brazilNow.getUTCFullYear(), m = brazilNow.getUTCMonth();
    const rangeStart = new Date(Date.UTC(y, m, 1, 3, 0, 0));
    const prevStart  = new Date(Date.UTC(y, m - 1, 1, 3, 0, 0));
    const prevEnd    = rangeStart;
    const days = Math.max(1, Math.ceil((now.getTime() - rangeStart.getTime()) / 86_400_000));
    return {
      rangeStart, rangeEnd: now,
      prevStart, prevEnd,
      period, label: "Mês atual", days, isToday: false,
    };
  }

  if (period === "30d") {
    const rangeStart = new Date(todayStart.getTime() - 29 * 86_400_000);
    return {
      rangeStart, rangeEnd: now,
      prevStart: new Date(rangeStart.getTime() - 30 * 86_400_000), prevEnd: rangeStart,
      period, label: "Últimos 30 dias", days: 30, isToday: false,
    };
  }

  // custom
  const rawStart = startDateParam ? parseBrazilDate(startDateParam) : null;
  const rawEnd   = endDateParam   ? parseBrazilDate(endDateParam)   : null;
  const safeStart = rawStart ?? todayStart;
  // endDate is inclusive: add 1 day so the full end-day's data is included
  const endDay   = rawEnd   ?? now;
  const safeEnd  = new Date(Math.min(
    endDay.getTime() + 86_400_000, // inclusive end-day
    now.getTime(),
  ));
  const days = Math.max(1, Math.ceil((safeEnd.getTime() - safeStart.getTime()) / 86_400_000));
  const label = startDateParam && endDateParam
    ? `${startDateParam.slice(5)} – ${endDateParam.slice(5)}`
    : "Personalizado";

  return {
    rangeStart: safeStart, rangeEnd: safeEnd,
    prevStart: new Date(safeStart.getTime() - days * 86_400_000), prevEnd: safeStart,
    period, label, days, isToday: false,
  };
}

export async function GET(req: NextRequest) {
  const ctx = getTenantContext(req);
  if (!ctx) return unauthorized();

  try {
    const sp            = req.nextUrl.searchParams;
    const rawPeriod     = sp.get("period") ?? "today";
    const periodKey     = (["today","yesterday","this_week","7d","current_month","30d","custom"].includes(rawPeriod)
      ? rawPeriod : "today") as Period;

    const pr = computePeriodRange(periodKey, sp.get("startDate"), sp.get("endDate"));
    const { rangeStart, rangeEnd, prevStart, prevEnd, label: periodLabel, days, isToday } = pr;

    // Always need brazilMidnight for real-time delayed-order check
    const todayStart = brazilMidnight(0);

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
      // 1. Period orders (KPIs + products + types + hourly/daily)
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
      // 2. Previous period orders (comparison delta)
      prisma.order.findMany({
        where: {
          restaurantId: ctx.restaurantId,
          createdAt:    { gte: prevStart, lt: prevEnd },
          status:       { in: REVENUE_STATUS },
        },
        select: { total: true },
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
      // 8. Recovery stats for period (drafts with at least one recovery attempt)
      prisma.orderDraft.findMany({
        where: {
          restaurantId:    ctx.restaurantId,
          recoveryAttempts: { gt: 0 },
          createdAt:       { gte: rangeStart, lte: rangeEnd },
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
    const now_ms      = Date.now();
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
      .slice(0, 5)
      .map(p => ({ ...p, revenue: Math.round(p.revenue * 100) / 100 }));

    // ── Hourly breakdown (today + yesterday — adaptive granularity) ───────────
    const hourlyOrders = (() => {
      if (!isToday && periodKey !== "yesterday") return [];
      const hourlyMap = new Map<number, { orders: number; revenue: number }>();
      for (const order of periodOrders) {
        const hour = new Date(order.createdAt.getTime() - 3 * 3_600_000).getUTCHours();
        const slot = hourlyMap.get(hour) ?? { orders: 0, revenue: 0 };
        slot.orders += 1; slot.revenue += Number(order.total);
        hourlyMap.set(hour, slot);
      }
      return Array.from({ length: 24 }, (_, h) => ({
        hour:    h,
        orders:  hourlyMap.get(h)?.orders  ?? 0,
        revenue: Math.round((hourlyMap.get(h)?.revenue ?? 0) * 100) / 100,
      }));
    })();

    // ── Order type breakdown (period) ──────────────────────────────────────────
    const ordersByType = {
      DELIVERY: periodOrders.filter(o => o.type === "DELIVERY").length,
      PICKUP:   periodOrders.filter(o => o.type === "PICKUP").length,
      DINE_IN:  periodOrders.filter(o => o.type === "DINE_IN").length,
    };

    // ── Daily trend (period) ───────────────────────────────────────────────────
    // Build a daily map covering the full range (capped at 90 days).
    const trendDays = (() => {
      const cappedDays = Math.min(days, 90);
      const dayRev: Record<string, number> = {};
      const dayOrd: Record<string, number> = {};
      for (let i = cappedDays - 1; i >= 0; i--) {
        const k = new Date(rangeEnd.getTime() - i * 86_400_000 - 3 * 3_600_000).toISOString().slice(0, 10);
        dayRev[k] = 0; dayOrd[k] = 0;
      }
      for (const o of periodOrders) {
        const k = new Date(o.createdAt.getTime() - 3 * 3_600_000).toISOString().slice(0, 10);
        if (k in dayRev) { dayRev[k] = (dayRev[k] ?? 0) + Number(o.total); dayOrd[k] = (dayOrd[k] ?? 0) + 1; }
      }
      return Object.entries(dayRev).map(([date, rev]) => ({
        date, revenue: Math.round(rev * 100) / 100, orders: dayOrd[date] ?? 0,
      }));
    })();

    // Keep todayStart-based 7-day trend for backward compat on "today" view
    // (the trend section uses last 7 days when isToday)
    const trend7DaysBase = (() => {
      if (!isToday) return trendDays;
      const sevenDaysAgo = new Date(todayStart.getTime() - 7 * 86_400_000);
      const dayRev: Record<string, number> = {};
      const dayOrd: Record<string, number> = {};
      for (let i = 6; i >= 0; i--) {
        const k = new Date(todayStart.getTime() - i * 86_400_000).toISOString().slice(0, 10);
        dayRev[k] = 0; dayOrd[k] = 0;
      }
      for (const o of periodOrders) {
        if (o.createdAt >= sevenDaysAgo) {
          const k = new Date(o.createdAt.getTime() - 3 * 3_600_000).toISOString().slice(0, 10);
          if (k in dayRev) { dayRev[k] = (dayRev[k] ?? 0) + Number(o.total); dayOrd[k] = (dayOrd[k] ?? 0) + 1; }
        }
      }
      return Object.entries(dayRev).map(([date, rev]) => ({
        date, revenue: Math.round(rev * 100) / 100, orders: dayOrd[date] ?? 0,
      }));
    })();

    const revenueTrend = trendDays.reduce((s, d) => s + d.revenue, 0);

    // ── Foocci proof (upsell + recovery) ──────────────────────────────────────
    let upsellRevenue = 0;
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
      period:        periodKey,
      periodLabel,
      periodDays:    days,

      // Period KPIs
      ordersPeriod:   ordersPeriod,
      revenuePeriod:  Math.round(revenuePeriod  * 100) / 100,
      avgTicket:      Math.round(avgTicket       * 100) / 100,
      ordersPrev,
      revenuePrev:    Math.round(revenuePrev     * 100) / 100,

      // Real-time
      openOrders,
      totalCustomers,
      newCustomersPeriod,
      pipeline,
      delayedCount,
      pendingPaymentsCount,

      // Period charts
      topProducts,
      hourlyOrders,
      ordersByType,
      trendDays:    isToday ? trend7DaysBase : trendDays,
      revenueTrend: Math.round(revenueTrend * 100) / 100,

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
