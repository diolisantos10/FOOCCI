import { describe, it, expect } from "vitest";

import {
  compararBracos,
  zDeDuasProporcoes,
  MIN_POR_BRACO,
  Z_CRITICO,
} from "./CrmPilotObservability";

function braco(envios: number, conversoes: number) {
  return { envios, conversoes, taxa: envios > 0 ? conversoes / envios : 0 };
}

describe("paciência — diferença com pouca amostra não é resultado", () => {
  it("8 contra 6 não conclui nada", () => {
    const c = compararBracos(braco(20, 8), braco(20, 6));
    expect(c.veredito).toBe("AMOSTRA_INSUFICIENTE");
    expect(c.z).toBeNull();
  });

  it("diz quantos envios faltam em cada braço", () => {
    const c = compararBracos(braco(30, 5), braco(90, 10));
    expect(c.leitura).toContain(`${MIN_POR_BRACO - 30}`);
    expect(c.leitura).toContain(`${MIN_POR_BRACO - 90}`);
  });

  it("um braço zerado não vira vitória do outro", () => {
    const c = compararBracos(braco(0, 0), braco(500, 50));
    expect(c.veredito).toBe("AMOSTRA_INSUFICIENTE");
  });

  it("amostra grande sem nenhuma conversão não conclui", () => {
    const c = compararBracos(braco(500, 0), braco(500, 0));
    expect(c.veredito).toBe("AMOSTRA_INSUFICIENTE");
    expect(c.leitura).toMatch(/conversão nenhuma/i);
  });
});

describe("o veredito quando a amostra sustenta", () => {
  it("agente muito melhor é reconhecido", () => {
    const c = compararBracos(braco(1000, 150), braco(1000, 80));
    expect(c.veredito).toBe("AGENTE_MELHOR");
    expect(c.z).toBeGreaterThan(Z_CRITICO);
    expect(c.liftPct).toBeGreaterThan(50);
  });

  it("controle melhor é dito com todas as letras — e manda investigar", () => {
    const c = compararBracos(braco(1000, 60), braco(1000, 140));
    expect(c.veredito).toBe("CONTROLE_MELHOR");
    expect(c.leitura).toMatch(/Não promova/i);
  });

  it("diferença pequena com amostra grande é empate técnico", () => {
    const c = compararBracos(braco(1000, 100), braco(1000, 104));
    expect(c.veredito).toBe("EMPATE");
    expect(c.leitura).toMatch(/acaso/i);
  });

  it("o lift é relativo ao controle", () => {
    const c = compararBracos(braco(1000, 200), braco(1000, 100));
    expect(c.liftPct).toBeCloseTo(100, 0);
  });

  it("controle sem conversão não gera lift infinito", () => {
    const c = compararBracos(braco(500, 50), braco(500, 0));
    expect(c.liftPct).toBeNull();
  });
});

describe("o teste z", () => {
  it("é simétrico ao inverter os braços", () => {
    const a = braco(1000, 150), b = braco(1000, 80);
    expect(zDeDuasProporcoes(a, b)).toBeCloseTo(-(zDeDuasProporcoes(b, a) ?? 0), 6);
  });

  it("taxas idênticas dão z zero", () => {
    expect(zDeDuasProporcoes(braco(500, 50), braco(500, 50))).toBeCloseTo(0, 6);
  });

  it("braço vazio devolve null em vez de NaN", () => {
    expect(zDeDuasProporcoes(braco(0, 0), braco(100, 10))).toBeNull();
  });

  it("conversão de 100% nos dois lados devolve null em vez de dividir por zero", () => {
    expect(zDeDuasProporcoes(braco(100, 100), braco(100, 100))).toBeNull();
  });

  it("mais amostra com a mesma diferença dá mais confiança", () => {
    const pequeno = zDeDuasProporcoes(braco(200, 30), braco(200, 20)) ?? 0;
    const grande  = zDeDuasProporcoes(braco(2000, 300), braco(2000, 200)) ?? 0;
    expect(grande).toBeGreaterThan(pequeno);
  });
});
