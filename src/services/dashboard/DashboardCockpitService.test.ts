/**
 * DashboardCockpitService — pure-function tests (W4).
 *
 * Tests buildAlerts(), buildActions(), buildHealth() without any DB or network I/O.
 *
 *   A — today KPIs: healthy revenue → HEALTHY sales indicator
 *   B — pending payments alert: ≥3 → WARNING, 1–2 → INFO, 0 → no alert
 *   C — revenue drop → WARNING alert + CRITICAL/WARNING health
 *   D — cold customers ≥ 20 → CRM action recommended
 *   E — review opportunities limitation declared in getCockpitReport
 *   F — no actions produced when all inputs are clean
 *   G — missing 7-day data → NO_DATA sales health, no revenue-drop alert
 *   H — no orders today → no cancellation alert, no revenue-drop alert
 *   I — buildAlerts/buildActions/buildHealth are pure and deterministic
 *   J — pure builders have no side effects (no mutations to input)
 */

import { describe, it, expect } from "vitest";
import {
  buildAlerts,
  buildActions,
  buildHealth,
  type CockpitRawData,
} from "./DashboardCockpitService";

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const CLEAN: CockpitRawData = {
  todayRevenue:    1_000,
  todayOrders:     20,
  cancelledToday:  0,
  avg7DayRevenue:  900,
  hasSevenDayData: true,
  pendingPayments: 0,
  delayedOrders:   0,
  crmFrio:         5,
  crmTotal:        100,
  vipCustomers:    10,
  pendingRecovery: 0,
};

// ─── A — today KPIs → HEALTHY ─────────────────────────────────────────────────

describe("A — healthy revenue → HEALTHY sales indicator", () => {
  it("revenue at 100% of average → HEALTHY", () => {
    const h = buildHealth({ ...CLEAN, todayRevenue: 900, avg7DayRevenue: 900 });
    expect(h.sales.status).toBe("HEALTHY");
  });

  it("revenue at 85% of average → HEALTHY", () => {
    const h = buildHealth({ ...CLEAN, todayRevenue: 765, avg7DayRevenue: 900 });
    expect(h.sales.status).toBe("HEALTHY");
  });

  it("no delayed orders → operations HEALTHY", () => {
    const h = buildHealth({ ...CLEAN, delayedOrders: 0, pendingPayments: 0 });
    expect(h.operations.status).toBe("HEALTHY");
  });

  it("small cold ratio (<25%) → crm HEALTHY", () => {
    const h = buildHealth({ ...CLEAN, crmFrio: 10, crmTotal: 100 });
    expect(h.crm.status).toBe("HEALTHY");
  });

  it("no pending recovery → recovery HEALTHY", () => {
    const h = buildHealth({ ...CLEAN, pendingRecovery: 0 });
    expect(h.recovery.status).toBe("HEALTHY");
  });
});

// ─── B — pending payments alert ───────────────────────────────────────────────

describe("B — pending payments alert", () => {
  it("3 pending payments → WARNING alert", () => {
    const alerts = buildAlerts({ ...CLEAN, pendingPayments: 3 });
    const a = alerts.find(x => x.id === "pending-payments");
    expect(a).toBeDefined();
    expect(a!.severity).toBe("WARNING");
  });

  it("1 pending payment → INFO alert", () => {
    const alerts = buildAlerts({ ...CLEAN, pendingPayments: 1 });
    const a = alerts.find(x => x.id === "pending-payments");
    expect(a).toBeDefined();
    expect(a!.severity).toBe("INFO");
  });

  it("0 pending payments → no payment alert", () => {
    const alerts = buildAlerts({ ...CLEAN, pendingPayments: 0 });
    expect(alerts.find(x => x.id === "pending-payments")).toBeUndefined();
  });

  it("payment alert includes actionHref to /orders", () => {
    const alerts = buildAlerts({ ...CLEAN, pendingPayments: 2 });
    const a = alerts.find(x => x.id === "pending-payments");
    expect(a?.actionHref).toBe("/orders");
  });
});

