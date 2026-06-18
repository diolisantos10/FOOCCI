/**
 * WhatsAppFullAgentDiagnostic — tests for the consolidated agent battery's PURE
 * evaluation + recommendation logic (no DB, no Evolution, no order/Pix). The
 * async runner is exercised in production via the workflow.
 */

import { vi, describe, it, expect } from "vitest";

// Mock the heavy module graph pulled in by fullAgentDiagnostic → hostRoutingDiagnostic
// → WhatsAppReceptionistService. We only call the pure functions here.
vi.mock("@/lib/prisma", () => ({ prisma: {} }));
vi.mock("@/lib/openai", () => ({ openai: {} }));
vi.mock("@/services/evolution/EvolutionConfigService", () => ({ EvolutionConfigService: class {} }));
vi.mock("@/lib/evolution/EvolutionClient", () => ({ EvolutionClient: class {} }));
vi.mock("@/services/buildos/BuildCommandRouter", () => ({ detectBuildCommand: () => false }));
vi.mock("@/services/knowledge/RestaurantKnowledgeService", () => ({ RestaurantKnowledgeService: class {} }));
vi.mock("@/lib/handoff", () => ({ markConversationNeedsHuman: vi.fn() }));
vi.mock("@/lib/wa-token", () => ({ signWaToken: vi.fn() }));
vi.mock("@/services/ai/UnknownFallbackHandler", () => ({
  P0_FALLBACK_REPLY: "atendente", isRepeatedClarificationLoop: vi.fn(() => false), classifyReceptionistFailure: vi.fn(),
}));
vi.mock("@/services/agent-training/AgentTrainingFailureCaptureService", () => ({ captureFailure: vi.fn() }));

import {
  evaluateScenario,
  computeSummary,
  FULL_AGENT_SCENARIOS,
  type ScenarioSpec,
  type EvaluableResult,
  type ScenarioResult,
  type FullAgentSafety,
} from "../fullAgentDiagnostic";

const SAFE: FullAgentSafety = { noEvolution: true, noRealOrder: true, noRealPix: true, runtimeTouched: false };
const spec = (over: Partial<ScenarioSpec>): ScenarioSpec => ({
  id: "x", name: "x", phoneProfile: "NON_ALLOWLISTED", message: "m", expect: {}, ...over,
});
const recep = (over: Partial<NonNullable<EvaluableResult["receptionistPreview"]>>) => ({
  responseType: "SAFE_MENU" as const, containsRawLink: false, containsRestaurantLocation: false, containsHandoff: false, ...over,
});

describe("battery covers both profiles", () => {
  it("(1) tem cenários allowlisted", () => {
    expect(FULL_AGENT_SCENARIOS.some(s => s.phoneProfile === "ALLOWLISTED")).toBe(true);
  });
  it("(2) tem cenários non-allowlisted", () => {
    expect(FULL_AGENT_SCENARIOS.some(s => s.phoneProfile === "NON_ALLOWLISTED")).toBe(true);
  });
  it("(1c) inclui A6-delivery, A7-pix, A8-handoff, B5-closed; não inclui A6-handoff nem B5-order-2", () => {
    const ids = FULL_AGENT_SCENARIOS.map(s => s.id);
    expect(ids).toContain("A6-delivery");
    expect(ids).toContain("A7-pix");
    expect(ids).toContain("A8-handoff");
    expect(ids).toContain("B5-closed");
    expect(ids).not.toContain("A6-handoff");
    expect(ids).not.toContain("B5-order-2");
  });
});

