/**
 * A recuperação de carrinho passou a deixar rastro por pessoa.
 *
 * O DEFEITO ANTIGO (até 05/08/2026)
 * O envio de recuperação nunca gravava uma linha em `campaign_executions`. Isso
 * tinha três consequências que pareciam três bugs diferentes:
 *   1. a tela de Campanhas não tinha o que somar — daí "Enviados: —";
 *   2. a atribuição de receita (que parte de `campaignExecution`) nunca creditou
 *      um centavo ao carrinho, mesmo quando o cliente voltou e comprou;
 *   3. envio bem-sucedido e "não aconteceu nada" ficavam idênticos no banco.
 *
 * `src/lib/crm-safety.ts` chegou a documentar o buraco em uma linha de
 * comentário — "cart recovery ... never created executions here anyway" — sem
 * que ninguém notasse que aquilo era a explicação dos traços na tela.
 *
 * A METADE QUE REPRODUZ O COMPORTAMENTO ANTIGO:
 * `describe("o rastro que não existia")` — se alguém remover a gravação, esses
 * testes caem apontando exatamente o sintoma que o CEO viu.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

const db = vi.hoisted(() => ({
  orderDraft:           { findMany: vi.fn(), count: vi.fn(), update: vi.fn() },
  // O portão unificado do CRM entrou no caminho da recuperação em 23/08/2026;
  // estas três leituras são dele (regras do restaurante, quanto já saiu hoje,
  // histórico do contato + opt-out). Sem elas o portão falha fechado e NADA sai —
  // o que é a prova, ao contrário, de que ele está mesmo no caminho do envio.
  restaurantCRMProfile: { findMany: vi.fn(), findUnique: vi.fn() },
  campaign:             { findMany: vi.fn(), update: vi.fn() },
  campaignExecution:    { create: vi.fn(), findMany: vi.fn(), count: vi.fn() },
  customer:             { findUnique: vi.fn() },
  metaWhatsAppConfig:   { findMany: vi.fn() },
  order:                { findMany: vi.fn(), findFirst: vi.fn() },
  conversation:         { findFirst: vi.fn(), create: vi.fn(), update: vi.fn() },
  message:              { create: vi.fn() },
  $transaction:         vi.fn(),
}));
const meta    = vi.hoisted(() => ({ getResolved: vi.fn() }));
const wa      = vi.hoisted(() => ({ sendText: vi.fn() }));
const horario = vi.hoisted(() => ({ isRestaurantOpenNow: vi.fn() }));

vi.mock("@/lib/prisma", () => ({ prisma: db }));
vi.mock("@/services/whatsapp/MetaConfigService", () => ({ MetaConfigService: meta }));
vi.mock("@/services/whatsapp/WhatsAppMessagingService", () => ({ WhatsAppMessagingService: wa }));
vi.mock("@/lib/business-hours", () => ({ isRestaurantOpenNow: horario.isRestaurantOpenNow }));

import { OrderDraftRecoverySendService } from "../OrderDraftRecoverySendService";

const REST = "rest-1";

const CANDIDATO = {
  id:           "draft-1",
  restaurantId: REST,
  customerId:   "cust-1",
  updatedAt:    new Date(Date.now() - 10 * 60_000),
  customer:     { id: "cust-1", name: "Ana Souza", phone: "+5511999990000" },
  restaurant:   { slug: "pizzaria-demo", name: "Pizzaria Demo" },
};

/** A linha de Campanha do carrinho — é a ela que a execução se pendura. */
const LINHA_DO_CARRINHO = {
  id: "camp-cart", restaurantId: REST, status: "ACTIVE",
  message: "Oi, {nome}! Seu carrinho ainda tá aqui 🛒 {link_cardapio}",
  scheduleConfig: {}, audienceConfig: {},
};

