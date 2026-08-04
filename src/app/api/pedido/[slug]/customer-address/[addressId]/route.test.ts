/**
 * PATCH/DELETE /api/pedido/[slug]/customer-address/[addressId]
 *
 * Security (CR C1): editing / deleting an address requires a PROOF of phone
 * possession. The owning customer is resolved from the proven phone. Tests prove:
 *   without proof → 401 (service not called); with proof → runs against the resolved id.
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
const svc = vi.hoisted(() => ({ AddressService: { update: vi.fn(), remove: vi.fn() } }));
vi.mock("@/services/customer/AddressService", () => svc);

process.env.NODE_ENV = process.env.NODE_ENV ?? "test";

import { signWaToken } from "@/lib/wa-token";
import { PEDIDO_TOKEN_HEADER } from "@/lib/pedido-identity";
import { PATCH, DELETE } from "./route";

const PHONE  = "+5511940595223";
const params = Promise.resolve({ slug: "sushi", addressId: "a1" });
function req(method: string, body: unknown, headers: Record<string, string> = {}): NextRequest {
  return new NextRequest("https://foocci.com.br/api/pedido/sushi/customer-address/a1", {
    method, headers: { "Content-Type": "application/json", ...headers }, body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  db.restaurant.findUnique.mockResolvedValue({ id: "rest_1" });
  db.customer.findFirst.mockResolvedValue({ id: "c_resolved", phone: PHONE });
});

describe("PATCH customer-address/[addressId]", () => {
  it("401 without proof — service not called", async () => {
    const res = await PATCH(req("PATCH", { customerId: "c_body", isDefault: true }), { params });
    expect(res.status).toBe(401);
    expect(svc.AddressService.update).not.toHaveBeenCalled();
  });

  it("with proof → updates against the RESOLVED customerId", async () => {
    svc.AddressService.update.mockResolvedValue({ ok: true, data: { id: "a1" } });
    const token = signWaToken({ phone: PHONE });
    const res = await PATCH(req("PATCH", { customerId: "c_body", isDefault: true }, { [PEDIDO_TOKEN_HEADER]: token }), { params });
    expect(res.status).toBe(200);
    const [restaurantId, customerId, addressId] = svc.AddressService.update.mock.calls[0];
    expect(restaurantId).toBe("rest_1");
    expect(customerId).toBe("c_resolved"); // from the token, not the body
    expect(addressId).toBe("a1");
  });
});

describe("DELETE customer-address/[addressId]", () => {
  it("401 without proof — service not called", async () => {
    const res = await DELETE(req("DELETE", { customerId: "c_body" }), { params });
    expect(res.status).toBe(401);
    expect(svc.AddressService.remove).not.toHaveBeenCalled();
  });

  it("with proof → removes against the RESOLVED customerId", async () => {
    svc.AddressService.remove.mockResolvedValue({ ok: true, data: { message: "ok" } });
    const token = signWaToken({ phone: PHONE });
    const res = await DELETE(req("DELETE", {}, { [PEDIDO_TOKEN_HEADER]: token }), { params });
    expect(res.status).toBe(200);
    const [restaurantId, customerId, addressId] = svc.AddressService.remove.mock.calls[0];
    expect(restaurantId).toBe("rest_1");
    expect(customerId).toBe("c_resolved");
    expect(addressId).toBe("a1");
  });
});
