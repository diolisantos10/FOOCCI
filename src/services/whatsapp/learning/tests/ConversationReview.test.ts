/**
 * ConversationReview — pure outcome classification + issue detection from real
 * WhatsApp conversations. No DB, no Evolution, no sends. PII must be masked.
 */

import { vi, describe, it, expect } from "vitest";

// conversationReview → WhatsAppReceptionistService + AgentTrainingFailureCaptureService
// both pull a heavy module graph; mock it so we exercise only the pure logic.
vi.mock("@/lib/prisma", () => ({ prisma: {} }));
vi.mock("@/lib/openai", () => ({ openai: {} }));
vi.mock("@/services/evolution/EvolutionConfigService", () => ({ EvolutionConfigService: class {} }));
vi.mock("@/lib/evolution/EvolutionClient", () => ({ EvolutionClient: class {} }));
vi.mock("@/services/buildos/BuildCommandRouter", () => ({ detectBuildCommand: () => false }));
vi.mock("@/services/knowledge/RestaurantKnowledgeService", () => ({ RestaurantKnowledgeService: class {} }));
vi.mock("@/lib/handoff", () => ({ markConversationNeedsHuman: vi.fn() }));
vi.mock("@/lib/wa-token", () => ({ signWaToken: vi.fn() }));
vi.mock("@/services/ai/UnknownFallbackHandler", () => ({
  P0_FALLBACK_REPLY: "atendente", isRepeatedClarificationLoop: vi.fn(() => false), classifyReceptionistFailure: vi.fn(),
}));

import {
  reviewConversation,
  detectIssues,
  type ReviewMessage,
  type ConversationSignals,
} from "../conversationReview";

const now = new Date("2026-06-19T12:00:00Z");
const msg = (
  direction: "INBOUND" | "OUTBOUND",
  senderType: string,
  content: string,
  offset = 0,
): ReviewMessage => ({ direction, senderType, content, type: "TEXT", sentAt: new Date(now.getTime() + offset) });

const signals = (over: Partial<ConversationSignals>): ConversationSignals => ({
  conversationId: "c1", status: "OPEN", hasOrder: false, hasPix: false, handoff: false, messages: [], ...over,
});

describe("reviewConversation — headline outcome", () => {
  it("pedido criado → VENDA_CONCLUIDA", () => {
    const r = reviewConversation(signals({ hasOrder: true, hasPix: true }));
    expect(r.outcome).toBe("VENDA_CONCLUIDA");
  });

  it("handoff → ATENDENTE_ASSUMIU", () => {
    const r = reviewConversation(signals({ handoff: true, status: "HUMAN", messages: [msg("INBOUND", "CUSTOMER", "quero falar com atendente")] }));
    expect(r.outcome).toBe("ATENDENTE_ASSUMIU");
  });

  it("conversa só com saudação e sem seguir → CLIENTE_ABANDONOU", () => {
    const r = reviewConversation(signals({ messages: [msg("INBOUND", "CUSTOMER", "oi"), msg("OUTBOUND", "AI", "Olá! Como posso ajudar?\n\n0. menu")] }));
    expect(r.outcome).toBe("CLIENTE_ABANDONOU");
  });

  it("intenção de pedido sem fechar → OPORTUNIDADE_DE_VENDA_PERDIDA", () => {
    const r = reviewConversation(signals({
      messages: [
        msg("INBOUND", "CUSTOMER", "quero 1 yakisoba"),
        msg("OUTBOUND", "AI", "Claro 😊 escolha:\n\n1️⃣ Fazer pedido\n2️⃣ Falar com atendente\n\n0. menu"),
      ],
    }));
    expect(r.outcome).toBe("OPORTUNIDADE_DE_VENDA_PERDIDA");
  });
});

describe("detectIssues — behavior problems", () => {
  it("pagamento respondido com link → ERRO_DE_PAGAMENTO", () => {
    const issues = detectIssues([
      msg("INBOUND", "CUSTOMER", "posso pagar com Pix?"),
      msg("OUTBOUND", "AI", "Veja o cardápio: https://foocci.com.br/pedido/x"),
    ]);
    expect(issues.map((i) => i.kind)).toContain("ERRO_DE_PAGAMENTO");
  });

  it("endereço solto respondido com localização → ERRO_DE_ENDERECO", () => {
    const issues = detectIssues([
      msg("INBOUND", "CUSTOMER", "Rua Araraquara 60"),
      msg("OUTBOUND", "AI", "Estamos em: Av. Central, 100"),
    ]);
    expect(issues.map((i) => i.kind)).toContain("ERRO_DE_ENDERECO");
  });

  it("pedido explícito respondido com link → ERRO_DE_RESPOSTA", () => {
    const issues = detectIssues([
      msg("INBOUND", "CUSTOMER", "quero 2 temakis"),
      msg("OUTBOUND", "AI", "Acesse: https://foocci.com.br/pedido/x"),
    ]);
    expect(issues.map((i) => i.kind)).toContain("ERRO_DE_RESPOSTA");
  });

  it("IA repetiu a mesma resposta → LOOP", () => {
    const issues = detectIssues([
      msg("INBOUND", "CUSTOMER", "hmm"),
      msg("OUTBOUND", "AI", "Não entendi, pode repetir?"),
      msg("INBOUND", "CUSTOMER", "???"),
      msg("OUTBOUND", "AI", "Não entendi, pode repetir?"),
    ]);
    expect(issues.map((i) => i.kind)).toContain("LOOP");
  });

  it("resposta correta de pagamento (sem link) NÃO gera erro", () => {
    const issues = detectIssues([
      msg("INBOUND", "CUSTOMER", "aceita Pix?"),
      msg("OUTBOUND", "AI", "Sim, aceitamos Pix 😊 Quer fazer seu pedido agora?\n\n1️⃣ Fazer pedido\n2️⃣ Falar com atendente\n\n0. menu"),
    ]);
    expect(issues).toHaveLength(0);
  });
});

describe("reviewConversation — PII masking", () => {
  it("não vaza telefone do cliente no excerto do erro", () => {
    const r = reviewConversation(signals({
      messages: [
        msg("INBOUND", "CUSTOMER", "meu telefone é 11987654321, posso pagar com Pix?"),
        msg("OUTBOUND", "AI", "Veja o cardápio: https://foocci.com.br/pedido/x"),
      ],
    }));
    const issue = r.issues.find((i) => i.kind === "ERRO_DE_PAGAMENTO");
    expect(issue).toBeTruthy();
    expect(issue!.customerMessage).not.toContain("11987654321");
  });
});
