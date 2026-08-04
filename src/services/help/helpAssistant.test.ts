/**
 * Prova da FUSÃO: a aba "Ajuda" raciocina pelo portão único do Brain.
 *
 * As duas metades de cada trava estão aqui de propósito: a que barra o caso ruim
 * (preço inventado não chega ao lojista) E a que prova que o caso legítimo passa
 * (resposta boa do manual sai inteira). Sem a segunda, o detector vira carimbo e
 * o agente para de conversar.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";

const { reasonMock, retrieveMock, probeMock } = vi.hoisted(() => ({
  reasonMock: vi.fn(),
  retrieveMock: vi.fn(),
  probeMock: vi.fn(),
}));

vi.mock("@/services/brain/reasoning/BrainReasoner", () => ({ reasonAsAgent: reasonMock }));
vi.mock("./manualRetrieval", () => ({ retrieveRelevantChapters: retrieveMock }));
vi.mock("@/services/support/SupportSystemProbe", () => ({ probeSystem: probeMock }));

import { answerHelpQuestion } from "./helpAssistant";

const chapter = {
  id: "1",
  slug: "guia-cadastrar-produto",
  title: "Como cadastrar um produto no cardápio",
  area: "UI_UX",
  content: "Vá em Vendas → Cardápio e clique em + Novo Produto.",
  score: 10,
};

function outcome(over: Record<string, unknown> = {}) {
  const {
    idealResponse = "Vá em Vendas → Cardápio e clique em + Novo Produto.",
    doesNotInventFacts = true,
    verdict = "PASS",
    shouldEscalate = false,
    reasoningMode = "LLM",
    ...rest
  } = over as Record<string, never>;
  return {
    engine: { provider: "OPENAI" },
    reasoningMode,
    snapshot: { truthSources: {}, missingContext: [] },
    result: {
      primaryIntent: "DUVIDA_DE_USO",
      idealResponse,
      shouldEscalate,
      escalationReason: undefined,
      coherenceCheck: { verdict, doesNotInventFacts, reason: "motivo" },
      runtimeTouched: false,
      ...rest,
    },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  retrieveMock.mockResolvedValue([chapter]);
  probeMock.mockResolvedValue({
    takenAt: "2026-08-04T12:00:00.000Z",
    db: { ok: true, detail: "respondendo" },
    config: [],
    summary: "tudo ok",
    healthy: true,
  });
  reasonMock.mockResolvedValue(outcome());
});

describe("(a) a ajuda passa pelo Brain — nunca pela OpenAI direto", () => {
  it("chama reasonAsAgent com o agente 'suporte-tecnico'", async () => {
    await answerHelpQuestion({ question: "como cadastro um produto", restaurantId: "r1" });

    expect(reasonMock).toHaveBeenCalledTimes(1);
    expect(reasonMock).toHaveBeenCalledWith(
      expect.objectContaining({ agentId: "suporte-tecnico", businessId: "r1", agentRole: "SUPPORT" }),
    );
  });

  it("o módulo não importa a IA-piloto (o teste arquitetural é o dente; este é o lembrete)", async () => {
    const { readFileSync } = await import("node:fs");
    const src = readFileSync(new URL("./helpAssistant.ts", import.meta.url), "utf8");
    expect(src).not.toMatch(/from\s+["'](?:@\/lib\/openai|openai)["']/);
  });

  it("leva o histórico multi-turn pelo campo sanitizedHistory do contrato", async () => {
    await answerHelpQuestion({
      question: "e o preço?",
      restaurantId: "r1",
      history: [
        { role: "user", content: "como cadastro um produto" },
        { role: "assistant", content: "Vá em Cardápio." },
      ],
    });

    const req = reasonMock.mock.calls[0]![0];
    expect(req.sanitizedHistory).toEqual([
      { role: "CUSTOMER", content: "como cadastro um produto" },
      { role: "AGENT", content: "Vá em Cardápio." },
    ]);
  });
});

describe("(b) o agente responde com base no manual", () => {
  it("injeta os trechos do manual como VERDADE (extraTruthSources.manual)", async () => {
    const r = await answerHelpQuestion({ question: "como cadastro um produto", restaurantId: "r1" });

    const req = reasonMock.mock.calls[0]![0];
    expect(req.extraTruthSources.manual).toEqual([
      { guia: chapter.title, trecho: chapter.content },
    ]);
    expect(r.grounded).toBe(true);
    expect(r.sources).toEqual([{ slug: chapter.slug, title: chapter.title }]);
    expect(r.answer).toContain("Vendas → Cardápio");
  });

  it("sem trecho de manual: não finge — devolve sem fonte e sem grounding", async () => {
    retrieveMock.mockResolvedValue([]);
    reasonMock.mockResolvedValue(outcome({ idealResponse: "Não achei isso por aqui.", shouldEscalate: true }));

    const r = await answerHelpQuestion({ question: "pergunta obscura", restaurantId: "r1" });

    const req = reasonMock.mock.calls[0]![0];
    expect(req.extraTruthSources.manual).toBeUndefined();
    expect(r.grounded).toBe(false);
    expect(r.sources).toEqual([]);
    expect(r.shouldEscalate).toBe(true);
  });

  it("relato de impressora traz o runbook curado E os sinais do sistema", async () => {
    const r = await answerHelpQuestion({
      question: "a impressora não está imprimindo os pedidos",
      restaurantId: "r1",
    });

    const req = reasonMock.mock.calls[0]![0];
    expect(req.extraTruthSources.modoDeFalhaSuspeito).toBeDefined();
    expect(
      (req.extraTruthSources.modoDeFalhaSuspeito as { runbook: string[] }).runbook.length,
    ).toBeGreaterThan(0);
    expect(req.extraTruthSources.systemSignals).toBeDefined();
    expect(probeMock).toHaveBeenCalledTimes(1);
    expect(r.suspectedSubsystem).toBeTruthy();
  });

  it("dúvida de uso NÃO sonda o sistema (custo e ruído por nada)", async () => {
    await answerHelpQuestion({ question: "como cadastro um produto", restaurantId: "r1" });
    expect(probeMock).not.toHaveBeenCalled();
  });
});

describe("portão de saída — o veredito nunca fica sem registro", () => {
  it("BARRA: fato inventado não chega ao lojista e vira escalada", async () => {
    reasonMock.mockResolvedValue(
      outcome({
        idealResponse: "O plano custa R$ 999,00 por mês.",
        doesNotInventFacts: false,
        verdict: "NEEDS_REVIEW",
      }),
    );

    const r = await answerHelpQuestion({ question: "quanto custa?", restaurantId: "r1" });

    expect(r.answer).not.toContain("999");
    expect(r.answer).toContain("Falar com a FOOD");
    expect(r.shouldEscalate).toBe(true);
    expect(r.coherence).toBe("NEEDS_REVIEW");
  });

  it("DEIXA PASSAR: resposta legítima do manual sai inteira, sem escalada", async () => {
    const r = await answerHelpQuestion({ question: "como cadastro um produto", restaurantId: "r1" });

    expect(r.answer).toBe("Vá em Vendas → Cardápio e clique em + Novo Produto.");
    expect(r.shouldEscalate).toBe(false);
    expect(r.coherence).toBe("PASS");
    expect(r.reasoningMode).toBe("LLM");
  });

  it("sem IA-piloto (FALLBACK): não inventa fala — assume e oferece o chamado", async () => {
    reasonMock.mockResolvedValue(outcome({ reasoningMode: "FALLBACK", idealResponse: "texto do piso" }));

    const r = await answerHelpQuestion({ question: "qualquer coisa", restaurantId: "r1" });

    expect(r.answer).toContain("Falar com a FOOD");
    expect(r.reasoningMode).toBe("FALLBACK");
    expect(r.shouldEscalate).toBe(true);
  });

  it("erro no portão não derruba a ajuda — resposta honesta com escalada", async () => {
    reasonMock.mockRejectedValue(new Error("boom"));

    const r = await answerHelpQuestion({ question: "qualquer coisa", restaurantId: "r1" });

    expect(r.answer).toContain("Falar com a FOOD");
    expect(r.shouldEscalate).toBe(true);
    expect(r.coherence).toBe("NEEDS_REVIEW");
  });
});
