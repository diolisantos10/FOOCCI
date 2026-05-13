/**
 * GET /api/dashboard
 *
 * Returns real KPI data for the dashboard home screen.
 * Tenant-scoped, uses existing Order + Customer tables.
 */

import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { OrderStatus } from "@prisma/client";
import { getTenantContext } from "@/lib/tenant";
import { ok, unauthorized, serverError } from "@/lib/api-response";

const TERMINAL: OrderStatus[] = ["DELIVERED", "CANCELLED"];
const REVENUE_STATUS: OrderStatus[] = ["DELIVERED", "CONFIRMED", "PREPARING", "READY", "OUT_FOR_DELIVERY"];

function brazilMidnight(): Date {
  // Brazil UTC-3: today starts at 03:00 UTC
  const now = new Date();
  const d = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate(), 3, 0, 0));
  // If current UTC time < 03:00 (still "yesterday" BRT), roll back one day
  if (Date.now() < d.getTime()) d.setUTCDate(d.getUTCDate() - 1);
  return d;
}

export async function GET(req: NextRequest) {
  const ctx = getTenantContext(req);
  if (!ctx) return unauthorized();

  try {
    const todayStart = brazilMidnight();
    const sevenDaysAgo = new Date(todayStart.getTime() - 7 * 86_400_000);

    const [
      ordersToday,
      openOrders,
      totalCustomers,
      last7Days,
    ] = await Promise.all([
      // Today's delivered/in-progress orders and revenue
      prisma.order.findMany({
        where: {
          restaurantId: ctx.restaurantId,
          createdAt: { gte: todayStart },
          status: { in: REVENUE_STATUS },
        },
        select: { total: true, status: true },
      }),

      // Currently open (non-terminal) orders
      prisma.order.count({
        where: {
          restaurantId: ctx.restaurantId,
          status: { notIn: TERMINAL },
        },
      }),

      // Total CRM customers (non-guest)
      prisma.customer.count({
        where: {
          restaurantId: ctx.restaurantId,
          isGuest: false,
          isActive: true,
        },
      }),

      // Last 7 days of orders for trend (revenue only, delivered)
      prisma.order.findMany({
        where: {
          restaurantId: ctx.restaurantId,
          createdAt: { gte: sevenDaysAgo },
          status: { in: REVENUE_STATUS },
        },
        select: { total: true, createdAt: true },
        orderBy: { createdAt: "asc" },
      }),
    ]);

    const revenueToday = ordersToday.reduce((s, o) => s + Number(o.total), 0);
    const ordersCount  = ordersToday.length;
    const avgTicket    = ordersCount > 0 ? revenueToday / ordersCount : 0;

    // Build 7-day daily revenue series
    const dayMap: Record<string, number> = {};
    for (let i = 6; i >= 0; i--) {
      const d = new Date(todayStart.getTime() - i * 86_400_000);
      const key = d.toISOString().slice(0, 10);
      dayMap[key] = 0;
    }
    for (const o of last7Days) {
      // Assign to BRT day (UTC-3)
      const d = new Date(o.createdAt.getTime() - 3 * 3_600_000);
      const key = d.toISOString().slice(0, 10);
      if (key in dayMap) dayMap[key] = (dayMap[key] ?? 0) + Number(o.total);
    }
    const trend7Days = Object.entries(dayMap).map(([date, revenue]) => ({ date, revenue }));
    const revenue7Days = trend7Days.reduce((s, d) => s + d.revenue, 0);

    return ok({
      ordersToday:   ordersCount,
      revenueToday:  Math.round(revenueToday * 100) / 100,
      avgTicket:     Math.round(avgTicket * 100) / 100,
      openOrders,
      totalCustomers,
      revenue7Days:  Math.round(revenue7Days * 100) / 100,
      trend7Days,
    });
  } catch (err) {
    console.error("[GET /api/dashboard]", err);
    return serverError();
  }
}
