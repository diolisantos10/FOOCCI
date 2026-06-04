/**
 * AnalyticsRetentionService — pure computation tests (A–F).
 *
 * Uses computeRetentionReport() only — no DB, no network, no LLM.
 * All cohort rows are hand-built fixtures.
 *
 *   A — cohort with repeat orders computes 30/60/90 retention
 *   B — cohort with no repeats returns 0 retention
 *   C — cancelled/unpaid orders excluded (enforced at SQL level; test verifies
 *       the pure function treats inputs as already-valid revenue rows)
 *   D — small sample (< 5) adds a limitation note
 *   E — averageSecondOrderDays is computed and rounded correctly
 *   F — report structure: hasData, summary, insights, limitations populated
 */

import { describe, it, expect } from "vitest";
import {
  computeRetentionReport,
  type RawCohortRow,
} from "./AnalyticsRetentionService";

const FROM = "2026-01-01";
const TO   = "2026-04-30";
// Freeze "today" at 2026-06-04 so maturity notes are deterministic.
const NOW  = "2026-06-04";

function row(p: Partial<RawCohortRow> & { cohortMonth: string; newCustomers: number }): RawCohortRow {
  return {
    cohortMonth:        p.cohortMonth,
    newCustomers:       p.newCustomers,
    returned30d:        p.returned30d        ?? 0,
    returned60d:        p.returned60d        ?? 0,
    returned90d:        p.returned90d        ?? 0,
    avgSecondOrderDays: p.avgSecondOrderDays ?? null,
    totalRevenue:       p.totalRevenue       ?? 1000,
    repeatRevenue:      p.repeatRevenue      ?? 0,
  };
}

// ─── A. Cohort with repeat orders computes 30/60/90 retention ─────────────────

describe("A — cohort with repeats", () => {
  it("computes correct retention percentages for 30/60/90 days", () => {
    const rows: RawCohortRow[] = [
      row({
        cohortMonth:  "2026-01",
        newCustomers: 10,
        returned30d:  4,   // 40%
        returned60d:  6,   // 60%
        returned90d:  7,   // 70%
        avgSecondOrderDays: 18,
        repeatRevenue: 400,
        totalRevenue:  1000,
      }),
    ];

    const report = computeRetentionReport(rows, FROM, TO, NOW);
    const cohort = report.cohorts[0]!;

    expect(cohort.cohortMonth).toBe("2026-01");
    expect(cohort.newCustomers).toBe(10);
    expect(cohort.returned30d).toBe(4);
    expect(cohort.retention30dPct).toBe(40);
    expect(cohort.retention60dPct).toBe(60);
    expect(cohort.retention90dPct).toBe(70);
    expect(cohort.repeatRevenuePct).toBe(40);
    expect(report.hasData).toBe(true);
    expect(report.summary.avgRetention30d).toBeGreaterThan(0);
  });
});

// ─── B. Cohort with no repeats returns 0 retention ────────────────────────────

describe("B — cohort with no repeats", () => {
  it("returns zero retention for all windows when no customer returned", () => {
    const rows: RawCohortRow[] = [
      row({
        cohortMonth:  "2026-01",
        newCustomers: 8,
        returned30d:  0,
        returned60d:  0,
        returned90d:  0,
      }),
    ];

    const report = computeRetentionReport(rows, FROM, TO, NOW);
    const cohort = report.cohorts[0]!;

    expect(cohort.retention30dPct).toBe(0);
    expect(cohort.retention60dPct).toBe(0);
    expect(cohort.retention90dPct).toBe(0);
    // Summary avg should also be 0.
    expect(report.summary.avgRetention30d).toBe(0);
  });
});

// ─── C. Pure function treats inputs as already-filtered valid orders ──────────

