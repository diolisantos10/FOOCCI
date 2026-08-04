/**
 * resolvePedidoIdentity — the proof-of-phone gate for the public "área do cliente".
 *
 * Proves (CR C1):
 *  - no token           → null (reveals nothing)
 *  - forged/wrong-secret → null (HMAC can't be faked from the phone alone)
 *  - valid token, phone  → resolves the customer FROM THE PHONE (customerId in the
 *                          request is never trusted)
 *  - valid token, phone not a customer here → null (cross-restaurant safe)
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const db = vi.hoisted(() => ({ customer: { findFirst: vi.fn() } }));
vi.mock("@/lib/prisma", () => ({ prisma: db }));

process.env.NODE_ENV = process.env.NODE_ENV ?? "test";

import { signWaToken } from "./wa-token";
import { resolvePedidoIdentity, PEDIDO_TOKEN_HEADER } from "./pedido-identity";

const PHONE = "+5511940595223";
const reqWith = (headers: Record<string, string> = {}) =>
  new NextRequest("https://foocci.com.br/api/pedido/sushi/customer-profile", { headers });

beforeEach(() => {
  vi.clearAllMocks();
  db.customer.findFirst.mockResolvedValue({ id: "c1", phone: PHONE });
});

describe("resolvePedidoIdentity", () => {
  it("returns null when no token is present (no DB lookup)", async () => {
    const res = await resolvePedidoIdentity(reqWith(), "rest_1");
    expect(res).toBeNull();
    expect(db.customer.findFirst).not.toHaveBeenCalled();
  });

  it("returns null for a token forged with the wrong secret", async () => {
    const orig = process.env.NEXTAUTH_SECRET;
    process.env.NEXTAUTH_SECRET = "secret-A";
    const token = signWaToken({ phone: PHONE });
    process.env.NEXTAUTH_SECRET = "secret-B";
    const res = await resolvePedidoIdentity(reqWith({ [PEDIDO_TOKEN_HEADER]: token }), "rest_1");
    process.env.NEXTAUTH_SECRET = orig;
    expect(res).toBeNull();
    expect(db.customer.findFirst).not.toHaveBeenCalled();
  });

  it("resolves the customer from the PROVEN phone, scoped to the restaurant", async () => {
    const token = signWaToken({ phone: PHONE });
    const res = await resolvePedidoIdentity(reqWith({ [PEDIDO_TOKEN_HEADER]: token }), "rest_1");
    expect(res).toEqual({ customerId: "c1", phone: PHONE });
    // Lookup is by phone within the tenant — never by a client-supplied id.
    const where = db.customer.findFirst.mock.calls[0][0].where;
    expect(where.restaurantId).toBe("rest_1");
    expect(where.phone.in).toContain(PHONE);
  });

  it("returns null when the proven phone is not a customer of this restaurant", async () => {
    db.customer.findFirst.mockResolvedValue(null);
    const token = signWaToken({ phone: PHONE });
    const res = await resolvePedidoIdentity(reqWith({ [PEDIDO_TOKEN_HEADER]: token }), "rest_1");
    expect(res).toBeNull();
  });
});