// ─── C — revenue drop → alert + health ────────────────────────────────────────

describe("C — revenue drop", () => {
  it("revenue at 40% of average + orders present → WARNING alert", () => {
    const alerts = buildAlerts({ ...CLEAN, todayRevenue: 360, avg7DayRevenue: 900, todayOrders: 5 });
    const a = alerts.find(x => x.id === "revenue-below-baseline");
    expect(a).toBeDefined();
    expect(a!.severity).toBe("WARNING");
  });

  it("revenue at 40% → CRITICAL health (< 50%)", () => {
    const h = buildHealth({ ...CLEAN, todayRevenue: 360, avg7DayRevenue: 900 });
    expect(h.sales.status).toBe("CRITICAL");
  });

  it("revenue at 60% → WARNING health (50–79%)", () => {
    const h = buildHealth({ ...CLEAN, todayRevenue: 540, avg7DayRevenue: 900 });
    expect(h.sales.status).toBe("WARNING");
  });

  it("no revenue-drop alert when today has 0 orders (day may not have started)", () => {
    const alerts = buildAlerts({ ...CLEAN, todayRevenue: 0, avg7DayRevenue: 900, todayOrders: 0 });
    expect(alerts.find(x => x.id === "revenue-below-baseline")).toBeUndefined();
  });

  it("3 delayed orders → CRITICAL operations health", () => {
    const h = buildHealth({ ...CLEAN, delayedOrders: 3 });
    expect(h.operations.status).toBe("CRITICAL");
  });

  it("1 delayed order → WARNING operations health", () => {
    const h = buildHealth({ ...CLEAN, delayedOrders: 1 });
    expect(h.operations.status).toBe("WARNING");
  });
});

// ─── D — CRM opportunities → recommended actions ──────────────────────────────

describe("D — CRM opportunities → recommended actions", () => {
  it("coldCustomers ≥ 20 → CRM action", () => {
    const actions = buildActions({ ...CLEAN, crmFrio: 20 });
    expect(actions.some(a => a.source === "CRM")).toBe(true);
  });

  it("coldCustomers < 20 → no CRM action", () => {
    const actions = buildActions({ ...CLEAN, crmFrio: 19 });
    expect(actions.some(a => a.source === "CRM")).toBe(false);
  });

  it("CRM action points to /crm", () => {
    const actions = buildActions({ ...CLEAN, crmFrio: 50 });
    const a = actions.find(x => x.source === "CRM");
    expect(a?.actionHref).toBe("/crm");
  });

  it("cold ratio ≥ 40% → CRITICAL crm health", () => {
    const h = buildHealth({ ...CLEAN, crmFrio: 40, crmTotal: 100 });
    expect(h.crm.status).toBe("CRITICAL");
  });

  it("cold ratio 25–39% → WARNING crm health", () => {
    const h = buildHealth({ ...CLEAN, crmFrio: 25, crmTotal: 100 });
    expect(h.crm.status).toBe("WARNING");
  });
});

// ─── E — review opportunities: always declared as limitation ──────────────────

describe("E — review opportunities limitation", () => {
  it("buildActions never produces a review action (no review model)", () => {
    const actions = buildActions({ ...CLEAN, crmTotal: 1000 });
    expect(actions.some(a => a.id.includes("review"))).toBe(false);
  });
});

// ─── F — clean state → no alerts, no actions ─────────────────────────────────

describe("F — clean restaurant state", () => {
  it("all-clean input → no alerts", () => {
    const alerts = buildAlerts(CLEAN);
    expect(alerts).toHaveLength(0);
  });

  it("all-clean input → no actions (cold < 20, recovery = 0, delayed = 0)", () => {
    const actions = buildActions(CLEAN);
    expect(actions).toHaveLength(0);
  });
});

// ─── G — missing 7-day data ───────────────────────────────────────────────────

