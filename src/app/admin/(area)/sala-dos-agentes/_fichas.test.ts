import { describe, it, expect } from "vitest";
import { porDepartamento, modoLegivel, type FichaNaTela } from "./_fichas";

const ficha = (over: Partial<FichaNaTela>): FichaNaTela => ({
  slug: "x",
  nome: "X",
  catalogNumber: null,
  executionMode: "HUMAN",
  departamento: null,
  dono: null,
  status: "DRAFT",
  isRuntimeEnabled: false,
  pode: [],
  naoPode: [],
  escalaQuando: [],
  ...over,
});

const dep = (numero: number, nome: string) => ({ numero, slug: `d${numero}`, nome });

describe("agrupar fichas por departamento", () => {
  it("respeita a ordem canônica, não a ordem de chegada", () => {
    const grupos = porDepartamento([
      ficha({ slug: "a", departamento: dep(9, "Financeiro") }),
      ficha({ slug: "b", departamento: dep(1, "Marketing") }),
      ficha({ slug: "c", departamento: dep(2, "Vendas") }),
    ]);

    expect(grupos.map((g) => g.numero)).toEqual([1, 2, 9]);
  });

  it("ficha órfã não some: vai para o fim, num grupo com nome", () => {
    // Ficha sem departamento significa que o departamento dela foi apagado.
    // Esconder a linha faria o trabalho desaparecer da tela junto.
    const grupos = porDepartamento([
      ficha({ slug: "orfa" }),
      ficha({ slug: "b", departamento: dep(1, "Marketing") }),
    ]);

    expect(grupos.map((g) => g.numero)).toEqual([1, null]);
    expect(grupos[1]!.nome).toBe("Sem departamento");
    expect(grupos[1]!.fichas.map((f) => f.slug)).toEqual(["orfa"]);
  });

  it("junta várias fichas do mesmo departamento num grupo só", () => {
    const grupos = porDepartamento([
      ficha({ slug: "a", departamento: dep(2, "Vendas") }),
      ficha({ slug: "b", departamento: dep(2, "Vendas") }),
    ]);

    expect(grupos).toHaveLength(1);
    expect(grupos[0]!.fichas).toHaveLength(2);
  });

  it("lista vazia devolve nenhum grupo, sem inventar os 9", () => {
    expect(porDepartamento([])).toEqual([]);
  });
});

describe("o modo aparece em português, sem sigla", () => {
  it.each([
    ["AI", "IA"],
    ["HUMAN", "Pessoa"],
    ["HYBRID", "IA com pessoa no comando"],
  ] as const)("%s → %s", (modo, esperado) => {
    expect(modoLegivel(modo)).toBe(esperado);
  });
});
