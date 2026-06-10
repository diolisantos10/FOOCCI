import { describe, it, expect } from "vitest";
import { reasonAboutWaiterCase } from "./WaiterReasoningService";
import { detectGuardrailIntent } from "./waiterIntentGuardrails";
import { validateCoherence } from "./AgentReasoningCoherenceValidator";
import type { AgentReasoningContext } from "./AgentReasoningTypes";

// Context with payment methods but NO meal voucher (matches the real schema).
const CTX: AgentReasoningContext = {
  restaurantName: "Sushi Cazza",
  paymentMethods: ["PIX", "Cartão", "Dinheiro"],
  knowsMealVoucher: false,
  acceptsDelivery: true,
  acceptsPickup: true,
  availableContextUsed: ["perfil do restaurante", "formas de pagamento", "delivery/retirada"],
  missingContext: ["benefício refeição (Alelo/VR/Sodexo) — não cadastrado"],
};

// Force deterministic path (no LLM) so the suite is hermetic.
const reason = (customerMessage: string, waiterResponse?: string) =>
  reasonAboutWaiterCase(
    { restaurantId: "r1", customerMessage, waiterResponse, sourceType: "MANUAL_TEST" },
    { useLLM: false, context: CTX },
  );

describe("Guardrails de intenção", () => {
  it("(1) Alelo → PAYMENT_BENEFIT_QUESTION (forçado)", () => {
    const g = detectGuardrailIntent("Aceita Alelo Refeição?");
    expect(g?.intent).toBe("PAYMENT_BENEFIT_QUESTION");
    expect(g?.forced).toBe(true);
  });
  it("(2) cartão → PAYMENT_QUESTION; (3) pix → PAYMENT_QUESTION", () => {
    expect(detectGuardrailIntent("vocês aceitam cartão?")?.intent).toBe("PAYMENT_QUESTION");
    expect(detectGuardrailIntent("pode ser no pix?")?.intent).toBe("PAYMENT_QUESTION");
  });
  it("(4) entrega → DELIVERY_QUESTION; (5) alergia → DIETARY_RESTRICTION", () => {
    expect(detectGuardrailIntent("qual a taxa de entrega?")?.intent).toBe("DELIVERY_QUESTION");
    expect(detectGuardrailIntent("tenho alergia a camarão")?.intent).toBe("DIETARY_RESTRICTION");
  });
  it("(6) pedido por texto → ORDER_BY_TEXT; (7) indeciso → não vira pagamento", () => {
    expect(detectGuardrailIntent("quero pedir um combo")?.intent).toBe("ORDER_BY_TEXT");
    expect(detectGuardrailIntent("não sei o que pedir, me ajuda?")).toBeNull();
  });
});

describe("PARTE 8 — caso obrigatório: Aceita Alelo Refeição?", () => {
  it("nunca vira indecisão; responde pagamento; não recomenda prato; não inventa método; coerência PASS", async () => {
    const r = await reason("Aceita Alelo Refeição?", "[handoff:AI_ESCALATION]");
    expect(r.primaryIntent).toBe("PAYMENT_BENEFIT_QUESTION");
    expect(r.primaryIntent).not.toBe("INDECISIVE_CUSTOMER");
    // responde sobre pagamento / confirmação
    expect(/pagamento|confirmar|forma/i.test(r.idealResponse)).toBe(true);
    // não recomenda prato / "mais pedidos"
    expect(/mais pedidos|recomend|prato|combinado que mais sustenta/i.test(r.idealResponse)).toBe(false);
    // não inventa que aceita Alelo (knowsMealVoucher=false)
    expect(/aceitamos alelo/i.test(r.idealResponse)).toBe(false);
    expect(r.trainingRule.toLowerCase()).toContain("cadastrad");
    expect(r.coherenceCheck.answersCustomerQuestion).toBe(true);
    expect(r.coherenceCheck.verdict).toBe("PASS");
    expect(r.missingContext.join(" ")).toMatch(/Alelo|refei/i);
  });
});

describe("Resposta ideal de pagamento", () => {
  it("(8) não recomenda prato e (9) não inventa método não cadastrado", async () => {
    const r = await reason("vocês aceitam cartão de crédito?");
    expect(r.primaryIntent).toBe("PAYMENT_QUESTION");
    expect(/recomend|mais pedidos|prato/i.test(r.idealResponse)).toBe(false);
    expect(/pagamento|fechamento|cart[aã]o|pix/i.test(r.idealResponse)).toBe(true);
  });
});

describe("Coherence validator", () => {
  it("(10) reprova resposta fora de contexto (pagamento respondido com prato)", () => {
    const c = validateCoherence({
      primaryIntent: "PAYMENT_QUESTION",
      customerMessage: "aceita cartão?",
      idealResponse: "Recomendo nosso combinado mais pedido, super completo!",
      trainingRule: "Recomendar pratos populares.",
      missingContext: [],
    });
    expect(c.verdict).toBe("FAIL");
    expect(c.answersCustomerQuestion).toBe(false);
  });
  it("(11) aprova resposta direta de pagamento", () => {
    const c = validateCoherence({
      primaryIntent: "PAYMENT_QUESTION",
      customerMessage: "aceita cartão?",
      idealResponse: "Aceitamos cartão e PIX. Você escolhe a forma no fechamento do pedido. Quer seguir?",
      trainingRule: "Responder pagamento com formas cadastradas e conduzir ao fechamento.",
      missingContext: [],
    });
    expect(c.verdict).toBe("PASS");
  });
  it("reprova quando inventa forma de pagamento sem contexto", () => {
    const c = validateCoherence({
      primaryIntent: "PAYMENT_BENEFIT_QUESTION",
      customerMessage: "aceita alelo?",
      idealResponse: "Sim, aceitamos Alelo sem problema!",
      trainingRule: "Responder pagamento com formas cadastradas.",
      missingContext: ["benefício refeição não cadastrado"],
    });
    expect(c.doesNotInventFacts).toBe(false);
    expect(c.verdict).toBe("FAIL");
  });
});

describe("Fallback e segurança", () => {
  it("(13) sem OpenAI continua seguro e marca reasoningMode=FALLBACK", async () => {
    const r = await reason("Aceita VR?");
    expect(r.reasoningMode).toBe("FALLBACK");
    expect(r.primaryIntent).toBe("PAYMENT_BENEFIT_QUESTION");
  });
  it("(12) expõe contexto usado e ausente", async () => {
    const r = await reason("aceita pix?");
    expect(r.availableContextUsed).toContain("formas de pagamento");
    expect(r.missingContext.length).toBeGreaterThan(0);
  });
  it("(7) cliente indeciso real → INDECISIVE_CUSTOMER", async () => {
    const r = await reason("não sei o que pedir, me ajuda?");
    expect(r.primaryIntent).toBe("INDECISIVE_CUSTOMER");
  });
});
