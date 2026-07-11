/**
 * POST /api/pedido/[slug]/customer-address — public "add address" for the
 * ordering flow. Resolves the restaurant from the slug and delegates to the
 * shared AddressService (which enforces customer↔restaurant ownership).
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const db = vi.hoisted(() => ({ restaurant: { findUnique: vi.fn() } }));
vi.mock("@/lib/prisma", () => ({ prisma: db }));
vi.mock("@/lib/rate-limit", () => ({
  rateLimit: () => ({ limited: false }),
  getClientIp: () => "1.1.1.1",
  rateLimitResponse: () => new Response(null, { status: 429 }),
}));
const svc = vi.hoisted(() => ({ AddressService: { create: vi.fn() } }));
vi.mock("@/services/customer/AddressService", () => svc);

import { POST } from "./route";

const params = Promise.resolve({ slug: "sushi" });
const VALID = {
  customerId: "c1", street: "Rua A", number: "10", neighborhood: "Centro",
  city: "São Paulo", state: "SP", zipCode: "01000-000",
};
function post(body: unknown): NextRequest {
  return new NextRequest("https://foocci.com.br/api/pedido/sushi/customer-address", {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  db.restaurant.findUnique.mockResolvedValue({ id: "rest_1" });
});

describe("POST customer-address", () => {
  it("400 on an invalid address (bad CEP)", async () => {
    const res = await POST(post({ ...VALID, zipCode: "abc" }), { params });
    expect(res.status).toBe(400);
    expect(svc.AddressService.create).not.toHaveBeenCalled();
  });

  it("404 when the restaurant slug does not exist", async () => {
    db.restaurant.findUnique.mockResolvedValue(null);
    const res = await POST(post(VALID), { params });
    expect(res.status).toBe(404);
  });

  it("creates via AddressService scoped to the slug's restaurant + customerId", async () => {
    svc.AddressService.create.mockResolvedValue({ ok: true, data: { id: "a1", isDefault: true } });
    const res = await POST(post(VALID), { params });
    expect(res.status).toBe(201);
    const [restaurantId, customerId, address] = svc.AddressService.create.mock.calls[0];
    expect(restaurantId).toBe("rest_1");
    expect(customerId).toBe("c1");
    expect(address.customerId).toBeUndefined();   // stripped before hitting the service
    expect(address.street).toBe("Rua A");
  });

  it("propagates the service error status (e.g. customer of another restaurant)", async () => {
    svc.AddressService.create.mockResolvedValue({ ok: false, error: "Customer not found", status: 404 });
    const res = await POST(post(VALID), { params });
    expect(res.status).toBe(404);
  });
});
