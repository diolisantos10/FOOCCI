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

/**
 * O checador `non_existent` reprovava o Garçom por acertar.
 *
 * Ele marcava CRÍTICO qualquer card mostrado quando o item pedido não existia —
 * mas o próprio cenário NON_EXISTENT_PRODUCT espera "oferecer alternativa real".
 * Negar e mostrar o que a casa tem era a resposta certa, e virava P0. Foi essa
 * régua que deixou o p0Count travado em 1 na rodada noturna.
 *
 * A régua nova separa as duas coisas: desonestidade é empurrar card SEM dizer
 * que não tem (o cliente lê como "é isto que você pediu"); não negar é falta de
 * comportamento esperado, e vira aviso — inclusive quando o agente se cala.
 */
describe("item que não existe no cardápio", () => {
  const cenario = () => ({
    ...WaiterSimulationAdapter.generateScenarios({ seed: "ne", count: 1, scenarioTypes: ["NON_EXISTENT_PRODUCT"] })[0],
    initialMessage: "vocês têm pizza?",
  });

  const avaliar = (finalMessage: string, cards: string[] = []) =>
    WaiterSimulationAdapter.evaluateScenario(cenario(), {
      transcript: [], finalMessage, cards, mode: "SUGGESTION", optionsCount: 0, usedLLM: false,
    });

  it("REGRESSÃO: negar e oferecer alternativa real passa — era isto que dava P0", () => {
    const e = avaliar("Não temos pizza no cardápio. Que tal essas opções? 👇", ["combo40", "festival"]);
    expect(e.severity, e.evidence.join(" | ")).toBe("INFO");
    expect(e.status).toBe("PASS");
  });

  it("negar sem ter alternativa também passa", () => {
    expect(avaliar("Não encontrei pizza no nosso cardápio. Posso ajudar com outra coisa? 😊").severity).toBe("INFO");
  });

  it("negação escrita pela IA, com outras palavras, também vale", () => {
    for (const frase of [
      "Infelizmente pizza é fora do nosso cardápio.",
      "A gente não trabalha com pizza, mas tem combinado 👇",
      "Não servimos pizza por aqui.",
    ]) {
      expect(avaliar(frase, ["combo40"]).severity, frase).toBe("INFO");
    }
  });

  it("CRÍTICO de verdade: empurra card sem dizer que não tem", () => {
    const e = avaliar("Essas aqui são bem pedidas 👇", ["combo40", "festival"]);
    expect(e.severity).toBe("P0");
    expect(e.evidence.join(" ")).toMatch(/sem dizer que o item não existe/);
  });

  it("silêncio não é resposta honesta — sem negação não há PASS", () => {
    const e = avaliar("");
    expect(e.severity).toBe("P2");      // aviso, não crítico: não enganou ninguém
    expect(e.status).toBe("WARNING");
  });

  it("card fora do catálogo continua P0 — na gaveta dele", () => {
    const e = avaliar("Não temos pizza. Olha essas 👇", ["PRODUTO_FALSO_999"]);
    expect(e.severity).toBe("P0");
    expect(e.evidence.join(" ")).toMatch(/fora do catálogo/);
  });

  it("o motor de verdade, na frase de verdade, não é mais P0", () => {
    const s = cenario();
    return WaiterSimulationAdapter.runScenario(s).then((out) => {
      expect(out.finalMessage).toContain("pizza");
      expect(WaiterSimulationAdapter.evaluateScenario(s, out).severity).toBe("INFO");
    });
  });

  it("todas as frases do cenário passam no motor determinístico", async () => {
    const base = cenario();
    for (const msg of ["vocês têm pizza?", "tem hambúrguer?", "tem lasanha?", "vende açaí?"]) {
      const s = { ...base, initialMessage: msg };
      const out = await WaiterSimulationAdapter.runScenario(s);
      const e = WaiterSimulationAdapter.evaluateScenario(s, out);
      expect(e.severity, `${msg} → "${out.finalMessage}" | ${e.evidence.join(" | ")}`).not.toBe("P0");
    }
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
