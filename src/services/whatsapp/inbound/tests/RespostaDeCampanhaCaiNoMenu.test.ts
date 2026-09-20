/**
 * O caso da Nathalia (Sushi Cazza, 20/09/2026).
 *
 * 13:31 — sai a campanha de CRM ("Tá curtindo o Sushi Cazza?").
 * 18:18 — a cliente responde "oi".
 * 18:19 — a cliente responde "?".
 * 18:2x — a Central mostra "IA solicitou atendimento humano" e um humano assume.
 *
 * O menu NUNCA apareceu. Não foi decisão de modelo nenhum: a conversa carimbada
 * CRM_CAMPAIGN batia numa REGRA FIXA — `shouldAiRespond` devolvia CRM_CONTEXT e
 * nenhum agente era acionado. A IA sequer foi chamada.
 *
 * A régua do dono: quem responde à campanha com saudação recebe o MENU. Humano
 * só quando o cliente pedir, ou quando houver reclamação.
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
import { shouldAiRespond } from "@/services/conversation/ConversationAiPolicyService";
import { detectIntent } from "@/services/ai/WhatsAppReceptionistService";

/** A conversa da Nathalia: nasceu de campanha, cliente comum, IA ligada. */
const CONVERSA_DA_NATHALIA = {
  aiEnabled: true,
  aiLocked: false,
  conversationType: ConversationType.CUSTOMER,
  status: ConversationStatus.OPEN,
  contextType: "CRM_CAMPAIGN",
};

const ENTRADA = {
  conversationId: "conv_nathalia",
  restaurantId: "sushi_cazza",
  customerId: "cli_nathalia",
  messageText: "oi",
  isTextMessage: true,
};

beforeEach(() => {
  vi.clearAllMocks();
  db.conversation.findUnique.mockResolvedValue(CONVERSA_DA_NATHALIA);
  svc.applyInboundOptOut.mockResolvedValue(false);
  svc.markCrmReplyIfApplicable.mockResolvedValue(undefined);
  svc.markConversationNeedsHuman.mockResolvedValue(true);
});

describe("resposta de campanha — a saudação abre o menu, não chama gente", () => {
  it('🔴 "oi" numa conversa de campanha LIBERA a IA (era CRM_CONTEXT, e ninguém respondia)', async () => {
    const r = await InboundGuardsService.apply(ENTRADA);
    expect(r.aiMayRespond).toBe(true);
    expect(r.cartRecoveryHandoff).toBe(false);
  });

  it('🔴 "?" também abre o menu — mensagem sem conteúdo é saudação, não pergunta aberta', async () => {
    expect(detectIntent("?")).toBe("GREETING");
    const r = await InboundGuardsService.apply({ ...ENTRADA, messageText: "?" });
    expect(r.aiMayRespond).toBe(true);
  });

  it("pergunta aberta vinda de campanha continua indo para gente (regra antiga preservada)", async () => {
    const r = await InboundGuardsService.apply({
      ...ENTRADA,
      messageText: "vocês entregam em Santo André por quanto?",
    });
    expect(r.aiMayRespond).toBe(false);
    expect(r.reason).toBe("CRM_CONTEXT");
  });

  it("reclamação e pedido explícito de humano nunca viram menu", async () => {
    for (const texto of ["quero falar com um atendente", "o pedido veio errado"]) {
      const r = await InboundGuardsService.apply({ ...ENTRADA, messageText: texto });
      expect(r.aiMayRespond).toBe(false);
      expect(r.reason).toBe("CRM_CONTEXT");
    }
  });

  it("a trava de quem assumiu a conversa continua valendo mesmo na saudação", () => {
    const d = shouldAiRespond(
      { ...CONVERSA_DA_NATHALIA, aiEnabled: false },
      { inboundIsMenuInteraction: true },
    );
    expect(d.allowed).toBe(false);
    expect(d.reason).toBe("HUMAN_TAKEOVER");
  });

  it("staff/fornecedor: a saudação não fura a trava permanente", () => {
    const d = shouldAiRespond(
      { ...CONVERSA_DA_NATHALIA, aiLocked: true, conversationType: ConversationType.STAFF },
      { inboundIsMenuInteraction: true },
    );
    expect(d.allowed).toBe(false);
    expect(d.locked).toBe(true);
  });
});
