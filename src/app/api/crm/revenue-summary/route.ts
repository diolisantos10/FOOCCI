/**
 * GET /api/crm/revenue-summary
 *
 * Period-scoped CRM revenue aggregate. Accepts ?from=ISO&to=ISO; without params
 * returns all-time totals.
 *
 * Three honest revenue dimensions (never invented):
 *   - campaignRevenue: sum of Campaign.totalRevenue for campaigns active in the
 *     period (attributed by CampaignAttributionService when orders convert).
 *   - couponRevenue / couponOrders: real orders in the period whose couponCode
 *     matches a CRM campaign couponCode — coupon-proven attribution.
 *   - series: period-accurate, time-bucketed revenue from CampaignExecution
 *     proven conversions (convertedAt + revenue) — drives the overview chart.
 *
 * Read-only. No LLM. No send. No mutation.
 */
import { NextRequest, NextResponse } from "next/server";
import { getTenantId } from "@/lib/tenant";
import { prisma } from "@/lib/prisma";
import { OrderStatus } from "@prisma/client";
import { chartGranularity, buildRevenueSeries } from "@/lib/crm-revenue-series";

// Orders in these states never count as realized revenue (mirrors promotions metrics).
const REVENUE_EXCLUDED_STATUSES: OrderStatus[] = [
  OrderStatus.CANCELLED,
  OrderStatus.AWAITING_PAYMENT,
  OrderStatus.PENDING,
];

export async function GET(req: NextRequest) {
  let restaurantId: string;
  try { restaurantId = getTenantId(); }
  catch { return NextResponse.json({ error: "Unauthorized" }, { status: 401 }); }

  const { searchParams } = req.nextUrl;
  const from = searchParams.get("from");
  const to   = searchParams.get("to");
  const hasRange = !!(from && to);
  const fromDate = hasRange ? new Date(from!) : null;
  const toDate   = hasRange ? new Date(to!)   : null;

  // ── Engagement + attributed revenue, PERIOD-ACCURATE by event date ───────────
  // The cards must reflect what happened IN the period, so we count CampaignExecution
  // events (sentAt / convertedAt / readAt) — NOT Campaign lifetime counters, which
  // would report a campaign's whole history the moment it was merely touched in the
  // window (why "Hoje" showed 0 even after sends today).
  const sentWhere = {
    campaign: { restaurantId },
    sentAt: hasRange ? { gte: fromDate!, lte: toDate! } : { not: null },
  };
  const convWhere = {
    campaign: { restaurantId },
    converted: true,
    convertedAt: hasRange ? { gte: fromDate!, lte: toDate! } : { not: null },
  };
  const [totalSent, sentCampaigns, convAgg, totalResponded] = await Promise.all([
    prisma.campaignExecution.count({ where: sentWhere }),
    prisma.campaignExecution.groupBy({ by: ["campaignId"], where: sentWhere }),
    prisma.campaignExecution.aggregate({
      where: convWhere,
      _count: { _all: true },
      _sum: { revenue: true },
    }),
    prisma.campaignExecution.count({
      where: {
        campaign: { restaurantId },
        readAt: hasRange ? { gte: fromDate!, lte: toDate! } : { not: null },
      },
    }),
  ]);
  const totalConverted = convAgg._count._all;
  const campaignRevenue = Number(convAgg._sum.revenue ?? 0);
  const campaignCount = sentCampaigns.length;

  // ── Coupon-proven revenue: orders in period using a CRM campaign couponCode ──
  // Pull the distinct, non-null couponCodes linked to this tenant's campaigns,
  // then sum realized orders that redeemed one of them within the period.
  const campaignCoupons = await prisma.campaign.findMany({
    where:    { restaurantId, couponCode: { not: null } },
    select:   { couponCode: true },
    distinct: ["couponCode"],
  });
  const couponCodes = campaignCoupons
    .map((c) => c.couponCode)
    .filter((c): c is string => !!c);

  let couponRevenue = 0;
  let couponOrders  = 0;
  if (couponCodes.length > 0) {
    const couponAgg = await prisma.order.aggregate({
      where: {
        restaurantId,
        importedAt: null, // real Foocci orders only — imported history excluded
        couponCode: { in: couponCodes },
        status:     { notIn: REVENUE_EXCLUDED_STATUSES },
        ...(hasRange ? { createdAt: { gte: fromDate!, lte: toDate! } } : {}),
      },
      _sum:   { total: true },
      _count: { _all: true },
    });
    couponRevenue = Number(couponAgg._sum.total ?? 0);
    couponOrders  = couponAgg._count._all;
  }

  // ── Time-series: proven CampaignExecution conversions (convertedAt + revenue) ─
  // Period-accurate by conversion date, tenant-scoped through the campaign relation
  // (CampaignExecution.restaurantId is a nullable denormalization). Never invented:
  // only rows that actually converted with a recorded revenue contribute.
  const granularity = chartGranularity(fromDate, toDate);
  const conversionRows = await prisma.campaignExecution.findMany({
    where: {
      converted:   true,
      revenue:     { not: null },
      convertedAt: hasRange ? { gte: fromDate!, lte: toDate! } : { not: null },
      campaign:    { restaurantId },
    },
    select: { convertedAt: true, revenue: true },
  });
  const series = buildRevenueSeries(
    conversionRows
      .filter((r): r is { convertedAt: Date; revenue: typeof r.revenue } => r.convertedAt !== null)
      .map((r) => ({ convertedAt: r.convertedAt, revenue: Number(r.revenue ?? 0) })),
    fromDate,
    toDate,
    granularity,
  );
  const seriesRevenue = series.reduce((s, b) => s + b.revenue, 0);
  const seriesOrders  = series.reduce((s, b) => s + b.orders, 0);

  return NextResponse.json({
    data: {
      // Backwards-compatible fields (consumed by OverviewTab today):
      totalRevenue:   campaignRevenue,
      totalSent,
      totalResponded,
      totalConverted,
      campaignCount,
      // Coupon-proven dimension:
      couponRevenue,
      couponOrders,
      couponCodesTracked: couponCodes.length,
      // Time-series (proven conversions) for the overview chart:
      series,
      seriesRevenue,
      seriesOrders,
      granularity,
    },
  });
}
