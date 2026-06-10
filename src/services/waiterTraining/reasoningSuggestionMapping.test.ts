import { describe, it, expect } from "vitest";
import { mapReasoningToSuggestionFields, intentLabel } from "./reasoningSuggestionMapping";
import type { AgentReasoningResult } from "@/services/agents/reasoning/AgentReasoningTypes";

function result(over: Partial<AgentReasoningResult> = {}): AgentReasoningResult {
  return {
    primaryIntent: "PAYMENT_BENEFIT_QUESTION",
    secondaryIntents: [],
    confidence: 0.7,
    customerNeed: "Saber se aceita Alelo.",
    contextNeeded: ["formas de pagamento"],
    availableContextUsed: ["formas de pagamento"],
    missingContext: ["benefício refeição (Alelo/VR/Sodexo) — não cadastrado"],
    directAnswerStrategy: "Responder pagamento sem inventar.",
    idealResponse: "Preciso confirmar essa forma de pagamento. Enquanto isso, posso te ajudar a montar o pedido?",
    trainingRule: "Usar apenas formas de pagamento cadastradas no Foocci, sem inventar.",
    expectedImpact: "Reduz abandono por dúvida de pagamento.",
    safetyNotes: ["Não inventar método não cadastrado."],
    shouldEscalate: false,
    coherenceCheck: { answersCustomerQuestion: true, matchesIntent: true, doesNotInventFacts: true, keepsSalesFlow: true, verdict: "PASS", reason: "ok" },
    reasoningMode: "FALLBACK",
    ...over,
  };
}

describe("mapReasoningToSuggestionFields", () => {
  it("monta a proposta com intenção, ação e contexto técnico", () => {
    const f = mapReasoningToSuggestionFields(result(), { customerExcerpt: "Aceita Alelo Refeição?", waiterExcerpt: "[handoff:AI_ESCALATION]" });
    expect(f.customerIntent).toBe("Pagamento / benefício refeição");
    expect(f.suggestedActionType).toBe("PAYMENT_RULE");
    expect(f.title).toContain("Pagamento");
    // (12) contexto usado/ausente nos detalhes técnicos
    expect(f.technicalDetails.availableContextUsed).toEqual(["formas de pagamento"]);
    expect((f.technicalDetails.missingContext as string[]).join(" ")).toMatch(/Alelo/);
    // detecta escalonamento
    expect(f.problemDetected).toContain("escalou");
  });

  it("coerência FAIL → riscoHIGH + alerta de revisão", () => {
    const f = mapReasoningToSuggestionFields(
      result({ coherenceCheck: { answersCustomerQuestion: false, matchesIntent: false, doesNotInventFacts: true, keepsSalesFlow: false, verdict: "FAIL", reason: "fora de contexto" } }),
      { customerExcerpt: "aceita cartão?", waiterExcerpt: null },
    );
    expect(f.riskLevel).toBe("HIGH");
    expect(f.problemDetected).toContain("Possível classificação errada");
  });

  it("restrição alimentar é HIGH risk", () => {
    const f = mapReasoningToSuggestionFields(result({ primaryIntent: "DIETARY_RESTRICTION" }), { customerExcerpt: "sou alérgico", waiterExcerpt: null });
    expect(f.riskLevel).toBe("HIGH");
    expect(f.suggestedActionType).toBe("RESTRICTION_HANDLING");
  });

  it("intentLabel traduz", () => {
    expect(intentLabel("PAYMENT_BENEFIT_QUESTION")).toBe("Pagamento / benefício refeição");
    expect(intentLabel("DELIVERY_QUESTION")).toBe("Entrega");
  });
});
