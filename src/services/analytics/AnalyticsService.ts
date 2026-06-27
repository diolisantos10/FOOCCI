/**
 * AnalyticsService — all restaurant performance queries.
 *
 * Every query is scoped by restaurantId and a date window and reflects ONLY
 * real Foocci sales: imported historical orders (Order.importedAt IS NOT NULL,
 * source = "import") are excluded from every aggregate. The imported data stays
 * in the database and remains visible per-customer (customer profile), but it no
 * longer contributes to restaurant-level analytics or any historical baseline.
 */

import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";

// ─── Public types ─────────────────────────────────────────────────────────────

export interface DateRange {
  from: Date;
  to:   Date;
}

export interface KpiOverview {
  revenue:               number;
  orders:                number;
  avgTicket:             number;
  newCustomers:          number;
  cancelledOrders:       number;
  cancellationRate:      number; // %
  awaitingPaymentCount:  number;
  awaitingPaymentTotal:  number;
}

export interface DailyPoint {
  date:    string; // YYYY-MM-DD
  revenue: number;
  orders:  number;
}

export interface ProductRow {
  name:       string;
  category:   string;   // "Sem categoria" when categoryName is null
  revenue:    number;
  qty:        number;
  orderCount: number;
  share:      number;   // % of total product revenue in this period
}

export interface ZeroSalesProduct {
  id:          string;
  name:        string;
  category:    string;
  price:       number;
  isAvailable: boolean; // false = esgotado (sold out)
}

export interface CategoryRow {
  name:    string;
  revenue: number;
  qty:     number;
  orders:  number;
  share:   number; // % of total revenue
}

export interface AttachRate {
  label:      string;
  keywords:   string[];
  withCount:  number; // orders that contain at least one matching item
  total:      number;
  rate:       number; // %
  addedRevenue: number;
}

export interface TopCustomer {
  id:         string;
  name:       string;
  phone:      string;
  totalSpend: number;
  totalOrders: number;
  tier:       string;
  segment:    string;
}

export interface SegmentCount {
  segment: string;
  count:   number;
  share:   number;
}

export interface TierCount {
  tier:  string;
  count: number;
  share: number;
}

export interface ChannelRow {
  source:  string;
  orders:  number;
  revenue: number;
  share:   number; // % of total orders
}

export interface Insight {
  type:    "warning" | "success" | "info";
  message: string;
}

export interface UpsellRevenue {
  revenue:           number; // sum of upsell item totals in completed orders
  revenueShare:      number; // upsell revenue as % of total revenue (0–100)
  ordersWithUpsell:  number; // distinct orders with at least one upsell item
  avgPerOrder:       number; // average upsell revenue per order-with-upsell
}

// Social proof: concrete examples of the menu converting — items a customer added
// AFTER a Foocci suggestion (OrderItem.isUpsell), in real Foocci orders.
export interface UpsellExample {
  orderId:      string;
  date:         string;        // ISO
  customerName: string | null;
  itemName:     string;
  quantity:     number;
  value:        number;        // item total added
}

