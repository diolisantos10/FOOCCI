import { describe, it, expect, beforeEach, vi } from "vitest";

const db = vi.hoisted(() => ({
  // Portão de qualidade VERDE (LiveStageGuard): sem isto a trava da escada
  // derruba o degrau alto por falha fechada e estes casos nunca chegariam a
  // exercitar o que querem exercitar. O teste da TRAVA em si vive em
  // src/services/brain/runtime/escadaDeIa.class.test.ts.
  qualityAuditRun: {
    findFirst: async () => ({ id: "run_verde", finishedAt: new Date(), findings: [{ severity: "P2", status: "PASS" }] }),
  },
  conversation: { findUnique: vi.fn(), update: vi.fn() },
  message: { findFirst: vi.fn(), create: vi.fn(), findMany: vi.fn() },
  brainFreeFormConfig: { findUnique: vi.fn() },
  brainShadowLog: { create: vi.fn() },
  $transaction: vi.fn(),
}));
vi.mock("@/lib/prisma", () => ({ prisma: db }));

// Canal ÚNICO: toda resposta do Cérebro sai por esta porta. Se algum dia
// aparecer outro caminho de envio aqui, estes testes não o veem — e é de
// propósito: o segundo canal é o risco que a homologação eliminou.
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

// The Brain front door delegates menu interactions to the Receptionist (dynamically
// imported). Mock the module — its real pure helpers are covered by the Receptionist's
// own suite; here we drive detectIntent and stub respond to test the wiring.
const recep = vi.hoisted(() => ({
  detectIntent: vi.fn(() => "UNKNOWN"),
  BACK_TO_MENU_RE: /^(0|menu|voltar|in[ií]cio|inicio)$/i,
  BACK_TO_MENU_FOOTER: "\n\n0. menu",
  WhatsAppReceptionistService: { respond: vi.fn() },
}));
vi.mock("@/services/ai/WhatsAppReceptionistService", () => recep);

import { afterEach } from "vitest";
import { WhatsAppBrainRuntimeService, isWhatsAppBrainEnabled } from "./WhatsAppBrainRuntimeService";

const OLD_SHADOW = process.env.WHATSAPP_BRAIN_SHADOW_MODE;
const OLD_KEY = process.env.OPENAI_API_KEY;

afterEach(() => {
  if (OLD_SHADOW === undefined) delete process.env.WHATSAPP_BRAIN_SHADOW_MODE;
  else process.env.WHATSAPP_BRAIN_SHADOW_MODE = OLD_SHADOW;
  if (OLD_KEY === undefined) delete process.env.OPENAI_API_KEY;
  else process.env.OPENAI_API_KEY = OLD_KEY;
});

function brainOutcome(over: Record<string, unknown> = {}) {
  return {
    engine: { provider: "OPENAI", model: "gpt-4o-mini", reason: "" },
    reasoningMode: "LLM",
    result: {
      primaryIntent: "PAYMENT_QUESTION",
      idealResponse: "Aceitamos Pix, cartão e dinheiro. 😊",
      confidence: 0.9,
      coherenceCheck: { verdict: "PASS", answersUserQuestion: true, matchesIntent: true, doesNotInventFacts: true, keepsBusinessObjective: true, reason: "" },
      shouldEscalate: false,
      runtimeTouched: false,
      ...over,
    },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  // Shadow determinístico nos testes: OFF por padrão (o teste dedicado liga).
  process.env.WHATSAPP_BRAIN_SHADOW_MODE = "false";
  db.message.findMany.mockResolvedValue([]);
  db.brainFreeFormConfig.findUnique.mockResolvedValue(null); // default: SHADOW_ONLY
  db.brainShadowLog.create.mockResolvedValue({});
  messaging.WhatsAppMessagingService.sendConversationReply.mockResolvedValue({
    ok: true, provider: "META_CLOUD_API", status: "SENT", providerMessageId: "wamid.ext_1",
  });
  db.conversation.findUnique.mockResolvedValue({
    id: "conv_1", restaurantId: "rest_1", status: "BOT", aiEnabled: true,
    customer: { id: "cust_1", phone: "5511999", name: "Ana" },
  });
  db.message.findFirst
    .mockResolvedValueOnce({ content: "vocês aceitam vale-refeição?", type: "TEXT", sentAt: new Date() })
    .mockResolvedValueOnce(null) // alreadyReplied = none
    .mockResolvedValueOnce({ id: "prev_ai_msg" }); // sessão ativa: bot já respondeu (menu já aberto)
  db.$transaction.mockResolvedValue([{}, {}]);
  handoff.markConversationNeedsHuman.mockResolvedValue(true);
  brain.reasonAsAgent.mockResolvedValue(brainOutcome());
  critic.judgeReply.mockResolvedValue({ approved: true, mode: "JUDGED", reason: "coerente" });
  recep.detectIntent.mockReturnValue("UNKNOWN");
  recep.WhatsAppReceptionistService.respond.mockResolvedValue({ status: "REPLIED" });
});

