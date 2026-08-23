/**
 * Recuperação de carrinho abandonado — prazo de validade e envio pela Meta.
 *
 * Parte 1 — O PRAZO
 * A busca tinha piso (2 minutos parado) e nenhum teto. Um rascunho aberto três
 * semanas atrás, com recoveryAttempts=0, continuava candidato para sempre — e
 * uma hora o Foocci mandava "percebi que seu pedido não foi finalizado 😊"
 * sobre um carrinho do mês passado. A pessoa já jantou, provavelmente já pediu
 * de novo, e recebe cobrança de um pedido que não lembra.
 *
 * O teste olha o FILTRO que vai ao banco, porque é lá que o defeito morava:
 * a ausência do `gte` era invisível em qualquer inspeção do resultado.
 *
 * Parte 2 — QUEM ENVIA (04/08/2026)
 * A Evolution saiu do Foocci. O portão que perguntava "existe config da
 * Evolution?" passou a perguntar "existe config da Meta?", e o envio sai pelo
 * WhatsAppMessagingService. Dois riscos novos, ambos cobertos aqui:
 *   · sem config da Meta, o correto é PULAR e contar — nunca "enviar mesmo
 *     assim" nem sumir como se não houvesse nada a enviar;
 *   · fora da janela de 24h a Meta recusa texto livre (BLOCKED). Isso NÃO pode
 *     virar falha silenciosa: precisa aparecer em contador próprio e no log,
 *     senão a recuperação "roda" todo minuto sem nada chegar a ninguém.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

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
const meta = vi.hoisted(() => ({ getResolved: vi.fn() }));
const wa   = vi.hoisted(() => ({ sendText: vi.fn() }));
const horario = vi.hoisted(() => ({ isRestaurantOpenNow: vi.fn() }));

vi.mock("@/lib/prisma", () => ({ prisma: db }));
vi.mock("@/services/whatsapp/MetaConfigService", () => ({ MetaConfigService: meta }));
vi.mock("@/services/whatsapp/WhatsAppMessagingService", () => ({ WhatsAppMessagingService: wa }));
vi.mock("@/lib/business-hours", () => ({ isRestaurantOpenNow: horario.isRestaurantOpenNow }));

import { OrderDraftRecoverySendService } from "../OrderDraftRecoverySendService";

const HORA = 60 * 60 * 1000;

beforeEach(() => {
  vi.clearAllMocks();
  db.orderDraft.findMany.mockResolvedValue([]);   // sem candidato → retorna cedo
  db.orderDraft.count.mockResolvedValue(0);
});

function filtroDaBusca() {
  return db.orderDraft.findMany.mock.calls[0]?.[0]?.where as {
    updatedAt: { lt: Date; gte: Date };
    status: string;
    recoveryAttempts: number;
  };
}

describe("o prazo de validade do carrinho", () => {
  it("a busca passou a ter teto, não só piso", async () => {
    await OrderDraftRecoverySendService.sendCartRecoveryMessages({ dryRun: true });

    const w = filtroDaBusca();
    expect(w.updatedAt.lt,  "o piso de inatividade continua").toBeInstanceOf(Date);
    expect(w.updatedAt.gte, "o teto de validade é o conserto — sem ele, carrinho de mês passado volta").toBeInstanceOf(Date);
  });

  it("o teto padrão é de horas, não de dias — comida não espera", async () => {
    const antes = Date.now();
    await OrderDraftRecoverySendService.sendCartRecoveryMessages({ dryRun: true });

    const idadeMax = antes - filtroDaBusca().updatedAt.gte.getTime();
    expect(idadeMax).toBeGreaterThanOrEqual(5.9 * HORA);
    expect(idadeMax).toBeLessThanOrEqual(6.1 * HORA);
  });

  it("o teto é sempre mais antigo que o piso — a janela nunca se inverte", async () => {
    await OrderDraftRecoverySendService.sendCartRecoveryMessages({ dryRun: true });

    const w = filtroDaBusca();
    expect(w.updatedAt.gte.getTime()).toBeLessThan(w.updatedAt.lt.getTime());
  });

  it("dá para apertar ou afrouxar o prazo por chamada", async () => {
    const antes = Date.now();
    await OrderDraftRecoverySendService.sendCartRecoveryMessages({ dryRun: true, maxAgeHours: 2 });

    const idadeMax = antes - filtroDaBusca().updatedAt.gte.getTime();
    expect(idadeMax).toBeGreaterThanOrEqual(1.9 * HORA);
    expect(idadeMax).toBeLessThanOrEqual(2.1 * HORA);
  });

  it("o resto das travas continua de pé — o prazo não afrouxou nada", async () => {
    await OrderDraftRecoverySendService.sendCartRecoveryMessages({ dryRun: true });

    const w = filtroDaBusca();
    expect(w.status).toBe("OPEN");
    expect(w.recoveryAttempts).toBe(0);
  });
});

describe("os vencidos aparecem, em vez de simplesmente sumir", () => {
  it("o resultado conta quantos venceram e qual foi o prazo aplicado", async () => {
    db.orderDraft.count.mockResolvedValue(37);

    const r = await OrderDraftRecoverySendService.sendCartRecoveryMessages({ dryRun: true });

    expect(r.skippedTooOld).toBe(37);
    expect(r.maxAgeHours).toBe(6);
  });

  it("a contagem de vencidos usa o mesmo prazo da busca", async () => {
    await OrderDraftRecoverySendService.sendCartRecoveryMessages({ dryRun: true, maxAgeHours: 3 });

    const wBusca = filtroDaBusca();
    const wConta = db.orderDraft.count.mock.calls[0]?.[0]?.where as { updatedAt: { lt: Date } };
    // o que a busca inclui (>= corte) e o que a contagem soma (< corte) são
    // complementares: nenhum rascunho fica fora dos dois nem entra nos dois.
    expect(wConta.updatedAt.lt.getTime()).toBe(wBusca.updatedAt.gte.getTime());
  });
});

// ── Parte 2: o envio saiu da Evolution e passou a ser Meta ───────────────────

const REST = "rest-1";

const CANDIDATO = {
  id:           "draft-1",
  restaurantId: REST,
  customerId:   "cust-1",
  updatedAt:    new Date(Date.now() - 10 * 60_000),
  customer:     { id: "cust-1", name: "Ana Souza", phone: "+5511999990000" },
  restaurant:   { slug: "pizzaria-demo", name: "Pizzaria Demo" },
};

/** Um tick com exatamente um candidato elegível, loja aberta, sem pedido recente. */
function tickComUmCandidato() {
  db.orderDraft.findMany.mockImplementation(async (args: { where?: Record<string, unknown> }) =>
    // a segunda busca (quem já recebeu recuperação nas últimas 24h) usa lastRecoveryAt
    args?.where && "lastRecoveryAt" in args.where ? [] : [CANDIDATO],
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

const ENVIADO  = { ok: true,  provider: "META_CLOUD_API", status: "SENT",    providerMessageId: "wamid.1" };
const BLOQUEIO = {
  ok: false, provider: "META_CLOUD_API", status: "BLOCKED", providerMessageId: null,
  blockReason: "META_TEMPLATE_REQUIRED",
  error: "Para mensagens iniciadas pela empresa na Meta (fora da janela de 24h), é necessário usar um modelo aprovado.",
};

describe("o portão de config agora pergunta pela Meta, não pela Evolution", () => {
  beforeEach(tickComUmCandidato);

  it("com config da Meta, a recuperação sai — e sai pelo WhatsAppMessagingService", async () => {
    meta.getResolved.mockResolvedValue({ restaurantId: REST, phoneNumberId: "123", accessToken: "tok" });
    wa.sendText.mockResolvedValue(ENVIADO);

    const r = await OrderDraftRecoverySendService.sendCartRecoveryMessages({ restaurantId: REST });

    expect(r.sent).toBe(1);
    expect(r.skippedNoConfig).toBe(0);
    expect(wa.sendText).toHaveBeenCalledTimes(1);
    const enviado = wa.sendText.mock.calls[0][0] as { restaurantId: string; to: string; text: string };
    expect(enviado.restaurantId).toBe(REST);
    expect(enviado.to, "telefone normalizado: só dígitos, sem +").toBe("5511999990000");
    expect(enviado.text).toContain("Ana");
  });

  it("SEM config da Meta não se tenta enviar — e o carrinho não é carimbado", async () => {
    meta.getResolved.mockResolvedValue(null);

    const r = await OrderDraftRecoverySendService.sendCartRecoveryMessages({ restaurantId: REST });

    expect(r.skippedNoConfig, "a ausência de config tem que APARECER no resultado").toBe(1);
    expect(r.sent).toBe(0);
    expect(wa.sendText).not.toHaveBeenCalled();
    expect(db.orderDraft.update, "sem envio não se carimba o rascunho").not.toHaveBeenCalled();
  });

  it("se a leitura da config EXPLODE, falha fechada: não envia e conta como sem config", async () => {
    // Ausência de informação não é informação. Erro ao apurar nunca pode virar
    // "pode enviar" — e nunca pode sumir como se não houvesse nada a enviar.
    meta.getResolved.mockRejectedValue(new Error("banco indisponível"));

    const r = await OrderDraftRecoverySendService.sendCartRecoveryMessages({ restaurantId: REST });

    expect(r.skippedNoConfig).toBe(1);
    expect(r.sent).toBe(0);
    expect(wa.sendText).not.toHaveBeenCalled();
  });
});

describe("fora da janela de 24h, a recusa da Meta fica VISÍVEL", () => {
  let logWarn: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    tickComUmCandidato();
    meta.getResolved.mockResolvedValue({ restaurantId: REST, phoneNumberId: "123", accessToken: "tok" });
    logWarn = vi.spyOn(console, "warn").mockImplementation(() => {});
  });
  afterEach(() => logWarn.mockRestore());

  it("BLOCKED tem contador próprio — não some e não se disfarça de sucesso", async () => {
    wa.sendText.mockResolvedValue(BLOQUEIO);

    const r = await OrderDraftRecoverySendService.sendCartRecoveryMessages({ restaurantId: REST });

    expect(r.skippedTemplateRequired, "sem este número, checked>0/failed=0 lê como sucesso").toBe(1);
    expect(r.sent).toBe(0);
  });

  it("BLOCKED é diferente de FALHA — não se conta como erro de envio", async () => {
    wa.sendText.mockResolvedValue(BLOQUEIO);

    const r = await OrderDraftRecoverySendService.sendCartRecoveryMessages({ restaurantId: REST });

    expect(r.failed, "política da Meta não é falha de rede").toBe(0);
  });

  it("o log carrega a evidência: qual rascunho, qual loja e o motivo do bloqueio", async () => {
    wa.sendText.mockResolvedValue(BLOQUEIO);

    await OrderDraftRecoverySendService.sendCartRecoveryMessages({ restaurantId: REST });

    const linha = logWarn.mock.calls.find(
      (c) => typeof c[0] === "string" && (c[0] as string).includes("modelo aprovado"),
    );
    expect(linha, "alerta sem o caso concreto é ruído que ninguém investiga").toBeDefined();
    const ctx = linha![1] as { draftId: string; restaurantId: string; blockReason: string };
    expect(ctx.draftId).toBe("draft-1");
    expect(ctx.restaurantId).toBe(REST);
    expect(ctx.blockReason).toBe("META_TEMPLATE_REQUIRED");
  });

  it("bloqueado não carimba o rascunho — ele volta no próximo tick e vence pelo prazo de 6h", async () => {
    wa.sendText.mockResolvedValue(BLOQUEIO);

    await OrderDraftRecoverySendService.sendCartRecoveryMessages({ restaurantId: REST });

    // o único update permitido é o do recoveryCode, gravado ANTES do envio;
    // o carimbo (recoveryAttempts/lastRecoveryAt) não pode ter acontecido.
    const carimbos = db.orderDraft.update.mock.calls.filter(
      (c) => (c[0] as { data?: Record<string, unknown> })?.data?.recoveryAttempts !== undefined,
    );
    expect(carimbos).toHaveLength(0);
  });

  it("erro real de envio continua caindo em failed, não em bloqueado", async () => {
    wa.sendText.mockResolvedValue({
      ok: false, provider: "META_CLOUD_API", status: "FAILED",
      providerMessageId: null, errorCode: "META_131026", error: "recipient not available",
    });

    const r = await OrderDraftRecoverySendService.sendCartRecoveryMessages({ restaurantId: REST });

    expect(r.failed).toBe(1);
    expect(r.skippedTemplateRequired).toBe(0);
  });
});
