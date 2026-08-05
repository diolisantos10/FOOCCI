/**
 * Trava das guardas de entrada do WhatsApp.
 *
 * Cada teste aqui corresponde a um comportamento que EXISTIA no caminho da
 * Evolution e NÃO existia no da Meta. Sem eles a paridade é promessa; com eles é
 * mecanismo — "prompt é aviso; código é trava".
 *
 * O teste que mais importa é o último: falha inesperada **nega**, nunca libera.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { ConversationType, ConversationStatus } from "@prisma/client";

const db = vi.hoisted(() => ({
  conversation: { findUnique: vi.fn() },
}));
const svc = vi.hoisted(() => ({
  applyInboundOptOut: vi.fn(),
  markCrmReplyIfApplicable: vi.fn(),
  markConversationNeedsHuman: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({ prisma: db }));
vi.mock("@/services/crm/ContactSafetyService", () => ({
  ContactSafetyService: { applyInboundOptOut: svc.applyInboundOptOut },
}));
vi.mock("@/services/agents/AgentRoutingService", () => ({
  markCrmReplyIfApplicable: svc.markCrmReplyIfApplicable,
}));
vi.mock("@/lib/handoff", () => ({
  markConversationNeedsHuman: svc.markConversationNeedsHuman,
}));

import { InboundGuardsService } from "../InboundGuardsService";

const CONV_LIBERADA = {
  aiEnabled: true,
  aiLocked: false,
  conversationType: ConversationType.CUSTOMER,
  status: ConversationStatus.OPEN,
  contextType: "INBOUND",
};

const ENTRADA = {
  conversationId: "c1",
  restaurantId: "r1",
  customerId: "cli1",
  messageText: "oi, quero pedir",
  isTextMessage: true,
};

beforeEach(() => {
  vi.clearAllMocks();
  db.conversation.findUnique.mockResolvedValue(CONV_LIBERADA);
  svc.applyInboundOptOut.mockResolvedValue(false);
  svc.markCrmReplyIfApplicable.mockResolvedValue(undefined);
  svc.markConversationNeedsHuman.mockResolvedValue(true);
});

describe("InboundGuardsService — paridade que faltava no webhook da Meta", () => {
  it("conversa normal de cliente: a IA pode responder", async () => {
    const r = await InboundGuardsService.apply(ENTRADA);
    expect(r.aiMayRespond).toBe(true);
    expect(r.reason).toBeNull();
  });

  it("cliente pediu para SAIR neste turno → a IA NÃO responde", async () => {
    svc.applyInboundOptOut.mockResolvedValue(true);
    const r = await InboundGuardsService.apply({ ...ENTRADA, messageText: "PARAR" });
    expect(r.optedOutThisTurn).toBe(true);
    expect(r.aiMayRespond).toBe(false);
    expect(r.reason).toBe("OPT_OUT_NESTE_TURNO");
  });

  it("resgate de carrinho → passa para humano e a IA NÃO responde", async () => {
    db.conversation.findUnique.mockResolvedValue({ ...CONV_LIBERADA, contextType: "CART_RECOVERY" });
    const r = await InboundGuardsService.apply(ENTRADA);
    expect(svc.markConversationNeedsHuman).toHaveBeenCalledWith("c1", "CART_RECOVERY");
    expect(r.aiMayRespond).toBe(false);
    expect(r.reason).toBe("RESGATE_DE_CARRINHO");
  });

  it("trava de Staff (P0-A) → a IA NÃO responde, mesmo com aiEnabled true", async () => {
    db.conversation.findUnique.mockResolvedValue({
      ...CONV_LIBERADA,
      conversationType: ConversationType.STAFF,
    });
    const r = await InboundGuardsService.apply(ENTRADA);
    expect(r.aiMayRespond).toBe(false);
  });

  it("conversa travada manualmente → a IA NÃO responde", async () => {
    db.conversation.findUnique.mockResolvedValue({ ...CONV_LIBERADA, aiLocked: true });
    const r = await InboundGuardsService.apply(ENTRADA);
    expect(r.aiMayRespond).toBe(false);
  });

  it("a atribuição de CRM roda mesmo quando a IA não vai responder", async () => {
    // É medição de receita, não de conversa: a campanha converteu de qualquer jeito.
    svc.applyInboundOptOut.mockResolvedValue(true);
    await InboundGuardsService.apply(ENTRADA);
    expect(svc.markCrmReplyIfApplicable).toHaveBeenCalledWith("c1");
  });

  it("mídia não dispara opt-out — não se detecta 'PARAR' num áudio", async () => {
    await InboundGuardsService.apply({ ...ENTRADA, isTextMessage: false, messageText: null });
    expect(svc.applyInboundOptOut).not.toHaveBeenCalled();
  });

  // Este caso já certificou um furo de LGPD como se fosse comportamento correto:
  // ele provava que sem `customerId` o opt-out é pulado — e era exatamente isso
  // que fazia "PARAR" não funcionar para quem tinha conversa antiga sem cliente
  // vinculado. O buraco foi fechado na origem (o webhook agora cura a conversa
  // antes de chamar as guardas), então aqui o que se trava é o contrato honesto:
  // sem cliente, o turno NÃO pode ser tratado como "opt-out verificado".
  it("conversa sem cliente de CRM não quebra a guarda — mas registra que não deu para aplicar opt-out", async () => {
    const erro = vi.spyOn(console, "error").mockImplementation(() => {});
    const r = await InboundGuardsService.apply({ ...ENTRADA, customerId: null });
    expect(svc.applyInboundOptOut).not.toHaveBeenCalled();
    expect(r.aiMayRespond).toBe(true);
    expect(erro).toHaveBeenCalled();
    erro.mockRestore();
  });

  it("conversa inexistente → nega", async () => {
    db.conversation.findUnique.mockResolvedValue(null);
    const r = await InboundGuardsService.apply(ENTRADA);
    expect(r.aiMayRespond).toBe(false);
  });

  it("FALHA INESPERADA NEGA — nunca libera por omissão", async () => {
    // Guardrail 1: ausência de informação não é informação. Se não deu para
    // decidir, a resposta segura é não responder.
    db.conversation.findUnique.mockRejectedValue(new Error("banco caiu"));
    const r = await InboundGuardsService.apply(ENTRADA);
    expect(r.aiMayRespond).toBe(false);
    expect(r.reason).toBe("ERRO_NAS_GUARDAS");
  });

  it("nunca lança — derrubar o webhook faria a Meta desativar a inscrição", async () => {
    db.conversation.findUnique.mockRejectedValue(new Error("boom"));
    await expect(InboundGuardsService.apply(ENTRADA)).resolves.toBeDefined();
  });
});
