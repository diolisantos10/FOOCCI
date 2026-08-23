/**
 * A RECUPERAÇÃO DE CARRINHO ESTAVA FORA DO PORTÃO DO CRM.
 *
 * O rodapé da tela de Regras de Segurança promete quatro "proteções sempre
 * ativas". Neste caminho, três delas não valiam — ele nunca passava pelo
 * `ContactSafetyService`, só pelas guardas próprias (1 por rascunho, 1 por
 * cliente por dia, loja aberta no abandono):
 *
 *   1. quem pediu para sair (opt-out) RECEBIA por aqui. Isso é LGPD, não é
 *      preferência de tela;
 *   2. a janela de silêncio 21h–8h era ignorada — loja aberta às 23h virava
 *      mensagem às 23h;
 *   3. o intervalo de 24 h entre mensagens de CRM não era consultado — dava
 *      para receber campanha de manhã e recuperação de carrinho à tarde.
 *
 * Cada bloco abaixo prova as DUAS metades: a que manda quando deve, e a que não
 * manda quando não deve. Teste que passa nos dois lados não prova nada — e cada
 * metade "NÃO MANDA" daqui **falha** contra o código antigo, onde a mensagem
 * saía.
 *
 * As guardas próprias da recuperação continuam valendo: isto SOMA travas, não
 * troca. E o rascunho bloqueado NÃO é carimbado — ele não é queimado por um
 * bloqueio que pode passar no próximo tick.
 *
 * Nenhum teste toca rede: Meta e WhatsApp são dublês. Nenhuma mensagem sai.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const db = vi.hoisted(() => ({
  orderDraft:           { findMany: vi.fn(), count: vi.fn(), update: vi.fn() },
  restaurantCRMProfile: { findMany: vi.fn(), findUnique: vi.fn() },
  campaign:             { findMany: vi.fn(), update: vi.fn() },
  campaignExecution:    { findMany: vi.fn(), count: vi.fn(), create: vi.fn() },
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

const REST    = "rest-1";
const CLIENTE = "cust-1";
const MINUTO  = 60_000;
const HORA    = 60 * MINUTO;
const ENVIADO = { ok: true, provider: "META_CLOUD_API", status: "SENT", providerMessageId: "wamid.1" };

/**
 * Horas fixas, em UTC, para não deixar o relógio do CI decidir o resultado.
 * São Paulo é UTC−3: 18:00Z = 15h (dia claro) · 02:00Z = 23h da véspera (silêncio).
 */
const MEIO_DA_TARDE = new Date("2026-08-24T18:00:00Z"); // 15:00 em São Paulo
const ONZE_DA_NOITE = new Date("2026-08-24T02:00:00Z"); // 23:00 de 23/08 em São Paulo

function rascunho(paradoHaMinutos: number) {
  return {
    id:           "draft-1",
    restaurantId: REST,
    customerId:   CLIENTE,
    updatedAt:    new Date(Date.now() - paradoHaMinutos * MINUTO),
    customer:     { id: CLIENTE, name: "Ana Souza", phone: "+5511999990000" },
    restaurant:   { slug: "pizzaria-demo", name: "Pizzaria Demo" },
  };
}

/** Um tick com um carrinho abandonado há 5 min e tudo o mais liberado. */
function tick() {
  db.orderDraft.findMany.mockImplementation(async (args: { where?: Record<string, unknown> }) =>
    args?.where && "lastRecoveryAt" in args.where ? [] : [rascunho(5)],
  );
  db.orderDraft.count.mockResolvedValue(0);
  db.orderDraft.update.mockResolvedValue({});
  db.restaurantCRMProfile.findMany.mockResolvedValue([]);
  // Configuração PADRÃO do restaurante (modo seguro): janela de silêncio 21h–8h,
  // intervalo de 24 h por cliente, 5 mensagens por cliente por semana.
  db.restaurantCRMProfile.findUnique.mockResolvedValue(null);
  db.campaign.findMany.mockResolvedValue([]);
  db.campaignExecution.findMany.mockResolvedValue([]); // sem histórico recente
  db.campaignExecution.count.mockResolvedValue(0);     // nada enviado hoje
  db.campaignExecution.create.mockResolvedValue({ id: "exec-1" });
  db.customer.findUnique.mockResolvedValue({ hasOptedOut: false, crmContactable: true });
  db.metaWhatsAppConfig.findMany.mockResolvedValue([]);
  db.order.findMany.mockResolvedValue([]);
  db.order.findFirst.mockResolvedValue(null);
  db.conversation.findFirst.mockResolvedValue({ id: "conv-1" });
  db.$transaction.mockResolvedValue([]);
  meta.getResolved.mockResolvedValue({ restaurantId: REST, phoneNumberId: "123", accessToken: "tok" });
  wa.sendText.mockResolvedValue(ENVIADO);
  horario.isRestaurantOpenNow.mockResolvedValue(true); // loja aberta, inclusive às 23h
}

/** Carimbos de recuperação gravados no rascunho neste tick. */
function carimbos() {
  return db.orderDraft.update.mock.calls.filter(
    (c) => (c[0] as { data?: Record<string, unknown> })?.data?.recoveryAttempts !== undefined,
  );
}

const rodar = () => OrderDraftRecoverySendService.sendCartRecoveryMessages({ restaurantId: REST });

beforeEach(() => {
  vi.clearAllMocks();
  // Só o relógio é dublê; timers continuam reais (o serviço não usa setTimeout).
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(MEIO_DA_TARDE);
  vi.spyOn(console, "info").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.useRealTimers();
});

