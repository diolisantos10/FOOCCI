/**
 * api-key primitives — generation, hashing, and header parsing.
 */

import { describe, it, expect } from "vitest";
import {
  API_KEY_PREFIX,
  generateApiKey,
  hashApiKey,
  looksLikeApiKey,
  bearerToken,
} from "@/lib/api-key";

describe("generateApiKey", () => {
  it("mints a prefixed token whose stored hash matches hashApiKey(token)", () => {
    const k = generateApiKey();
    expect(k.token.startsWith(API_KEY_PREFIX)).toBe(true);
    expect(k.tokenHash).toBe(hashApiKey(k.token));
    expect(k.tokenHash).toMatch(/^[0-9a-f]{64}$/); // sha-256 hex
    expect(k.token.startsWith(k.tokenPrefix)).toBe(true);
  });

  it("is unique across calls (high entropy)", () => {
    const seen = new Set<string>();
    for (let i = 0; i < 200; i++) seen.add(generateApiKey().token);
    expect(seen.size).toBe(200);
  });
});

describe("hashApiKey", () => {
  it("is deterministic and trims surrounding whitespace", () => {
    expect(hashApiKey("fck_abc")).toBe(hashApiKey("  fck_abc  "));
  });
  it("differs for different tokens", () => {
    expect(hashApiKey("fck_a")).not.toBe(hashApiKey("fck_b"));
  });
});

describe("looksLikeApiKey", () => {
  it("accepts a well-formed token", () => {
    expect(looksLikeApiKey(generateApiKey().token)).toBe(true);
  });
  it("rejects junk", () => {
    expect(looksLikeApiKey(null)).toBe(false);
    expect(looksLikeApiKey(undefined)).toBe(false);
    expect(looksLikeApiKey("")).toBe(false);
    expect(looksLikeApiKey("Bearer xyz")).toBe(false);
    expect(looksLikeApiKey("fck_short")).toBe(false); // under min length
  });
});

describe("bearerToken", () => {
  it("extracts the token (case-insensitive scheme)", () => {
    expect(bearerToken("Bearer fck_abc123")).toBe("fck_abc123");
    expect(bearerToken("bearer  fck_xyz")).toBe("fck_xyz");
  });
  it("returns null for missing/malformed headers", () => {
    expect(bearerToken(null)).toBeNull();
    expect(bearerToken("")).toBeNull();
    expect(bearerToken("Token fck_abc")).toBeNull();
    expect(bearerToken("fck_abc")).toBeNull(); // no scheme
  });
});
