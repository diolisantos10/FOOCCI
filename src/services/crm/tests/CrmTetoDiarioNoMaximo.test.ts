/**
 * O CANO ENTUPIDO: elegíveis > 0 e enviados = 0, ciclo após ciclo.
 *
 * ⚠️ CRM **do restaurante**. Nada a ver com `src/services/salaDeVendas/`.
 *
 * ── O QUE ESTE ARQUIVO PROVA ────────────────────────────────────────────────
 * Ele roda o RUNNER DE VERDADE (`ScheduledCampaignRunnerService.runCampaignBatch`,
 * o código que decide quem recebe mensagem) sobre um banco de mentira que guarda
 * estado entre os ciclos — porque o defeito só aparece na SEGUNDA volta.
 *
 * A rolha: `SKIPPED` era a ÚNICA decisão terminal que não tirava ninguém da
 * fila. `resolveAudience` devolve a fila ordenada e o ciclo leva os primeiros.
 * Cabeça de fila sem telefone válido ⇒ SKIPPED ⇒ volta na mesma posição ⇒ o
 * ciclo seguinte pega exatamente as mesmas pessoas. Para sempre.
 *
 * Retrato de produção (Railway, 22:20 / 22:30 / 22:40 UTC): 10 campanhas
 * devidas, 2.396 elegíveis, ZERO enviadas, e a contagem de elegíveis parada —
 * assinatura de fila que não anda.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";

const db = vi.hoisted(() => ({
  campaign: { findUnique: vi.fn(), update: vi.fn(), findMany: vi.fn() },
  campaignExecution: { findMany: vi.fn(), findFirst: vi.fn(), create: vi.fn(), createMany: vi.fn(), count: vi.fn(), groupBy: vi.fn() },
  tierSettings: { findMany: vi.fn() },
  crmCicloFunil: { create: vi.fn(), findMany: vi.fn() },
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
  getSafetyConfig: vi.fn(), getTodayGlobalSendCount: vi.fn(async () => 0), getWeekGlobalSendCount: vi.fn(async () => 0),
  checkQuietHours: vi.fn(() => null), checkWeekendBlock: vi.fn(() => null),
  randomDelayMs: vi.fn(() => 0), isBirthdayCampaign: vi.fn(() => false),
  BUDGET_EXEMPT_TEMPLATE_IDS: ["aniversariantes"],
}));
const contact = vi.hoisted(() => ({
  ContactSafetyService: { buildGlobalContext: vi.fn(async () => ({})), assertSendable: vi.fn(), applyInboundOptOut: vi.fn() },
}));

vi.mock("@/lib/prisma", () => ({ prisma: db }));
vi.mock("@/services/whatsapp/WhatsAppMessagingService", () => ({ WhatsAppMessagingService: channel }));
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

// ── A base: 100 pessoas. As 40 primeiras da fila têm telefone quebrado. ───────
// 40 é exatamente o teto por rodada (META_CLOUD_MAX_PER_RUN), então a rolha tem
// o tamanho certo para consumir o lote inteiro e não sobrar vaga para ninguém.
const TETO_DA_RODADA = 40;
const BASE = Array.from({ length: 100 }, (_, i) => ({
  id: `c${i}`,
  name: `Cliente ${i}`,
  // Sem telefone nas 40 primeiras: `isValidPhoneBR` reprova ⇒ SKIPPED.
  phone: i < TETO_DA_RODADA ? "" : `5511${String(900000000 + i)}`,
  tier: "BRONZE", segment: "FRIO", totalOrders: 1, totalSpend: 10, lastOrderAt: null,
}));

const CAMPAIGN = {
  id: "cmp1", restaurantId: "r1", name: "Recuperar clientes frios", status: "ACTIVE",
  message: "oi", templateId: "recuperar-frios", targetSegment: "recuperar-frios",
  campaignFamilyKey: null, messageFingerprint: "mf_1", dedupePolicy: null,
  objective: null, audienceConfig: null, couponCode: null,
  totalSent: 0,
  scheduleConfig: {
    mode: "RECURRING", weekdays: [0, 1, 2, 3, 4, 5, 6],
    timeWindow: { start: "00:00", end: "23:59" },
    // Alto de propósito: o limite diário da campanha não pode ser o que corta —
    // quem corta nesta prova é o teto por rodada, como em produção.
    dailyLimit: 200,
  },
};

/** Linhas de execução gravadas, o estado que sobrevive de um ciclo ao outro. */
type Linha = { customerId: string; status: string; failedReason: string | null; errorMessage: string | null; createdAt: Date; sentAt: Date | null };
let gravadas: Linha[] = [];

