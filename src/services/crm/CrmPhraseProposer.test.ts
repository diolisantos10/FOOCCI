import { describe, it, expect, beforeEach, vi } from "vitest";

const reasonAsAgent = vi.hoisted(() => vi.fn());
vi.mock("@/services/brain/reasoning/BrainReasoner", () => ({ reasonAsAgent }));
// piso real do agente (funções puras) — não mockamos, queremos a validação de verdade.

import { proposePhrase } from "./CrmPhraseProposer";

function outcome(idealResponse: string, verdict = "PASS", mode = "LLM") {
  return { reasoningMode: mode, result: { idealResponse, coherenceCheck: { verdict } } };
}

beforeEach(() => vi.clearAllMocks());

describe("CrmPhraseProposer — o agente cria repertório novo (shadow-safe)", () => {
  it("propõe uma frase limpa, nunca submete e nunca envia", async () => {
    reasonAsAgent.mockResolvedValue(outcome("Oi {nome}! Bateu a saudade da sua comida favorita? A gente te espera 😊"));
    const r = await proposePhrase({ restaurantId: "r1", objective: "recuperar cliente frio", targetSegment: "FRIO" });
    expect(r.ok).toBe(true);
    expect(r.clean).toBe(true);
    expect(r.submitted).toBe(false);
    expect(r.sent).toBe(false);
    expect(r.phrase).toMatch(/\{nome\}/);
  });

  it("barra no piso: desconto inventado sem cupom da campanha", async () => {
    reasonAsAgent.mockResolvedValue(outcome("Volta pra gente e ganhe 30% de desconto agora!"));
    const r = await proposePhrase({ restaurantId: "r1", objective: "recuperar", hasCoupon: false });
    expect(r.clean).toBe(false);
    expect(r.blockedReasons.join(" ")).toMatch(/desconto/i);
  });

  it("com cupom real, a mesma frase de desconto passa", async () => {
    reasonAsAgent.mockResolvedValue(outcome("Use o {cupom} e ganhe um mimo no próximo pedido 😋"));
    const r = await proposePhrase({ restaurantId: "r1", objective: "recompra", hasCoupon: true });
    expect(r.clean).toBe(true);
  });

  it("aprende com a campeã: injeta o padrão no pedido, sem copiar texto", async () => {
    reasonAsAgent.mockResolvedValue(outcome("Ei {nome}, faz tempo! Que tal aquele pedido de sempre hoje? 🍣"));
    await proposePhrase({
      restaurantId: "r1",
      objective: "reativar",
      winningExample: "Sumiu, {nome}?! Seu prato favorito tá com saudade — bora?",
    });
    const req = reasonAsAgent.mock.calls[0][0];
    expect(req.sanitizedInput).toMatch(/PADRÃO desta frase que converteu/);
    expect(req.sanitizedInput).toContain("Sumiu");
    expect(req.contextHints).toContain("aprender-com-campeã");
  });

  it("não repete uma frase já ativa", async () => {
    const jaAtiva = "Oi {nome}! Que tal um pedido hoje? 😊";
    reasonAsAgent.mockResolvedValue(outcome(jaAtiva));
    const r = await proposePhrase({ restaurantId: "r1", objective: "x", existingPhrases: [jaAtiva] });
    expect(r.clean).toBe(false);
    expect(r.blockedReasons.join(" ")).toMatch(/parecida/i);
  });

  it("erro no motor → degrada seguro (não submete, não envia)", async () => {
    reasonAsAgent.mockRejectedValue(new Error("timeout"));
    const r = await proposePhrase({ restaurantId: "r1", objective: "x" });
    expect(r.ok).toBe(false);
    expect(r.submitted).toBe(false);
    expect(r.sent).toBe(false);
  });
});
