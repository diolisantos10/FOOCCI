/**
 * Part 5 — automated proof of the Text Order simulator. The simulator drives the
 * REAL state machine over a synthetic catalog and lets the team validate the
 * whole journey WITHOUT a phone: transcript, comanda, WOULD_* actions, safety.
 * These tests assert it is hermetic (no Evolution / no real order / no real Pix /
 * runtimeTouched=false), covers every canonical scenario, and stays P0-clean.
 */

import { describe, it, expect, beforeAll } from "vitest";
import { runTextOrderSimulator, type SimReport, type SimScenarioResult } from "../WhatsAppTextOrderSimulatorService";
import { MENU_FOOTER } from "../menuFooter";

let report: SimReport;
const byId = (id: string): SimScenarioResult => report.scenarios.find(s => s.scenarioId === id)!;
const agentReplies = (s: SimScenarioResult) => s.transcript.filter(t => t.actor === "AGENT").map(t => t.text);

beforeAll(async () => {
  report = await runTextOrderSimulator("REPLY_ONLY");
});

describe("simulador — saúde geral e segurança", () => {
  it("(4/5/6) é hermético: sem Evolution, sem pedido real, sem Pix real, runtimeTouched=false", () => {
    expect(report.safety).toEqual({ noEvolution: true, noRealOrder: true, noRealPix: true, runtimeTouched: false });
    expect(report.runtimeTouched).toBe(false);
    for (const s of report.scenarios) {
      expect(s.safety.noEvolution).toBe(true);
      expect(s.safety.noRealOrder).toBe(true);
      expect(s.safety.noRealPix).toBe(true);
    }
  });

  it("não tem violações P0 e cobre todos os cenários canônicos", () => {
    expect(report.p0).toBe(0);
    expect(report.status).not.toBe("FAIL");
    expect(report.total).toBeGreaterThanOrEqual(11);
    for (const id of ["sim-free-text-detect", "sim-cash-delivery", "sim-pix-pickup", "sim-pickup", "sim-not-found", "sim-ambiguous", "sim-menu-zero", "sim-handoff", "sim-menu-questions", "sim-config-dangerous", "sim-config-safe"]) {
      expect(byId(id)).toBeTruthy();
    }
  });
});

describe("cenários de pedido", () => {
  it("(1) detecta ORDER_BY_TEXT e extrai itens/pagamento/entrega do texto livre", () => {
    const s = byId("sim-free-text-detect");
    expect(["ORDER_REQUEST", "ORDER_BY_TEXT"]).toContain(s.detectedIntent);
    const ent = s.extractedEntities as { items?: unknown[]; paymentMentioned?: string; deliveryMentioned?: string };
    expect((ent.items ?? []).length).toBeGreaterThanOrEqual(1);
    expect(String(ent.paymentMentioned)).toMatch(/dinheiro/i);
    expect(s.status).toBe("PASS");
  });

  it("(3) toda resposta ativa termina com 0. menu", () => {
    const s = byId("sim-cash-delivery");
    const terminal = /pedido anotado|pedido confirmado|pix gerado|atendente/i;
    for (const r of agentReplies(s)) {
      if (terminal.test(r)) continue;
      expect(r).toContain(MENU_FOOTER);
    }
  });

  it("dinheiro+entrega usa endereço salvo, pergunta troco e montaria o pedido (WOULD_CREATE_ORDER)", () => {
    const s = byId("sim-cash-delivery");
    const joined = agentReplies(s).join("\n");
    expect(joined).toContain("Rua das Flores");
    expect(joined.toLowerCase()).toContain("troco");
    expect(s.actions).toContain("WOULD_CREATE_ORDER");
    expect(s.status).toBe("PASS");
  });

  it("(7) Pix retorna WOULD_GENERATE_PIX, só após o resumo, e nunca gera Pix real", () => {
    const s = byId("sim-pix-pickup");
    expect(s.actions).toContain("WOULD_GENERATE_PIX");
    expect(s.actions).toContain("WOULD_CREATE_ORDER");
    expect(s.safety.noRealPix).toBe(true);
    expect(s.status).toBe("PASS");
  });

  it("(3-retirada) retirada não pede endereço e montaria o pedido", () => {
    const s = byId("sim-pickup");
    const joined = agentReplies(s).join("\n");
    expect(joined).not.toContain("Rua das Flores");
    expect(s.actions).toContain("WOULD_CREATE_ORDER");
  });
});

describe("cenários de borda", () => {
  it("(8) produto inexistente não inventa e oferece saída segura", () => {
    const s = byId("sim-not-found");
    expect(s.orderDraft).toBeNull();
    expect(agentReplies(s).join("\n").toLowerCase()).toMatch(/atendente|confirmar|cardápio/);
    expect(s.status).toBe("PASS");
  });

  it("(9) produto ambíguo lista opções numeradas e não escolhe sozinho", () => {
    const s = byId("sim-ambiguous");
    expect(agentReplies(s).join("\n")).toMatch(/1(️⃣)?\s*[—.\-]?\s/);
    expect(s.orderDraft).toBeNull();
  });

  it("(10) 0 com comanda pergunta continuar/descartar", () => {
    const s = byId("sim-menu-zero");
    const joined = agentReplies(s).join("\n").toLowerCase();
    expect(joined).toContain("continuar");
    expect(joined).toContain("descartar");
  });

  it("(11) handoff encaminha para atendente sem criar pedido", () => {
    const s = byId("sim-handoff");
    expect(agentReplies(s).join("\n").toLowerCase()).toContain("atendente");
    expect(s.safety.noRealOrder).toBe(true);
  });

  it("(12) pergunta de cardápio (W8/W9) não cita a frase entre aspas como produto", () => {
    const s = byId("sim-menu-questions");
    expect(agentReplies(s).join("\n")).not.toMatch(/n[ãa]o encontrei "[^"]+" no card[aá]pio/i);
    expect(s.detectedIntent).toBe("QUESTION");
    expect(s.status).toBe("PASS");
  });
});

describe("cenários de configuração", () => {
  it("(13) RESTAURANT_WIDE sem aprovação → HIGH e bloqueia", () => {
    const s = byId("sim-config-dangerous");
    expect(s.status).toBe("PASS"); // PASS = o simulador confirmou que o risco é detectado
    expect(s.checks.find(c => c.name === "riskLevel=HIGH")?.passed).toBe(true);
    expect(s.checks.find(c => c.name.includes("bloqueia"))?.passed).toBe(true);
  });

  it("(14) PHONE_ALLOWLIST + REPLY_ONLY → LOW e replyOnly pronto", () => {
    const s = byId("sim-config-safe");
    expect(s.checks.find(c => c.name === "riskLevel=LOW")?.passed).toBe(true);
    expect(s.checks.find(c => c.name.includes("replyOnly"))?.passed).toBe(true);
  });
});
