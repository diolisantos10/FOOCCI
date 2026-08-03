/**
 * The AI route's plan gate — guardrail 4 made mechanical.
 *
 * POST /api/pedido/[slug] is the ONLY public entry to the AI Waiter. Without this
 * gate, "the entry plan does not include AI" is contract text, and the token bill of
 * a STARTER restaurant lands on Foocci. These tests drive the real route handler with
 * the AI service mocked, and prove three things:
 *
 *   1. a plan without the Waiter gets 403 ai_not_included and the AI is NEVER invoked;
 *   2. the response body carries no customer-facing prose (the storefront handles the
 *      degradation silently — the diner must never read "seu restaurante não pagou");
 *   3. the grandfathered live customer (STARTER + override TRUE) still reaches the AI.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const findUniqueRestaurant = vi.fn();
const runWebTurn = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    restaurant: { findUnique: (...a: unknown[]) => findUniqueRestaurant(...a) },
    menuCategory: { findMany: vi.fn().mockResolvedValue([]) },
    menuItem: { findMany: vi.fn().mockResolvedValue([]) },
  },
}));

vi.mock("@/services/ai/AIOrderService", () => ({
  AIOrderService: { runWebTurn: (...a: unknown[]) => runWebTurn(...a) },
}));

vi.mock("@/services/ai/waiter/bestSellers", () => ({
  getBestSellerMap: vi.fn().mockResolvedValue(new Map()),
  applyBestSellers: vi.fn((items: unknown) => items),
}));

import { POST } from "./route";

function req(body: Record<string, unknown> = {}): NextRequest {
  return new NextRequest("https://foocci.com.br/api/pedido/loja-teste", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-forwarded-for": "203.0.113.10" },
    body: JSON.stringify({ message: "oi", history: [], ...body }),
  });
}

const params = { params: Promise.resolve({ slug: "loja-teste" }) };

beforeEach(() => {
  findUniqueRestaurant.mockReset();
  runWebTurn.mockReset();
});

describe("POST /api/pedido/[slug] — plan gate", () => {
  it("403 ai_not_included for a STARTER with no override — and the AI is never invoked", async () => {
    findUniqueRestaurant.mockResolvedValue({ id: "r1", plan: "STARTER", aiWaiterEnabled: null });

    const res = await POST(req(), params);
    const json = await res.json();

    expect(res.status).toBe(403);
    expect(json.error).toBe("ai_not_included");
    // The whole point: not one token is spent for a plan that does not include it.
    expect(runWebTurn).not.toHaveBeenCalled();
  });

  it("the denial body carries no customer-facing prose", async () => {
    findUniqueRestaurant.mockResolvedValue({ id: "r1", plan: "STARTER", aiWaiterEnabled: null });

    const res = await POST(req(), params);
    const raw = JSON.stringify(await res.json());

    // The storefront degrades silently; nothing here may be printable to a diner.
    expect(raw).not.toMatch(/plano|pagou|assinatura|contrat/i);
  });

  it("grandfathered STARTER (override TRUE) still reaches the AI — the live customer", async () => {
    findUniqueRestaurant.mockResolvedValue({ id: "r1", plan: "STARTER", aiWaiterEnabled: true });
    runWebTurn.mockResolvedValue({ reply: "Olá!", stage: "BROWSE" });

    const res = await POST(req(), params);

    expect(res.status).not.toBe(403);
    expect(runWebTurn).toHaveBeenCalledTimes(1);
  });

  it("an explicit FALSE denies even a PRO plan", async () => {
    findUniqueRestaurant.mockResolvedValue({ id: "r1", plan: "PRO", aiWaiterEnabled: false });

    const res = await POST(req(), params);

    expect(res.status).toBe(403);
    expect(runWebTurn).not.toHaveBeenCalled();
  });
});
