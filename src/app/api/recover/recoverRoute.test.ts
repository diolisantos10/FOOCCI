/**
 * Portão da rota /api/recover.
 *
 * Esta rota é isenta de autenticação no middleware e CRIA UMA CONTA OWNER. Os dois
 * defeitos que este teste existe para impedir de voltar:
 *
 *   1. não exigia credencial nenhuma — o único portão era "não existe OWNER ativo",
 *      que é estado do banco, não prova de quem chamou;
 *   2. escolhia "o primeiro restaurante ativo" (`findFirst({ isActive: true })`) —
 *      id não provado com outro nome.
 *
 * As duas metades de cada portão são obrigatórias:
 *   - credencial: reprova SEM ela (1x,1b,1c) e passa COM ela (4);
 *   - alvo: recusa o restaurante de outro dono (3a) e deixa passar o legítimo (4).
 * Sem a segunda metade de cada par, "negar tudo" satisfaria o teste.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

const findFirstRestaurant = vi.fn();
const findManyRestaurant  = vi.fn();
const findFirstUser       = vi.fn();
const $transaction        = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    restaurant: {
      findFirst: (...a: unknown[]) => findFirstRestaurant(...a),
      findMany:  (...a: unknown[]) => findManyRestaurant(...a),
    },
    user: { findFirst: (...a: unknown[]) => findFirstUser(...a) },
    $transaction: (...a: unknown[]) => $transaction(...a),
  },
}));

vi.mock("bcryptjs", () => ({ hash: vi.fn(async () => "hashed") }));
vi.mock("@/lib/audit", () => ({ auditLog: vi.fn() }));
vi.mock("@/lib/rate-limit", () => ({
  rateLimit: () => ({ limited: false }),
  getClientIp: () => "1.2.3.4",
}));

import { GET, POST } from "./route";

const GOOD_BODY = {
  ownerName: "Fulano de Tal",
  ownerEmail: "fulano@exemplo.com",
  ownerPassword: "senha-forte-123",
};

/** Restaurante A = o "primeiro ativo". Restaurante B = o de outro dono. */
const REST_A = { id: "rest_A", name: "Restaurante A" };
const REST_B = { id: "rest_B", name: "Restaurante B" };

function req(opts: {
  headers?: Record<string, string>;
  body?: unknown;
  search?: string;
} = {}) {
  const headers = opts.headers ?? {};
  return {
    headers: { get: (k: string) => headers[k.toLowerCase()] ?? null },
    nextUrl: { searchParams: new URLSearchParams(opts.search ?? "") },
    json: async () => {
      if (opts.body === undefined) throw new Error("no body");
      return opts.body;
    },
  } as unknown as Parameters<typeof POST>[0];
}

const OLD = process.env.ADMIN_SECRET;
beforeEach(() => {
  vi.clearAllMocks();
  process.env.ADMIN_SECRET = "chave-de-admin";
  // Padrão: dois restaurantes ativos (multi-inquilino), nenhum OWNER ativo.
  findManyRestaurant.mockResolvedValue([REST_A, REST_B]);
  findFirstRestaurant.mockImplementation(async (args: { where: { id?: string } }) => {
    if (args.where.id === REST_A.id) return REST_A;
    if (args.where.id === REST_B.id) return REST_B;
    return null;
  });
  findFirstUser.mockResolvedValue(null);
  $transaction.mockImplementation(async (fn: (tx: unknown) => unknown) =>
    fn({
      user: {
        findFirst: async () => null,
        update: async () => ({}),
        create: async () => ({}),
      },
    }),
  );
});
afterEach(() => {
  process.env.ADMIN_SECRET = OLD;
});

// ── PORTÃO 1, metade A: REPROVA sem a credencial ────────────────────────────

describe("POST /api/recover — metade 1: REPROVA sem a credencial", () => {
  it("(1a) sem cabeçalho x-admin-secret → 401 e NÃO cria owner", async () => {
    const res = await POST(req({ body: GOOD_BODY }));
    expect(res.status).toBe(401);
    expect($transaction).not.toHaveBeenCalled();
  });

  it("(1b) com chave errada → 401 e NÃO cria owner", async () => {
    const res = await POST(req({ headers: { "x-admin-secret": "errada" }, body: GOOD_BODY }));
    expect(res.status).toBe(401);
    expect($transaction).not.toHaveBeenCalled();
  });

  it("(1c) FALHA FECHADA: sem ADMIN_SECRET configurado → 503, nunca liberado", async () => {
    delete process.env.ADMIN_SECRET;
    const res = await POST(req({ headers: { "x-admin-secret": "qualquer" }, body: GOOD_BODY }));
    expect(res.status).toBe(503);
    expect($transaction).not.toHaveBeenCalled();
  });

  it("(1d) FALHA FECHADA: sem ADMIN_SECRET e sem cabeçalho → 503", async () => {
    delete process.env.ADMIN_SECRET;
    const res = await POST(req({ body: GOOD_BODY }));
    expect(res.status).toBe(503);
    expect($transaction).not.toHaveBeenCalled();
  });
});

