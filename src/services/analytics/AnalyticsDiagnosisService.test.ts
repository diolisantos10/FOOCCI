/**
 * AnalyticsDiagnosisService — deterministic diagnosis engine tests (A–J).
 *
 * Pure: no DB, no network, no LLM. Every overview is a hand-built fixture so
 * the diagnosis is fully reproducible. No real analytics query runs here.
 *
 *   A — revenue drop driven by order-count drop
 *   B — revenue drop driven by average-ticket drop
 *   C — average-ticket drop attributed to upsell/attach decline
 *   D — previous top product disappeared (zero sales now)
 *   E — cancellation spike anomaly
 *   F — campaign low conversion with enough sends (and silence below threshold)
 *   G — tiny sample size does NOT raise a CRITICAL trend alert
 *   H — every finding carries evidence + a recommended action
 *   I — no invented causes / no comparison findings when previous period missing
 *   J — engine is pure/stateless (tenant isolation by construction)
 */

import { describe, it, expect } from "vitest";
import {
  AnalyticsDiagnosisService,
  DEFAULT_THRESHOLDS,
  type DiagnosisInput,
  type DiagnosisPeriodMeta,
} from "./AnalyticsDiagnosisService";
import type {
  AnalyticsOverview,
  KpiOverview,
  ProductRow,
  AttachRate,
  ChannelRow,
  UpsellRevenue,
  ZeroSalesProduct,
} from "./AnalyticsService";

// ─── Fixture builders ─────────────────────────────────────────────────────────

function kpi(p: Partial<KpiOverview> = {}): KpiOverview {
  return {
    revenue:              p.revenue              ?? 0,
    orders:               p.orders               ?? 0,
    avgTicket:            p.avgTicket            ?? 0,
    newCustomers:         p.newCustomers         ?? 0,
    cancelledOrders:      p.cancelledOrders      ?? 0,
    cancellationRate:     p.cancellationRate     ?? 0,
    awaitingPaymentCount: p.awaitingPaymentCount ?? 0,
    awaitingPaymentTotal: p.awaitingPaymentTotal ?? 0,
  };
}

function product(name: string, revenue: number, extra: Partial<ProductRow> = {}): ProductRow {
  return {
    name,
    category:   extra.category   ?? "Geral",
    revenue,
    qty:        extra.qty        ?? Math.max(1, Math.round(revenue / 10)),
    orderCount: extra.orderCount ?? Math.max(1, Math.round(revenue / 20)),
    share:      extra.share      ?? 0,
  };
}

function attach(label: string, rate: number, total: number, addedRevenue = 0): AttachRate {
  return { label, keywords: [], withCount: Math.round((rate / 100) * total), total, rate, addedRevenue };
}

function channel(source: string, orders: number, revenue: number): ChannelRow {
  return { source, orders, revenue, share: 0 };
}

function upsell(p: Partial<UpsellRevenue> = {}): UpsellRevenue {
  return {
    revenue:          p.revenue          ?? 0,
    revenueShare:     p.revenueShare     ?? 0,
    ordersWithUpsell: p.ordersWithUpsell ?? 0,
    avgPerOrder:      p.avgPerOrder      ?? 0,
  };
}

function overview(p: {
  kpi?: Partial<KpiOverview>;
  topProducts?: ProductRow[];
  attachRates?: AttachRate[];
  channels?: ChannelRow[];
  upsellRevenue?: Partial<UpsellRevenue>;
  zeroSalesProducts?: ZeroSalesProduct[];
} = {}): AnalyticsOverview {
  return {
    range:                    { from: new Date("2026-05-01"), to: new Date("2026-05-31") },
    kpi:                      kpi(p.kpi),
    salesByDay:               [],
    topProducts:              p.topProducts ?? [],
    categories:               [],
    attachRates:              p.attachRates ?? [],
    topCustomers:             [],
    segments:                 [],
    tiers:                    [],
    channels:                 p.channels ?? [],
    insights:                 [],
    zeroSalesProducts:        p.zeroSalesProducts ?? [],
    upsellRevenue:            upsell(p.upsellRevenue),
  };
}

