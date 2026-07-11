/**
 * GET /api/v1/clientes — hermetic. The critical guarantee: customer PII is
 * NEVER returned unless the key holds customers:read (403 otherwise), the query
 * is scoped to the key's restaurant, and anonymous guests are excluded.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";

const svc = vi.hoisted(() => ({ resolveApiKey: vi.fn() }));
vi.mock("@/services/api/ApiKeyService", () => svc);

const db = vi.hoisted(() => ({ customer: { findMany: vi.fn() } }));
vi.mock("@/lib/prisma", () => ({ prisma: db }));

import { GET } from "./route";

type Req = Parameters<typeof GET>[0];
function req(auth: string | null, url = "https://x/api/v1/clientes"): Req {
  return { headers: new Headers(auth ? { authorization: auth } : {}), nextUrl: new URL(url) } as unknown as Req;
}

beforeEach(() => vi.clearAllMocks());

describe("GET /api/v1/clientes", () => {
  it("403 when the key lacks customers:read — PII stays locked", async () => {
    svc.resolveApiKey.mockResolvedValue({ restaurantId: "r1", keyId: "k1", scopes: ["sales:read"] });
    const res = await GET(req("Bearer fck_ok"));
    expect(res.status).toBe(403);
    expect(db.customer.findMany).not.toHaveBeenCalled();
  });

  it("401 when the key is invalid", async () => {
    svc.resolveApiKey.mockResolvedValue(null);
    expect((await GET(req("Bearer fck_bad"))).status).toBe(401);
  });

  it("returns customers (scoped to the restaurant, guests excluded) when granted", async () => {
    svc.resolveApiKey.mockResolvedValue({ restaurantId: "r1", keyId: "k1", scopes: ["customers:read"] });
    db.customer.findMany.mockResolvedValue([
      { id: "c1", name: "Ana", phone: "+5511999", email: null, tier: "OURO", segment: "QUENTE",
        totalOrders: 4, totalSpend: "400.00", averageTicket: null, lastOrderAt: new Date("2026-07-01T00:00:00.000Z"),
        hasOptedOut: false, createdAt: new Date("2026-01-01T00:00:00.000Z") },
    ]);
    const res = await GET(req("Bearer fck_ok"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data[0]).toMatchObject({
      id: "c1", nome: "Ana", telefone: "+5511999", tier: "OURO",
      totalPedidos: 4, totalGasto: 400, ticketMedio: 100, optOut: false,
    });
    const where = db.customer.findMany.mock.calls[0][0].where;
    expect(where.restaurantId).toBe("r1");
    expect(where.isGuest).toBe(false); // anonymous sessions never exported
  });
});
