import { describe, it, expect } from "vitest";
import {
  resolveCrmPilotAccess,
  crmAbPicksAgent,
  agentMessagePassesFloor,
  type CrmPilotConfig,
} from "./CrmAgentPilotService";

const cfg = (over: Partial<CrmPilotConfig> = {}): CrmPilotConfig => ({
  restaurantId: "r1", mode: "SHADOW_ONLY", paused: false, minConfidence: 0.6,
  abTestPercent: 100, allowlistedPhones: [], notes: null, ...over,
});

describe("resolveCrmPilotAccess — quem recebe a msg do agente", () => {
  it("SHADOW_ONLY nunca libera (só sorteio)", () => {
    expect(resolveCrmPilotAccess(cfg(), "5511999999999").allowed).toBe(false);
  });
  it("paused nunca libera (rollback ativo)", () => {
    expect(resolveCrmPilotAccess(cfg({ mode: "RESTAURANT_WIDE", paused: true }), "5511999999999").allowed).toBe(false);
  });
  it("ALLOWLIST libera só telefone da lista", () => {
    const c = cfg({ mode: "ALLOWLIST", allowlistedPhones: ["5511999999999"] });
    expect(resolveCrmPilotAccess(c, "5511999999999").allowed).toBe(true);
    expect(resolveCrmPilotAccess(c, "5511888888888").allowed).toBe(false);
  });
  it("RESTAURANT_WIDE libera todo mundo", () => {
    expect(resolveCrmPilotAccess(cfg({ mode: "RESTAURANT_WIDE" }), "5511888888888").allowed).toBe(true);
  });
});

describe("crmAbPicksAgent — split determinístico", () => {
  it("100% sempre agente; 0% sempre sorteio", () => {
    expect(crmAbPicksAgent("c1", 100)).toBe(true);
    expect(crmAbPicksAgent("c1", 0)).toBe(false);
  });
  it("mesmo cliente cai sempre no mesmo braço (estável)", () => {
    const a = crmAbPicksAgent("cliente-xyz", 50);
    expect(crmAbPicksAgent("cliente-xyz", 50)).toBe(a);
  });
  it("aproxima o percentual pedido sobre muitos clientes", () => {
    let agent = 0;
    const N = 2000;
    for (let i = 0; i < N; i++) if (crmAbPicksAgent(`cust-${i}`, 50)) agent++;
    const ratio = agent / N;
    expect(ratio).toBeGreaterThan(0.4);
    expect(ratio).toBeLessThan(0.6);
  });
});

describe("agentMessagePassesFloor — última trava antes de sair", () => {
  it("barra desconto sem cupom real", () => {
    expect(agentMessagePassesFloor("Volte e ganhe 20% de desconto!", false)).toBe(false);
  });
  it("libera desconto quando há cupom real de campanha", () => {
    expect(agentMessagePassesFloor("Use o cupom VOLTA10 e ganhe 10% 😊", true)).toBe(true);
  });
  it("barra linguagem de spam/vigilância", () => {
    expect(agentMessagePassesFloor("Detectamos que você sumiu, imperdível!", false)).toBe(false);
  });
  it("barra mensagem vazia", () => {
    expect(agentMessagePassesFloor("   ", false)).toBe(false);
  });
  it("deixa passar mensagem limpa sem oferta", () => {
    expect(agentMessagePassesFloor("Oi, Ana! Bateu saudade da sua marmita? 😋", false)).toBe(true);
  });
});
