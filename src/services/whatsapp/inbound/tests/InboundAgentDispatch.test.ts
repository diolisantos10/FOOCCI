/**
 * Trava do despacho de agente do WhatsApp.
 *
 * Cada teste aqui corresponde a um comportamento que existia DENTRO do
 * processador do webhook da Evolution e que **não existia** no webhook da Meta.
 * A Evolution foi eliminada do Foocci em 04/08/2026 por ordem do CEO; apagar sem
 * paridade seria derrubar recurso em produção, então a paridade virou este módulo
 * — e aqui ela vira mecanismo, não promessa ("prompt é aviso; código é trava").
 *
 * O que está travado:
 *   • comando interno (`/build`) é interceptado ANTES do fluxo de cliente, mesmo
 *     quando o handler explode — a invariante de supressão dura;
 *   • pedido por texto só entra quando o roteamento manda, e só bloqueia o host
 *     quando REALMENTE atendeu (resposta enviada ou handoff aplicado);
 *   • `agentMode` continua valendo (AI_ORDERING_EXPERIMENTAL / MENU_ONLY);
 *   • mídia/áudio cai no recepcionista — o Cérebro só trata texto;
 *   • nada aqui lança para dentro do webhook.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";

const db = vi.hoisted(() => ({
  whatsAppAgentConfig: { findUnique: vi.fn() },
}));
vi.mock("@/lib/prisma", () => ({ prisma: db }));

const buildos = vi.hoisted(() => ({
  isInternalCommandText: vi.fn(() => false),
  resolveBuildOsChannel: vi.fn(),
  handleBuildCommand: vi.fn(),
}));
vi.mock("@/services/buildos/BuildCommandRouter", () => ({
  isInternalCommandText: buildos.isInternalCommandText,
}));
vi.mock("@/services/buildos/BuildOSConfigService", () => ({
  resolveBuildOsChannel: buildos.resolveBuildOsChannel,
}));
vi.mock("@/services/buildos/handleBuildCommand", () => ({
  handleBuildCommand: buildos.handleBuildCommand,
}));

const routing = vi.hoisted(() => ({ getMessageAwareRoutingDecision: vi.fn() }));
vi.mock("@/services/whatsapp/ordering/WhatsAppTextOrderingConfigService", () => routing);

const engine = vi.hoisted(() => ({ handleInboundForOrdering: vi.fn() }));
vi.mock("@/services/whatsapp/ordering/WhatsAppTextOrderingRuntimeService", () => engine);

const agents = vi.hoisted(() => ({
  aiOrder: vi.fn(),
  brain: vi.fn(),
  receptionist: vi.fn(),
}));
vi.mock("@/services/ai/AIOrderService", () => ({
  AIOrderService: { processTurn: agents.aiOrder },
}));
vi.mock("@/services/whatsapp/brain/WhatsAppBrainRuntimeService", () => ({
  WhatsAppBrainRuntimeService: { respond: agents.brain },
}));
vi.mock("@/services/ai/WhatsAppReceptionistService", () => ({
  WhatsAppReceptionistService: { respond: agents.receptionist },
}));

import { dispatchInboundAgent, interceptBuildOsCommand } from "../InboundAgentDispatch";

const BASE = {
  restaurantId:   "rest_1",
  conversationId: "conv_1",
  customerId:     "cust_1",
  phone:          "5511999990000",
  messageText:    "quero um yakisoba",
  isTextMessage:  true,
  channelId:      "pnid_restaurante",
};

/**
 * Os agentes são acionados por `import()` dinâmico e fire-and-forget — de
 * propósito: o webhook não espera o agente responder. Por isso o teste precisa
 * ceder o event loop antes de conferir quem foi chamado.
 */
const flush = () => new Promise((r) => setTimeout(r, 0));

