import { describe, it, expect, vi } from "vitest";

// Catálogo vazio p/ isolar o comportamento dos baldes custom/agent.
vi.mock("@/services/crm/readyMadeCampaigns", () => ({ getReadyMadeMessageVariants: () => [] }));

import { listPoolCandidates, resolveActivePhrases, parseMessagePool } from "./crmMessagePool";

const scheduleConfig = {
  messagePool: {
    custom: [{ id: "o1", text: "Frase do lojista", on: true }],
    agent: [{ id: "a1", text: "Frase do agente 1", on: true }, { id: "a2", text: "Frase do agente 2", on: true }],
  },
};

describe("crmMessagePool — balde do agente separado + rotação estacionada", () => {
  it("parse lê os dois baldes; lojista fica no custom, agente no agent", () => {
    const pool = parseMessagePool(scheduleConfig)!;
    expect(pool.custom).toHaveLength(1);
    expect(pool.agent).toHaveLength(2);
  });

  it("candidatos (p/ submeter à Meta) INCLUEM as frases do agente", () => {
    const cands = listPoolCandidates(null, parseMessagePool(scheduleConfig));
    const sources = cands.map((c) => c.source).sort();
    expect(sources).toContain("agent");
    expect(cands.filter((c) => c.source === "agent")).toHaveLength(2);
  });

  it("SEM includeAgent: frases do agente ficam ESTACIONADAS (não rotam) — só o lojista roda", () => {
    const active = resolveActivePhrases({ templateId: null, message: "base" }, parseMessagePool(scheduleConfig));
    expect(active.some((p) => p.source === "agent")).toBe(false);
    expect(active.some((p) => p.source === "custom")).toBe(true);
  });

  it("COM includeAgent (campanha ativada): as frases do agente entram no rodízio", () => {
    const active = resolveActivePhrases(
      { templateId: null, message: "base" },
      parseMessagePool(scheduleConfig),
      { includeAgent: true },
    );
    expect(active.filter((p) => p.source === "agent")).toHaveLength(2);
  });
});
