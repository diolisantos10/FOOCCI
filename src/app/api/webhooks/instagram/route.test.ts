/**
 * Instagram webhook GET verification (route level) — Phase 1 activation tests.
 *
 *   A — valid verify token (mode=subscribe) → 200 echoing hub.challenge.
 *   B — invalid verify token → 403.
 *   C — missing params → 403.
 *
 * Heavy collaborators (prisma-backed services) are mocked so the test isolates the
 * GET handler's verify-token → status mapping.
 */

import { describe, it, expect, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/services/instagram/InstagramConfigService", () => ({
  isValidWebhookVerifyToken: vi.fn(async (t: string) => t === "the-verify-token"),
}));
vi.mock("@/services/instagram/InstagramChannelService", () => ({
  handleWebhookEvent: vi.fn(async () => ({
    resolved: false, persisted: 0, skippedDuplicates: 0, skippedNonMessage: 0, skippedNotAllowlisted: 0,
  })),
}));
vi.mock("@/services/instagram/InstagramWebhookParser", () => ({
  verifyInstagramSignature: vi.fn(() => true),
}));

import { GET } from "./route";

function getReq(params: Record<string, string>): NextRequest {
  const url = new URL("https://foocci.com.br/api/webhooks/instagram");
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  return new NextRequest(url);
}

describe("GET /api/webhooks/instagram", () => {
  it("A — valid verify token echoes the challenge with 200", async () => {
    const res = await GET(getReq({ "hub.mode": "subscribe", "hub.verify_token": "the-verify-token", "hub.challenge": "CH_42" }));
    expect(res.status).toBe(200);
    expect(await res.text()).toBe("CH_42");
  });

  it("B — wrong verify token is rejected with 403", async () => {
    const res = await GET(getReq({ "hub.mode": "subscribe", "hub.verify_token": "WRONG", "hub.challenge": "CH_42" }));
    expect(res.status).toBe(403);
  });

  it("C — missing params are rejected with 403", async () => {
    const res = await GET(getReq({}));
    expect(res.status).toBe(403);
  });
});
