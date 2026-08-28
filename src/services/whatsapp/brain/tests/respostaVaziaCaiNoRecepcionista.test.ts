/**
 * Resposta vazia do LLM NÃO pode virar silêncio — prova de ponta a ponta.
 *
 * ── O caso ───────────────────────────────────────────────────────────────────
 * Um cliente do Sushi Cazza escreveu e ficou sem resposta. Um dos catorze
 * caminhos de saída mudos era este: o Cérebro pedia a resposta ao LLM, recebia
 * string vazia e devolvia `{ status: "SKIPPED", reason: "brain produced no
 * reply" }` — sem log e, pior, SEM REDE. Os dois portões irmãos (crítico e
 * juiz) já caíam no recepcionista determinístico; só este calava. Assimetria,
 * não decisão.
 *
 * ── Por que este teste usa o RECEPCIONISTA DE VERDADE ────────────────────────
 * Um teste que só afirma "a função `respond` foi chamada" não prova nada sobre
 * o que o cliente lê — o mock responde qualquer coisa, inclusive nada. Aqui o
 * `WhatsAppReceptionistService` é o módulo REAL: o único ponto falso é a porta
 * de saída (`WhatsAppMessagingService.sendConversationReply`), que é por onde a
 * mensagem sai para o telefone do cliente. A asserção é sobre o TEXTO que
 * chegaria ao número dele.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";

const AGORA = new Date();
const JANELA_ANTIGA_MS = 5 * 60 * 1000;

const db = vi.hoisted(() => ({
  // Portão de qualidade VERDE (LiveStageGuard) — sem isto a escada derruba o
  // degrau por falha fechada e o caso nunca chegaria ao LLM.
  qualityAuditRun: {
    findFirst: async () => ({ id: "run_verde", finishedAt: new Date(), findings: [{ severity: "P2", status: "PASS" }] }),
  },
  conversation:            { findUnique: vi.fn(), update: vi.fn() },
  message:                 { findFirst: vi.fn(), findMany: vi.fn(), create: vi.fn() },
  brainFreeFormConfig:     { findUnique: vi.fn() },
  brainShadowLog:          { create: vi.fn(), findMany: vi.fn() },
  restaurant:              { findUnique: vi.fn() },
  storeProfile:            { findUnique: vi.fn() },
  whatsAppAgentConfig:     { findUnique: vi.fn() },
  restaurantBrandConfig:   { findUnique: vi.fn() },
  businessHours:           { findMany: vi.fn() },
  menuCategory:            { findMany: vi.fn() },
  $transaction:            vi.fn(),
}));
vi.mock("@/lib/prisma", () => ({ prisma: db }));

// Porta de saída para o cliente. É o ÚNICO ponto falso da cadeia.
const messaging = vi.hoisted(() => ({
  WhatsAppMessagingService: { sendConversationReply: vi.fn(), sendText: vi.fn() },
}));
vi.mock("@/services/whatsapp/WhatsAppMessagingService", () => messaging);

const meta = vi.hoisted(() => ({
  MetaConfigService: { getResolved: vi.fn() },
}));
vi.mock("@/services/whatsapp/MetaConfigService", () => meta);

const brain = vi.hoisted(() => ({ reasonAsAgent: vi.fn() }));
vi.mock("@/services/brain/reasoning/BrainReasoner", () => brain);

const critic = vi.hoisted(() => ({ judgeReply: vi.fn() }));
vi.mock("@/services/brain/reasoning/BrainCoherenceCritic", () => critic);

vi.mock("@/lib/openai", () => ({ openai: {} }));
vi.mock("@/lib/handoff", () => ({ markConversationNeedsHuman: vi.fn() }));
vi.mock("@/lib/wa-menu-link", () => ({ buildShortMenuUrl: vi.fn(async () => null) }));
vi.mock("@/services/buildos/BuildCommandRouter", () => ({
  detectBuildCommand: () => false,
  isInternalCommandText: () => false,
}));
vi.mock("@/services/knowledge/RestaurantKnowledgeService", () => ({
  RestaurantKnowledgeService: {
    createGap:      vi.fn(async () => null),
    findMatch:      vi.fn(async () => null),
    incrementUsage: vi.fn(async () => null),
  },
}));
vi.mock("@/services/agent-training/AgentTrainingFailureCaptureService", () => ({
  captureFailure: vi.fn(async () => null),
}));

import { WhatsAppBrainRuntimeService } from "../WhatsAppBrainRuntimeService";

const ENDERECO = "Rua das Palmeiras, 100, Centro, São Paulo, SP";
/** ADDRESS_REQUEST: não é saudação nem menu, então o Cérebro chega ao LLM. */
const PERGUNTA = "qual é o endereço de vocês?";

