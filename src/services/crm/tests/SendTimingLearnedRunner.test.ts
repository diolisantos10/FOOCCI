/**
 * Learned send timing — runner integration.
 *
 * Guarantees of the CRM_LEARNED_TIMING_ENABLED flag (env, default OFF):
 *  - OFF (default): ZERO change — the intelligence service is never even
 *    consulted and the batch runs exactly as before.
 *  - ON + insufficient data (bestSendHours → null): behavior unchanged.
 *  - ON + enough data: the batch is deferred until the best learned hour
 *    WITHIN the merchant-configured window; from that hour on it proceeds.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

const db = vi.hoisted(() => ({
  campaign: { findUnique: vi.fn(), update: vi.fn(), findMany: vi.fn() },
  campaignExecution: { findMany: vi.fn(), create: vi.fn(), count: vi.fn() },
  restaurant: { findUnique: vi.fn() },
  restaurantBrandConfig: { findUnique: vi.fn() },
  whatsAppAgentConfig: { findUnique: vi.fn() },
  customer: { findMany: vi.fn(), findUnique: vi.fn() },
  metaWhatsAppConfig: { findUnique: vi.fn() },
  conversation: { findFirst: vi.fn(), create: vi.fn() },
  message: { create: vi.fn() },
  cRMContactLedger: { create: vi.fn(), createMany: vi.fn(), findMany: vi.fn() },
  $transaction: vi.fn(async (arr: unknown) => (Array.isArray(arr) ? Promise.all(arr as Promise<unknown>[]) : undefined)),
}));
const ledger = vi.hoisted(() => ({
  getImpactedByConcept: vi.fn(async () => new Set<string>()),
  getImpactedByMessage: vi.fn(async () => new Set<string>()),
  recordLedger: vi.fn(async () => {}),
}));
const evoCfg = vi.hoisted(() => ({ getSnapshot: vi.fn() }));
const evoClient = vi.hoisted(() => ({ sendTextMessage: vi.fn() }));
const svc = vi.hoisted(() => ({ resolveAudience: vi.fn(), personalizeMessage: vi.fn(() => "oi") }));
const safety = vi.hoisted(() => ({
  getSafetyConfig: vi.fn(), getTodayGlobalSendCount: vi.fn(() => 0), getWeekGlobalSendCount: vi.fn(() => 0),
  checkQuietHours: vi.fn(() => null), checkWeekendBlock: vi.fn(() => null),
  randomDelayMs: vi.fn(() => 0), isBirthdayCampaign: vi.fn(() => false),
}));
const contact = vi.hoisted(() => ({
  ContactSafetyService: { buildGlobalContext: vi.fn(() => ({})), assertSendable: vi.fn(), applyInboundOptOut: vi.fn() },
}));

vi.mock("@/lib/prisma", () => ({ prisma: db }));
vi.mock("@/services/evolution/EvolutionConfigService", () => ({ EvolutionConfigService: evoCfg }));
vi.mock("@/lib/evolution/EvolutionClient", () => ({ EvolutionClient: evoClient }));
vi.mock("../CrmCampaignService", () => svc);
vi.mock("@/lib/crm-safety", () => safety);
vi.mock("@/services/crm/ContactSafetyService", () => contact);
vi.mock("@/lib/public-url", () => ({ getPublicMenuUrl: () => "", getPublicSiteUrl: () => "", sanitizeCustomerUrl: (u: string) => u }));
vi.mock("@/services/agents/AgentRoutingService", () => ({
  markConversationCrmContext: vi.fn(), buildConversationMetadataForCrmSend: vi.fn(() => ({})), CONTEXT_TYPE: {},
}));
vi.mock("../CRMContactLedgerService", () => ledger);

import { ScheduledCampaignRunnerService } from "../ScheduledCampaignRunnerService";
import { SendTimingIntelligenceService } from "../SendTimingIntelligenceService";

const CAMPAIGN = {
  id: "cmp1", restaurantId: "r1", name: "Recuperar clientes frios", status: "ACTIVE",
  message: "oi", templateId: "recuperar-frios", targetSegment: "recuperar-frios",
  campaignFamilyKey: "reativacao-frios", messageFingerprint: "mf_1_abc", dedupePolicy: null,
  totalSent: 0,
  scheduleConfig: {
    mode: "RECURRING", weekdays: [0, 1, 2, 3, 4, 5, 6],
    timeWindow: { start: "00:00", end: "23:59" }, dailyLimit: 20,
    endCondition: "AUDIENCE_EXHAUSTED", timezone: "America/Sao_Paulo",
  },
};

/** 12:00 UTC = 09:00 in America/Sao_Paulo (UTC-3). */
const NINE_AM_LOCAL = new Date("2026-07-08T12:00:00Z");
/** 23:30 UTC = 20:30 in America/Sao_Paulo. */
const EIGHT_THIRTY_PM_LOCAL = new Date("2026-07-08T23:30:00Z");

const ORIGINAL_FLAG = process.env.CRM_LEARNED_TIMING_ENABLED;

