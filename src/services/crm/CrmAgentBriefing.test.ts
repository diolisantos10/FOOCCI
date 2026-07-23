import { describe, it, expect } from "vitest";
import { composeBriefing } from "./CrmAgentBriefing";

describe("CrmAgentBriefing — o recado do agente (só fala quando vale)", () => {
  it("quieto quando não há nada que se destaque", () => {
    const notes = composeBriefing({
      champions: [{ campaignName: "X", liftVsAvg: 1.1, sent: 100 }], // abaixo da régua
      shadowCampaigns: [{ campaignId: "c1", name: "X", mode: "EXPLORING", projectedLiftPct: null, phrases: 3, totalSent: 20 }],
      activation: [{ campaignId: "c1", agentActive: false }],
    });
    expect(notes).toHaveLength(0);
  });

  it("VITÓRIA: frase campeã bem acima da média vira recado", () => {
    const notes = composeBriefing({
      champions: [{ campaignName: "Cliente frio", liftVsAvg: 2.1, sent: 200 }],
      shadowCampaigns: [],
      activation: [],
    });
    expect(notes.some((n) => n.kind === "WIN" && /campeã/i.test(n.title))).toBe(true);
  });

  it("OPORTUNIDADE: ganho projetado alto numa campanha não ativada", () => {
    const notes = composeBriefing({
      champions: [],
      shadowCampaigns: [{ campaignId: "c1", name: "Recuperar frios", mode: "OPTIMIZING", projectedLiftPct: 25, phrases: 4, totalSent: 300 }],
      activation: [{ campaignId: "c1", agentActive: false }],
    });
    expect(notes.some((n) => n.kind === "OPPORTUNITY" && /\+25%/.test(n.title))).toBe(true);
  });

  it("não sugere ativar uma campanha que JÁ está ativa", () => {
    const notes = composeBriefing({
      champions: [],
      shadowCampaigns: [{ campaignId: "c1", name: "X", mode: "OPTIMIZING", projectedLiftPct: 25, phrases: 4, totalSent: 300 }],
      activation: [{ campaignId: "c1", agentActive: true }],
    });
    expect(notes.filter((n) => /\+25%/.test(n.title))).toHaveLength(0);
  });

  it("OPORTUNIDADE: campanha com 1 frase e volume vira sugestão de criar variações", () => {
    const notes = composeBriefing({
      champions: [],
      shadowCampaigns: [{ campaignId: "c1", name: "Converter 1º pedido", mode: "EXPLORING", projectedLiftPct: null, phrases: 1, totalSent: 120 }],
      activation: [{ campaignId: "c1", agentActive: false }],
    });
    expect(notes.some((n) => /uma frase só/i.test(n.title))).toBe(true);
  });
});
