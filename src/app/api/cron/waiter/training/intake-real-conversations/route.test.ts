import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { NextRequest } from "next/server";

const svc = vi.hoisted(() => ({ intakeRealConversations: vi.fn() }));
vi.mock("@/services/simulation/examples/realConversationIntake", () => ({
  intakeRealConversations: svc.intakeRealConversations,
}));

import { POST } from "./route";

const URL_ = "http://localhost/api/cron/waiter/training/intake-real-conversations";
const make = (auth?: string, body?: unknown) =>
  new NextRequest(URL_, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(auth ? { authorization: auth } : {}) },
    body: JSON.stringify(body ?? {}),
  });

const OLD = process.env.CRON_SECRET;

beforeEach(() => {
  vi.clearAllMocks();
  process.env.CRON_SECRET = "s3cret";
  svc.intakeRealConversations.mockResolvedValue({
    ok: true, created: 2, skipped: 1, pendingReview: 2,
    agentSlug: "waiter", intakeAt: new Date().toISOString(),
    nextIntakeEstimate: new Date().toISOString(), runtimeTouched: false,
  });
});
afterEach(() => { process.env.CRON_SECRET = OLD; });

describe("POST /api/cron/waiter/training/intake-real-conversations", () => {
  it("(6) 503 sem CRON_SECRET configurado", async () => {
    delete process.env.CRON_SECRET;
    const res = await POST(make("Bearer x"));
    expect(res.status).toBe(503);
  });

  it("(6) 401 com secret inválido", async () => {
    const res = await POST(make("Bearer errado"));
    expect(res.status).toBe(401);
    expect(svc.intakeRealConversations).not.toHaveBeenCalled();
  });

  it("200 PASS com secret correto + runtimeTouched=false", async () => {
    const res = await POST(make("Bearer s3cret", { limit: 10, days: 1 }));
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.status).toBe("PASS");
    expect(json.created).toBe(2);
    expect(json.runtimeTouched).toBe(false);
    expect(svc.intakeRealConversations).toHaveBeenCalledWith({ limit: 10, days: 1, restaurantId: undefined });
  });

  it("erro do serviço vira FAIL controlado (HTTP 200, runtimeTouched=false)", async () => {
    svc.intakeRealConversations.mockRejectedValue(new Error("boom"));
    const res = await POST(make("Bearer s3cret"));
    const json = await res.json();
    expect(json.ok).toBe(false);
    expect(json.status).toBe("FAIL");
    expect(json.runtimeTouched).toBe(false);
  });
});