describe("G — missing 7-day historical data", () => {
  it("hasSevenDayData=false → NO_DATA sales health", () => {
    const h = buildHealth({ ...CLEAN, hasSevenDayData: false });
    expect(h.sales.status).toBe("NO_DATA");
  });

  it("avg7DayRevenue=0 → NO_DATA sales health", () => {
    const h = buildHealth({ ...CLEAN, avg7DayRevenue: 0 });
    expect(h.sales.status).toBe("NO_DATA");
  });

  it("hasSevenDayData=false → no revenue-drop alert (cannot compare)", () => {
    const alerts = buildAlerts({ ...CLEAN, hasSevenDayData: false, todayRevenue: 10, todayOrders: 5 });
    expect(alerts.find(x => x.id === "revenue-below-baseline")).toBeUndefined();
  });

  it("crmTotal=0 → NO_DATA crm health", () => {
    const h = buildHealth({ ...CLEAN, crmFrio: 0, crmTotal: 0 });
    expect(h.crm.status).toBe("NO_DATA");
  });
});

// ─── H — no orders today ──────────────────────────────────────────────────────

describe("H — no orders today (friendly empty state)", () => {
  const noOrders: CockpitRawData = {
    ...CLEAN,
    todayRevenue:   0,
    todayOrders:    0,
    cancelledToday: 0,
  };

  it("no orders → no cancellation alert", () => {
    const alerts = buildAlerts(noOrders);
    expect(alerts.find(x => x.id === "high-cancellations")).toBeUndefined();
  });

  it("no orders → no revenue-drop alert (day hasn't started)", () => {
    const alerts = buildAlerts(noOrders);
    expect(alerts.find(x => x.id === "revenue-below-baseline")).toBeUndefined();
  });

  it("no orders → no delayed-orders alert if none active", () => {
    const alerts = buildAlerts({ ...noOrders, delayedOrders: 0 });
    expect(alerts.find(x => x.id === "delayed-orders")).toBeUndefined();
  });
});

// ─── I — pure and deterministic ───────────────────────────────────────────────

describe("I — pure and deterministic builders", () => {
  it("buildAlerts returns same result on identical input", () => {
    const a1 = buildAlerts(CLEAN);
    const a2 = buildAlerts(CLEAN);
    expect(a1).toEqual(a2);
  });

  it("buildActions returns same result on identical input", () => {
    const a1 = buildActions(CLEAN);
    const a2 = buildActions(CLEAN);
    expect(a1).toEqual(a2);
  });

  it("buildHealth returns same result on identical input", () => {
    const h1 = buildHealth(CLEAN);
    const h2 = buildHealth(CLEAN);
    expect(h1).toEqual(h2);
  });

  it("high-risk input: multiple simultaneous alerts are all returned", () => {
    const highRisk: CockpitRawData = {
      ...CLEAN,
      delayedOrders:   3,
      pendingPayments: 4,
      todayRevenue:    100,
      avg7DayRevenue:  900,
      todayOrders:     5,
    };
    const alerts = buildAlerts(highRisk);
    expect(alerts.length).toBeGreaterThanOrEqual(3);
  });
});

// ─── J — no side effects (input not mutated) ──────────────────────────────────

describe("J — no side effects", () => {
  it("buildAlerts does not mutate its input", () => {
    const input = { ...CLEAN };
    const before = JSON.stringify(input);
    buildAlerts(input);
    expect(JSON.stringify(input)).toBe(before);
  });

  it("buildActions does not mutate its input", () => {
    const input = { ...CLEAN };
    const before = JSON.stringify(input);
    buildActions(input);
    expect(JSON.stringify(input)).toBe(before);
  });

  it("buildHealth does not mutate its input", () => {
    const input = { ...CLEAN };
    const before = JSON.stringify(input);
    buildHealth(input);
    expect(JSON.stringify(input)).toBe(before);
  });
});
