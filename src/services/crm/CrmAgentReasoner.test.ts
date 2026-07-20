import { describe, it, expect, beforeEach, vi } from "vitest";

const reasonAsAgent = vi.hoisted(() => vi.fn());
const getSnapshot = vi.hoisted(() => vi.fn());
const buildContext = vi.hoisted(() => vi.fn((s: { name: string }) => `Cliente: ${s.name}\nSegmento: FRIO`));
const getFreeFormConfig = vi.hoisted(() => vi.fn());

vi.mock("@/services/brain/reasoning/BrainReasoner", () => ({ reasonAsAgent }));
vi.mock("@/services/brain/runtime/BrainFreeFormConfigService", () => ({ getFreeFormConfig }));
vi.mock("@/services/crm/CustomerIntelligenceSnapshotService", () => ({
  CustomerIntelligenceSnapshotService: { getSnapshot },
  buildCustomerIntelligenceContext: buildContext,
}));

import { reasonCrmMessage } from "./CrmAgentReasoner";

function snap(over: Record<string, unknown> = {}) {
  return {
    name: "Cliente",
    segment: "FRIO",
    nextBestAction: { actionType: "REACTIVATION", suggestedMessageGoal: "trazer o cliente de volta" },
    ...over,
  };
}

function outcome(resultOver: Record<string, unknown> = {}, topOver: Record<string, unknown> = {}) {
  return {
    reasoningMode: "LLM",
    snapshot: { truthSources: { products: [], prices: [], policies: [] } },
    ...topOver,
    result: {
      idealResponse: "Oi! Faz tempo que você não pede — que tal voltar hoje? 😊",
      confidence: 0.82,
      coherenceCheck: { verdict: "PASS" },
      ...resultOver,
    },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  getSnapshot.mockResolvedValue(snap());
  getFreeFormConfig.mockResolvedValue({ minConfidence: 0.6 });
  reasonAsAgent.mockResolvedValue(outcome());
});

describe("CrmAgentReasoner — o cérebro do CRM (shadow-safe)", () => {
  it("gera a mensagem pelo portão reasonAsAgent(crm), ancorada no cliente, e NUNCA envia", async () => {
    const r = await reasonCrmMessage({ restaurantId: "r1", customerId: "c1" });
    expect(r.ok).toBe(true);
    expect(r.sent).toBe(false); // invariante
    expect(r.message).toMatch(/voltar hoje/);
    expect(r.passedCritic).toBe(true);

    // passou pelo portão com o agente crm e a memória do cliente
    const req = reasonAsAgent.mock.calls[0][0];
    expect(req.agentId).toBe("crm");
    expect(req.customerMemory).toContain("Segmento: FRIO");
    expect(req.sanitizedInput).toMatch(/mensagem curta de CRM/i);
  });

  it("usa o objetivo da NBA quando nenhum é passado", async () => {
    await reasonCrmMessage({ restaurantId: "r1", customerId: "c1" });
    const req = reasonAsAgent.mock.calls[0][0];
    expect(req.sanitizedInput).toContain("trazer o cliente de volta");
  });

  it("sem cupom → instrui a NÃO prometer desconto; com cupom → libera citar o código real", async () => {
    await reasonCrmMessage({ restaurantId: "r1", customerId: "c1" });
    expect(reasonAsAgent.mock.calls[0][0].sanitizedInput).toMatch(/NÃO prometa desconto/i);

    reasonAsAgent.mockClear();
    await reasonCrmMessage({ restaurantId: "r1", customerId: "c1", couponCode: "VOLTA10" });
    const req = reasonAsAgent.mock.calls[0][0];
    expect(req.sanitizedInput).toContain("VOLTA10");
    expect(req.contextHints).toContain("cupom: VOLTA10");
  });

  it("reprova no piso quando a coerência não é PASS (não vira candidata a envio)", async () => {
    reasonAsAgent.mockResolvedValue(outcome({ coherenceCheck: { verdict: "NEEDS_REVIEW" } }));
    const r = await reasonCrmMessage({ restaurantId: "r1", customerId: "c1" });
    expect(r.passedCritic).toBe(false);
    expect(r.coherence).toBe("NEEDS_REVIEW");
  });

  it("cliente inexistente → ok=false, sem chamar o motor", async () => {
    getSnapshot.mockResolvedValue(null);
    const r = await reasonCrmMessage({ restaurantId: "r1", customerId: "nope" });
    expect(r.ok).toBe(false);
    expect(r.sent).toBe(false);
    expect(reasonAsAgent).not.toHaveBeenCalled();
  });

  it("erro no motor → ok=false, degrada seguro (não envia)", async () => {
    reasonAsAgent.mockRejectedValue(new Error("401 Incorrect API key"));
    const r = await reasonCrmMessage({ restaurantId: "r1", customerId: "c1" });
    expect(r.ok).toBe(false);
    expect(r.passedCritic).toBe(false);
    expect(r.note).toMatch(/401/);
  });
});