// ── PORTÃO 2: o alvo é provado, não adivinhado ──────────────────────────────

describe("POST /api/recover — metade 2: o restaurante é NOMEADO, nunca 'o primeiro ativo'", () => {
  it("(2) nunca usa findFirst({isActive:true}) sem id — com 2 ativos e sem id, exige o id (403)", async () => {
    const res = await POST(req({ headers: { "x-admin-secret": "chave-de-admin" }, body: GOOD_BODY }));
    const body = await res.json();
    expect(res.status).toBe(403);
    expect(body.error).toMatch(/restaurantId is required/i);
    expect($transaction).not.toHaveBeenCalled();
  });

  it("(3a) RECUSA o id de outro dono: restaurante B já tem OWNER ativo → 403", async () => {
    findFirstUser.mockResolvedValue({ id: "user_dono_do_B" });
    const res = await POST(req({
      headers: { "x-admin-secret": "chave-de-admin" },
      body: { ...GOOD_BODY, restaurantId: REST_B.id },
    }));
    const body = await res.json();
    expect(res.status).toBe(403);
    expect(body.error).toMatch(/active owner account already exists/i);
    expect($transaction).not.toHaveBeenCalled();
  });

  it("(3b) RECUSA id inexistente — e não cai no 'primeiro ativo' como consolo", async () => {
    const res = await POST(req({
      headers: { "x-admin-secret": "chave-de-admin" },
      body: { ...GOOD_BODY, restaurantId: "rest_que_nao_existe" },
    }));
    const body = await res.json();
    expect(res.status).toBe(403);
    expect(body.error).toMatch(/not found/i);
    expect($transaction).not.toHaveBeenCalled();
  });

  it("(3c) RECUSA restaurante inativo", async () => {
    findFirstRestaurant.mockResolvedValue(null); // where inclui isActive:true
    const res = await POST(req({
      headers: { "x-admin-secret": "chave-de-admin" },
      body: { ...GOOD_BODY, restaurantId: REST_B.id },
    }));
    expect(res.status).toBe(403);
    expect($transaction).not.toHaveBeenCalled();
  });

  it("(4) PASSA: credencial correta + id legítimo sem OWNER ativo → 201 e cria no restaurante PEDIDO", async () => {
    const res = await POST(req({
      headers: { "x-admin-secret": "chave-de-admin" },
      body: { ...GOOD_BODY, restaurantId: REST_B.id },
    }));
    const body = await res.json();
    expect(res.status).toBe(201);
    expect($transaction).toHaveBeenCalledTimes(1);
    // O alvo é o B — o que foi pedido — e não o A, que era "o primeiro ativo".
    expect(body.restaurantName).toBe(REST_B.name);
    expect(findFirstRestaurant).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ id: REST_B.id }) }),
    );
  });

  it("(5) instalação única: com exatamente 1 restaurante ativo, o id pode ser omitido", async () => {
    findManyRestaurant.mockResolvedValue([REST_A]);
    const res = await POST(req({ headers: { "x-admin-secret": "chave-de-admin" }, body: GOOD_BODY }));
    const body = await res.json();
    expect(res.status).toBe(201);
    expect(body.restaurantName).toBe(REST_A.name);
  });
});

// ── GET não anuncia o alvo a anônimo ────────────────────────────────────────

describe("GET /api/recover — não revela o alvo sem credencial", () => {
  it("(6) sem credencial → 401 e nenhum nome de restaurante vazado", async () => {
    const res = await GET(req());
    const body = await res.json();
    expect(res.status).toBe(401);
    expect(body.restaurantName).toBeNull();
    expect(body.reason).toBe("auth_required");
    expect(findManyRestaurant).not.toHaveBeenCalled();
    expect(findFirstRestaurant).not.toHaveBeenCalled();
  });

  it("(7) com credencial → responde o estado normalmente", async () => {
    findManyRestaurant.mockResolvedValue([REST_A]);
    const res = await GET(req({ headers: { "x-admin-secret": "chave-de-admin" } }));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.recoveryAllowed).toBe(true);
    expect(body.restaurantName).toBe(REST_A.name);
  });
});
