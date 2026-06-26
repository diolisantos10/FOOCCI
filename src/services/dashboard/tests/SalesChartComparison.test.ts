/**
 * SalesChartComparison.test.ts
 *
 * Pure-function tests for computePeriodRange and buildChartBuckets.
 * Covers comparison window correctness for all 7 period types plus bucket logic.
 */

import { describe, it, expect } from "vitest";
import { computePeriodRange, buildChartBuckets } from "@/lib/dashboard-periods";

// ── computePeriodRange — today ────────────────────────────────────────────────

describe("computePeriodRange — today", () => {
  const now = new Date("2026-06-06T15:00:00.000Z"); // 12:00 BRT

  it("prevEnd is now − 7 d (same weekday last week, same elapsed time)", () => {
    const pr = computePeriodRange("today", null, null, now);
    expect(pr.prevEnd.getTime()).toBe(now.getTime() - 7 * 86_400_000);
  });

  it("prevStart is the same weekday last week (todayStart − 7 d)", () => {
    const pr = computePeriodRange("today", null, null, now);
    expect(pr.prevStart.getTime()).toBe(new Date("2026-05-30T03:00:00.000Z").getTime());
  });

  it("granularity is 'hour'", () => {
    const pr = computePeriodRange("today", null, null, now);
    expect(pr.granularity).toBe("hour");
  });

  it("isToday is true", () => {
    const pr = computePeriodRange("today", null, null, now);
    expect(pr.isToday).toBe(true);
  });

  it("label is 'Hoje'", () => {
    const pr = computePeriodRange("today", null, null, now);
    expect(pr.label).toBe("Hoje");
  });
});

// ── computePeriodRange — yesterday ────────────────────────────────────────────

describe("computePeriodRange — yesterday", () => {
  const now = new Date("2026-06-06T15:00:00.000Z");

  it("rangeStart is yesterday midnight BRT", () => {
    const pr = computePeriodRange("yesterday", null, null, now);
    expect(pr.rangeStart.getTime()).toBe(new Date("2026-06-05T03:00:00.000Z").getTime());
  });

  it("rangeEnd is today midnight BRT (full yesterday)", () => {
    const pr = computePeriodRange("yesterday", null, null, now);
    expect(pr.rangeEnd.getTime()).toBe(new Date("2026-06-06T03:00:00.000Z").getTime());
  });

  it("comparison is the same weekday the previous week", () => {
    const pr = computePeriodRange("yesterday", null, null, now);
    expect(pr.prevStart.getTime()).toBe(new Date("2026-05-29T03:00:00.000Z").getTime());
    expect(pr.prevEnd.getTime()).toBe(new Date("2026-05-30T03:00:00.000Z").getTime());
  });

  it("granularity is 'hour'", () => {
    const pr = computePeriodRange("yesterday", null, null, now);
    expect(pr.granularity).toBe("hour");
  });
});

// ── computePeriodRange — this_week ────────────────────────────────────────────

describe("computePeriodRange — this_week", () => {
  // Wednesday 12:00 BRT = 15:00 UTC, June 10 2026
  const now = new Date("2026-06-10T15:00:00.000Z");

  it("prevEnd is now − 7 d (same elapsed span, not weekStart)", () => {
    const pr = computePeriodRange("this_week", null, null, now);
    expect(pr.prevEnd.getTime()).toBe(now.getTime() - 7 * 86_400_000);
  });

  it("prevStart is Monday of last week (BRT)", () => {
    const pr = computePeriodRange("this_week", null, null, now);
    // This week Mon = June 8 03:00 UTC; last week Mon = June 1 03:00 UTC
    expect(pr.prevStart.getTime()).toBe(new Date("2026-06-01T03:00:00.000Z").getTime());
  });

  it("days reflects elapsed days so far this week (Mon + Tue + Wed = 3)", () => {
    const pr = computePeriodRange("this_week", null, null, now);
    expect(pr.days).toBe(3);
  });

  it("granularity is 'day'", () => {
    const pr = computePeriodRange("this_week", null, null, now);
    expect(pr.granularity).toBe("day");
  });

  it("Monday start: days = 1", () => {
    const monday = new Date("2026-06-08T15:00:00.000Z");
    const pr     = computePeriodRange("this_week", null, null, monday);
    expect(pr.days).toBe(1);
  });
});

// ── computePeriodRange — 7d ────────────────────────────────────────────────────

