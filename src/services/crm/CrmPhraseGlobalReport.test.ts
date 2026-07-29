import { describe, it, expect } from "vitest";

import {
  agregarFrases,
  MIN_ENVIOS_GLOBAL,
  MIN_RESTAURANTES,
  LIFT_DE_DESTAQUE,
} from "./CrmPhraseGlobalReport";
import { CHAVE_DO_AGENTE } from "./CrmPilotObservability";

type Linha = { variantKey: string | null; restaurantId: string | null; converted: boolean; messageText: string | null };

/** N execuções de uma frase num restaurante, das quais `conv` converteram. */
function linhas(variantKey: string, restaurantId: string, envios: number, conv: number, texto = "oi, tudo bem?"): Linha[] {
  return Array.from({ length: envios }, (_, i) => ({
    variantKey, restaurantId, converted: i < conv, messageText: texto,
  }));
}

describe("a pergunta que só aparece de cima", () => {
  it("frase boa em várias casas vira destaque", () => {
    const r = agregarFrases([
      ...linhas("mf_a", "r1", 100, 30),
      ...linhas("mf_a", "r2", 100, 28),
      ...linhas("mf_b", "r1", 100, 5),
      ...linhas("mf_b", "r2", 100, 5),
    ]);
    const destaque = r.destaques.find((f) => f.variantKey === "mf_a");
    expect(destaque).toBeDefined();
    expect(destaque?.restaurantes).toBe(2);
    expect(destaque?.liftVsRede).toBeGreaterThanOrEqual(LIFT_DE_DESTAQUE);
  });

  it("frase boa numa casa só NÃO vira padrão", () => {
    const r = agregarFrases([
      ...linhas("mf_sorte", "r1", 200, 90),
      ...linhas("mf_comum", "r2", 200, 20),
      ...linhas("mf_comum", "r3", 200, 20),
    ]);
    expect(r.destaques.map((f) => f.variantKey)).not.toContain("mf_sorte");
    expect(r.frases.find((f) => f.variantKey === "mf_sorte")?.restaurantes).toBe(1);
  });

  it("frase sem amostra suficiente nem entra na lista", () => {
    const r = agregarFrases([
      ...linhas("mf_pouco", "r1", MIN_ENVIOS_GLOBAL - 1, 20),
      ...linhas("mf_ok", "r1", MIN_ENVIOS_GLOBAL, 5),
    ]);
    expect(r.frases.map((f) => f.variantKey)).toEqual(["mf_ok"]);
  });

  it("é preciso rodar em MIN_RESTAURANTES casas para destacar", () => {
    const casas = Array.from({ length: MIN_RESTAURANTES }, (_, i) => linhas("mf_x", `r${i}`, 100, 40)).flat();
    const r = agregarFrases([...casas, ...linhas("mf_media", "rz", 400, 40)]);
    expect(r.destaques.map((f) => f.variantKey)).toContain("mf_x");
  });
});

describe("a régua é a média da rede", () => {
  it("a taxa da rede sai de todos os envios", () => {
    const r = agregarFrases([...linhas("mf_a", "r1", 100, 20), ...linhas("mf_b", "r2", 100, 40)]);
    expect(r.taxaDaRede).toBeCloseTo(0.3, 4);
    expect(r.enviosTotais).toBe(200);
    expect(r.conversoesTotais).toBe(60);
  });

  it("o lift é relativo à rede, não à campanha", () => {
    const r = agregarFrases([...linhas("mf_a", "r1", 100, 60), ...linhas("mf_a", "r2", 100, 60), ...linhas("mf_b", "r3", 200, 20)]);
    const a = r.frases.find((f) => f.variantKey === "mf_a");
    expect(a?.liftVsRede).toBeGreaterThan(1);
  });

  it("as frases saem ordenadas da melhor pra pior", () => {
    const r = agregarFrases([
      ...linhas("mf_ruim", "r1", 100, 5),
      ...linhas("mf_boa", "r1", 100, 50),
      ...linhas("mf_media", "r1", 100, 25),
    ]);
    expect(r.frases.map((f) => f.variantKey)).toEqual(["mf_boa", "mf_media", "mf_ruim"]);
  });
});

describe("o agente não é um template", () => {
  it("a mensagem do agente aparece, mas nunca como padrão a copiar", () => {
    const r = agregarFrases([
      ...linhas(CHAVE_DO_AGENTE, "r1", 200, 80),
      ...linhas(CHAVE_DO_AGENTE, "r2", 200, 80),
      ...linhas("mf_x", "r3", 400, 20),
    ]);
    const agente = r.frases.find((f) => f.variantKey === CHAVE_DO_AGENTE);
    expect(agente?.doAgente).toBe(true);
    expect(agente?.destaque).toBe(false);
    expect(r.destaques.map((f) => f.variantKey)).not.toContain(CHAVE_DO_AGENTE);
  });
});

describe("bordas", () => {
  it("sem execução nenhuma não quebra", () => {
    const r = agregarFrases([]);
    expect(r.ok).toBe(true);
    expect(r.taxaDaRede).toBe(0);
    expect(r.leitura).toMatch(/Nenhum envio medido/i);
  });

  it("execução sem variantKey é ignorada, não conta como frase", () => {
    const r = agregarFrases([
      { variantKey: null, restaurantId: "r1", converted: true, messageText: "x" },
      ...linhas("mf_a", "r1", MIN_ENVIOS_GLOBAL, 10),
    ]);
    expect(r.enviosTotais).toBe(MIN_ENVIOS_GLOBAL);
    expect(r.frasesMedidas).toBe(1);
  });

  it("sem destaque, a leitura diz que não há o que copiar", () => {
    const r = agregarFrases(linhas("mf_a", "r1", 100, 10));
    expect(r.destaques).toHaveLength(0);
    expect(r.leitura).toMatch(/não há o que copiar/i);
  });

  it("a varredura truncada é declarada, não escondida", () => {
    expect(agregarFrases(linhas("mf_a", "r1", 100, 10), true).truncado).toBe(true);
  });

  it("o relatório nunca escreve nada", () => {
    expect(agregarFrases([]).runtimeTouched).toBe(false);
  });
});
