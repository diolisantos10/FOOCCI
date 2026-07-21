import { describe, it, expect, beforeEach, vi } from "vitest";

const db = vi.hoisted(() => ({ campaign: { findFirst: vi.fn(), update: vi.fn() } }));
const proposePhrase = vi.hoisted(() => vi.fn());
const provisionPoolTemplates = vi.hoisted(() => vi.fn());
vi.mock("@/lib/prisma", () => ({ prisma: db }));
vi.mock("@/services/crm/CrmPhraseProposer", async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  proposePhrase,
}));
vi.mock("@/services/whatsapp/MetaTemplateProvisionService", () => ({ provisionPoolTemplates }));

import { proposeForCampaign, commitProposals, TARGET_PHRASES_PER_CAMPAIGN } from "./CrmAgentRepertoireService";

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

  it("commit: adiciona ao pool, submete à Meta e NUNCA envia", async () => {
    db.campaign.findFirst.mockResolvedValue({ id: "c1", couponCode: null, scheduleConfig: { mode: "RECURRING" } });
    db.campaign.update.mockResolvedValue({});
    provisionPoolTemplates.mockResolvedValue({ ok: true, created: 2, existed: 0, failed: 0, items: [] });
    const r = await commitProposals("r1", "c1", ["Frase A limpa 😊", "Frase B diferente 🍣"]);
    expect(r.ok).toBe(true);
    expect(r.added).toHaveLength(2);
    expect(r.sent).toBe(false);
    expect(r.meta).toEqual({ created: 2, existed: 0, failed: 0 });
    // escreveu o pool preservando o resto do config
    const written = db.campaign.update.mock.calls[0][0].data.scheduleConfig;
    expect(written.mode).toBe("RECURRING");
    expect(written.messagePool.custom).toHaveLength(2);
    expect(provisionPoolTemplates).toHaveBeenCalledWith("r1", "c1");
  });

  it("commit: barra frase de desconto sem cupom (piso reaplicado) e não duplica", async () => {
    db.campaign.findFirst.mockResolvedValue({ id: "c1", couponCode: null, scheduleConfig: null });
    db.campaign.update.mockResolvedValue({});
    provisionPoolTemplates.mockResolvedValue({ ok: true, created: 1, existed: 0, failed: 0, items: [] });
    const r = await commitProposals("r1", "c1", ["Ganhe 20% de desconto agora!", "Bora pedir hoje? 😋"]);
    expect(r.added).toEqual(["Bora pedir hoje? 😋"]);
    expect(r.skipped.some((s) => /desconto/.test(s.reason))).toBe(true);
  });
});