/** Roteamento que NÃO manda para o pedido por texto (o caso comum). */
function semPedidoPorTexto() {
  return {
    config: { dbConfigPresent: false, source: "env", mode: "DRY_RUN_ONLY" },
    wouldRouteToTextOrdering: false,
    detectedIntent: "UNKNOWN",
    messageHasOrderIntent: false,
    hasActiveSession: false,
    replyCapable: false,
    declineReason: "sem intenção de pedido",
    effectiveFinalHandler: "OLD_WHATSAPP_AGENT",
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  delete process.env.WHATSAPP_BRAIN_ENABLED;
  db.whatsAppAgentConfig.findUnique.mockResolvedValue(null); // → RECEPTIONIST_ONLY
  routing.getMessageAwareRoutingDecision.mockResolvedValue(semPedidoPorTexto());
  buildos.resolveBuildOsChannel.mockResolvedValue({
    isBuildOsChannel: false, masterConfigured: false, viaLegacyFallback: false,
    isAdminInstance: false, masterChannelId: null,
  });
  buildos.handleBuildCommand.mockResolvedValue({ isBuildCommand: false });
  agents.brain.mockResolvedValue({ status: "REPLIED" });
  agents.receptionist.mockResolvedValue({ status: "REPLIED" });
  agents.aiOrder.mockResolvedValue(undefined);
});

// ── Build OS: a supressão dura ───────────────────────────────────────────────

describe("interceptBuildOsCommand — supressão dura do comando interno", () => {
  it("num número de RESTAURANTE, o prefixo é interceptado (nunca chega ao cliente)", async () => {
    buildos.isInternalCommandText.mockReturnValue(true);
    buildos.handleBuildCommand.mockResolvedValue({ isBuildCommand: true });

    const r = await interceptBuildOsCommand({
      restaurantId: "rest_1", phone: BASE.phone, content: "/build teste", channelId: "pnid_restaurante",
    });
    expect(r.intercepted).toBe(true);
    // O portão de canal vai junto: quem decide executar é o handleBuildCommand.
    expect(buildos.handleBuildCommand).toHaveBeenCalledWith(
      expect.objectContaining({ isBuildOsChannel: false, channelId: "pnid_restaurante" }),
    );
  });

  it("se o handler EXPLODE, o prefixo continua suprimido — a invariante dura", async () => {
    buildos.isInternalCommandText.mockReturnValue(true);
    buildos.handleBuildCommand.mockRejectedValue(new Error("boom"));

    const r = await interceptBuildOsCommand({
      restaurantId: "rest_1", phone: BASE.phone, content: "/build teste", channelId: "pnid_restaurante",
    });
    // Isto é o ponto: a exceção NÃO pode virar "deixa passar para a IA".
    expect(r.intercepted).toBe(true);
  });

  it("mensagem normal de cliente não é interceptada", async () => {
    buildos.isInternalCommandText.mockReturnValue(false);
    const r = await interceptBuildOsCommand({
      restaurantId: "rest_1", phone: BASE.phone, content: "boa noite", channelId: "pnid_restaurante",
    });
    expect(r.intercepted).toBe(false);
    expect(buildos.handleBuildCommand).not.toHaveBeenCalled();
  });
});

// ── Pedido por texto × host ──────────────────────────────────────────────────

