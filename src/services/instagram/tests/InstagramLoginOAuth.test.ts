/**
 * Instagram Business Login ("Entrar com Instagram") — OAuth tests (hermetic:
 * Graph client and prisma are mocked; no network). Covers the auth-URL shape and
 * scopes, env readiness, state generation, invalid/expired/wrong-platform state
 * rejection, and the callback saving an ENCRYPTED IG user token with
 * connectedVia="instagram_login" (no Facebook Page).
 */

import { describe, it, expect, beforeEach, vi } from "vitest";

const db = vi.hoisted(() => ({
  metaOAuthState: { create: vi.fn(), findUnique: vi.fn(), update: vi.fn() },
  instagramChannelConfig: { findUnique: vi.fn(), upsert: vi.fn() },
}));
vi.mock("@/lib/prisma", () => ({ prisma: db }));

import {
  buildInstagramAuthUrl,
  getInstagramLoginEnvStatus,
  isInstagramLoginConfigured,
  startInstagramLogin,
  handleInstagramLoginCallback,
  INSTAGRAM_LOGIN_SCOPES,
  INSTAGRAM_LOGIN_PLATFORM,
  type InstagramLoginGraph,
} from "../instagramLoginOAuth";

const REDIRECT = "https://foocci.com.br/api/integrations/instagram/login/callback";

function mockGraph(): InstagramLoginGraph {
  return {
    exchange: vi.fn(async () => ({
      igUserId: "IG_USER_1",
      username: "sushicazza",
      longLivedToken: "IG_LONG_TOKEN_SECRET",
      expiresInSeconds: 5_184_000,
    })),
  };
}

function futureState() {
  return {
    id: "st1",
    restaurantId: "r1",
    userId: "u1",
    status: "PENDING",
    returnPlatform: INSTAGRAM_LOGIN_PLATFORM,
    expiresAt: new Date(Date.now() + 5 * 60 * 1000),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.ENCRYPTION_KEY = "0".repeat(64);
  process.env.INSTAGRAM_APP_ID = "ig-app-123";
  process.env.INSTAGRAM_APP_SECRET = "ig-secret-456";
  process.env.FOOCCI_BASE_URL = "https://foocci.com.br";
  db.metaOAuthState.create.mockResolvedValue({ id: "st1" });
  db.metaOAuthState.update.mockResolvedValue({});
  db.instagramChannelConfig.findUnique.mockResolvedValue(null);
  db.instagramChannelConfig.upsert.mockImplementation(async ({ create, update }: { create: Record<string, unknown>; update: Record<string, unknown> }) => ({
    id: "c1", restaurantId: "r1", enabled: true, paused: false, mode: "RECEIVE_ONLY", scope: "TEST_ACCOUNT_ONLY",
    instagramBusinessAccountId: null, facebookPageId: null, pageAccessTokenEncrypted: null, verifyTokenHash: null,
    appId: null, appSecretRef: null, allowlistedExternalUserIds: [], lastWebhookAt: null, lastError: null, metadata: null,
    ...create, ...update,
  }));
});

describe("auth URL", () => {
  it("aponta para instagram.com/oauth/authorize com escopos e params corretos", () => {
    const url = buildInstagramAuthUrl({ appId: "ig-app-123", redirectUri: REDIRECT, state: "st-xyz" });
    expect(url).toContain("https://www.instagram.com/oauth/authorize");
    expect(url).toContain("client_id=ig-app-123");
    expect(url).toContain(`redirect_uri=${encodeURIComponent(REDIRECT)}`);
    expect(url).toContain("response_type=code");
    expect(url).toContain("state=st-xyz");
    // No Facebook anywhere.
    expect(url).not.toContain("facebook");
    for (const s of INSTAGRAM_LOGIN_SCOPES) expect(url).toContain(s);
  });
});