const PERIOD: DiagnosisPeriodMeta     = { from: "2026-05-01", to: "2026-05-31", label: "Últimos 30 dias" };
const PREV_PERIOD: DiagnosisPeriodMeta = { from: "2026-04-01", to: "2026-04-30", label: "período anterior" };

function run(partial: Partial<DiagnosisInput> & { current: AnalyticsOverview; previous: AnalyticsOverview | null }) {
  return AnalyticsDiagnosisService.diagnose({
    period:           PERIOD,
    comparisonPeriod: partial.previous ? PREV_PERIOD : null,
    ...partial,
  });
}

// ─── A. Revenue drop driven by order-count drop ───────────────────────────────

describe("A — revenue drop driven by order count", () => {
  it("flags revenue drop and names order volume as the primary driver", () => {
    const previous = overview({
      kpi: { revenue: 10_000, orders: 100, avgTicket: 100, newCustomers: 30 },
    });
    const current = overview({
      // Half the orders, same ticket → revenue down 50%, orders down 50%.
      kpi: { revenue: 5_000, orders: 50, avgTicket: 100, newCustomers: 10 },
    });

    const report = run({ current, previous });
    const f = report.findings.find((x) => x.id === "revenue_drop");

    expect(f).toBeDefined();
    expect(f!.severity).toBe("CRITICAL"); // -50% ≤ -35% critical threshold
    expect(f!.deltaPct).toBeLessThanOrEqual(-35);
    expect(f!.likelyCauses[0]).toMatch(/número de pedidos é o principal fator/i);
  });
});

// ─── B. Revenue drop driven by average-ticket drop ────────────────────────────

describe("B — revenue drop driven by average ticket", () => {
  it("names ticket médio as the primary driver when orders held steady", () => {
    const previous = overview({
      kpi: { revenue: 10_000, orders: 100, avgTicket: 100 },
    });
    const current = overview({
      // Same order count, ticket halved → revenue down 50%, orders ~flat.
      kpi: { revenue: 5_000, orders: 98, avgTicket: 51 },
    });

    const report = run({ current, previous });
    const f = report.findings.find((x) => x.id === "revenue_drop");

    expect(f).toBeDefined();
    expect(f!.likelyCauses[0]).toMatch(/ticket médio é o principal fator/i);
  });
});

// ─── C. Average-ticket drop attributed to upsell / attach decline ─────────────

describe("C — average ticket drop from upsell/attach decline", () => {
  it("produces an avg_ticket_drop finding citing attach/upsell decline", () => {
    const previous = overview({
      kpi: { revenue: 10_000, orders: 100, avgTicket: 100 },
      attachRates: [attach("Bebidas", 60, 100, 1500), attach("Sobremesas", 40, 100, 800)],
      upsellRevenue: { revenue: 1200, revenueShare: 12, ordersWithUpsell: 40 },
    });
    const current = overview({
      kpi: { revenue: 8_000, orders: 100, avgTicket: 80 }, // ticket -20%
      attachRates: [attach("Bebidas", 30, 100, 600), attach("Sobremesas", 15, 100, 200)],
      upsellRevenue: { revenue: 300, revenueShare: 4, ordersWithUpsell: 12 },
    });

    const report = run({ current, previous });
    const f = report.findings.find((x) => x.id === "avg_ticket_drop");

    expect(f).toBeDefined();
    expect(f!.metric).toBe("Ticket médio");
    // Should cite at least one concrete cause (upsell or attach).
    expect(f!.likelyCauses.join(" ")).toMatch(/upsell|bebida|sobremesa/i);
    expect(f!.relatedEntities.categories ?? []).toContain("Bebidas");
  });
});

// ─── D. Previous top product disappeared ──────────────────────────────────────

