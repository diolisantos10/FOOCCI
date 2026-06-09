import { describe, it, expect } from "vitest";
import {
  SIMULATION_SAFE_MODE,
  assertSimulationSafeMode,
  SimulationSafetyError,
} from "./SimulationSafeMode";
import { makeRng, dailySeed } from "./scenarioGenerator";
import { classifyEvaluation, tallySeverities } from "./simulationEvaluator";
import { sanitizeText, sanitizeTranscript } from "./simulationSanitizer";

describe("(P12-core.1) SimulationSafeMode blocks side effects", () => {
  it("passes for the frozen safe mode", () => {
    expect(() => assertSimulationSafeMode(SIMULATION_SAFE_MODE)).not.toThrow();
    expect(SIMULATION_SAFE_MODE.allowSideEffects).toBe(false);
    expect(Object.isFrozen(SIMULATION_SAFE_MODE)).toBe(true);
  });
  it("throws if any unsafe capability is enabled", () => {
    expect(() => assertSimulationSafeMode({ ...SIMULATION_SAFE_MODE, allowPayments: true } as never)).toThrow(SimulationSafetyError);
    expect(() => assertSimulationSafeMode({ ...SIMULATION_SAFE_MODE, allowMessaging: true } as never)).toThrow(SimulationSafetyError);
    expect(() => assertSimulationSafeMode({ ...SIMULATION_SAFE_MODE, allowOrderCreation: true } as never)).toThrow(SimulationSafetyError);
  });
});

describe("(P12-core.2/3) scenario generator: seeded + varied", () => {
  it("same seed → same sequence (reproducible)", () => {
    const a = makeRng("seed-x");
    const b = makeRng("seed-x");
    const seqA = Array.from({ length: 5 }, () => a.int(1000));
    const seqB = Array.from({ length: 5 }, () => b.int(1000));
    expect(seqA).toEqual(seqB);
  });
  it("different seeds → different sequences (variation, not always equal)", () => {
    const a = Array.from({ length: 8 }, (_, i) => makeRng("seed-a").int(1000) + i);
    const b = Array.from({ length: 8 }, (_, i) => makeRng("seed-b").int(1000) + i);
    expect(a).not.toEqual(b);
  });
  it("dailySeed changes across days", () => {
    expect(dailySeed(new Date("2026-06-09"))).not.toBe(dailySeed(new Date("2026-06-10")));
  });
});

describe("(P12-core.4/5) evaluator classification", () => {
  it("critical violation → FAIL/P0", () => {
    const e = classifyEvaluation({ expectedTotal: 2, expectedMet: 2, disallowedViolations: [], criticalViolations: ["produto inventado"] });
    expect(e.status).toBe("FAIL");
    expect(e.severity).toBe("P0");
  });
  it("disallowed behaviour → FAIL/P1", () => {
    const e = classifyEvaluation({ expectedTotal: 2, expectedMet: 2, disallowedViolations: ["empurrou bebida"], criticalViolations: [] });
    expect(e.severity).toBe("P1");
  });
  it("missing expected only → WARNING/P2", () => {
    const e = classifyEvaluation({ expectedTotal: 2, expectedMet: 1, disallowedViolations: [], criticalViolations: [] });
    expect(e.status).toBe("WARNING");
    expect(e.severity).toBe("P2");
  });
  it("all met → PASS/INFO", () => {
    const e = classifyEvaluation({ expectedTotal: 2, expectedMet: 2, disallowedViolations: [], criticalViolations: [] });
    expect(e.status).toBe("PASS");
    expect(e.severity).toBe("INFO");
  });
  it("tallySeverities aggregates", () => {
    const t = tallySeverities([
      { status: "PASS", severity: "INFO", score: 100, summary: "", evidence: [] },
      { status: "FAIL", severity: "P0", score: 0, summary: "", evidence: [] },
      { status: "WARNING", severity: "P2", score: 60, summary: "", evidence: [] },
    ]);
    expect(t).toMatchObject({ passed: 1, warning: 1, failed: 1, p0: 1, p2: 1 });
  });
});

describe("(P12-core.7) sanitizer removes PII/secrets", () => {
  it("strips phone, email and secret-like tokens", () => {
    expect(sanitizeText("ligue (11) 99999-8888")).toContain("[telefone]");
    expect(sanitizeText("email joao@teste.com")).toContain("[email]");
    expect(sanitizeText("token sk_live_abcdefgh123456")).toContain("[secret]");
  });
  it("sanitizes a transcript array", () => {
    const out = sanitizeTranscript([{ role: "customer", content: "meu zap é 11999998888" }]);
    expect(out[0].content).not.toMatch(/11999998888/);
  });
});
