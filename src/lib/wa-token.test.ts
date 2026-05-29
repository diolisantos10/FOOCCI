/**
 * Tests A-E: WhatsApp → /pedido identity pipeline.
 *
 * A — waToken sign/verify round-trip
 * B — verifyWaToken rejects expired tokens
 * C — verifyWaToken rejects tampered tokens
 * D — verifyWaToken rejects tokens signed with wrong secret
 * E — signWaToken throws without a phone
 */

import { describe, it, expect, vi } from "vitest";
import { signWaToken, verifyWaToken } from "./wa-token";

// Force test environment so signingSecret() uses the dev fallback
process.env.NODE_ENV = process.env.NODE_ENV ?? "test";

describe("wa-token", () => {
  it("A: sign → verify round-trip returns the original payload", () => {
    const token   = signWaToken({ phone: "+5511940595223", name: "João" });
    const payload = verifyWaToken(token);
    expect(payload).not.toBeNull();
    expect(payload!.phone).toBe("+5511940595223");
    expect(payload!.name).toBe("João");
    expect(payload!.exp).toBeGreaterThan(Date.now());
  });

  it("B: rejects an expired token", () => {
    const realNow = Date.now;
    // Sign in the past (8 days ago)
    vi.spyOn(Date, "now").mockReturnValue(realNow() - 8 * 24 * 60 * 60 * 1000);
    const token = signWaToken({ phone: "+5511940595223" });
    vi.spyOn(Date, "now").mockRestore();
    expect(verifyWaToken(token)).toBeNull();
  });

  it("C: rejects a token with a tampered payload", () => {
    const token = signWaToken({ phone: "+5511940595223" });
    const [body, sig] = token.split(".");
    // Flip first char of payload
    const tampered = String.fromCharCode(body.charCodeAt(0) ^ 1) + body.slice(1);
    expect(verifyWaToken(`${tampered}.${sig}`)).toBeNull();
  });

  it("D: rejects a token signed with a different secret", () => {
    const origSecret = process.env.NEXTAUTH_SECRET;
    process.env.NEXTAUTH_SECRET = "secret-A";
    const token = signWaToken({ phone: "+5511940595223" });
    process.env.NEXTAUTH_SECRET = "secret-B";
    expect(verifyWaToken(token)).toBeNull();
    process.env.NEXTAUTH_SECRET = origSecret;
  });

  it("E: signWaToken throws when phone is missing", () => {
    expect(() => signWaToken({ phone: "" })).toThrow("phone is required");
  });
});