// ─── 1. OPT-OUT ──────────────────────────────────────────────────────────────

describe("quem pediu para sair não recebe — nem por este caminho", () => {
  it("MANDA: cliente sem opt-out recebe a recuperação", async () => {
    tick();

    const r = await rodar();

    expect(r.sent).toBe(1);
    expect(r.skippedSafety).toBe(0);
  });

  it("NÃO MANDA: cliente com opt-out — antes ele RECEBIA por aqui", async () => {
    tick();
    db.customer.findUnique.mockResolvedValue({ hasOptedOut: true, crmContactable: false });

    const r = await rodar();

    expect(r.sent).toBe(0);
    expect(r.skippedSafety).toBe(1);
    expect(wa.sendText).not.toHaveBeenCalled();
  });

  it("NÃO MANDA: marcado como não-contactável, mesmo sem opt-out formal", async () => {
    tick();
    db.customer.findUnique.mockResolvedValue({ hasOptedOut: false, crmContactable: false });

    const r = await rodar();

    expect(r.sent).toBe(0);
    expect(r.skippedSafety).toBe(1);
    expect(wa.sendText).not.toHaveBeenCalled();
  });
});

// ─── 2. JANELA DE SILÊNCIO ───────────────────────────────────────────────────

describe("janela de silêncio 21h–8h — de madrugada não se cutuca ninguém", () => {
  it("MANDA: 15h, dentro do horário permitido", async () => {
    vi.setSystemTime(MEIO_DA_TARDE);
    tick();

    const r = await rodar();

    expect(r.sent).toBe(1);
    expect(r.skippedSafety).toBe(0);
  });

  it("NÃO MANDA: 23h, com a loja ABERTA — antes a mensagem saía assim mesmo", async () => {
    vi.setSystemTime(ONZE_DA_NOITE);
    tick();

    const r = await rodar();

    expect(r.sent).toBe(0);
    expect(r.skippedSafety).toBe(1);
    expect(wa.sendText).not.toHaveBeenCalled();
  });

  it("o rascunho bloqueado às 23h NÃO é carimbado — não se queima o carrinho", async () => {
    vi.setSystemTime(ONZE_DA_NOITE);
    tick();

    await rodar();

    // Sem carimbo, ele continua elegível enquanto a janela de entrega durar.
    // Bloqueio por horário não pode gastar a única chance daquele carrinho.
    expect(carimbos()).toHaveLength(0);
  });
});

// ─── 3. INTERVALO DE 24 H ────────────────────────────────────────────────────

describe("intervalo de 24 h entre mensagens de CRM", () => {
  it("MANDA: nenhuma mensagem de CRM recente para este cliente", async () => {
    tick();

    const r = await rodar();

    expect(r.sent).toBe(1);
  });

  it("NÃO MANDA: recebeu campanha há 1 hora — antes a recuperação saía por cima", async () => {
    tick();
    db.campaignExecution.findMany.mockResolvedValue([
      { campaignId: "campanha-da-manha", sentAt: new Date(Date.now() - 1 * HORA) },
    ]);

    const r = await rodar();

    expect(r.sent).toBe(0);
    expect(r.skippedSafety).toBe(1);
    expect(wa.sendText).not.toHaveBeenCalled();
  });

  it("MANDA de novo: a mensagem anterior tem 30 h — o intervalo já passou", async () => {
    tick();
    db.campaignExecution.findMany.mockResolvedValue([
      { campaignId: "campanha-antiga", sentAt: new Date(Date.now() - 30 * HORA) },
    ]);

    const r = await rodar();

    expect(r.sent).toBe(1);
    expect(r.skippedSafety).toBe(0);
  });
});

// ─── 4. O que veio junto, e o que NÃO veio ──────────────────────────────────

describe("o que mais entra e o que fica de fora, de propósito", () => {
  it("teto semanal por cliente (5/semana) também passa a valer aqui", async () => {
    tick();
    // Cinco mensagens espalhadas na semana, todas fora das últimas 24 h.
    db.campaignExecution.findMany.mockResolvedValue(
      [2, 3, 4, 5, 6].map((d) => ({ campaignId: `c${d}`, sentAt: new Date(Date.now() - d * 24 * HORA) })),
    );

    const r = await rodar();

    expect(r.sent).toBe(0);
    expect(r.skippedSafety).toBe(1);
  });

  it("o teto DIÁRIO continua isento — decisão registrada, medir não pode custar envio", async () => {
    tick();
    // Muito acima de qualquer teto diário: a recuperação sai assim mesmo.
    db.campaignExecution.count.mockResolvedValue(99_999);

    const r = await rodar();

    expect(r.sent).toBe(1);
  });

  it("se as regras de segurança não puderem ser lidas, NADA sai (falha fechada)", async () => {
    tick();
    db.restaurantCRMProfile.findUnique.mockRejectedValue(new Error("banco fora"));

    const r = await rodar();

    expect(r.sent).toBe(0);
    expect(r.skippedSafety).toBe(1);
    expect(wa.sendText).not.toHaveBeenCalled();
    // E o carrinho não é queimado por um problema que não é dele.
    expect(carimbos()).toHaveLength(0);
  });

  it("as guardas próprias continuam de pé: loja fechada no abandono ainda recusa", async () => {
    tick();
    horario.isRestaurantOpenNow.mockResolvedValue(false);

    const r = await rodar();

    expect(r.sent).toBe(0);
    expect(r.skippedRestaurantClosed).toBe(1);
    // Recusa da guarda própria, não do portão do CRM — cada motivo no seu contador.
    expect(r.skippedSafety).toBe(0);
  });
});
