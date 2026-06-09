import { describe, it, expect, beforeEach, vi } from "vitest";

const db = vi.hoisted(() => ({
  campaignExecution: { findMany: vi.fn() },
  campaign: { findMany: vi.fn() },
  cRMContactLedger: { findMany: vi.fn(), createMany: vi.fn() },
}));
vi.mock("@/lib/prisma", () => ({ prisma: db }));

import { backfillContactLedger } from "../CRMContactLedgerBackfillService";

const EXECS = [
  { id: "e1", campaignId: "cmp1", restaurantId: "r1", customerId: "c1", customerPhone: "5511999990000", sentAt: new Date("2026-06-01") },
  { id: "e2", campaignId: "cmp1", restaurantId: "r1", customerId: "c2", customerPhone: "5511999990001", sentAt: new Date("2026-06-02") },
];

beforeEach(() => {
  vi.clearAllMocks();
  db.campaignExecution.findMany.mockResolvedValue(EXECS);
  db.campaign.findMany.mockResolvedValue([{ id: "cmp1", name: "Recuperar clientes frios", objective: "RECUPERAR", message: "Oi {nome}, volte!", restaurantId: "r1", campaignFamilyKey: "reativacao-frios", messageFingerprint: "mf_2_x" }]);
  db.cRMContactLedger.findMany.mockResolvedValue([]); // none yet in ledger
  db.cRMContactLedger.createMany.mockResolvedValue({ count: 2 });
});

describe("backfillContactLedger", () => {
  it("(2) dryRun counts SENT without writing to the ledger", async () => {
    const r = await backfillContactLedger({ dryRun: true });
    expect(r.dryRun).toBe(true);
    expect(r.sentFound).toBe(2);
    expect(r.created).toBe(2); // would create
    expect(db.cRMContactLedger.createMany).not.toHaveBeenCalled();
  });

  it("(3) real run writes the ledger, preserving original sentAt + familyKey", async () => {
    const r = await backfillContactLedger({ dryRun: false });
    expect(r.created).toBe(2);
    expect(db.cRMContactLedger.createMany).toHaveBeenCalledTimes(1);
    const rows = db.cRMContactLedger.createMany.mock.calls[0][0].data;
    expect(rows[0].status).toBe("SENT");
    expect(rows[0].campaignFamilyKey).toBe("reativacao-frios");
    expect(rows[0].sourceExecutionId).toBe("e1");
    expect(rows[0].sentAt).toEqual(new Date("2026-06-01"));
  });

  it("(3) is idempotent — executions already in the ledger are skipped", async () => {
    db.cRMContactLedger.findMany.mockResolvedValue([{ sourceExecutionId: "e1" }]);
    const r = await backfillContactLedger({ dryRun: false });
    expect(r.alreadyInLedger).toBe(1);
    expect(r.created).toBe(1);
    const rows = db.cRMContactLedger.createMany.mock.calls[0][0].data;
    expect(rows.map((x: { sourceExecutionId: string }) => x.sourceExecutionId)).toEqual(["e2"]);
  });

  it("flags executions whose campaign was deleted (no familyKey)", async () => {
    db.campaign.findMany.mockResolvedValue([]); // campaign deleted
    const r = await backfillContactLedger({ dryRun: true, campaignFamilyKey: "" });
    expect(r.withoutCampaign).toBe(2);
    expect(r.withoutFamilyKey).toBe(2);
    expect(r.warnings.length).toBeGreaterThan(0);
  });
});