export interface AnalyticsOverview {
  range:                    DateRange;
  kpi:                      KpiOverview;
  salesByDay:               DailyPoint[];
  topProducts:              ProductRow[];
  categories:               CategoryRow[];
  attachRates:              AttachRate[];
  topCustomers:             TopCustomer[];
  segments:                 SegmentCount[];
  tiers:                    TierCount[];
  channels:                 ChannelRow[];
  insights:                 Insight[];
  zeroSalesProducts:        ZeroSalesProduct[];   // active menu items with no sales in the period
  upsellRevenue:            UpsellRevenue;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

type RawBigint = bigint | number;

function toNum(v: RawBigint | string | null | undefined): number {
  if (v == null) return 0;
  if (typeof v === "bigint") return Number(v);
  return Number(v);
}

const COMPLETED_STATUSES = ["CONFIRMED", "PREPARING", "READY", "OUT_FOR_DELIVERY", "DELIVERED"];

// ─── Main service ─────────────────────────────────────────────────────────────

export class AnalyticsService {
  static async getOverview(
    restaurantId: string,
    range: DateRange,
  ): Promise<AnalyticsOverview> {
    const { from, to } = range;

    const [
      kpi,
      salesByDay,
      topProducts,
      categories,
      attachRates,
      topCustomers,
      segments,
      tiers,
      channels,
      zeroSalesProducts,
      upsellRevenue,
    ] = await Promise.all([
      this.getKpis(restaurantId, from, to),
      this.getSalesByDay(restaurantId, from, to),
      this.getTopProducts(restaurantId, from, to),
      this.getCategories(restaurantId, from, to),
      this.getAttachRates(restaurantId, from, to),
      this.getTopCustomers(restaurantId, from, to),
      this.getSegments(restaurantId),
      this.getTiers(restaurantId),
      this.getChannels(restaurantId, from, to),
      this.getZeroSalesProducts(restaurantId, from, to),
      this.getUpsellRevenue(restaurantId, from, to),
    ]);

    const insights = this.buildInsights({ kpi, topProducts, categories, attachRates, channels });

    return { range, kpi, salesByDay, topProducts, categories, attachRates, topCustomers, segments, tiers, channels, insights, zeroSalesProducts, upsellRevenue };
  }

  // ── KPIs ───────────────────────────────────────────────────────────────────

  private static async getKpis(
    restaurantId: string,
    from: Date,
    to: Date,
  ): Promise<KpiOverview> {
    const [orderRows, newCustomers] = await Promise.all([
      prisma.$queryRaw<Array<{
        total_revenue:          string;
        order_count:            RawBigint;
        cancelled:              RawBigint;
        awaiting_payment_count: RawBigint;
        awaiting_payment_total: string;
      }>>`
        SELECT
          COALESCE(SUM(CASE WHEN status IN ('CONFIRMED','PREPARING','READY','OUT_FOR_DELIVERY','DELIVERED') THEN total ELSE 0 END), 0)::text AS total_revenue,
          COUNT(*) FILTER (WHERE status IN ('CONFIRMED','PREPARING','READY','OUT_FOR_DELIVERY','DELIVERED'))                                 AS order_count,
          COUNT(*) FILTER (WHERE status  = 'CANCELLED')                                                                                      AS cancelled,
          COUNT(*) FILTER (WHERE status  = 'AWAITING_PAYMENT')                                                                               AS awaiting_payment_count,
          COALESCE(SUM(CASE WHEN status = 'AWAITING_PAYMENT' THEN total ELSE 0 END), 0)::text                                                AS awaiting_payment_total
        FROM orders
        WHERE "restaurantId" = ${restaurantId}
          AND "importedAt" IS NULL
          AND "createdAt" >= ${from}
          AND "createdAt" <  ${to}
      `,
      prisma.$queryRaw<Array<{ cnt: RawBigint }>>`
        SELECT COUNT(*) AS cnt
        FROM customers
        WHERE "restaurantId" = ${restaurantId}
          AND "createdAt" >= ${from}
          AND "createdAt" <  ${to}
          AND "isGuest" = false
      `,
    ]);

    const row       = orderRows[0]!;
    const revenue   = toNum(row.total_revenue as unknown as string);
    const orders    = toNum(row.order_count);
    const cancelled = toNum(row.cancelled);
    const newCust   = toNum(newCustomers[0]?.cnt);
    const total     = orders + cancelled;

    return {
      revenue,
      orders,
      avgTicket:            orders > 0 ? revenue / orders : 0,
      newCustomers:         newCust,
      cancelledOrders:      cancelled,
      cancellationRate:     total > 0 ? (cancelled / total) * 100 : 0,
      awaitingPaymentCount: toNum(row.awaiting_payment_count),
      awaitingPaymentTotal: toNum(row.awaiting_payment_total as unknown as string),
    };
  }