describe("D — top product disappeared", () => {
  it("flags the previous champion product that now has zero sales", () => {
    const previous = overview({
      kpi: { revenue: 10_000, orders: 100, avgTicket: 100 },
      topProducts: [product("X-Tudo", 4000), product("Batata", 1000)],
    });
    const current = overview({
      kpi: { revenue: 9_000, orders: 95, avgTicket: 94.7 },
      topProducts: [product("Batata", 1000)], // X-Tudo gone entirely
      zeroSalesProducts: [
        { id: "p1", name: "X-Tudo", category: "Lanches", price: 40, isAvailable: false },
      ],
    });

    const report = run({ current, previous });
    const f = report.findings.find((x) => x.id === "top_product_drop");

    expect(f).toBeDefined();
    expect(f!.relatedEntities.products).toContain("X-Tudo");
    expect(f!.confidence).toBe("HIGH"); // unavailable → high confidence
    expect(f!.recommendedAction).toMatch(/disponibilidade/i);
  });
});

// ─── E. Cancellation spike anomaly ────────────────────────────────────────────

describe("E — cancellation spike", () => {
  it("raises a cancellation anomaly when the rate breaches the critical level", () => {
    const previous = overview({
      kpi: { revenue: 10_000, orders: 100, avgTicket: 100, cancelledOrders: 3, cancellationRate: 2.9 },
    });
    const current = overview({
      kpi: { revenue: 9_000, orders: 80, avgTicket: 112.5, cancelledOrders: 25, cancellationRate: 23.8 },
    });

    const report = run({ current, previous });
    const a = report.anomalies.find((x) => x.id === "cancellation_spike");

    expect(a).toBeDefined();
    expect(a!.severity).toBe("CRITICAL"); // 23.8% ≥ 20% critical
    expect(a!.recommendedAction).toMatch(/cancelad/i);
  });
});

// ─── F. Campaign low conversion (and silence below send threshold) ────────────

describe("F — campaign conversion", () => {
  it("raises a low-conversion anomaly when sends are high but conversion is tiny", () => {
    const previous = overview({ kpi: { revenue: 10_000, orders: 100, avgTicket: 100 } });
    const current  = overview({ kpi: { revenue: 10_500, orders: 102, avgTicket: 102.9 } });

    const report = run({
      current,
      previous,
      campaign: { sends: 500, conversions: 2, revenue: 180 }, // 0.4% conversion
    });

    const a = report.anomalies.find((x) => x.id === "campaign_low_conversion");
    expect(a).toBeDefined();
    expect(a!.observedValue).toBeLessThan(DEFAULT_THRESHOLDS.campaignLowConversionPct);
  });

  it("stays silent when there are too few sends to judge", () => {
    const previous = overview({ kpi: { revenue: 10_000, orders: 100, avgTicket: 100 } });
    const current  = overview({ kpi: { revenue: 10_500, orders: 102, avgTicket: 102.9 } });

    const report = run({
      current,
      previous,
      campaign: { sends: 5, conversions: 0, revenue: 0 }, // below campaignMinSends
    });

    expect(report.anomalies.find((x) => x.id === "campaign_low_conversion")).toBeUndefined();
  });
});

// ─── G. Tiny sample does not produce noisy CRITICAL alerts ────────────────────

describe("G — small sample noise guard", () => {
  it("does not emit a CRITICAL revenue-drop finding on a 3-order sample", () => {
    const previous = overview({ kpi: { revenue: 600, orders: 5, avgTicket: 120 } });
    const current  = overview({ kpi: { revenue: 240, orders: 3, avgTicket: 80 } }); // -60% revenue

    const report = run({ current, previous });

    expect(report.dataQuality).toBe("LOW");
    const critical = report.findings.filter((f) => f.severity === "CRITICAL");
    expect(critical).toHaveLength(0);
    // The small-sample limitation must be surfaced.
    expect(report.limitations.join(" ")).toMatch(/amostra pequena/i);
  });
});

// ─── H. Findings include evidence and a recommended action ────────────────────

