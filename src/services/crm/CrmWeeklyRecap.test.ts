import { describe, it, expect, beforeEach, vi } from "vitest";

const db = vi.hoisted(() => ({
  campaignExecution: { count: vi.fn(), findMany: vi.fn(), groupBy: vi.fn() },
}));
vi.mock("@/lib/prisma", () => ({ prisma: db }));

import { buildWeeklyRecap } from "./CrmWeeklyRecap";

const NOW = new Date("2026-07-24T12:00:00Z");
const weekAgo = new Date(NOW.getTime() - 7 * 86_400_000).getTime();

/** Roteia as chamadas por janela: `gte` da semana atual vs. anterior. */
function route<T>(current: T, previous: T) {
  return (args: { where?: { sentAt?: { gte?: Date } } }) => {
    const gte = args.where?.sentAt?.gte?.getTime() ?? 0;
    return Promise.resolve(gte >= weekAgo ? current : previous);
  };
}

beforeEach(() => vi.clearAllMocks());

describe("CrmWeeklyRecap — o resumo-base sempre fala algo", () => {
  it("sem envios em nenhuma janela: convida a enviar (honesto, nunca em branco)", async () => {
    db.campaignExecution.count.mockResolvedValue(0);
    db.campaignExecution.findMany.mockResolvedValue([]);
    db.campaignExecution.groupBy.mockResolvedValue([]);

    const r = await buildWeeklyRecap("r1", NOW);
    expect(r.hasActivity).toBe(false);
    expect(r.sent).toBe(0);
    expect(r.headline).toMatch(/ainda não saiu/i);
  });

  it("com envios e conversões: relata números reais e a taxa", async () => {
    db.campaignExecution.count.mockImplementation(route(120, 100));
    db.campaignExecution.findMany.mockImplementation(
      route(
        Array.from({ length: 12 }, () => ({ revenue: 50 })),
        Array.from({ length: 8 }, () => ({ revenue: 40 })),
      ),
    );
    db.campaignExecution.groupBy.mockImplementation(route([{ campaignId: "c1" }, { campaignId: "c2" }], [{ campaignId: "c1" }]));

    const r = await buildWeeklyRecap("r1", NOW);
    expect(r.hasActivity).toBe(true);
    expect(r.sent).toBe(120);
    expect(r.converted).toBe(12);
    expect(r.conversionRatePct).toBe(10);
    expect(r.campaigns).toBe(2);
    expect(r.revenue).toBe(600);
    expect(r.trend).toBe("UP"); // 120 vs 100 (+20%)
    expect(r.headline).toContain("120 mensagens");
  });

  it("semana quieta após uma semana ativa: reconhece a queda com honestidade", async () => {
    db.campaignExecution.count.mockImplementation(route(0, 80));
    db.campaignExecution.findMany.mockResolvedValue([]);
    db.campaignExecution.groupBy.mockResolvedValue([]);

    const r = await buildWeeklyRecap("r1", NOW);
    expect(r.hasActivity).toBe(false);
    expect(r.headline).toMatch(/mais quieta/i);
    expect(r.subline).toContain("80");
  });

  it("primeira semana com envios (sem base anterior) marca trend NEW", async () => {
    db.campaignExecution.count.mockImplementation(route(30, 0));
    db.campaignExecution.findMany.mockImplementation(route([{ revenue: 20 }], []));
    db.campaignExecution.groupBy.mockImplementation(route([{ campaignId: "c1" }], []));

    const r = await buildWeeklyRecap("r1", NOW);
    expect(r.trend).toBe("NEW");
    expect(r.subline).toMatch(/base de comparação começa agora/i);
  });
});
