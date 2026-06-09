import { describe, it, expect, beforeEach, vi } from "vitest";

const db = vi.hoisted(() => ({
  campaign: { findUnique: vi.fn(), create: vi.fn() },
}));
vi.mock("@/lib/prisma", () => ({ prisma: db }));

import { restartColdCampaign } from "../CRMColdCampaignRestartService";

beforeEach(() => {
  vi.clearAllMocks();
  db.campaign.create.mockResolvedValue({ id: "newcmp" });
});

describe("restartColdCampaign — safe cold-campaign preparation", () => {
  it("(11) creates the campaign PAUSED (never auto-sends)", async () => {
    const r = await restartColdCampaign({ restaurantId: "r1" });
    expect(r.campaignId).toBe("newcmp");
    expect(r.status).toBe("PAUSED");
    const data = db.campaign.create.mock.calls[0][0].data;
    expect(data.status).toBe("PAUSED");
  });

  it("(7) cold campaigns are conservative: NORMAL priority, NO weekly override, dedupe ON, window >= 30", async () => {
    const r = await restartColdCampaign({ restaurantId: "r1", dedupeWindowDays: 60 });
    expect(r.priority).toBe("NORMAL");
    expect(r.allowWeeklyCustomerCapOverride).toBe(false);
    expect(r.dedupePolicy.dedupeByConcept).toBe(true);
    expect(r.dedupePolicy.dedupeByMessage).toBe(true);
    expect(r.dedupePolicy.allowResendToImpacted).toBe(false);
    expect(r.dedupePolicy.dedupeWindowDays).toBeGreaterThanOrEqual(30);
    const data = db.campaign.create.mock.calls[0][0].data;
    expect((data.scheduleConfig as { allowWeeklyCustomerCapOverride: boolean }).allowWeeklyCustomerCapOverride).toBe(false);
  });

  it("keeps a stable familyKey + generates a fingerprint", async () => {
    const r = await restartColdCampaign({ restaurantId: "r1", campaignFamilyKey: "reativacao-frios" });
    expect(r.campaignFamilyKey).toBe("reativacao-frios");
    expect(r.messageFingerprint).toMatch(/^mf_/);
  });

  it("(12) reuses the source message when asked, scoped to the same restaurant", async () => {
    db.campaign.findUnique.mockResolvedValue({ message: "Texto antigo dos frios", targetSegment: "FRIO", templateId: "recuperar-frios", restaurantId: "r1", campaignFamilyKey: "reativacao-frios" });
    await restartColdCampaign({ restaurantId: "r1", sourceCampaignId: "old", reuseMessage: true });
    const data = db.campaign.create.mock.calls[0][0].data;
    expect(data.message).toBe("Texto antigo dos frios");
    // never sends — no Evolution import here at all
  });
});
