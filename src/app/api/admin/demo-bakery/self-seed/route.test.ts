/**
 * /api/admin/demo-bakery/self-seed — a rota que o boot chama sozinho.
 *
 * O que estes testes protegem: esta rota roda com o servidor subindo e sem
 * ninguém olhando. Ela precisa (a) continuar exigindo admin, (b) responder
 * mesmo quando o seed falha, e (c) pedir nova tentativa (503) em vez de fingir
 * sucesso — 200 num seed que falhou faria o script parar de tentar por engano.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

const checkAdminRequest = vi.fn();
const runBakerySelfSeed = vi.fn();

vi.mock("@/lib/admin-auth", () => ({
  checkAdminRequest: (...a: unknown[]) => checkAdminRequest(...a),
}));
vi.mock("@/services/demo/bakerySelfSeed", () => ({
  runBakerySelfSeed: (...a: unknown[]) => runBakerySelfSeed(...a),
}));

import { POST } from "./route";

function req() {
  return {} as unknown as Parameters<typeof POST>[0];
}

const OK = {
  seed: { estado: "OK", mensagem: "atualizada", restaurantCreated: false, categorias: 7, itens: 40, semFoto: 0 },
  fotos: { estado: "NADA_A_FAZER", mensagem: "nada a gastar", aGerar: 0, jobId: null, custoEstimadoUsd: 0 },
  duracaoMs: 1200,
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
  process.env.ADMIN_SECRET = "segredo-de-teste";
});

describe("POST /api/admin/demo-bakery/self-seed", () => {
  it("exige admin — 401 e o seed nem é chamado", async () => {
    checkAdminRequest.mockReturnValue(false);
    const res = await POST(req());
    expect(res.status).toBe(401);
    expect(runBakerySelfSeed).not.toHaveBeenCalled();
  });

  it("seed em dia → 200, e o script para de tentar", async () => {
    checkAdminRequest.mockReturnValue(true);
    runBakerySelfSeed.mockResolvedValue(OK);

    const res = await POST(req());
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data.seed.itens).toBe(40);
  });

  it("seed falhou → 503 com o motivo, mas a rota RESPONDE (o boot segue)", async () => {
    checkAdminRequest.mockReturnValue(true);
    runBakerySelfSeed.mockResolvedValue({
      ...OK,
      seed: { ...OK.seed, estado: "FALHOU", mensagem: "SEM_BANCO: DATABASE_URL vazia." },
    });

    const res = await POST(req());
    const body = await res.json();

    expect(res.status).toBe(503);
    expect(body.success).toBe(false);
    expect(body.data.seed.mensagem).toContain("SEM_BANCO");
  });

  it("se até o orquestrador explodir, a rota ainda responde em vez de estourar", async () => {
    checkAdminRequest.mockReturnValue(true);
    runBakerySelfSeed.mockRejectedValue(new Error("o impossível aconteceu"));

    const res = await POST(req());

    expect(res.status).toBe(503);
    expect((await res.json()).success).toBe(false);
  });
});
