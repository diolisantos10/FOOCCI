import { describe, it, expect, beforeEach, vi } from "vitest";

const db = vi.hoisted(() => ({
  tierSettings: { findUnique: vi.fn(), upsert: vi.fn() },
  customer:     { findMany: vi.fn(), update: vi.fn(async () => ({})) },
  order:        { groupBy: vi.fn() },
  tierBenefit:  { findFirst: vi.fn(), update: vi.fn(async () => ({})) },
  $executeRaw:  vi.fn(),
}));
vi.mock("@/lib/prisma", () => ({ prisma: db }));

import { RelationshipProgramService, DEFAULT_SETTINGS } from "../RelationshipProgramService";

const R = "rest_1";
const settingsRow = (over: Partial<Record<string, unknown>> = {}) => ({
  programEnabled: true, classificationWindowMonths: 0,
  silverMinSpend: 300, silverMinOrders: 0,
  goldMinSpend: 800, goldMinOrders: 0,
  diamondMinSpend: 2000, diamondMinOrders: 0,
  ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
  db.order.groupBy.mockResolvedValue([]);
});

describe("recalculateTiers — rolling classification window", () => {
  it("vitalício (window 0) uses the customer's lifetime totalSpend", async () => {
    db.tierSettings.findUnique.mockResolvedValue(settingsRow({ classificationWindowMonths: 0 }));
    db.customer.findMany.mockResolvedValue([
      { id: "c1", tier: "BRONZE", totalSpend: 900, totalOrders: 5, importedTotalSpent: null, importedOrderCount: null },
    ]);
    await RelationshipProgramService.recalculateTiers(R);
    // 900 ≥ goldMinSpend(800) → OURO. groupBy not consulted for window 0.
    expect(db.order.groupBy).not.toHaveBeenCalled();
    expect(db.customer.update.mock.calls[0][0].data.tier).toBe("OURO");
  });

  it("windowed (6m) classifies by ONLY the sales inside the window", async () => {
    db.tierSettings.findUnique.mockResolvedValue(settingsRow({ classificationWindowMonths: 6 }));
    db.customer.findMany.mockResolvedValue([
      // Lifetime 5000 (would be DIAMANTE), but only 350 in the last 6 months → PRATA.
      { id: "c1", tier: "DIAMANTE", totalSpend: 5000, totalOrders: 40, importedTotalSpent: null, importedOrderCount: null },
    ]);
    db.order.groupBy.mockResolvedValue([{ customerId: "c1", _sum: { total: 350 }, _count: { _all: 3 } }]);

    await RelationshipProgramService.recalculateTiers(R);

    expect(db.order.groupBy).toHaveBeenCalled();
    expect(db.customer.update.mock.calls[0][0].data.tier).toBe("PRATA"); // 350 ≥ 300, < 800
  });

  it("windowed: a customer with no sales in the window drops to BRONZE", async () => {
    db.tierSettings.findUnique.mockResolvedValue(settingsRow({ classificationWindowMonths: 3 }));
    db.customer.findMany.mockResolvedValue([
      { id: "c2", tier: "OURO", totalSpend: 3000, totalOrders: 20, importedTotalSpent: null, importedOrderCount: null },
    ]);
    db.order.groupBy.mockResolvedValue([]); // nothing recent
    await RelationshipProgramService.recalculateTiers(R);
    expect(db.customer.update.mock.calls[0][0].data.tier).toBe("BRONZE");
  });
});

describe("registerGiftDelivery — physical stock guard", () => {
  // The increment is now a single atomic UPDATE (LEAST/COALESCE caps at stockTotal
  // in SQL) — so these assert the wrapper: the raw statement runs and the returned
  // counters come from the post-update row.
  it("runs the atomic update and returns the new counters", async () => {
    db.$executeRaw.mockResolvedValue(1);
    db.tierBenefit.findFirst.mockResolvedValue({ stockTotal: 10, stockUsed: 7 });
    const r = await RelationshipProgramService.registerGiftDelivery("b1", R, 3);
    expect(db.$executeRaw).toHaveBeenCalled();
    expect(r.ok).toBe(true);
    expect(r.ok && r.stockUsed).toBe(7);
  });

  it("reflects the stockTotal cap enforced by the DB", async () => {
    db.$executeRaw.mockResolvedValue(1);
    db.tierBenefit.findFirst.mockResolvedValue({ stockTotal: 5, stockUsed: 5 });
    const r = await RelationshipProgramService.registerGiftDelivery("b1", R, 10);
    expect(r.ok).toBe(true);
    expect(r.ok && r.stockUsed).toBe(5);
  });

  it("returns an error when the gift doesn't exist (0 rows updated)", async () => {
    db.$executeRaw.mockResolvedValue(0);
    const r = await RelationshipProgramService.registerGiftDelivery("nope", R);
    expect(r.ok).toBe(false);
    expect(db.tierBenefit.findFirst).not.toHaveBeenCalled();
  });
});

describe("DEFAULT_SETTINGS", () => {
  it("ships the program OFF and vitalício by default", () => {
    expect(DEFAULT_SETTINGS.programEnabled).toBe(false);
    expect(DEFAULT_SETTINGS.classificationWindowMonths).toBe(0);
  });
});