  // ── Sales by day ───────────────────────────────────────────────────────────

  private static async getSalesByDay(
    restaurantId: string,
    from: Date,
    to: Date,
  ): Promise<DailyPoint[]> {
    const rows = await prisma.$queryRaw<Array<{
      day:     string;
      revenue: string;
      cnt:     RawBigint;
    }>>`
      SELECT
        TO_CHAR("createdAt" AT TIME ZONE 'America/Sao_Paulo', 'YYYY-MM-DD') AS day,
        COALESCE(SUM(total), 0)::text AS revenue,
        COUNT(*)                       AS cnt
      FROM orders
      WHERE "restaurantId" = ${restaurantId}
        AND "importedAt" IS NULL
        AND status IN ('CONFIRMED','PREPARING','READY','OUT_FOR_DELIVERY','DELIVERED')
        AND "createdAt" >= ${from}
        AND "createdAt" <  ${to}
      GROUP BY 1
      ORDER BY 1
    `;

    return rows.map((r) => ({
      date:    r.day,
      revenue: toNum(r.revenue),
      orders:  toNum(r.cnt),
    }));
  }

  // ── Top products ───────────────────────────────────────────────────────────

  private static async getTopProducts(
    restaurantId: string,
    from: Date,
    to: Date,
    limit = 50,
  ): Promise<ProductRow[]> {
    const rows = await prisma.$queryRaw<Array<{
      name:         string;
      category:     string | null;
      revenue:      string;
      qty:          RawBigint;
      order_count:  RawBigint;
    }>>`
      SELECT
        oi.name,
        oi."categoryName"            AS category,
        COALESCE(SUM(oi.total), 0)::text AS revenue,
        COALESCE(SUM(oi.quantity), 0)    AS qty,
        COUNT(DISTINCT oi."orderId")     AS order_count
      FROM order_items oi
      JOIN orders o ON o.id = oi."orderId"
      WHERE o."restaurantId" = ${restaurantId}
        AND o.status IN ('CONFIRMED','PREPARING','READY','OUT_FOR_DELIVERY','DELIVERED')
        AND o."importedAt" IS NULL
        AND o."createdAt" >= ${from}
        AND o."createdAt" <  ${to}
      GROUP BY oi.name, oi."categoryName"
      ORDER BY SUM(oi.total) DESC NULLS LAST
      LIMIT ${limit}
    `;

    const totalRevenue = rows.reduce((s, r) => s + toNum(r.revenue), 0);

    return rows.map((r) => ({
      name:       r.name,
      category:   r.category?.trim() || "Sem categoria",
      revenue:    toNum(r.revenue),
      qty:        toNum(r.qty),
      orderCount: toNum(r.order_count),
      share:      totalRevenue > 0 ? (toNum(r.revenue) / totalRevenue) * 100 : 0,
    }));
  }

  // ── Categories ─────────────────────────────────────────────────────────────

  private static async getCategories(
    restaurantId: string,
    from: Date,
    to: Date,
  ): Promise<CategoryRow[]> {
    const rows = await prisma.$queryRaw<Array<{
      name:    string;
      revenue: string;
      qty:     RawBigint;
      orders:  RawBigint;
    }>>`
      SELECT
        COALESCE(oi."categoryName", 'Sem categoria') AS name,
        COALESCE(SUM(oi.total), 0)::text              AS revenue,
        COALESCE(SUM(oi.quantity), 0)                 AS qty,
        COUNT(DISTINCT oi."orderId")                  AS orders
      FROM order_items oi
      JOIN orders o ON o.id = oi."orderId"
      WHERE o."restaurantId" = ${restaurantId}
        AND o.status IN ('CONFIRMED','PREPARING','READY','OUT_FOR_DELIVERY','DELIVERED')
        AND o."importedAt" IS NULL
        AND o."createdAt" >= ${from}
        AND o."createdAt" <  ${to}
      GROUP BY 1
      ORDER BY SUM(oi.total) DESC NULLS LAST
    `;

    const totalRevenue = rows.reduce((s, r) => s + toNum(r.revenue), 0);

    return rows.map((r) => ({
      name:    r.name,
      revenue: toNum(r.revenue),
      qty:     toNum(r.qty),
      orders:  toNum(r.orders),
      share:   totalRevenue > 0 ? (toNum(r.revenue) / totalRevenue) * 100 : 0,
    }));
  }