const ENVIADO  = { ok: true, provider: "META_CLOUD_API", status: "SENT", providerMessageId: "wamid.1" };
const BLOQUEIO = {
  ok: false, provider: "META_CLOUD_API", status: "BLOCKED", providerMessageId: null,
  blockReason: "META_TEMPLATE_REQUIRED", error: "fora da janela de 24h",
};

function tick({ comLinhaDeCampanha }: { comLinhaDeCampanha: boolean }) {
  db.orderDraft.findMany.mockImplementation(async (args: { where?: Record<string, unknown> }) =>
    args?.where && "lastRecoveryAt" in args.where ? [] : [CANDIDATO],
  );
  db.orderDraft.count.mockResolvedValue(0);
  db.orderDraft.update.mockResolvedValue({});
  db.restaurantCRMProfile.findMany.mockResolvedValue([]);
  db.campaign.findMany.mockResolvedValue(comLinhaDeCampanha ? [LINHA_DO_CARRINHO] : []);
  db.campaign.update.mockResolvedValue({});
  db.campaignExecution.create.mockResolvedValue({ id: "exec-1" });
  db.metaWhatsAppConfig.findMany.mockResolvedValue([]);
  db.order.findMany.mockResolvedValue([]);
  db.order.findFirst.mockResolvedValue(null);
  db.conversation.findFirst.mockResolvedValue({ id: "conv-1" });
  db.$transaction.mockResolvedValue([]);
  horario.isRestaurantOpenNow.mockResolvedValue(true);
  meta.getResolved.mockResolvedValue({ restaurantId: REST, phoneNumberId: "123", accessToken: "tok" });
  // ── Portão unificado do CRM: tudo liberado neste cenário-base ──────────────
  // Cliente sem opt-out, sem histórico de mensagem recente, nada enviado hoje.
  //
  // `manualOverride: true` + `quietHoursEnabled: false` NÃO é para afrouxar
  // nada: é para o relógio do CI não decidir o resultado. Com a configuração
  // padrão a janela de silêncio é 21h–8h de São Paulo, e este arquivo — que é
  // sobre MEDIÇÃO — passaria de dia e falharia de madrugada. A janela de
  // silêncio tem teste próprio, com hora fixa, em CartRecoveryTravasDoCrm.
  db.restaurantCRMProfile.findUnique.mockResolvedValue({
    whatsAppSafetyConfig: { manualOverride: true, quietHoursEnabled: false },
  });
  db.campaignExecution.findMany.mockResolvedValue([]);
  db.campaignExecution.count.mockResolvedValue(0);
  db.customer.findUnique.mockResolvedValue({ hasOptedOut: false, crmContactable: true });
}

function execucaoGravada() {
  return db.campaignExecution.create.mock.calls[0]?.[0]?.data as {
    campaignId: string; restaurantId: string; customerId: string;
    customerPhone: string; messageText: string; status: string; sentAt: Date | null;
    failedReason: string | null; errorMessage: string | null;
  } | undefined;
}

beforeEach(() => vi.clearAllMocks());

