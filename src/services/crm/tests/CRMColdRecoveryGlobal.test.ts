import { describe, it, expect, beforeEach, vi } from "vitest";

const db = vi.hoisted(() => ({
  campaign: { findMany: vi.fn() },
  campaignExecution: { groupBy: vi.fn(), count: vi.fn() },
  cRMContactLedger: { count: vi.fn() },
}));
vi.mock("@/lib/prisma", () => ({ prisma: db }));
vi.mock("../CrmCampaignService", () => ({ resolveAudience: vi.fn(async () => []) }));

import { diagnoseColdRecoveryGlobal } from "../CRMColdCampaignRecoveryDiagnosticService";

beforeEach(() => {
  vi.clearAllMocks();
  db.campaign.findMany.mockResolvedValue([
    { id: "cmp1", restaurantId: "r1", name: "Recuperar clientes frios", status: "PAUSED", targetSegment: "FRIO", templateId: "recuperar-frios", campaignFamilyKey: "reativacao-frios", messageFingerprint: "mf_2_x" },
    { id: "cmp2", restaurantId: "r1", name: "Avisar Abertura do Almoço", status: "ACTIVE", targetSegment: "TODOS", templateId: null, campaignFamilyKey: null, messageFingerprint: null },
  ]);
  // weekly-cap blocks + a couple real provider failures
  db.campaignExecution.groupBy.mockResolvedValue([
    { status: "BLOCKED", failedReason: "Limite semanal atingido (1/1)", errorMessage: "CUSTOMER_WEEKLY_CAP_REACHED", _count: { id: 243 } },
    { status: "FAILED", failedReason: "Evolution → HTTP 400", errorMessage: "Evolution → HTTP 400", _count: { id: 4 } },
  ]);
  db.campaignExecution.count.mockResolvedValue(9); // SENT
  db.cRMContactLedger.count.mockResolvedValue(0);  // none in ledger yet
});

describe("diagnoseColdRecoveryGlobal", () => {
  it("(1) finds only cold campaigns and separates blocks from failures", async () => {
    const r = await diagnoseColdRecoveryGlobal();
    expect(r.candidates).toHaveLength(1); // only the cold one
    const c = r.candidates[0]!;
    expect(c.campaignId).toBe("cmp1");
    expect(c.sentExecutions).toBe(9);
    expect(c.blockedSafety).toBe(243);
    expect(c.weeklyCapBlocks).toBe(243);
    expect(c.failedProvider).toBe(4);
    expect(c.alreadyInLedger).toBe(0);
  });

  it("computes totals + recommends the stable familyKey", async () => {
    const r = await diagnoseColdRecoveryGlobal();
    expect(r.totals.sentExecutions).toBe(9);
    expect(r.totals.alreadyInLedger).toBe(0);
    expect(r.totals.wouldBackfill).toBe(9); // 9 SENT, none yet in ledger
    expect(r.recommendedFamilyKey).toBe("reativacao-frios");
  });
});
