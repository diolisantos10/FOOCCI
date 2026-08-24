import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

/**
 * O PORTÃO DA ROTA NOVA, NAS DUAS METADES.
 *
 * ADR-003 diz que rota nova exige sessão interna e NÃO aceita `ADMIN_SECRET`.
 * Um teste que só verificasse "com sessão, entra" deixaria passar uma rota
 * aberta. Um que só verificasse "sem sessão, 401" deixaria passar uma rota
 * trancada para todo mundo.
 */

const autorizarInterno = vi.fn();
const getFichasDaEmpresa = vi.fn();
const criarEvento = vi.fn();

vi.mock("@/lib/internal-auth", () => ({
  autorizarInterno: (...a: unknown[]) => autorizarInterno(...a),
}));
vi.mock("@/services/agents/AgentProfileService", () => ({
  getFichasDaEmpresa: () => getFichasDaEmpresa(),
}));
vi.mock("@/lib/prisma", () => ({
  prisma: { internalAuditEvent: { create: (...a: unknown[]) => criarEvento(...a) } },
}));

const pedido = () => new NextRequest("http://localhost/api/admin/fichas-da-empresa");

const SESSAO = {
  userId: "u1",
  nome: "Fulano",
  role: "CEO" as const,
  departamentos: [],
  gerencia: [],
};

beforeEach(() => {
  autorizarInterno.mockReset();
  getFichasDaEmpresa.mockReset();
  criarEvento.mockReset().mockResolvedValue({});
});

describe("a rota das fichas da empresa", () => {
  it("sem sessão interna, responde 401 e NÃO chama o serviço", async () => {
    autorizarInterno.mockReturnValue({
      ok: false,
      status: 401,
      motivo: "sem sessão interna",
      sessao: null,
    });

    const { GET } = await import("./route");
    const res = await GET(pedido());

    expect(res.status).toBe(401);
    expect(getFichasDaEmpresa).not.toHaveBeenCalled();
  });

  it("a negativa entra na trilha, com motivo", async () => {
    autorizarInterno.mockReturnValue({
      ok: false,
      status: 403,
      motivo: "papel VIEWER não atende",
      sessao: { ...SESSAO, role: "VIEWER" },
    });

    const { GET } = await import("./route");
    await GET(pedido());

    expect(criarEvento).toHaveBeenCalledOnce();
    const dados = criarEvento.mock.calls[0]![0].data;
    expect(dados.resultado).toBe("NEGADO");
    expect(dados.motivo).toBe("papel VIEWER não atende");
    expect(dados.actorType).toBe("INTERNAL_USER");
  });

  it("negativa anônima é registrada como ANONIMO, não como usuário", async () => {
    autorizarInterno.mockReturnValue({ ok: false, status: 401, motivo: "sem sessão", sessao: null });

    const { GET } = await import("./route");
    await GET(pedido());

    expect(criarEvento.mock.calls[0]![0].data.actorType).toBe("ANONIMO");
  });

  it("trilha fora do ar não abre a porta — a negativa continua valendo", async () => {
    // A tentação aqui é deixar o `create` derrubar a rota, ou pior, engolir a
    // negativa. Nenhum dos dois: o 401 sai igual.
    autorizarInterno.mockReturnValue({ ok: false, status: 401, motivo: "sem sessão", sessao: null });
    criarEvento.mockRejectedValue(new Error("banco fora"));

    const { GET } = await import("./route");
    const res = await GET(pedido());

    expect(res.status).toBe(401);
    expect(getFichasDaEmpresa).not.toHaveBeenCalled();
  });

  it("com sessão válida, devolve as fichas", async () => {
    autorizarInterno.mockReturnValue({ ok: true, sessao: SESSAO });
    getFichasDaEmpresa.mockResolvedValue({
      leituraOk: true,
      fichas: [{ slug: "closer", nome: "Closer", catalogNumber: "2.5" }],
    });

    const { GET } = await import("./route");
    const res = await GET(pedido());
    const corpo = await res.json();

    expect(res.status).toBe(200);
    expect(corpo.ok).toBe(true);
    expect(corpo.data.fichas).toHaveLength(1);
    expect(criarEvento).not.toHaveBeenCalled();
  });

  it("leitura falha devolve 500 — nunca uma lista vazia com ok:true", async () => {
    // Uma lista vazia com `ok: true` faria a tela escrever "nenhuma ficha
    // cadastrada" quando a verdade é "não consegui perguntar ao banco".
    autorizarInterno.mockReturnValue({ ok: true, sessao: SESSAO });
    getFichasDaEmpresa.mockResolvedValue({
      leituraOk: false,
      fichas: [],
      motivo: "connection refused",
    });

    const { GET } = await import("./route");
    const res = await GET(pedido());
    const corpo = await res.json();

    expect(res.status).toBe(500);
    expect(corpo.ok).toBe(false);
    expect(corpo.error).toContain("connection refused");
  });
});