describe("evaluateScenario", () => {
  it("(3) pedido allowlisted que vira TEXT_ORDER passa", () => {
    const r = evaluateScenario(
      spec({ phoneProfile: "ALLOWLISTED", expect: { host: "TEXT_ORDER" } }),
      { host: "TEXT_ORDER", phoneInAllowlist: true },
    );
    expect(r.passed).toBe(true);
    expect(r.severity).toBe("OK");
  });

  it("(3b) pedido allowlisted que NÃO vira TEXT_ORDER é P0", () => {
    const r = evaluateScenario(
      spec({ phoneProfile: "ALLOWLISTED", expect: { host: "TEXT_ORDER" } }),
      { host: "RECEPTIONIST", phoneInAllowlist: true },
    );
    expect(r.severity).toBe("P0");
  });

  it("(4) pedido non-allowlisted que vira RECEPTIONIST+SAFE_MENU passa", () => {
    const r = evaluateScenario(
      spec({ expect: { host: "RECEPTIONIST", responseTypeIn: ["SAFE_MENU"], noRawLink: true } }),
      { host: "RECEPTIONIST", phoneInAllowlist: false, receptionistPreview: recep({}) },
    );
    expect(r.passed).toBe(true);
  });

  it("(5) endereço solto que vira LOCATION é P0", () => {
    const r = evaluateScenario(
      spec({ expect: { host: "RECEPTIONIST", noLocation: true } }),
      { host: "RECEPTIONIST", phoneInAllowlist: false, receptionistPreview: recep({ responseType: "LOCATION", containsRestaurantLocation: true }) },
    );
    expect(r.severity).toBe("P0");
    expect(r.failures.join(" ")).toMatch(/localiza/i);
  });

  it("(6) endereço solto que vira HANDOFF é P0", () => {
    const r = evaluateScenario(
      spec({ expect: { host: "RECEPTIONIST", noHandoff: true } }),
      { host: "RECEPTIONIST", phoneInAllowlist: false, receptionistPreview: recep({ responseType: "HANDOFF", containsHandoff: true }) },
    );
    expect(r.severity).toBe("P0");
  });

  it("(7) link gigante na primeira resposta é P0", () => {
    const r = evaluateScenario(
      spec({ expect: { host: "RECEPTIONIST", noRawLink: true } }),
      { host: "RECEPTIONIST", phoneInAllowlist: false, receptionistPreview: recep({ responseType: "LINK_CARDAPIO", containsRawLink: true }) },
    );
    expect(r.severity).toBe("P0");
  });

  it("(7b) responseType UNKNOWN num caso crítico é P1 (não P0)", () => {
    const r = evaluateScenario(
      spec({ expect: { host: "RECEPTIONIST", responseTypeIn: ["SAFE_MENU", "UNKNOWN"], noRawLink: true } }),
      { host: "RECEPTIONIST", phoneInAllowlist: false, receptionistPreview: recep({ responseType: "UNKNOWN" }) },
    );
    expect(r.severity).toBe("P1");
  });

  it("(7c) perfil incorreto (sintético acabou allowlisted) é P0", () => {
    const r = evaluateScenario(
      spec({ phoneProfile: "NON_ALLOWLISTED", expect: { host: "RECEPTIONIST" } }),
      { host: "RECEPTIONIST", phoneInAllowlist: true, receptionistPreview: recep({}) },
    );
    expect(r.severity).toBe("P0");
  });

  it("(A6) allowlisted · pedido para entrega → TEXT_ORDER passa", () => {
    const s = FULL_AGENT_SCENARIOS.find(x => x.id === "A6-delivery")!;
    const r = evaluateScenario(s, { host: "TEXT_ORDER", phoneInAllowlist: true });
    expect(r.passed).toBe(true);
    expect(r.severity).toBe("OK");
  });

  it("(A6b) allowlisted · entrega que vira RECEPTIONIST é P0", () => {
    const s = FULL_AGENT_SCENARIOS.find(x => x.id === "A6-delivery")!;
    const r = evaluateScenario(s, { host: "RECEPTIONIST", phoneInAllowlist: true, receptionistPreview: recep({}) });
    expect(r.severity).toBe("P0");
  });

  it("(A7) allowlisted · Pix antes do pedido → RECEPTIONIST+SAFE_MENU passa (sem Pix real)", () => {
    const s = FULL_AGENT_SCENARIOS.find(x => x.id === "A7-pix")!;
    const r = evaluateScenario(s, { host: "RECEPTIONIST", phoneInAllowlist: true, receptionistPreview: recep({}) });
    expect(r.passed).toBe(true);
  });

  it("(B5) fora-allowlist · fora do horário → RECEPTIONIST+SAFE_MENU passa", () => {
    const s = FULL_AGENT_SCENARIOS.find(x => x.id === "B5-closed")!;
    const r = evaluateScenario(s, { host: "RECEPTIONIST", phoneInAllowlist: false, receptionistPreview: recep({}) });
    expect(r.passed).toBe(true);
  });

  it("(B5b) fora-allowlist · fora do horário + link gigante é P0", () => {
    const s = FULL_AGENT_SCENARIOS.find(x => x.id === "B5-closed")!;
    const r = evaluateScenario(s, { host: "RECEPTIONIST", phoneInAllowlist: false, receptionistPreview: recep({ responseType: "LINK_CARDAPIO", containsRawLink: true }) });
    expect(r.severity).toBe("P0");
  });
});

