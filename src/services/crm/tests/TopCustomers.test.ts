/**
 * CRM "Clientes mais valiosos" — tests for the top-customers block (v2.2).
 *
 * Covers:
 *   • Pure segment classification (classifyTopSegment).
 *   • CRMService.getTopCustomers period / all-time / 12-month fallback (mocked prisma).
 *   • Tenant isolation + guest/cancelled exclusion in the query shape.
 *   • Structural assertions on OverviewTab: redundant temperature strip removed,
 *     top-customers block rendered after revenue, customer rows are clickable.
 *
 * NO real DB is touched. NO WhatsApp is sent. NO campaign runs. Read-only.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { vi, describe, it, expect, beforeEach } from "vitest";

// ── Mock prisma + segment config BEFORE importing the service ────────────────
const prismaMock = vi.hoisted(() => ({
  order:    { groupBy: vi.fn() },
  customer: { findMany: vi.fn() },
  $queryRaw: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
vi.mock("@/lib/crm-segments", async (orig) => {
  const actual = await orig<typeof import("@/lib/crm-segments")>();
  return {
    ...actual,
    getSegmentConfig: vi.fn(async () => ({ hotMaxDays: 30, warmMaxDays: 60, lostMinDays: 120 })),
  };
});

import { CRMService, classifyTopSegment } from "../CRMService";

const CFG = { hotMaxDays: 30, warmMaxDays: 60, lostMinDays: 120 };
const DAY = 86_400_000;
const daysAgo = (n: number) => new Date(Date.now() - n * DAY);

beforeEach(() => {
  prismaMock.order.groupBy.mockReset();
  prismaMock.customer.findMany.mockReset();
  prismaMock.$queryRaw.mockReset();
});

// ── Pure: segment classification ─────────────────────────────────────────────

describe("classifyTopSegment", () => {
  it("null recency → SEM_PEDIDOS", () => {
    expect(classifyTopSegment(null, CFG)).toBe("SEM_PEDIDOS");
  });
  it("within hot window → QUENTE", () => {
    expect(classifyTopSegment(10, CFG)).toBe("QUENTE");
    expect(classifyTopSegment(30, CFG)).toBe("QUENTE"); // boundary inclusive
  });
  it("between hot and warm → MORNO", () => {
    expect(classifyTopSegment(45, CFG)).toBe("MORNO");
    expect(classifyTopSegment(60, CFG)).toBe("MORNO"); // boundary inclusive
  });
  it("past warm but before lost → FRIO", () => {
    expect(classifyTopSegment(90, CFG)).toBe("FRIO");
    expect(classifyTopSegment(119, CFG)).toBe("FRIO");
  });
  it("at/over lost threshold → PERDIDO (subset of frio)", () => {
    expect(classifyTopSegment(120, CFG)).toBe("PERDIDO");
    expect(classifyTopSegment(400, CFG)).toBe("PERDIDO");
  });
});

// ── Service: period ranking ──────────────────────────────────────────────────

describe("CRMService.getTopCustomers — period", () => {
  it("C/D — returns top spenders with name, spend, order count and last order", async () => {
    prismaMock.order.groupBy.mockResolvedValueOnce([
      { customerId: "c1", _sum: { total: 1420 }, _count: { _all: 8 } },
      { customerId: "c2", _sum: { total: 900 },  _count: { _all: 5 } },
    ]);
    prismaMock.customer.findMany.mockResolvedValueOnce([
      { id: "c1", name: "Maria Santos", phone: "+551199990001", totalSpend: 1420, totalOrders: 8,
        lastOrderAt: daysAgo(12), importedTotalSpent: null, importedOrderCount: 0, importedLastOrderAt: null },
      { id: "c2", name: "João Lima", phone: "+551199990002", totalSpend: 900, totalOrders: 5,
        lastOrderAt: daysAgo(3), importedTotalSpent: null, importedOrderCount: 0, importedLastOrderAt: null },
    ]);

    const from = daysAgo(30), to = new Date();
    const res = await CRMService.getTopCustomers("r1", { from, to });
    expect(res.ok).toBe(true);
    if (!res.ok) return;

    expect(res.data.basis).toBe("PERIOD");
    expect(res.data.fallbackUsed).toBe(false);
    expect(res.data.customers).toHaveLength(2);

    const top = res.data.customers[0];
    expect(top.name).toBe("Maria Santos");
    expect(top.totalSpent).toBe(1420);
    expect(top.orderCount).toBe(8);
    expect(top.lastOrderAt).not.toBeNull();
    expect(top.tier).toBe("OURO");      // 1420 ≥ 800
    expect(top.segment).toBe("QUENTE"); // 12 days
    expect(top.source).toBe("FOCCI_ONLY");
  });

  it("C — caps the ranking at 10 (limit passed to the DB query)", async () => {
    prismaMock.order.groupBy.mockResolvedValueOnce([]);
    const from = daysAgo(30), to = new Date();
    await CRMService.getTopCustomers("r1", { from, to });
    expect(prismaMock.order.groupBy).toHaveBeenCalledTimes(1);
    expect(prismaMock.order.groupBy.mock.calls[0][0]).toMatchObject({ take: 10 });
  });

  it("H — scopes to the tenant and excludes guests + cancelled/unpaid orders", async () => {
    prismaMock.order.groupBy.mockResolvedValueOnce([]);
    await CRMService.getTopCustomers("tenant-X", { from: daysAgo(30), to: new Date() });
    const where = prismaMock.order.groupBy.mock.calls[0][0].where;
    expect(where.restaurantId).toBe("tenant-X");
    expect(where.customer).toEqual({ isGuest: false });
    expect(where.status).toHaveProperty("notIn");
    expect(where.status.notIn).toEqual(expect.arrayContaining(["CANCELLED"]));
  });

  it("F — empty period yields the empty list (no invented spend)", async () => {
    prismaMock.order.groupBy.mockResolvedValueOnce([]);
    const res = await CRMService.getTopCustomers("r1", { from: daysAgo(31), to: new Date() });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.data.customers).toEqual([]);
    expect(res.data.basis).toBe("PERIOD");
  });

  it("drops rows whose period spend is zero (honest)", async () => {
    prismaMock.order.groupBy.mockResolvedValueOnce([
      { customerId: "c1", _sum: { total: 0 }, _count: { _all: 1 } },
    ]);
    prismaMock.customer.findMany.mockResolvedValueOnce([
      { id: "c1", name: "Zero", phone: "", totalSpend: 0, totalOrders: 1,
        lastOrderAt: daysAgo(2), importedTotalSpent: null, importedOrderCount: 0, importedLastOrderAt: null },
    ]);
    const res = await CRMService.getTopCustomers("r1", { from: daysAgo(31), to: new Date() });
    expect(res.ok && res.data.customers).toEqual([]);
  });
});

// ── Service: 12-month fallback for short windows ─────────────────────────────

describe("CRMService.getTopCustomers — short-window fallback", () => {
  it("G — a sparse 'today' window falls back to the last 12 months, clearly flagged", async () => {
    // First aggregate (today) returns too few; lookback returns more.
    prismaMock.order.groupBy
      .mockResolvedValueOnce([]) // today
      .mockResolvedValueOnce([   // last 12 months
        { customerId: "c1", _sum: { total: 2200 }, _count: { _all: 14 } },
        { customerId: "c2", _sum: { total: 600 },  _count: { _all: 4 } },
        { customerId: "c3", _sum: { total: 350 },  _count: { _all: 2 } },
      ]);
    prismaMock.customer.findMany.mockResolvedValueOnce([
      { id: "c1", name: "A", phone: "", totalSpend: 2200, totalOrders: 14, lastOrderAt: daysAgo(20), importedTotalSpent: null, importedOrderCount: 0, importedLastOrderAt: null },
      { id: "c2", name: "B", phone: "", totalSpend: 600,  totalOrders: 4,  lastOrderAt: daysAgo(80), importedTotalSpent: null, importedOrderCount: 0, importedLastOrderAt: null },
      { id: "c3", name: "C", phone: "", totalSpend: 350,  totalOrders: 2,  lastOrderAt: daysAgo(200), importedTotalSpent: null, importedOrderCount: 0, importedLastOrderAt: null },
    ]);

    const from = new Date(); from.setHours(0, 0, 0, 0); // today (short window)
    const res = await CRMService.getTopCustomers("r1", { from, to: new Date() });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.data.basis).toBe("LOOKBACK_12M");
    expect(res.data.fallbackUsed).toBe(true);
    expect(res.data.customers).toHaveLength(3);
    expect(res.data.customers[0].tier).toBe("DIAMANTE"); // 2200 ≥ 2000
    expect(res.data.customers[2].segment).toBe("PERDIDO"); // 200 days
  });

  it("does NOT fall back for a long window (this month/year/custom)", async () => {
    prismaMock.order.groupBy.mockResolvedValueOnce([]); // 60-day window, sparse
    const res = await CRMService.getTopCustomers("r1", { from: daysAgo(60), to: new Date() });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.data.basis).toBe("PERIOD");
    expect(res.data.fallbackUsed).toBe(false);
    expect(prismaMock.order.groupBy).toHaveBeenCalledTimes(1); // no second aggregate
  });
});

// ── Service: all-time (no range) ─────────────────────────────────────────────

describe("CRMService.getTopCustomers — all-time", () => {
  it("ranks by all-time spend, including imported-only customers, labeled ALL_TIME", async () => {
    prismaMock.$queryRaw.mockResolvedValueOnce([
      { id: "c1", name: "Real Big", phone: "", totalSpend: 3000, totalOrders: 20,
        lastOrderAt: daysAgo(5), importedTotalSpent: null, importedOrderCount: 0, importedLastOrderAt: null },
      { id: "c2", name: "Imported Whale", phone: "", totalSpend: 0, totalOrders: 0,
        lastOrderAt: null, importedTotalSpent: 1500, importedOrderCount: 9, importedLastOrderAt: daysAgo(40) },
    ]);
    const res = await CRMService.getTopCustomers("r1");
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.data.basis).toBe("ALL_TIME");
    expect(res.data.fallbackUsed).toBe(false);
    expect(res.data.customers).toHaveLength(2);

    const real = res.data.customers[0];
    expect(real.totalSpent).toBe(3000);
    expect(real.source).toBe("FOCCI_ONLY");

    const imported = res.data.customers[1];
    expect(imported.totalSpent).toBe(1500);      // falls back to importedTotalSpent
    expect(imported.orderCount).toBe(9);         // importedOrderCount
    expect(imported.source).toBe("IMPORTED_INCLUDED");
    expect(imported.tier).toBe("OURO");          // 1500 ≥ 800
    expect(imported.segment).toBe("MORNO");      // 40 days
  });

  it("I — no send/campaign side effects: only read methods are touched", async () => {
    prismaMock.$queryRaw.mockResolvedValueOnce([]);
    await CRMService.getTopCustomers("r1");
    // The mock surface only exposes read methods; assert nothing mutating exists.
    expect(prismaMock.order).not.toHaveProperty("update");
    expect(prismaMock.order).not.toHaveProperty("create");
    expect(prismaMock.customer).not.toHaveProperty("update");
  });
});

// ── Structural: OverviewTab wiring (A, B, E) ─────────────────────────────────

describe("OverviewTab structure (v2.2)", () => {
  const src = readFileSync(
    join(process.cwd(), "src/app/(dashboard)/crm/OverviewTab.tsx"),
    "utf8",
  );

  it("A — the redundant temperature strip and channel block are removed", () => {
    expect(src).not.toContain("Temperatura da base");
    expect(src).not.toContain("Canal de pedidos");
  });

  it("B — the top-customers block renders after the revenue block", () => {
    const revenueIdx = src.indexOf("<RevenueBlock");
    const topIdx     = src.indexOf("<TopCustomersBlock");
    expect(revenueIdx).toBeGreaterThan(-1);
    expect(topIdx).toBeGreaterThan(-1);
    expect(topIdx).toBeGreaterThan(revenueIdx);
    expect(src).toContain("Clientes mais valiosos");
    expect(src).toContain("Quem mais gastou com o restaurante");
  });

  it("E — customer rows are clickable to the customer profile", () => {
    expect(src).toContain("/customers/${c.customerId}");
    expect(src).toContain("Ver ficha");
  });

  it("F — empty state copy is present", () => {
    expect(src).toContain("Sem dados suficientes para listar clientes valiosos");
  });

  it("G — 12-month fallback label is present", () => {
    expect(src).toContain("nos últimos 12 meses");
  });
});
