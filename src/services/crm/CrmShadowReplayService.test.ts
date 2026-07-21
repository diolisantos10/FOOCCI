import { describe, it, expect, beforeEach, vi } from "vitest";

const db = vi.hoisted(() => ({
  campaign: { findMany: vi.fn() },
  campaignExecution: { groupBy: vi.fn() },
}));
vi.mock("@/lib/prisma", () => ({ prisma: db }));

import { replayShadow } from "./CrmShadowReplayService";

beforeEach(() => vi.clearAllMocks());

describe("CrmShadowReplayService — a sombra (prova de valor, read-only)", () => {
  it("com dados de sobra, projeta ganho e marca OPTIMIZING; nunca toca runtime", async () => {
    db.campaign.findMany.mockResolvedValue([{ id: "c1", name: "Recuperar frios" }]);
    // sent por frase
    db.campaignExecution.groupBy.mockImplementation((args: { where: { converted?: boolean } }) => {
      if (args.where?.converted) {
        return Promise.resolve([
          { variantKey: "boa", _count: { _all: 30 } }, // 30/120 ≈ 25%
          { variantKey: "ruim", _count: { _all: 2 } }, // 2/120 ≈ 1.6%
        ]);
      }
      return Promise.resolve([
        { variantKey: "boa", _count: { _all: 120 } },
        { variantKey: "ruim", _count: { _all: 120 } },
      ]);
    });

    const r = await replayShadow("r1");
    expect(r.ok).toBe(true);
    expect(r.runtimeTouched).toBe(false);
    expect(r.campaigns).toHaveLength(1);
    const c = r.campaigns[0];
    expect(c.mode).toBe("OPTIMIZING");
    expect(c.agentRate).toBeGreaterThan(c.currentRate); // agente melhora sobre o sorteio
    expect(c.projectedLiftPct).toBeGreaterThan(0);
    expect(r.summary.optimizing).toBe(1);
  });

  it("com poucos dados, fica EXPLORING e não projeta ganho (paciente)", async () => {
    db.campaign.findMany.mockResolvedValue([{ id: "c1", name: "Nova" }]);
    db.campaignExecution.groupBy.mockImplementation((args: { where: { converted?: boolean } }) => {
      if (args.where?.converted) return Promise.resolve([{ variantKey: "a", _count: { _all: 3 } }]);
      return Promise.resolve([
        { variantKey: "a", _count: { _all: 10 } },
        { variantKey: "b", _count: { _all: 10 } },
      ]);
    });
    const r = await replayShadow("r1");
    expect(r.campaigns[0].mode).toBe("EXPLORING");
    expect(r.campaigns[0].projectedLiftPct).toBeNull();
    expect(r.summary.exploring).toBe(1);
  });

  it("campanha sem frases medidas é ignorada", async () => {
    db.campaign.findMany.mockResolvedValue([{ id: "c1", name: "Vazia" }]);
    db.campaignExecution.groupBy.mockResolvedValue([]);
    const r = await replayShadow("r1");
    expect(r.campaigns).toHaveLength(0);
    expect(r.summary.campaignsAnalyzed).toBe(0);
  });
});