  // ── Attach rates ───────────────────────────────────────────────────────────
  // "Attach rate" = % of non-cancelled orders that include at least one item
  //  whose category name matches any keyword (case-insensitive).

  private static async getAttachRates(
    restaurantId: string,
    from: Date,
    to: Date,
  ): Promise<AttachRate[]> {
    const definitions = [
      { label: "Bebidas",   keywords: ["bebida", "drink", "suco", "agua", "refrigerante", "cerveja", "vinho", "limonada", "soda"] },
      { label: "Sobremesas", keywords: ["sobremesa", "dessert", "doce", "sorvete", "mousse", "pudim", "brownie", "bolo"] },
    ];

    const totalRow = await prisma.$queryRaw<Array<{ cnt: RawBigint }>>`
      SELECT COUNT(*) AS cnt
      FROM orders
      WHERE "restaurantId" = ${restaurantId}
        AND status IN ('CONFIRMED','PREPARING','READY','OUT_FOR_DELIVERY','DELIVERED')
        AND "importedAt" IS NULL
        AND "createdAt" >= ${from}
        AND "createdAt" <  ${to}
    `;
    const total = toNum(totalRow[0]?.cnt ?? 0);
    if (total === 0) {
      return definitions.map((d) => ({ ...d, withCount: 0, total: 0, rate: 0, addedRevenue: 0 }));
    }

    const results: AttachRate[] = [];

    for (const def of definitions) {
      const likeConditions = def.keywords.map(
        (k) => Prisma.sql`LOWER(COALESCE(oi."categoryName",'')) LIKE ${`%${k}%`}`
      );
      const whereClause = Prisma.join(likeConditions, " OR ");

      const rows = await prisma.$queryRaw<Array<{ order_count: RawBigint; revenue: string }>>`
        SELECT
          COUNT(DISTINCT oi."orderId") AS order_count,
          COALESCE(SUM(oi.total), 0)::text AS revenue
        FROM order_items oi
        JOIN orders o ON o.id = oi."orderId"
        WHERE o."restaurantId" = ${restaurantId}
          AND o.status IN ('CONFIRMED','PREPARING','READY','OUT_FOR_DELIVERY','DELIVERED')
          AND o."importedAt" IS NULL
          AND o."createdAt" >= ${from}
          AND o."createdAt" <  ${to}
          AND (${whereClause})
      `;

      const withCount    = toNum(rows[0]?.order_count ?? 0);
      const addedRevenue = toNum(rows[0]?.revenue ?? "0");

      results.push({
        ...def,
        withCount,
        total,
        rate:         total > 0 ? (withCount / total) * 100 : 0,
        addedRevenue,
      });
    }

    return results;
  }

  // ── Top customers ──────────────────────────────────────────────────────────

