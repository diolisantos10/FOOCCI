/**
 * Carrinho abandonado — a regra da loja fechada e a janela de entrega.
 *
 * DECISÃO DO CEO, 05/08/2026:
 *   "A mensagem de carrinho tem que ser enviada quando o cliente fecha o Foocci
 *    e 2 min depois mandar. Se o cliente abre de madrugada não precisa enviar
 *    nada, porque ele queria comer de madrugada e não quando o restaurante
 *    abrir."
 *
 * O que mudou no motor:
 *   · a pergunta do horário passou a ser sobre o INSTANTE DO ABANDONO
 *     (`updatedAt + inatividade`), não sobre "agora";
 *   · loja fechada naquele instante é recusa DEFINITIVA — antes era adiamento,
 *     e o adiamento prometia uma segunda chance que o prazo de 6 h nunca
 *     deixava acontecer (diagnóstico do `crm`, 05/08, item c);
 *   · nasceu a JANELA DE ENTREGA: passou de 30 min do abandono, a mensagem não
 *     sai mais — nem naquele tick, nem em nenhum outro.
 *
 * Cada regra é provada nas DUAS metades: a que manda quando deve, e a que NÃO
 * manda quando não deve. A segunda é a que importa aqui — o risco deste bloco
 * nunca foi deixar de enviar; era enviar em cima de carrinho velho.
 *
 * Nenhum teste toca rede: Meta e WhatsApp são dublês.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

const db = vi.hoisted(() => ({
  orderDraft:           { findMany: vi.fn(), count: vi.fn(), update: vi.fn() },
  // O portão unificado do CRM entrou no caminho da recuperação em 23/08/2026;
  // estas três leituras são dele (regras do restaurante, quanto já saiu hoje,
  // histórico do contato + opt-out). Sem elas o portão falha fechado e NADA sai —
  // o que é a prova, ao contrário, de que ele está mesmo no caminho do envio.
  restaurantCRMProfile: { findMany: vi.fn(), findUnique: vi.fn() },
  campaignExecution:    { findMany: vi.fn(), count: vi.fn(), create: vi.fn() },
  customer:             { findUnique: vi.fn() },
  campaign:             { findMany: vi.fn() },
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
const MINUTO  = 60_000;
const HORA    = 60 * MINUTO;
const ENVIADO = { ok: true, provider: "META_CLOUD_API", status: "SENT", providerMessageId: "wamid.1" };

/** Um rascunho aberto, com item, parado desde `paradoHaMinutos`. */
function rascunho(paradoHaMinutos: number, over: Record<string, unknown> = {}) {
  return {
    id:           "draft-1",
    restaurantId: REST,
    customerId:   "cust-1",
    updatedAt:    new Date(Date.now() - paradoHaMinutos * MINUTO),
    customer:     { id: "cust-1", name: "Ana Souza", phone: "+5511999990000" },
    restaurant:   { slug: "pizzaria-demo", name: "Pizzaria Demo" },
    ...over,
  };
}

/** Prepara um tick com os candidatos dados e tudo o mais liberado. */
function tickCom(candidatos: ReturnType<typeof rascunho>[]) {
  db.orderDraft.findMany.mockImplementation(async (args: { where?: Record<string, unknown> }) =>
    // a segunda busca (quem já recebeu recuperação nas últimas 24h) usa lastRecoveryAt
    args?.where && "lastRecoveryAt" in args.where ? [] : candidatos,
  );
  db.orderDraft.count.mockResolvedValue(0);
  db.orderDraft.update.mockResolvedValue({});
  db.restaurantCRMProfile.findMany.mockResolvedValue([]);
  db.campaign.findMany.mockResolvedValue([]);
  db.metaWhatsAppConfig.findMany.mockResolvedValue([]);
  db.order.findMany.mockResolvedValue([]);
  db.order.findFirst.mockResolvedValue(null);
  db.conversation.findFirst.mockResolvedValue({ id: "conv-1" });
  db.$transaction.mockResolvedValue([]);
  meta.getResolved.mockResolvedValue({ restaurantId: REST, phoneNumberId: "123", accessToken: "tok" });
  wa.sendText.mockResolvedValue(ENVIADO);
  horario.isRestaurantOpenNow.mockResolvedValue(true);
  // ── Portão do CRM: tudo liberado neste cenário-base ───────────────────────
  // Cliente sem opt-out, sem histórico de mensagem recente, nada enviado hoje.
  //
  // `null` = configuração PADRÃO do restaurante, com a janela de silêncio 21h–8h
  // ligada. Estes testes rodam a qualquer hora do dia e continuam verdes — o que
  // é, por si só, a prova de que o silêncio não governa a recuperação de
  // carrinho. Ver o bilhete da regra 11 em OrderDraftRecoverySendService.
  db.restaurantCRMProfile.findUnique.mockResolvedValue(null);
  db.campaignExecution.findMany.mockResolvedValue([]);
  db.campaignExecution.count.mockResolvedValue(0);
  db.customer.findUnique.mockResolvedValue({ hasOptedOut: false, crmContactable: true });
}

