/**
 * /api/admin/infra-credentials — a rota que guarda a chave-mestra.
 *
 * O que estes testes seguram:
 *   (a) sem admin, 401 — e o cofre nem é consultado;
 *   (b) o token NUNCA aparece na resposta, nem no caminho de sucesso, nem no de erro;
 *   (5) token recusado pelo serviço volta 400 dizendo que não foi guardado;
 *   (6) remover exige confirmação explícita no servidor, não só na tela.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

const checkAdminRequest = vi.fn();
vi.mock("@/lib/admin-auth", () => ({
  checkAdminRequest: (...a: unknown[]) => checkAdminRequest(...a),
}));

const list = vi.fn();
const recentAccess = vi.fn();
const save = vi.fn();
const remove = vi.fn();

vi.mock("@/services/infra/InfraCredentialService", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/services/infra/InfraCredentialService")>();
  return {
    ...real,
    InfraCredentialService: {
      list: (...a: unknown[]) => list(...a),
      recentAccess: (...a: unknown[]) => recentAccess(...a),
      save: (...a: unknown[]) => save(...a),
      remove: (...a: unknown[]) => remove(...a),
    },
  };
});

import { InvalidCredentialError } from "@/services/infra/InfraCredentialService";
import { GET, PUT } from "./route";
import { DELETE } from "./[service]/route";

const TOKEN = "railway-token-super-secreto-9999";

function req(body?: unknown, url = "https://foocci.com.br/api/admin/infra-credentials") {
  return {
    json: async () => body ?? {},
    nextUrl: new URL(url),
  } as unknown as Parameters<typeof PUT>[0];
}

const VIEW = {
  service: "railway",
  label: "Railway",
  whatItIs: "onde o Foocci fica hospedado",
  whereToGet: "railway.app → Tokens",
  blastRadius: "lê e troca todas as senhas",
  canValidate: true,
  stored: true,
  last4: "9999",
  tokenLength: TOKEN.length,
  savedBy: "admin",
  savedAt: "2026-08-04T10:00:00.000Z",
  validationStatus: "valid" as const,
  validationDetail: "Token de conta — dioli@x.com.",
  validatedAt: "2026-08-04T10:00:00.000Z",
  useCount: 0,
  lastUsedAt: null,
};

beforeEach(() => {
  vi.clearAllMocks();
  process.env.ADMIN_SECRET = "segredo-de-teste";
  list.mockResolvedValue([VIEW]);
  recentAccess.mockResolvedValue([]);
  save.mockResolvedValue({
    view: VIEW,
    validationStatus: "valid",
    validationDetail: "Token de conta — dioli@x.com.",
  });
  remove.mockResolvedValue(true);
});

describe("(a) a rota exige admin", () => {
  it("GET sem admin → 401 e o cofre nem é consultado", async () => {
    checkAdminRequest.mockReturnValue(false);
    const res = await GET(req());
    expect(res.status).toBe(401);
    expect(list).not.toHaveBeenCalled();
  });

  it("PUT sem admin → 401 e nada é guardado", async () => {
    checkAdminRequest.mockReturnValue(false);
    const res = await PUT(req({ service: "railway", token: TOKEN }));
    expect(res.status).toBe(401);
    expect(save).not.toHaveBeenCalled();
  });

  it("DELETE sem admin → 401 e nada é apagado", async () => {
    checkAdminRequest.mockReturnValue(false);
    const res = await DELETE(
      req(undefined, "https://foocci.com.br/api/admin/infra-credentials/railway?confirmar=1"),
      { params: { service: "railway" } },
    );
    expect(res.status).toBe(401);
    expect(remove).not.toHaveBeenCalled();
  });
});

describe("(b) o valor NUNCA volta na resposta", () => {
  it("GET devolve só last4 e metadados", async () => {
    checkAdminRequest.mockReturnValue(true);
    const res = await GET(req());
    const body = await res.text();

    expect(res.status).toBe(200);
    expect(body).not.toContain(TOKEN);
    expect(body).toContain("9999");
  });

  it("PUT devolve a vista mascarada — o token enviado não ecoa de volta", async () => {
    checkAdminRequest.mockReturnValue(true);
    const res = await PUT(req({ service: "railway", token: TOKEN }));
    const body = await res.text();

    expect(res.status).toBe(200);
    expect(body).not.toContain(TOKEN);
    // O token chegou ao serviço (foi guardado), só não voltou.
    expect(save).toHaveBeenCalledWith(
      expect.objectContaining({ service: "railway", token: TOKEN }),
    );
  });

  it("nem a resposta de ERRO ecoa o token", async () => {
    checkAdminRequest.mockReturnValue(true);
    save.mockRejectedValue(new Error(`falhou processando ${TOKEN}`));
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});

    const res = await PUT(req({ service: "railway", token: TOKEN }));
    const body = await res.text();

    expect(res.status).toBe(500);
    expect(body).not.toContain(TOKEN);
    spy.mockRestore();
  });
});

describe("(5) token recusado volta explicado, não em silêncio", () => {
  it("400 com a razão e a marca de que NÃO foi guardado", async () => {
    checkAdminRequest.mockReturnValue(true);
    save.mockRejectedValue(
      new InvalidCredentialError("O Railway respondeu que não reconhece este token."),
    );

    const res = await PUT(req({ service: "railway", token: TOKEN }));
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.error).toContain("não reconhece");
    expect(json.details).toEqual({ rejected: true });
  });

  it("sem token no corpo, 400 antes de qualquer escrita", async () => {
    checkAdminRequest.mockReturnValue(true);
    const res = await PUT(req({ service: "railway", token: "   " }));
    expect(res.status).toBe(400);
    expect(save).not.toHaveBeenCalled();
  });
});

describe("(6) remover é fácil, mas exige confirmação no servidor", () => {
  it("DELETE sem ?confirmar=1 → 400 e nada é apagado", async () => {
    checkAdminRequest.mockReturnValue(true);
    const res = await DELETE(
      req(undefined, "https://foocci.com.br/api/admin/infra-credentials/railway"),
      { params: { service: "railway" } },
    );
    expect(res.status).toBe(400);
    expect(remove).not.toHaveBeenCalled();
  });

  it("DELETE confirmado apaga e devolve o cofre atualizado", async () => {
    checkAdminRequest.mockReturnValue(true);
    const res = await DELETE(
      req(undefined, "https://foocci.com.br/api/admin/infra-credentials/railway?confirmar=1"),
      { params: { service: "railway" } },
    );
    expect(res.status).toBe(200);
    expect(remove).toHaveBeenCalledWith("railway", "admin");
  });

  it("apagar o que não existe → 404, não erro genérico", async () => {
    checkAdminRequest.mockReturnValue(true);
    remove.mockResolvedValue(false);
    const res = await DELETE(
      req(undefined, "https://foocci.com.br/api/admin/infra-credentials/railway?confirmar=1"),
      { params: { service: "railway" } },
    );
    expect(res.status).toBe(404);
  });
});