/**
 * `esconderSkipped` reproduz o MUNDO ANTERIOR ao conserto sem tocar no runner:
 * a consulta de exclusão pedia só BLOCKED/FAILED, então para efeito de fila era
 * como se as linhas SKIPPED não existissem. O runner executado é o real, nos
 * dois casos — o que muda é só o que o banco devolve.
 */
let esconderSkipped = false;

function montarBanco() {
  gravadas = [];
  db.campaign.findUnique.mockResolvedValue(CAMPAIGN);
  db.campaign.update.mockResolvedValue({});
  db.campaignExecution.create.mockImplementation(async ({ data }: { data: Linha & { status: string } }) => {
    gravadas.push({
      customerId: data.customerId, status: String(data.status),
      failedReason: data.failedReason ?? null, errorMessage: data.errorMessage ?? null,
      createdAt: new Date(), sentAt: data.sentAt ?? null,
    });
    return { id: `e${gravadas.length}` };
  });
  db.campaignExecution.createMany.mockResolvedValue({ count: 0 });
  db.campaignExecution.groupBy.mockResolvedValue([]);
  db.campaignExecution.count.mockResolvedValue(0);
  // Responde honrando o `where.status.in` que o runner de fato manda.
  db.campaignExecution.findMany.mockImplementation(async (args: { where?: { status?: { in?: string[] } } }) => {
    const querido = args?.where?.status?.in;
    if (!querido) return [];
    const visiveis = esconderSkipped ? gravadas.filter((l) => l.status !== "SKIPPED") : gravadas;
    return visiveis
      .filter((l) => querido.includes(l.status))
      .map((l) => ({ ...l }));
  });
  db.crmCicloFunil.create.mockResolvedValue({});
  db.tierSettings.findMany.mockResolvedValue([]);
  db.campaign.findMany.mockResolvedValue([CAMPAIGN]);
  db.restaurant.findUnique.mockResolvedValue({ name: "Sushi Cazza", slug: "sushicazza" });
  db.restaurantBrandConfig.findUnique.mockResolvedValue(null);
  db.whatsAppAgentConfig.findUnique.mockResolvedValue(null);
  db.customer.findMany.mockResolvedValue([]);
  db.metaWhatsAppConfig.findUnique.mockResolvedValue(null);
  db.customerCoupon.findMany.mockResolvedValue([]);
  db.conversation.findFirst.mockResolvedValue(null);
  db.conversation.create.mockResolvedValue({ id: "conv1" });
  db.message.create.mockResolvedValue({ id: "msg1" });
  // A audiência respeita `excluirIds` — igual ao `notIn` da consulta real — e
  // devolve na MESMA ordem sempre. É a ordem estável que cria a rolha.
  svc.resolveAudience.mockImplementation(async (_r: string, _s: string, _t: unknown, opts?: { excluirIds?: string[] }) => {
    const fora = new Set(opts?.excluirIds ?? []);
    return BASE.filter((c) => !fora.has(c.id)).slice(0, 500);
  });
  safety.getSafetyConfig.mockResolvedValue({
    dailyGlobalCap: 900, weeklyGlobalCap: 0, customerCooldownHours: 24,
    maxPerWeekPerCustomer: 5, quietHoursEnabled: false, sendOnWeekends: true,
    randomDelayEnabled: false, randomDelayMinSec: 0, randomDelayMaxSec: 0,
  });
  // TODAS as travas de destinatário passam. Ninguém está em opt-out, cooldown,
  // cap semanal ou fora da janela — o zero NÃO vem de trava, e é esse o ponto.
  contact.ContactSafetyService.assertSendable.mockResolvedValue({ sendable: true, reason: null });
  channel.getConnectionStatus.mockResolvedValue({ provider: "META_CLOUD_API", connected: true, detail: "+55 11 90000-0000" });
  channel.sendText.mockResolvedValue({ ok: true, provider: "META_CLOUD_API", status: "SENT", providerMessageId: "wamid1" });
  channel.sendTemplate.mockResolvedValue({ ok: true, provider: "META_CLOUD_API", status: "SENT", providerMessageId: "wamid1" });
  ledger.getImpactedByConcept.mockResolvedValue(new Set());
  ledger.getImpactedByMessage.mockResolvedValue(new Set());
}