describe("env readiness", () => {
  it("pronto quando INSTAGRAM_APP_ID + secret + base URL estão configurados", () => {
    expect(isInstagramLoginConfigured()).toBe(true);
    expect(getInstagramLoginEnvStatus("https://foocci.com.br").ready).toBe(true);
  });
  it("bloqueia e lista o que falta quando INSTAGRAM_APP_ID está ausente", () => {
    delete process.env.INSTAGRAM_APP_ID;
    const st = getInstagramLoginEnvStatus("https://foocci.com.br");
    expect(st.ready).toBe(false);
    expect(st.missing).toContain("INSTAGRAM_APP_ID");
    expect(isInstagramLoginConfigured()).toBe(false);
  });
});

describe("start", () => {
  it("gera state e URL do Instagram", async () => {
    const r = await startInstagramLogin({ restaurantId: "r1", userId: "u1", redirectUri: REDIRECT });
    expect(r.ok).toBe(true);
    expect(r.authUrl).toContain("instagram.com/oauth/authorize");
    expect(db.metaOAuthState.create).toHaveBeenCalledOnce();
    const arg = db.metaOAuthState.create.mock.calls[0][0].data;
    expect(arg.returnPlatform).toBe(INSTAGRAM_LOGIN_PLATFORM);
    expect(arg.status).toBe("PENDING");
  });

  it("bloqueia quando o app do Instagram não está configurado", async () => {
    delete process.env.INSTAGRAM_APP_ID;
    const r = await startInstagramLogin({ restaurantId: "r1", userId: "u1", redirectUri: REDIRECT });
    expect(r.ok).toBe(false);
    expect(r.blocked).toBe("BLOCKED_BY_INSTAGRAM_APP_ENV");
  });
});

describe("callback", () => {
  it("salva token IG criptografado + connectedVia=instagram_login (sem Página)", async () => {
    db.metaOAuthState.findUnique.mockResolvedValue(futureState());
    const graph = mockGraph();
    const r = await handleInstagramLoginCallback({ state: "st-xyz", code: "CODE#_", error: null, redirectUri: REDIRECT }, graph);
    expect(r.ok).toBe(true);
    expect(r.username).toBe("sushicazza");
    expect(graph.exchange).toHaveBeenCalledOnce();

    const saved = db.instagramChannelConfig.upsert.mock.calls[0][0];
    // Token is encrypted, never stored raw.
    expect(saved.create.pageAccessTokenEncrypted).toBeTruthy();
    expect(JSON.stringify(saved)).not.toContain("IG_LONG_TOKEN_SECRET");
    expect(saved.create.instagramBusinessAccountId).toBe("IG_USER_1");
    expect(saved.create.facebookPageId).toBeNull();
    expect(saved.create.mode).toBe("RECEIVE_ONLY");
    expect((saved.create.metadata as { connectedVia: string }).connectedVia).toBe(INSTAGRAM_LOGIN_PLATFORM);
    // State consumed.
    expect(db.metaOAuthState.update).toHaveBeenCalled();
  });

  it("rejeita state inválido / já usado", async () => {
    db.metaOAuthState.findUnique.mockResolvedValue({ ...futureState(), status: "CONSUMED" });
    const r = await handleInstagramLoginCallback({ state: "st-xyz", code: "CODE", error: null, redirectUri: REDIRECT }, mockGraph());
    expect(r.ok).toBe(false);
    expect(db.instagramChannelConfig.upsert).not.toHaveBeenCalled();
  });

  it("rejeita state de outra plataforma (ex.: facebook)", async () => {
    db.metaOAuthState.findUnique.mockResolvedValue({ ...futureState(), returnPlatform: "facebook" });
    const r = await handleInstagramLoginCallback({ state: "st-xyz", code: "CODE", error: null, redirectUri: REDIRECT }, mockGraph());
    expect(r.ok).toBe(false);
    expect(db.instagramChannelConfig.upsert).not.toHaveBeenCalled();
  });

  it("rejeita state expirado", async () => {
    db.metaOAuthState.findUnique.mockResolvedValue({ ...futureState(), expiresAt: new Date(Date.now() - 1000) });
    const r = await handleInstagramLoginCallback({ state: "st-xyz", code: "CODE", error: null, redirectUri: REDIRECT }, mockGraph());
    expect(r.ok).toBe(false);
    expect(r.reason).toContain("expirou");
  });
});
