import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

const selectEngineRouted = vi.hoisted(() => vi.fn());
const callStructuredJson = vi.hoisted(() => vi.fn());
vi.mock("@/services/brain/engines/AIEngineRouter", () => ({ selectEngineRouted }));
vi.mock("@/services/brain/engines/OpenAIEngineAdapter", () => ({ callStructuredJson }));
vi.mock("@/services/crm/CrmAgentProfile", () => ({ buildCrmProfileDirective: () => "CRM" }));
vi.mock("@/services/brain/engines/TranscriptionAdapter", () => ({ transcribeAudio: vi.fn() }));

import { draftCampaign } from "./CrmCampaignDrafter";

const OLD = process.env.OPENAI_API_KEY;
beforeEach(() => {
  vi.clearAllMocks();
  process.env.OPENAI_API_KEY = "sk-test";
  selectEngineRouted.mockResolvedValue({ provider: "OPENAI" });
});
afterEach(() => { if (OLD === undefined) delete process.env.OPENAI_API_KEY; else process.env.OPENAI_API_KEY = OLD; });

describe("CrmCampaignDrafter — pedido em texto → rascunho de campanha", () => {
  it("monta o rascunho e valida os enums", async () => {
    callStructuredJson.mockResolvedValue(JSON.stringify({
      name: "Volta, sumido!", objective: "RECUPERAR", targetSegment: "FRIO",
      messageTemplate: "Oi {nome}! Faz tempo… bora voltar? {link_cardapio}", couponPercent: 10, notes: "recuperar frios com 10%",
    }));
    const r = await draftCampaign("r1", "recuperar quem sumiu com 10%");
    expect(r.ok).toBe(true);
    expect(r.draft?.objective).toBe("RECUPERAR");
    expect(r.draft?.targetSegment).toBe("FRIO");
    expect(r.draft?.couponPercent).toBe(10);
    expect(r.draft?.messageTemplate).toMatch(/\{nome\}/);
  });

  it("enum inválido cai no fallback seguro (OUTRO/TODOS)", async () => {
    callStructuredJson.mockResolvedValue(JSON.stringify({
      name: "X", objective: "INVENTADO", targetSegment: "NAOEXISTE",
      messageTemplate: "Oi {nome}, novidade no cardápio! {link_cardapio}", couponPercent: null,
    }));
    const r = await draftCampaign("r1", "algo");
    expect(r.draft?.objective).toBe("OUTRO");
    expect(r.draft?.targetSegment).toBe("TODOS");
  });

  it("mensagem com spam é barrada (não vira rascunho)", async () => {
    callStructuredJson.mockResolvedValue(JSON.stringify({
      name: "X", objective: "RECUPERAR", targetSegment: "FRIO",
      messageTemplate: "IMPERDÍVEL!! Clique agora, oferta que você não pode perder!", couponPercent: null,
    }));
    const r = await draftCampaign("r1", "algo");
    expect(r.ok).toBe(false);
  });

  it("pedido vazio → erro", async () => {
    const r = await draftCampaign("r1", "   ");
    expect(r.ok).toBe(false);
  });
});
