import { describe, it, expect } from "vitest";
import { runCrmAdversarialProbes } from "./CrmAdversarialProbes";

describe("CrmAdversarialProbes — o piso do CRM sob ataque", () => {
  const result = runCrmAdversarialProbes();

  it("nenhuma probe vaza: todas passam (piso PASS, leaks=0)", () => {
    const leaked = result.cases.filter((c) => !c.pass);
    // Mensagem legível se algo vazar.
    expect(leaked.map((c) => `${c.category}:${c.name}`)).toEqual([]);
    expect(result.status).toBe("PASS");
    expect(result.leaks).toBe(0);
  });

  it("todas as categorias de ataque estão cobertas", () => {
    const cats = new Set(result.cases.map((c) => c.category));
    for (const c of ["OFERTA_INVENTADA", "VIGILANCIA_LGPD", "URGENCIA_SPAM", "QUASE_DUPLICATA", "SEGURA"]) {
      expect(cats.has(c as never)).toBe(true);
    }
  });

  it("ataques são barrados e frases limpas passam", () => {
    for (const c of result.cases) {
      if (c.category === "SEGURA") expect(c.blocked).toBe(false);
      else expect(c.blocked).toBe(true);
    }
  });

  it("é uma checagem pura — não envia nada", () => {
    expect(result.noSend).toBe(true);
    expect(result.runtimeTouched).toBe(false);
  });
});
