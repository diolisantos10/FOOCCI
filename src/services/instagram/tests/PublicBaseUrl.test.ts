/**
 * Public base URL + Meta env blockers — produção nunca usa localhost; envs
 * faltantes viram blockers claros (nomes, nunca valores de secret).
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

const db = vi.hoisted(() => ({
  metaOAuthState: { create: vi.fn().mockResolvedValue({ id: "st1" }) },
}));
vi.mock("@/lib/prisma", () => ({ prisma: db }));

import { getPublicBaseUrl, getReturnBaseUrl } from "@/lib/public-base-url";
import { getMetaEnvStatus, metaRedirectUri, startMetaConnect } from "../metaOAuth";

const ENV_KEYS = ["FOOCCI_BASE_URL", "NEXT_PUBLIC_APP_URL", "APP_URL", "NEXT_PUBLIC_SITE_URL", "NEXTAUTH_URL", "META_APP_ID", "META_APP_SECRET", "FACEBOOK_APP_ID", "FACEBOOK_APP_SECRET"];
const saved: Record<string, string | undefined> = {};
const savedNodeEnv = process.env.NODE_ENV;

beforeEach(() => {
  vi.clearAllMocks();
  for (const k of ENV_KEYS) { saved[k] = process.env[k]; delete process.env[k]; }
});
afterEach(() => {
  for (const k of ENV_KEYS) {
    if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k];
  }
  vi.stubEnv("NODE_ENV", savedNodeEnv ?? "test");
});

describe("getReturnBaseUrl — redirects nunca apontam para localhost em produção", () => {
  it("produção SEM base configurada → domínio canônico, nunca localhost:8080", () => {
    vi.stubEnv("NODE_ENV", "production");
    const base = getReturnBaseUrl("http://localhost:8080");
    expect(base).toBe("https://foocci.com.br");
    expect(base).not.toContain("localhost");
  });

  it("produção com origin .railway.app → domínio canônico, nunca railway", () => {
    vi.stubEnv("NODE_ENV", "production");
    const base = getReturnBaseUrl("https://foocci-production.up.railway.app");
    expect(base).toBe("https://foocci.com.br");
    expect(base).not.toContain("railway.app");
  });

  it("produção COM FOOCCI_BASE_URL → usa o valor configurado", () => {
    vi.stubEnv("NODE_ENV", "production");
    process.env.FOOCCI_BASE_URL = "https://foocci.com.br";
    expect(getReturnBaseUrl("http://localhost:8080")).toBe("https://foocci.com.br");
  });

  it("desenvolvimento → usa o origin da requisição", () => {
    vi.stubEnv("NODE_ENV", "development");
    expect(getReturnBaseUrl("http://localhost:3000")).toBe("http://localhost:3000");
  });
});

describe("(1/5/6) base pública em produção", () => {
  it("(1) com FOOCCI_BASE_URL, produção NUNCA usa localhost", () => {
    vi.stubEnv("NODE_ENV", "production");
    process.env.FOOCCI_BASE_URL = "https://foocci.com.br";
    const r = getPublicBaseUrl("http://localhost:8080");
    expect(r.url).toBe("https://foocci.com.br");
    expect(r.url).not.toContain("localhost");
  });

  it("candidato localhost/railway é rejeitado em produção", () => {
    vi.stubEnv("NODE_ENV", "production");
    process.env.NEXT_PUBLIC_APP_URL = "https://foo.up.railway.app";
    process.env.APP_URL = "http://localhost:8080";
    const r = getPublicBaseUrl("http://localhost:8080");
    expect(r.url).toBeNull();
    expect(r.error).toBe("PUBLIC_BASE_URL_NOT_CONFIGURED");
    expect(r.usesLocalhostInProduction).toBe(true);
  });

  it("(4) produção sem base pública → PUBLIC_BASE_URL_NOT_CONFIGURED (sem link quebrado)", () => {
    vi.stubEnv("NODE_ENV", "production");
    const r = getPublicBaseUrl("http://localhost:8080");
    expect(r.url).toBeNull();
    expect(r.error).toBe("PUBLIC_BASE_URL_NOT_CONFIGURED");
  });

  it("development usa o origin como fallback", () => {
    vi.stubEnv("NODE_ENV", "development");
    const r = getPublicBaseUrl("http://localhost:3000");
    expect(r.url).toBe("http://localhost:3000");
    expect(r.error).toBeNull();
  });

  it("(5) webhookUrl final usa o domínio público", () => {
    vi.stubEnv("NODE_ENV", "production");
    process.env.FOOCCI_BASE_URL = "https://foocci.com.br/";
    const base = getPublicBaseUrl("http://localhost:8080").url;
    expect(`${base}/api/webhooks/instagram`).toBe("https://foocci.com.br/api/webhooks/instagram");
  });

  it("(6) redirectUri usa o domínio público; null sem base em produção", () => {
    vi.stubEnv("NODE_ENV", "production");
    process.env.FOOCCI_BASE_URL = "https://foocci.com.br";
    expect(metaRedirectUri("http://localhost:8080")).toBe("https://foocci.com.br/api/integrations/meta/oauth/callback");
    delete process.env.FOOCCI_BASE_URL;
    expect(metaRedirectUri("http://localhost:8080")).toBeNull();
  });
});

describe("(2/3/7) blockers de env com missing claro (sem secrets)", () => {
  it("(2) META_APP_ID faltando → blocked_env + missing nomeado", async () => {
    process.env.META_APP_SECRET = "s";
    process.env.FOOCCI_BASE_URL = "https://foocci.com.br";
    const r = await startMetaConnect({ restaurantId: "r1", userId: "u1", redirectUri: "https://foocci.com.br/cb" });
    expect(r.ok).toBe(false);
    expect(r.blocked).toBe("BLOCKED_BY_META_APP_ENV");
    expect(r.missing).toContain("META_APP_ID");
    expect(r.missing).not.toContain("META_APP_SECRET");
  });

  it("(3) META_APP_SECRET faltando → blocked_env + missing nomeado", async () => {
    process.env.META_APP_ID = "id";
    process.env.FOOCCI_BASE_URL = "https://foocci.com.br";
    const r = await startMetaConnect({ restaurantId: "r1", userId: "u1", redirectUri: "https://foocci.com.br/cb" });
    expect(r.ok).toBe(false);
    expect(r.missing).toContain("META_APP_SECRET");
  });

  it("(4) base pública faltando → PUBLIC_BASE_URL_NOT_CONFIGURED no start", async () => {
    process.env.META_APP_ID = "id";
    process.env.META_APP_SECRET = "secret-value-XYZ";
    const r = await startMetaConnect({ restaurantId: "r1", userId: "u1", redirectUri: null });
    expect(r.ok).toBe(false);
    expect(r.blocked).toBe("PUBLIC_BASE_URL_NOT_CONFIGURED");
    expect(r.missing?.join(" ")).toContain("FOOCCI_BASE_URL=https://foocci.com.br");
  });

  it("(7) getMetaEnvStatus lista nomes e NUNCA valores de secret", () => {
    vi.stubEnv("NODE_ENV", "production");
    process.env.META_APP_SECRET = "super-secret-value";
    const s = getMetaEnvStatus("http://localhost:8080");
    expect(s.missing).toEqual(["META_APP_ID", "FOOCCI_BASE_URL=https://foocci.com.br"]);
    expect(JSON.stringify(s)).not.toContain("super-secret-value");
    expect(s.oauthReady).toBe(false);
  });

  it("tudo configurado → oauthReady=true, missing vazio", () => {
    vi.stubEnv("NODE_ENV", "production");
    process.env.META_APP_ID = "id";
    process.env.META_APP_SECRET = "s";
    process.env.FOOCCI_BASE_URL = "https://foocci.com.br";
    const s = getMetaEnvStatus();
    expect(s.oauthReady).toBe(true);
    expect(s.missing).toEqual([]);
    expect(s.publicBaseUrl).toBe("https://foocci.com.br");
  });
});
