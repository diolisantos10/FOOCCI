import { describe, it, expect } from "vitest";
import {
  DEPARTAMENTOS,
  DEPARTAMENTOS_APOSENTADOS,
  CARGOS_DE_DIRECAO,
  departamentoPorSlug,
  departamentoPorNumero,
} from "./departamentosCanonicos";

/**
 * A PLANTA OFICIAL, CONFERIDA POR CÓDIGO.
 *
 * O CEO corrigiu a estrutura em 25/08/2026: de 9 departamentos para 6, sem
 * marketing e sem Gerente Geral. Os critérios de aceite dele viram teste aqui —
 * critério verificado por leitura humana é critério que vale até a próxima
 * revisão distraída.
 */

describe("os 6 departamentos oficiais", () => {
  it("são exatamente 6 — nem 5, nem 7", () => {
    expect(DEPARTAMENTOS).toHaveLength(6);
  });

  it("são numerados de 1 a 6, sem buraco e sem repetição", () => {
    expect(DEPARTAMENTOS.map((d) => d.numero)).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it("todo slug é único", () => {
    expect(new Set(DEPARTAMENTOS.map((d) => d.slug)).size).toBe(DEPARTAMENTOS.length);
  });

  it("todo departamento tem missão escrita", () => {
    // Departamento sem missão é caixa no organograma. A missão responde "para
    // que este departamento existe" sem precisar perguntar a alguém.
    for (const d of DEPARTAMENTOS) {
      expect(d.missao.length, d.nome).toBeGreaterThan(20);
    }
  });

  it("nenhum é de marketing, growth ou aquisição", () => {
    // Ordem expressa do CEO: a aquisição é executada pela Dioli. Um departamento
    // aqui dentro produziria dois times fazendo a mesma coisa e brigando pelo
    // mesmo número.
    const proibido = /marketing|growth|social|m[íi]dia|aquisi/i;
    for (const d of DEPARTAMENTOS) {
      expect(proibido.test(d.nome), d.nome).toBe(false);
      expect(proibido.test(d.missao), `missão de ${d.nome}`).toBe(false);
    }
  });

  it("busca por slug e por número encontram o mesmo departamento", () => {
    for (const d of DEPARTAMENTOS) {
      expect(departamentoPorSlug(d.slug)).toEqual(d);
      expect(departamentoPorNumero(d.numero)).toEqual(d);
    }
  });

  it("busca por algo que não existe devolve undefined, não o primeiro da lista", () => {
    // A metade que reprova: um `find` trocado por `[0]` passaria em tudo acima.
    expect(departamentoPorSlug("marketing")).toBeUndefined();
    expect(departamentoPorNumero(9)).toBeUndefined();
  });
});

describe("os departamentos que saíram da planta", () => {
  it("estão nomeados, com o motivo junto", () => {
    // A lista existe para o seed poder desativá-los em bancos que rodaram a v1 —
    // e para que ninguém proponha recriá-los daqui a três meses sem saber que
    // saíram por decisão do CEO.
    expect(DEPARTAMENTOS_APOSENTADOS.length).toBeGreaterThan(0);
    for (const a of DEPARTAMENTOS_APOSENTADOS) {
      expect(a.motivo.length, a.slug).toBeGreaterThan(10);
    }
  });

  it("nenhum aposentado voltou para a lista oficial", () => {
    const oficiais = new Set(DEPARTAMENTOS.map((d) => d.slug));
    for (const a of DEPARTAMENTOS_APOSENTADOS) {
      expect(oficiais.has(a.slug), `"${a.slug}" está nas duas listas`).toBe(false);
    }
  });

  it("marketing está entre os aposentados, com o motivo certo", () => {
    const marketing = DEPARTAMENTOS_APOSENTADOS.find((a) => a.slug === "marketing");
    expect(marketing).toBeDefined();
    expect(marketing!.motivo).toContain("Dioli");
  });
});

describe("os cargos de direção", () => {
  it("são dois: o CEO e o Diretor da Foocci", () => {
    expect(CARGOS_DE_DIRECAO.map((c) => c.slug)).toEqual(["ceo", "diretor-foocci"]);
  });

  it("o CEO não reporta a ninguém; o Diretor reporta ao CEO", () => {
    const ceo = CARGOS_DE_DIRECAO.find((c) => c.slug === "ceo")!;
    const diretor = CARGOS_DE_DIRECAO.find((c) => c.slug === "diretor-foocci")!;

    expect(ceo.reportaA).toBeUndefined();
    expect(diretor.reportaA).toBe("ceo");
  });

  it("NÃO existe cargo de Gerente Geral", () => {
    // Regra 10: o Diretor da Foocci já ocupa essa camada. O cargo criaria um
    // degrau a mais entre o Diretor e os Agentes Gerentes, sem ninguém para
    // ocupá-lo.
    for (const c of CARGOS_DE_DIRECAO) {
      expect(/gerente.geral/i.test(c.slug), c.slug).toBe(false);
      expect(/gerente.geral/i.test(c.titulo), c.titulo).toBe(false);
    }
  });

  it("nenhum cargo de direção pertence a departamento", () => {
    // CEO e Diretor estão ACIMA dos departamentos. Prendê-los a um faria o
    // escopo deles virar o de uma área só.
    for (const c of CARGOS_DE_DIRECAO) {
      expect(c.departamento).toBeUndefined();
    }
  });
});
