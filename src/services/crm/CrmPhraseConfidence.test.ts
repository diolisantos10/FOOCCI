import { describe, it, expect } from "vitest";
import { computePhraseConfidence } from "./CrmPhraseConfidence";
import { MIN_SENDS_TO_JUDGE_PHRASE, MIN_CAMPAIGN_SENDS_TO_OPTIMIZE } from "./CrmPhraseSelector";

describe("CrmPhraseConfidence — selo de confiança por frase", () => {
  it("sem envios → tier 'none' (mantém 'sem envios ainda', nenhum selo)", () => {
    const { byKey } = computePhraseConfidence([{ key: "a", sent: 0, converted: 0 }]);
    expect(byKey.a.tier).toBe("none");
    expect(byKey.a.underTest).toBe(false);
    expect(byKey.a.champion).toBe(false);
  });

  it("com envios mas amostra pequena → 'under-test'", () => {
    const { byKey } = computePhraseConfidence([
      { key: "a", sent: MIN_SENDS_TO_JUDGE_PHRASE - 1, converted: 5 },
    ]);
    expect(byKey.a.tier).toBe("under-test");
    expect(byKey.a.underTest).toBe(true);
  });

  it("amostra suficiente, sem ser campeã → 'reliable'", () => {
    const { byKey } = computePhraseConfidence([
      { key: "a", sent: MIN_SENDS_TO_JUDGE_PHRASE, converted: 3 },
      { key: "b", sent: MIN_SENDS_TO_JUDGE_PHRASE, converted: 3 }, // taxas iguais → ninguém 1.4×
    ]);
    expect(byKey.a.tier).toBe("reliable");
    expect(byKey.a.underTest).toBe(false);
    expect(byKey.a.champion).toBe(false);
  });

  it("mesma régua do detector: só é campeã com ≥30 envios E ≥1.4× a média", () => {
    const { byKey } = computePhraseConfidence([
      { key: "campea", sent: 100, converted: 30 }, // ~30%
      { key: "fraca", sent: 100, converted: 3 },   // ~3%
    ]);
    expect(byKey.campea.tier).toBe("champion");
    expect(byKey.campea.champion).toBe(true);
    expect(byKey.fraca.tier).toBe("reliable");
  });

  it("NÃO é campeã com taxa alta mas amostra pequena (protege leitura precoce)", () => {
    const { byKey } = computePhraseConfidence([
      { key: "sortuda", sent: 5, converted: 5 },   // 100% mas só 5 envios
      { key: "solida", sent: 100, converted: 20 },
    ]);
    expect(byKey.sortuda.tier).toBe("under-test");
    expect(byKey.sortuda.champion).toBe(false);
  });

  it("precisa de ≥2 frases medidas p/ haver campeã", () => {
    const { byKey } = computePhraseConfidence([{ key: "sozinha", sent: 100, converted: 40 }]);
    expect(byKey.sozinha.champion).toBe(false);
    expect(byKey.sozinha.tier).toBe("reliable");
  });

  it("baseline da campanha reflete o total de envios", () => {
    const abaixo = computePhraseConfidence([
      { key: "a", sent: 10, converted: 1 },
      { key: "b", sent: 10, converted: 1 },
    ]);
    expect(abaixo.campaign.totalSent).toBe(20);
    expect(abaixo.campaign.baselineReached).toBe(false);

    const acima = computePhraseConfidence([
      { key: "a", sent: MIN_CAMPAIGN_SENDS_TO_OPTIMIZE, converted: 10 },
    ]);
    expect(acima.campaign.baselineReached).toBe(true);
  });
});