  private static async getTopCustomers(
    restaurantId: string,
    from: Date,
    to: Date,
    limit = 10,
  ): Promise<TopCustomer[]> {
    const rows = await prisma.$queryRaw<Array<{
      id:          string;
      name:        string;
      phone:       string;
      tier:        string;
      segment:     string;
      total_spend: string;
      order_count: RawBigint;
    }>>`
      SELECT
        c.id,
        c.name,
        c.phone,
        c.tier,
        c.segment,
        COALESCE(SUM(o.total), 0)::text AS total_spend,
        COUNT(o.id)                      AS order_count
      FROM customers c
      JOIN orders o ON o."customerId" = c.id
      WHERE c."restaurantId" = ${restaurantId}
        AND c."isGuest" = false
        AND o.status IN ('CONFIRMED','PREPARING','READY','OUT_FOR_DELIVERY','DELIVERED')
        AND o."importedAt" IS NULL
        AND o."createdAt" >= ${from}
        AND o."createdAt" <  ${to}
      GROUP BY c.id, c.name, c.phone, c.tier, c.segment
      ORDER BY SUM(o.total) DESC NULLS LAST
      LIMIT ${limit}
    `;

    return rows.map((r) => ({
      id:          r.id,
      name:        r.name,
      phone:       r.phone,
      tier:        r.tier,
      segment:     r.segment,
      totalSpend:  toNum(r.total_spend),
      totalOrders: toNum(r.order_count),
    }));
  }

  // ── Segments (whole restaurant — not date-filtered) ────────────────────────

  private static async getSegments(restaurantId: string): Promise<SegmentCount[]> {
    const rows = await prisma.$queryRaw<Array<{ segment: string; cnt: RawBigint }>>`
      SELECT segment, COUNT(*) AS cnt
      FROM customers
      WHERE "restaurantId" = ${restaurantId}
        AND "isGuest" = false
      GROUP BY segment
    `;

    const total = rows.reduce((s, r) => s + toNum(r.cnt), 0);
    const ORDER = ["QUENTE", "MORNO", "FRIO", "SEM_PEDIDOS"];

    return ORDER.map((seg) => {
      const found = rows.find((r) => r.segment === seg);
      const count = found ? toNum(found.cnt) : 0;
      return { segment: seg, count, share: total > 0 ? (count / total) * 100 : 0 };
    });
  }

  // ── Tiers ──────────────────────────────────────────────────────────────────

  private static async getTiers(restaurantId: string): Promise<TierCount[]> {
    const rows = await prisma.$queryRaw<Array<{ tier: string; cnt: RawBigint }>>`
      SELECT tier, COUNT(*) AS cnt
      FROM customers
      WHERE "restaurantId" = ${restaurantId}
        AND "isGuest" = false
      GROUP BY tier
    `;

    const total = rows.reduce((s, r) => s + toNum(r.cnt), 0);
    const ORDER = ["DIAMANTE", "OURO", "PRATA", "BRONZE"];

    return ORDER.map((tier) => {
      const found = rows.find((r) => r.tier === tier);
      const count = found ? toNum(found.cnt) : 0;
      return { tier, count, share: total > 0 ? (count / total) * 100 : 0 };
    });
  }

  // ── Channels ───────────────────────────────────────────────────────────────

  private static async getChannels(
    restaurantId: string,
    from: Date,
    to: Date,
  ): Promise<ChannelRow[]> {
    const rows = await prisma.$queryRaw<Array<{
      source:  string | null;
      orders:  RawBigint;
      revenue: string;
    }>>`
      SELECT
        COALESCE(source, 'direto')       AS source,
        COUNT(*)                          AS orders,
        COALESCE(SUM(total), 0)::text     AS revenue
      FROM orders
      WHERE "restaurantId" = ${restaurantId}
        AND status IN ('CONFIRMED','PREPARING','READY','OUT_FOR_DELIVERY','DELIVERED')
        AND "importedAt" IS NULL
        AND "createdAt" >= ${from}
        AND "createdAt" <  ${to}
      GROUP BY 1
      ORDER BY COUNT(*) DESC
    `;

    const totalOrders = rows.reduce((s, r) => s + toNum(r.orders), 0);

    return rows.map((r) => ({
      source:  r.source ?? "direto",
      orders:  toNum(r.orders),
      revenue: toNum(r.revenue),
      share:   totalOrders > 0 ? (toNum(r.orders) / totalOrders) * 100 : 0,
    }));
  }

  // ── Insights ───────────────────────────────────────────────────────────────

