import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

// Knowledge adapter reads (mocked DB)
const db = vi.hoisted(() => ({
  restaurant: { findUnique: vi.fn() },
  menuItem: { count: vi.fn() },
  agentLibrarySource: { count: vi.fn() },
  waiterResultEvidence: { count: vi.fn() },
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
  db.agentLibrarySource.count.mockResolvedValue(3);
  db.waiterResultEvidence.count.mockResolvedValue(7);
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
