/**
 * /api/pedido/[slug]/customer-profile — the "área do cliente" profile feed.
 *
 * Security (CR C1): the profile carries PII (e-mail + full saved addresses), so it
 * is only returned to a caller who PROVES possession of the phone (a signed waToken).
 * These tests prove:
 *   (a) without proof, the profile is NOT returned — even with a valid customerId;
 *   (b) the returning customer who proves the phone STILL gets their profile + addresses;
 *   the customer is resolved from the proven phone, never from the query customerId.
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

process.env.NODE_ENV = process.env.NODE_ENV ?? "test";

import { signWaToken } from "@/lib/wa-token";
import { PEDIDO_TOKEN_HEADER } from "@/lib/pedido-identity";
import { GET } from "./route";

const PHONE  = "+5511940595223";
const params = Promise.resolve({ slug: "sushi" });
const getReq = (qs: string, headers: Record<string, string> = {}) =>
  new NextRequest(`https://foocci.com.br/api/pedido/sushi/customer-profile${qs}`, { headers });

beforeEach(() => {
  vi.clearAllMocks();
  db.restaurant.findUnique.mockResolvedValue({ id: "rest_1" });
  db.address.findMany.mockResolvedValue([]);
});

describe("GET customer-profile", () => {
  it("(a) returns null profile WITHOUT proof — even given a valid customerId", async () => {
    const res = await GET(getReq("?customerId=c1"), { params });
    expect(await res.json()).toEqual({ profile: null });
    // No proof → the profile lookup never runs.
    expect(db.customer.findFirst).not.toHaveBeenCalled();
  });

  it("(a') returns null profile when the token is forged with the wrong secret", async () => {
    const orig = process.env.NEXTAUTH_SECRET;
    process.env.NEXTAUTH_SECRET = "secret-A";
    const token = signWaToken({ phone: PHONE });
    process.env.NEXTAUTH_SECRET = "secret-B";
    const res = await GET(getReq("?customerId=c1", { [PEDIDO_TOKEN_HEADER]: token }), { params });
    process.env.NEXTAUTH_SECRET = orig;
    expect(await res.json()).toEqual({ profile: null });
    expect(db.customer.findFirst).not.toHaveBeenCalled();
  });

  it("(b) returning customer WITH proof gets profile + addresses (resolved by phone)", async () => {
    // First findFirst: resolvePedidoIdentity → phone → customer id.
    db.customer.findFirst
      .mockResolvedValueOnce({ id: "c1", phone: PHONE })
      .mockResolvedValueOnce({ id: "c1", name: "Diego Santos Silva", phone: PHONE, email: "d@x.com", tier: "OURO" });
    db.address.findMany.mockResolvedValue([
      { id: "a1", label: "Casa", street: "Rua A", number: "10", complement: null, neighborhood: "Centro", city: "SP", state: "SP", zipCode: "01000-000", isDefault: true },
    ]);
    const token = signWaToken({ phone: PHONE });
    const res = await GET(getReq("?customerId=IGNORED", { [PEDIDO_TOKEN_HEADER]: token }), { params });
    const body = await res.json();
    expect(body.profile).toMatchObject({
      name: "Diego Santos Silva", firstName: "Diego", lastName: "Santos Silva",
      phone: PHONE, email: "d@x.com", tier: "OURO",
    });
    expect(body.profile.addresses[0]).toMatchObject({ id: "a1", isDefault: true });
    // The identity lookup is by phone within the tenant — the query customerId is ignored.
    expect(db.customer.findFirst.mock.calls[0][0].where.phone.in).toContain(PHONE);
    // The profile lookup uses the RESOLVED id, not the "IGNORED" query value.
    expect(db.customer.findFirst.mock.calls[1][0].where).toMatchObject({ id: "c1", restaurantId: "rest_1" });
  });
});
