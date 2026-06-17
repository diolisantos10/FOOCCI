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
});

describe("computeSummary — recomendação operacional", () => {
  const pass = (sev: ScenarioResult["severity"]): ScenarioResult =>
    ({ id: "x", name: "x", phoneProfile: "NON_ALLOWLISTED", host: "RECEPTIONIST", passed: sev === "OK", failures: [], severity: sev });

  it("(8) segurança violada → ROLLBACK_OR_PAUSE", () => {
    const s = computeSummary([pass("OK")], { ...SAFE, noRealPix: false }, false);
    expect(s.recommendation).toBe("ROLLBACK_OR_PAUSE");
    expect(s.status).toBe("FAIL");
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
