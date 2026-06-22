/**
 * Meta webhook GET verification (route level) — TASK 5 / 8 D-E.
 *
 *   D — invalid/missing verify token → 403.
 *   E — valid verify token (mode=subscribe) → 200 echoing hub.challenge.
 *
 * Heavy collaborators (prisma, Brain, MetaConfigService) are mocked so the test
 * isolates the GET handler's verify-token → status mapping.
 */

import { describe, it, expect, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/prisma", () => ({ prisma: {} }));
vi.mock("@/services/whatsapp/MetaConfigService", () => ({ MetaConfigService: {} }));
vi.mock("@/services/whatsapp/brain/WhatsAppBrainRuntimeService", () => ({
  WhatsAppBrainRuntimeService: { respond: vi.fn() },
  isWhatsAppBrainEnabled: () => false,
}));
vi.mock("@/services/whatsapp/metaFlag", () => ({
  metaWebhookVerifyToken: () => "the-verify-token",
  metaAppSecret: () => undefined,
}));

import { GET } from "./route";

function getReq(params: Record<string, string>): NextRequest {
  const url = new URL("https://foocci.com.br/api/webhooks/meta/whatsapp");
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  return new NextRequest(url);
}

describe("GET /api/webhooks/meta/whatsapp", () => {
  it("E — valid verify token echoes the challenge with 200", async () => {
    const res = await GET(getReq({ "hub.mode": "subscribe", "hub.verify_token": "the-verify-token", "hub.challenge": "CHALLENGE_123" }));
    expect(res.status).toBe(200);
    expect(await res.text()).toBe("CHALLENGE_123");
  });

  it("D — wrong verify token is rejected with 403", async () => {
    const res = await GET(getReq({ "hub.mode": "subscribe", "hub.verify_token": "WRONG", "hub.challenge": "CHALLENGE_123" }));
    expect(res.status).toBe(403);
  });

  it("D — missing params are rejected with 403", async () => {
    const res = await GET(getReq({}));
    expect(res.status).toBe(403);
  });
});
