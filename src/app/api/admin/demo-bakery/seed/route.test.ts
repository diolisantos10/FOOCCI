/**
 * /api/admin/demo-bakery/seed — a rota que o botão "Criar/atualizar a padaria"
 * chama. `/api/admin/**` está em PUBLIC_PATHS de propósito: o middleware NÃO
 * protege esta rota, a guarda dentro dela protege. Estes testes provam isso.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

const checkAdminRequest = vi.fn();
const seedBakery = vi.fn();
const getBakeryOverview = vi.fn();

vi.mock("@/lib/admin-auth", () => ({
  checkAdminRequest: (...a: unknown[]) => checkAdminRequest(...a),
}));
vi.mock("@/services/demo/FoocciBakeryService", async (importOriginal) => {
  // O erro e a tabela de status são REAIS — a tradução código → HTTP é o que
  // está sendo testado; mocká-la testaria o mock.
  const real = await importOriginal<typeof import("@/services/demo/FoocciBakeryService")>();
  return {
    ...real,
    seedBakery: (...a: unknown[]) => seedBakery(...a),
    getBakeryOverview: (...a: unknown[]) => getBakeryOverview(...a),
  };
});

import { BakeryOperationError } from "@/services/demo/FoocciBakeryService";
import { GET, POST } from "./route";

function req(body?: unknown) {
  return {
    json: async () => body ?? {},
  } as unknown as Parameters<typeof POST>[0];
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.ADMIN_SECRET = "segredo-de-teste";
});

describe("POST /api/admin/demo-bakery/seed", () => {
  it("exige admin — 401 e o serviço nem é chamado", async () => {
    checkAdminRequest.mockReturnValue(false);
    const res = await POST(req());
    expect(res.status).toBe(401);
    expect(seedBakery).not.toHaveBeenCalled();
  });

  it("com admin, roda o seed e devolve os números e as três rotas", async () => {
    checkAdminRequest.mockReturnValue(true);
    seedBakery.mockResolvedValue({
      dryRun: false,
      restaurantCreated: true,
      categoriesCreated: 7,
      categoriesUpdated: 0,
      itemsCreated: 40,
      itemsUpdated: 0,
      itemsWithoutImage: 40,
      routes: {
        mesaQr: "/qr/foocci-bakery",
        lojaSemIa: "/pedido/foocci-bakery?modo=loja",
        garcomIa: "/pedido/foocci-bakery",
      },
    });

    const res = await POST(req({}));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data.itemsCreated).toBe(40);
    expect(body.data.routes.garcomIa).toBe("/pedido/foocci-bakery");
  });

  it("body vazio ou inválido não quebra: vira execução padrão (nem dry-run, nem prune)", async () => {
    checkAdminRequest.mockReturnValue(true);
    seedBakery.mockResolvedValue({ routes: {}, itemsWithoutImage: 0 });
    await POST(req({ prune: "sim, por favor" }));
    expect(seedBakery).toHaveBeenCalledWith({});
  });

  it("recusa conhecida vira status próprio + frase legível (nunca 500 anônimo)", async () => {
    checkAdminRequest.mockReturnValue(true);
    seedBakery.mockRejectedValue(
      new BakeryOperationError("JA_EM_ANDAMENTO", "A criação da padaria já está rodando."),
    );

    const res = await POST(req({}));
    const body = await res.json();

    expect(res.status).toBe(409);
    expect(body.error).toContain("já está rodando");
    expect(body.code).toBe("JA_EM_ANDAMENTO");
  });

  it("erro inesperado responde em português e não vaza detalhe técnico", async () => {
    checkAdminRequest.mockReturnValue(true);
    seedBakery.mockRejectedValue(new Error("ECONNRESET no pool do Postgres"));

    const res = await POST(req({}));
    const body = await res.json();

    expect(res.status).toBe(500);
    expect(body.error).toContain("erro inesperado");
    expect(JSON.stringify(body)).not.toContain("ECONNRESET");
  });
});

describe("GET /api/admin/demo-bakery/seed", () => {
  it("exige admin — 401", async () => {
    checkAdminRequest.mockReturnValue(false);
    const res = await GET(req());
    expect(res.status).toBe(401);
    expect(getBakeryOverview).not.toHaveBeenCalled();
  });

  it("devolve o retrato da padaria para a tela abrir já sabendo o que dizer", async () => {
    checkAdminRequest.mockReturnValue(true);
    getBakeryOverview.mockResolvedValue({ padariaExiste: false, totalItens: 0, semFoto: 0 });
    const res = await GET(req());
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.data.padariaExiste).toBe(false);
  });
});
