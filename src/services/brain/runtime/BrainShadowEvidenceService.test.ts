import { describe, it, expect, beforeEach, vi } from "vitest";

const db = vi.hoisted(() => ({
  brainShadowLog: { create: vi.fn(), findMany: vi.fn() },
}));
vi.mock("@/lib/prisma", () => ({ prisma: db }));

import { recordShadowOutcome, getShadowStats } from "./BrainShadowEvidenceService";

const base = {
  restaurantId: "r1",
  conversationId: "c1",
  sampleOrigin: "PRODUCTION" as const,
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
      { reasoningMode: "LLM", coherence: "PASS", confidence: 0.9, wouldEscalate: false, sampleOrigin: "PRODUCTION" },
      { reasoningMode: "LLM", coherence: "FAIL", confidence: 0.5, wouldEscalate: false, sampleOrigin: "PRODUCTION" },
      { reasoningMode: "FALLBACK", coherence: "PASS", confidence: 0, wouldEscalate: true, sampleOrigin: "PRODUCTION" },
    ]);
    const stats = await getShadowStats("r1", { agentId: "crm" });
    expect(stats.llmSamples).toBe(2);
    expect(stats.coherencePassRate).toBe(0.5);
  });
});

/**
 * A origem da amostra: simulação nunca vira vida real.
 *
 * O erro que isto impede é irmão do "PASS com zero amostra" consertado horas
 * antes: um número que parece medir uma coisa e mede outra.
 */
describe("BrainShadowEvidenceService — origem da amostra", () => {
  it("GRAVA a origem declarada, tal qual — sem default silencioso", async () => {
    await recordShadowOutcome({ ...base, sampleOrigin: "TRAINING" });
    expect(db.brainShadowLog.create.mock.calls[0][0].data.sampleOrigin).toBe("TRAINING");
  });

  it("filtrar por origem NÃO traz linha de origem desconhecida (o `in` não casa NULL)", async () => {
    await getShadowStats("r1", { agentId: "crm", origins: ["PRODUCTION"] });
    const where = db.brainShadowLog.findMany.mock.calls[0][0].where;
    expect(where.sampleOrigin).toEqual({ in: ["PRODUCTION"] });
  });

  it("sem filtro, conta tudo — mas a composição separa cada origem", async () => {
    db.brainShadowLog.findMany.mockResolvedValue([
      { reasoningMode: "LLM", coherence: "PASS", confidence: 0.9, wouldEscalate: false, sampleOrigin: "TRAINING" },
      { reasoningMode: "LLM", coherence: "FAIL", confidence: 0.4, wouldEscalate: false, sampleOrigin: "TRAINING" },
      { reasoningMode: "LLM", coherence: "PASS", confidence: 0.8, wouldEscalate: false, sampleOrigin: "PRODUCTION" },
      { reasoningMode: "LLM", coherence: "PASS", confidence: 0.7, wouldEscalate: false, sampleOrigin: "REPLAY" },
    ]);
    const stats = await getShadowStats("r1", { agentId: "crm" });
    expect(stats.llmSamples).toBe(4);
    expect(stats.byOrigin.TRAINING.llmSamples).toBe(2);
    expect(stats.byOrigin.TRAINING.coherencePass).toBe(1);
    expect(stats.byOrigin.PRODUCTION.llmSamples).toBe(1);
    expect(stats.byOrigin.REPLAY.llmSamples).toBe(1);
    expect(stats.byOrigin.UNKNOWN.llmSamples).toBe(0);
  });

  it("linha ANTIGA (origem nula) cai em DESCONHECIDO — nunca em produção", async () => {
    db.brainShadowLog.findMany.mockResolvedValue([
      { reasoningMode: "LLM", coherence: "PASS", confidence: 0.9, wouldEscalate: false, sampleOrigin: null },
      { reasoningMode: "LLM", coherence: "PASS", confidence: 0.9, wouldEscalate: false, sampleOrigin: "sei-la" },
    ]);
    const stats = await getShadowStats("r1", { agentId: "whatsapp" });
    expect(stats.byOrigin.UNKNOWN.llmSamples).toBe(2);
    expect(stats.byOrigin.PRODUCTION.llmSamples).toBe(0);
  });

  it("sem amostra nenhuma, a composição vem zerada e o filtro fica declarado", async () => {
    db.brainShadowLog.findMany.mockResolvedValue([]);
    const stats = await getShadowStats("r1", { agentId: "crm", origins: ["TRAINING"] });
    expect(stats.llmSamples).toBe(0);
    expect(stats.originsCounted).toEqual(["TRAINING"]);
    expect(stats.byOrigin.TRAINING.samples).toBe(0);
  });
});