describe("computePeriodRange — 7d", () => {
  const now = new Date("2026-06-06T15:00:00.000Z");

  it("comparison window is the 7 days immediately before the current 7-day window", () => {
    const pr = computePeriodRange("7d", null, null, now);
    expect(pr.prevEnd.getTime()).toBe(pr.rangeStart.getTime());
    expect(pr.prevStart.getTime()).toBe(pr.rangeStart.getTime() - 7 * 86_400_000);
  });

  it("days = 7", () => {
    const pr = computePeriodRange("7d", null, null, now);
    expect(pr.days).toBe(7);
  });

  it("granularity is 'day'", () => {
    const pr = computePeriodRange("7d", null, null, now);
    expect(pr.granularity).toBe("day");
  });
});

// ── computePeriodRange — current_month ────────────────────────────────────────

describe("computePeriodRange — current_month", () => {
  it("prevEnd is the same elapsed position in the previous month", () => {
    const now        = new Date("2026-06-06T15:00:00.000Z");
    const pr         = computePeriodRange("current_month", null, null, now);
    const rangeStart = new Date("2026-06-01T03:00:00.000Z");
    const prevStart  = new Date("2026-05-01T03:00:00.000Z");
    const elapsed    = now.getTime() - rangeStart.getTime();
    expect(pr.prevEnd.getTime()).toBe(prevStart.getTime() + elapsed);
  });

  it("prevStart is the 1st of the previous month (BRT)", () => {
    const now = new Date("2026-06-06T15:00:00.000Z");
    const pr  = computePeriodRange("current_month", null, null, now);
    expect(pr.prevStart.getTime()).toBe(new Date("2026-05-01T03:00:00.000Z").getTime());
  });

  it("prevEnd is capped at rangeStart when elapsed exceeds previous month length (Feb edge case)", () => {
    // March 31 → elapsed ≈ 30 days, but Feb only has 28 days → cap at March 1
    const now        = new Date("2026-03-31T15:00:00.000Z");
    const pr         = computePeriodRange("current_month", null, null, now);
    const rangeStart = new Date("2026-03-01T03:00:00.000Z");
    expect(pr.prevEnd.getTime()).toBeLessThanOrEqual(rangeStart.getTime());
  });

  it("granularity is 'day'", () => {
    const pr = computePeriodRange("current_month", null, null, new Date("2026-06-06T15:00:00.000Z"));
    expect(pr.granularity).toBe("day");
  });
});

// ── computePeriodRange — 30d ────────────────────────────────────────────────────

describe("computePeriodRange — 30d", () => {
  const now = new Date("2026-06-06T15:00:00.000Z");

  it("comparison is the 30 days before the current window", () => {
    const pr = computePeriodRange("30d", null, null, now);
    expect(pr.prevEnd.getTime()).toBe(pr.rangeStart.getTime());
    expect(pr.prevStart.getTime()).toBe(pr.rangeStart.getTime() - 30 * 86_400_000);
  });

  it("days = 30", () => {
    const pr = computePeriodRange("30d", null, null, now);
    expect(pr.days).toBe(30);
  });

  it("granularity is 'day'", () => {
    const pr = computePeriodRange("30d", null, null, now);
    expect(pr.granularity).toBe("day");
  });
});

// ── computePeriodRange — custom ────────────────────────────────────────────────

describe("computePeriodRange — custom", () => {
  const now = new Date("2026-06-06T15:00:00.000Z");

  it("≤2 days → hour granularity", () => {
    const pr = computePeriodRange("custom", "2026-06-05", "2026-06-06", now);
    expect(pr.granularity).toBe("hour");
  });

  it(">2 days → day granularity", () => {
    const pr = computePeriodRange("custom", "2026-06-01", "2026-06-05", now);
    expect(pr.granularity).toBe("day");
  });

  it("comparison is the same-duration window immediately before", () => {
    const pr = computePeriodRange("custom", "2026-06-01", "2026-06-05", now);
    expect(pr.prevEnd.getTime()).toBe(pr.rangeStart.getTime());
    expect(pr.prevStart.getTime()).toBe(pr.rangeStart.getTime() - pr.days * 86_400_000);
  });

  it("prevLabel includes the number of days", () => {
    const pr = computePeriodRange("custom", "2026-06-01", "2026-06-07", now);
    expect(pr.prevLabel).toContain("dias");
  });
});

// ── buildChartBuckets — hourly ─────────────────────────────────────────────────