describe("computeSummary — recomendação operacional", () => {
  const pass = (sev: ScenarioResult["severity"]): ScenarioResult =>
    ({ id: "x", name: "x", phoneProfile: "NON_ALLOWLISTED", host: "RECEPTIONIST", passed: sev === "OK", failures: [], severity: sev });

  it("(8) segurança violada (noRealPix) → ROLLBACK_OR_PAUSE", () => {
    const s = computeSummary([pass("OK")], { ...SAFE, noRealPix: false }, false);
    expect(s.recommendation).toBe("ROLLBACK_OR_PAUSE");
    expect(s.status).toBe("FAIL");
  });

  it("(8c) noEvolution=false → ROLLBACK_OR_PAUSE", () => {
    const s = computeSummary([pass("OK")], { ...SAFE, noEvolution: false }, false);
    expect(s.recommendation).toBe("ROLLBACK_OR_PAUSE");
  });

  it("(8d) noRealOrder=false → ROLLBACK_OR_PAUSE", () => {
    const s = computeSummary([pass("OK")], { ...SAFE, noRealOrder: false }, false);
    expect(s.recommendation).toBe("ROLLBACK_OR_PAUSE");
  });

  it("(9) P0 comportamental → KEEP_ALLOWLIST (FAIL)", () => {
    const s = computeSummary([pass("P0"), pass("OK")], SAFE, false);
    expect(s.recommendation).toBe("KEEP_ALLOWLIST");
    expect(s.status).toBe("FAIL");
  });

  it("(9b) P1 → KEEP_ALLOWLIST (WARNING)", () => {
    const s = computeSummary([pass("P1"), pass("OK")], SAFE, false);
    expect(s.recommendation).toBe("KEEP_ALLOWLIST");
    expect(s.status).toBe("WARNING");
  });

  it("(10) tudo verde mas sem campo real → EXPAND_ALLOWLIST (PASS)", () => {
    const s = computeSummary([pass("OK"), pass("OK")], SAFE, false);
    expect(s.recommendation).toBe("EXPAND_ALLOWLIST");
    expect(s.status).toBe("PASS");
  });

  it("(10b) tudo verde + campo validado → READY_FOR_RESTAURANT_WIDE_REQUEST", () => {
    const s = computeSummary([pass("OK")], SAFE, true);
    expect(s.recommendation).toBe("READY_FOR_RESTAURANT_WIDE_REQUEST");
  });

  it("(8b) safety violada tem precedência sobre 'tudo verde'", () => {
    const s = computeSummary([pass("OK")], { ...SAFE, runtimeTouched: true }, true);
    expect(s.recommendation).toBe("ROLLBACK_OR_PAUSE");
  });
});

// ── RESTAURANT_WIDE mode ──────────────────────────────────────────────────────

