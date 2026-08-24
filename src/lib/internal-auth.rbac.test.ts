import { describe, it, expect } from "vitest";
import {
  enxergaTudo,
  podeLerDepartamento,
  podeAdministrarDepartamento,
  type SessaoInterna,
} from "./internal-auth";

/**
 * O RBAC é testado aqui como FUNÇÃO PURA, sem banco e sem HTTP.
 *
 * O critério de aceite do documento 07 é "gerente de departamento administra
 * sua área sem obter acesso indevido às demais". Isso é uma regra de decisão,
 * e regra de decisão testada por E2E é regra testada uma vez por caminho feliz.
 * Aqui cada combinação é exercitada.
 */

const sessao = (over: Partial<SessaoInterna> = {}): SessaoInterna => ({
  userId: "u1",
  nome: "Fulano",
  role: "MEMBRO",
  departamentos: [],
  gerencia: [],
  ...over,
});

describe("quem enxerga a empresa inteira", () => {
  it.each(["CEO", "DIRETOR", "GERENTE_GERAL"] as const)("%s enxerga tudo", (role) => {
    expect(enxergaTudo(sessao({ role }))).toBe(true);
  });

  it.each(["GERENTE", "MEMBRO", "VIEWER", "SYSTEM_AI"] as const)(
    "%s NÃO enxerga tudo",
    (role) => {
      expect(enxergaTudo(sessao({ role }))).toBe(false);
    },
  );
});

describe("escopo departamental", () => {
  it("gerente de Vendas administra Vendas", () => {
    const s = sessao({ role: "GERENTE", departamentos: ["vendas"], gerencia: ["vendas"] });
    expect(podeAdministrarDepartamento(s, "vendas")).toBe(true);
  });

  it("gerente de Vendas NÃO administra Financeiro — e nem lê", () => {
    const s = sessao({ role: "GERENTE", departamentos: ["vendas"], gerencia: ["vendas"] });
    expect(podeAdministrarDepartamento(s, "financeiro")).toBe(false);
    expect(podeLerDepartamento(s, "financeiro")).toBe(false);
  });

  it("pertencer não é administrar", () => {
    // Este é o caso que separa "escopo departamental" de "todo mundo do
    // departamento manda no departamento".
    const s = sessao({ role: "MEMBRO", departamentos: ["vendas"], gerencia: [] });
    expect(podeLerDepartamento(s, "vendas")).toBe(true);
    expect(podeAdministrarDepartamento(s, "vendas")).toBe(false);
  });

  it("o CEO administra qualquer departamento sem precisar ser membro", () => {
    const s = sessao({ role: "CEO" });
    expect(s.departamentos).toEqual([]);
    expect(podeAdministrarDepartamento(s, "financeiro")).toBe(true);
  });

  it("quem não pertence a nada não lê nada", () => {
    const s = sessao({ role: "VIEWER" });
    expect(podeLerDepartamento(s, "vendas")).toBe(false);
    expect(podeLerDepartamento(s, "marketing")).toBe(false);
  });

  it("acumular departamentos dá acesso a todos eles, e só a eles", () => {
    // O plano mestre prevê acúmulo enquanto a empresa é pequena.
    const s = sessao({
      role: "GERENTE",
      departamentos: ["vendas", "marketing"],
      gerencia: ["vendas"],
    });
    expect(podeLerDepartamento(s, "marketing")).toBe(true);
    expect(podeAdministrarDepartamento(s, "marketing")).toBe(false);
    expect(podeAdministrarDepartamento(s, "vendas")).toBe(true);
    expect(podeLerDepartamento(s, "produto")).toBe(false);
  });

  it("slug parecido não vaza: 'vendas' não abre 'vendas-interno'", () => {
    const s = sessao({ role: "GERENTE", departamentos: ["vendas"], gerencia: ["vendas"] });
    expect(podeLerDepartamento(s, "vendas-interno")).toBe(false);
  });
});
