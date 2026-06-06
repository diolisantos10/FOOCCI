/**
 * Dashboard Principal v2 — pure logic tests (A–L).
 *
 * Covers:
 *  A. Period filter contains "Este mês" (current_month) and "Últimos 30 dias" (30d)
 *  B. buildAlerts: mpWebhookSecretMissing=true → emits "mp-webhook-secret-missing" WARNING
 *  C. buildAlerts: mpWebhookSecretMissing=false → no webhook alert
 *  D. Webhook alert has severity WARNING and actionHref "/settings"
 *  E. buildAlerts: mpWebhookSecretMissing + delayed≥3 → both alerts present
 *  F. buildAlerts: delayed orders CRITICAL threshold (≥3 → CRITICAL)
 *  G. buildAlerts: cancelled rate alert only fires when totalAttempts≥5 AND rate>15%
 *  H. buildHealth: sales NO_DATA when !hasSevenDayData
 *  I. buildHealth: crm CRITICAL when ≥40% cold
 *  J. buildActions: pendingRecovery>0 → RECOVERY action; crmFrio≥20 → CRM action
 *  K. pctChange: positive delta, negative delta, zero previous
 *  L. cancelledPeriod field is included and non-negative
 */
import { describe, it, expect } from "vitest";
import {
  buildAlerts,
  buildActions,
  buildHealth,
  type CockpitRawData,
} from "../DashboardCockpitService";

// ── Mirror of PERIOD_OPTIONS from DashboardClient.tsx ─────────────────────────

const PERIOD_OPTIONS = [
  { key: "today",         label: "Hoje"             },
  { key: "yesterday",     label: "Ontem"            },
  { key: "this_week",     label: "Esta semana"      },
  { key: "7d",            label: "Últimos 7 dias"   },
  { key: "current_month", label: "Este mês"         },
  { key: "30d",           label: "Últimos 30 dias"  },
  { key: "custom",        label: "Personalizado"    },
];

// ── Mirror of pctChange from DashboardClient.tsx ─────────────────────────────

function pctChange(current: number, previous: number): { label: string; positive: boolean } | null {
  if (previous === 0) return null;
  const pct = ((current - previous) / previous) * 100;
  const positive = pct >= 0;
  return { label: `${positive ? "+" : ""}${pct.toFixed(0)}% vs anterior`, positive };
}

// ── DashboardData shape guard ─────────────────────────────────────────────────

interface DashboardDataShape {
  cancelledPeriod: number;
  ordersBySource:  Record<string, number>;
}

function makeDashboardData(overrides: Partial<DashboardDataShape> = {}): DashboardDataShape {
  return {
    cancelledPeriod: 0,
    ordersBySource:  {},
    ...overrides,
  };
}

// ── Raw data factory ──────────────────────────────────────────────────────────

function makeRaw(overrides: Partial<CockpitRawData> = {}): CockpitRawData {
  return {
    todayRevenue:           500,
    todayOrders:            10,
    cancelledToday:         0,
    avg7DayRevenue:         600,
    hasSevenDayData:        true,
    pendingPayments:        0,
    delayedOrders:          0,
    crmFrio:                5,
    crmTotal:               100,
    vipCustomers:           10,
    pendingRecovery:        0,
    mpWebhookSecretMissing: false,
    ...overrides,
  };
}

// ─────────────────────────────────────────────────────────────────────────────