/** Todos os carimbos (recoveryAttempts/lastRecoveryAt) gravados no tick. */
function carimbos() {
  return db.orderDraft.update.mock.calls.filter(
    (c) => (c[0] as { data?: Record<string, unknown> })?.data?.recoveryAttempts !== undefined,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "info").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});

// ─────────────────────────────────────────────────────────────────────────────

describe("2 minutos parado = abandonado (a tradução de 'fechou o Foocci')", () => {
  it("MANDA: parado há 5 min, loja aberta — a mensagem sai", async () => {
    tickCom([rascunho(5)]);

    const r = await OrderDraftRecoverySendService.sendCartRecoveryMessages({ restaurantId: REST });

    expect(r.sent).toBe(1);
    expect(wa.sendText).toHaveBeenCalledTimes(1);
  });

  it("NÃO MANDA: quem ainda está mexendo no carrinho nem é procurado", async () => {
    tickCom([]);

    await OrderDraftRecoverySendService.sendCartRecoveryMessages({ restaurantId: REST });

    // O piso de inatividade mora no filtro do banco: `updatedAt < agora - 2min`.
    // Cada toque no carrinho renova o updatedAt, então quem abre e fecha o
    // cardápio três vezes em dez minutos sai da busca a cada toque.
    const filtro = db.orderDraft.findMany.mock.calls[0]?.[0]?.where as { updatedAt: { lt: Date } };
    const piso   = Date.now() - filtro.updatedAt.lt.getTime();
    expect(piso).toBeGreaterThanOrEqual(1.5 * MINUTO);
    expect(piso).toBeLessThanOrEqual(2.5 * MINUTO);
  });
});

describe("a loja fechada é perguntada no INSTANTE DO ABANDONO", () => {
  it("MANDA: aberta no instante do abandono", async () => {
    tickCom([rascunho(5)]);
    horario.isRestaurantOpenNow.mockResolvedValue(true);

    const r = await OrderDraftRecoverySendService.sendCartRecoveryMessages({ restaurantId: REST });

    expect(r.sent).toBe(1);
    expect(r.skippedRestaurantClosed).toBe(0);
  });

  it("NÃO MANDA: fechada no instante do abandono — e o rascunho NÃO é carimbado", async () => {
    tickCom([rascunho(5)]);
    horario.isRestaurantOpenNow.mockResolvedValue(false);

    const r = await OrderDraftRecoverySendService.sendCartRecoveryMessages({ restaurantId: REST });

    expect(r.sent).toBe(0);
    expect(r.eligible).toBe(0);
    expect(r.skippedRestaurantClosed).toBe(1);
    expect(wa.sendText).not.toHaveBeenCalled();
    // o carrinho do cliente continua intacto: quem voltar pelo link acha tudo lá
    expect(carimbos()).toHaveLength(0);
  });

  it("a pergunta usa a DATA DO ABANDONO, não a hora do tick", async () => {
    const paradoHa = 7;
    tickCom([rascunho(paradoHa)]);

    await OrderDraftRecoverySendService.sendCartRecoveryMessages({
      restaurantId: REST, inactivityMinutes: 2,
    });

    const [, quando] = horario.isRestaurantOpenNow.mock.calls[0] as [string, Date];
    expect(quando, "sem a data, a regra viraria 'está aberto agora' de novo").toBeInstanceOf(Date);
    // abandono = última atividade + os 2 min de silêncio que o definem
    const esperado = Date.now() - (paradoHa - 2) * MINUTO;
    expect(Math.abs(quando.getTime() - esperado)).toBeLessThan(5_000);
  });

  it("NÃO MANDA quando a loja ABRIU depois — o carrinho da madrugada morre em silêncio", async () => {
    // Este é o coração da decisão do CEO: a loja está ABERTA agora (o tick roda
    // de manhã), o carrinho ainda está dentro do prazo, e mesmo assim nada sai,
    // porque na hora em que a pessoa desistiu a loja estava fechada.
    tickCom([rascunho(90)]);
    horario.isRestaurantOpenNow.mockImplementation(async (_id: string, quando: Date = new Date()) =>
      quando.getTime() > Date.now() - 30 * MINUTO, // fechada 90 min atrás, aberta agora
    );

    const r = await OrderDraftRecoverySendService.sendCartRecoveryMessages({
      restaurantId: REST, deliveryWindowMinutes: 24 * 60, // janela larga de propósito: quem barra aqui é o horário
    });

    expect(r.sent).toBe(0);
    expect(r.skippedRestaurantClosed).toBe(1);
    expect(wa.sendText).not.toHaveBeenCalled();
  });

  it("se a leitura do horário EXPLODE, falha fechada: não envia", async () => {
    // Ausência de informação não é informação — muito menos permissão de disparo.
    tickCom([rascunho(5)]);
    horario.isRestaurantOpenNow.mockRejectedValue(new Error("banco indisponível"));

    const r = await OrderDraftRecoverySendService.sendCartRecoveryMessages({ restaurantId: REST });

    expect(r.sent).toBe(0);
    expect(r.skippedRestaurantClosed).toBe(1);
    expect(wa.sendText).not.toHaveBeenCalled();
  });
});

