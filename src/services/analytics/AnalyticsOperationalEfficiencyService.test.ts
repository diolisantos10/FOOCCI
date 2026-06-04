/**
 * AnalyticsOperationalEfficiencyService — pure computation tests (G–L).
 *
 * Uses computeEfficiencyReport() only — no DB, no network, no LLM.
 * Raw timing rows and KPI hints are hand-built fixtures.
 *
 *   G — created→delivered timing rows compute avg, median, p90
 *   H — zero timing rows produce limitation instead of fake metrics
 *   I — delayed orders generate a WARNING/CRITICAL bottleneck
 *   J — cancellations reflected in metrics and possibly in bottleneck
 *   K — awaiting-payment count reflected in metrics and bottleneck
 *   L — two independent calls produce independent reports (purity)
 */

import { describe, it, expect } from "vitest";
import {
  computeEfficiencyReport,
  DEFAULT_EFFICIENCY_THRESHOLDS,
  type RawTimingRow,
  type RawKpiHints,
} from "./AnalyticsOperationalEfficiencyService";

const FROM = "2026-05-01";
const TO   = "2026-05-31";

function kpi(p: Partial<RawKpiHints> = {}): RawKpiHints {
  return {
    totalOrders:          p.totalOrders          ?? 50,
    cancelledOrders:      p.cancelledOrders       ?? 0,
    cancellationRate:     p.cancellationRate      ?? 0,
    awaitingPaymentCount: p.awaitingPaymentCount  ?? 0,
    awaitingPaymentTotal: p.awaitingPaymentTotal  ?? 0,
  };
}

function deliveryRow(minutes: number): RawTimingRow {
  return { type: "DELIVERY", fulfillmentMinutes: minutes };
}

// ─── G. Timing rows compute avg / median / p90 ────────────────────────────────

describe("G — timing computation", () => {
  it("computes correct avg, median, and p90 from delivery rows", () => {
    // 10 delivery orders: 30..120 min (step 10)
    const rows: RawTimingRow[] = [30, 40, 50, 60, 70, 80, 90, 100, 110, 120].map(deliveryRow);
    const report = computeEfficiencyReport(rows, kpi({ totalOrders: 10 }), FROM, TO);

    expect(report.metrics.ordersWithTiming).toBe(10);
    expect(report.metrics.avgFulfillmentMinutes).toBe(75);    // avg([30..120 step 10])
    expect(report.metrics.medianFulfillmentMinutes).toBe(70); // percentile(50): idx = ceil(0.5*10)-1 = 4 → sorted[4] = 70
    // P90: idx = ceil(0.9*10)-1 = 8 → sorted[8] = 110
    expect(report.metrics.p90FulfillmentMinutes).toBe(110);
  });

  it("groups by order type and computes per-type delay", () => {
    const rows: RawTimingRow[] = [
      { type: "DELIVERY", fulfillmentMinutes: 80 }, // delayed (>60)
      { type: "DELIVERY", fulfillmentMinutes: 40 }, // ok
      { type: "PICKUP",   fulfillmentMinutes: 50 }, // delayed (>40)
      { type: "PICKUP",   fulfillmentMinutes: 20 }, // ok
    ];
    const report = computeEfficiencyReport(rows, kpi({ totalOrders: 4 }), FROM, TO);
    const delivery = report.metrics.byType.find((b) => b.type === "DELIVERY")!;
    const pickup   = report.metrics.byType.find((b) => b.type === "PICKUP")!;

    expect(delivery).toBeDefined();
    expect(delivery.delayedOrders).toBe(1);
    expect(pickup.delayedOrders).toBe(1);
    expect(delivery.delayThresholdMinutes).toBe(DEFAULT_EFFICIENCY_THRESHOLDS.deliveryDelayMinutes);
    expect(pickup.delayThresholdMinutes).toBe(DEFAULT_EFFICIENCY_THRESHOLDS.pickupDelayMinutes);
  });
});

// ─── H. Zero timing rows produce limitation, not fake metrics ────────────────

describe("H — zero timing rows", () => {
  it("produces a limitation and zero metrics when no orders have completedAt", () => {
    const report = computeEfficiencyReport([], kpi({ totalOrders: 20 }), FROM, TO);

    expect(report.metrics.ordersWithTiming).toBe(0);
    expect(report.metrics.avgFulfillmentMinutes).toBe(0);
    expect(report.metrics.medianFulfillmentMinutes).toBe(0);

    const timingLimitation = report.limitations.find((l) =>
      l.toLowerCase().includes("timestamps completos") || l.toLowerCase().includes("delivered"),
    );
    expect(timingLimitation).toBeDefined();
  });

  it("never fabricates a timing bottleneck when ordersWithTiming is 0", () => {
    const report = computeEfficiencyReport([], kpi(), FROM, TO);
    const timingBottleneck = report.bottlenecks.find((b) => b.stage === "FULFILLMENT");
    expect(timingBottleneck).toBeUndefined();
  });
});

