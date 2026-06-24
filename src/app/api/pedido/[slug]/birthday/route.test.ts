/**
 * /api/pedido/[slug]/birthday — collect a birthday for an already-identified customer.
 *
 *   GET  → needsBirthday true only when the customer exists and has no birthday.
 *   POST → rejects impossible dates (31/02), stores month+day, and only updates a
 *          customer whose birthDate is currently null (never overwrites).
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const db = vi.hoisted(() => ({
  restaurant: { findUnique: vi.fn() },
  customer:   { findFirst: vi.fn(), updateMany: vi.fn() },
}));
vi.mock("@/lib/prisma", () => ({ prisma: db }));
vi.mock("@/lib/rate-limit", () => ({
  rateLimit: () => ({ limited: false }),
  getClientIp: () => "1.1.1.1",
  rateLimitResponse: () => new Response(null, { status: 429 }),
}));

import { GET, POST } from "./route";

const params = Promise.resolve({ slug: "sushi" });

beforeEach(() => {
  vi.clearAllMocks();
  db.restaurant.findUnique.mockResolvedValue({ id: "rest_1" });
});

function postReq(body: unknown): NextRequest {
  return new NextRequest("https://foocci.com.br/api/pedido/sushi/birthday", {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
  });
}
function getReq(qs: string): NextRequest {
  return new NextRequest(`https://foocci.com.br/api/pedido/sushi/birthday${qs}`);
}

describe("GET birthday status", () => {
  it("needsBirthday=true when the customer has no birthday", async () => {
    db.customer.findFirst.mockResolvedValue({ birthDate: null });
    const res = await GET(getReq("?customerId=c1"), { params });
    expect(await res.json()).toEqual({ needsBirthday: true });
  });

  it("needsBirthday=false when a birthday already exists", async () => {
    db.customer.findFirst.mockResolvedValue({ birthDate: new Date() });
    expect(await (await GET(getReq("?customerId=c1"), { params })).json()).toEqual({ needsBirthday: false });
  });

  it("needsBirthday=false without a customerId", async () => {
    expect(await (await GET(getReq(""), { params })).json()).toEqual({ needsBirthday: false });
  });
});

describe("POST set birthday", () => {
  it("rejects an impossible date (31/02)", async () => {
    const res = await POST(postReq({ customerId: "c1", day: 31, month: 2 }), { params });
    expect(res.status).toBe(400);
    expect(db.customer.updateMany).not.toHaveBeenCalled();
  });

  it("rejects out-of-range values", async () => {
    expect((await POST(postReq({ customerId: "c1", day: 0, month: 5 }), { params })).status).toBe(400);
    expect((await POST(postReq({ customerId: "c1", day: 10, month: 13 }), { params })).status).toBe(400);
  });

  it("stores month+day and only updates a customer with no birthday yet", async () => {
    db.customer.updateMany.mockResolvedValue({ count: 1 });
    const res = await POST(postReq({ customerId: "c1", day: 24, month: 6 }), { params });
    expect(await res.json()).toEqual({ ok: true });
    const arg = db.customer.updateMany.mock.calls[0][0];
    expect(arg.where).toMatchObject({ id: "c1", restaurantId: "rest_1", isGuest: false, birthDate: null });
    expect(arg.data.birthDate.getUTCMonth()).toBe(5); // June (0-indexed)
    expect(arg.data.birthDate.getUTCDate()).toBe(24);
  });

  it("ok=false when no row matched (birthday already set / wrong customer)", async () => {
    db.customer.updateMany.mockResolvedValue({ count: 0 });
    expect(await (await POST(postReq({ customerId: "c1", day: 1, month: 1 }), { params })).json()).toEqual({ ok: false });
  });
});