describe("dispatchInboundAgent — pedido por texto só bloqueia o host quando atendeu", () => {
  it("motor enviou resposta → host NÃO é chamado", async () => {
    routing.getMessageAwareRoutingDecision.mockResolvedValue({
      ...semPedidoPorTexto(), wouldRouteToTextOrdering: true,
    });
    engine.handleInboundForOrdering.mockResolvedValue({
      handled: true, replySent: true, handoffApplied: false, replyWouldSend: true,
      mode: "ALLOWLIST_REPLY_ONLY", result: { suggestedReply: "Adicionei!" }, blockedReason: null,
    });

    const r = await dispatchInboundAgent(BASE);
    await flush();
    expect(r.handler).toBe("TEXT_ORDERING");
    expect(agents.brain).not.toHaveBeenCalled();
    expect(agents.receptionist).not.toHaveBeenCalled();
  });

  it("DRY_RUN (handled=true mas nada enviado) → o host ASSUME, o cliente não fica mudo", async () => {
    routing.getMessageAwareRoutingDecision.mockResolvedValue({
      ...semPedidoPorTexto(), wouldRouteToTextOrdering: true,
    });
    engine.handleInboundForOrdering.mockResolvedValue({
      handled: true, replySent: false, handoffApplied: false, replyWouldSend: false,
      mode: "DRY_RUN_ONLY", result: { suggestedReply: "Adicionei!" }, blockedReason: null,
    });

    const r = await dispatchInboundAgent(BASE);
    await flush();
    expect(r.handler).toBe("BRAIN");
    expect(agents.brain).toHaveBeenCalledWith("conv_1");
  });

  it("motor EXPLODE → o host assume; a mensagem do cliente nunca é engolida", async () => {
    routing.getMessageAwareRoutingDecision.mockResolvedValue({
      ...semPedidoPorTexto(), wouldRouteToTextOrdering: true,
    });
    engine.handleInboundForOrdering.mockRejectedValue(new Error("engine down"));

    const r = await dispatchInboundAgent(BASE);
    await flush();
    expect(r.handler).toBe("BRAIN");
    expect(agents.brain).toHaveBeenCalledTimes(1);
  });

  it("decisão de roteamento FALHA → o host assume (não se adivinha 'é pedido')", async () => {
    routing.getMessageAwareRoutingDecision.mockRejectedValue(new Error("db down"));
    const r = await dispatchInboundAgent(BASE);
    await flush();
    expect(r.handler).toBe("BRAIN");
    expect(engine.handleInboundForOrdering).not.toHaveBeenCalled();
  });
});

// ── agentMode ────────────────────────────────────────────────────────────────

describe("dispatchInboundAgent — agentMode continua valendo", () => {
  it("AI_ORDERING_EXPERIMENTAL → AIOrderService", async () => {
    db.whatsAppAgentConfig.findUnique.mockResolvedValue({ agentMode: "AI_ORDERING_EXPERIMENTAL" });
    const r = await dispatchInboundAgent(BASE);
    await flush();
    expect(r.handler).toBe("AI_ORDERING");
    expect(agents.aiOrder).toHaveBeenCalledWith("conv_1");
    expect(agents.brain).not.toHaveBeenCalled();
  });

  it("MENU_ONLY → recepcionista, nunca o Cérebro", async () => {
    db.whatsAppAgentConfig.findUnique.mockResolvedValue({ agentMode: "MENU_ONLY" });
    const r = await dispatchInboundAgent(BASE);
    await flush();
    expect(r.handler).toBe("RECEPTIONIST");
    expect(agents.brain).not.toHaveBeenCalled();
  });

  it("WHATSAPP_BRAIN_ENABLED=false → recepcionista", async () => {
    process.env.WHATSAPP_BRAIN_ENABLED = "false";
    const r = await dispatchInboundAgent(BASE);
    await flush();
    expect(r.handler).toBe("RECEPTIONIST");
  });

  it("mídia/áudio (sem texto) → recepcionista; o Cérebro só trata texto", async () => {
    const r = await dispatchInboundAgent({ ...BASE, isTextMessage: false, messageText: null });
    await flush();
    expect(r.handler).toBe("RECEPTIONIST");
    expect(agents.brain).not.toHaveBeenCalled();
    // Sem texto não há roteamento de pedido a calcular.
    expect(routing.getMessageAwareRoutingDecision).not.toHaveBeenCalled();
  });
});

// ── Nunca derruba o webhook ──────────────────────────────────────────────────

describe("dispatchInboundAgent — nunca lança para dentro do webhook", () => {
  it("falha inesperada vira NENHUM, não exceção (a Meta desativaria a inscrição)", async () => {
    db.whatsAppAgentConfig.findUnique.mockImplementation(() => { throw new Error("db down"); });
    // `.catch(() => null)` interno cobre o findUnique; forçamos a falha mais acima.
    routing.getMessageAwareRoutingDecision.mockImplementation(() => { throw new Error("boom"); });
    const r = await dispatchInboundAgent(BASE);
    await flush();
    expect(["BRAIN", "RECEPTIONIST", "NENHUM"]).toContain(r.handler);
    expect(r.reason).toBeTruthy();
  });
});
