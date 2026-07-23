import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

// Knowledge adapter reads (mocked DB)
const db = vi.hoisted(() => ({
  restaurant: { findUnique: vi.fn() },
  menuItem: { count: vi.fn(), findMany: vi.fn() },
  businessHours: { findMany: vi.fn() },
  promotion: { findMany: vi.fn() },
  restaurantKnowledgeItem: { findMany: vi.fn() },
  agentLibrarySource: { count: vi.fn() },
  waiterResultEvidence: { count: vi.fn() },
  deliveryZone: { findMany: vi.fn() },
}));
vi.mock("@/lib/prisma", () => ({ prisma: db }));

// The AI pilot (mocked OpenAI client behind the engine router)
const ai = vi.hoisted(() => ({ create: vi.fn() }));
vi.mock("@/lib/openai", () => ({ openai: { chat: { completions: { create: ai.create } } } }));

import { reasonAsAgent } from "./BrainReasoner";

const baseReq = {
  businessId: "rest_1",
  businessType: "RESTAURANT" as const,
  agentId: "waiter",
  agentRole: "Garçom",
  sourceType: "MANUAL_TEST" as const,
  sanitizedInput: "vocês aceitam vale-refeição?",
};

const OLD_KEY = process.env.OPENAI_API_KEY;

beforeEach(() => {
  vi.clearAllMocks();
  db.restaurant.findUnique.mockResolvedValue({
    name: "Sushi Cazza",
    paymentSettings: { acceptPix: true, acceptCash: true, acceptCard: true, acceptLink: false },
    deliveryConfig: { enabled: true, pickupEnabled: true },
    brandConfig: { tone: "friendly" },
  });
  db.menuItem.count.mockResolvedValue(42);
  db.menuItem.findMany.mockResolvedValue([]);
  db.businessHours.findMany.mockResolvedValue([]);
  db.promotion.findMany.mockResolvedValue([]);
  db.restaurantKnowledgeItem.findMany.mockResolvedValue([]);
  db.agentLibrarySource.count.mockResolvedValue(3);
  db.waiterResultEvidence.count.mockResolvedValue(7);
  db.deliveryZone.findMany.mockResolvedValue([]);
});

afterEach(() => {
  if (OLD_KEY === undefined) delete process.env.OPENAI_API_KEY;
  else process.env.OPENAI_API_KEY = OLD_KEY;
});

