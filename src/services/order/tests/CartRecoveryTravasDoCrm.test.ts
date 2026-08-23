/**
 * O PORTÃO DO CRM NA RECUPERAÇÃO DE CARRINHO — NA MEDIDA CERTA.
 *
 * Duas correções em 23/08/2026, no mesmo dia, e a segunda desfaz metade da
 * primeira. As duas ficam registradas aqui, porque a segunda só faz sentido
 * quem souber da primeira.
 *
 * ── DE MANHÃ: o defeito real ────────────────────────────────────────────────
 * A recuperação de carrinho nunca passava pelo `ContactSafetyService`. Quem
 * tinha pedido para sair (opt-out) RECEBIA por este caminho. Isso é LGPD, não é
 * preferência de tela. **Consertado, e não se discute.**
 *
 * ── À TARDE: o excesso, corrigido pelo CEO ──────────────────────────────────
 * Junto com o opt-out entraram as regras de ABORDAGEM — janela de silêncio
 * 21h–8h, intervalo de 24 h, teto semanal. Foi erro. A pergunta que derrubou:
 *
 *   "O carrinho abandonado tem que ser executado dois minutos depois que o
 *    cliente fecha. Por que você está preocupado com a madrugada?"
 *
 * Recuperação de carrinho **não é abordagem**: é resposta a um ato do próprio
 * cliente, dois minutos depois de ele mexer no carrinho, com trinta minutos de
 * validade e sem fila — barrado agora, morre. Quem abandonou há dois minutos
 * não está dormindo. E casa de sushi vende à noite: silenciar das 21h às 8h
 * mata a função na hora em que ela serve.
 *
 * A trava certa já existia: **loja aberta no instante do abandono** (regra 9).
 *
 * ── O QUE ESTE ARQUIVO TRAVA ────────────────────────────────────────────────
 *   • opt-out barra — nas duas metades;
 *   • 23h com a loja ABERTA **manda** (este é o caso que reprova contra o
 *     código que está em produção agora, onde ele é barrado);
 *   • campanha de manhã **não** mata a recuperação da noite;
 *   • a guarda que de fato limita repetição — uma por cliente a cada 24 h, do
 *     próprio fluxo — continua de pé.
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

  it("o opt-out não tem exceção de horário: às 23h, com a loja aberta, segue barrado", async () => {
    // O afrouxamento do horário é sobre HORÁRIO. Não pode virar, por descuido,
    // um afrouxamento do opt-out — que é o único item aqui que é lei, não regra
    // de produto.
    vi.setSystemTime(ONZE_DA_NOITE);
    tick();
    db.customer.findUnique.mockResolvedValue({ hasOptedOut: true, crmContactable: false });

    const r = await rodar();

    expect(r.sent).toBe(0);
    expect(r.skippedSafety).toBe(1);
    expect(wa.sendText).not.toHaveBeenCalled();
  });
});

// ─── 2. JANELA DE SILÊNCIO ───────────────────────────────────────────────────

describe("a janela de silêncio 21h–8h NÃO governa a recuperação de carrinho", () => {
  it("MANDA às 23h com a loja ABERTA — quem abandonou há 2 min não está dormindo", async () => {
    // ⭐ ESTE É O CASO DO CEO. Contra o código que está em produção agora
    // (silêncio ligado neste caminho), este teste é VERMELHO.
    vi.setSystemTime(ONZE_DA_NOITE);
    tick();

    const r = await rodar();

    expect(r.sent).toBe(1);
    expect(r.skippedSafety).toBe(0);
    expect(wa.sendText).toHaveBeenCalledTimes(1);
  });

  it("MANDA às 15h também — o horário simplesmente não é a pergunta aqui", async () => {
    vi.setSystemTime(MEIO_DA_TARDE);
    tick();

    const r = await rodar();

    expect(r.sent).toBe(1);
    expect(r.skippedSafety).toBe(0);
  });

  it("quem manda no horário é a LOJA ABERTA: fechada às 23h, não sai", async () => {
    // A trava certa, que já existia antes de tudo isto (regra 9). Ela pergunta
    // pelo instante do abandono, não por "agora", e é ela que ocupa o papel que
    // a janela de silêncio ocuparia mal.
    vi.setSystemTime(ONZE_DA_NOITE);
    tick();
    horario.isRestaurantOpenNow.mockResolvedValue(false);

    const r = await rodar();

    expect(r.sent).toBe(0);
    expect(r.skippedRestaurantClosed).toBe(1);
    expect(r.skippedSafety).toBe(0); // recusa da guarda própria, não do portão
    expect(carimbos()).toHaveLength(0); // e não queima o carrinho
  });
});

// ─── 3. INTERVALO DE 24 H ────────────────────────────────────────────────────

describe("o intervalo de 24 h do CRM não vale — mas a guarda própria vale", () => {
  it("MANDA: recebeu campanha há 1 hora e abandonou carrinho agora", async () => {
    // ⭐ Também VERMELHO contra o código em produção agora. Uma campanha da
    // manhã não pode matar a resposta a um ato que o cliente fez à noite: são
    // dois atos distintos, e o segundo é dele.
    tick();
    db.campaignExecution.findMany.mockResolvedValue([
      { campaignId: "campanha-da-manha", sentAt: new Date(Date.now() - 1 * HORA) },
    ]);

    const r = await rodar();

    expect(r.sent).toBe(1);
    expect(r.skippedSafety).toBe(0);
  });

  it("A GUARDA QUE VALE: uma recuperação por cliente a cada 24 h — a segunda não sai", async () => {
    // Esta é a regra 5, do próprio fluxo, e é ela que sempre limitou repetição.
    // Ela vem do `lastRecoveryAt` do rascunho, é global entre restaurantes, e
    // NÃO depende do portão do CRM. O intervalo do CRM era, nesta parte,
    // duplicata dela — e na parte que não era, era perda de venda.
    db.orderDraft.findMany.mockImplementation(async (args: { where?: Record<string, unknown> }) =>
      args?.where && "lastRecoveryAt" in args.where
        ? [{ customerId: CLIENTE, restaurantId: REST }] // já recebeu nas últimas 24h
        : [rascunho(5)],
    );
    db.orderDraft.count.mockResolvedValue(0);
    db.orderDraft.update.mockResolvedValue({});
    db.restaurantCRMProfile.findMany.mockResolvedValue([]);
    db.restaurantCRMProfile.findUnique.mockResolvedValue(null);
    db.campaign.findMany.mockResolvedValue([]);
    db.campaignExecution.findMany.mockResolvedValue([]);
    db.campaignExecution.count.mockResolvedValue(0);
    db.customer.findUnique.mockResolvedValue({ hasOptedOut: false, crmContactable: true });
    db.metaWhatsAppConfig.findMany.mockResolvedValue([]);
    db.order.findMany.mockResolvedValue([]);
    db.order.findFirst.mockResolvedValue(null);
    db.conversation.findFirst.mockResolvedValue({ id: "conv-1" });
    db.$transaction.mockResolvedValue([]);
    meta.getResolved.mockResolvedValue({ restaurantId: REST, phoneNumberId: "123", accessToken: "tok" });
    wa.sendText.mockResolvedValue(ENVIADO);
    horario.isRestaurantOpenNow.mockResolvedValue(true);

    const r = await rodar();

    expect(r.sent).toBe(0);
    expect(r.skippedDailyLimit).toBe(1);
    expect(wa.sendText).not.toHaveBeenCalled();
  });
});

// ─── 4. O que veio junto, e o que NÃO veio ──────────────────────────────────

describe("o que mais entra e o que fica de fora, de propósito", () => {
  it("o teto semanal por cliente (5/semana) também NÃO vale aqui", async () => {
    // Mesmo motivo do intervalo: ele mede abordagem repetida. Cinco campanhas na
    // semana não tiram do cliente o direito de ser lembrado do carrinho que ELE
    // acabou de abandonar. Quem limita repetição de recuperação é a regra 5.
    tick();
    db.campaignExecution.findMany.mockResolvedValue(
      [2, 3, 4, 5, 6].map((d) => ({ campaignId: `c${d}`, sentAt: new Date(Date.now() - d * 24 * HORA) })),
    );

    const r = await rodar();

    expect(r.sent).toBe(1);
    expect(r.skippedSafety).toBe(0);
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
