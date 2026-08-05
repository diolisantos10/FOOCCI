/**
 * /api/admin/demo-bakery/imagens — a rota que gasta dinheiro.
 *
 * O que estes testes seguram:
 *   • sem admin, 401 — e nenhuma geração é sequer tentada;
 *   • sem `confirmar: true`, recusa 400 — um POST vazio nunca gasta;
 *   • enquanto um trabalho corre, o segundo clique leva 409;
 *   • sem a chave da OpenAI, a resposta é uma frase que o CEO entende.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

const checkAdminRequest = vi.fn();
const startBakeryImageJob = vi.fn();
const planBakeryImages = vi.fn();
const getBakeryImageJob = vi.fn();

vi.mock("@/lib/admin-auth", () => ({
  checkAdminRequest: (...a: unknown[]) => checkAdminRequest(...a),
}));
vi.mock("@/services/demo/FoocciBakeryService", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/services/demo/FoocciBakeryService")>();
  return {
    ...real,
    startBakeryImageJob: (...a: unknown[]) => startBakeryImageJob(...a),
    planBakeryImages: (...a: unknown[]) => planBakeryImages(...a),
    getBakeryImageJob: (...a: unknown[]) => getBakeryImageJob(...a),
  };
});

import { BakeryOperationError } from "@/services/demo/FoocciBakeryService";
import { GET, POST } from "./route";

function post(body?: unknown) {
  return { json: async () => body ?? {} } as unknown as Parameters<typeof POST>[0];
}
function get(qs = "") {
  return {
    nextUrl: new URL(`https://foocci.com.br/api/admin/demo-bakery/imagens${qs}`),
  } as unknown as Parameters<typeof GET>[0];
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.ADMIN_SECRET = "segredo-de-teste";
  getBakeryImageJob.mockReturnValue(null);
});

describe("POST /api/admin/demo-bakery/imagens — dinheiro real", () => {
  it("exige admin — 401 e nada é gerado", async () => {
    checkAdminRequest.mockReturnValue(false);
    const res = await POST(post({ confirmar: true }));
    expect(res.status).toBe(401);
    expect(startBakeryImageJob).not.toHaveBeenCalled();
  });

  it("POST vazio NÃO confirma nada — o serviço recebe confirmar:false", async () => {
    checkAdminRequest.mockReturnValue(true);
    startBakeryImageJob.mockRejectedValue(
      new BakeryOperationError("SEM_CONFIRMACAO", "Exige confirmação explícita."),
    );

    const res = await POST(post({}));
    const body = await res.json();

    expect(startBakeryImageJob).toHaveBeenCalledWith(
      expect.objectContaining({ confirmar: false }),
    );
    expect(res.status).toBe(400);
    expect(body.code).toBe("SEM_CONFIRMACAO");
  });

  it('"confirmar" com valor errado (string, 1, false) não vale como confirmação', async () => {
    checkAdminRequest.mockReturnValue(true);
    startBakeryImageJob.mockResolvedValue({ id: "x", status: "RODANDO", total: 1 });

    for (const valor of ["true", 1, false, null]) {
      await POST(post({ confirmar: valor }));
    }
    for (const chamada of startBakeryImageJob.mock.calls) {
      expect(chamada[0].confirmar).toBe(false);
    }
  });

  it("com confirmação, dispara o trabalho e devolve o total e o custo", async () => {
    checkAdminRequest.mockReturnValue(true);
    startBakeryImageJob.mockResolvedValue({
      id: "job1",
      status: "RODANDO",
      total: 40,
      custoEstimadoUsd: 1.6,
      regerar: false,
    });

    const res = await POST(post({ confirmar: true }));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.data.trabalho.total).toBe(40);
    expect(body.data.trabalho.custoEstimadoUsd).toBe(1.6);
    expect(startBakeryImageJob).toHaveBeenCalledWith({
      confirmar: true,
      regerar: undefined,
      limite: undefined,
    });
  });

  it("segundo clique enquanto o primeiro roda: 409, sem disparar de novo", async () => {
    checkAdminRequest.mockReturnValue(true);
    startBakeryImageJob.mockRejectedValue(
      new BakeryOperationError("JA_EM_ANDAMENTO", "As fotos já estão sendo geradas agora (3 de 40)."),
    );

    const res = await POST(post({ confirmar: true }));
    const body = await res.json();

    expect(res.status).toBe(409);
    expect(body.error).toContain("já estão sendo geradas");
  });

  it("sem a chave da OpenAI, a resposta é uma frase de gente — não um erro técnico", async () => {
    checkAdminRequest.mockReturnValue(true);
    startBakeryImageJob.mockRejectedValue(
      new BakeryOperationError(
        "SEM_CHAVE_OPENAI",
        "Faltou a chave da OpenAI (OPENAI_API_KEY) neste ambiente. Nenhuma foto foi gerada.",
      ),
    );

    const res = await POST(post({ confirmar: true }));
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.error).toContain("Faltou a chave da OpenAI");
    expect(body.code).toBe("SEM_CHAVE_OPENAI");
  });

  it("erro inesperado não vaza detalhe técnico para a tela", async () => {
    checkAdminRequest.mockReturnValue(true);
    startBakeryImageJob.mockRejectedValue(new Error("socket hang up em api.openai.com"));

    const res = await POST(post({ confirmar: true }));
    const body = await res.json();

    expect(res.status).toBe(500);
    expect(JSON.stringify(body)).not.toContain("socket hang up");
  });
});

describe("GET /api/admin/demo-bakery/imagens — o custo ANTES do clique", () => {
  it("exige admin — 401", async () => {
    checkAdminRequest.mockReturnValue(false);
    const res = await GET(get());
    expect(res.status).toBe(401);
    expect(planBakeryImages).not.toHaveBeenCalled();
  });

  it("devolve a estimativa e o trabalho em curso, sem gerar nada", async () => {
    checkAdminRequest.mockReturnValue(true);
    planBakeryImages.mockResolvedValue({ aGerar: 40, custoEstimadoUsd: 1.6, temChaveOpenAi: true });
    getBakeryImageJob.mockReturnValue({ id: "job1", status: "RODANDO", processadas: 3, total: 40 });

    const res = await GET(get());
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.data.plano.custoEstimadoUsd).toBe(1.6);
    expect(body.data.trabalho.processadas).toBe(3);
    expect(startBakeryImageJob).not.toHaveBeenCalled();
  });

  it("?regerar=1 estima o cenário de refazer TUDO (o botão separado)", async () => {
    checkAdminRequest.mockReturnValue(true);
    planBakeryImages.mockResolvedValue({ aGerar: 40, custoEstimadoUsd: 1.6 });
    await GET(get("?regerar=1"));
    expect(planBakeryImages).toHaveBeenCalledWith({ regerar: true });
  });
});
