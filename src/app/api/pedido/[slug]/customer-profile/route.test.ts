/**
 * /api/pedido/[slug]/customer-profile — the "área do cliente" profile feed.
 *
 * Guarantees: scoped to the slug's restaurant (a customer from another
 * restaurant is not returned), returns null profile without a customerId, and
 * maps name → first/last plus addresses (default first) on success.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const db = vi.hoisted(() => ({
  restaurant: { findUnique: vi.fn() },
  customer:   { findFirst: vi.fn() },
  address:    { findMany: vi.fn() },
}));
vi.mock("@/lib/prisma", () => ({ prisma: db }));
vi.mock("@/lib/rate-limit", () => ({
  rateLimit: () => ({ limited: false }),
  getClientIp: () => "1.1.1.1",
  rateLimitResponse: () => new Response(null, { status: 429 }),
}));

import { GET } from "./route";

const params = Promise.resolve({ slug: "sushi" });
const getReq = (qs: string) => new NextRequest(`https://foocci.com.br/api/pedido/sushi/customer-profile${qs}`);

beforeEach(() => {
  vi.clearAllMocks();
  db.restaurant.findUnique.mockResolvedValue({ id: "rest_1" });
  db.address.findMany.mockResolvedValue([]);
});

describe("GET customer-profile", () => {
  it("returns null profile without a customerId (no DB lookup)", async () => {
    const res = await GET(getReq(""), { params });
    expect(await res.json()).toEqual({ profile: null });
    expect(db.customer.findFirst).not.toHaveBeenCalled();
  });

  it("returns null when the customer belongs to another restaurant (scoping)", async () => {
    db.customer.findFirst.mockResolvedValue(null); // WHERE restaurantId doesn't match → no row
    const res = await GET(getReq("?customerId=c1"), { params });
    expect(await res.json()).toEqual({ profile: null });
    // The query is always tenant-scoped.
    expect(db.customer.findFirst.mock.calls[0][0].where).toMatchObject({ id: "c1", restaurantId: "rest_1" });
  });

  it("maps name → first/last and returns addresses (default first)", async () => {
    db.customer.findFirst.mockResolvedValue({
      id: "c1", name: "Diego Santos Silva", phone: "+5511940595223", email: "d@x.com", tier: "OURO",
    });
    db.address.findMany.mockResolvedValue([
      { id: "a1", label: "Casa", street: "Rua A", number: "10", complement: null, neighborhood: "Centro", city: "SP", state: "SP", zipCode: "01000-000", isDefault: true },
    ]);
    const res = await GET(getReq("?customerId=c1"), { params });
    const body = await res.json();
    expect(body.profile).toMatchObject({
      name: "Diego Santos Silva", firstName: "Diego", lastName: "Santos Silva",
      phone: "+5511940595223", email: "d@x.com", tier: "OURO",
    });
    expect(body.profile.addresses[0]).toMatchObject({ id: "a1", isDefault: true });
    // addresses are requested default-first
    expect(db.address.findMany.mock.calls[0][0].orderBy[0]).toEqual({ isDefault: "desc" });
  });
});
