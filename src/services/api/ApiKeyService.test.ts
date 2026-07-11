/**
 * ApiKeyService — hermetic (prisma mocked). Covers create (returns plaintext
 * once, stores only the hash), list, revoke (tenant-scoped), and resolveApiKey
 * (valid / revoked-or-missing / junk / throttled lastUsedAt / fail-closed).
 */

import { describe, it, expect, beforeEach, vi } from "vitest";

const db = vi.hoisted(() => ({
  apiKey: {
    findMany:   vi.fn(),
    create:     vi.fn(),
    updateMany: vi.fn(),
    findFirst:  vi.fn(),
    update:     vi.fn(),
  },
}));
vi.mock("@/lib/prisma", () => ({ prisma: db }));

import {
  listApiKeys, createApiKey, revokeApiKey, resolveApiKey,
} from "./ApiKeyService";
import { hashApiKey } from "@/lib/api-key";

const REST = "rest_1";

beforeEach(() => vi.clearAllMocks());

describe("createApiKey", () => {
  it("returns the plaintext token once and persists ONLY the hash", async () => {
    db.apiKey.create.mockImplementation(({ data }: any) => ({
      id: "k1", name: data.name, tokenPrefix: data.tokenPrefix, scope: data.scope,
      lastUsedAt: null, createdAt: new Date(),
    }));
    const res = await createApiKey(REST, "Foocci Manager", ["customers:read", "sales:read"], "u1");
    expect(res.token).toMatch(/^fck_/);
    expect(res.scopes).toEqual(["sales:read", "customers:read"]); // canonical order, parsed back
    const stored = db.apiKey.create.mock.calls[0][0].data;
    // The plaintext is never in the stored row; the hash is, and it matches.
    expect(stored.tokenHash).toBe(hashApiKey(res.token));
    expect(JSON.stringify(stored)).not.toContain(res.token);
    expect(stored.restaurantId).toBe(REST);
    expect(stored.name).toBe("Foocci Manager");
    expect(stored.scope).toBe("sales:read,customers:read"); // canonical, comma-joined
  });

  it("normalizes an empty apelido to null and empty scopes to the safe default", async () => {
    db.apiKey.create.mockResolvedValue({ id: "k1", name: null, tokenPrefix: "fck_x", scope: "sales:read", lastUsedAt: null, createdAt: new Date() });
    await createApiKey(REST, "   ", [], null);
    expect(db.apiKey.create.mock.calls[0][0].data.name).toBeNull();
    expect(db.apiKey.create.mock.calls[0][0].data.scope).toBe("sales:read"); // never zero scopes
  });
});

describe("listApiKeys", () => {
  it("requests only active (non-revoked) keys, newest first, without secrets", async () => {
    db.apiKey.findMany.mockResolvedValue([]);
    await listApiKeys(REST);
    const arg = db.apiKey.findMany.mock.calls[0][0];
    expect(arg.where).toEqual({ restaurantId: REST, revokedAt: null });
    expect(arg.orderBy).toEqual({ createdAt: "desc" });
    expect(arg.select.tokenHash).toBeUndefined(); // never selects the hash
  });
});

describe("revokeApiKey", () => {
  it("is tenant-scoped and reports whether a row was revoked", async () => {
    db.apiKey.updateMany.mockResolvedValue({ count: 1 });
    expect(await revokeApiKey(REST, "k1")).toBe(true);
    expect(db.apiKey.updateMany.mock.calls[0][0].where).toEqual({ id: "k1", restaurantId: REST, revokedAt: null });
  });
  it("returns false when nothing matched (wrong tenant or already revoked)", async () => {
    db.apiKey.updateMany.mockResolvedValue({ count: 0 });
    expect(await revokeApiKey(REST, "k1")).toBe(false);
  });
});

describe("resolveApiKey", () => {
  it("resolves a valid key to its restaurant and bumps lastUsedAt when stale", async () => {
    db.apiKey.findFirst.mockResolvedValue({ id: "k1", restaurantId: REST, scope: "sales:read,products:read", lastUsedAt: null });
    db.apiKey.update.mockResolvedValue({});
    const r = await resolveApiKey("fck_validtokenvalidtoken");
    expect(r).toEqual({ restaurantId: REST, keyId: "k1", scopes: ["sales:read", "products:read"] });
    // looked up by hash of the presented token, revoked keys excluded
    expect(db.apiKey.findFirst.mock.calls[0][0].where).toEqual({
      tokenHash: hashApiKey("fck_validtokenvalidtoken"), revokedAt: null,
    });
    expect(db.apiKey.update).toHaveBeenCalled();
  });

  it("does NOT write lastUsedAt when it was updated recently (throttle)", async () => {
    db.apiKey.findFirst.mockResolvedValue({ id: "k1", restaurantId: REST, scope: "sales:read", lastUsedAt: new Date() });
    await resolveApiKey("fck_validtokenvalidtoken");
    expect(db.apiKey.update).not.toHaveBeenCalled();
  });

  it("returns null for a revoked/unknown key (no DB match)", async () => {
    db.apiKey.findFirst.mockResolvedValue(null);
    expect(await resolveApiKey("fck_validtokenvalidtoken")).toBeNull();
  });

  it("returns null for junk without touching the DB", async () => {
    expect(await resolveApiKey("not-a-key")).toBeNull();
    expect(await resolveApiKey(null)).toBeNull();
    expect(db.apiKey.findFirst).not.toHaveBeenCalled();
  });

  it("fails closed (null) if the DB throws", async () => {
    db.apiKey.findFirst.mockRejectedValue(new Error("db down"));
    expect(await resolveApiKey("fck_validtokenvalidtoken")).toBeNull();
  });
});