describe("a janela de entrega: a mensagem de carrinho é do momento", () => {
  it("MANDA: abandono há 5 min está dentro da janela de 30 min", async () => {
    tickCom([rascunho(7)]);

    const r = await OrderDraftRecoverySendService.sendCartRecoveryMessages({ restaurantId: REST });

    expect(r.sent).toBe(1);
    expect(r.skippedTooLate).toBe(0);
    expect(r.deliveryWindowMinutes).toBe(30);
  });

  it("NÃO MANDA: abandono de 3 horas atrás, ainda 'no prazo', não vira mensagem", async () => {
    // Dentro da validade de 6 h e com a loja aberta — o único portão que segura
    // é a janela de entrega. Sem ela, o Foocci cutucaria alguém sobre um carrinho
    // de três horas atrás.
    tickCom([rascunho(3 * 60)]);

    const r = await OrderDraftRecoverySendService.sendCartRecoveryMessages({ restaurantId: REST });

    expect(r.sent).toBe(0);
    expect(r.skippedTooLate).toBe(1);
    expect(wa.sendText).not.toHaveBeenCalled();
    expect(carimbos()).toHaveLength(0);
  });

  it("a janela é contada do ABANDONO, então não depende do valor de inatividade", async () => {
    // O QA de produção envelhece o rascunho em `inatividade + 5 min`. Se a janela
    // fosse contada da última atividade, um teste com inatividade de 60 min
    // reprovaria sozinho.
    tickCom([rascunho(65)]);

    const r = await OrderDraftRecoverySendService.sendCartRecoveryMessages({
      restaurantId: REST, inactivityMinutes: 60,
    });

    expect(r.skippedTooLate).toBe(0);
    expect(r.sent).toBe(1);
  });
});

describe("os carrinhos velhos represados NÃO viram enxurrada", () => {
  it("a busca já os exclui: o piso de 6 h continua no filtro do banco", async () => {
    tickCom([]);

    await OrderDraftRecoverySendService.sendCartRecoveryMessages({ restaurantId: REST });

    const filtro = db.orderDraft.findMany.mock.calls[0]?.[0]?.where as { updatedAt: { gte: Date } };
    const idadeMaxima = Date.now() - filtro.updatedAt.gte.getTime();
    expect(idadeMaxima).toBeGreaterThanOrEqual(5.9 * HORA);
    expect(idadeMaxima).toBeLessThanOrEqual(6.1 * HORA);
  });

  it("e se um deles chegar ao motor assim mesmo, o motor RECUSA — trava dupla", async () => {
    // A prova que o Diretor pediu: mesmo que alguém afrouxe o filtro da busca,
    // alargue a validade ou rode um script à mão, carrinho de dias atrás não
    // vira mensagem. Aqui entram 51 rascunhos de 3 a 21 dias — o estoque
    // represado que o diagnóstico de 05/08 encontrou.
    const represados = Array.from({ length: 51 }, (_, i) =>
      rascunho((3 + i) * 24 * 60, { id: `velho-${i}`, customerId: `cust-${i}`,
        customer: { id: `cust-${i}`, name: `Cliente ${i}`, phone: `+55119999900${String(i).padStart(2, "0")}` } }),
    );
    tickCom(represados);

    const r = await OrderDraftRecoverySendService.sendCartRecoveryMessages({
      restaurantId: REST, maxAgeHours: 24 * 365, // validade afrouxada de propósito
    });

    expect(r.sent, "nenhuma mensagem sobre carrinho de dias atrás").toBe(0);
    expect(r.skippedTooLate).toBe(51);
    expect(wa.sendText).not.toHaveBeenCalled();
    expect(carimbos()).toHaveLength(0);
  });
});