// ─── I. Delayed orders generate a bottleneck ────────────────────────────────

describe("I — delayed orders generate bottleneck", () => {
  it("creates a WARNING FULFILLMENT bottleneck when many orders are delayed", () => {
    // 30 orders over 60min (default delivery threshold) out of 40 = 75% delayed
    const rows: RawTimingRow[] = [
      ...Array(30).fill(null).map(() => deliveryRow(90)),
      ...Array(10).fill(null).map(() => deliveryRow(40)),
    ];
    const report = computeEfficiencyReport(rows, kpi({ totalOrders: 40 }), FROM, TO);
    const bn = report.bottlenecks.find((b) => b.stage === "FULFILLMENT");
    expect(bn).toBeDefined();
    expect(bn!.severity === "WARNING" || bn!.severity === "CRITICAL").toBe(true);
    expect(bn!.affectedOrders).toBe(30);
  });

  it("does NOT fire FULFILLMENT bottleneck when delay rate is below warn threshold", () => {
    const rows = Array(10).fill(null).map(() => deliveryRow(40)); // all under 60min
    const report = computeEfficiencyReport(rows, kpi({ totalOrders: 10 }), FROM, TO);
    expect(report.bottlenecks.find((b) => b.stage === "FULFILLMENT")).toBeUndefined();
  });
});

// ─── J. Cancellations reflected in metrics ────────────────────────────────────

describe("J — cancellations", () => {
  it("reflects cancellation rate from kpi hints in metrics", () => {
    const report = computeEfficiencyReport(
      [],
      kpi({ totalOrders: 90, cancelledOrders: 10, cancellationRate: 10 }),
      FROM,
      TO,
    );

    expect(report.metrics.cancelledOrders).toBe(10);
    expect(report.metrics.cancellationRate).toBe(10);
  });

  it("creates a WARNING CANCELLATION bottleneck when rate ≥ warn threshold", () => {
    const report = computeEfficiencyReport(
      [],
      kpi({ totalOrders: 80, cancelledOrders: 20, cancellationRate: 20 }),
      FROM,
      TO,
    );
    const bn = report.bottlenecks.find((b) => b.stage === "CANCELLATION");
    expect(bn).toBeDefined();
    expect(bn!.severity === "WARNING" || bn!.severity === "CRITICAL").toBe(true);
  });

  it("does NOT create CANCELLATION bottleneck for 0 cancellations", () => {
    const report = computeEfficiencyReport(
      [],
      kpi({ cancelledOrders: 0, cancellationRate: 0 }),
      FROM,
      TO,
    );
    expect(report.bottlenecks.find((b) => b.stage === "CANCELLATION")).toBeUndefined();
  });
});

// ─── K. Awaiting payment reflected ────────────────────────────────────────────

describe("K — awaiting payment / Pix pending", () => {
  it("reflects awaiting-payment count and fires PAYMENT bottleneck when count ≥ min", () => {
    const report = computeEfficiencyReport(
      [],
      kpi({ awaitingPaymentCount: 5, awaitingPaymentTotal: 250 }),
      FROM,
      TO,
    );

    expect(report.metrics.awaitingPaymentCount).toBe(5);
    expect(report.metrics.awaitingPaymentTotal).toBe(250);

    const bn = report.bottlenecks.find((b) => b.stage === "PAYMENT");
    expect(bn).toBeDefined();
    expect(bn!.severity).toBe("WARNING");
  });

  it("does NOT create PAYMENT bottleneck when awaiting count is 0", () => {
    const report = computeEfficiencyReport([], kpi({ awaitingPaymentCount: 0 }), FROM, TO);
    expect(report.bottlenecks.find((b) => b.stage === "PAYMENT")).toBeUndefined();
  });
});

// ─── L. Purity — two calls produce independent reports ────────────────────────

describe("L — pure & stateless", () => {
  it("two different inputs produce independent reports (no cross-contamination)", () => {
    const a = computeEfficiencyReport(
      [deliveryRow(30)],
      kpi({ totalOrders: 1 }),
      FROM, TO,
    );
    const b = computeEfficiencyReport(
      [],
      kpi({ totalOrders: 20, cancelledOrders: 10, cancellationRate: 33 }),
      FROM, TO,
    );

    // a has timing data; b has none
    expect(a.metrics.ordersWithTiming).toBe(1);
    expect(b.metrics.ordersWithTiming).toBe(0);
    // b has cancellation bottleneck; a does not
    expect(a.bottlenecks.find((x) => x.stage === "CANCELLATION")).toBeUndefined();
    expect(b.bottlenecks.find((x) => x.stage === "CANCELLATION")).toBeDefined();
  });

  it("is deterministic: same input → same output", () => {
    const rows = [deliveryRow(50), deliveryRow(80)];
    const k    = kpi({ totalOrders: 2 });
    expect(
      JSON.stringify(computeEfficiencyReport(rows, k, FROM, TO)),
    ).toBe(
      JSON.stringify(computeEfficiencyReport(rows, k, FROM, TO)),
    );
  });
});