describe("C — pure function trusts SQL filter for order validity", () => {
  it("does not re-filter rows — correctness is assumed from DB inputs", () => {
    // The SQL WHERE clause already excludes CANCELLED/AWAITING_PAYMENT orders.
    // This test confirms that the pure function processes all supplied rows
    // without additional filtering (separation of concerns).
    const rows: RawCohortRow[] = [
      row({ cohortMonth: "2026-02", newCustomers: 5, returned30d: 2 }),
    ];

    const report = computeRetentionReport(rows, FROM, TO, NOW);
    expect(report.cohorts[0]!.newCustomers).toBe(5); // unchanged
    expect(report.cohorts[0]!.returned30d).toBe(2);  // unchanged
  });
});

// ─── D. Small sample adds a limitation note ───────────────────────────────────

describe("D — small sample adds limitation", () => {
  it("adds a limitation when any cohort has fewer than 5 customers", () => {
    const rows: RawCohortRow[] = [
      row({ cohortMonth: "2026-01", newCustomers: 2, returned30d: 1 }),
    ];

    const report = computeRetentionReport(rows, FROM, TO, NOW);
    const smallSampleLimitation = report.limitations.find((l) =>
      l.toLowerCase().includes("menos de"),
    );
    expect(smallSampleLimitation).toBeDefined();
    // Small cohorts are excluded from summary averages.
    expect(report.summary.avgRetention30d).toBe(0);
  });
});

// ─── E. averageSecondOrderDays computed and rounded ──────────────────────────

describe("E — averageSecondOrderDays", () => {
  it("rounds to 1 decimal and surfaces in insight", () => {
    const rows: RawCohortRow[] = [
      row({
        cohortMonth:        "2026-01",
        newCustomers:       10,
        returned30d:        5,
        avgSecondOrderDays: 18.666,
      }),
    ];

    const report = computeRetentionReport(rows, FROM, TO, NOW);
    const cohort = report.cohorts[0]!;

    expect(cohort.averageSecondOrderDays).toBe(18.7);
    // At least one insight should mention the cycle.
    expect(report.insights.join(" ")).toMatch(/segundo pedido|ciclo/i);
  });

  it("returns null averageSecondOrderDays when none returned", () => {
    const rows: RawCohortRow[] = [
      row({ cohortMonth: "2026-01", newCustomers: 6, returned30d: 0, avgSecondOrderDays: null }),
    ];
    const report = computeRetentionReport(rows, FROM, TO, NOW);
    expect(report.cohorts[0]!.averageSecondOrderDays).toBeNull();
  });
});

// ─── F. Report structure ─────────────────────────────────────────────────────

describe("F — report structure", () => {
  it("populates all required fields even with empty input", () => {
    const report = computeRetentionReport([], FROM, TO, NOW);
    expect(report.hasData).toBe(false);
    expect(Array.isArray(report.cohorts)).toBe(true);
    expect(Array.isArray(report.insights)).toBe(true);
    expect(Array.isArray(report.limitations)).toBe(true);
    expect(typeof report.summary.avgRetention30d).toBe("number");
    expect(report.period.from).toBe(FROM);
    expect(report.period.to).toBe(TO);
  });

  it("immature cohorts get a maturityNote and limitation", () => {
    // A cohort from just one week ago — not mature at all.
    const rows: RawCohortRow[] = [
      row({ cohortMonth: "2026-06", newCustomers: 10, returned30d: 0 }),
    ];
    const report = computeRetentionReport(rows, "2026-06-01", TO, NOW);
    expect(report.cohorts[0]!.maturityNote).toBeTruthy();
    const maturityLimitation = report.limitations.find((l) =>
      l.toLowerCase().includes("maturou"),
    );
    expect(maturityLimitation).toBeDefined();
  });

  it("two cohorts → summary is weighted average", () => {
    const rows: RawCohortRow[] = [
      row({ cohortMonth: "2026-01", newCustomers: 10, returned30d: 2 }), // 20%
      row({ cohortMonth: "2026-02", newCustomers: 10, returned30d: 8 }), // 80%
    ];
    const report = computeRetentionReport(rows, FROM, TO, NOW);
    // Weighted: (10 × 20 + 10 × 80) / 20 = 50%.
    expect(report.summary.avgRetention30d).toBe(50);
  });
});