describe("evaluateScenario — RESTAURANT_WIDE adaptations", () => {
  it("(RW1) NON_ALLOWLISTED + phoneInAllowlist=true + restaurantWide=true → OK (não P0)", () => {
    const r = evaluateScenario(
      spec({ phoneProfile: "NON_ALLOWLISTED", expect: { host: "RECEPTIONIST" } }),
      { host: "RECEPTIONIST", phoneInAllowlist: true, restaurantWide: true, receptionistPreview: recep({}) },
    );
    expect(r.passed).toBe(true);
    expect(r.severity).toBe("OK");
  });

  it("(RW2) NON_ALLOWLISTED order → TEXT_ORDER + restaurantWide=true → OK (comportamento correto)", () => {
    const r = evaluateScenario(
      spec({ phoneProfile: "NON_ALLOWLISTED", expect: { host: "RECEPTIONIST" } }),
      { host: "TEXT_ORDER", phoneInAllowlist: true, restaurantWide: true },
    );
    expect(r.passed).toBe(true);
    expect(r.severity).toBe("OK");
  });

  it("(RW3) NON_ALLOWLISTED + restaurantWide=false: phoneInAllowlist=true ainda é P0 (perfil errado)", () => {
    const r = evaluateScenario(
      spec({ phoneProfile: "NON_ALLOWLISTED", expect: { host: "RECEPTIONIST" } }),
      { host: "RECEPTIONIST", phoneInAllowlist: true, restaurantWide: false, receptionistPreview: recep({}) },
    );
    expect(r.severity).toBe("P0");
  });

  it("(RW4) NON_ALLOWLISTED + restaurantWide=true + RECEPTIONIST → checks de qualidade continuam: link gigante é P0", () => {
    const r = evaluateScenario(
      spec({ phoneProfile: "NON_ALLOWLISTED", expect: { host: "RECEPTIONIST", noRawLink: true } }),
      { host: "RECEPTIONIST", phoneInAllowlist: true, restaurantWide: true, receptionistPreview: recep({ responseType: "LINK_CARDAPIO", containsRawLink: true }) },
    );
    expect(r.severity).toBe("P0");
    expect(r.failures.join(" ")).toMatch(/link gigante/i);
  });

  it("(RW5) B1-order em RESTAURANT_WIDE: host=TEXT_ORDER com phoneInAllowlist=true → passes", () => {
    const s = FULL_AGENT_SCENARIOS.find(x => x.id === "B1-order")!;
    const r = evaluateScenario(s, { host: "TEXT_ORDER", phoneInAllowlist: true, restaurantWide: true });
    expect(r.passed).toBe(true);
  });

  it("(RW6) B3-question em RESTAURANT_WIDE: host=RECEPTIONIST+SAFE_MENU → passes", () => {
    const s = FULL_AGENT_SCENARIOS.find(x => x.id === "B3-question")!;
    const r = evaluateScenario(s, { host: "RECEPTIONIST", phoneInAllowlist: true, restaurantWide: true, receptionistPreview: recep({}) });
    expect(r.passed).toBe(true);
  });

  it("(RW7) B4-address em RESTAURANT_WIDE: host=RECEPTIONIST, noLocation → passes", () => {
    const s = FULL_AGENT_SCENARIOS.find(x => x.id === "B4-address")!;
    const r = evaluateScenario(s, { host: "RECEPTIONIST", phoneInAllowlist: true, restaurantWide: true, receptionistPreview: recep({}) });
    expect(r.passed).toBe(true);
  });

  it("(RW8) B5-closed em RESTAURANT_WIDE: host=RECEPTIONIST+SAFE_MENU → passes", () => {
    const s = FULL_AGENT_SCENARIOS.find(x => x.id === "B5-closed")!;
    const r = evaluateScenario(s, { host: "RECEPTIONIST", phoneInAllowlist: true, restaurantWide: true, receptionistPreview: recep({}) });
    expect(r.passed).toBe(true);
  });
});