describe("BrainReasoner — the single reasoning gateway", () => {
  it("NEVER touches the live runtime — even on fallback", async () => {
    delete process.env.OPENAI_API_KEY; // no pilot configured → fallback
    const out = await reasonAsAgent(baseReq);
    expect(out.result.runtimeTouched).toBe(false);
  });

  it("unknown agent → safe fallback that escalates and invents nothing", async () => {
    delete process.env.OPENAI_API_KEY;
    const out = await reasonAsAgent({ ...baseReq, agentId: "does-not-exist" });
    expect(out.reasoningMode).toBe("FALLBACK");
    expect(out.result.shouldEscalate).toBe(true);
    expect(out.result.coherenceCheck.doesNotInventFacts).toBe(true);
    expect(out.result.escalationReason).toMatch(/sem perfil/i);
  });

  it("known agent but no pilot plugged → fallback (não inventa, escala)", async () => {
    delete process.env.OPENAI_API_KEY;
    const out = await reasonAsAgent(baseReq);
    expect(out.engine.provider).toBe("MOCK");
    expect(out.reasoningMode).toBe("FALLBACK");
    expect(out.result.escalationReason).toMatch(/piloto/i);
  });

  it("with a pilot plugged (OPENAI) → reasons through the engine router", async () => {
    process.env.OPENAI_API_KEY = "sk-test";
    ai.create.mockResolvedValue({
      choices: [{ message: { content: JSON.stringify({
        primaryIntent: "PAYMENT_BENEFIT_QUESTION",
        idealResponse: "No momento aceitamos Pix, cartão e dinheiro — vale-refeição não está cadastrado.",
        confidence: 0.8,
        shouldEscalate: false,
      }) } }],
    });
    const out = await reasonAsAgent(baseReq);
    expect(out.engine.provider).toBe("OPENAI");
    expect(out.reasoningMode).toBe("LLM");
    expect(out.result.primaryIntent).toBe("PAYMENT_BENEFIT_QUESTION");
    expect(out.result.idealResponse).toMatch(/pix/i);
    expect(out.result.runtimeTouched).toBe(false);
    expect(out.result.coherenceCheck.verdict).toBe("PASS");
    expect(ai.create).toHaveBeenCalledTimes(1); // the pilot was driven via the Brain
  });

  it("same Brain, different agent scope (CRM) — the gateway is agent-agnostic", async () => {
    process.env.OPENAI_API_KEY = "sk-test";
    ai.create.mockResolvedValue({
      choices: [{ message: { content: JSON.stringify({
        primaryIntent: "RELATIONSHIP_FOLLOWUP",
        idealResponse: "Que bom te ver por aqui de novo! 😊",
        shouldEscalate: false,
      }) } }],
    });
    const out = await reasonAsAgent({ ...baseReq, agentId: "crm", agentRole: "CRM" });
    expect(out.reasoningMode).toBe("LLM");
    expect(out.result.primaryIntent).toBe("RELATIONSHIP_FOLLOWUP");
    expect(out.result.runtimeTouched).toBe(false);
  });

  it("REGRESSÃO RODÍZIO: a verdade curada e o cardápio real chegam ao prompt do piloto", async () => {
    process.env.OPENAI_API_KEY = "sk-test";
    db.restaurantKnowledgeItem.findMany.mockResolvedValue([
      { category: "RODIZIO_INFO", title: "Vocês têm rodízio?", answer: "Sim! Rodízio de sushi todos os dias, R$ 89,90 por pessoa." },
    ]);
    db.menuItem.findMany.mockResolvedValue([
      { name: "Combo Salmão 20 peças", price: 59.9, priceDelivery: null, priceDineIn: null, isAvailable: true, category: { name: "Combos" } },
    ]);
    ai.create.mockResolvedValue({
      choices: [{ message: { content: JSON.stringify({
        primaryIntent: "RODIZIO_QUESTION",
        idealResponse: "Temos sim! Rodízio todos os dias. 😊",
        shouldEscalate: false,
      }) } }],
    });
    const out = await reasonAsAgent({ ...baseReq, agentId: "whatsapp", agentRole: "WhatsApp", sanitizedInput: "vocês têm rodízio?" });
    expect(out.reasoningMode).toBe("LLM");
    const systemPrompt = ai.create.mock.calls[0][0].messages[0].content as string;
    // O incidente que desligou o free-form: o modelo negou o rodízio porque a
    // verdade nunca chegava ao prompt. Agora ela TEM que chegar.
    expect(systemPrompt).toMatch(/rod[íi]zio/i);
    expect(systemPrompt).toContain("89,90");
    expect(systemPrompt).toContain("Combo Salmão 20 peças");
  });

  it("ANTI-ALUCINAÇÃO DE COBERTURA: a regra de área de entrega chega ao prompt do piloto", async () => {
    process.env.OPENAI_API_KEY = "sk-test";
    ai.create.mockResolvedValue({
      choices: [{ message: { content: JSON.stringify({
        primaryIntent: "DELIVERY_AREA_QUESTION",
        idealResponse: "Me passa seu CEP que eu confirmo a cobertura. 😊",
        shouldEscalate: false,
      }) } }],
    });
    const out = await reasonAsAgent({ ...baseReq, agentId: "whatsapp", agentRole: "WhatsApp", sanitizedInput: "vocês entregam em Salvador?" });
    expect(out.reasoningMode).toBe("LLM");
    const systemPrompt = ai.create.mock.calls[0][0].messages[0].content as string;
    // O bug real: o Brain afirmava "sim, entregamos" p/ qualquer cidade (Salvador,
    // Rio) sem cobertura na base. A regra que fecha isso TEM que chegar ao prompt.
    expect(systemPrompt).toMatch(/[ÁA]REA DE ENTREGA\/COBERTURA/);
    expect(systemPrompt).toMatch(/CEP/);
  });

  it("CRÍTICO: preço inventado pelo piloto → coerência NEEDS_REVIEW (não passa batido)", async () => {
    process.env.OPENAI_API_KEY = "sk-test";
    db.menuItem.findMany.mockResolvedValue([
      { name: "Combo Salmão 20 peças", price: 59.9, priceDelivery: null, priceDineIn: null, isAvailable: true, category: { name: "Combos" } },
    ]);
    ai.create.mockResolvedValue({
      choices: [{ message: { content: JSON.stringify({
        primaryIntent: "PRICE_QUESTION",
        idealResponse: "O Combo Salmão sai por apenas R$ 39,90!", // preço NÃO existe na base
        shouldEscalate: false,
      }) } }],
    });
    const out = await reasonAsAgent(baseReq);
    expect(out.result.coherenceCheck.doesNotInventFacts).toBe(false);
    expect(out.result.coherenceCheck.verdict).toBe("NEEDS_REVIEW");
    expect(out.result.coherenceCheck.reason).toMatch(/preço fora da base/i);
  });

  it("RETRIEVAL: com queryHint, o item de conhecimento relevante sobe mesmo com uso raro", async () => {
    process.env.OPENAI_API_KEY = "sk-test";
    // 31 itens: 30 populares irrelevantes + 1 raro sobre rodízio (ficaria fora do top-30)
    const popular = Array.from({ length: 30 }, (_, i) => ({
      category: "FAQ", title: `Pergunta popular ${i}`, answer: `Resposta ${i}`, questionPatterns: [`assunto${i}`],
    }));
    db.restaurantKnowledgeItem.findMany.mockResolvedValue([
      ...popular,
      { category: "RODIZIO_INFO", title: "Tem rodízio?", answer: "Sim! Todos os dias.", questionPatterns: ["rodízio", "rodizio"] },
    ]);
    ai.create.mockResolvedValue({
      choices: [{ message: { content: JSON.stringify({ primaryIntent: "RODIZIO_QUESTION", idealResponse: "Temos sim!", shouldEscalate: false }) } }],
    });
    await reasonAsAgent({ ...baseReq, sanitizedInput: "vocês têm rodízio hoje?" });
    const systemPrompt = ai.create.mock.calls[0][0].messages[0].content as string;
    expect(systemPrompt).toMatch(/rod[íi]zio/i);
  });

  it("janela de conversa sanitizada entra no conteúdo do usuário quando fornecida", async () => {
    process.env.OPENAI_API_KEY = "sk-test";
    ai.create.mockResolvedValue({
      choices: [{ message: { content: JSON.stringify({
        primaryIntent: "FOLLOWUP",
        idealResponse: "Claro, já te explico!",
        shouldEscalate: false,
      }) } }],
    });
    await reasonAsAgent({
      ...baseReq,
      sanitizedHistory: [
        { role: "CUSTOMER", content: "vocês entregam no centro?" },
        { role: "AGENT", content: "Entregamos sim!" },
      ],
      sanitizedInput: "e qual o valor da entrega?",
    });
    const userContent = ai.create.mock.calls[0][0].messages[1].content as string;
    expect(userContent).toContain("HISTÓRICO RECENTE");
    expect(userContent).toContain("vocês entregam no centro?");
    expect(userContent).toContain("e qual o valor da entrega?");
  });

  it("reasons as the WhatsApp receptionist (real scope) — not as a menu matcher", async () => {
    process.env.OPENAI_API_KEY = "sk-test";
    ai.create.mockResolvedValue({
      choices: [{ message: { content: JSON.stringify({
        primaryIntent: "PAYMENT_VOUCHER_QUESTION",
        idealResponse: "No momento aceitamos Pix, cartão e dinheiro — vale-refeição não está cadastrado por aqui. 😊",
        shouldEscalate: false,
      }) } }],
    });
    const out = await reasonAsAgent({ ...baseReq, agentId: "whatsapp", agentRole: "WhatsApp" });
    expect(out.reasoningMode).toBe("LLM");
    expect(out.result.idealResponse).toMatch(/pix/i);
    expect(out.result.runtimeTouched).toBe(false);
  });
});
