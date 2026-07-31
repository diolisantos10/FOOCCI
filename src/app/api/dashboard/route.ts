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
import { getRevenueSources } from "@/services/dashboard/RevenueAttributionService";

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

    // The chart shows `numBuckets` full buckets. For the PREVIOUS series we fetch
    // the entire span those buckets cover — not just up to "now − 1 period" — so
    // the comparison (e.g. last week's same weekday) is filled across the whole
    // day, letting the owner see the hours still ahead and anticipate them. The
    // KPI delta further down stays time-aligned (only orders before prevEnd).
    const numBuckets   = granularity === "hour" ? 24 : days;
    const bucketMs     = granularity === "hour" ? 3_600_000 : 86_400_000;
    const prevFetchEnd = new Date(Math.max(prevEnd.getTime(), prevStart.getTime() + numBuckets * bucketMs));

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
      newCustomersPrev,
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
      // 2. Previous period orders (comparison KPIs + chart). Fetch the full
      //    bucket span (prevFetchEnd) so the chart's comparison is complete; the
      //    KPI delta uses only the time-aligned slice (< prevEnd) below.
      prisma.order.findMany({
        where: {
          restaurantId: ctx.restaurantId,
          createdAt:    { gte: prevStart, lt: prevFetchEnd },
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
      // 12. New customers in the COMPLETE previous period (KPI comparison)
      prisma.customer.count({
        where: {
          restaurantId: ctx.restaurantId,
          isGuest:      false,
          createdAt:    { gte: prevStart, lt: prevFetchEnd },
        },
      }),
    ]);

    // ── Conversion by channel — the same identified→sale funnel, split by where
    //    the customer entered (conversation channel). Two light list queries per
    //    period + JS intersection, instead of 2 counts × N channels.
    const [
      convRowsNow, convRowsPrev, orderCustNow, orderCustPrev,
      menuEntriesNow, menuEntriesPrev, revenueSources,
    ] = await Promise.all([
      prisma.conversation.findMany({
        where: { restaurantId: ctx.restaurantId, createdAt: { gte: rangeStart, lte: rangeEnd }, customerId: { not: null }, customer: { isGuest: false } },
        select: { channel: true, customerId: true },
      }),
      prisma.conversation.findMany({
        where: { restaurantId: ctx.restaurantId, createdAt: { gte: prevStart, lt: prevFetchEnd }, customerId: { not: null }, customer: { isGuest: false } },
        select: { channel: true, customerId: true },
      }),
      prisma.order.findMany({
        where: { restaurantId: ctx.restaurantId, importedAt: null, createdAt: { gte: rangeStart, lte: rangeEnd }, status: { in: REVENUE_STATUS } },
        select: { customerId: true },
      }),
      prisma.order.findMany({
        where: { restaurantId: ctx.restaurantId, importedAt: null, createdAt: { gte: prevStart, lt: prevFetchEnd }, status: { in: REVENUE_STATUS } },
        select: { customerId: true },
      }),
      // ENTRADAS no cardápio — the conversion DENOMINATOR ("quantas pessoas
      //   entraram"). Every MenuEvent = one cardápio entry: the mandatory phone
      //   screen means an entry is effectively a login with the number. Counts
      //   ALL rows (not just customerId-tagged ones) so historical periods — where
      //   entries were logged anonymously by the old open-beacon — show the real
      //   volume, not ~0. Going forward the row is written server-side at identify.
      prisma.menuEvent.count({
        where: { restaurantId: ctx.restaurantId, createdAt: { gte: rangeStart, lte: rangeEnd } },
      }),
      prisma.menuEvent.count({
        where: { restaurantId: ctx.restaurantId, createdAt: { gte: prevStart, lt: prevFetchEnd } },
      }),
      // De onde vem o faturamento (atribuição por origem) — mesma janela do período
      getRevenueSources(ctx.restaurantId, rangeStart, rangeEnd),
    ]);

    const CHANNEL_GROUPS: Array<{ key: string; channels: string[] }> = [
      { key: "whatsapp",  channels: ["WHATSAPP"] },
      { key: "cardapio",  channels: ["WEB_AGENT"] },
      { key: "qr",        channels: ["QR_AGENT"] },
      { key: "instagram", channels: ["INSTAGRAM_DIRECT", "INSTAGRAM_COMMENT"] },
    ];
    const channelFunnel = (rows: Array<{ channel: string; customerId: string | null }>, buyers: Set<string>) =>
      CHANNEL_GROUPS.map((g) => {
        const identified = new Set(rows.filter((r) => r.customerId && g.channels.includes(r.channel)).map((r) => r.customerId as string));
        let converted = 0;
        for (const id of identified) if (buyers.has(id)) converted++;
        return { key: g.key, identified: identified.size, converted };
      });
    const buyersNow    = new Set(orderCustNow.filter((o) => o.customerId).map((o) => o.customerId as string));
    const buyersPrev   = new Set(orderCustPrev.filter((o) => o.customerId).map((o) => o.customerId as string));
    const funnelNow    = channelFunnel(convRowsNow, buyersNow);
    const funnelPrev   = channelFunnel(convRowsPrev, buyersPrev);
    const conversionByChannel = funnelNow.map((n, i) => {
      const p = funnelPrev[i]!;
      return {
        key:        n.key,
        identified: n.identified,
        converted:  n.converted,
        rate:       n.identified > 0 ? Math.round((n.converted / n.identified) * 100) : null,
        ratePrev:   p.identified > 0 ? Math.round((p.converted / p.identified) * 100) : null,
      };
    });

    // ── Period KPIs ────────────────────────────────────────────────────────────
    const revenuePeriod = periodOrders.reduce((s, o) => s + Number(o.total), 0);
    const ordersPeriod  = periodOrders.length;
    const avgTicket     = ordersPeriod > 0 ? revenuePeriod / ordersPeriod : 0;

    // ── Previous period comparison — the COMPLETE previous period total, so the
    //    KPI squares show "what last week actually did" (the target to beat),
    //    not only up to the current time. prevOrders already spans the full
    //    bucket window (prevFetchEnd). The CHART keeps its hour-by-hour series.
    const revenuePrev   = prevOrders.reduce((s, o) => s + Number(o.total), 0);
    const ordersPrev    = prevOrders.length;
    const avgTicketPrev = ordersPrev > 0 ? revenuePrev / ordersPrev : 0;

    // ── Conversion rate — the REAL one, per the definition:
    //    clientes que COMPRARAM ÷ pessoas que ENTRARAM no cardápio.
    //    Numerator = distinct customers with a finalized sale (buyers).
    //    Denominator = cardápio entries (MenuEvent), clamped to ≥ buyers so a
    //    day whose entries were under-logged can never read >100%.
    const buyersNowN = buyersNow.size;
    const buyersPrevN = buyersPrev.size;
    const entriesNow  = Math.max(menuEntriesNow,  buyersNowN);
    const entriesPrev = Math.max(menuEntriesPrev, buyersPrevN);
    const conversionRate     = entriesNow  > 0 ? Math.round((buyersNowN  / entriesNow)  * 100) : null;
    const conversionRatePrev = entriesPrev > 0 ? Math.round((buyersPrevN / entriesPrev) * 100) : null;

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
    // numBuckets / granularity computed above (drives prevFetchEnd too).
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
      avgTicketPrev:   Math.round(avgTicketPrev   * 100) / 100,
      newCustomersPrev,

      // Conversion KPI (identified entrant → finalized sale)
      conversionRate,
      conversionRatePrev,
      conversionIdentified: entriesNow,  // pessoas que entraram no cardápio
      conversionConverted:  buyersNowN,  // clientes que compraram
      conversionByChannel,

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

      // Period: revenue attribution — de onde vem o faturamento
      // (crm × indicações × clientes novos × orgânico), soma = revenuePeriod
      revenueSources,

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
