import { describe, it, expect, beforeEach, vi } from "vitest";

// Focused regression test for the critical bug: the "recuperar-perdidos" campaign
// had no segment mapping / case, so it fell through to default:TODOS and blasted the
// WHOLE base with a coupon. It must resolve to the PERDIDO segment (effective last
// order older than lostMinDays), matching the preview.

const db = vi.hoisted(() => ({
  customer: { findMany: vi.fn(async () => []) },
}));
vi.mock("@/lib/prisma", () => ({ prisma: db }));

const LOST_CUTOFF = new Date("2025-01-01T00:00:00.000Z");
const HOT_CUTOFF  = new Date("2025-06-01T00:00:00.000Z");
const WARM_CUTOFF = new Date("2025-04-01T00:00:00.000Z");
vi.mock("@/lib/crm-segments", () => ({
  getSegmentConfig: vi.fn(async () => ({ hotMaxDays: 30, warmMaxDays: 60, lostMinDays: 120 })),
  buildCutoffs: vi.fn(() => ({ hotCutoff: HOT_CUTOFF, warmCutoff: WARM_CUTOFF, lostCutoff: LOST_CUTOFF })),
}));

import { resolveAudience } from "../CrmCampaignService";

const R = "rest_1";

beforeEach(() => {
  vi.clearAllMocks();
  db.customer.findMany.mockResolvedValue([]);
});

describe("resolveAudience — recuperar-perdidos maps to PERDIDO (not TODOS)", () => {
  it("filters by effective last order older than lostCutoff", async () => {
    await resolveAudience(R, "recuperar-perdidos");
    expect(db.customer.findMany).toHaveBeenCalledTimes(1);
    const where = db.customer.findMany.mock.calls[0][0].where;
    // The lost filter: lastOrderAt < lostCutoff (OR imported fallback) — NOT the
    // unfiltered TODOS query (which has no lastOrderAt condition).
    expect(where.OR).toEqual([
      { lastOrderAt: { lt: LOST_CUTOFF } },
      { lastOrderAt: null, importedLastOrderAt: { lt: LOST_CUTOFF } },
    ]);
  });

  it("the PERDIDO segment key also routes correctly", async () => {
    await resolveAudience(R, "PERDIDO");
    const where = db.customer.findMany.mock.calls[0][0].where;
    expect(where.OR?.[0]).toEqual({ lastOrderAt: { lt: LOST_CUTOFF } });
  });

  it("differs from TODOS, which applies no recency filter", async () => {
    await resolveAudience(R, "algum-segmento-inexistente");
    const where = db.customer.findMany.mock.calls[0][0].where;
    expect(where.OR).toBeUndefined(); // default:TODOS → no lastOrderAt cutoff
  });
});