  private static buildInsights(data: {
    kpi:         KpiOverview;
    topProducts: ProductRow[];
    categories:  CategoryRow[];
    attachRates: AttachRate[];
    channels:    ChannelRow[];
  }): Insight[] {
    const insights: Insight[] = [];
    const { kpi, topProducts, categories, attachRates, channels } = data;

    if (kpi.cancellationRate > 10) {
      insights.push({
        type:    "warning",
        message: `Taxa de cancelamento alta: ${kpi.cancellationRate.toFixed(1)}% dos pedidos foram cancelados no período.`,
      });
    }

    const drinkRate = attachRates.find((a) => a.label === "Bebidas");
    if (drinkRate && drinkRate.total > 0 && drinkRate.rate < 30) {
      insights.push({
        type:    "warning",
        message: `Baixa taxa de bebidas: apenas ${drinkRate.rate.toFixed(0)}% dos pedidos incluem bebida. Considere um combo ou destaque no cardápio.`,
      });
    }

    const dessertRate = attachRates.find((a) => a.label === "Sobremesas");
    if (dessertRate && dessertRate.total > 0 && dessertRate.rate < 15) {
      insights.push({
        type:    "info",
        message: `Sobremesas vendidas em apenas ${dessertRate.rate.toFixed(0)}% dos pedidos. Uma oferta pós-venda (WhatsApp) pode ajudar.`,
      });
    }

    if (topProducts.length > 0) {
      const top = topProducts[0]!;
      const second = topProducts[1];
      if (second && top.revenue > second.revenue * 3) {
        insights.push({
          type:    "info",
          message: `"${top.name}" representa a maior parte da receita. Diversificar destaques pode reduzir dependência de um único item.`,
        });
      }
    }

    const importChannel = channels.find((c) => c.source === "import");
    const hasRealOrders = channels.some((c) => c.source !== "import" && c.orders > 0);
    if (importChannel && !hasRealOrders && kpi.orders > 0) {
      insights.push({
        type:    "info",
        message: "Todos os pedidos do período são históricos (importados). Configure seus canais de venda para monitorar pedidos em tempo real.",
      });
    }

    if (kpi.orders > 0 && kpi.newCustomers === 0) {
      insights.push({
        type:    "warning",
        message: "Nenhum cliente novo no período. Avalie campanhas de aquisição nos seus canais.",
      });
    }

    if (kpi.orders > 0 && kpi.cancellationRate < 3 && drinkRate && drinkRate.rate >= 40) {
      insights.push({
        type:    "success",
        message: `Ótimo período! Baixa taxa de cancelamento (${kpi.cancellationRate.toFixed(1)}%) e boa aderência de bebidas (${drinkRate.rate.toFixed(0)}%).`,
      });
    }

    return insights;
  }

  // ── Zero-sales products ────────────────────────────────────────────────────
  // Active menu items that had no confirmed order_items in the given date range.
  // Uses a CTE to collect sold menuItemIds, then LEFT JOIN to find the gap.

  private static async getUpsellRevenue(
    restaurantId: string,
    from: Date,
    to: Date,
  ): Promise<UpsellRevenue> {
    const rows = await prisma.$queryRaw<Array<{
      upsell_revenue:   string;
      orders_with_upsell: RawBigint;
      total_revenue:    string;
    }>>`
      SELECT
        COALESCE(SUM(oi.total) FILTER (WHERE oi."isUpsell" = true), 0)::text  AS upsell_revenue,
        COUNT(DISTINCT o.id) FILTER (WHERE oi."isUpsell" = true)              AS orders_with_upsell,
        COALESCE(SUM(oi.total), 0)::text                                      AS total_revenue
      FROM order_items oi
      JOIN orders o ON o.id = oi."orderId"
      WHERE o."restaurantId" = ${restaurantId}
        AND o.status IN ('CONFIRMED','PREPARING','READY','OUT_FOR_DELIVERY','DELIVERED')
        AND o."importedAt" IS NULL
        AND o."createdAt" >= ${from}
        AND o."createdAt" <  ${to}
    `;

    const row             = rows[0];
    const revenue         = toNum(row?.upsell_revenue);
    const totalRevenue    = toNum(row?.total_revenue);
    const ordersWithUpsell = toNum(row?.orders_with_upsell);
    const revenueShare    = totalRevenue > 0 ? Math.round((revenue / totalRevenue) * 1000) / 10 : 0;
    const avgPerOrder     = ordersWithUpsell > 0 ? Math.round((revenue / ordersWithUpsell) * 100) / 100 : 0;

    return { revenue, revenueShare, ordersWithUpsell, avgPerOrder };
  }

