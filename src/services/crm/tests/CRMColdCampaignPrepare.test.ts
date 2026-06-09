import { describe, it, expect, beforeEach, vi } from "vitest";

const db = vi.hoisted(() => ({ campaign: { findFirst: vi.fn() } }));
const svc = vi.hoisted(() => ({ restartColdCampaign: vi.fn(), buildPreflightForCampaign: vi.fn() }));
vi.mock("@/lib/prisma", () => ({ prisma: db }));
vi.mock("../CRMColdCampaignRestartService", () => ({ restartColdCampaign: svc.restartColdCampaign }));
vi.mock("../CRMPreflightDiagnosisService", () => ({ buildPreflightForCampaign: svc.buildPreflightForCampaign }));

import { prepareNewColdCampaign } from "../CRMColdCampaignPrepareService";

const RID = "cmp30upkp000198i4r8wpxdl1";
const PREFLIGHT = { audienceTotal: 252, eligibleNow: 240, forecastSendToday: 20, blocked: { alreadyImpactedConcept: 9 } };

beforeEach(() => {
  vi.clearAllMocks();
  db.campaign.findFirst.mockResolvedValue(null);
  svc.restartColdCampaign.mockResolvedValue({ campaignId: "new1", status: "PAUSED", campaignFamilyKey: "reativacao-frios", messageFingerprint: "mf_5_x", note: "PAUSED ok" });
  svc.buildPreflightForCampaign.mockResolvedValue(PREFLIGHT);
});

describe("prepareNewColdCampaign", () => {
  it("dry-run never creates and never relabels", async () => {
    const r = await prepareNewColdCampaign({ dryRun: true, restaurantId: RID, campaignFamilyKey: "reativacao-frios" });
    expect(r.dryRun).toBe(true);
    expect(r.created).toBe(false);
    expect(svc.restartColdCampaign).not.toHaveBeenCalled();
    expect(r.campaignId).toBeNull();
  });

  it("real run creates PAUSED and returns preflight", async () => {
    const r = await prepareNewColdCampaign({ dryRun: false, restaurantId: RID, sourceCampaignId: "old", campaignFamilyKey: "reativacao-frios", dedupeWindowDays: 60 });
    expect(r.created).toBe(true);
    expect(r.status).toBe("PAUSED");
    expect(r.campaignId).toBe("new1");
    expect(r.preflight).toEqual(PREFLIGHT);
    expect(svc.restartColdCampaign).toHaveBeenCalledOnce();
  });

  it("is idempotent — reuses an existing PAUSED campaign instead of duplicating", async () => {
    db.campaign.findFirst.mockResolvedValue({ id: "existing1", status: "PAUSED", messageFingerprint: "mf_5_x" });
    const r = await prepareNewColdCampaign({ dryRun: false, restaurantId: RID, campaignFamilyKey: "reativacao-frios" });
    expect(r.reused).toBe(true);
    expect(r.created).toBe(false);
    expect(r.campaignId).toBe("existing1");
    expect(svc.restartColdCampaign).not.toHaveBeenCalled();
    expect(svc.buildPreflightForCampaign).toHaveBeenCalledWith("existing1");
  });
});
