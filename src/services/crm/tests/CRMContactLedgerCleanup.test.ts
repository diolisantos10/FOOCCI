import { describe, it, expect, beforeEach, vi } from "vitest";

const db = vi.hoisted(() => ({
  cRMContactLedger: {
    groupBy: vi.fn(),
    deleteMany: vi.fn(),
    updateMany: vi.fn(),
  },
}));
vi.mock("@/lib/prisma", () => ({ prisma: db }));

import { cleanupBackfilledLedger } from "../CRMContactLedgerCleanupService";

const COLD = "cmq1r7i1b00o2s6xju850qkp5";

beforeEach(() => {
  vi.clearAllMocks();
  // groupBy is called twice: (1) by campaignId over all backfill rows,
  // (2) by campaignFamilyKey over the kept campaign's rows.
  db.cRMContactLedger.groupBy
    .mockResolvedValueOnce([
      { campaignId: COLD, _count: { id: 9 } },
      { campaignId: "other-1", _count: { id: 61 } },
      { campaignId: "other-2", _count: { id: 180 } },
    ])
    .mockResolvedValueOnce([{ campaignFamilyKey: "recuperar-clientes-frios", _count: { id: 9 } }]);
  db.cRMContactLedger.deleteMany.mockResolvedValue({ count: 241 });
  db.cRMContactLedger.updateMany.mockResolvedValue({ count: 9 });
});

describe("cleanupBackfilledLedger", () => {
  it("dry-run counts what would be removed/kept without writing", async () => {
    const r = await cleanupBackfilledLedger({ dryRun: true, keepCampaignId: COLD, relabelTo: "reativacao-frios" });
    expect(r.dryRun).toBe(true);
    expect(r.totalBackfillRecords).toBe(250);
    expect(r.keepRecords).toBe(9);
    expect(r.removeRecords).toBe(241);
    expect(r.relabelCandidates).toBe(9); // kept rows are "recuperar-clientes-frios" != "reativacao-frios"
    expect(r.deleted).toBe(0);
    expect(r.relabeled).toBe(0);
    expect(db.cRMContactLedger.deleteMany).not.toHaveBeenCalled();
    expect(db.cRMContactLedger.updateMany).not.toHaveBeenCalled();
    expect(r.byCampaign.find((c) => c.campaignId === COLD)?.action).toBe("KEEP");
    expect(r.byCampaign.filter((c) => c.action === "REMOVE")).toHaveLength(2);
  });

  it("real run deletes foreign rows and relabels kept rows", async () => {
    const r = await cleanupBackfilledLedger({ dryRun: false, keepCampaignId: COLD, relabelTo: "reativacao-frios" });
    expect(r.dryRun).toBe(false);
    expect(r.deleted).toBe(241);
    expect(r.relabeled).toBe(9);
    expect(db.cRMContactLedger.deleteMany).toHaveBeenCalledWith({
      where: { metadata: { path: ["backfill"], equals: true }, NOT: { campaignId: COLD } },
    });
    expect(db.cRMContactLedger.updateMany).toHaveBeenCalledWith({
      where: { metadata: { path: ["backfill"], equals: true }, campaignId: COLD, NOT: { campaignFamilyKey: "reativacao-frios" } },
      data: { campaignFamilyKey: "reativacao-frios" },
    });
  });

  it("refuses to run without keepCampaignId (no broad wipe)", async () => {
    const r = await cleanupBackfilledLedger({ dryRun: false, keepCampaignId: "" });
    expect(r.ok).toBe(false);
    expect(db.cRMContactLedger.deleteMany).not.toHaveBeenCalled();
  });
});
