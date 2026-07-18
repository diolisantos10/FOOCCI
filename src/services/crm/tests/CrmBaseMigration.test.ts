import { describe, it, expect, beforeEach, vi } from "vitest";

const db = vi.hoisted(() => ({
  customer:         { findMany: vi.fn() },
  order:            { groupBy: vi.fn() },
  crmBaseExclusion: { findMany: vi.fn() },
}));
vi.mock("@/lib/prisma", () => ({ prisma: db }));
// Fixed cutoffs so day math is deterministic: QUENTE ≤30, MORNO ≤60, FRIO <120, else PERDIDO.
vi.mock("@/lib/crm-segments", () => ({
  getSegmentConfig: vi.fn(async () => ({ hotMaxDays: 30, warmMaxDays: 60, lostMinDays: 120 })),
}));

import { CrmBaseMigrationService } from "../CrmBaseMigrationService";

const R = "rest_1";
const NOW = new Date("2026-07-18T12:00:00.000Z");
const daysAgo = (n: number) => new Date(NOW.getTime() - n * 86_400_000);

beforeEach(() => {
  vi.clearAllMocks();
  db.order.groupBy.mockResolvedValue([]);
  db.crmBaseExclusion.findMany.mockResolvedValue([]);
});

describe("CrmBaseMigrationService — base movement reconstruction", () => {
  it("detects a QUENTE→MORNO drop caused purely by time (no new order)", async () => {
    // Ordered 33 days ago: now MORNO (33 > 30). 7 days ago it was 26 days → QUENTE.
    db.customer.findMany.mockResolvedValue([
      { id: "c1", lastOrderAt: daysAgo(33), importedLastOrderAt: null },
    ]);
    const res = await CrmBaseMigrationService.getMigration(R, { days: 7, now: NOW });

    const t = res.transitions.find((x) => x.from === "QUENTE" && x.to === "MORNO");
    expect(t?.count).toBe(1);
    expect(res.flows.find((f) => f.segment === "MORNO")?.movedIn).toBe(1);
    expect(res.flows.find((f) => f.segment === "QUENTE")?.movedOut).toBe(1);
    expect(res.reactivations).toBe(0);
  });

  it("counts a reactivation using the pre-window order as the FROM base", async () => {
    // Ordered 2 days ago (now QUENTE). Previous order was 80 days ago → at ref (7d ago)
    // that was 73 days → FRIO. So FRIO→QUENTE reactivation.
    db.customer.findMany.mockResolvedValue([
      { id: "c2", lastOrderAt: daysAgo(2), importedLastOrderAt: null },
    ]);
    db.order.groupBy.mockResolvedValue([
      { customerId: "c2", _max: { createdAt: daysAgo(80) } },
    ]);
    const res = await CrmBaseMigrationService.getMigration(R, { days: 7, now: NOW });

    const t = res.transitions.find((x) => x.from === "FRIO" && x.to === "QUENTE");
    expect(t?.count).toBe(1);
    expect(res.reactivations).toBe(1);
  });

  it("treats a first-ever order in the window as a new active (SEM_PEDIDOS→QUENTE)", async () => {
    // Ordered 3 days ago, no prior order, no imported history → brand new.
    db.customer.findMany.mockResolvedValue([
      { id: "c3", lastOrderAt: daysAgo(3), importedLastOrderAt: null },
    ]);
    db.order.groupBy.mockResolvedValue([]); // no order on/before ref
    const res = await CrmBaseMigrationService.getMigration(R, { days: 7, now: NOW });

    expect(res.newActive).toBe(1);
    expect(res.transitions.find((x) => x.from === "SEM_PEDIDOS" && x.to === "QUENTE")?.count).toBe(1);
  });

  it("keeps a stable customer on the diagonal (no transition)", async () => {
    // Ordered 20 days ago (before the window): QUENTE now (20d) and QUENTE at ref (13d).
    db.customer.findMany.mockResolvedValue([
      { id: "c4", lastOrderAt: daysAgo(20), importedLastOrderAt: null },
    ]);
    const res = await CrmBaseMigrationService.getMigration(R, { days: 7, now: NOW });
    expect(res.transitions).toHaveLength(0);
    expect(res.flows.find((f) => f.segment === "QUENTE")?.after).toBe(1);
  });

  it("aggregates exclusions from the log by reason and prior segment", async () => {
    db.customer.findMany.mockResolvedValue([]);
    db.crmBaseExclusion.findMany.mockResolvedValue([
      { reason: "INVALID_PHONE_DELETED", priorSegment: "PERDIDO" },
      { reason: "INVALID_PHONE_DELETED", priorSegment: "FRIO" },
      { reason: "RETIRED_NO_CONTACT",    priorSegment: "FRIO" },
    ]);
    const res = await CrmBaseMigrationService.getMigration(R, { days: 7, now: NOW });

    expect(res.exclusions.invalidPhoneDeleted).toBe(2);
    expect(res.exclusions.retiredNoContact).toBe(1);
    expect(res.exclusions.total).toBe(3);
    expect(res.exclusions.byPriorSegment).toEqual({ PERDIDO: 1, FRIO: 2 });
  });
});
