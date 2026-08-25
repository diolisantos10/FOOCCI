import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * A SEPARAÇÃO DAS POPULAÇÕES, NAS DUAS METADES.
 *
 * Em 07/08/2026 quatro fichas foram apagadas por confundir agente de PRODUTO com
 * agente de DESENVOLVIMENTO. A Fase 1 trouxe uma terceira população — EMPRESA —
 * para a MESMA tabela, e com ela o mesmo risco, agora com consequência de
 * runtime: `getActiveAgentProfiles` alimenta o produto, e até esta fase filtrava
 * só por `status: ACTIVE`.
 *
 * O dia em que o proprietário ativasse a ficha do Closer, o Closer entraria na
 * lista de agentes que rodam dentro do restaurante do cliente. Calado.
 *
 * Estes testes espionam a consulta que sai para o banco. É o único jeito de
 * provar que o filtro está lá: um teste que só olha o resultado passaria com uma
 * base de teste onde não existe ficha de empresa nenhuma.
 */

const findMany = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: { agentProfile: { findMany: (...a: unknown[]) => findMany(...a) } },
}));

beforeEach(() => {
  findMany.mockReset();
  findMany.mockResolvedValue([]);
  process.env.AGENT_PROFILE_DB_ENABLED = "true";
});

describe("o runtime do produto nunca enxerga ficha da empresa", () => {
  it("`getActiveAgentProfiles` filtra por população PRODUTO", async () => {
    const { getActiveAgentProfiles } = await import("./AgentProfileService");
    await getActiveAgentProfiles();

    expect(findMany).toHaveBeenCalled();
    const where = findMany.mock.calls[0]![0]?.where;
    expect(where).toMatchObject({ status: "ACTIVE", population: "PRODUTO" });
  });

  it("`getAdminAgentProfiles` também filtra — a Sala não conta gente como IA", async () => {
    const { getAdminAgentProfiles } = await import("./AgentProfileService");
    await getAdminAgentProfiles();

    const where = findMany.mock.calls[0]![0]?.where;
    expect(where).toMatchObject({ population: "PRODUTO" });
  });

  it("`getFichasDaEmpresa` filtra pelo outro lado — e só por ele", async () => {
    const { getFichasDaEmpresa } = await import("./AgentProfileService");
    await getFichasDaEmpresa();

    const where = findMany.mock.calls[0]![0]?.where;
    expect(where).toMatchObject({ population: "EMPRESA" });
    expect(where).not.toHaveProperty("status");
  });
});

describe("a leitura das fichas diz quando NÃO conseguiu ler", () => {
  it("banco fora do ar devolve leituraOk false com motivo, e não lista vazia silenciosa", async () => {
    // A regra da Sala dos Agentes: não escrever zero quando a resposta é
    // "não sei". Uma função que devolve `[]` no catch faz a tela dizer
    // "nenhuma ficha" quando a verdade é "não consegui perguntar".
    findMany.mockRejectedValueOnce(new Error("connection refused"));

    const { getFichasDaEmpresa } = await import("./AgentProfileService");
    const r = await getFichasDaEmpresa();

    expect(r.leituraOk).toBe(false);
    expect(r.motivo).toContain("connection refused");
    expect(r.fichas).toEqual([]);
  });

  it("banco no ar e sem fichas devolve leituraOk true — vazio provado é diferente de vazio ignorado", async () => {
    findMany.mockResolvedValueOnce([]);

    const { getFichasDaEmpresa } = await import("./AgentProfileService");
    const r = await getFichasDaEmpresa();

    expect(r.leituraOk).toBe(true);
    expect(r.motivo).toBeUndefined();
  });
});

describe("cargo vago aparece como vago", () => {
  it("ficha com cargo dono sem ocupante devolve ocupante nulo, não some o dono", async () => {
    findMany.mockResolvedValueOnce([
      {
        slug: "closer",
        name: "Closer",
        catalogNumber: "2.5",
        executionMode: "HUMAN",
        status: "DRAFT",
        isRuntimeEnabled: false,
        allowedActions: [],
        forbiddenActions: ["marcar FECHADO sem evidência"],
        escalationRules: [],
        department: { numero: 2, slug: "vendas", nome: "Vendas e Receita" },
        ownerPosition: { slug: "gerente-vendas", titulo: "Gerente de Vendas", ocupantes: [] },
      },
    ]);

    const { getFichasDaEmpresa } = await import("./AgentProfileService");
    const [ficha] = (await getFichasDaEmpresa()).fichas;

    expect(ficha!.dono).toEqual({
      slug: "gerente-vendas",
      titulo: "Gerente de Vendas",
      ocupante: null,
    });
    expect(ficha!.naoPode).toEqual(["marcar FECHADO sem evidência"]);
  });
});
