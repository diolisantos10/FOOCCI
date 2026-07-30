/**
 * O cadastro do cliente denuncia o vazio.
 *
 * O buraco que originou a ficha foi concreto: precisou-se do @ de um cliente e
 * ele não existia em lugar nenhum. Uma tela que só guarda campo não resolve
 * isso — ela apenas passa a ter um campo vazio que ninguém olha.
 *
 * O que estes testes protegem é o AVISO: o essencial que falta tem que aparecer,
 * e a completude não pode ser diluída por campo opcional em branco.
 */

import { describe, it, expect } from "vitest";

import {
  avaliarCadastro,
  CAMPOS_DO_CADASTRO,
  CHAVES_DO_CADASTRO,
  GRUPOS,
  sanitizarCadastro,
} from "../CadastroDoCliente";

/** Um cadastro com todo o essencial preenchido. */
function cheio(over: Record<string, string> = {}) {
  const c: Record<string, string> = {};
  for (const campo of CAMPOS_DO_CADASTRO) if (campo.essencial) c[campo.chave] = "preenchido";
  return { ...c, ...over };
}

describe("a régua", () => {
  it("todo campo pertence a um grupo que existe", () => {
    const grupos = new Set(GRUPOS.map((g) => g.chave));
    for (const c of CAMPOS_DO_CADASTRO) {
      expect(grupos.has(c.grupo), `${c.chave} → grupo "${c.grupo}"`).toBe(true);
    }
  });

  it("todo campo explica por que importa — é o texto que aparece quando está vazio", () => {
    for (const c of CAMPOS_DO_CADASTRO) {
      expect(c.porque.trim().length, c.chave).toBeGreaterThan(10);
      expect(c.rotulo.trim().length, c.chave).toBeGreaterThan(0);
    }
  });

  it("o Instagram é essencial — foi ele que faltou", () => {
    const insta = CAMPOS_DO_CADASTRO.find((c) => c.chave === "instagram");
    expect(insta?.essencial).toBe(true);
  });

  it("persona e nicho são essenciais — sem eles a peça sai genérica", () => {
    for (const chave of ["niche", "targetPersona"]) {
      expect(CAMPOS_DO_CADASTRO.find((c) => c.chave === chave)?.essencial, chave).toBe(true);
    }
  });
});

describe("o que falta", () => {
  it("cadastro vazio: completude 0 e o essencial todo listado", () => {
    const a = avaliarCadastro({});
    expect(a.completude).toBe(0);
    expect(a.preenchidos).toBe(0);
    expect(a.faltando.filter((p) => p.essencial).length).toBeGreaterThan(0);
    expect(a.veredito).toMatch(/Falta perguntar/);
  });

  it("cadastro nulo não explode", () => {
    expect(avaliarCadastro(null).completude).toBe(0);
    expect(avaliarCadastro(undefined).completude).toBe(0);
  });

  it("essencial preenchido = 100%, mesmo com opcional em branco", () => {
    const a = avaliarCadastro(cheio());
    expect(a.completude).toBe(100);
    expect(a.faltando.filter((p) => p.essencial)).toEqual([]);
    expect(a.faltando.length).toBeGreaterThan(0);        // os opcionais seguem listados
    expect(a.veredito).toMatch(/essencial está todo aqui/);
  });

  it("faltando só o Instagram: NÃO chega a 100%", () => {
    const a = avaliarCadastro(cheio({ instagram: "" }));
    expect(a.completude).toBeLessThan(100);
    expect(a.faltando.some((p) => p.chave === "instagram" && p.essencial)).toBe(true);
    expect(a.veredito).toContain("Instagram");
  });

  it("o essencial aparece primeiro na lista", () => {
    const a = avaliarCadastro({});
    const primeiroOpcional = a.faltando.findIndex((p) => !p.essencial);
    const ultimoEssencial  = a.faltando.map((p) => p.essencial).lastIndexOf(true);
    expect(ultimoEssencial).toBeLessThan(primeiroOpcional);
  });

  it("espaço em branco não conta como preenchido", () => {
    const a = avaliarCadastro(cheio({ instagram: "   " }));
    expect(a.faltando.some((p) => p.chave === "instagram")).toBe(true);
  });

  it("a contagem por grupo bate com a lista", () => {
    const a = avaliarCadastro({});
    const soma = Object.values(a.faltandoPorGrupo).reduce((x, y) => x + y, 0);
    expect(soma).toBe(a.faltando.length);
  });

  it("campo que aparece em dois grupos conta uma vez só", () => {
    // legalName está em identificação E em fiscal
    const emDois = CAMPOS_DO_CADASTRO.filter((c) => c.chave === "legalName");
    expect(emDois.length).toBe(2);

    const a = avaliarCadastro({});
    expect(a.faltando.filter((p) => p.chave === "legalName")).toHaveLength(1);
    expect(a.total).toBe(CHAVES_DO_CADASTRO.length);
  });
});

describe("o que a ficha aceita gravar", () => {
  it("campo fora da régua é descartado — nada de coluna inventada", () => {
    const r = sanitizarCadastro({ instagram: "@x", plan: "PREMIUM", isActive: "false", id: "outro" });
    expect(r).toEqual({ instagram: "@x" });
  });

  it("string vazia vira null — apagar é uma ação legítima", () => {
    expect(sanitizarCadastro({ instagram: "  " })).toEqual({ instagram: null });
    expect(sanitizarCadastro({ instagram: null })).toEqual({ instagram: null });
  });

  it("chave ausente NÃO é tocada — salvar parcial não apaga o resto", () => {
    const r = sanitizarCadastro({ instagram: "@x" });
    expect("niche" in r).toBe(false);
  });

  it("valor gigante é cortado em vez de derrubar o insert", () => {
    const r = sanitizarCadastro({ internalNotes: "a".repeat(9000) });
    expect((r.internalNotes as string).length).toBe(4000);
  });

  it("valor não-texto é ignorado", () => {
    expect(sanitizarCadastro({ instagram: 42 })).toEqual({});
  });
});
