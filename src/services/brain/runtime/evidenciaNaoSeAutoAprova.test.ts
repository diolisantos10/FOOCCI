/**
 * A escada não pode se auto-aprovar.
 *
 * Os gates de SUBIDA contam evidência de sombra. Desde 24/08/2026 o topo também
 * grava amostra (stage='LIVE'). Se as duas se somassem, o desempenho de quem já
 * está lá em cima viraria prova para deixá-lo subir — a régua se auto-aprovando,
 * e o degrau mais caro da escada abrindo com a evidência errada.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";

const db = vi.hoisted(() => ({ brainShadowLog: { findMany: vi.fn() } }));
vi.mock("@/lib/prisma", () => ({ prisma: db }));

import { getShadowStats, getLiveStageSamples } from "./BrainShadowEvidenceService";

beforeEach(() => {
  vi.clearAllMocks();
  db.brainShadowLog.findMany.mockResolvedValue([]);
});

describe("sombra e topo nunca se somam", () => {
  it("os gates de subida EXCLUEM as amostras do topo", async () => {
    await getShadowStats("r1", { agentId: "whatsapp", origins: ["PRODUCTION"] });
    const where = db.brainShadowLog.findMany.mock.calls.at(-1)?.[0]?.where;
    // Aceita só linha de sombra explícita ou linha antiga (nula, sombra por história).
    expect(where?.AND).toContainEqual({ OR: [{ stage: null }, { stage: "SHADOW" }] });
  });

  it("a leitura do topo pede SÓ o topo", async () => {
    await getLiveStageSamples("r1", { agentId: "whatsapp" });
    const where = db.brainShadowLog.findMany.mock.calls.at(-1)?.[0]?.where;
    expect(where?.stage).toBe("LIVE");
  });

  it("banco de mentira que HONRA o filtro: amostra do topo não entra no gate de subida", async () => {
    // Se o filtro sumir do código, este teste conta as linhas LIVE e o gate
    // passa a enxergar evidência que não é dele — que é o P0 a impedir.
    const linhas = [
      ...Array.from({ length: 100 }, () => ({ reasoningMode: "LLM", coherence: "PASS", confidence: 0.9, wouldEscalate: false, sampleOrigin: "PRODUCTION", stage: "LIVE" })),
      ...Array.from({ length: 3 }, () => ({ reasoningMode: "LLM", coherence: "PASS", confidence: 0.9, wouldEscalate: false, sampleOrigin: "PRODUCTION", stage: "SHADOW" })),
    ];
    db.brainShadowLog.findMany.mockImplementation((args: { where?: { AND?: { OR?: { stage?: string | null }[] }[] } } = {}) => {
      const clausulaDegrau = args?.where?.AND?.find((c) => c.OR?.some((o) => "stage" in o));
      const aceitos = clausulaDegrau?.OR?.map((o) => o.stage);
      return Promise.resolve(aceitos ? linhas.filter((l) => aceitos.includes(l.stage)) : linhas);
    });

    const stats = await getShadowStats("r1", { agentId: "whatsapp", origins: ["PRODUCTION"] });
    // Só as 3 de sombra podem contar. As 100 do topo são de outro degrau.
    expect(stats.llmSamples).toBe(3);
  });
});