describe("buildChartBuckets — hourly", () => {
  const periodStart = new Date("2026-06-06T03:00:00.000Z"); // today midnight BRT

  it("produces exactly 24 buckets", () => {
    const buckets = buildChartBuckets([], periodStart, 24, "hour");
    expect(buckets).toHaveLength(24);
  });

  it("bucket keys are zero-padded 2-digit hour strings", () => {
    const buckets = buildChartBuckets([], periodStart, 24, "hour");
    expect(buckets[0]!.bucketKey).toBe("00");
    expect(buckets[7]!.bucketKey).toBe("07");
    expect(buckets[23]!.bucketKey).toBe("23");
  });

  it("labels use 'h' suffix", () => {
    const buckets = buildChartBuckets([], periodStart, 24, "hour");
    expect(buckets[0]!.label).toBe("0h");
    expect(buckets[7]!.label).toBe("7h");
    expect(buckets[23]!.label).toBe("23h");
  });

  it("aggregates an order into the correct hour bucket (BRT offset)", () => {
    // Order at 10:00 BRT = 13:00 UTC
    const orders  = [{ createdAt: new Date("2026-06-06T13:00:00.000Z"), total: 150 }];
    const buckets = buildChartBuckets(orders, periodStart, 24, "hour");
    expect(buckets[10]!.revenue).toBe(150);
    expect(buckets[10]!.orders).toBe(1);
    expect(buckets[9]!.revenue).toBe(0);
    expect(buckets[11]!.orders).toBe(0);
  });

  it("multiple orders in the same hour accumulate correctly", () => {
    const orders = [
      { createdAt: new Date("2026-06-06T13:00:00.000Z"), total: 100 },
      { createdAt: new Date("2026-06-06T13:30:00.000Z"), total: 50 },
    ];
    const buckets = buildChartBuckets(orders, periodStart, 24, "hour");
    expect(buckets[10]!.revenue).toBe(150);
    expect(buckets[10]!.orders).toBe(2);
  });

  it("rounds revenue to 2 decimal places", () => {
    const orders  = [{ createdAt: new Date("2026-06-06T13:00:00.000Z"), total: 100.999 }];
    const buckets = buildChartBuckets(orders, periodStart, 24, "hour");
    expect(buckets[10]!.revenue).toBe(101);
  });

  it("empty orders gives all-zero buckets", () => {
    const buckets = buildChartBuckets([], periodStart, 24, "hour");
    expect(buckets.every(b => b.revenue === 0 && b.orders === 0)).toBe(true);
  });
});

// ── buildChartBuckets — daily ──────────────────────────────────────────────────

describe("buildChartBuckets — daily", () => {
  const periodStart = new Date("2026-06-01T03:00:00.000Z"); // June 1 midnight BRT

  it("produces the requested number of buckets", () => {
    const buckets = buildChartBuckets([], periodStart, 7, "day");
    expect(buckets).toHaveLength(7);
  });

  it("bucket keys are YYYY-MM-DD BRT dates", () => {
    const buckets = buildChartBuckets([], periodStart, 3, "day");
    expect(buckets[0]!.bucketKey).toBe("2026-06-01");
    expect(buckets[1]!.bucketKey).toBe("2026-06-02");
    expect(buckets[2]!.bucketKey).toBe("2026-06-03");
  });

  it("aggregates an order into the correct day bucket", () => {
    // Order at June 2 10:00 BRT = June 2 13:00 UTC
    const orders  = [{ createdAt: new Date("2026-06-02T13:00:00.000Z"), total: 200 }];
    const buckets = buildChartBuckets(orders, periodStart, 3, "day");
    expect(buckets[0]!.revenue).toBe(0);
    expect(buckets[1]!.revenue).toBe(200);
    expect(buckets[1]!.orders).toBe(1);
    expect(buckets[2]!.revenue).toBe(0);
  });

  it("uses 'Seg DD' labels for ≤7 buckets (June 1 2026 = Monday)", () => {
    const buckets = buildChartBuckets([], periodStart, 7, "day");
    expect(buckets[0]!.label).toBe("Seg 01");
  });

  it("uses 'DD/MM' labels for >7 buckets", () => {
    const buckets = buildChartBuckets([], periodStart, 8, "day");
    expect(buckets[0]!.label).toBe("01/06");
  });

  it("caps at 90 buckets regardless of numBuckets argument", () => {
    const buckets = buildChartBuckets([], new Date("2026-01-01T03:00:00.000Z"), 120, "day");
    expect(buckets).toHaveLength(90);
  });

  it("ignores orders outside the period window", () => {
    // Order on June 4, but window is June 1–3
    const orders  = [{ createdAt: new Date("2026-06-04T13:00:00.000Z"), total: 999 }];
    const buckets = buildChartBuckets(orders, periodStart, 3, "day");
    expect(buckets.every(b => b.revenue === 0)).toBe(true);
  });

  it("multiple orders on same day accumulate", () => {
    const orders = [
      { createdAt: new Date("2026-06-01T10:00:00.000Z"), total: 100 }, // June 1 07:00 BRT
      { createdAt: new Date("2026-06-01T18:00:00.000Z"), total: 200 }, // June 1 15:00 BRT
    ];
    const buckets = buildChartBuckets(orders, periodStart, 3, "day");
    expect(buckets[0]!.revenue).toBe(300);
    expect(buckets[0]!.orders).toBe(2);
  });
});
