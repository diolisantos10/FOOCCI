/**
 * Instagram Business Login — the token EXCHANGE, and the durability gate around it.
 *
 * Sushi Cazza's Instagram died on 25-Jul because the reconnection stored a SHORT (~1h)
 * token instead of the 60-day one. The exchange code already swaps short→long via
 * `ig_exchange_token` with retries; these tests LOCK that swap so a refactor can never
 * silently reintroduce the short-token regression — and lock the new gate that makes a
 * short-token fallback VISIBLE (lastError set, shortLived flag) instead of a green
 * "conectado" that dies in an hour.
 *
 * The real graph client is exercised against a mocked global.fetch (no network); the
 * callback is exercised with mocked prisma + an injected graph.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

const db = vi.hoisted(() => ({
  metaOAuthState: { create: vi.fn(), findUnique: vi.fn(), update: vi.fn() },
  instagramChannelConfig: { findUnique: vi.fn(), upsert: vi.fn() },
}));
vi.mock("@/lib/prisma", () => ({ prisma: db }));

import {
  realInstagramLoginGraph,
  handleInstagramLoginCallback,
  INSTAGRAM_LOGIN_PLATFORM,
  DURABLE_TOKEN_MIN_SECONDS,
  type InstagramLoginGraph,
} from "../instagramLoginOAuth";

const CREDS = { appId: "ig-app-123", appSecret: "ig-secret-456" };
const REDIRECT = "https://foocci.com.br/api/integrations/instagram/login/callback";
const SIXTY_DAYS = 5_184_000;

// ── Real exchange against a mocked fetch ────────────────────────────────────────
type FetchStub = (url: string, init?: RequestInit) => { ok: boolean; status: number; body: unknown };

function installFetch(handler: FetchStub) {
  vi.stubGlobal("fetch", vi.fn(async (input: unknown, init?: RequestInit) => {
    const url = String(input);
    const { ok, status, body } = handler(url, init);
    return { ok, status, json: async () => body } as unknown as Response;
  }));
}

afterEach(() => vi.unstubAllGlobals());

describe("realInstagramLoginGraph.exchange — short→long swap (the 25-Jul root cause)", () => {
  it("troca o token curto pelo long-lived de ~60 dias e o retorna", async () => {
    installFetch((url) => {
      if (url.includes("api.instagram.com/oauth/access_token")) {
        return { ok: true, status: 200, body: { access_token: "SHORT_1H", user_id: "IG_1" } };
      }
      if (url.includes("grant_type=ig_exchange_token")) {
        return { ok: true, status: 200, body: { access_token: "LONG_60D", expires_in: SIXTY_DAYS } };
      }
      if (url.includes("/me")) {
        return { ok: true, status: 200, body: { user_id: "IG_1", username: "sushicazza" } };
      }
      return { ok: false, status: 404, body: {} };
    });

    const profile = await realInstagramLoginGraph.exchange({ code: "CODE", redirectUri: REDIRECT, creds: CREDS });

    // The stored token MUST be the long-lived one, never the short one.
    expect(profile.longLivedToken).toBe("LONG_60D");
    expect(profile.longLivedToken).not.toBe("SHORT_1H");
    expect(profile.expiresInSeconds).toBe(SIXTY_DAYS);
    expect(profile.expiresInSeconds).toBeGreaterThan(DURABLE_TOKEN_MIN_SECONDS);
    expect(profile.username).toBe("sushicazza");
  });

  it("quando a troca long-lived falha nas 3 tentativas, guarda o token curto com validade de ~1h (não finge 60 dias)", async () => {
    installFetch((url) => {
      if (url.includes("api.instagram.com/oauth/access_token")) {
        return { ok: true, status: 200, body: { access_token: "SHORT_1H", user_id: "IG_1" } };
      }
      if (url.includes("grant_type=ig_exchange_token")) {
        // Every attempt fails — the exact transient-failure shape from production.
        return { ok: false, status: 500, body: { error: { message: "temporarily unavailable" } } };
      }
      if (url.includes("/me")) {
        return { ok: true, status: 200, body: { user_id: "IG_1", username: "sushicazza" } };
      }
      return { ok: false, status: 404, body: {} };
    });

    const profile = await realInstagramLoginGraph.exchange({ code: "CODE", redirectUri: REDIRECT, creds: CREDS });

    // The connection still forms (short token kept), but its short expiry is recorded so
    // the gate below and the daily cron flag it fast — it must NOT be reported as 60 days.
    expect(profile.longLivedToken).toBe("SHORT_1H");
    expect(profile.expiresInSeconds).toBe(3600);
    expect(profile.expiresInSeconds).toBeLessThan(DURABLE_TOKEN_MIN_SECONDS);
  }, 10_000);
});

// ── Callback durability gate ────────────────────────────────────────────────────
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

function graphReturning(expiresInSeconds: number | null): InstagramLoginGraph {
  return {
    exchange: vi.fn(async () => ({
      igUserId: "IG_1",
      username: "sushicazza",
      longLivedToken: "TOKEN",
      expiresInSeconds,
    })),
  };
}

describe("handleInstagramLoginCallback — durability gate", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.ENCRYPTION_KEY = "0".repeat(64);
    process.env.INSTAGRAM_APP_ID = "ig-app-123";
    process.env.INSTAGRAM_APP_SECRET = "ig-secret-456";
    process.env.FOOCCI_BASE_URL = "https://foocci.com.br";
    db.metaOAuthState.findUnique.mockResolvedValue(futureState());
    db.metaOAuthState.update.mockResolvedValue({});
    db.instagramChannelConfig.findUnique.mockResolvedValue(null);
    db.instagramChannelConfig.upsert.mockImplementation(async ({ create, update }: { create: Record<string, unknown>; update: Record<string, unknown> }) => ({
      id: "c1", restaurantId: "r1", enabled: true, paused: false, mode: "RECEIVE_ONLY", scope: "RESTAURANT_WIDE",
      instagramBusinessAccountId: "IG_1", facebookPageId: null, pageAccessTokenEncrypted: "enc", verifyTokenHash: null,
      appId: null, appSecretRef: null, allowlistedExternalUserIds: [], lastWebhookAt: null, lastError: null, metadata: null,
      ...create, ...update,
    }));
  });

  it("token durável (~60 dias): conecta limpo e LIMPA qualquer erro antigo", async () => {
    const r = await handleInstagramLoginCallback(
      { state: "st-xyz", code: "CODE", error: null, redirectUri: REDIRECT },
      graphReturning(SIXTY_DAYS),
    );
    expect(r.ok).toBe(true);
    expect(r.shortLived).toBe(false);
    const saved = db.instagramChannelConfig.upsert.mock.calls[0][0];
    // lastError is explicitly cleared so a stale "reconexão necessária" doesn't linger.
    expect(saved.create.lastError).toBeNull();
  });

  it("token curto (~1h): conecta MAS grava lastError com a evidência (não mostra verde mentiroso)", async () => {
    const r = await handleInstagramLoginCallback(
      { state: "st-xyz", code: "CODE", error: null, redirectUri: REDIRECT },
      graphReturning(3600),
    );
    expect(r.ok).toBe(true);
    expect(r.shortLived).toBe(true);
    expect(r.tokenExpiresInSeconds).toBe(3600);
    const saved = db.instagramChannelConfig.upsert.mock.calls[0][0];
    expect(String(saved.create.lastError)).toMatch(/curta duração|60 dias/i);
  });
});
