import { describe, it, expect, beforeEach, vi } from "vitest";

const db = vi.hoisted(() => ({
  brainShadowLog: { create: vi.fn(), findMany: vi.fn() },
}));
vi.mock("@/lib/prisma", () => ({ prisma: db }));

import { recordShadowOutcome, getShadowStats } from "./BrainShadowEvidenceService";

const base = {
  restaurantId: "r1",
  conversationId: "c1",
  intent: "reativar",
  reasoningMode: "LLM",
  engine: "crm-agent",
  confidence: 0.8,
  coherence: "PASS",
  wouldEscalate: false,
  wouldReply: "oi!",
};

beforeEach(() => {
  vi.clearAllMocks();
  db.brainShadowLog.create.mockResolvedValue({});
  db.brainShadowLog.findMany.mockResolvedValue([]);
});

describe("BrainShadowEvidenceService — evidência por-agente", () => {
  it("agentId omitido → grava como recepcionista (whatsapp), preservando semântica antiga", async () => {
    await recordShadowOutcome({ ...base });
    expect(db.brainShadowLog.create.mock.calls[0][0].data.agentId).toBe("whatsapp");
  });

  it("agentId explícito (crm) é persistido tal qual", async () => {
    await recordShadowOutcome({ ...base, agentId: "crm" });
    expect(db.brainShadowLog.create.mock.calls[0][0].data.agentId).toBe("crm");
  });

  it("persistência é best-effort: erro de escrita não vaza", async () => {
    db.brainShadowLog.create.mockRejectedValue(new Error("db down"));
    await expect(recordShadowOutcome({ ...base })).resolves.toBeUndefined();
  });

  it("getShadowStats(crm) filtra SÓ o agente crm — não casa linhas nulas", async () => {
    await getShadowStats("r1", { agentId: "crm" });
    expect(db.brainShadowLog.findMany.mock.calls[0][0].where).toMatchObject({ agentId: "crm" });
  });

  it("getShadowStats(whatsapp) casa também a evidência antiga (agentId nulo)", async () => {
    await getShadowStats("r1", { agentId: "whatsapp" });
    const where = db.brainShadowLog.findMany.mock.calls[0][0].where;
    expect(where.OR).toEqual([{ agentId: "whatsapp" }, { agentId: null }]);
  });

  it("agrega taxa de coerência PASS só sobre amostras LLM", async () => {
    db.brainShadowLog.findMany.mockResolvedValue([
      { reasoningMode: "LLM", coherence: "PASS", confidence: 0.9, wouldEscalate: false },
      { reasoningMode: "LLM", coherence: "FAIL", confidence: 0.5, wouldEscalate: false },
      { reasoningMode: "FALLBACK", coherence: "PASS", confidence: 0, wouldEscalate: true },
    ]);
    const stats = await getShadowStats("r1", { agentId: "crm" });
    expect(stats.llmSamples).toBe(2);
    expect(stats.coherencePassRate).toBe(0.5);
  });
});
