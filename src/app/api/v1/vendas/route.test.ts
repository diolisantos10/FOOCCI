/**
 * GET /api/v1/vendas — hermetic (ApiKeyService + prisma mocked). Covers auth
 * (401 on bad/missing Bearer), input validation (400 on bad `desde`), and the
 * documented response mapping for a valid key.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";

const svc = vi.hoisted(() => ({ resolveApiKey: vi.fn() }));
vi.mock("@/services/api/ApiKeyService", () => svc);

const db = vi.hoisted(() => ({ order: { findMany: vi.fn() } }));
vi.mock("@/lib/prisma", () => ({ prisma: db }));

import { GET } from "./route";

type Req = Parameters<typeof GET>[0];
function req(auth: string | null, url = "https://foocci.com.br/api/v1/vendas"): Req {
  return {
    headers: new Headers(auth ? { authorization: auth } : {}),
    nextUrl: new URL(url),
  } as unknown as Req;
}

beforeEach(() => vi.clearAllMocks());

describe("GET /api/v1/vendas", () => {
  it("401 when the Bearer key is missing or invalid", async () => {
    svc.resolveApiKey.mockResolvedValue(null);
    const res = await GET(req("Bearer fck_bad"));
    expect(res.status).toBe(401);
  });

  it("403 when the key lacks the sales:read scope", async () => {
    svc.resolveApiKey.mockResolvedValue({ restaurantId: "r1", keyId: "k1", scopes: ["customers:read"] });
    const res = await GET(req("Bearer fck_ok"));
    expect(res.status).toBe(403);
    expect(db.order.findMany).not.toHaveBeenCalled();
  });

  it("400 for a malformed `desde`", async () => {
    svc.resolveApiKey.mockResolvedValue({ restaurantId: "r1", keyId: "k1", scopes: ["sales:read"] });
    const res = await GET(req("Bearer fck_ok", "https://x/api/v1/vendas?desde=11-07-2026"));
    expect(res.status).toBe(400);
    expect(db.order.findMany).not.toHaveBeenCalled();
  });

  it("maps orders to the documented shape and scopes the query to the key's restaurant", async () => {
    svc.resolveApiKey.mockResolvedValue({ restaurantId: "r1", keyId: "k1", scopes: ["sales:read"] });
    db.order.findMany.mockResolvedValue([
      { id: "o1", orderNumber: 10231, total: "125.90", type: "DELIVERY",
        createdAt: new Date("2026-07-11T18:22:04.000Z"), items: [{ quantity: 2 }, { quantity: 1 }] },
      { id: "o2", orderNumber: null, total: "40.00", type: "PICKUP",
        createdAt: new Date("2026-07-11T19:00:00.000Z"), items: [] },
    ]);

    const res = await GET(req("Bearer fck_ok", "https://x/api/v1/vendas?desde=2026-07-01"));
    expect(res.status).toBe(200);
    const body = await res.json();

    expect(body.data).toEqual([
      { id: "PED-10231", valor: 125.9, data: "2026-07-11T18:22:04.000Z", canal: "Delivery", vendas: 1, itens: 3 },
      { id: "o2",        valor: 40,    data: "2026-07-11T19:00:00.000Z", canal: "Retirada",  vendas: 1, itens: 0 },
    ]);
    expect(body.meta.count).toBe(2);

    const where = db.order.findMany.mock.calls[0][0].where;
    expect(where.restaurantId).toBe("r1");
    expect(where.status.in).toContain("DELIVERED");
    expect(where.status.in).not.toContain("PENDING");
    expect(where.createdAt.gte).toEqual(new Date("2026-07-01T00:00:00.000Z"));
  });

  it("defaults to a 30-day window when `desde` is omitted", async () => {
    svc.resolveApiKey.mockResolvedValue({ restaurantId: "r1", keyId: "k1", scopes: ["sales:read"] });
    db.order.findMany.mockResolvedValue([]);
    const res = await GET(req("Bearer fck_ok"));
    expect(res.status).toBe(200);
    expect(db.order.findMany.mock.calls[0][0].where.createdAt.gte).toBeInstanceOf(Date);
  });
});
