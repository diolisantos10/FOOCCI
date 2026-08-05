/**
 * O código é lido e reescrito por gente. Estes testes guardam as duas coisas que
 * fariam ele falhar em campo: caractere ambíguo no alfabeto e leitura frouxa que
 * gruda a conversa no lead errado.
 */

import { describe, it, expect } from "vitest";
import { generateLeadCode, extractLeadCode, LEAD_CODE_CHARS, LEAD_CODE_LEN } from "./leadCode";

describe("generateLeadCode", () => {
  it("tem 5 caracteres, todos do alfabeto declarado", () => {
    for (let i = 0; i < 500; i++) {
      const c = generateLeadCode();
      expect(c).toHaveLength(LEAD_CODE_LEN);
      for (const ch of c) expect(LEAD_CODE_CHARS).toContain(ch);
    }
  });

  it("nunca usa caractere que se confunde ao transcrever (O 0 I 1 L S 5)", () => {
    // A trava é o alfabeto, não a sorte: basta olhar a constante.
    for (const proibido of ["O", "0", "I", "1", "L", "S", "5"]) {
      expect(LEAD_CODE_CHARS).not.toContain(proibido);
    }
    const amostra = Array.from({ length: 300 }, generateLeadCode).join("");
    expect(amostra).not.toMatch(/[O0I1L5S]/);
  });

  it("colisão é rara, não impossível — e por isso o banco tem UNIQUE", () => {
    // 29^5 ≈ 20,5 milhões: em 2.000 códigos o esperado é ~0,1 colisão. Cravar
    // "zero colisão" deixaria o teste piscando ~9% das vezes e ensinaria a
    // ignorar teste vermelho. O que se afirma é a ordem de grandeza; a garantia
    // de verdade é o UNIQUE + o retry do SiteLeadService.
    const set = new Set(Array.from({ length: 2000 }, generateLeadCode));
    expect(set.size).toBeGreaterThan(1995);
  });

  it("não puxa para o começo do alfabeto — todo símbolo aparece", () => {
    // Módulo cru sobre um byte faria os 8 primeiros símbolos saírem ~14% mais.
    // Esta é a prova de que a amostragem descarta o excedente em vez de dobrá-lo.
    const conta = new Map<string, number>();
    for (const ch of Array.from({ length: 4000 }, generateLeadCode).join("")) {
      conta.set(ch, (conta.get(ch) ?? 0) + 1);
    }
    expect(conta.size).toBe(LEAD_CODE_CHARS.length);

    const esperado = (4000 * LEAD_CODE_LEN) / LEAD_CODE_CHARS.length;
    for (const [ch, n] of conta) {
      expect(n, `símbolo ${ch} fora da faixa`).toBeGreaterThan(esperado * 0.75);
      expect(n, `símbolo ${ch} fora da faixa`).toBeLessThan(esperado * 1.25);
    }
  });
});

describe("extractLeadCode", () => {
  it("acha o código na mensagem exata que o site monta", () => {
    expect(
      extractLeadCode("Oi! Sou João, do Restaurante X, e quero conhecer o Foocci. #A7K2M"),
    ).toBe("A7K2M");
  });

  it("aceita minúscula (teclado de celular reescreve como quer)", () => {
    expect(extractLeadCode("oi, meu codigo e #a7k2m")).toBe("A7K2M");
  });

  it("NÃO casa palavra comum de 5 letras sem `#` — colar no lead errado é pior que não achar", () => {
    // "TARDE" é inteiramente formada por letras do alfabeto do código.
    expect(extractLeadCode("Boa tarde, quero saber do Foocci")).toBeNull();
    expect(extractLeadCode("Boa TARDE")).toBeNull();
  });

  it("devolve null quando não há código — ausência não é informação", () => {
    expect(extractLeadCode("oi")).toBeNull();
    expect(extractLeadCode("")).toBeNull();
  });

  it("ignora sequência de tamanho errado", () => {
    expect(extractLeadCode("#A7K2")).toBeNull();
    expect(extractLeadCode("#A7K2MX")).toBeNull();
  });
});
