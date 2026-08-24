import { describe, it, expect } from "vitest";
import {
  enxergaTudo,
  podeLerDepartamento,
  podeAdministrarDepartamento,
  podeVerAdminGeral,
  escopoDeDepartamentos,
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
  role: "AGENTE_HUMANO",
  departamentos: [],
  gerencia: [],
  ...over,
});

describe("quem enxerga a empresa inteira", () => {
  it.each(["MASTER_CEO", "DIRETOR_FOOCCI"] as const)("%s enxerga tudo", (role) => {
    expect(enxergaTudo(sessao({ role }))).toBe(true);
  });

  it.each(["GERENTE_DEPARTAMENTO", "AGENTE_HUMANO", "AGENTE_IA", "AUDITOR_QA"] as const)(
    "%s NÃO enxerga tudo",
    (role) => {
      expect(enxergaTudo(sessao({ role }))).toBe(false);
    },
  );
});

describe("escopo departamental", () => {
  it("gerente de Vendas administra Vendas", () => {
    const s = sessao({ role: "GERENTE_DEPARTAMENTO", departamentos: ["vendas"], gerencia: ["vendas"] });
    expect(podeAdministrarDepartamento(s, "vendas")).toBe(true);
  });

  it("gerente de Vendas NÃO administra Financeiro — e nem lê", () => {
    const s = sessao({ role: "GERENTE_DEPARTAMENTO", departamentos: ["vendas"], gerencia: ["vendas"] });
    expect(podeAdministrarDepartamento(s, "financeiro")).toBe(false);
    expect(podeLerDepartamento(s, "financeiro")).toBe(false);
  });

  it("pertencer não é administrar", () => {
    // Este é o caso que separa "escopo departamental" de "todo mundo do
    // departamento manda no departamento".
    const s = sessao({ role: "AGENTE_HUMANO", departamentos: ["vendas"], gerencia: [] });
    expect(podeLerDepartamento(s, "vendas")).toBe(true);
    expect(podeAdministrarDepartamento(s, "vendas")).toBe(false);
  });

  it("o CEO/Master administra qualquer departamento sem precisar ser membro", () => {
    const s = sessao({ role: "MASTER_CEO" });
    expect(s.departamentos).toEqual([]);
    expect(podeAdministrarDepartamento(s, "financeiro")).toBe(true);
  });

  it("quem não pertence a nada não lê nada", () => {
    const s = sessao({ role: "AUDITOR_QA" });
    expect(podeLerDepartamento(s, "vendas")).toBe(false);
    expect(podeLerDepartamento(s, "tecnologia")).toBe(false);
  });

  it("acumular departamentos dá acesso a todos eles, e só a eles", () => {
    // O plano mestre prevê acúmulo enquanto a empresa é pequena.
    const s = sessao({
      role: "GERENTE_DEPARTAMENTO",
      departamentos: ["vendas", "produto"],
      gerencia: ["vendas"],
    });
    expect(podeLerDepartamento(s, "produto")).toBe(true);
    expect(podeAdministrarDepartamento(s, "produto")).toBe(false);
    expect(podeAdministrarDepartamento(s, "vendas")).toBe(true);
    expect(podeLerDepartamento(s, "tecnologia")).toBe(false);
  });

  it("slug parecido não vaza: 'vendas' não abre 'vendas-interno'", () => {
    const s = sessao({ role: "GERENTE_DEPARTAMENTO", departamentos: ["vendas"], gerencia: ["vendas"] });
    expect(podeLerDepartamento(s, "vendas-interno")).toBe(false);
  });
});

/**
 * ── O CRITÉRIO 6 DO CEO ──
 *
 * *"SDR humano visualiza somente a Sala de Vendas autorizada."*
 *
 * É o requisito de isolamento mais explícito do comando, e o primeiro alvo dos
 * testes de autorização.
 */
describe("quem circula pelo Admin geral", () => {
  it.each(["MASTER_CEO", "DIRETOR_FOOCCI"] as const)("%s vê o Admin inteiro", (role) => {
    expect(podeVerAdminGeral(sessao({ role }))).toBe(true);
  });

  it.each(["GERENTE_DEPARTAMENTO", "AGENTE_HUMANO", "AGENTE_IA", "AUDITOR_QA"] as const)(
    "%s NÃO vê o Admin geral",
    (role) => {
      expect(podeVerAdminGeral(sessao({ role }))).toBe(false);
    },
  );

  it("o SDR humano fica na Sala de Vendas, e só", () => {
    const sdr = sessao({
      role: "AGENTE_HUMANO",
      departamentos: ["vendas"],
      gerencia: [],
    });

    expect(podeVerAdminGeral(sdr)).toBe(false);
    expect(podeLerDepartamento(sdr, "vendas")).toBe(true);
    expect(podeLerDepartamento(sdr, "financeiro")).toBe(false);
    expect(podeAdministrarDepartamento(sdr, "vendas")).toBe(false);
  });

  it("nem o gerente do departamento ganha o Admin inteiro junto", () => {
    // Administrar Vendas não é o mesmo que ver o Financeiro. O gerente cresce
    // dentro do departamento dele, não para os lados.
    const gerente = sessao({
      role: "GERENTE_DEPARTAMENTO",
      departamentos: ["vendas"],
      gerencia: ["vendas"],
    });

    expect(podeAdministrarDepartamento(gerente, "vendas")).toBe(true);
    expect(podeVerAdminGeral(gerente)).toBe(false);
    expect(podeLerDepartamento(gerente, "financeiro")).toBe(false);
  });
});

describe("o escopo que vira filtro de consulta", () => {
  it("quem enxerga tudo devolve `tudo`, não uma lista vazia", () => {
    // Uma lista vazia aqui seria catastrófica do jeito silencioso: o CEO
    // consultaria o banco com `IN ()` e veria zero de tudo, sem erro nenhum.
    expect(escopoDeDepartamentos(sessao({ role: "MASTER_CEO" }))).toBe("tudo");
    expect(escopoDeDepartamentos(sessao({ role: "DIRETOR_FOOCCI" }))).toBe("tudo");
  });

  it("o SDR devolve os departamentos dele", () => {
    const sdr = sessao({ role: "AGENTE_HUMANO", departamentos: ["vendas"] });
    expect(escopoDeDepartamentos(sdr)).toEqual(["vendas"]);
  });

  it("quem não pertence a nada devolve lista vazia — que filtra tudo fora", () => {
    expect(escopoDeDepartamentos(sessao({ role: "AGENTE_HUMANO" }))).toEqual([]);
  });

  it("a lista devolvida é uma cópia: mexer nela não muda a sessão", () => {
    // Devolver a referência deixaria qualquer caller ampliar o próprio escopo
    // com um `push`, sem passar por autorização nenhuma.
    const sdr = sessao({ role: "AGENTE_HUMANO", departamentos: ["vendas"] });
    const escopo = escopoDeDepartamentos(sdr) as string[];
    escopo.push("financeiro");
    expect(sdr.departamentos).toEqual(["vendas"]);
  });
});
