import { describe, it, expect } from "vitest";
import {
  selectPhraseWeights,
  pickWeighted,
  MIN_CAMPAIGN_SENDS_TO_OPTIMIZE,
  EXPLORATION_FLOOR,
} from "./CrmPhraseSelector";

describe("CrmPhraseSelector — seleção paciente das frases vencedoras", () => {
  it("PACIÊNCIA: com poucos dados, mantém exploração uniforme (não favorece ninguém)", () => {
    const sel = selectPhraseWeights(
      ["a", "b", "c"],
      [
        { key: "a", sent: 10, converted: 5 }, // taxa alta, mas amostra pequena
        { key: "b", sent: 10, converted: 0 },
        { key: "c", sent: 10, converted: 0 },
      ],
    );
    expect(sel.mode).toBe("EXPLORING");
    // todos iguais — ninguém é favorecido ainda
    const w = sel.weights.map((x) => x.weight);
    expect(Math.max(...w) - Math.min(...w)).toBeLessThan(1e-9);
    expect(sel.reason).toMatch(/baseline/);
  });

  it("OTIMIZA só depois de dados de sobra, favorecendo a que converte mais", () => {
    const big = MIN_CAMPAIGN_SENDS_TO_OPTIMIZE;
    const sel = selectPhraseWeights(
      ["vencedora", "fraca"],
      [
        { key: "vencedora", sent: big, converted: Math.round(big * 0.2) }, // 20%
        { key: "fraca", sent: big, converted: Math.round(big * 0.02) }, // 2%
      ],
    );
    expect(sel.mode).toBe("OPTIMIZING");
    const win = sel.weights.find((w) => w.key === "vencedora")!;
    const weak = sel.weights.find((w) => w.key === "fraca")!;
    expect(win.weight).toBeGreaterThan(weak.weight);
  });

  it("PISO DE EXPLORAÇÃO: nem a pior frase morre — mantém fatia mínima", () => {
    const big = MIN_CAMPAIGN_SENDS_TO_OPTIMIZE;
    const sel = selectPhraseWeights(
      ["otima", "pessima"],
      [
        { key: "otima", sent: big, converted: big }, // 100%
        { key: "pessima", sent: big, converted: 0 }, // 0%
      ],
    );
    const pessima = sel.weights.find((w) => w.key === "pessima")!;
    const floorShare = EXPLORATION_FLOOR / 2;
    expect(pessima.weight).toBeGreaterThanOrEqual(floorShare - 1e-9);
  });

  it("frase recém-aprovada (pouca amostra) não é punida — entra com a média p/ ganhar dados", () => {
    const big = MIN_CAMPAIGN_SENDS_TO_OPTIMIZE;
    const sel = selectPhraseWeights(
      ["madura", "desafiante"],
      [
        { key: "madura", sent: big, converted: Math.round(big * 0.1) },
        { key: "desafiante", sent: 3, converted: 0 }, // recém-entrou, quase sem dados
      ],
    );
    const desafiante = sel.weights.find((w) => w.key === "desafiante")!;
    expect(desafiante.underTest).toBe(true);
    expect(desafiante.weight).toBeGreaterThan(0.05); // recebe fatia real, não é starve
  });

  it("pickWeighted respeita os pesos (determinístico com RNG injetado)", () => {
    const weights = [
      { key: "a", weight: 0.7, rate: 0.2, underTest: false },
      { key: "b", weight: 0.3, rate: 0.05, underTest: false },
    ];
    expect(pickWeighted(weights, 0.1)).toBe("a"); // cai na fatia de 'a'
    expect(pickWeighted(weights, 0.9)).toBe("b"); // cai na fatia de 'b'
  });

  it("uma frase só → exploração trivial, peso total 1", () => {
    const sel = selectPhraseWeights(["unica"], [{ key: "unica", sent: 500, converted: 100 }]);
    expect(sel.mode).toBe("EXPLORING");
    expect(sel.weights[0].weight).toBeCloseTo(1, 6);
  });
});
