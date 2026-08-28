/**
 * As saídas MUDAS do Cérebro passam a gritar.
 *
 * O diagnóstico de 28/08/2026 contou catorze caminhos por onde a mensagem do
 * cliente morre sem resposta — oito deles sem uma linha de log. O Cérebro SABIA
 * o motivo (devolve `{ status: "SKIPPED", reason }`), mas o motivo só existia
 * dentro do processo: quem abria o log do Railway via a mensagem sumir e nada
 * mais.
 *
 * Cada caso aqui trava UM portão que era mudo. O contrato é o mesmo em todos:
 * uma linha `[BrainDecision]` com `gate`, `reason`, `conversationId` e
 * `restaurantId` — o suficiente para o dono do restaurante (ou quem o atende)
 * responder "por que ele não respondeu?" sem abrir o código.
 *
 * ⚠️ Estes casos NÃO mudam comportamento: quem era SKIPPED continua SKIPPED.
 * A única mudança de comportamento do bloco (resposta vazia → recepcionista)
 * vive em `respostaVaziaCaiNoRecepcionista.test.ts`, com o recepcionista real.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

const db = vi.hoisted(() => ({
  qualityAuditRun: {
    findFirst: async () => ({ id: "run_verde", finishedAt: new Date(), findings: [{ severity: "P2", status: "PASS" }] }),
  },
  conversation:        { findUnique: vi.fn(), update: vi.fn() },
  message:             { findFirst: vi.fn(), findMany: vi.fn(), create: vi.fn() },
  brainFreeFormConfig: { findUnique: vi.fn() },
  brainShadowLog:      { create: vi.fn(), findMany: vi.fn() },
  $transaction:        vi.fn(),
}));
vi.mock("@/lib/prisma", () => ({ prisma: db }));

const messaging = vi.hoisted(() => ({
  WhatsAppMessagingService: { sendConversationReply: vi.fn() },
}));
vi.mock("@/services/whatsapp/WhatsAppMessagingService", () => messaging);

const handoff = vi.hoisted(() => ({ markConversationNeedsHuman: vi.fn() }));
vi.mock("@/lib/handoff", () => handoff);

const brain = vi.hoisted(() => ({ reasonAsAgent: vi.fn() }));
vi.mock("@/services/brain/reasoning/BrainReasoner", () => brain);

const critic = vi.hoisted(() => ({ judgeReply: vi.fn() }));
vi.mock("@/services/brain/reasoning/BrainCoherenceCritic", () => critic);

const recep = vi.hoisted(() => ({
  detectIntent: vi.fn(() => "UNKNOWN"),
  BACK_TO_MENU_RE: /^(0|menu|voltar|in[ií]cio|inicio)$/i,
  BACK_TO_MENU_FOOTER: "\n\n0. menu",
  WhatsAppReceptionistService: { respond: vi.fn() },
}));
vi.mock("@/services/ai/WhatsAppReceptionistService", () => recep);

import { WhatsAppBrainRuntimeService } from "../WhatsAppBrainRuntimeService";

/** Lê as linhas `[BrainDecision]` que saíram no turno, já desserializadas. */
function decisoesRegistradas(warn: ReturnType<typeof vi.spyOn>): Record<string, unknown>[] {
  return warn.mock.calls
    .filter((c) => c[0] === "[BrainDecision]")
    .map((c) => JSON.parse(String(c[1])) as Record<string, unknown>);
}

function decisao(warn: ReturnType<typeof vi.spyOn>, gate: string): Record<string, unknown> | undefined {
  return decisoesRegistradas(warn).find((d) => d.gate === gate);
}

let warn: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  vi.clearAllMocks();
  process.env.WHATSAPP_BRAIN_SHADOW_MODE = "false";
  warn = vi.spyOn(console, "warn").mockImplementation(() => {});
  db.message.findMany.mockResolvedValue([]);
  db.brainFreeFormConfig.findUnique.mockResolvedValue(null);
  db.brainShadowLog.create.mockResolvedValue({});
  db.brainShadowLog.findMany.mockResolvedValue([]);
  db.conversation.findUnique.mockResolvedValue({
    id: "conv_1", restaurantId: "rest_1", status: "BOT", aiEnabled: true,
    customerPhone: "5511999", customer: { id: "cust_1", phone: "5511999", name: "Ana" },
  });
  db.$transaction.mockResolvedValue([{}, {}]);
  recep.detectIntent.mockReturnValue("UNKNOWN");
  recep.WhatsAppReceptionistService.respond.mockResolvedValue(undefined);
});

afterEach(() => warn.mockRestore());

