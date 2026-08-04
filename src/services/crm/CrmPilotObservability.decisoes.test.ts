import { describe, it, expect, beforeEach, vi } from "vitest";

const db = vi.hoisted(() => ({
  brainShadowLog: { findMany: vi.fn() },
  campaignExecution: { findMany: vi.fn() },
}));
vi.mock("@/lib/prisma", () => ({ prisma: db }));

import { lerDecisoesRecentes, CHAVE_DO_AGENTE } from "./CrmPilotObservability";

beforeEach(() => vi.clearAllMocks());

describe("lerDecisoesRecentes — o 'o que ele está fazendo' da casa do agente", () => {
  it("mistura sombra e envio real em ordem cronológica (mais novo primeiro)", async () => {
    db.brainShadowLog.findMany.mockResolvedValue([
      { createdAt: new Date("2026-08-01T10:00:00Z"), intent: "recuperar quem sumiu", coherence: "PASS", confidence: 0.8, wouldReply: "sentimos sua falta" },
    ]);
    db.campaignExecution.findMany.mockResolvedValue([
      { createdAt: new Date("2026-08-02T10:00:00Z"), status: "SENT", messageText: "volta pra gente", converted: true, campaign: { name: "Reativação" } },
    ]);

    const d = await lerDecisoesRecentes("r1");
    expect(d).toHaveLength(2);
    expect(d[0].origem).toBe("ENVIO_REAL");
    expect(d[0].situacao).toBe("Reativação");
    expect(d[0].converteu).toBe(true);
    expect(d[1].origem).toBe("SOMBRA");
    expect(d[1].mensagem).toBe("sentimos sua falta");
    expect(d[1].coerencia).toBe("PASS");
  });

  it("filtra a sombra pelo agentId 'crm' e os envios pela marca agent:crm", async () => {
    db.brainShadowLog.findMany.mockResolvedValue([]);
    db.campaignExecution.findMany.mockResolvedValue([]);

    await lerDecisoesRecentes("r1");
    expect(db.brainShadowLog.findMany.mock.calls[0][0].where).toMatchObject({ restaurantId: "r1", agentId: "crm" });
    expect(db.campaignExecution.findMany.mock.calls[0][0].where).toMatchObject({ restaurantId: "r1", variantKey: CHAVE_DO_AGENTE });
  });

  it("falha de leitura devolve lista vazia, nunca lança (a casa não pode cair)", async () => {
    db.brainShadowLog.findMany.mockRejectedValue(new Error("db off"));
    db.campaignExecution.findMany.mockRejectedValue(new Error("db off"));
    await expect(lerDecisoesRecentes("r1")).resolves.toEqual([]);
  });

  it("respeita o limite depois do merge", async () => {
    const sombra = Array.from({ length: 10 }, (_, i) => ({
      createdAt: new Date(Date.UTC(2026, 7, 1, i)), intent: "x", coherence: "PASS", confidence: 0.7, wouldReply: `s${i}`,
    }));
    const reais = Array.from({ length: 10 }, (_, i) => ({
      createdAt: new Date(Date.UTC(2026, 7, 2, i)), status: "SENT", messageText: `r${i}`, converted: false, campaign: { name: "C" },
    }));
    db.brainShadowLog.findMany.mockResolvedValue(sombra);
    db.campaignExecution.findMany.mockResolvedValue(reais);

    const d = await lerDecisoesRecentes("r1", 5);
    expect(d).toHaveLength(5);
    // Os 5 mais novos são todos do dia 2 (envios reais).
    expect(d.every((x) => x.origem === "ENVIO_REAL")).toBe(true);
  });
});
