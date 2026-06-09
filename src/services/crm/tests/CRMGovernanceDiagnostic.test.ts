import { describe, it, expect, beforeEach, vi } from "vitest";

const db = vi.hoisted(() => ({
  campaign: { findFirst: vi.fn() },
  cRMContactLedger: { create: vi.fn(), deleteMany: vi.fn(), count: vi.fn() },
}));
const ledger = vi.hoisted(() => ({ getImpactedByConcept: vi.fn(), getImpactedByMessage: vi.fn() }));

vi.mock("@/lib/prisma", () => ({ prisma: db }));
vi.mock("../CRMContactLedgerService", () => ledger);

import { runGovernanceDiagnostic } from "../crmGovernanceDiagnostic";

beforeEach(() => {
  vi.clearAllMocks();
  db.campaign.findFirst.mockResolvedValue({ campaignFamilyKey: null, messageFingerprint: null });
  db.cRMContactLedger.create.mockResolvedValue({ id: "ledg1" });
  db.cRMContactLedger.deleteMany.mockResolvedValue({ count: 1 });
  db.cRMContactLedger.count.mockResolvedValue(0);
});

describe("runGovernanceDiagnostic", () => {
  it("(1) PASS — ledger + identity + dedupe + preflight all work, cleanup true", async () => {
    // The synthetic customer must be found by both concept + message.
    ledger.getImpactedByConcept.mockImplementation(async () => {
      // the diagnostic uses a generated customerId; return the first arg's customer.
      return new Set(["__SYNTH__"]); // placeholder; replaced below
    });
    // Easier: make both return a set containing the customerId the diagnostic created.
    // The diagnostic builds customerId = `__gov_cust_<stamp>`; we capture it via the create call.
    let synthCustomer = "";
    db.cRMContactLedger.create.mockImplementation(async (args: { data: { customerId: string } }) => {
      synthCustomer = args.data.customerId;
      return { id: "ledg1" };
    });
    ledger.getImpactedByConcept.mockImplementation(async () => new Set([synthCustomer]));
    ledger.getImpactedByMessage.mockImplementation(async () => new Set([synthCustomer]));

    const r = await runGovernanceDiagnostic();
    expect(r.status).toBe("PASS");
    expect(r.ledgerAvailable).toBe(true);
    expect(r.campaignIdentityAvailable).toBe(true);
    expect(r.dedupeWorks).toBe(true);
    expect(r.preflightWorks).toBe(true);
    expect(r.runtimeTouched).toBe(false);
    expect(r.cleanup).toBe(true);
  });

  it("FAILs (and cleans up) when the dedupe query does not find the impact", async () => {
    ledger.getImpactedByConcept.mockResolvedValue(new Set());
    ledger.getImpactedByMessage.mockResolvedValue(new Set());
    const r = await runGovernanceDiagnostic();
    expect(r.status).toBe("FAIL");
    expect(r.stage).toBe("dedupe");
    expect(db.cRMContactLedger.deleteMany).toHaveBeenCalled();
    expect(r.cleanup).toBe(true);
  });

  it("FAILs when the identity columns are missing (migration not applied)", async () => {
    db.campaign.findFirst.mockRejectedValue(new Error("column campaignFamilyKey does not exist"));
    const r = await runGovernanceDiagnostic();
    expect(r.status).toBe("FAIL");
    expect(r.campaignIdentityAvailable).toBe(false);
  });
});
