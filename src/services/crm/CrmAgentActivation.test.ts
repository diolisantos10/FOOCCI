import { describe, it, expect, beforeEach, vi } from "vitest";

const db = vi.hoisted(() => ({ campaign: { findFirst: vi.fn(), findMany: vi.fn(), update: vi.fn() } }));
vi.mock("@/lib/prisma", () => ({ prisma: db }));

import { isAgentActive, setAgentActive, panicDisableAll } from "./CrmAgentActivation";

beforeEach(() => vi.clearAllMocks());

describe("CrmAgentActivation — interruptor por campanha (default DESLIGADO)", () => {
  it("default: sem flag = agente NÃO ativo (modo aprendiz)", () => {
    expect(isAgentActive(null)).toBe(false);
    expect(isAgentActive({})).toBe(false);
    expect(isAgentActive({ mode: "RECURRING" })).toBe(false);
    expect(isAgentActive({ agentActive: true })).toBe(true);
  });

  it("liga preservando o resto do scheduleConfig", async () => {
    db.campaign.findFirst.mockResolvedValue({ id: "c1", scheduleConfig: { mode: "RECURRING", messagePool: { agent: [] } } });
    db.campaign.update.mockResolvedValue({});
    const r = await setAgentActive("r1", "c1", true);
    expect(r).toEqual({ ok: true, campaignId: "c1", active: true });
    const written = db.campaign.update.mock.calls[0][0].data.scheduleConfig;
    expect(written.agentActive).toBe(true);
    expect(written.mode).toBe("RECURRING"); // preservou
    expect(written.messagePool).toBeTruthy();
  });

  it("campanha inexistente → erro", async () => {
    db.campaign.findFirst.mockResolvedValue(null);
    const r = await setAgentActive("r1", "x", true);
    expect(r.ok).toBe(false);
  });

  it("pânico desliga só as que estavam ligadas", async () => {
    db.campaign.findMany.mockResolvedValue([
      { id: "c1", scheduleConfig: { agentActive: true } },
      { id: "c2", scheduleConfig: { agentActive: false } },
      { id: "c3", scheduleConfig: { agentActive: true, mode: "X" } },
    ]);
    db.campaign.update.mockResolvedValue({});
    const r = await panicDisableAll("r1");
    expect(r.disabled).toBe(2);
    expect(db.campaign.update).toHaveBeenCalledTimes(2);
  });
});