describe("o rastro que não existia", () => {
  it("um envio bem-sucedido grava a execução na campanha do carrinho", async () => {
    tick({ comLinhaDeCampanha: true });
    wa.sendText.mockResolvedValue(ENVIADO);

    const r = await OrderDraftRecoverySendService.sendCartRecoveryMessages({ restaurantId: REST });

    expect(r.sent).toBe(1);
    const e = execucaoGravada();
    expect(e, "sem esta linha, a tela mostra traço mesmo tendo enviado").toBeDefined();
    expect(e!.campaignId).toBe("camp-cart");
    expect(e!.restaurantId).toBe(REST);
    expect(e!.customerId).toBe("cust-1");
    expect(e!.status).toBe("SENT");
    expect(e!.sentAt).toBeInstanceOf(Date);
    expect(e!.messageText, "o texto que a pessoa recebeu, não vazio").toContain("Ana");
  });

  it("o contador da campanha sobe junto — é ele que a tabela 'Campanhas ativas' lê", async () => {
    tick({ comLinhaDeCampanha: true });
    wa.sendText.mockResolvedValue(ENVIADO);

    await OrderDraftRecoverySendService.sendCartRecoveryMessages({ restaurantId: REST });

    const up = db.campaign.update.mock.calls[0]?.[0] as { where: { id: string }; data: Record<string, unknown> };
    expect(up.where.id).toBe("camp-cart");
    expect(up.data.totalSent).toEqual({ increment: 1 });
  });

  it("falha de envio também deixa rastro — falha invisível é o pior dos dois mundos", async () => {
    tick({ comLinhaDeCampanha: true });
    wa.sendText.mockResolvedValue({
      ok: false, provider: "META_CLOUD_API", status: "FAILED",
      providerMessageId: null, errorCode: "META_131026", error: "recipient not available",
    });

    const r = await OrderDraftRecoverySendService.sendCartRecoveryMessages({ restaurantId: REST });

    expect(r.failed).toBe(1);
    expect(execucaoGravada()!.status).toBe("FAILED");
    expect(execucaoGravada()!.errorMessage).toContain("META_131026");
  });

  it("recusa de política vira BLOCKED, nunca FAILED — bloqueio não é erro de entrega", async () => {
    tick({ comLinhaDeCampanha: true });
    wa.sendText.mockResolvedValue(BLOQUEIO);

    const r = await OrderDraftRecoverySendService.sendCartRecoveryMessages({ restaurantId: REST });

    expect(r.skippedTemplateRequired).toBe(1);
    expect(r.failed, "política da Meta não é falha").toBe(0);
    expect(execucaoGravada()!.status).toBe("BLOCKED");
    expect(execucaoGravada()!.errorMessage).toBe("META_TEMPLATE_REQUIRED");
    // Bloqueio não conta como enviado nem como falha no contador da campanha.
    expect(db.campaign.update).not.toHaveBeenCalled();
  });
});

describe("registrar nunca pode custar o envio", () => {
  it("se a gravação da execução explodir, a mensagem continua contando como enviada", async () => {
    tick({ comLinhaDeCampanha: true });
    wa.sendText.mockResolvedValue(ENVIADO);
    db.campaignExecution.create.mockRejectedValue(new Error("banco indisponível"));
    const logWarn = vi.spyOn(console, "warn").mockImplementation(() => {});

    const r = await OrderDraftRecoverySendService.sendCartRecoveryMessages({ restaurantId: REST });

    expect(r.sent, "medir é importante; entregar é mais").toBe(1);
    expect(r.failed).toBe(0);
    expect(logWarn).toHaveBeenCalled();
    logWarn.mockRestore();
  });

  it("sem linha de Campanha não há a que pendurar a execução — e o envio sai igual", async () => {
    // Estado da maioria das lojas: o dono nunca abriu "Gerenciar" no carrinho.
    // Elas continuam medidas pelo carimbo no rascunho (CartRecoveryHealthService);
    // o que não existe é o número POR CAMPANHA.
    tick({ comLinhaDeCampanha: false });
    wa.sendText.mockResolvedValue(ENVIADO);

    const r = await OrderDraftRecoverySendService.sendCartRecoveryMessages({ restaurantId: REST });

    expect(r.sent).toBe(1);
    expect(db.campaignExecution.create).not.toHaveBeenCalled();
  });

  it("em simulação nada é gravado — dry-run não pode sujar a medição", async () => {
    tick({ comLinhaDeCampanha: true });

    const r = await OrderDraftRecoverySendService.sendCartRecoveryMessages({ restaurantId: REST, dryRun: true });

    expect(r.sent).toBe(1); // no dry-run "sent" é o que SAIRIA
    expect(db.campaignExecution.create).not.toHaveBeenCalled();
    expect(wa.sendText).not.toHaveBeenCalled();
  });
});
