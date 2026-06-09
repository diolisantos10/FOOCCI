import { describe, it, expect, beforeEach, vi } from "vitest";

const db = vi.hoisted(() => ({ campaign: { findUnique: vi.fn(), update: vi.fn() } }));
vi.mock("@/lib/prisma", () => ({ prisma: db }));

import { archiveCampaign } from "../CRMCampaignArchiveService";

const ID = "cmq1r7i1b00o2s6xju850qkp5";

beforeEach(() => {
  vi.clearAllMocks();
  db.campaign.findUnique.mockResolvedValue({ id: ID, name: "Recuperar clientes frios", status: "PAUSED" });
  db.campaign.update.mockResolvedValue({ id: ID });
});

describe("archiveCampaign", () => {
  it("dry-run previews the transition without writing", async () => {
    const r = await archiveCampaign({ dryRun: true, campaignId: ID });
    expect(r.dryRun).toBe(true);
    expect(r.previousStatus).toBe("PAUSED");
    expect(r.targetStatus).toBe("CANCELLED");
    expect(r.changed).toBe(false);
    expect(db.campaign.update).not.toHaveBeenCalled();
  });

  it("real run sets status to CANCELLED (never deletes)", async () => {
    const r = await archiveCampaign({ dryRun: false, campaignId: ID });
    expect(r.changed).toBe(true);
    expect(r.previousStatus).toBe("PAUSED");
    expect(db.campaign.update).toHaveBeenCalledWith({ where: { id: ID }, data: { status: "CANCELLED" } });
  });

  it("is idempotent when already CANCELLED", async () => {
    db.campaign.findUnique.mockResolvedValue({ id: ID, name: "x", status: "CANCELLED" });
    const r = await archiveCampaign({ dryRun: false, campaignId: ID });
    expect(r.alreadyArchived).toBe(true);
    expect(r.changed).toBe(false);
    expect(db.campaign.update).not.toHaveBeenCalled();
  });

  it("refuses an unsafe target status (never activates/sends)", async () => {
    const r = await archiveCampaign({ dryRun: false, campaignId: ID, toStatus: "ACTIVE" });
    expect(r.ok).toBe(false);
    expect(db.campaign.findUnique).not.toHaveBeenCalled();
    expect(db.campaign.update).not.toHaveBeenCalled();
  });
});