describe("isWhatsAppBrainEnabled (the safety switch)", () => {
  it("is ON for everyone by default; OFF only when explicitly set to 'false'", () => {
    expect(isWhatsAppBrainEnabled({} as NodeJS.ProcessEnv)).toBe(true);
    expect(isWhatsAppBrainEnabled({ WHATSAPP_BRAIN_ENABLED: "true" } as unknown as NodeJS.ProcessEnv)).toBe(true);
    expect(isWhatsAppBrainEnabled({ WHATSAPP_BRAIN_ENABLED: "false" } as unknown as NodeJS.ProcessEnv)).toBe(false);
  });
});

describe("WhatsAppBrainRuntimeService.respond (the cutover)", () => {
  // Decisão de produto (pré-lançamento): free-form DESLIGADO. Pergunta fora do
  // menu NUNCA vai pro LLM — é delegada ao recepcionista (que faz handoff p/
  // humano). Regressão do caso real "Vocês tem rodízio?" respondido errado.
  it("pergunta fora do menu → recepcionista; o LLM nunca é chamado", async () => {
    const out = await WhatsAppBrainRuntimeService.respond("conv_1");
    expect(recep.WhatsAppReceptionistService.respond).toHaveBeenCalledWith("conv_1");
    expect(brain.reasonAsAgent).not.toHaveBeenCalled();
    expect(messaging.WhatsAppMessagingService.sendConversationReply).not.toHaveBeenCalled();
    expect(out.status).toBe("REPLIED");
    expect(out.reason).toContain("free-form disabled");
  });

  it("delegates menu interactions to the Receptionist — never free-form", async () => {
    recep.detectIntent.mockReturnValue("MENU_REQUEST");
    const out = await WhatsAppBrainRuntimeService.respond("conv_1");
    expect(recep.WhatsAppReceptionistService.respond).toHaveBeenCalledWith("conv_1");
    expect(brain.reasonAsAgent).not.toHaveBeenCalled();
    expect(messaging.WhatsAppMessagingService.sendConversationReply).not.toHaveBeenCalled();
    expect(out.status).toBe("REPLIED");
  });

  it("treats a bare number as a menu selection (Receptionist, not the Brain)", async () => {
    db.message.findFirst.mockReset();
    db.message.findFirst
      .mockResolvedValueOnce({ content: "2", type: "TEXT", sentAt: new Date() })
      .mockResolvedValueOnce(null);
    recep.detectIntent.mockReturnValue("UNKNOWN"); // a number is not a keyword intent
    await WhatsAppBrainRuntimeService.respond("conv_1");
    expect(recep.WhatsAppReceptionistService.respond).toHaveBeenCalledWith("conv_1");
    expect(brain.reasonAsAgent).not.toHaveBeenCalled();
  });

  it("mesmo intent que o Brain escalaria vai direto ao recepcionista (LLM travado)", async () => {
    brain.reasonAsAgent.mockResolvedValue(
      brainOutcome({ shouldEscalate: true, escalationReason: "reclamação", idealResponse: "Vou te passar pra um atendente. 🤝" }),
    );
    const out = await WhatsAppBrainRuntimeService.respond("conv_1");
    // Com o free-form desligado o fluxo nem chega no Brain: o recepcionista
    // assume (e é ele quem decide o handoff via needsHandoff/UNKNOWN).
    expect(recep.WhatsAppReceptionistService.respond).toHaveBeenCalledWith("conv_1");
    expect(brain.reasonAsAgent).not.toHaveBeenCalled();
    expect(out.status).toBe("REPLIED");
  });

  it("VIVO (allowlist): telefone liberado + crítico PASS → o Brain responde o cliente", async () => {
    db.brainFreeFormConfig.findUnique.mockResolvedValue({
      restaurantId: "rest_1", mode: "ALLOWLIST", allowlistedPhones: ["5511999"], paused: false, minConfidence: 0.6, notes: null,
    });
    const out = await WhatsAppBrainRuntimeService.respond("conv_1");
    expect(brain.reasonAsAgent).toHaveBeenCalledTimes(1);
    // Janela de conversa vai junto no raciocínio vivo
    expect(brain.reasonAsAgent.mock.calls[0][0]).toHaveProperty("sanitizedHistory");
    expect(messaging.WhatsAppMessagingService.sendConversationReply).toHaveBeenCalledTimes(1);
    expect(out.status).toBe("REPLIED");
    expect(recep.WhatsAppReceptionistService.respond).not.toHaveBeenCalled();
  });

  it("PRIMEIRA ABORDAGEM: sem sessão ativa, a pergunta abre o MENU — o Brain só entra depois", async () => {
    db.brainFreeFormConfig.findUnique.mockResolvedValue({
      restaurantId: "rest_1", mode: "ALLOWLIST", allowlistedPhones: ["5511999"], paused: false, minConfidence: 0.6, notes: null,
    });
    // 3ª findFirst (sessão ativa) = null → primeira abordagem: menu obrigatório.
    db.message.findFirst
      .mockReset()
      .mockResolvedValueOnce({ content: "tem rodízio?", type: "TEXT", sentAt: new Date() }) // lastInbound
      .mockResolvedValueOnce(null) // alreadyReplied
      .mockResolvedValueOnce(null); // sessão ativa = NENHUMA
    const out = await WhatsAppBrainRuntimeService.respond("conv_1");
    expect(recep.WhatsAppReceptionistService.respond).toHaveBeenCalledTimes(1); // menu
    expect(brain.reasonAsAgent).not.toHaveBeenCalled(); // inteligência NÃO entra na 1ª
    expect(out.reason).toMatch(/first-contact|menu obrigat/i);
  });

  it("VIVO (crítico reprova): coerência NEEDS_REVIEW → recepcionista assume, nada é enviado pelo Brain", async () => {
    db.brainFreeFormConfig.findUnique.mockResolvedValue({
      restaurantId: "rest_1", mode: "ALLOWLIST", allowlistedPhones: ["5511999"], paused: false, minConfidence: 0.6, notes: null,
    });
    brain.reasonAsAgent.mockResolvedValue(
      brainOutcome({ coherenceCheck: { verdict: "NEEDS_REVIEW", answersUserQuestion: true, matchesIntent: true, doesNotInventFacts: false, keepsBusinessObjective: true, reason: "preço fora da base" } }),
    );
    const out = await WhatsAppBrainRuntimeService.respond("conv_1");
    expect(messaging.WhatsAppMessagingService.sendConversationReply).not.toHaveBeenCalled();
    expect(recep.WhatsAppReceptionistService.respond).toHaveBeenCalledWith("conv_1");
    expect(out.reason).toContain("critic gate");
  });

  it("VIVO (confiança baixa): abaixo do piso → recepcionista assume", async () => {
    db.brainFreeFormConfig.findUnique.mockResolvedValue({
      restaurantId: "rest_1", mode: "ALLOWLIST", allowlistedPhones: ["5511999"], paused: false, minConfidence: 0.6, notes: null,
    });
    brain.reasonAsAgent.mockResolvedValue(brainOutcome({ confidence: 0.3 }));
    const out = await WhatsAppBrainRuntimeService.respond("conv_1");
    expect(messaging.WhatsAppMessagingService.sendConversationReply).not.toHaveBeenCalled();
    expect(out.reason).toContain("critic gate");
  });

  it("VIVO (fora da allowlist): mesmo com modo ALLOWLIST, telefone de fora fica no shadow", async () => {
    db.brainFreeFormConfig.findUnique.mockResolvedValue({
      restaurantId: "rest_1", mode: "ALLOWLIST", allowlistedPhones: ["5599000"], paused: false, minConfidence: 0.6, notes: null,
    });
    const out = await WhatsAppBrainRuntimeService.respond("conv_1");
    expect(messaging.WhatsAppMessagingService.sendConversationReply).not.toHaveBeenCalled();
    expect(recep.WhatsAppReceptionistService.respond).toHaveBeenCalledWith("conv_1");
    expect(out.reason).toContain("free-form disabled");
  });

  it("VIVO (judge reprova): fail-closed → recepcionista assume, nada é enviado", async () => {
    db.brainFreeFormConfig.findUnique.mockResolvedValue({
      restaurantId: "rest_1", mode: "ALLOWLIST", allowlistedPhones: ["5511999"], paused: false, minConfidence: 0.6, notes: null,
    });
    critic.judgeReply.mockResolvedValue({ approved: false, mode: "JUDGED", reason: "afirma promoção que não existe" });
    const out = await WhatsAppBrainRuntimeService.respond("conv_1");
    expect(messaging.WhatsAppMessagingService.sendConversationReply).not.toHaveBeenCalled();
    expect(recep.WhatsAppReceptionistService.respond).toHaveBeenCalledWith("conv_1");
    expect(out.reason).toContain("judge gate");
  });

  it("SHADOW: o Brain raciocina em paralelo (só log/evidência) sem responder o cliente", async () => {
    process.env.WHATSAPP_BRAIN_SHADOW_MODE = "true";
    process.env.OPENAI_API_KEY = "sk-test";
    db.message.findMany.mockResolvedValue([
      { direction: "INBOUND", content: "vocês têm rodízio?" },
    ]);
    const out = await WhatsAppBrainRuntimeService.respond("conv_1");
    // A resposta determinística sai na hora; a sombra corre por fora.
    expect(out.status).toBe("REPLIED");
    expect(out.reason).toContain("free-form disabled");
    expect(recep.WhatsAppReceptionistService.respond).toHaveBeenCalledWith("conv_1");
    await vi.waitFor(() => expect(brain.reasonAsAgent).toHaveBeenCalledTimes(1));
    const req = brain.reasonAsAgent.mock.calls[0][0];
    expect(req.sanitizedHistory.length).toBeGreaterThan(0);
    // Sombra NUNCA envia nada ao cliente.
    expect(messaging.WhatsAppMessagingService.sendConversationReply).not.toHaveBeenCalled();
  });

  it("never touches a conversation a human took over", async () => {
    db.conversation.findUnique.mockResolvedValue({
      id: "conv_1", restaurantId: "rest_1", status: "HUMAN", aiEnabled: false,
      customer: { id: "c", phone: "5511", name: "x" },
    });
    const out = await WhatsAppBrainRuntimeService.respond("conv_1");
    expect(out.status).toBe("SKIPPED");
    expect(brain.reasonAsAgent).not.toHaveBeenCalled();
    expect(messaging.WhatsAppMessagingService.sendConversationReply).not.toHaveBeenCalled();
  });

  it("is idempotent — skips if the AI already replied after the last inbound", async () => {
    db.message.findFirst.mockReset();
    db.message.findFirst
      .mockResolvedValueOnce({ content: "oi", type: "TEXT", sentAt: new Date() })
      .mockResolvedValueOnce({ id: "already" });
    const out = await WhatsAppBrainRuntimeService.respond("conv_1");
    expect(out.status).toBe("SKIPPED");
    expect(messaging.WhatsAppMessagingService.sendConversationReply).not.toHaveBeenCalled();
  });

  it("never throws into the webhook — returns SKIPPED on error", async () => {
    db.conversation.findUnique.mockRejectedValue(new Error("db down"));
    const out = await WhatsAppBrainRuntimeService.respond("conv_1");
    expect(out.status).toBe("SKIPPED");
  });
});
