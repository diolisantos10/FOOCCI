/**
 * O caso Wellington, na ponta que manda a mensagem.
 *
 * O arquivo irmão (`CampanhaNaoAtropelaPedido.test.ts`) prova a REGRA e o
 * PORTÃO. Este prova a CONSEQUÊNCIA dentro do runner recorrente — que é o código
 * que de fato falou com o cliente às 18:52:
 *
 *   • nada é enviado;
 *   • o bloqueio fica escrito, com o motivo, na tela do lojista;
 *   • e — o item 2 da ordem do CEO — **nenhum cupom é cunhado**. Os 10% não
 *     saem da margem de quem acabou de pagar preço cheio, porque o `continue`
 *     do portão acontece ANTES do `CustomerCouponService.grant`.
 *
 * O portão real é dublê aqui de propósito: quem o testa é o arquivo irmão. Aqui
 * interessa o que o runner FAZ com um bloqueio por pedido em andamento.
 *
 * Nenhuma mensagem é enviada. Nenhum banco real é tocado.
 */

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
const channel = vi.hoisted(() => ({
  getConnectionStatus: vi.fn(),
  enforcesCustomerWindow: true as const,
  sendText: vi.fn(),
  sendTemplate: vi.fn(),
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
const coupons = vi.hoisted(() => ({ CustomerCouponService: { grant: vi.fn(async () => ({ ok: true })) } }));

vi.mock("@/lib/prisma", () => ({ prisma: db }));
vi.mock("@/services/whatsapp/WhatsAppMessagingService", () => ({ WhatsAppMessagingService: channel }));
vi.mock("@/services/whatsapp/MetaTemplateService", () => ({ MetaTemplateService: { findApproved: vi.fn(async () => null) } }));
vi.mock("../CrmCampaignService", () => svc);
vi.mock("@/lib/crm-safety", () => safety);
vi.mock("@/services/crm/ContactSafetyService", () => contact);
vi.mock("../CustomerCouponService", () => coupons);
vi.mock("@/lib/public-url", () => ({ getPublicMenuUrl: () => "", getPublicSiteUrl: () => "", sanitizeCustomerUrl: (u: string) => u }));
vi.mock("@/services/agents/AgentRoutingService", () => ({
  markConversationCrmContext: vi.fn(), buildConversationMetadataForCrmSend: vi.fn(() => ({})), CONTEXT_TYPE: {},
}));
vi.mock("../CRMContactLedgerService", () => ledger);

import { ScheduledCampaignRunnerService } from "../ScheduledCampaignRunnerService";

/** "Converter 1º pedido" — a campanha que caiu no Wellington, com os 10%. */
const CAMPANHA = {
  id: "cmp_cadastro_sem_compra", restaurantId: "r1",
  name: "Converter 1º pedido", status: "ACTIVE",
  message: "Oi, {nome}! Você ganhou {cupom} pra estrear!",
  templateId: "cadastro-sem-compra", targetSegment: "cadastro-sem-compra",
  campaignFamilyKey: "captacao-primeiro-pedido", messageFingerprint: "mf_c_1",
  dedupePolicy: null, totalSent: 0,
  scheduleConfig: {
    mode: "RECURRING", weekdays: [0, 1, 2, 3, 4, 5, 6],
    timeWindow: { start: "00:00", end: "23:59" }, dailyLimit: 20,
    endCondition: "AUDIENCE_EXHAUSTED",
    coupon: { type: "PERCENTAGE", value: 10 },
  },
};

const WELLINGTON = {
  id: "cus_wellington", name: "Wellington", phone: "5511988887777",
  tier: "BRONZE", segment: "SEM_PEDIDOS", totalOrders: 0, totalSpend: 0, lastOrderAt: null,
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(ScheduledCampaignRunnerService, "isCampaignDueNow").mockReturnValue(true);
  db.campaign.findUnique.mockResolvedValue(CAMPANHA);
  db.campaign.update.mockResolvedValue({});
  db.campaignExecution.findMany.mockResolvedValue([]);
  db.campaignExecution.count.mockResolvedValue(0);
  db.campaignExecution.create.mockResolvedValue({ id: "e1" });
  db.campaignExecution.createMany.mockResolvedValue({ count: 0 });
  db.campaignExecution.groupBy.mockResolvedValue([]);
  db.restaurant.findUnique.mockResolvedValue({ name: "Sushi Cazza", slug: "sushicazza" });
  db.restaurantBrandConfig.findUnique.mockResolvedValue({ googleReviewUrl: null });
  db.whatsAppAgentConfig.findUnique.mockResolvedValue(null);
  db.customer.findMany.mockResolvedValue([]);
  db.customer.findUnique.mockResolvedValue(WELLINGTON);
  db.metaWhatsAppConfig.findUnique.mockResolvedValue(null);
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
  coupons.CustomerCouponService.grant.mockResolvedValue({ ok: true });
  safety.getSafetyConfig.mockResolvedValue({
    dailyGlobalCap: 200, weeklyGlobalCap: 0, customerCooldownHours: 24,
    maxPerWeekPerCustomer: 5, quietHoursEnabled: false, sendOnWeekends: true,
    couponMonthlyBudget: 0, couponAvgTicket: 50,
  });
  svc.resolveAudience.mockResolvedValue([WELLINGTON]);
});

describe("runner — pedido em andamento cala a campanha e segura o cupom", () => {
  it("🔴 bloqueio por pedido ativo: nada enviado, e NENHUM cupom cunhado", async () => {
    contact.ContactSafetyService.assertSendable.mockResolvedValue({
      sendable: false,
      reason: "CUSTOMER_HAS_ACTIVE_ORDER",
      detail: "Cliente tem pedido em andamento — o CRM não fala por cima da operação",
    });

    const r = await ScheduledCampaignRunnerService.runCampaignBatch(CAMPANHA.id, { limit: 5 });

    expect(channel.sendText).not.toHaveBeenCalled();
    expect(channel.sendTemplate).not.toHaveBeenCalled();
    // Item 2 da ordem do CEO: a margem fica onde estava.
    expect(coupons.CustomerCouponService.grant).not.toHaveBeenCalled();
    expect(r.sent).toBe(0);
    expect(r.failed).toBe(0);
  });

  it("o bloqueio fica escrito, com o motivo, para o lojista ver", async () => {
    contact.ContactSafetyService.assertSendable.mockResolvedValue({
      sendable: false, reason: "CUSTOMER_HAS_ACTIVE_ORDER", detail: "Cliente tem pedido em andamento",
    });

    await ScheduledCampaignRunnerService.runCampaignBatch(CAMPANHA.id, { limit: 5 });

    const created = db.campaignExecution.create.mock.calls[0][0].data;
    expect(created.status).toBe("BLOCKED");
    expect(created.errorMessage).toBe("CUSTOMER_HAS_ACTIVE_ORDER");
  });

  it("controle: cliente livre continua recebendo, e o cupom é creditado", async () => {
    contact.ContactSafetyService.assertSendable.mockResolvedValue({ sendable: true, reason: null });

    const r = await ScheduledCampaignRunnerService.runCampaignBatch(CAMPANHA.id, { limit: 5 });

    expect(r.sent).toBe(1);
    expect(coupons.CustomerCouponService.grant).toHaveBeenCalledTimes(1);
    expect(coupons.CustomerCouponService.grant.mock.calls[0][0].customerId).toBe(WELLINGTON.id);
  });
});
