import { describe, it, expect } from "vitest";
import { DEPARTAMENTOS, CARGOS, departamentoPorSlug } from "./departamentosCanonicos";

describe("os 9 departamentos canônicos", () => {
  it("são exatamente nove", () => {
    expect(DEPARTAMENTOS).toHaveLength(9);
  });

  it("numeram de 1 a 9, sem buraco e sem repetição", () => {
    const numeros = DEPARTAMENTOS.map((d) => d.numero).sort((a, b) => a - b);
    expect(numeros).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
  });

  it("têm slug único", () => {
    expect(new Set(DEPARTAMENTOS.map((d) => d.slug)).size).toBe(9);
  });

  it("todo departamento declara missão — departamento sem missão não tem fila nem dono", () => {
    for (const d of DEPARTAMENTOS) {
      expect(d.missao.length, `${d.slug} sem missão`).toBeGreaterThan(15);
    }
  });

  it("a ordem canônica bate com o plano mestre", () => {
    expect(DEPARTAMENTOS.map((d) => d.slug)).toEqual([
      "marketing",
      "vendas",
      "implantacao",
      "sucesso",
      "produto",
      "agentes",
      "tecnologia",
      "qualidade",
      "financeiro",
    ]);
  });

  it("busca por slug inexistente devolve undefined, não um departamento qualquer", () => {
    expect(departamentoPorSlug("inventado")).toBeUndefined();
    expect(departamentoPorSlug("vendas")?.numero).toBe(2);
  });
});

describe("o organograma", () => {
  it("tem um cargo de gerente para cada departamento, e nenhum sobrando", () => {
    const gerentes = CARGOS.filter((c) => c.nivel === "GERENTE");
    expect(gerentes).toHaveLength(9);
    expect(new Set(gerentes.map((c) => c.departamento))).toEqual(
      new Set(DEPARTAMENTOS.map((d) => d.slug)),
    );
  });

  it("só o CEO não se reporta a ninguém", () => {
    const semChefe = CARGOS.filter((c) => !c.reportaA);
    expect(semChefe.map((c) => c.slug)).toEqual(["ceo"]);
  });

  it("toda cadeia de comando chega ao CEO — ninguém fica solto no organograma", () => {
    const porSlug = new Map(CARGOS.map((c) => [c.slug, c]));

    for (const cargo of CARGOS) {
      let atual = cargo;
      let saltos = 0;

      while (atual.reportaA) {
        const chefe = porSlug.get(atual.reportaA);
        expect(chefe, `${atual.slug} reporta a "${atual.reportaA}", que não existe`).toBeDefined();
        atual = chefe!;
        saltos++;
        // Ciclo no organograma seria laço infinito aqui. O teto denuncia.
        expect(saltos, `ciclo no organograma a partir de ${cargo.slug}`).toBeLessThan(10);
      }

      expect(atual.slug, `${cargo.slug} não chega ao CEO`).toBe("ceo");
    }
  });

  it("cargo acima de departamento não pertence a departamento nenhum", () => {
    for (const c of CARGOS.filter((x) => ["CEO", "DIRETOR", "GERENTE_GERAL"].includes(x.nivel))) {
      expect(c.departamento, `${c.slug} não deveria ter departamento`).toBeUndefined();
    }
  });

  it("cargo de gerente sempre aponta para um departamento que existe", () => {
    const slugs = new Set(DEPARTAMENTOS.map((d) => d.slug));
    for (const c of CARGOS.filter((x) => x.nivel === "GERENTE")) {
      expect(slugs.has(c.departamento!), `${c.slug} aponta para departamento inexistente`).toBe(true);
    }
  });

  it("todo slug de cargo é único", () => {
    expect(new Set(CARGOS.map((c) => c.slug)).size).toBe(CARGOS.length);
  });
});
