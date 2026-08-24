import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

/**
 * O ISOLAMENTO DO SDR HUMANO — CRITÉRIOS 6 E 13 DO CEO.
 *
 *   6.  "SDR humano visualiza somente a Sala de Vendas autorizada."
 *   13. "Testes de autorização impedem acesso direto por URL ou API."
 *
 * ── POR QUE ESTE ARQUIVO EXISTE SEPARADO ──
 *
 * É tentador confiar em "a tela não mostra o botão". Menu escondido não é
 * autorização: quem souber o endereço digita. Estes testes chamam as rotas
 * DIRETAMENTE, sem passar por tela nenhuma — é assim que um atacante chega, e é
 * assim que o portão precisa ser exercitado.
 *
 * As duas metades, sempre: quem pode entra, quem não pode bate na porta. Um
 * teste só da primeira metade deixa passar rota aberta; um teste só da segunda
 * deixa passar rota trancada para todo mundo.
 */

const autorizarInterno = vi.fn();
const criarEvento = vi.fn();
const listarFila = vi.fn();
const montarPainel = vi.fn();

vi.mock("@/lib/internal-auth", async () => {
  const real = await vi.importActual<typeof import("@/lib/internal-auth")>("@/lib/internal-auth");
  return { ...real, autorizarInterno: (...a: unknown[]) => autorizarInterno(...a) };
});
vi.mock("@/lib/prisma", () => ({
  prisma: { internalAuditEvent: { create: (...a: unknown[]) => criarEvento(...a) } },
}));
vi.mock("@/services/salaDeVendas/filas", async () => {
  const real = await vi.importActual<typeof import("@/services/salaDeVendas/filas")>(
    "@/services/salaDeVendas/filas",
  );
  return { ...real, listarFila: (...a: unknown[]) => listarFila(...a) };
});
vi.mock("@/services/organizacao/painelDeDepartamentos", () => ({
  montarPainel: () => montarPainel(),
}));

const SDR = {
  userId: "sdr1",
  nome: "SDR Humano",
  role: "AGENTE_HUMANO" as const,
  departamentos: ["vendas"],
  gerencia: [],
};

beforeEach(() => {
  autorizarInterno.mockReset();
  criarEvento.mockReset().mockResolvedValue({});
  listarFila.mockReset().mockResolvedValue({ leituraOk: true, leads: [], contagens: {} });
  montarPainel.mockReset().mockResolvedValue({ leituraOk: true, painel: { departamentos: [] } });
});

const pedido = (url: string) => new NextRequest(`http://localhost${url}`);

describe("a Sala de Vendas aceita o SDR humano", () => {
  it("com sessão de SDR, a fila abre", async () => {
    // A metade que PASSA. Sem ela, um portão que barra todo mundo ficaria verde
    // em tudo abaixo.
    autorizarInterno.mockReturnValue({ ok: true, sessao: SDR });

    const { GET } = await import("./filas/route");
    const res = await GET(pedido("/api/admin/sala-de-vendas/filas"));

    expect(res.status).toBe(200);
    expect(listarFila).toHaveBeenCalled();
  });

  it("a sessão do SDR chega ao serviço — é ela que vira filtro de consulta", async () => {
    autorizarInterno.mockReturnValue({ ok: true, sessao: SDR });

    const { GET } = await import("./filas/route");
    await GET(pedido("/api/admin/sala-de-vendas/filas"));

    expect(listarFila.mock.calls[0]![1].sessao).toEqual(SDR);
  });

  it("sem sessão, a fila responde 401 e o serviço NÃO é chamado", async () => {
    autorizarInterno.mockReturnValue({
      ok: false,
      status: 401,
      motivo: "sem sessão interna",
      sessao: null,
    });

    const { GET } = await import("./filas/route");
    const res = await GET(pedido("/api/admin/sala-de-vendas/filas"));

    expect(res.status).toBe(401);
    expect(listarFila).not.toHaveBeenCalled();
  });
});

describe("o SDR humano NÃO alcança o resto do Admin", () => {
  it("a rota de departamentos exige papel que o SDR não tem", async () => {
    // Este é o critério 6 verificado no lugar certo: a EXIGÊNCIA que a rota
    // declara. Um teste que só olhasse o resultado passaria mesmo se a rota
    // aceitasse qualquer sessão, desde que o mock devolvesse 403.
    autorizarInterno.mockReturnValue({ ok: true, sessao: { ...SDR, role: "MASTER_CEO" } });

    const { GET } = await import("../departamentos/route");
    await GET(pedido("/api/admin/departamentos"));

    const exigencia = autorizarInterno.mock.calls[0]![1];
    expect(exigencia?.papeis).toBeDefined();
    expect(exigencia.papeis).not.toContain("AGENTE_HUMANO");
    expect(exigencia.papeis).toContain("MASTER_CEO");
    expect(exigencia.papeis).toContain("DIRETOR_FOOCCI");
  });

  it("com sessão de SDR, a rota de departamentos responde 403", async () => {
    autorizarInterno.mockReturnValue({
      ok: false,
      status: 403,
      motivo: "papel AGENTE_HUMANO não atende",
      sessao: SDR,
    });

    const { GET } = await import("../departamentos/route");
    const res = await GET(pedido("/api/admin/departamentos"));

    expect(res.status).toBe(403);
    expect(montarPainel).not.toHaveBeenCalled();
  });

  it("a tentativa negada entra na trilha, com quem tentou e por quê", async () => {
    // Sem isso, "ninguém tentou entrar onde não devia" seria suposição.
    autorizarInterno.mockReturnValue({
      ok: false,
      status: 403,
      motivo: "papel AGENTE_HUMANO não atende",
      sessao: SDR,
    });

    const { GET } = await import("../departamentos/route");
    await GET(pedido("/api/admin/departamentos"));

    const dados = criarEvento.mock.calls[0]![0].data;
    expect(dados.resultado).toBe("NEGADO");
    expect(dados.motivo).toContain("AGENTE_HUMANO");
    expect(dados.actorLabel).toContain("sdr1");
  });
});

describe("o ator técnico da IA não abre tela", () => {
  it("`AGENTE_IA` não está entre os papéis aceitos pela Sala", async () => {
    autorizarInterno.mockReturnValue({ ok: true, sessao: SDR });

    const { GET } = await import("./filas/route");
    await GET(pedido("/api/admin/sala-de-vendas/filas"));

    const exigencia = autorizarInterno.mock.calls[0]![1];
    expect(exigencia.papeis).not.toContain("AGENTE_IA");
    expect(exigencia.papeis).toContain("AGENTE_HUMANO");
  });
});

describe("o auditor lê e não escreve", () => {
  it("`AUDITOR_QA` entra na Sala", async () => {
    autorizarInterno.mockReturnValue({ ok: true, sessao: { ...SDR, role: "AUDITOR_QA" } });

    const { GET } = await import("./filas/route");
    expect((await GET(pedido("/api/admin/sala-de-vendas/filas"))).status).toBe(200);
  });

  it("mas NÃO muda o responsável de um lead", async () => {
    // Quem audita não mexe no que auditou.
    autorizarInterno.mockReturnValue({ ok: true, sessao: { ...SDR, role: "AUDITOR_QA" } });

    const { POST } = await import("./responsavel/route");
    const req = new NextRequest("http://localhost/api/admin/sala-de-vendas/responsavel", {
      method: "POST",
      body: JSON.stringify({ acao: "assumir", leadId: "l1" }),
    });

    const res = await POST(req);
    expect(res.status).toBe(403);
    expect((await res.json()).error).toContain("auditor");
  });
});
