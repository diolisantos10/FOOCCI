/**
 * MetaAppCredentialsService — the rules that protect the master key.
 *
 * Three of these are traps this repo has already fallen into in other shapes, so they
 * are locked by test rather than by comment:
 *
 *   1. Database overrides env, and an empty row changes nothing. Shipping the model must
 *      not break a working deploy.
 *   2. A blank field on save means UNCHANGED, never cleared — the screen can only show
 *      masked secrets, so Save on a freshly loaded form must not wipe them.
 *   3. A secret that fails to decrypt degrades to the env fallback instead of throwing.
 *      A protection that fires must not be more destructive than the problem it prevents
 *      (the Nicole incident): one corrupt row must not take down every WhatsApp send.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const findUnique = vi.fn();
const upsert = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    metaAppCredentials: {
      findUnique: (...args: unknown[]) => findUnique(...args),
      upsert:     (...args: unknown[]) => upsert(...args),
    },
  },
}));

// Deterministic stand-ins: `enc:` prefix marks "encrypted", so tests can assert that a
// value was encrypted before storage without depending on real AES output.
vi.mock("@/lib/crypto", () => ({
  encrypt: (plain: string) => `enc:${plain}`,
  decrypt: (stored: string) => {
    if (!stored.startsWith("enc:")) throw new Error("bad ciphertext");
    return stored.slice(4);
  },
  maskSecret: (plain: string) => (plain.length <= 8 ? "***" : `${plain.slice(0, 4)}...${plain.slice(-4)}`),
}));

import { MetaAppCredentialsService } from "./MetaAppCredentialsService";

const ENV_KEYS = [
  "META_APP_ID", "META_APP_SECRET", "META_CONFIG_ID", "META_WEBHOOK_VERIFY_TOKEN",
  "META_GRAPH_VERSION", "META_COEXISTENCE_CONFIG_ID",
  "INSTAGRAM_APP_ID", "INSTAGRAM_APP_SECRET", "INSTAGRAM_WEBHOOK_VERIFY_TOKEN",
  "FACEBOOK_APP_ID", "FACEBOOK_APP_SECRET",
] as const;

let savedEnv: Record<string, string | undefined>;

beforeEach(() => {
  findUnique.mockReset();
  upsert.mockReset();
  savedEnv = {};
  for (const k of ENV_KEYS) { savedEnv[k] = process.env[k]; delete process.env[k]; }
});

afterEach(() => {
  for (const k of ENV_KEYS) {
    if (savedEnv[k] === undefined) delete process.env[k];
    else process.env[k] = savedEnv[k];
  }
});

describe("getResolved — database first, env second", () => {
  it("falls back to env when there is no row at all", async () => {
    findUnique.mockResolvedValue(null);
    process.env.META_APP_ID = "env-app-id";
    process.env.META_APP_SECRET = "env-secret";

    const creds = await MetaAppCredentialsService.getResolved();

    expect(creds.appId).toBe("env-app-id");
    expect(creds.appSecret).toBe("env-secret");
  });

  it("lets a stored value override the env var", async () => {
    findUnique.mockResolvedValue({ appId: "db-app-id", appSecret: "enc:db-secret" });
    process.env.META_APP_ID = "env-app-id";
    process.env.META_APP_SECRET = "env-secret";

    const creds = await MetaAppCredentialsService.getResolved();

    expect(creds.appId).toBe("db-app-id");
    expect(creds.appSecret).toBe("db-secret");
  });

  it("keeps the env value for fields the row leaves empty", async () => {
    findUnique.mockResolvedValue({ appId: "db-app-id", appSecret: null });
    process.env.META_APP_SECRET = "env-secret";

    const creds = await MetaAppCredentialsService.getResolved();

    expect(creds.appId).toBe("db-app-id");
    expect(creds.appSecret).toBe("env-secret");
  });

  it("survives the table not existing yet and still returns env values", async () => {
    findUnique.mockRejectedValue(new Error("relation does not exist"));
    process.env.META_APP_SECRET = "env-secret";

    const creds = await MetaAppCredentialsService.getResolved();

    expect(creds.appSecret).toBe("env-secret");
  });

  it("degrades to env when a stored secret cannot be decrypted", async () => {
    // A corrupt row must not throw — losing every WhatsApp send because one secret
    // failed to decrypt would be worse than the problem it guards against.
    findUnique.mockResolvedValue({ appSecret: "garbage-not-encrypted" });
    process.env.META_APP_SECRET = "env-secret";

    const creds = await MetaAppCredentialsService.getResolved();

    expect(creds.appSecret).toBe("env-secret");
  });
});

describe("save — blank means unchanged, never cleared", () => {
  it("ignores blank and whitespace-only fields", async () => {
    findUnique.mockResolvedValue(null);

    await MetaAppCredentialsService.save({ appId: "new-id", appSecret: "   ", configId: "" });

    const data = upsert.mock.calls[0]![0].update as Record<string, unknown>;
    expect(data.appId).toBe("new-id");
    expect(data).not.toHaveProperty("appSecret");
    expect(data).not.toHaveProperty("configId");
  });

  it("encrypts secrets and stores public ids in plain text", async () => {
    findUnique.mockResolvedValue(null);

    await MetaAppCredentialsService.save({ appId: "public-id", appSecret: "top-secret" });

    const data = upsert.mock.calls[0]![0].update as Record<string, unknown>;
    expect(data.appId).toBe("public-id");
    expect(data.appSecret).toBe("enc:top-secret");
  });

  it("clears a field only when explicitly asked to", async () => {
    findUnique.mockResolvedValue(null);

    await MetaAppCredentialsService.save({}, ["appSecret"]);

    const data = upsert.mock.calls[0]![0].update as Record<string, unknown>;
    expect(data.appSecret).toBeNull();
  });
});

describe("getMasked — never leaks a usable secret", () => {
  it("returns previews and the source of each field", async () => {
    findUnique.mockResolvedValue({ appId: "db-app-id", appSecret: "enc:super-secret-value" });
    process.env.META_CONFIG_ID = "env-config";

    const masked = await MetaAppCredentialsService.getMasked();

    expect(masked.appSecretPreview).toBe("supe...alue");
    expect(JSON.stringify(masked)).not.toContain("super-secret-value");
    expect(masked.sources.appId).toBe("db");
    expect(masked.sources.configId).toBe("env");
    expect(masked.sources.igAppSecret).toBe("missing");
  });
});
