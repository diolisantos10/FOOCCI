/**
 * dashboard-periods — "today"/"yesterday" compare against the SAME WEEKDAY last week.
 */

import { describe, it, expect } from "vitest";
import { computePeriodRange } from "./dashboard-periods";

const DAY = 86_400_000;
// 2026-01-01 15:00 BRT (18:00 UTC) is a THURSDAY.
const THU = new Date("2026-01-01T18:00:00.000Z");
// 2026-01-04 is a SUNDAY.
const SUN = new Date("2026-01-04T18:00:00.000Z");

describe("today → same weekday last week", () => {
  const r = computePeriodRange("today", null, null, THU);

  it("shifts the comparison window back exactly 7 days", () => {
    expect(r.rangeEnd.getTime() - r.prevEnd.getTime()).toBe(7 * DAY);
    expect(r.rangeStart.getTime() - r.prevStart.getTime()).toBe(7 * DAY);
  });

  it("labels it as the weekday, last week", () => {
    expect(r.prevLabel).toBe("vs. quinta passada");
  });
});

describe("yesterday → same weekday the previous week", () => {
  const r = computePeriodRange("yesterday", null, null, THU);
  it("compares Wednesday vs the previous Wednesday", () => {
    expect(r.rangeStart.getTime() - r.prevStart.getTime()).toBe(7 * DAY);
    expect(r.prevLabel).toBe("vs. quarta passada");
  });
});

describe("weekday gender", () => {
  it("uses masculine 'passado' for sunday/saturday", () => {
    expect(computePeriodRange("today", null, null, SUN).prevLabel).toBe("vs. domingo passado");
  });
});

describe("last_month → closed previous calendar month", () => {
  // "now" = 2026-03-15 → mês anterior = fevereiro (2026-02).
  const MAR = new Date("2026-03-15T18:00:00.000Z");
  const r = computePeriodRange("last_month", null, null, MAR);

  it("spans exactly the previous month (Feb 1 → Mar 1 exclusive)", () => {
    expect(r.rangeStart.toISOString()).toBe("2026-02-01T03:00:00.000Z");
    expect(r.rangeEnd.toISOString()).toBe("2026-03-01T03:00:00.000Z");
    expect(r.days).toBe(28); // fevereiro 2026
  });

  it("compares against the month before that (Jan)", () => {
    expect(r.prevStart.toISOString()).toBe("2026-01-01T03:00:00.000Z");
    expect(r.prevEnd.getTime()).toBe(r.rangeStart.getTime());
    expect(r.label).toBe("Mês anterior");
    expect(r.prevLabel).toBe("vs. mês retrasado");
  });

  it("wraps the year for January (last_month = December)", () => {
    const JAN = new Date("2026-01-10T18:00:00.000Z");
    const j = computePeriodRange("last_month", null, null, JAN);
    expect(j.rangeStart.toISOString()).toBe("2025-12-01T03:00:00.000Z");
    expect(j.rangeEnd.toISOString()).toBe("2026-01-01T03:00:00.000Z");
    expect(j.prevStart.toISOString()).toBe("2025-11-01T03:00:00.000Z");
  });
});
