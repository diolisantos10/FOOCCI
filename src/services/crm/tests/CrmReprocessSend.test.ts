import { describe, it, expect, beforeEach, vi } from "vitest";

// Live recoverable-reprocess GATES — Evolution + _sendBatch mocked, NO real sends.

const db = vi.hoisted(() => ({
  campaign: { findUnique: vi.fn(), update: vi.fn() },
  campaignExecution: { findMany: vi.fn(), create: vi.fn() },
  restaurant: { findUnique: vi.fn() },
  restaurantBrandConfig: { findUnique: vi.fn() },
  customer: { findMany: vi.fn() },
  conversation: { findFirst: vi.fn(), create: vi.fn() },
  message: { create: vi.fn() },
  $transaction: vi.fn(async (arr: unknown) => (Array.isArray(arr) ? Promise.all(arr as Promise<unknown>[]) : undefined)),
}));
const evoCfg = vi.hoisted(() => ({ getSnapshot: vi.fn() }));
const evoClient = vi.hoisted(() => ({ sendTextMessage: vi.fn(), getInstanceStatus: vi.fn() }));
const svc = vi.hoisted(() => ({ resolveAudience: vi.fn(async () => []), personalizeMessage: vi.fn(() => "oi") }));
const safety = vi.hoisted(() => ({
  getSafetyConfig: vi.fn(async () => ({})), getTodayGlobalSendCount: vi.fn(async () => 0), getWeekGlobalSendCount: vi.fn(async () => 0),
  checkQuietHours: vi.fn(() => null), checkWeekendBlock: vi.fn(() => null),
  randomDelayMs: vi.fn(() => 0), isBirthdayCampaign: vi.fn(() => false),
}));
const contact = vi.hoisted(() => ({ ContactSafetyService: { buildGlobalContext: vi.fn(async () => ({})), assertSendable: vi.fn(async () => ({ sendable: true })) } }));

vi.mock("@/lib/prisma", () => ({ prisma: db }));
vi.mock("@/services/evolution/EvolutionConfigService", () => ({ EvolutionConfigService: evoCfg }));
vi.mock("@/lib/evolution/EvolutionClient", () => ({
  EvolutionClient: evoClient,
  EvolutionApiError: class extends Error { constructor(public status: number, public body: unknown, m: string) { super(m); } },
}));
vi.mock("./CrmCampaignService", () => svc);
vi.mock("@/lib/crm-safety", () => safety);
vi.mock("@/services/crm/ContactSafetyService", () => contact);
vi.mock("@/lib/public-url", () => ({ getPublicMenuUrl: () => "", getPublicSiteUrl: () => "" }));
vi.mock("@/services/agents/AgentRoutingService", () => ({
  markConversationCrmContext: vi.fn(), buildConversationMetadataForCrmSend: vi.fn(() => ({})), CONTEXT_TYPE: {},
}));
vi.mock("./crmDedupePolicy", () => ({ readDedupePolicy: () => ({}), readOverridePolicy: () => ({ allowWeeklyCustomerCapOverride: false }) }));
vi.mock("./messageFingerprint", () => ({ generateMessageFingerprint: () => "fp" }));
vi.mock("./CRMContactLedgerService", () => ({ getImpactedByConcept: vi.fn(async () => new Set()), getImpactedByMessage: vi.fn(async () => new Set()), recordLedger: vi.fn(async () => {}) }));

import { ScheduledCampaignRunnerService } from "../ScheduledCampaignRunnerService";

const dec = (n: number) => ({ toNumber: () => n });

// One recoverable (transient session-400) failed execution per customer.
function rec(i: number) {
  return { id: `f${i}`, customerId: `c${i}`, customerName: `C${i}`, customerPhone: `551199999${1000 + i}`,
    status: "FAILED", failedReason: "Error: Connection Closed", errorMessage: "EVOLUTION_HTTP_400" };
}
function contactRow(i: number) {
  return { id: `c${i}`, name: `C${i}`, phone: `551199999${1000 + i}`, tier: "BRONZE", segment: "FRIO",
    totalOrders: 1, totalSpend: dec(10), lastOrderAt: null, importedLastOrderAt: null };
}

let sendSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  vi.clearAllMocks();
  // 8 distinct recoverable executions.
  db.campaign.findUnique.mockResolvedValue({
    id: "cmp1", restaurantId: "r1", name: "Pedido de avaliação", status: "ACTIVE",
    message: "Olá", templateId: null, targetSegment: "FRIO", scheduleConfig: null,
    campaignFamilyKey: null, messageFingerprint: "fp",
    executions: Array.from({ length: 8 }, (_, i) => rec(i)),
  });
  db.customer.findMany.mockImplementation(async ({ where }: { where: { id: { in: string[] } } }) =>
    where.id.in.map((id) => contactRow(Number(id.slice(1)))));
  db.campaignExecution.findMany.mockResolvedValue([]); // alreadySent + created
  evoCfg.getSnapshot.mockResolvedValue({ ok: true, data: { instanceName: "sushicazza", baseUrl: "x", apiKey: "y" } });
  evoClient.getInstanceStatus.mockResolvedValue({ state: "open", instance: "sushicazza" });

  sendSpy = vi.spyOn(ScheduledCampaignRunnerService as unknown as { _sendBatch: (...a: unknown[]) => unknown }, "_sendBatch")
    .mockResolvedValue({ sent: 5, failed: 0, blocked: 0, skipped: 0, aborted: false });
});

describe("reprocessRecoverableBatch — safety gates", () => {
  it("blocks without confirm — sends nothing", async () => {
    const r = await ScheduledCampaignRunnerService.reprocessRecoverableBatch("cmp1", { restaurantId: "r1", confirm: undefined });
    expect(r.ok).toBe(false);
    expect(r.reason).toBe("NOT_CONFIRMED");
    expect(r.httpStatus).toBe(400);
    expect(sendSpy).not.toHaveBeenCalled();
  });

  it("blocks when the instance is not open — sends nothing", async () => {
    evoClient.getInstanceStatus.mockResolvedValue({ state: "close", instance: "sushicazza" });
    const r = await ScheduledCampaignRunnerService.reprocessRecoverableBatch("cmp1", { restaurantId: "r1", confirm: true });
    expect(r.ok).toBe(false);
    expect(r.reason).toBe("INSTANCE_NOT_CONNECTED");
    expect(sendSpy).not.toHaveBeenCalled();
  });

  it("blocks a non-reprocessable campaign status (CANCELLED)", async () => {
    db.campaign.findUnique.mockResolvedValue({
      id: "cmp1", restaurantId: "r1", name: "x", status: "CANCELLED", message: "Olá",
      templateId: null, targetSegment: "FRIO", scheduleConfig: null, campaignFamilyKey: null, messageFingerprint: "fp",
      executions: [rec(0)],
    });
    const r = await ScheduledCampaignRunnerService.reprocessRecoverableBatch("cmp1", { restaurantId: "r1", confirm: true });
    expect(r.ok).toBe(false);
    expect(r.reason).toBe("CAMPAIGN_NOT_REPROCESSABLE");
    expect(sendSpy).not.toHaveBeenCalled();
  });

  it("blocks cross-tenant access", async () => {
    const r = await ScheduledCampaignRunnerService.reprocessRecoverableBatch("cmp1", { restaurantId: "OTHER", confirm: true });
    expect(r.ok).toBe(false);
    expect(r.reason).toBe("NOT_FOUND");
    expect(sendSpy).not.toHaveBeenCalled();
  });

  it("confirm + open: sends ONLY the capped (≤5) deduped batch; never mutates old rows", async () => {
    const r = await ScheduledCampaignRunnerService.reprocessRecoverableBatch("cmp1", { restaurantId: "r1", confirm: true });
    expect(r.ok).toBe(true);
    expect(r.plan.nextBatchCount).toBe(5);              // capped from 8 distinct
    expect(sendSpy).toHaveBeenCalledTimes(1);
    const customersArg = sendSpy.mock.calls[0]![1] as unknown[];
    expect(customersArg.length).toBe(5);                // exactly the cap
    expect(r.sent).toBe(5);
    // reprocess never updates existing executions (new rows only, inside _sendBatch).
    expect((db.campaignExecution as { update?: unknown }).update).toBeUndefined();
  });

  it("revalidation drops opt-out / not-contactable (absent from the contactable query) and already-sent", async () => {
    // Only c0 and c1 come back contactable; c2..c4 (in the batch of 5) are filtered out.
    db.customer.findMany.mockResolvedValue([contactRow(0), contactRow(1)]);
    // c1 already successfully sent → excluded too. Two calls to findMany: alreadySent then created.
    db.campaignExecution.findMany
      .mockResolvedValueOnce([{ customerId: "c1" }]) // alreadySent
      .mockResolvedValueOnce([]);                    // created rows
    const r = await ScheduledCampaignRunnerService.reprocessRecoverableBatch("cmp1", { restaurantId: "r1", confirm: true });
    expect(r.ok).toBe(true);
    const customersArg = sendSpy.mock.calls[0]![1] as unknown[];
    expect(customersArg.length).toBe(1);   // only c0 survives revalidation
    expect(r.ignored).toBeGreaterThanOrEqual(4);
  });
});