beforeEach(() => {
  vi.clearAllMocks();
  esconderSkipped = false;
  vi.spyOn(ScheduledCampaignRunnerService, "isCampaignDueNow").mockReturnValue(true);
  montarBanco();
});

async function rodarCiclo() {
  return ScheduledCampaignRunnerService.runCampaignBatch("cmp1", {});
}

describe("O teto diário vira número a alcançar — o cano entupido do CRM", () => {
  it("ANTES: a fila não anda — elegíveis > 0 e enviados = 0 em TRÊS ciclos seguidos", async () => {
    esconderSkipped = true; // o mundo de antes do conserto

    const ciclos = [await rodarCiclo(), await rodarCiclo(), await rodarCiclo()];

    for (const c of ciclos) {
      expect(c.eligible).toBe(100);  // a fila inteira, intacta
      expect(c.sent).toBe(0);        // e zero saiu
    }
    // A assinatura do defeito em produção: a contagem de elegíveis NÃO SE MEXE.
    expect(new Set(ciclos.map((c) => c.eligible)).size).toBe(1);
    // As mesmas 40 pessoas foram puladas três vezes — 120 linhas, 40 pessoas.
    const pulados = gravadas.filter((l) => l.status === "SKIPPED");
    expect(pulados).toHaveLength(TETO_DA_RODADA * 3);
    expect(new Set(pulados.map((l) => l.customerId)).size).toBe(TETO_DA_RODADA);
    // E ninguém atrás da rolha foi alcançado.
    expect(channel.sendText).not.toHaveBeenCalled();
    expect(channel.sendTemplate).not.toHaveBeenCalled();
  });

  it("DEPOIS: com o conserto a fila anda — ciclo 1 destrava e o ciclo 2 já envia 40", async () => {
    const c1 = await rodarCiclo();
    expect(c1.eligible).toBe(100);
    expect(c1.sent).toBe(0);         // a rolha ainda é a cabeça da fila no 1º ciclo

    const c2 = await rodarCiclo();
    // A fila ANDOU: os 40 sem telefone saíram dela.
    expect(c2.eligible).toBe(100 - TETO_DA_RODADA);
    expect(c2.sent).toBe(TETO_DA_RODADA);

    const c3 = await rodarCiclo();
    expect(c3.sent).toBe(20);        // as 20 últimas da base

    // 60 pessoas alcançadas, que antes eram ZERO, para sempre.
    expect(c2.sent + c3.sent).toBe(60);
  });

  it("nenhuma trava foi alargada: quem o ContactSafetyService barra continua barrado", async () => {
    contact.ContactSafetyService.assertSendable.mockResolvedValue({
      sendable: false, reason: "CUSTOMER_WEEKLY_CAP_REACHED", detail: "Limite semanal atingido",
    });
    await rodarCiclo();
    await rodarCiclo();
    expect(channel.sendText).not.toHaveBeenCalled();
    expect(channel.sendTemplate).not.toHaveBeenCalled();
    expect(gravadas.every((l) => l.status === "BLOCKED")).toBe(true);
  });

  it("o corte do teto por rodada passa a deixar rastro (crm_ciclo_funil)", async () => {
    await rodarCiclo();
    const registro = db.crmCicloFunil.create.mock.calls[0]![0].data;
    expect(registro.elegiveis).toBe(100);
    expect(registro.noLote).toBe(TETO_DA_RODADA);
    expect(registro.cortados).toBe(100 - TETO_DA_RODADA);
    expect(registro.motivoDoCorte).toBe("TETO_DA_RODADA");
    // A conta do ciclo fecha na origem: elegíveis = lote + cortados.
    expect(registro.noLote + registro.cortados).toBe(registro.elegiveis);
  });

  it("em dryRun nada é gravado — a régua não pode escrever no banco em prévia", async () => {
    await ScheduledCampaignRunnerService.runCampaignBatch("cmp1", { dryRun: true });
    expect(db.crmCicloFunil.create).not.toHaveBeenCalled();
    expect(db.campaignExecution.create).not.toHaveBeenCalled();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// O PORTÃO DE INTERVALO: "última RODADA DE CAMPANHA", não "última linha qualquer"
// ─────────────────────────────────────────────────────────────────────────────
describe("o intervalo mínimo entre ciclos conta a rodada certa", () => {
  /**
   * `campaign_executions` não é só do CRM de campanhas: o carrinho abandonado
   * grava linha ali A CADA MINUTO, com o id da campanha DELE. O portão olhava
   * qualquer linha do restaurante — então uma linha de carrinho de 1 minuto
   * atrás fazia o CRM inteiro pular o ciclo. ~25% da cadência, para sempre.
   */
  const AGORA = Date.now();
  const haUmMinuto = new Date(AGORA - 60_000);

  function ligarOrcamento() {
    safety.getSafetyConfig.mockResolvedValue({
      dailyGlobalCap: 900, weeklyGlobalCap: 0, customerCooldownHours: 24,
      maxPerWeekPerCustomer: 5, quietHoursEnabled: false, sendOnWeekends: true,
      randomDelayEnabled: false, randomDelayMinSec: 0, randomDelayMaxSec: 0,
      crmWhatsAppSafety: {
        enabled: true, providerMode: "META_CLOUD", globalDailyLimit: 900,
        globalCycleLimit: 40, minMinutesBetweenCycles: 9, distributionMode: "MANUAL",
        stopOnInstanceDisconnected: true, pauseOnFailureRatePercent: 50,
        maxConsecutiveProviderFailures: 3,
      },
    });
  }

  it("uma linha do CARRINHO de 1 minuto atrás NÃO pula mais o ciclo", async () => {
    ligarOrcamento();
    // O banco honra o filtro: a linha existe, mas é de outra campanha.
    db.campaignExecution.findFirst.mockImplementation(async (args: { where?: { campaignId?: { in?: string[] } } }) => {
      const pedidos = args?.where?.campaignId?.in;
      if (pedidos && !pedidos.includes("campanha-do-carrinho")) return null;
      return { createdAt: haUmMinuto };
    });

    const r = await ScheduledCampaignRunnerService.runDueCampaigns({ restaurantId: "r1" });

    expect(r.results.some((x) => /intervalo mínimo/i.test(x.reason ?? ""))).toBe(false);
    // A consulta passou a ser escopada às campanhas da rodada — a prova de que
    // o portão pergunta "última rodada de campanha", não "última linha qualquer".
    const where = db.campaignExecution.findFirst.mock.calls[0]![0].where;
    expect(where.campaignId.in).toEqual(["cmp1"]);
  });

  it("FAIL-CLOSED preservado: rodada de CAMPANHA recente ainda segura o ciclo", async () => {
    ligarOrcamento();
    db.campaignExecution.findFirst.mockResolvedValue({ createdAt: haUmMinuto });

    const r = await ScheduledCampaignRunnerService.runDueCampaigns({ restaurantId: "r1" });

    expect(r.totalSent).toBe(0);
    expect(r.results.every((x) => /intervalo mínimo/i.test(x.reason ?? ""))).toBe(true);
  });
});

describe("o alarme da capacidade ociosa aparece — não fica quieto", () => {
  it("emite log estruturado GRAVE quando podia 900 e mandou pouco", async () => {
    safety.getSafetyConfig.mockResolvedValue({
      dailyGlobalCap: 900, weeklyGlobalCap: 0, customerCooldownHours: 24,
      maxPerWeekPerCustomer: 5, quietHoursEnabled: false, sendOnWeekends: true,
      randomDelayEnabled: false, randomDelayMinSec: 0, randomDelayMaxSec: 0,
      crmWhatsAppSafety: { enabled: false },
    });
    safety.getTodayGlobalSendCount.mockResolvedValue(60); // o caso do CEO
    db.campaignExecution.findFirst.mockResolvedValue(null);
    const aviso = vi.spyOn(console, "warn").mockImplementation(() => {});

    await ScheduledCampaignRunnerService.runDueCampaigns({ restaurantId: "r1" });

    const chamada = aviso.mock.calls.find((c) => c[0] === "[crm-capacidade-ociosa]");
    expect(chamada, "o alarme tem de sair no log").toBeDefined();
    expect(chamada![1]).toMatchObject({
      restaurantId: "r1", nivel: "GRAVE", podiaHoje: 900, enviouHoje: 60, sobraDoDia: 840,
    });
    aviso.mockRestore();
  });
});