describe("uma mensagem por cliente — nunca três", () => {
  it("MANDA: cliente sem recuperação nas últimas 24 h recebe", async () => {
    tickCom([rascunho(5)]);

    const r = await OrderDraftRecoverySendService.sendCartRecoveryMessages({ restaurantId: REST });

    expect(r.sent).toBe(1);
  });

  it("NÃO MANDA duas vezes no mesmo dia, mesmo com dois carrinhos abandonados", async () => {
    // Quem abre e fecha o cardápio várias vezes reaproveita o MESMO rascunho
    // (`/api/pedido/[slug]/draft` faz upsert por restaurante+cliente). Mas se
    // dois rascunhos do mesmo cliente chegarem ao mesmo tick, só um vira
    // mensagem — e o segundo é contado, não engolido.
    tickCom([
      rascunho(5),
      rascunho(6, { id: "draft-2" }), // mesmo customerId
    ]);

    const r = await OrderDraftRecoverySendService.sendCartRecoveryMessages({ restaurantId: REST });

    expect(r.sent).toBe(1);
    expect(r.skippedDailyLimit).toBe(1);
    expect(wa.sendText).toHaveBeenCalledTimes(1);
  });

  it("NÃO MANDA para quem já recebeu recuperação nas últimas 24 h", async () => {
    db.orderDraft.findMany.mockImplementation(async (args: { where?: Record<string, unknown> }) =>
      args?.where && "lastRecoveryAt" in args.where
        ? [{ customerId: "cust-1", restaurantId: REST }] // já recebeu hoje
        : [rascunho(5)],
    );
    db.orderDraft.count.mockResolvedValue(0);
    db.orderDraft.update.mockResolvedValue({});
    db.restaurantCRMProfile.findMany.mockResolvedValue([]);
    db.campaign.findMany.mockResolvedValue([]);
    db.metaWhatsAppConfig.findMany.mockResolvedValue([]);
    db.order.findMany.mockResolvedValue([]);
    db.order.findFirst.mockResolvedValue(null);
    meta.getResolved.mockResolvedValue({ restaurantId: REST, phoneNumberId: "123", accessToken: "tok" });
    horario.isRestaurantOpenNow.mockResolvedValue(true);

    const r = await OrderDraftRecoverySendService.sendCartRecoveryMessages({ restaurantId: REST });

    expect(r.sent).toBe(0);
    expect(r.skippedDailyLimit).toBe(1);
    expect(wa.sendText).not.toHaveBeenCalled();
  });

  it("depois de enviar, o rascunho é carimbado — não volta no próximo tick", async () => {
    tickCom([rascunho(5)]);

    await OrderDraftRecoverySendService.sendCartRecoveryMessages({ restaurantId: REST });

    const [carimbo] = carimbos();
    expect(carimbo, "sem carimbo o mesmo carrinho seria cobrado a cada minuto").toBeDefined();
    const data = (carimbo![0] as { data: { recoveryAttempts: unknown; lastRecoveryAt: Date } }).data;
    expect(data.recoveryAttempts).toEqual({ increment: 1 });
    expect(data.lastRecoveryAt).toBeInstanceOf(Date);
  });
});

describe("quem já fez o pedido não recebe lembrete de carrinho", () => {
  it("MANDA: sem pedido recente, a recuperação sai", async () => {
    tickCom([rascunho(5)]);
    db.order.findFirst.mockResolvedValue(null);

    const r = await OrderDraftRecoverySendService.sendCartRecoveryMessages({ restaurantId: REST });

    expect(r.sent).toBe(1);
  });

  it("NÃO MANDA: cliente que fechou o pedido não é cobrado pelo carrinho", async () => {
    tickCom([rascunho(5)]);
    db.order.findFirst.mockResolvedValue({ id: "order-9" });

    const r = await OrderDraftRecoverySendService.sendCartRecoveryMessages({ restaurantId: REST });

    expect(r.sent).toBe(0);
    expect(r.skippedOrderedAfter).toBe(1);
    expect(wa.sendText).not.toHaveBeenCalled();
  });
});
