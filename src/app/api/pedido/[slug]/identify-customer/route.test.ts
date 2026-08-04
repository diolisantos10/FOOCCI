/**
 * POST /api/pedido/[slug]/identify-customer
 *
 * Security (CR C1): given only a phone + slug, this must NOT hand out the customerId
 * or any history/spend — the customerId used to be a bearer credential for the PII
 * endpoints. Tests prove the response carries a greeting name at most.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const db = vi.hoisted(() => ({
  restaurant: { findUnique: vi.fn() },
  customer:   { findFirst: vi.fn(), create: vi.fn(), update: vi.fn() },
}));
vi.mock("@/lib/prisma", () => ({ prisma: db }));
vi.mock("@/lib/rate-limit", () => ({
  rateLimit: () => ({ limited: false }),
  getClientIp: () => "1.1.1.1",
  rateLimitResponse: () => new Response(null, { status: 429 }),
}));

import { POST } from "./route";

const params = Promise.resolve({ slug: "sushi" });
const post = (body: unknown) =>
  new NextRequest("https://foocci.com.br/api/pedido/sushi/identify-customer", {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
  });

beforeEach(() => {
  vi.clearAllMocks();
  db.restaurant.findUnique.mockResolvedValue({ id: "rest_1" });
});

describe("POST identify-customer", () => {
  it("existing customer → greeting name ONLY, no customerId / history / spend", async () => {
    db.customer.findFirst.mockResolvedValue({ id: "c1", name: "Diego Santos" });
    const res = await POST(post({ phone: "11940595223" }), { params });
    const body = await res.json();
    expect(body).toEqual({ found: true, name: "Diego" });
    expect(body.customerId).toBeUndefined();
    expect(body.totalSpent).toBeUndefined();
    expect(body.orderCount).toBeUndefined();
    expect(body.lastOrderDate).toBeUndefined();
  });

  it("new customer with name → created in CRM but the id is NOT returned", async () => {
    db.customer.findFirst.mockResolvedValue(null);
    db.customer.create.mockResolvedValue({ id: "c_new" });
    const res = await POST(post({ phone: "11940595223", name: "Ana Paula" }), { params });
    const body = await res.json();
    expect(db.customer.create).toHaveBeenCalled();
    expect(body.found).toBe(false);
    expect(body.name).toBe("Ana");
    expect(body.customerId).toBeUndefined();
  });
});
