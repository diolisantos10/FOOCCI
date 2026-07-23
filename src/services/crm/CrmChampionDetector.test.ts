import { describe, it, expect, beforeEach, vi } from "vitest";

const db = vi.hoisted(() => ({ campaign: { findMany: vi.fn() }, campaignExecution: { groupBy: vi.fn() } }));
vi.mock("@/lib/prisma", () => ({ prisma: db }));
vi.mock("@/services/crm/readyMadeCampaigns", () => ({ getReadyMadeMessageVariants: () => [] }));

import { findChampions } from "./CrmChampionDetector";
import { phraseKey } from "./crmMessagePool";

const WINNER = "Sumiu, {nome}?! Seu prato favorito está com saudade 🍣";
const LOSER = "Olá, temos novidades no cardápio.";

beforeEach(() => vi.clearAllMocks());

describe("CrmChampionDetector — descobre a frase campeã sozinho", () => {
  it("acha a campeã (muito acima da média, amostra suficiente) e devolve o TEXTO", async () => {
    db.campaign.findMany.mockResolvedValue([
      { id: "c1", name: "Cliente frio", templateId: null, message: null,
        scheduleConfig: { messagePool: { custom: [{ id: "w", text: WINNER, on: true }, { id: "l", text: LOSER, on: true }] } } },
    ]);
    db.campaignExecution.groupBy.mockImplementation((args: { where: { converted?: boolean } }) => {
      const kW = phraseKey(WINNER), kL = phraseKey(LOSER);
      if (args.where?.converted) return Promise.resolve([{ variantKey: kW, _count: { _all: 40 } }, { variantKey: kL, _count: { _all: 3 } }]);
      return Promise.resolve([{ variantKey: kW, _count: { _all: 200 } }, { variantKey: kL, _count: { _all: 200 } }]);
    });

    const r = await findChampions("r1");
    expect(r.ok).toBe(true);
    expect(r.champions).toHaveLength(1);
    expect(r.champions[0].phrase).toBe(WINNER);
    expect(r.champions[0].liftVsAvg).toBeGreaterThan(1.4);
    expect(r.runtimeTouched).toBe(false);
  });

  it("não elege campeã quando não há amostra suficiente (paciente)", async () => {
    db.campaign.findMany.mockResolvedValue([
      { id: "c1", name: "Nova", templateId: null, message: null,
        scheduleConfig: { messagePool: { custom: [{ id: "a", text: "A", on: true }, { id: "b", text: "B", on: true }] } } },
    ]);
    db.campaignExecution.groupBy.mockImplementation((args: { where: { converted?: boolean } }) => {
      const kA = phraseKey("A"), kB = phraseKey("B");
      if (args.where?.converted) return Promise.resolve([{ variantKey: kA, _count: { _all: 5 } }]);
      return Promise.resolve([{ variantKey: kA, _count: { _all: 10 } }, { variantKey: kB, _count: { _all: 10 } }]);
    });
    const r = await findChampions("r1");
    expect(r.champions).toHaveLength(0);
  });

  it("campanha com 1 frase só não tem campeã", async () => {
    db.campaign.findMany.mockResolvedValue([
      { id: "c1", name: "Uma", templateId: null, message: "única", scheduleConfig: null },
    ]);
    db.campaignExecution.groupBy.mockResolvedValue([{ variantKey: phraseKey("única"), _count: { _all: 300 } }]);
    const r = await findChampions("r1");
    expect(r.champions).toHaveLength(0);
  });
});
