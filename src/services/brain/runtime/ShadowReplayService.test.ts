import { describe, it, expect, beforeEach, vi } from "vitest";

const db = vi.hoisted(() => ({
  conversation: { findMany: vi.fn() },
  message: { findFirst: vi.fn(), findMany: vi.fn() },
  brainShadowLog: { findFirst: vi.fn() },
}));
vi.mock("@/lib/prisma", () => ({ prisma: db }));

const brain = vi.hoisted(() => ({ reasonAsAgent: vi.fn() }));
vi.mock("../reasoning/BrainReasoner", () => brain);

const evidence = vi.hoisted(() => ({ recordShadowOutcome: vi.fn() }));
vi.mock("./BrainShadowEvidenceService", () => evidence);

// Receptionist só é importado para o filtro de menu.
const recep = vi.hoisted(() => ({
  detectIntent: vi.fn(() => "UNKNOWN"),
  BACK_TO_MENU_RE: /^(0|menu|voltar)$/i,
}));
vi.mock("@/services/ai/WhatsAppReceptionistService", () => recep);

import { replayShadowFromHistory } from "./ShadowReplayService";

function outcome(over: Record<string, unknown> = {}) {
  return {
    engine: { provider: "OPENAI", model: "gpt-4o-mini" },
    reasoningMode: "LLM",
    result: { primaryIntent: "RODIZIO_QUESTION", confidence: 0.9, coherenceCheck: { verdict: "PASS" }, shouldEscalate: false, idealResponse: "Temos sim!" },
    ...over,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  db.conversation.findMany.mockResolvedValue([
    { id: "c1", restaurantId: "r1" },
    { id: "c2", restaurantId: "r1" },
  ]);
  db.message.findFirst.mockResolvedValue({ content: "vocês têm rodízio?", sentAt: new Date() });
  db.message.findMany.mockResolvedValue([{ direction: "INBOUND", content: "vocês têm rodízio?" }]);
  db.brainShadowLog.findFirst.mockResolvedValue(null); // nada replayado ainda
  brain.reasonAsAgent.mockResolvedValue(outcome());
  evidence.recordShadowOutcome.mockResolvedValue(undefined);
  recep.detectIntent.mockReturnValue("UNKNOWN");
});

describe("ShadowReplayService — treinar o boletim com conversas reais", () => {
  it("dry-run NÃO chama a IA; conta elegíveis e estima custo", async () => {
    const r = await replayShadowFromHistory({ dryRun: true, maxSamples: 500 });
    expect(brain.reasonAsAgent).not.toHaveBeenCalled();
    expect(evidence.recordShadowOutcome).not.toHaveBeenCalled();
    expect(r.processed).toBe(2);
    expect(r.estTokens).toBeGreaterThan(0);
    expect(r.dryRun).toBe(true);
  });

  it("run real: raciocina cada conversa e grava evidência", async () => {
    const r = await replayShadowFromHistory({ maxSamples: 500 });
    expect(brain.reasonAsAgent).toHaveBeenCalledTimes(2);
    expect(evidence.recordShadowOutcome).toHaveBeenCalledTimes(2);
    expect(r.processed).toBe(2);
    expect(r.errors).toBe(0);
  });

  it("a amostra do replay é marcada como REPLAY — não se passa por produção", async () => {
    // A pergunta é de gente de verdade, mas ninguém recebeu a resposta. Antes
    // deste campo, o boletim do recepcionista somava replay e atendimento ao
    // vivo no mesmo contador e "100 amostras" não dizia o que tinha acontecido.
    await replayShadowFromHistory({ maxSamples: 500 });
    for (const [rec] of evidence.recordShadowOutcome.mock.calls) {
      expect(rec.sampleOrigin).toBe("REPLAY");
    }
  });

  it("filtro de menu: saudação/'cardápio'/número NÃO viram evidência", async () => {
    recep.detectIntent.mockReturnValue("MENU_REQUEST");
    const r = await replayShadowFromHistory({});
    expect(r.skippedMenu).toBe(2);
    expect(brain.reasonAsAgent).not.toHaveBeenCalled();
  });

  it("idempotência: conversa já replayada é pulada", async () => {
    db.brainShadowLog.findFirst.mockResolvedValue({ id: "log_x" });
    const r = await replayShadowFromHistory({});
    expect(r.skippedAlreadyReplayed).toBe(2);
    expect(brain.reasonAsAgent).not.toHaveBeenCalled();
  });

  it("maxSamples é teto rígido de gasto", async () => {
    db.conversation.findMany.mockResolvedValue([
      { id: "c1", restaurantId: "r1" }, { id: "c2", restaurantId: "r1" }, { id: "c3", restaurantId: "r1" },
    ]);
    const r = await replayShadowFromHistory({ maxSamples: 1 });
    expect(r.processed).toBe(1);
    expect(brain.reasonAsAgent).toHaveBeenCalledTimes(1);
  });

  it("erro numa conversa não derruba o lote", async () => {
    brain.reasonAsAgent.mockRejectedValueOnce(new Error("timeout")).mockResolvedValue(outcome());
    const r = await replayShadowFromHistory({});
    expect(r.errors).toBe(1);
    expect(r.processed).toBe(1);
  });

  it("nunca toca runtime", async () => {
    const r = await replayShadowFromHistory({ dryRun: true });
    expect(r.runtimeTouched).toBe(false);
  });
});