function outcomeComRespostaVazia(idealResponse: string) {
  return {
    engine: { provider: "OPENAI", model: "gpt-4o-mini", reason: "" },
    reasoningMode: "LLM",
    snapshot: { truthSources: {}, missingContext: [] },
    result: {
      primaryIntent: "ADDRESS_REQUEST",
      idealResponse,
      confidence: 0.95,
      coherenceCheck: { verdict: "PASS", answersUserQuestion: true, matchesIntent: true, doesNotInventFacts: true, keepsBusinessObjective: true, reason: "" },
      shouldEscalate: false,
      runtimeTouched: false,
    },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.WHATSAPP_BRAIN_SHADOW_MODE = "false";
  process.env.NEXTAUTH_SECRET = "segredo-de-teste-suficientemente-longo";

  db.conversation.findUnique.mockResolvedValue({
    id: "conv_1", restaurantId: "rest_1", status: "BOT", aiEnabled: true,
    activeSubmenuId: null, customerPhone: "5511999990000", customerName: "Ana",
    customer: { id: "cust_1", phone: "5511999990000", name: "Ana" },
  });

  /**
   * `message.findFirst` serve DOIS serviços nesta cadeia, com quatro perguntas
   * diferentes. Roteamos pelo `where` em vez de por ordem de chamada — ordem é
   * frágil quando dois módulos compartilham o mesmo mock.
   *
   * A distinção entre "já respondi?" e "há sessão ativa?" é o `sentAt.gte`:
   * a primeira usa o instante da mensagem do cliente (agora), a segunda usa
   * agora−30min. Só a segunda olha para trás.
   */
  db.message.findFirst.mockImplementation(async (args: {
    where: { direction?: string; senderType?: string; sentAt?: { gte?: Date } };
  }) => {
    const w = args.where;
    if (w.direction === "INBOUND") return { content: PERGUNTA, type: "TEXT", sentAt: AGORA };
    const gte = w.sentAt?.gte;
    const olhaParaTras = gte instanceof Date && AGORA.getTime() - gte.getTime() > JANELA_ANTIGA_MS;
    // Sessão ativa: o bot já falou dentro da janela de 30 min (menu já aberto).
    if (olhaParaTras) return { id: "msg_bot_anterior", sentAt: new Date(AGORA.getTime() - 60_000), content: "Como posso ajudar?" };
    // "Já respondi depois desta mensagem?" — não. Se fosse sim, ninguém responderia.
    return null;
  });
  db.message.findMany.mockResolvedValue([]);

  // Free-form LIBERADO para este telefone — é o único jeito de chegar no LLM.
  db.brainFreeFormConfig.findUnique.mockResolvedValue({
    restaurantId: "rest_1", mode: "ALLOWLIST", allowlistedPhones: ["5511999990000"],
    paused: false, minConfidence: 0.6, notes: null, updatedAt: new Date(),
  });
  db.brainShadowLog.create.mockResolvedValue({});
  // Topo medido e saudável: sem amostras PASS a segunda trava da escada rebaixa
  // para SHADOW_ONLY e o caso nunca chegaria ao LLM.
  db.brainShadowLog.findMany.mockResolvedValue(
    Array.from({ length: 30 }, () => ({ coherence: "PASS" })),
  );

  db.restaurant.findUnique.mockResolvedValue({
    name: "Sushi Cazza", slug: "sushi-cazza", address: ENDERECO,
    timezone: "America/Sao_Paulo", isOrderingPaused: false,
    orderingPausedUntil: null, orderingPausedReason: null,
  });
  db.storeProfile.findUnique.mockResolvedValue(null);
  db.whatsAppAgentConfig.findUnique.mockResolvedValue(null);
  db.restaurantBrandConfig.findUnique.mockResolvedValue(null);
  db.businessHours.findMany.mockResolvedValue([]);
  db.menuCategory.findMany.mockResolvedValue([]);
  db.$transaction.mockResolvedValue([{}, {}]);

  meta.MetaConfigService.getResolved.mockResolvedValue({
    restaurantId: "rest_1", phoneNumberId: "pnid_1", accessToken: "token",
    connectionStatus: "CONNECTED", displayPhoneNumber: "+55 11 99999-0000",
  });
  messaging.WhatsAppMessagingService.sendConversationReply.mockResolvedValue({
    ok: true, provider: "META_CLOUD_API", status: "SENT", providerMessageId: "wamid.1",
  });
  critic.judgeReply.mockResolvedValue({ approved: true, mode: "JUDGED", reason: "coerente" });
});