  // Concrete upsell examples (social proof): items added AFTER a Foocci suggestion.
  static async getUpsellExamples(
    restaurantId: string,
    from: Date,
    to: Date,
    limit = 15,
  ): Promise<UpsellExample[]> {
    const rows = await prisma.$queryRaw<Array<{
      order_id:      string;
      created_at:    Date;
      customer_name: string | null;
      item_name:     string;
      quantity:      RawBigint;
      value:         string;
    }>>`
      SELECT
        o.id            AS order_id,
        o."createdAt"   AS created_at,
        c.name          AS customer_name,
        oi.name         AS item_name,
        oi.quantity     AS quantity,
        oi.total::text  AS value
      FROM order_items oi
      JOIN orders o      ON o.id = oi."orderId"
      LEFT JOIN customers c ON c.id = o."customerId"
      WHERE o."restaurantId" = ${restaurantId}
        AND oi."isUpsell" = true
        AND o.status IN ('CONFIRMED','PREPARING','READY','OUT_FOR_DELIVERY','DELIVERED')
        AND o."importedAt" IS NULL
        AND o."createdAt" >= ${from}
        AND o."createdAt" <  ${to}
      ORDER BY o."createdAt" DESC
      LIMIT ${limit}
    `;

    return rows.map((r) => ({
      orderId:      r.order_id,
      date:         r.created_at.toISOString(),
      customerName: r.customer_name,
      itemName:     r.item_name,
      quantity:     toNum(r.quantity),
      value:        toNum(r.value),
    }));
  }

  private static async getZeroSalesProducts(
    restaurantId: string,
    from: Date,
    to: Date,
    limit = 100,
  ): Promise<ZeroSalesProduct[]> {
    const rows = await prisma.$queryRaw<Array<{
      id:           string;
      name:         string;
      category:     string;
      price:        string;
      is_available: boolean;
    }>>`
      WITH sold AS (
        SELECT DISTINCT oi."menuItemId"
        FROM order_items oi
        JOIN orders o ON o.id = oi."orderId"
        WHERE o."restaurantId" = ${restaurantId}
          AND o.status IN ('CONFIRMED','PREPARING','READY','OUT_FOR_DELIVERY','DELIVERED')
          AND o."importedAt" IS NULL
          AND o."createdAt" >= ${from}
          AND o."createdAt" <  ${to}
          AND oi."menuItemId" IS NOT NULL
      )
      SELECT
        mi.id,
        mi.name,
        COALESCE(mc.name, 'Sem categoria') AS category,
        mi.price::text,
        mi."isAvailable"                   AS is_available
      FROM menu_items mi
      JOIN menu_categories mc ON mc.id = mi."categoryId"
      LEFT JOIN sold s ON s."menuItemId" = mi.id
      WHERE mc."restaurantId" = ${restaurantId}
        AND mi."isActive" = true
        AND s."menuItemId" IS NULL
      ORDER BY mc.name, mi.name
      LIMIT ${limit}
    `;

    return rows.map((r) => ({
      id:          r.id,
      name:        r.name,
      category:    r.category,
      price:       toNum(r.price),
      isAvailable: r.is_available,
    }));
  }
}