beforeEach(() => {
  vi.clearAllMocks();
  delete process.env.CRM_LEARNED_TIMING_ENABLED; // default OFF
  vi.spyOn(ScheduledCampaignRunnerService, "isCampaignDueNow").mockReturnValue(true);
  db.campaign.findUnique.mockResolvedValue(CAMPAIGN);
  db.campaign.update.mockResolvedValue({});
  db.campaignExecution.findMany.mockResolvedValue([]);
  db.campaignExecution.count.mockResolvedValue(0);
  safety.getSafetyConfig.mockResolvedValue({ dailyGlobalCap: 200, weeklyGlobalCap: 0, quietHoursEnabled: false, sendOnWeekends: true });
  svc.resolveAudience.mockResolvedValue([{ id: "c1", name: "Ana", phone: "5511999990000", tier: "BRONZE", segment: "FRIO", totalOrders: 1, totalSpend: 10, lastOrderAt: null }]);
});

afterEach(() => {
  vi.useRealTimers();
  if (ORIGINAL_FLAG === undefined) delete process.env.CRM_LEARNED_TIMING_ENABLED;
  else process.env.CRM_LEARNED_TIMING_ENABLED = ORIGINAL_FLAG;
});

describe("learned send timing — flag OFF (default) means ZERO change", () => {
  it("never consults SendTimingIntelligenceService and runs the batch exactly as before", async () => {
    const bestHoursSpy = vi.spyOn(SendTimingIntelligenceService, "bestSendHours");
    const pickSpy = vi.spyOn(SendTimingIntelligenceService, "pickBestHourWithin");

    const r = await ScheduledCampaignRunnerService.runCampaignBatch("cmp1", { dryRun: true, limit: 5 });

    expect(bestHoursSpy).not.toHaveBeenCalled();
    expect(pickSpy).not.toHaveBeenCalled();
    // Unchanged pre-existing dry-run outcome: audience resolved, batch previewed.
    expect(r.reason).toBe("Dry run");
    expect(r.eligible).toBe(1);
    expect(svc.resolveAudience).toHaveBeenCalledTimes(1);
  });

  it("flag set to anything other than \"true\" also keeps the flag OFF", async () => {
    process.env.CRM_LEARNED_TIMING_ENABLED = "1"; // strict === "true" gate
    const bestHoursSpy = vi.spyOn(SendTimingIntelligenceService, "bestSendHours");
    const r = await ScheduledCampaignRunnerService.runCampaignBatch("cmp1", { dryRun: true, limit: 5 });
    expect(bestHoursSpy).not.toHaveBeenCalled();
    expect(r.reason).toBe("Dry run");
  });
});

describe("learned send timing — flag ON", () => {
  it("with insufficient data (bestSendHours → null) the behavior is unchanged", async () => {
    process.env.CRM_LEARNED_TIMING_ENABLED = "true";
    vi.spyOn(SendTimingIntelligenceService, "bestSendHours").mockResolvedValue(null);

    const r = await ScheduledCampaignRunnerService.runCampaignBatch("cmp1", { dryRun: true, limit: 5 });

    expect(r.reason).toBe("Dry run");
    expect(r.eligible).toBe(1);
  });

  it("defers the batch when the best learned hour (inside the window) is still ahead", async () => {
    process.env.CRM_LEARNED_TIMING_ENABLED = "true";
    vi.useFakeTimers({ now: NINE_AM_LOCAL, toFake: ["Date"] }); // 09:00 local
    vi.spyOn(SendTimingIntelligenceService, "bestSendHours").mockResolvedValue({
      hourScores: { 20: 1, 11: 0.4 }, topHours: [20, 11], sampleSize: 50,
    });

    const r = await ScheduledCampaignRunnerService.runCampaignBatch("cmp1", { dryRun: true, limit: 5 });

    expect(r.reason).toMatch(/melhor horário aprendido/i);
    expect(r.sent).toBe(0);
    expect(svc.resolveAudience).not.toHaveBeenCalled(); // deferred before any work
  });

  it("proceeds normally once the local time reaches the best learned hour", async () => {
    process.env.CRM_LEARNED_TIMING_ENABLED = "true";
    vi.useFakeTimers({ now: EIGHT_THIRTY_PM_LOCAL, toFake: ["Date"] }); // 20:30 local
    vi.spyOn(SendTimingIntelligenceService, "bestSendHours").mockResolvedValue({
      hourScores: { 20: 1, 11: 0.4 }, topHours: [20, 11], sampleSize: 50,
    });

    const r = await ScheduledCampaignRunnerService.runCampaignBatch("cmp1", { dryRun: true, limit: 5 });

    expect(r.reason).toBe("Dry run");
    expect(r.eligible).toBe(1);
  });

  it("a lookup error in the intelligence service never breaks the send path", async () => {
    process.env.CRM_LEARNED_TIMING_ENABLED = "true";
    vi.spyOn(SendTimingIntelligenceService, "bestSendHours").mockRejectedValue(new Error("db down"));

    const r = await ScheduledCampaignRunnerService.runCampaignBatch("cmp1", { dryRun: true, limit: 5 });

    expect(r.reason).toBe("Dry run");
    expect(r.eligible).toBe(1);
  });
});
