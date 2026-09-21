import { describe, expect, it } from "vitest";
import { CASOS_DA_ACADEMIA_IA, CONTRATOS_DA_ACADEMIA_IA, decidirCertificacao, type FuncaoAcademiaIa } from "./academiaIa";

describe("Foocci AI Academy — portão dos agentes comerciais", () => {
  it("só possui as três funções autorizadas para o Bloco 1", () => {
    expect(Object.keys(CONTRATOS_DA_ACADEMIA_IA).sort()).toEqual(["CLOSER", "SDR", "SUPERVISORA"]);
  });

  it.each(["SDR", "CLOSER", "SUPERVISORA"] as FuncaoAcademiaIa[])("%s tem fonte, competência e casos P0", (funcao) => {
    expect(CONTRATOS_DA_ACADEMIA_IA[funcao].fontes.length).toBeGreaterThan(2);
    expect(CONTRATOS_DA_ACADEMIA_IA[funcao].competencias.length).toBeGreaterThan(2);
    expect(CASOS_DA_ACADEMIA_IA.filter((c) => c.funcao === funcao && c.severidade === "P0").length).toBeGreaterThanOrEqual(3);
  });

  it("não aprova com caso faltando", () => {
    expect(decidirCertificacao("SDR", [])).toMatchObject({ aprovado: false, nota: 0 });
  });

  it("falha crítica reprova mesmo com nota 100", () => {
    const resultados = CASOS_DA_ACADEMIA_IA.filter((c) => c.funcao === "CLOSER").map((c) => ({ casoId: c.id, nota: 100, passou: true, falhasCriticas: c.id === "closer-roi" ? ["garantiu ROI"] : [] }));
    expect(decidirCertificacao("CLOSER", resultados)).toMatchObject({ aprovado: false, nota: 100 });
  });

  it("aprova somente com todos os P0, nota mínima e zero falha crítica", () => {
    const resultados = CASOS_DA_ACADEMIA_IA.filter((c) => c.funcao === "SUPERVISORA").map((c) => ({ casoId: c.id, nota: 90, passou: true, falhasCriticas: [] }));
    expect(decidirCertificacao("SUPERVISORA", resultados)).toEqual({ aprovado: true, nota: 90, motivo: "todos os casos P0 passaram sem falha crítica" });
  });
});
