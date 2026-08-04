/**
 * POST /api/pedido/[slug]/customer-address — public "add address" for the ordering flow.
 *
 * Security (CR C1): creating an address requires a PROOF of phone possession (signed
 * waToken). The owning customer is resolved from the proven phone; a client-supplied
 * customerId in the body is ignored. Tests prove:
 *   (c) without proof → 401, the service is never called;
 *   (c') with proof → create runs against the RESOLVED customerId, not the body one.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const db = vi.hoisted(() => ({
  restaurant: { findUnique: vi.fn() },
  customer:   { findFirst: vi.fn() },
}));
vi.mock("@/lib/prisma", () => ({ prisma: db }));
vi.mock("@/lib/rate-limit", () => ({
  rateLimit: () => ({ limited: false }),
  getClientIp: () => "1.1.1.1",
  rateLimitResponse: () => new Response(null, { status: 429 }),
}));
const svc = vi.hoisted(() => ({ AddressService: { create: vi.fn() } }));
vi.mock("@/services/customer/AddressService", () => svc);

process.env.NODE_ENV = process.env.NODE_ENV ?? "test";

import { signWaToken } from "@/lib/wa-token";
import { PEDIDO_TOKEN_HEADER } from "@/lib/pedido-identity";
import { POST } from "./route";

const PHONE  = "+5511940595223";
const params = Promise.resolve({ slug: "sushi" });
const VALID = {
  customerId: "c_from_body", street: "Rua A", number: "10", neighborhood: "Centro",
  city: "São Paulo", state: "SP", zipCode: "01000-000",
};
function post(body: unknown, headers: Record<string, string> = {}): NextRequest {
  return new NextRequest("https://foocci.com.br/api/pedido/sushi/customer-address", {
    method: "POST", headers: { "Content-Type": "application/json", ...headers }, body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  db.restaurant.findUnique.mockResolvedValue({ id: "rest_1" });
  db.customer.findFirst.mockResolvedValue({ id: "c_resolved", phone: PHONE });
});

describe("POST customer-address", () => {
  it("(c) 401 WITHOUT proof — even with a customerId in the body — service not called", async () => {
    const res = await POST(post(VALID), { params });
    expect(res.status).toBe(401);
    expect(svc.AddressService.create).not.toHaveBeenCalled();
  });

  it("404 when the restaurant slug does not exist", async () => {
    db.restaurant.findUnique.mockResolvedValue(null);
    const token = signWaToken({ phone: PHONE });
    const res = await POST(post(VALID, { [PEDIDO_TOKEN_HEADER]: token }), { params });
    expect(res.status).toBe(404);
  });

  it("400 on an invalid address (bad CEP) once proven", async () => {
    const token = signWaToken({ phone: PHONE });
    const res = await POST(post({ ...VALID, zipCode: "abc" }, { [PEDIDO_TOKEN_HEADER]: token }), { params });
    expect(res.status).toBe(400);
    expect(svc.AddressService.create).not.toHaveBeenCalled();
  });

  it("(c') WITH proof → creates against the RESOLVED customerId, ignoring the body one", async () => {
    svc.AddressService.create.mockResolvedValue({ ok: true, data: { id: "a1", isDefault: true } });
    const token = signWaToken({ phone: PHONE });
    const res = await POST(post(VALID, { [PEDIDO_TOKEN_HEADER]: token }), { params });
    expect(res.status).toBe(201);
    const [restaurantId, customerId, address] = svc.AddressService.create.mock.calls[0];
    expect(restaurantId).toBe("rest_1");
    expect(customerId).toBe("c_resolved");        // from the token, NOT "c_from_body"
    expect(address.customerId).toBeUndefined();    // stripped before hitting the service
    expect(address.street).toBe("Rua A");
  });
});
