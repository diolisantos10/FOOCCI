import { describe, it, expect, beforeEach, vi } from "vitest";

const db = vi.hoisted(() => ({
  campaignExecution: { count: vi.fn(), findMany: vi.fn(), groupBy: vi.fn() },
}));
vi.mock("@/lib/prisma", () => ({ prisma: db }));

import { buildDailyOverview, planNextActions } from "./CrmDailyOverview";

beforeEach(() => {
  vi.clearAllMocks();
  db.campaignExecution.count.mockResolvedValue(0);
  db.campaignExecution.findMany.mockResolvedValue([]);
  db.campaignExecution.groupBy.mockResolvedValue([]);
});

describe("planNextActions — próximas ações só de dado real", () => {
  it("com campeãs → prioriza; com otimizando → favorece", () => {
    const a = planNextActions({ champions: [{}, {}], shadow: { optimizing: 3, avgProjectedLiftPct: 12 }, activeCount: 1, totalCampaigns: 5 });
    expect(a[0]).toMatch(/2 frases campeãs/);
    expect(a.some((x) => /Favorecer.*3 campanhas.*12%/.test(x))).toBe(true);
  });

  it("sem agente ativo → sugere ligar", () => {
    const a = planNextActions({ champions: [], shadow: {}, activeCount: 0, totalCampaigns: 4 });
    expect(a.some((x) => /é só ligar/.test(x))).toBe(true);
  });

  it("sem nada → fallback honesto, nunca vazio", () => {
    const a = planNextActions({ champions: [], shadow: {}, activeCount: 0, totalCampaigns: 0 });
    expect(a.length).toBe(1);
    expect(a[0]).toMatch(/Seguir medindo/);
  });

  it("no máximo 3 ações", () => {
    const a = planNextActions({ champions: [{}], shadow: { optimizing: 2, exploring: 2 }, activeCount: 0, totalCampaigns: 3 });
    expect(a.length).toBeLessThanOrEqual(3);
  });
});

describe("buildDailyOverview — o diário honesto", () => {
  it("sem envios → retrospecto honesto (nunca vazio), sem inventar", async () => {
    const o = await buildDailyOverview("r1", { now: new Date("2026-07-25T12:00:00Z"), agentName: "Recado" });
    expect(o.agentName).toBe("Recado");
    expect(o.retrospective[0]).toMatch(/Ontem não saiu/);
    expect(o.retrospective.some((l) => /semana ainda não houve/i.test(l))).toBe(true);
  });

  it("com envios e receita → conta ontem e semana com dinheiro", async () => {
    db.campaignExecution.count.mockResolvedValue(10);
    db.campaignExecution.findMany.mockResolvedValue([{ revenue: 50 }, { revenue: 70 }]);
    db.campaignExecution.groupBy.mockResolvedValue([{ campaignId: "c1" }, { customerId: "x" }]);
    const o = await buildDailyOverview("r1", { now: new Date("2026-07-25T12:00:00Z"), agentName: "Recado" });
    expect(o.yesterday.sent).toBe(10);
    expect(o.yesterday.revenue).toBe(120);
    expect(o.retrospective[0]).toMatch(/Ontem saíram 10 mensagens/);
    expect(o.retrospective[0]).toMatch(/R\$ 120,00/);
  });

  it("passa nextActions quando fornecido o insumo", async () => {
    const o = await buildDailyOverview("r1", {
      now: new Date("2026-07-25T12:00:00Z"),
      nextActions: { champions: [{}], shadow: { optimizing: 1 }, activeCount: 1, totalCampaigns: 2 },
    });
    expect(o.nextActions.length).toBeGreaterThan(0);
  });
});