describe("LLM devolveu vazio — o cliente ainda assim é respondido", () => {
  it("a rede existe: string vazia do LLM faz o recepcionista REAL enviar texto ao telefone do cliente", async () => {
    brain.reasonAsAgent.mockResolvedValue(outcomeComRespostaVazia(""));

    const out = await WhatsAppBrainRuntimeService.respond("conv_1");

    // 1 · O LLM foi realmente consultado — o caso exercita o portão certo.
    expect(brain.reasonAsAgent).toHaveBeenCalledTimes(1);
    // 2 · Chegou UMA mensagem à porta de saída do cliente.
    expect(messaging.WhatsAppMessagingService.sendConversationReply).toHaveBeenCalledTimes(1);
    const enviado = messaging.WhatsAppMessagingService.sendConversationReply.mock.calls[0][0];
    // 3 · Foi para o telefone DELE.
    expect(enviado.toPhone).toBe("5511999990000");
    // 4 · E tem conteúdo de verdade — não string vazia, não só rodapé.
    expect(enviado.text.trim().length).toBeGreaterThan(20);
    // 5 · É a resposta determinística do recepcionista à pergunta que ele fez.
    expect(enviado.text).toContain(ENDERECO);
    // 6 · O desfecho declarado deixa de ser silêncio.
    expect(out.status).toBe("REPLIED");
    expect(out.reason).toContain("receptionist");
  });

  it("só string vazia aciona a rede: com resposta cheia, quem fala é o Cérebro", async () => {
    brain.reasonAsAgent.mockResolvedValue(outcomeComRespostaVazia("Estamos na Rua das Palmeiras, 100. 😊"));

    const out = await WhatsAppBrainRuntimeService.respond("conv_1");

    expect(messaging.WhatsAppMessagingService.sendConversationReply).toHaveBeenCalledTimes(1);
    const enviado = messaging.WhatsAppMessagingService.sendConversationReply.mock.calls[0][0];
    expect(enviado.text).toContain("Rua das Palmeiras, 100. 😊");
    expect(enviado.metadata?.source).toBe("WHATSAPP_BRAIN");
    expect(out.status).toBe("REPLIED");
    expect(out.reason).not.toContain("receptionist");
  });

  it("resposta só com espaços em branco conta como vazia — a rede também pega", async () => {
    brain.reasonAsAgent.mockResolvedValue(outcomeComRespostaVazia("   \n  "));

    const out = await WhatsAppBrainRuntimeService.respond("conv_1");

    expect(messaging.WhatsAppMessagingService.sendConversationReply).toHaveBeenCalledTimes(1);
    expect(messaging.WhatsAppMessagingService.sendConversationReply.mock.calls[0][0].text).toContain(ENDERECO);
    expect(out.reason).toContain("receptionist");
  });

  it("o silêncio fica no log: gate, motivo, conversa e restaurante", async () => {
    brain.reasonAsAgent.mockResolvedValue(outcomeComRespostaVazia(""));
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    await WhatsAppBrainRuntimeService.respond("conv_1");

    const linha = warn.mock.calls.find(
      (c) => c[0] === "[BrainDecision]" && String(c[1]).includes('"empty-reply"'),
    );
    expect(linha, "nenhuma linha [BrainDecision] com gate empty-reply").toBeDefined();
    const payload = JSON.parse(String(linha![1]));
    expect(payload).toMatchObject({
      gate: "empty-reply",
      reason: "brain produced no reply",
      conversationId: "conv_1",
      restaurantId: "rest_1",
    });
    warn.mockRestore();
  });
});