describe("cada saída muda do Cérebro deixa rastro", () => {
  it("conversa que um humano assumiu: SKIPPED com o motivo REAL no log", async () => {
    db.conversation.findUnique.mockResolvedValue({
      id: "conv_1", restaurantId: "rest_1", status: "HUMAN", aiEnabled: true,
      customerPhone: "5511999", customer: { id: "c", phone: "5511999", name: "x" },
    });

    const out = await WhatsAppBrainRuntimeService.respond("conv_1");

    expect(out.status).toBe("SKIPPED");
    const d = decisao(warn, "conversation-not-eligible");
    expect(d, "portão da elegibilidade continua mudo").toBeDefined();
    expect(d).toMatchObject({ conversationId: "conv_1", restaurantId: "rest_1" });
    // O motivo tem que dizer QUAL das quatro portas fechou — "not eligible" sozinho
    // não responde a pergunta de quem lê o log.
    expect(String(d!.reason)).toContain("status=HUMAN");
  });

  it("conversa que nem existe: log com restaurantId nulo, nunca um id inventado", async () => {
    db.conversation.findUnique.mockResolvedValue(null);

    const out = await WhatsAppBrainRuntimeService.respond("conv_fantasma");

    expect(out.status).toBe("SKIPPED");
    const d = decisao(warn, "conversation-not-eligible");
    expect(d).toMatchObject({ conversationId: "conv_fantasma", restaurantId: null });
    expect(String(d!.reason)).toContain("conversa não encontrada");
  });

  it("conversa sem telefone: o gate diz que não há para onde responder", async () => {
    db.conversation.findUnique.mockResolvedValue({
      id: "conv_1", restaurantId: "rest_1", status: "BOT", aiEnabled: true,
      customerPhone: "  ", customer: { id: "c", phone: null, name: "x" },
    });

    const out = await WhatsAppBrainRuntimeService.respond("conv_1");

    expect(out.status).toBe("SKIPPED");
    expect(decisao(warn, "no-phone")).toMatchObject({
      reason: "no customer phone", conversationId: "conv_1", restaurantId: "rest_1",
    });
  });

  it("áudio/imagem: o log diz QUE TIPO chegou — senão o suporte adivinha", async () => {
    db.message.findFirst.mockResolvedValueOnce({ content: "", type: "AUDIO", sentAt: new Date() });

    const out = await WhatsAppBrainRuntimeService.respond("conv_1");

    expect(out.status).toBe("SKIPPED");
    expect(decisao(warn, "no-usable-text")).toMatchObject({
      reason: "no usable inbound text", conversationId: "conv_1", restaurantId: "rest_1", messageType: "AUDIO",
    });
  });

  it("nenhuma mensagem de entrada: o tipo sai como NENHUMA, não como `undefined`", async () => {
    db.message.findFirst.mockResolvedValueOnce(null);

    await WhatsAppBrainRuntimeService.respond("conv_1");

    expect(decisao(warn, "no-usable-text")).toMatchObject({ messageType: "NENHUMA" });
  });

  it("idempotência ('já respondi'): silêncio LEGÍTIMO, mas registrado", async () => {
    db.message.findFirst
      .mockResolvedValueOnce({ content: "oi", type: "TEXT", sentAt: new Date() })
      .mockResolvedValueOnce({ id: "ja_respondi" });

    const out = await WhatsAppBrainRuntimeService.respond("conv_1");

    expect(out.status).toBe("SKIPPED");
    expect(decisao(warn, "already-replied")).toMatchObject({
      reason: "already replied", conversationId: "conv_1", restaurantId: "rest_1",
    });
  });

  it("Meta recusa o envio: o motivo da recusa vai para o log, não só para o retorno", async () => {
    db.brainFreeFormConfig.findUnique.mockResolvedValue({
      restaurantId: "rest_1", mode: "ALLOWLIST", allowlistedPhones: ["5511999"],
      paused: false, minConfidence: 0.6, notes: null, updatedAt: new Date(),
    });
    db.brainShadowLog.findMany.mockResolvedValue(Array.from({ length: 30 }, () => ({ coherence: "PASS" })));
    db.message.findFirst
      .mockResolvedValueOnce({ content: "vocês aceitam vale-refeição?", type: "TEXT", sentAt: new Date() })
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ id: "sessao_ativa" });
    brain.reasonAsAgent.mockResolvedValue({
      engine: { provider: "OPENAI", model: "gpt-4o-mini", reason: "" },
      reasoningMode: "LLM",
      snapshot: { truthSources: {}, missingContext: [] },
      result: {
        primaryIntent: "PAYMENT_QUESTION", idealResponse: "Aceitamos Pix e cartão. 😊",
        confidence: 0.9, shouldEscalate: false, runtimeTouched: false,
        coherenceCheck: { verdict: "PASS", answersUserQuestion: true, matchesIntent: true, doesNotInventFacts: true, keepsBusinessObjective: true, reason: "" },
      },
    });
    critic.judgeReply.mockResolvedValue({ approved: true, mode: "JUDGED", reason: "coerente" });
    messaging.WhatsAppMessagingService.sendConversationReply.mockResolvedValue({
      ok: false, provider: "META_CLOUD_API", status: "FAILED", providerMessageId: null,
      blockReason: "JANELA_24H_FECHADA", error: null,
    });

    const out = await WhatsAppBrainRuntimeService.respond("conv_1");

    expect(out.status).toBe("SKIPPED");
    expect(out.reason).toBe("JANELA_24H_FECHADA");
    expect(decisao(warn, "meta-send-failed")).toMatchObject({
      reason: "JANELA_24H_FECHADA", conversationId: "conv_1", restaurantId: "rest_1",
      blockReason: "JANELA_24H_FECHADA",
    });
  });
});
