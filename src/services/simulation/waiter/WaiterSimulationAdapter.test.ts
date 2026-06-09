import { describe, it, expect } from "vitest";
import { WaiterSimulationAdapter } from "./WaiterSimulationAdapter";
import { runSimulation } from "../AgentSimulationService";
import { waiterSyntheticCatalog } from "./waiterSyntheticCatalog";

const catalogIds = new Set(waiterSyntheticCatalog().map((i) => i.id));

describe("WaiterSimulationAdapter — scenario generation", () => {
  it("(P12-waiter.1/2/3) generates varied scenarios incl. indecisive/restriction/group", () => {
    const scenarios = WaiterSimulationAdapter.generateScenarios({ seed: "test-1", count: 12 });
    expect(scenarios.length).toBe(12);
    const types = new Set(scenarios.map((s) => s.scenarioType));
    expect(types.has("INDECISIVE_CUSTOMER")).toBe(true);
    expect(types.has("DIETARY_RESTRICTION")).toBe(true);
    expect(types.has("GROUP_CUSTOMER")).toBe(true);
    // every scenario has persona/goal/message/expected/disallowed
    for (const s of scenarios) {
      expect(s.persona.length).toBeGreaterThan(0);
      expect(s.initialMessage.length).toBeGreaterThan(0);
      expect(s.expectedBehaviors.length).toBeGreaterThan(0);
      expect(s.disallowedBehaviors.length).toBeGreaterThan(0);
    }
  });

  it("same seed reproduces the same phrasing; different seed varies it", () => {
    const a = WaiterSimulationAdapter.generateScenarios({ seed: "s", count: 6 }).map((x) => x.initialMessage);
    const b = WaiterSimulationAdapter.generateScenarios({ seed: "s", count: 6 }).map((x) => x.initialMessage);
    const c = WaiterSimulationAdapter.generateScenarios({ seed: "other", count: 6 }).map((x) => x.initialMessage);
    expect(a).toEqual(b);
    expect(a).not.toEqual(c);
  });
});

describe("WaiterSimulationAdapter — running scenarios (deterministic, no LLM)", () => {
  it("(P12-waiter.4/5/6/7) runs without LLM/side-effects and returns a transcript", async () => {
    const [scenario] = WaiterSimulationAdapter.generateScenarios({ seed: "rec", count: 1, scenarioTypes: ["RECOMMENDATION_REQUEST"] });
    const out = await WaiterSimulationAdapter.runScenario(scenario);
    expect(out.usedLLM).toBe(false);
    expect(out.transcript.length).toBe(2);
    expect(out.transcript[0].role).toBe("customer");
    expect(out.transcript[1].role).toBe("agent");
    // any card returned must be a REAL catalog id (no hallucination)
    for (const id of out.cards) expect(catalogIds.has(id)).toBe(true);
  });

  it("flags a fabricated card as a P0 critical (anti-hallucination)", () => {
    const scenario = WaiterSimulationAdapter.generateScenarios({ seed: "x", count: 1, scenarioTypes: ["RECOMMENDATION_REQUEST"] })[0];
    const evaluation = WaiterSimulationAdapter.evaluateScenario(scenario, {
      transcript: [], finalMessage: "claro!", cards: ["PRODUTO_FALSO_999"], mode: "SUGGEST", optionsCount: 0, usedLLM: false,
    });
    expect(evaluation.status).toBe("FAIL");
    expect(evaluation.severity).toBe("P0");
  });

  it("flags a fabricated price as a P0 critical", () => {
    const scenario = WaiterSimulationAdapter.generateScenarios({ seed: "x", count: 1, scenarioTypes: ["BUDGET_CUSTOMER"] })[0];
    const evaluation = WaiterSimulationAdapter.evaluateScenario(scenario, {
      transcript: [], finalMessage: "esse sai por R$ 999,99", cards: [], mode: "SUGGEST", optionsCount: 0, usedLLM: false,
    });
    expect(evaluation.severity).toBe("P0");
  });

  it("(P12-waiter.8) builds opportunities for non-PASS scenarios (PENDING_REVIEW)", () => {
    const scenario = WaiterSimulationAdapter.generateScenarios({ seed: "x", count: 1, scenarioTypes: ["RECOMMENDATION_REQUEST"] })[0];
    const evaluated = {
      scenario,
      output: { transcript: [], finalMessage: "x", cards: ["FAKE"], mode: "SUGGEST", optionsCount: 0, usedLLM: false },
      evaluation: WaiterSimulationAdapter.evaluateScenario(scenario, { transcript: [], finalMessage: "x", cards: ["FAKE"], mode: "SUGGEST", optionsCount: 0, usedLLM: false }),
    };
    const opps = WaiterSimulationAdapter.buildOpportunities(evaluated);
    expect(opps.length).toBeGreaterThan(0);
    expect(opps[0].status).toBe("PENDING_REVIEW");
    expect(opps[0].type).toBe("BUG"); // P0 → BUG
  });
});

describe("AgentSimulationService — end-to-end with the Waiter adapter", () => {
  it("runs a full simulation, dry-run, runtimeTouched false", async () => {
    const result = await runSimulation(WaiterSimulationAdapter, { seed: "e2e", scenarioCount: 12 });
    expect(result.runtimeTouched).toBe(false);
    expect(result.driver).toBe("SERVICE");
    expect(result.scenariosTotal).toBe(12);
    expect(result.status).toBe("COMPLETED");
    // counts add up
    expect(result.scenariosPassed + result.scenariosWarning + result.scenariosFailed).toBe(12);
    // no fabricated card across the whole run (real engine must not hallucinate)
    for (const s of result.scenarios) {
      for (const id of s.output.cards) expect(catalogIds.has(id)).toBe(true);
    }
    // zero P0 on the real deterministic engine
    expect(result.p0Count).toBe(0);
  });
});
