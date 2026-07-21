import { describe, it, expect, beforeEach, vi } from "vitest";

const db = vi.hoisted(() => ({ campaign: { findFirst: vi.fn() } }));
const proposePhrase = vi.hoisted(() => vi.fn());
vi.mock("@/lib/prisma", () => ({ prisma: db }));
vi.mock("@/services/crm/CrmPhraseProposer", () => ({ proposePhrase }));

import { proposeForCampaign, TARGET_PHRASES_PER_CAMPAIGN } from "./CrmAgentRepertoireService";

beforeEach(() => {
  vi.clearAllMocks();
  db.campaign.findFirst.mockResolvedValue({
    id: "c1", name: "Cliente frio", objective: "RECUPERAR", targetSegment: "FRIO",
    couponCode: null, message: "Sentimos sua falta!", scheduleConfig: null,
  });
  let n = 0;
  proposePhrase.mockImplementation(async () => {
    n += 1;
    return { ok: true, phrase: `Frase nova ${n} 😊`, clean: true, blockedReasons: [], submitted: false, sent: false };
  });
});

describe("CrmAgentRepertoireService — o agente cresce o repertório (PREVIEW)", () => {
  it("propõe frases até o teto e NUNCA escreve/submete/envia", async () => {
    const r = await proposeForCampaign({ restaurantId: "r1", campaignId: "c1" });
    if ("ok" in r && r.ok === false) throw new Error("inesperado");
    const res = r as Exclude<typeof r, { ok: false }>;
    expect(res.existingCount).toBe(1); // a mensagem base conta como 1
    expect(res.proposals.length).toBe(TARGET_PHRASES_PER_CAMPAIGN - 1);
    expect(res.committed).toBe(false);
    expect(res.submittedToMeta).toBe(false);
    expect(res.sent).toBe(false);
  });

  it("respeita o count pedido", async () => {
    const r = await proposeForCampaign({ restaurantId: "r1", campaignId: "c1", count: 2 });
    const res = r as Exclude<typeof r, { ok: false }>;
    expect(res.proposals.length).toBe(2);
  });

  it("passa a frase campeã (aprendizado) para o proponente", async () => {
    await proposeForCampaign({ restaurantId: "r1", campaignId: "c1", count: 1, winningExample: "Sumiu, {nome}?!" });
    expect(proposePhrase.mock.calls[0][0].winningExample).toBe("Sumiu, {nome}?!");
  });

  it("campanha inexistente → erro claro", async () => {
    db.campaign.findFirst.mockResolvedValue(null);
    const r = await proposeForCampaign({ restaurantId: "r1", campaignId: "x" });
    expect(r).toEqual({ ok: false, error: expect.stringMatching(/não encontrada/i) });
  });
});