describe("H — findings are actionable and evidenced", () => {
  it("every finding has non-empty evidence and a recommended action", () => {
    const previous = overview({
      kpi: { revenue: 10_000, orders: 100, avgTicket: 100, newCustomers: 30 },
      topProducts: [product("X-Tudo", 4000), product("Suco", 800)],
      attachRates: [attach("Bebidas", 55, 100, 1400)],
      upsellRevenue: { revenue: 1000, revenueShare: 10, ordersWithUpsell: 35 },
    });
    const current = overview({
      kpi: { revenue: 4_500, orders: 50, avgTicket: 90, newCustomers: 4 },
      topProducts: [product("Suco", 800)],
      attachRates: [attach("Bebidas", 25, 50, 300)],
      upsellRevenue: { revenue: 200, revenueShare: 4, ordersWithUpsell: 8 },
      zeroSalesProducts: [{ id: "p1", name: "X-Tudo", category: "Lanches", price: 40, isAvailable: true }],
    });

    const report = run({ current, previous });

    expect(report.findings.length).toBeGreaterThan(0);
    for (const f of report.findings) {
      expect(f.evidence.length).toBeGreaterThan(0);
      expect(f.recommendedAction.trim().length).toBeGreaterThan(0);
      expect(["GOOD", "INFO", "WARNING", "CRITICAL", "OPPORTUNITY"]).toContain(f.severity);
    }
    // Aggregated, de-duplicated action list is exposed.
    expect(report.recommendedActions.length).toBeGreaterThan(0);
    expect(new Set(report.recommendedActions).size).toBe(report.recommendedActions.length);
  });
});

// ─── I. No invented causes when the previous period is missing ────────────────

describe("I — no fabricated trends without a baseline", () => {
  it("suppresses comparison findings and records the gap as a limitation", () => {
    const current = overview({
      kpi: { revenue: 5_000, orders: 50, avgTicket: 100 },
      topProducts: [product("X-Tudo", 2000)],
    });

    const report = run({ current, previous: null });

    expect(report.hasComparison).toBe(false);
    // None of the comparison-based findings may appear.
    const comparisonIds = ["revenue_drop", "revenue_up", "orders_drop", "avg_ticket_drop", "top_product_drop", "upsell_drop"];
    for (const f of report.findings) {
      expect(comparisonIds).not.toContain(f.id);
    }
    expect(report.comparisonPeriod).toBeNull();
    expect(report.limitations.join(" ")).toMatch(/período anterior comparável/i);
  });

  it("still surfaces absolute anomalies (high cancellation) without a baseline", () => {
    const current = overview({
      kpi: { revenue: 5_000, orders: 50, avgTicket: 100, cancelledOrders: 20, cancellationRate: 28.6 },
    });
    const report = run({ current, previous: null });
    expect(report.anomalies.find((a) => a.id === "cancellation_spike")).toBeDefined();
  });
});

// ─── J. Purity / statelessness (tenant isolation by construction) ─────────────

describe("J — pure & stateless", () => {
  it("two different inputs produce independent reports (no cross-contamination)", () => {
    const a = run({
      current:  overview({ kpi: { revenue: 1000, orders: 20, avgTicket: 50 } }),
      previous: overview({ kpi: { revenue: 1000, orders: 20, avgTicket: 50 } }),
    });
    const b = run({
      current:  overview({ kpi: { revenue: 200, orders: 20, avgTicket: 10, cancelledOrders: 10, cancellationRate: 33 } }),
      previous: overview({ kpi: { revenue: 1000, orders: 20, avgTicket: 50 } }),
    });

    // Report B's anomaly must not leak into report A.
    expect(a.anomalies.find((x) => x.id === "cancellation_spike")).toBeUndefined();
    expect(b.anomalies.find((x) => x.id === "cancellation_spike")).toBeDefined();
  });

  it("is deterministic: same input → identical output", () => {
    const input = {
      current:  overview({ kpi: { revenue: 4000, orders: 50, avgTicket: 80 } }),
      previous: overview({ kpi: { revenue: 10000, orders: 100, avgTicket: 100 } }),
    };
    expect(JSON.stringify(run(input))).toBe(JSON.stringify(run(input)));
  });
});
