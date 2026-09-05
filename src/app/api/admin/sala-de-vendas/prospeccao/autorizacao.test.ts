import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

/**
 * QUEM PODE AUTORIZAR A CASA A FALAR COM ESTRANHOS.
 *
 * ── A DISTINÇÃO QUE ESTE ARQUIVO PROTEGE ────────────────────────────────────
 *
 * O SDR **conduz** a prospecção: ele precisa ver a fila do dia, e precisa ver
 * quem foi barrado e por quê. Isso é trabalho dele.
 *
 * **Liberar um lote e mexer no interruptor não são.** São o ato de autorizar a
 * empresa a abordar gente que nunca pediu nada — e esse ato responde por danos
 * que o SDR não tem como avaliar: número restringido, denúncia, marca queimada.
 *
 * A tela já esconde os botões de quem não pode. Menu escondido não é
 * autorização: quem souber o endereço manda o POST na mão. Por isso estes testes
 * chamam a rota DIRETAMENTE.
 *
 * As duas metades, sempre. Um teste só da recusa não separa nada — passaria
 * numa rota trancada para todo mundo, inclusive para quem deveria entrar.
 */

const autorizarInterno = vi.fn();
const criarEvento = vi.fn();
const liberarLote = vi.fn();
const upsertConfig = vi.fn();

vi.mock("@/lib/internal-auth", async () => {
  const real = await vi.importActual<typeof import("@/lib/internal-auth")>("@/lib/internal-auth");
  return { ...real, autorizarInterno: (...a: unknown[]) => autorizarInterno(...a) };
});

vi.mock("@/lib/prisma", () => ({
  prisma: {
    internalAuditEvent: { create: (...a: unknown[]) => criarEvento(...a) },
    prospeccaoConfig: { upsert: (...a: unknown[]) => upsertConfig(...a) },
  },
}));

vi.mock("@/services/salaDeVendas/prospeccao/lote", async () => {
  const real = await vi.importActual<typeof import("@/services/salaDeVendas/prospeccao/lote")>(
    "@/services/salaDeVendas/prospeccao/lote",
  );
  return { ...real, liberarLote: (...a: unknown[]) => liberarLote(...a) };
});

const SDR = {
  userId: "sdr1",
  nome: "SDR Humano",
  role: "AGENTE_HUMANO" as const,
  departamentos: ["vendas"],
  gerencia: [],
};

const DIRETOR = {
  userId: "d1",
  nome: "Diretor",
  role: "DIRETOR_FOOCCI" as const,
  departamentos: ["vendas"],
  gerencia: ["vendas"],
};

const AUDITOR = {
  userId: "a1",
  nome: "Auditor",
  role: "AUDITOR_QA" as const,
  departamentos: ["vendas"],
  gerencia: [],
};

function pedido(corpo: unknown): NextRequest {
  return new NextRequest("http://localhost/api/admin/sala-de-vendas/prospeccao", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(corpo),
  });
}

beforeEach(() => {
  autorizarInterno.mockReset();
  criarEvento.mockReset().mockResolvedValue({});
  liberarLote.mockReset().mockResolvedValue({ ok: true });
  upsertConfig.mockReset().mockResolvedValue({ id: "singleton", outboundLigado: true });
});

describe("liberar lote", () => {
  it("⛔ o SDR humano NÃO libera lote — ele conduz, não autoriza", async () => {
    autorizarInterno.mockReturnValue({ ok: true, sessao: SDR });
    const { POST } = await import("./route");

    const res = await POST(pedido({ acao: "liberar", loteId: "lote1" }));

    expect(res.status).toBe(403);
    // A trava tem que barrar ANTES de chamar o serviço: um 403 devolvido depois
    // de o lote já ter sido liberado seria uma mensagem de erro por cima de um
    // fato consumado.
    expect(liberarLote).not.toHaveBeenCalled();
  });

  it("o Diretor libera", async () => {
    autorizarInterno.mockReturnValue({ ok: true, sessao: DIRETOR });
    const { POST } = await import("./route");

    const res = await POST(pedido({ acao: "liberar", loteId: "lote1" }));

    expect(res.status).toBe(200);
    expect(liberarLote).toHaveBeenCalled();
  });
});

describe("o interruptor da prospecção", () => {
  it("⛔ o SDR humano NÃO liga a prospecção", async () => {
    autorizarInterno.mockReturnValue({ ok: true, sessao: SDR });
    const { POST } = await import("./route");

    const res = await POST(pedido({ acao: "interruptor", ligado: true }));

    expect(res.status).toBe(403);
    expect(upsertConfig).not.toHaveBeenCalled();
  });

  it("⛔ o auditor lê e não escreve — nem para ligar, nem para pausar", async () => {
    autorizarInterno.mockReturnValue({ ok: true, sessao: AUDITOR });
    const { POST } = await import("./route");

    const res = await POST(pedido({ acao: "interruptor", ligado: true }));

    expect(res.status).toBe(403);
    expect(upsertConfig).not.toHaveBeenCalled();
  });

  it("o Diretor liga, e o que é gravado diz QUEM ligou", async () => {
    autorizarInterno.mockReturnValue({ ok: true, sessao: DIRETOR });
    const { POST } = await import("./route");

    const res = await POST(pedido({ acao: "interruptor", ligado: true }));

    expect(res.status).toBe(200);
    const dados = upsertConfig.mock.calls[0]![0].update;
    expect(dados.outboundLigado).toBe(true);
    expect(dados.atualizadoPor).toContain("Diretor");
  });

  it("⭐ pausar DESLIGA, mesmo se o corpo pedir para ligar ao mesmo tempo", async () => {
    // O corpo contraditório existe: um clique duplo, um formulário mal montado,
    // uma chamada refeita. Entre ligar e parar, a resposta segura é parar —
    // e o teste existe para que ninguém "simplifique" essa precedência depois.
    autorizarInterno.mockReturnValue({ ok: true, sessao: DIRETOR });
    const { POST } = await import("./route");

    await POST(pedido({ acao: "interruptor", ligado: true, pausar: true }));

    const dados = upsertConfig.mock.calls[0]![0].update;
    expect(dados.outboundLigado).toBe(false);
    expect(dados.pausadoEm).toBeInstanceOf(Date);
  });
});

describe("a porta de entrada", () => {
  it("⛔ quem não tem sessão não alcança a rota", async () => {
    autorizarInterno.mockReturnValue({
      ok: false,
      sessao: null,
      motivo: "sem sessão",
      status: 401,
    });
    const { POST } = await import("./route");

    const res = await POST(pedido({ acao: "liberar", loteId: "lote1" }));

    expect(res.status).toBe(401);
    expect(liberarLote).not.toHaveBeenCalled();
  });
});
