/**
 * AnalyticsService — all restaurant performance queries.
 *
 * Every query is scoped by restaurantId and a date window.
 * Effective order date = COALESCE("importedAt", "createdAt") so imported
 * historical orders are bucketed by their real date, not the import date.
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
  name:      string;
  category:  string;   // "Sem categoria" when categoryName is null
  revenue:   number;
  qty:       number;
  orderCount: number;
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

export interface ImportedCustomerRow {
  id:                  string;
  name:                string;
  phone:               string;
  tier:                string;
  segment:             string;
  importedTotalSpent:  number;
  importedOrderCount:  number;
  importedLastOrderAt: string | null; // YYYY-MM-DD
  averageTicket:       number;
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

// Imported aggregate baseline — from ProductSalesAggregate (Saipos/Nemo import).
// Only present when there is imported data. Never mixed with real Foocci orders.
export interface ImportedAggregateRow {
  name:        string;
  category:    string;
  revenue:     number;
  qty:         number;
  rowType:     string; // "PRODUCT" | "CATEGORY"
}

export interface ImportedBaseline {
  periodStart:           string; // ISO date
  periodEnd:             string; // ISO date
  totalRevenue:          number;
  totalQuantity:         number;
  topCategories:         ImportedAggregateRow[];
  topProducts:           ImportedAggregateRow[];
  rowCount:              number;
  semClassificacaoCount: number; // rows without a standard category classification
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
  importedBaseline:         ImportedBaseline | null;
  importedTopCustomers:     ImportedCustomerRow[]; // top 20 by importedTotalSpent
  importedTopByOrders:      ImportedCustomerRow[]; // top 20 by importedOrderCount
  importedSemTelefoneCount: number;               // customers with importedTotalSpent>0 but no phone
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
      importedBaseline,
      importedTopCustomers,
      importedTopByOrders,
      importedSemTelefoneCount,
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
      this.getImportedBaseline(restaurantId),
      this.getImportedTopCustomers(restaurantId),
      this.getImportedTopByOrders(restaurantId),
      this.getImportedSemTelefoneCount(restaurantId),
    ]);

    const insights = this.buildInsights({ kpi, topProducts, categories, attachRates, channels });

    return { range, kpi, salesByDay, topProducts, categories, attachRates, topCustomers, segments, tiers, channels, insights, importedBaseline, importedTopCustomers, importedTopByOrders, importedSemTelefoneCount };
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
          AND COALESCE("importedAt", "createdAt") >= ${from}
          AND COALESCE("importedAt", "createdAt") <  ${to}
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
        TO_CHAR(COALESCE("importedAt", "createdAt") AT TIME ZONE 'America/Sao_Paulo', 'YYYY-MM-DD') AS day,
        COALESCE(SUM(total), 0)::text AS revenue,
        COUNT(*)                       AS cnt
      FROM orders
      WHERE "restaurantId" = ${restaurantId}
        AND status IN ('CONFIRMED','PREPARING','READY','OUT_FOR_DELIVERY','DELIVERED')
        AND COALESCE("importedAt", "createdAt") >= ${from}
        AND COALESCE("importedAt", "createdAt") <  ${to}
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
    limit = 20,
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
        AND COALESCE(o."importedAt", o."createdAt") >= ${from}
        AND COALESCE(o."importedAt", o."createdAt") <  ${to}
      GROUP BY oi.name, oi."categoryName"
      ORDER BY SUM(oi.total) DESC NULLS LAST
      LIMIT ${limit}
    `;

    return rows.map((r) => ({
      name:       r.name,
      category:   r.category?.trim() || "Sem categoria",
      revenue:    toNum(r.revenue),
      qty:        toNum(r.qty),
      orderCount: toNum(r.order_count),
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
        AND COALESCE(o."importedAt", o."createdAt") >= ${from}
        AND COALESCE(o."importedAt", o."createdAt") <  ${to}
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
        AND COALESCE("importedAt", "createdAt") >= ${from}
        AND COALESCE("importedAt", "createdAt") <  ${to}
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
          AND COALESCE(o."importedAt", o."createdAt") >= ${from}
          AND COALESCE(o."importedAt", o."createdAt") <  ${to}
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
        AND COALESCE(o."importedAt", o."createdAt") >= ${from}
        AND COALESCE(o."importedAt", o."createdAt") <  ${to}
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
        AND COALESCE("importedAt", "createdAt") >= ${from}
        AND COALESCE("importedAt", "createdAt") <  ${to}
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

  // ── Imported top customers (by importedTotalSpent) ────────────────────────

  private static async getImportedTopCustomers(
    restaurantId: string,
    limit = 20,
  ): Promise<ImportedCustomerRow[]> {
    const rows = await prisma.$queryRaw<Array<{
      id:          string;
      name:        string;
      phone:       string;
      tier:        string;
      segment:     string;
      total_spent: string;
      order_count: RawBigint;
      last_order:  Date | null;
      avg_ticket:  string;
    }>>`
      SELECT
        id,
        name,
        COALESCE(phone, '')                      AS phone,
        COALESCE(tier, 'BRONZE')                 AS tier,
        COALESCE(segment, 'SEM_PEDIDOS')         AS segment,
        COALESCE("importedTotalSpent", 0)::text  AS total_spent,
        COALESCE("importedOrderCount", 0)        AS order_count,
        "importedLastOrderAt"                    AS last_order,
        COALESCE("averageTicket", 0)::text       AS avg_ticket
      FROM customers
      WHERE "restaurantId" = ${restaurantId}
        AND "isGuest" = false
        AND "importedTotalSpent" > 0
      ORDER BY "importedTotalSpent" DESC NULLS LAST
      LIMIT ${limit}
    `;

    return rows.map((r) => ({
      id:                  r.id,
      name:                r.name,
      phone:               r.phone,
      tier:                r.tier,
      segment:             r.segment,
      importedTotalSpent:  toNum(r.total_spent),
      importedOrderCount:  toNum(r.order_count),
      importedLastOrderAt: r.last_order ? r.last_order.toISOString().slice(0, 10) : null,
      averageTicket:       toNum(r.avg_ticket),
    }));
  }

  // ── Imported customers sorted by order count ──────────────────────────────

  private static async getImportedTopByOrders(
    restaurantId: string,
    limit = 20,
  ): Promise<ImportedCustomerRow[]> {
    const rows = await prisma.$queryRaw<Array<{
      id:          string;
      name:        string;
      phone:       string;
      tier:        string;
      segment:     string;
      total_spent: string;
      order_count: RawBigint;
      last_order:  Date | null;
      avg_ticket:  string;
    }>>`
      SELECT
        id,
        name,
        COALESCE(phone, '')                      AS phone,
        COALESCE(tier, 'BRONZE')                 AS tier,
        COALESCE(segment, 'SEM_PEDIDOS')         AS segment,
        COALESCE("importedTotalSpent", 0)::text  AS total_spent,
        COALESCE("importedOrderCount", 0)        AS order_count,
        "importedLastOrderAt"                    AS last_order,
        COALESCE("averageTicket", 0)::text       AS avg_ticket
      FROM customers
      WHERE "restaurantId" = ${restaurantId}
        AND "isGuest" = false
        AND "importedOrderCount" > 0
      ORDER BY "importedOrderCount" DESC NULLS LAST
      LIMIT ${limit}
    `;

    return rows.map((r) => ({
      id:                  r.id,
      name:                r.name,
      phone:               r.phone,
      tier:                r.tier,
      segment:             r.segment,
      importedTotalSpent:  toNum(r.total_spent),
      importedOrderCount:  toNum(r.order_count),
      importedLastOrderAt: r.last_order ? r.last_order.toISOString().slice(0, 10) : null,
      averageTicket:       toNum(r.avg_ticket),
    }));
  }

  // ── Count of imported customers missing a phone number ─────────────────────

  private static async getImportedSemTelefoneCount(
    restaurantId: string,
  ): Promise<number> {
    const rows = await prisma.$queryRaw<Array<{ cnt: RawBigint }>>`
      SELECT COUNT(*) AS cnt
      FROM customers
      WHERE "restaurantId" = ${restaurantId}
        AND "isGuest" = false
        AND "importedTotalSpent" > 0
        AND (phone IS NULL OR phone = '')
    `;
    return toNum(rows[0]?.cnt ?? 0);
  }

  // ── Imported aggregate baseline ────────────────────────────────────────────
  // Reads ProductSalesAggregate (Saipos/Nemo import). Never mixed with real orders.

  static async getImportedBaseline(restaurantId: string): Promise<ImportedBaseline | null> {
    const rows = await prisma.$queryRaw<Array<{
      category_name: string;
      product_name:  string | null;
      row_type:      string | null;
      qty:           string;
      revenue:       string;
      period_start:  Date;
      period_end:    Date;
    }>>`
      SELECT
        "categoryName"  AS category_name,
        "productName"   AS product_name,
        "rowType"       AS row_type,
        COALESCE("quantitySold", 0)::text AS qty,
        COALESCE("grossRevenue", 0)::text AS revenue,
        "periodStart"   AS period_start,
        "periodEnd"     AS period_end
      FROM product_sales_aggregates
      WHERE "restaurantId" = ${restaurantId}
      ORDER BY COALESCE("grossRevenue", 0) DESC
    `;

    if (rows.length === 0) return null;

    const periodStart = rows.reduce(
      (min, r) => r.period_start < min ? r.period_start : min,
      rows[0]!.period_start,
    );
    const periodEnd = rows.reduce(
      (max, r) => r.period_end > max ? r.period_end : max,
      rows[0]!.period_end,
    );

    // Use product_name presence to distinguish product rows from category summary rows.
    // row_type may be null or in different capitalisation/language depending on the import source,
    // so we do NOT rely on it for the primary split.
    const productRows  = rows.filter(r => r.product_name !== null && r.product_name.trim() !== "");
    const categoryRows = rows.filter(r => !r.product_name || r.product_name.trim() === "");

    // Use category-level rows for revenue/qty totals — they represent per-category aggregates
    // and avoid double-counting (categories already sum their product lines).
    // Fall back to product rows if the import has no category-level rows.
    const summaryRows   = categoryRows.length > 0 ? categoryRows : productRows;
    const totalRevenue  = summaryRows.reduce((s, r) => s + toNum(r.revenue), 0);
    const totalQuantity = summaryRows.reduce((s, r) => s + toNum(r.qty), 0);

    const semClassificacaoCount = rows.filter(r => {
      const rt  = (r.row_type ?? "").toUpperCase();
      const cat = (r.category_name ?? "").toLowerCase();
      return rt.includes("SEM") || rt.includes("CLASSIF") ||
             cat.includes("sem classif") || cat.includes("sem categoria");
    }).length;

    const topProducts: ImportedAggregateRow[] = productRows.slice(0, 150).map(r => ({
      name:     r.product_name!,
      category: r.category_name,
      revenue:  toNum(r.revenue),
      qty:      toNum(r.qty),
      rowType:  r.row_type ?? "PRODUCT",
    }));

    const topCategories: ImportedAggregateRow[] = categoryRows.slice(0, 30).map(r => ({
      name:     r.category_name,
      category: r.category_name,
      revenue:  toNum(r.revenue),
      qty:      toNum(r.qty),
      rowType:  r.row_type ?? "CATEGORY",
    }));

    return {
      periodStart:           periodStart.toISOString(),
      periodEnd:             periodEnd.toISOString(),
      totalRevenue,
      totalQuantity,
      topCategories,
      topProducts,
      rowCount:              rows.length,
      semClassificacaoCount,
    };
  }
}
