import { describe, it, expect, beforeEach, vi } from "vitest";

const db = vi.hoisted(() => ({
  campaign: { findUnique: vi.fn(), update: vi.fn(), findMany: vi.fn() },
  campaignExecution: { findMany: vi.fn(), create: vi.fn(), createMany: vi.fn(), count: vi.fn(), groupBy: vi.fn() },
  restaurant: { findUnique: vi.fn() },
  restaurantBrandConfig: { findUnique: vi.fn() },
  whatsAppAgentConfig: { findUnique: vi.fn() },
  customer: { findMany: vi.fn(), findUnique: vi.fn() },
  metaWhatsAppConfig: { findUnique: vi.fn() },
  customerCoupon: { findMany: vi.fn() },
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
// Canal único (Meta). `channel` responde pelo ESTADO da conexão; `send` é o envio.
// Nada sai de verdade: os dois são espiões.
const channel = vi.hoisted(() => ({
  getConnectionStatus: vi.fn(),
  sendText:            vi.fn(),
  sendTemplate:        vi.fn(),
}));
const svc = vi.hoisted(() => ({ resolveAudience: vi.fn(), personalizeMessage: vi.fn(() => "oi") }));
const safety = vi.hoisted(() => ({
  getSafetyConfig: vi.fn(), getTodayGlobalSendCount: vi.fn(() => 0), getWeekGlobalSendCount: vi.fn(() => 0),
  checkQuietHours: vi.fn(() => null), checkWeekendBlock: vi.fn(() => null),
  randomDelayMs: vi.fn(() => 0), isBirthdayCampaign: vi.fn(() => false),
  BUDGET_EXEMPT_TEMPLATE_IDS: ["aniversariantes"],
}));
const contact = vi.hoisted(() => ({
  ContactSafetyService: { buildGlobalContext: vi.fn(() => ({})), assertSendable: vi.fn(), applyInboundOptOut: vi.fn() },
}));

vi.mock("@/lib/prisma", () => ({ prisma: db }));
vi.mock("@/services/whatsapp/WhatsAppMessagingService", () => ({ WhatsAppMessagingService: channel }));
// Sem modelo aprovado → o envio sai como texto livre (o caminho que esta suíte cobre).
vi.mock("@/services/whatsapp/MetaTemplateService", () => ({ MetaTemplateService: { findApproved: vi.fn(async () => null) } }));
vi.mock("../CrmCampaignService", () => svc);
vi.mock("@/lib/crm-safety", () => safety);
vi.mock("@/services/crm/ContactSafetyService", () => contact);
vi.mock("@/lib/public-url", () => ({ getPublicMenuUrl: () => "", getPublicSiteUrl: () => "", sanitizeCustomerUrl: (u: string) => u }));
vi.mock("@/services/agents/AgentRoutingService", () => ({
  markConversationCrmContext: vi.fn(), buildConversationMetadataForCrmSend: vi.fn(() => ({})), CONTEXT_TYPE: {},
}));
vi.mock("../CRMContactLedgerService", () => ledger);

import { ScheduledCampaignRunnerService } from "../ScheduledCampaignRunnerService";

const CAMPAIGN = {
  id: "cmp1", restaurantId: "r1", name: "Recuperar clientes frios", status: "ACTIVE",
  message: "oi", templateId: "recuperar-frios", targetSegment: "recuperar-frios",
  campaignFamilyKey: "reativacao-frios", messageFingerprint: "mf_1_abc", dedupePolicy: null,
  totalSent: 0, scheduleConfig: { mode: "RECURRING", weekdays: [0,1,2,3,4,5,6], timeWindow: { start: "00:00", end: "23:59" }, dailyLimit: 20, endCondition: "AUDIENCE_EXHAUSTED" },
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(ScheduledCampaignRunnerService, "isCampaignDueNow").mockReturnValue(true);
  db.campaign.findUnique.mockResolvedValue(CAMPAIGN);
  db.campaign.update.mockResolvedValue({});
  db.campaignExecution.findMany.mockResolvedValue([]); // alreadySent + recentlyAttempted
  db.campaignExecution.count.mockResolvedValue(0);
  db.campaignExecution.create.mockResolvedValue({ id: "e1" });
  db.restaurant.findUnique.mockResolvedValue({ name: "Sushi Cazza", slug: "sushicazza" });
  db.restaurantBrandConfig.findUnique.mockResolvedValue({ googleReviewUrl: null });
  db.whatsAppAgentConfig.findUnique.mockResolvedValue(null);
  db.customer.findMany.mockResolvedValue([]); // none opted out
  db.customer.findUnique.mockResolvedValue({ id: "c1", name: "Ana" });
  db.metaWhatsAppConfig.findUnique.mockResolvedValue(null);
  db.campaignExecution.createMany.mockResolvedValue({ count: 0 });
  db.campaignExecution.groupBy.mockResolvedValue([]);
  db.customerCoupon.findMany.mockResolvedValue([]);
  db.conversation.findFirst.mockResolvedValue(null);
  db.conversation.create.mockResolvedValue({ id: "conv1" });
  db.message.create.mockResolvedValue({ id: "msg1" });
  channel.getConnectionStatus.mockResolvedValue({ provider: "META_CLOUD_API", connected: true, detail: "+55 11 90000-0000" });
  channel.sendText.mockResolvedValue({ ok: true, provider: "META_CLOUD_API", status: "SENT", providerMessageId: "wamid1" });
  channel.sendTemplate.mockResolvedValue({ ok: true, provider: "META_CLOUD_API", status: "SENT", providerMessageId: "wamid1" });
  ledger.getImpactedByConcept.mockResolvedValue(new Set());
  ledger.getImpactedByMessage.mockResolvedValue(new Set());
  ledger.recordLedger.mockResolvedValue(undefined);
  safety.getSafetyConfig.mockResolvedValue({ dailyGlobalCap: 200, weeklyGlobalCap: 0, customerCooldownHours: 24, maxPerWeekPerCustomer: 1, quietHoursEnabled: false, sendOnWeekends: true });
  svc.resolveAudience.mockResolvedValue([{ id: "c1", name: "Ana", phone: "5511999990000", tier: "BRONZE", segment: "FRIO", totalOrders: 1, totalSpend: 10, lastOrderAt: null }]);
});

describe("ScheduledCampaignRunner — safety blocks are not failures (no useless retry)", () => {
  it("(1) a weekly-cap block is recorded as status BLOCKED, not FAILED; nada é enviado", async () => {
    contact.ContactSafetyService.assertSendable.mockResolvedValue({ sendable: false, reason: "CUSTOMER_WEEKLY_CAP_REACHED", detail: "Limite semanal atingido (1/1)" });

    const r = await ScheduledCampaignRunnerService.runCampaignBatch("cmp1", { limit: 5 });

    const created = db.campaignExecution.create.mock.calls[0][0].data;
    expect(created.status).toBe("BLOCKED");
    expect(created.errorMessage).toBe("CUSTOMER_WEEKLY_CAP_REACHED");
    expect(channel.sendText).not.toHaveBeenCalled();
    expect(r.blocked).toBe(1);
    expect(r.failed).toBe(0);
    // campaign.totalFailed must NOT be incremented by a safety block
    const upd = db.campaign.update.mock.calls.find((c) => (c[0] as { data?: { totalFailed?: unknown } }).data?.totalFailed);
    expect((upd?.[0] as { data: { totalFailed: { increment: number } } }).data.totalFailed.increment).toBe(0);
  });

  it("(5) the dedupe query excludes recently BLOCKED/FAILED customers (no retry every tick)", async () => {
    contact.ContactSafetyService.assertSendable.mockResolvedValue({ sendable: false, reason: "CUSTOMER_WEEKLY_CAP_REACHED", detail: "x" });
    await ScheduledCampaignRunnerService.runCampaignBatch("cmp1", { limit: 5 });
    // One of the findMany calls must filter status in [BLOCKED, FAILED] within a window.
    const calls = db.campaignExecution.findMany.mock.calls.map((c) => JSON.stringify(c[0]));
    expect(calls.some((c) => c.includes("BLOCKED") && c.includes("FAILED") && c.includes("createdAt"))).toBe(true);
  });

  it("weekly restaurant cap is OFF by default (not enforced)", async () => {
    contact.ContactSafetyService.assertSendable.mockResolvedValue({ sendable: true, reason: null });
    await ScheduledCampaignRunnerService.runCampaignBatch("cmp1", { dryRun: true, limit: 5 });
    expect(safety.getWeekGlobalSendCount).not.toHaveBeenCalled();
  });

  it("weekly restaurant cap blocks the campaign when set and reached", async () => {
    safety.getSafetyConfig.mockResolvedValue({ dailyGlobalCap: 200, weeklyGlobalCap: 50, customerCooldownHours: 24, maxPerWeekPerCustomer: 1, quietHoursEnabled: false, sendOnWeekends: true });
    safety.getWeekGlobalSendCount.mockResolvedValue(50); // at the weekly cap
    const r = await ScheduledCampaignRunnerService.runCampaignBatch("cmp1", { limit: 5 });
    expect(r.reason).toMatch(/semanal/i);
    expect(r.sent).toBe(0);
  });

  it("(5) concept dedupe: a customer already impacted by the concept is excluded (not sent)", async () => {
    ledger.getImpactedByConcept.mockResolvedValue(new Set(["c1"]));
    const r = await ScheduledCampaignRunnerService.runCampaignBatch("cmp1", { limit: 5 });
    expect(r.eligible).toBe(0);
    expect(r.sent).toBe(0);
    expect(contact.ContactSafetyService.assertSendable).not.toHaveBeenCalled();
  });

  it("(6) message dedupe: a customer who got the same message is excluded", async () => {
    ledger.getImpactedByMessage.mockResolvedValue(new Set(["c1"]));
    const r = await ScheduledCampaignRunnerService.runCampaignBatch("cmp1", { limit: 5 });
    expect(r.eligible).toBe(0);
  });

  it("(11) a successful send records a SENT entry in the impact ledger", async () => {
    contact.ContactSafetyService.assertSendable.mockResolvedValue({ sendable: true, reason: null });
    db.campaign.findUnique.mockResolvedValue({ ...CAMPAIGN, campaignFamilyKey: "reativacao-frios", messageFingerprint: "mf_1_abc" });
    const r = await ScheduledCampaignRunnerService.runCampaignBatch("cmp1", { limit: 5 });
    expect(r.sent).toBe(1);
    expect(ledger.recordLedger).toHaveBeenCalledTimes(1);
    const entry = ledger.recordLedger.mock.calls[0][0];
    expect(entry.status).toBe("SENT");
    expect(entry.campaignFamilyKey).toBe("reativacao-frios");
    expect(entry.messageFingerprint).toBe("mf_1_abc");
  });

  it("priority override is passed to the safety gate when the campaign enables it", async () => {
    contact.ContactSafetyService.assertSendable.mockResolvedValue({ sendable: false, reason: "X", detail: "x" });
    db.campaign.findUnique.mockResolvedValue({ ...CAMPAIGN, scheduleConfig: { ...CAMPAIGN.scheduleConfig, allowWeeklyCustomerCapOverride: true } });
    await ScheduledCampaignRunnerService.runCampaignBatch("cmp1", { limit: 5 });
    expect(contact.ContactSafetyService.assertSendable).toHaveBeenCalledWith(expect.objectContaining({ allowWeeklyCapOverride: true }));
  });

  it("(9) dry-run records nothing and never calls the channel", async () => {
    contact.ContactSafetyService.assertSendable.mockResolvedValue({ sendable: true, reason: null });
    const r = await ScheduledCampaignRunnerService.runCampaignBatch("cmp1", { dryRun: true, limit: 5 });
    expect(r.sent).toBe(0);
    expect(db.campaignExecution.create).not.toHaveBeenCalled();
    expect(channel.sendText).not.toHaveBeenCalled();
  });

  // ── Canal único: desconectado tem que FALHAR VISÍVEL ────────────────────────
  // Não existe mais provedor reserva. O que não pode acontecer é o lote sumir em
  // silêncio: o lojista precisa ver, por destinatário, por que nada saiu.
  it("canal desconectado: nada é enviado e cada destinatário fica com BLOCKED explicado", async () => {
    contact.ContactSafetyService.assertSendable.mockResolvedValue({ sendable: true, reason: null });
    channel.getConnectionStatus.mockResolvedValue({ provider: "META_CLOUD_API", connected: false, detail: null });

    const r = await ScheduledCampaignRunnerService.runCampaignBatch("cmp1", { limit: 5 });

    expect(channel.sendText).not.toHaveBeenCalled();
    expect(channel.sendTemplate).not.toHaveBeenCalled();
    expect(r.sent).toBe(0);
    expect(r.failed).toBe(0);          // canal fora do ar não é falha do destinatário
    expect(r.blocked).toBe(1);
    const rows = db.campaignExecution.createMany.mock.calls[0][0].data;
    expect(rows).toHaveLength(1);
    expect(rows[0].status).toBe("BLOCKED");
    expect(rows[0].errorMessage).toBe("NO_WHATSAPP_CONFIG");
  });

  it("estado do canal indisponível (consulta falhou) também trava o lote", async () => {
    contact.ContactSafetyService.assertSendable.mockResolvedValue({ sendable: true, reason: null });
    // Espião novo: ver a nota em CrmWhatsAppChannel.test.ts sobre lançar em espião
    // que já teve mockResolvedValue.
    channel.getConnectionStatus = vi.fn(() => { throw new Error("graph fora do ar"); });

    const r = await ScheduledCampaignRunnerService.runCampaignBatch("cmp1", { limit: 5 });

    expect(channel.sendText).not.toHaveBeenCalled();
    expect(r.sent).toBe(0);
    expect(r.blocked).toBe(1);
  });
});
