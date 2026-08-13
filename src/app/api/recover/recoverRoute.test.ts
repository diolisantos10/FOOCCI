/**
 * Portão de `/api/recover` — a rota PÚBLICA que cria conta de proprietário.
 *
 * As duas metades, sempre: **recusa** no estado errado e **libera** no estado de
 * instalação. Um teste que só provasse a recusa deixaria a rota morrer sem ninguém
 * notar; um que só provasse a liberação é o furo de volta.
 *
 * SABOTAGEM CONFERIDA (13/08): trocar `restaurants.length > 1 → recusa` pelo antigo
 * `findFirst({ isActive: true })` faz "banco com dois restaurantes" passar a criar
 * OWNER no primeiro que o banco devolver. O caso (2) reprova.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";

const findMany = vi.fn();
const userFindFirst = vi.fn();
const userCreate = vi.fn();
const userUpdate = vi.fn();

vi.mock("@/lib/prisma", () => {
  // O objeto nasce DENTRO da fábrica: `vi.mock` é içado para o topo do arquivo e
  // uma referência a variável de fora estoura antes de existir.
  const db: Record<string, unknown> = {
    restaurant: { findMany: (...a: unknown[]) => findMany(...a) },
    user: {
      findFirst: (...a: unknown[]) => userFindFirst(...a),
      create: (...a: unknown[]) => userCreate(...a),
      update: (...a: unknown[]) => userUpdate(...a),
    },
  };
  // A transação roda o MESMO cliente falso — é o que permite provar que o portão
  // inteiro é reavaliado lá dentro.
  db.$transaction = (fn: (tx: unknown) => unknown) => fn(db);
  return { prisma: db };
});
vi.mock("bcryptjs", () => ({ hash: async () => "hash-falso" }));

import { GET, POST } from "./route";

const VALID_BODY = {
  ownerName: "João Silva",
  ownerEmail: "joao@pizzaria.com",
  ownerPassword: "senha-de-8-ou-mais",
};

let ipCounter = 0;
/** Cada chamada com um IP novo — o limitador é global e não pode contaminar casos. */
function req(body: unknown = VALID_BODY) {
  ipCounter += 1;
  return {
    headers: new Headers({ "x-forwarded-for": `10.0.0.${ipCounter}` }),
    json: async () => body,
  } as unknown as Parameters<typeof POST>[0];
}

const UM_RESTAURANTE = [{ id: "r1", name: "Pizzaria Nonna", isActive: true }];
const DOIS_RESTAURANTES = [
  { id: "r1", name: "Pizzaria Nonna", isActive: true },
  { id: "r2", name: "Bar do Zé", isActive: true },
];

beforeEach(() => {
  vi.clearAllMocks();
  userFindFirst.mockResolvedValue(null);
  userCreate.mockResolvedValue({ id: "u1" });
  userUpdate.mockResolvedValue({ id: "u1" });
});

describe("POST /api/recover — quem pode virar dono", () => {
  it("(1) LIBERA no estado de instalação: um restaurante, ativo, sem proprietário", async () => {
    findMany.mockResolvedValue(UM_RESTAURANTE);
    const res = await POST(req());
    expect(res.status).toBe(201);
    expect(userCreate).toHaveBeenCalledTimes(1);
    expect(userCreate.mock.calls[0]![0].data).toMatchObject({
      restaurantId: "r1",
      role: "OWNER",
    });
  });

  it("(2) RECUSA quando existe mais de um restaurante no banco — sem alvo, sem conta", async () => {
    findMany.mockResolvedValue(DOIS_RESTAURANTES);
    const res = await POST(req());
    expect(res.status).toBe(403);
    expect(userCreate).not.toHaveBeenCalled();
    expect(userUpdate).not.toHaveBeenCalled();
  });

  it("(3) RECUSA quando o único restaurante já tem proprietário ativo", async () => {
    findMany.mockResolvedValue(UM_RESTAURANTE);
    userFindFirst.mockResolvedValueOnce({ id: "owner-1" });
    const res = await POST(req());
    expect(res.status).toBe(403);
    expect(userCreate).not.toHaveBeenCalled();
  });

  it("(4) RECUSA quando não há restaurante nenhum", async () => {
    findMany.mockResolvedValue([]);
    const res = await POST(req());
    expect(res.status).toBe(403);
    expect(userCreate).not.toHaveBeenCalled();
  });

  it("(5) RECUSA quando o único restaurante está desativado", async () => {
    findMany.mockResolvedValue([{ id: "r1", name: "Fechado", isActive: false }]);
    const res = await POST(req());
    expect(res.status).toBe(403);
    expect(userCreate).not.toHaveBeenCalled();
  });

  it("(6) RECUSA quando o banco cai — erro nunca vira liberação", async () => {
    findMany.mockRejectedValue(new Error("sem conexão"));
    const res = await POST(req());
    expect(res.status).toBe(503);
    expect(userCreate).not.toHaveBeenCalled();
  });

  it("(7) toda mensagem de recusa está em português", async () => {
    findMany.mockResolvedValue(DOIS_RESTAURANTES);
    const body = await (await POST(req())).json();
    expect(body.error).toMatch(/[çãáéêõí]/);
    expect(body.error).not.toMatch(/Unauthorized|Forbidden|not available/i);
  });

  it("(8) valida o corpo antes de escrever qualquer coisa", async () => {
    findMany.mockResolvedValue(UM_RESTAURANTE);
    const res = await POST(req({ ownerName: "a", ownerEmail: "nao-e-email", ownerPassword: "123" }));
    expect(res.status).toBe(422);
    expect(userCreate).not.toHaveBeenCalled();
  });
});

describe("GET /api/recover — o que a rota anônima conta sobre o banco", () => {
  it("(9) não revela o nome do restaurante quando a recuperação está bloqueada", async () => {
    findMany.mockResolvedValue(UM_RESTAURANTE);
    userFindFirst.mockResolvedValueOnce({ id: "owner-1" });
    const body = await (await GET()).json();
    expect(body.recoveryAllowed).toBe(false);
    expect(body.restaurantName).toBeNull();
    expect(JSON.stringify(body)).not.toContain("Pizzaria Nonna");
  });

  it("(10) revela o nome só quando vai mesmo criar a conta", async () => {
    findMany.mockResolvedValue(UM_RESTAURANTE);
    const body = await (await GET()).json();
    expect(body.recoveryAllowed).toBe(true);
    expect(body.restaurantName).toBe("Pizzaria Nonna");
  });

  it("(11) banco com dois restaurantes: bloqueado e sem nome nenhum", async () => {
    findMany.mockResolvedValue(DOIS_RESTAURANTES);
    const body = await (await GET()).json();
    expect(body.recoveryAllowed).toBe(false);
    expect(body.restaurantName).toBeNull();
    expect(JSON.stringify(body)).not.toContain("Bar do Zé");
  });
});