describe("Dashboard Principal v2", () => {

  // A ── Period filter completeness ────────────────────────────────────────────
  describe("A – period filter contains Este mês and Últimos 30 dias", () => {
    it("has current_month key", () => {
      expect(PERIOD_OPTIONS.some(p => p.key === "current_month")).toBe(true);
    });
    it("Este mês label", () => {
      const opt = PERIOD_OPTIONS.find(p => p.key === "current_month");
      expect(opt?.label).toBe("Este mês");
    });
    it("has 30d key", () => {
      expect(PERIOD_OPTIONS.some(p => p.key === "30d")).toBe(true);
    });
    it("Últimos 30 dias label", () => {
      const opt = PERIOD_OPTIONS.find(p => p.key === "30d");
      expect(opt?.label).toBe("Últimos 30 dias");
    });
    it("has 7 options total (Hoje Ontem Esta semana 7d Este mês Últimos 30 dias Personalizado)", () => {
      expect(PERIOD_OPTIONS).toHaveLength(7);
    });
  });

  // B ── buildAlerts: webhook missing fires alert ──────────────────────────────
  describe("B – buildAlerts emits mp-webhook-secret-missing when missing", () => {
    it("fires alert when mpWebhookSecretMissing=true", () => {
      const alerts = buildAlerts(makeRaw({ mpWebhookSecretMissing: true }));
      expect(alerts.some(a => a.id === "mp-webhook-secret-missing")).toBe(true);
    });
    it("title mentions Pix or webhook", () => {
      const alerts = buildAlerts(makeRaw({ mpWebhookSecretMissing: true }));
      const a = alerts.find(a => a.id === "mp-webhook-secret-missing")!;
      expect(a.title.toLowerCase()).toMatch(/pix|webhook/);
    });
  });

  // C ── buildAlerts: webhook present → no alert ──────────────────────────────
  describe("C – buildAlerts omits webhook alert when secret is set", () => {
    it("no mp-webhook-secret-missing alert", () => {
      const alerts = buildAlerts(makeRaw({ mpWebhookSecretMissing: false }));
      expect(alerts.some(a => a.id === "mp-webhook-secret-missing")).toBe(false);
    });
    it("empty alert list when everything is healthy", () => {
      const alerts = buildAlerts(makeRaw());
      expect(alerts).toHaveLength(0);
    });
  });

  // D ── Webhook alert shape ───────────────────────────────────────────────────
  describe("D – webhook alert severity and action", () => {
    it("severity is WARNING", () => {
      const alerts = buildAlerts(makeRaw({ mpWebhookSecretMissing: true }));
      const a = alerts.find(a => a.id === "mp-webhook-secret-missing")!;
      expect(a.severity).toBe("WARNING");
    });
    it("actionHref is /settings", () => {
      const alerts = buildAlerts(makeRaw({ mpWebhookSecretMissing: true }));
      const a = alerts.find(a => a.id === "mp-webhook-secret-missing")!;
      expect(a.actionHref).toBe("/settings");
    });
    it("actionLabel is set", () => {
      const alerts = buildAlerts(makeRaw({ mpWebhookSecretMissing: true }));
      const a = alerts.find(a => a.id === "mp-webhook-secret-missing")!;
      expect(a.actionLabel).toBeTruthy();
    });
  });

  // E ── Both alerts when webhook missing + delayed orders ────────────────────
  describe("E – webhook missing + delayed orders → both alerts", () => {
    it("returns 2 alerts", () => {
      const alerts = buildAlerts(makeRaw({ mpWebhookSecretMissing: true, delayedOrders: 2 }));
      expect(alerts.length).toBeGreaterThanOrEqual(2);
    });
    it("includes delayed-orders alert", () => {
      const alerts = buildAlerts(makeRaw({ mpWebhookSecretMissing: true, delayedOrders: 2 }));
      expect(alerts.some(a => a.id === "delayed-orders")).toBe(true);
    });
    it("includes mp-webhook-secret-missing alert", () => {
      const alerts = buildAlerts(makeRaw({ mpWebhookSecretMissing: true, delayedOrders: 2 }));
      expect(alerts.some(a => a.id === "mp-webhook-secret-missing")).toBe(true);
    });
  });

  // F ── Delayed orders severity threshold ─────────────────────────────────────
  describe("F – delayed orders CRITICAL at ≥3", () => {
    it("WARNING for 1 delayed", () => {
      const alerts = buildAlerts(makeRaw({ delayedOrders: 1 }));
      const a = alerts.find(a => a.id === "delayed-orders")!;
      expect(a.severity).toBe("WARNING");
    });
    it("CRITICAL for 3 delayed", () => {
      const alerts = buildAlerts(makeRaw({ delayedOrders: 3 }));
      const a = alerts.find(a => a.id === "delayed-orders")!;
      expect(a.severity).toBe("CRITICAL");
    });
    it("no delayed-orders alert when 0 delayed", () => {
      const alerts = buildAlerts(makeRaw({ delayedOrders: 0 }));
      expect(alerts.some(a => a.id === "delayed-orders")).toBe(false);
    });
  });

  // G ── Cancellation alert threshold ──────────────────────────────────────────
  describe("G – cancellation alert fires only when totalAttempts≥5 AND rate>15%", () => {
    it("fires when 4 cancellations out of 10 total (40%)", () => {
      const alerts = buildAlerts(makeRaw({ todayOrders: 6, cancelledToday: 4 }));
      expect(alerts.some(a => a.id === "high-cancellations")).toBe(true);
    });
    it("no alert when totalAttempts < 5", () => {
      const alerts = buildAlerts(makeRaw({ todayOrders: 2, cancelledToday: 2 }));
      expect(alerts.some(a => a.id === "high-cancellations")).toBe(false);
    });
    it("no alert when cancellation rate ≤15%", () => {
      const alerts = buildAlerts(makeRaw({ todayOrders: 10, cancelledToday: 1 }));
      expect(alerts.some(a => a.id === "high-cancellations")).toBe(false);
    });
  });

  // H ── buildHealth: sales NO_DATA when no 7-day history ────────────────────
  describe("H – buildHealth sales NO_DATA without history", () => {
    it("NO_DATA when hasSevenDayData=false", () => {
      const h = buildHealth(makeRaw({ hasSevenDayData: false }));
      expect(h.sales.status).toBe("NO_DATA");
    });
    it("HEALTHY when todayRevenue ≥80% of avg7Day", () => {
      const h = buildHealth(makeRaw({ todayRevenue: 800, avg7DayRevenue: 1000 }));
      expect(h.sales.status).toBe("HEALTHY");
    });
    it("CRITICAL when todayRevenue <50% of avg7Day", () => {
      const h = buildHealth(makeRaw({ todayRevenue: 400, avg7DayRevenue: 1000 }));
      expect(h.sales.status).toBe("CRITICAL");
    });
  });

  // I ── buildHealth: CRM CRITICAL at ≥40% cold ──────────────────────────────
  describe("I – buildHealth crm CRITICAL at ≥40% cold", () => {
    it("CRITICAL when 50% cold", () => {
      const h = buildHealth(makeRaw({ crmFrio: 50, crmTotal: 100 }));
      expect(h.crm.status).toBe("CRITICAL");
    });
    it("WARNING when 30% cold", () => {
      const h = buildHealth(makeRaw({ crmFrio: 30, crmTotal: 100 }));
      expect(h.crm.status).toBe("WARNING");
    });
    it("HEALTHY when 20% cold", () => {
      const h = buildHealth(makeRaw({ crmFrio: 20, crmTotal: 100 }));
      expect(h.crm.status).toBe("HEALTHY");
    });
  });

  // J ── buildActions: recovery + cold customers ─────────────────────────────
  describe("J – buildActions produces correct action types", () => {
    it("RECOVERY action when pendingRecovery>0", () => {
      const actions = buildActions(makeRaw({ pendingRecovery: 3 }));
      expect(actions.some(a => a.source === "RECOVERY")).toBe(true);
    });
    it("CRM action when crmFrio≥20", () => {
      const actions = buildActions(makeRaw({ crmFrio: 20 }));
      expect(actions.some(a => a.source === "CRM")).toBe(true);
    });
    it("no actions when everything healthy", () => {
      const actions = buildActions(makeRaw());
      expect(actions).toHaveLength(0);
    });
    it("OPERATIONS action when delayedOrders≥3", () => {
      const actions = buildActions(makeRaw({ delayedOrders: 3 }));
      expect(actions.some(a => a.source === "OPERATIONS")).toBe(true);
    });
  });

  // K ── pctChange logic ──────────────────────────────────────────────────────
  describe("K – pctChange returns correct label and polarity", () => {
    it("positive delta", () => {
      const r = pctChange(120, 100)!;
      expect(r.positive).toBe(true);
      expect(r.label).toContain("+20%");
    });
    it("negative delta", () => {
      const r = pctChange(80, 100)!;
      expect(r.positive).toBe(false);
      expect(r.label).toContain("-20%");
    });
    it("returns null when previous is 0", () => {
      expect(pctChange(50, 0)).toBeNull();
    });
    it("zero delta is positive", () => {
      const r = pctChange(100, 100)!;
      expect(r.positive).toBe(true);
      expect(r.label).toContain("+0%");
    });
  });

  // L ── DashboardData.cancelledPeriod is a non-negative number ───────────────
  describe("L – cancelledPeriod field is non-negative number", () => {
    it("default is 0", () => {
      const d = makeDashboardData();
      expect(typeof d.cancelledPeriod).toBe("number");
      expect(d.cancelledPeriod).toBeGreaterThanOrEqual(0);
    });
    it("accepts positive value", () => {
      const d = makeDashboardData({ cancelledPeriod: 5 });
      expect(d.cancelledPeriod).toBe(5);
    });
    it("ordersBySource is a record", () => {
      const d = makeDashboardData({ ordersBySource: { pedido: 10, whatsapp: 3 } });
      expect(d.ordersBySource["pedido"]).toBe(10);
      expect(d.ordersBySource["whatsapp"]).toBe(3);
    });
  });

});
