/**
 * Instagram Business Login — direct "Entrar com Instagram" connect (NO Facebook).
 *
 * Uses Meta's "Instagram API with Instagram Login": the lojista authorizes with
 * their Instagram PROFESSIONAL account directly — no Facebook account and no
 * Facebook Page required. This is the path for restaurants that only have an
 * Instagram. Flow: start → Instagram dialog → callback (exchange code → short-
 * lived token → 60-day long-lived token → profile) → save InstagramChannelConfig
 * (RECEIVE_ONLY, encrypted token, connectedVia="instagram_login").
 *
 * Requires INSTAGRAM_APP_ID + INSTAGRAM_APP_SECRET — the values from the Meta app's
 * Instagram → "API setup with Instagram login" page (the Instagram app id/secret,
 * which may differ from the Facebook app id/secret). The Graph client is injectable
 * so tests never hit the network. Nothing here sends a Direct or creates an order/Pix.
 */

import { randomBytes } from "crypto";
import { prisma } from "@/lib/prisma";
import { getPublicBaseUrl } from "@/lib/public-base-url";
import { upsertInstagramConfig } from "./InstagramConfigService";

const IG_WWW = "https://www.instagram.com";
const IG_API = "https://api.instagram.com";
const IG_GRAPH = "https://graph.instagram.com";
const GRAPH_VERSION = "v21.0";
const STATE_TTL_MS = 10 * 60 * 1000; // 10 minutes

/** Marker stored on the OAuth state row so the callback knows this is the IG-login flow. */
export const INSTAGRAM_LOGIN_PLATFORM = "instagram_login";

/** Permissions requested in the Instagram dialog — all require Meta App Review
 *  before non-tester accounts can grant them. */
export const INSTAGRAM_LOGIN_SCOPES = [
  "instagram_business_basic",
  "instagram_business_manage_messages",
  "instagram_business_manage_comments",
] as const;

export interface InstagramLoginCreds { appId: string; appSecret: string }

/** Reads the Instagram-Login app credentials from env. Falls back to META_APP_SECRET
 *  for the secret when a dedicated one is not set (single-app setups). */
export function getInstagramLoginCreds(): InstagramLoginCreds | null {
  const appId = process.env.INSTAGRAM_APP_ID;
  const appSecret = process.env.INSTAGRAM_APP_SECRET ?? process.env.META_APP_SECRET;
  if (!appId || !appSecret) return null;
  return { appId, appSecret };
}

export function isInstagramLoginConfigured(): boolean {
  return getInstagramLoginCreds() !== null;
}

export interface InstagramLoginEnvStatus {
  appIdConfigured: boolean;
  appSecretConfigured: boolean;
  publicBaseUrlConfigured: boolean;
  ready: boolean;
  missing: string[];
}

/** Which env vars are missing for the direct Instagram login (names only, never values). */
export function getInstagramLoginEnvStatus(originFallback?: string): InstagramLoginEnvStatus {
  const appIdOk = !!process.env.INSTAGRAM_APP_ID;
  const appSecretOk = !!(process.env.INSTAGRAM_APP_SECRET ?? process.env.META_APP_SECRET);
  const base = getPublicBaseUrl(originFallback);
  const missing: string[] = [];
  if (!appIdOk) missing.push("INSTAGRAM_APP_ID");
  if (!appSecretOk) missing.push("INSTAGRAM_APP_SECRET");
  if (!base.configured) missing.push("FOOCCI_BASE_URL=https://foocci.com.br");
  return {
    appIdConfigured: appIdOk,
    appSecretConfigured: appSecretOk,
    publicBaseUrlConfigured: base.configured,
    ready: appIdOk && appSecretOk && base.url !== null,
    missing,
  };
}

/** OAuth redirect URI from the PUBLIC base URL (never localhost in production). */
export function instagramLoginRedirectUri(origin: string): string | null {
  const base = getPublicBaseUrl(origin);
  if (!base.url) return null;
  return `${base.url}/api/integrations/instagram/login/callback`;
}

export function buildInstagramAuthUrl(input: { appId: string; redirectUri: string; state: string }): string {
  const params = new URLSearchParams({
    enable_fb_login: "0",
    force_authentication: "1",
    client_id: input.appId,
    redirect_uri: input.redirectUri,
    response_type: "code",
    scope: INSTAGRAM_LOGIN_SCOPES.join(","),
    state: input.state,
  });
  return `${IG_WWW}/oauth/authorize?${params.toString()}`;
}

// ── Graph client (injectable) ─────────────────────────────────────────────────
export interface InstagramProfile {
  igUserId: string;
  username: string | null;
  longLivedToken: string;
  expiresInSeconds: number | null;
}

export interface InstagramLoginGraph {
  exchange(input: { code: string; redirectUri: string; creds: InstagramLoginCreds }): Promise<InstagramProfile>;
}

export const realInstagramLoginGraph: InstagramLoginGraph = {
  async exchange({ code, redirectUri, creds }) {
    // 1) code → short-lived user token (+ user_id). Instagram appends "#_" to the
    //    code on web redirects; it must be stripped before the exchange.
    const form = new URLSearchParams({
      client_id: creds.appId,
      client_secret: creds.appSecret,
      grant_type: "authorization_code",
      redirect_uri: redirectUri,
      code: code.replace(/#_$/, ""),
    });
    const shortRes = await fetch(`${IG_API}/oauth/access_token`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: form.toString(),
    });
    const shortBody = (await shortRes.json().catch(() => ({}))) as {
      access_token?: string; user_id?: string | number;
      data?: { access_token?: string; user_id?: string | number }[];
      error_message?: string; error_type?: string;
    };
    const shortToken = shortBody.access_token ?? shortBody.data?.[0]?.access_token;
    const tokenUserId = String(shortBody.user_id ?? shortBody.data?.[0]?.user_id ?? "");
    if (!shortRes.ok || !shortToken) {
      throw new Error(shortBody.error_message ?? `Troca de código falhou (HTTP ${shortRes.status})`);
    }

    // 2) short-lived → long-lived (60-day) token. RETRY: a transient failure here used to
    //    silently fall back to the 1h short token, which then died in ~1h and killed
    //    inbound DMs. Retry a few times before accepting the short token.
    const longUrl = `${IG_GRAPH}/access_token?grant_type=ig_exchange_token`
      + `&client_secret=${encodeURIComponent(creds.appSecret)}`
      + `&access_token=${encodeURIComponent(shortToken)}`;
    let longToken = shortToken;
    let expiresIn: number | null = null;
    let lastErr = "none";
    for (let attempt = 1; attempt <= 3; attempt++) {
      const longRes = await fetch(longUrl);
      const longBody = (await longRes.json().catch(() => ({}))) as {
        access_token?: string; expires_in?: number; error?: { message?: string };
      };
      if (longBody.access_token) {
        longToken  = longBody.access_token;
        expiresIn  = typeof longBody.expires_in === "number" ? longBody.expires_in : null;
        console.log(`[ig-oauth] longLived OK attempt=${attempt} expiresIn=${expiresIn ?? "null"}`);
        break;
      }
      lastErr = longBody.error?.message ?? `HTTP ${longRes.status}`;
      console.warn(`[ig-oauth] longLived FAILED attempt=${attempt} err=${lastErr}`);
      if (attempt < 3) await new Promise((r) => setTimeout(r, 700 * attempt));
    }
    // If every attempt failed we keep the short token so the connection still forms, but
    // its (short) expiry is recorded so the refresh cron / health check flags it fast.
    if (expiresIn === null && longToken === shortToken) {
      expiresIn = 3600; // short-lived tokens last ~1h — record it, don't pretend it's 60 days
      console.error(`[ig-oauth] LONG-LIVED EXCHANGE FAILED — stored SHORT token (dies in ~1h). lastErr=${lastErr}`);
    }

    // 3) profile — canonical account id (matches webhook entry[].id) + @username.
    let username: string | null = null;
    let igUserId = tokenUserId;
    try {
      const meUrl = `${IG_GRAPH}/${GRAPH_VERSION}/me?fields=user_id,username&access_token=${encodeURIComponent(longToken)}`;
      const meRes = await fetch(meUrl);
      const meBody = (await meRes.json().catch(() => ({}))) as { user_id?: string; id?: string; username?: string };
      username = typeof meBody.username === "string" ? meBody.username : null;
      igUserId = String(meBody.user_id ?? meBody.id ?? tokenUserId);
    } catch { /* keep the id from the token exchange */ }

    return { igUserId, username, longLivedToken: longToken, expiresInSeconds: expiresIn };
  },
};

/**
 * Refresh a long-lived Instagram user token (GET /refresh_access_token). Instagram
 * long-lived tokens last ~60 days and can be refreshed once they are ≥24h old and not
 * yet expired — each refresh extends them another 60 days. A cron calls this before
 * expiry so the connection never silently dies (the root cause of the earlier outage).
 */
export async function refreshInstagramLongLivedToken(
  token: string,
): Promise<{ ok: boolean; token?: string; expiresInSeconds?: number | null; error?: string }> {
  try {
    const url = `${IG_GRAPH}/refresh_access_token?grant_type=ig_refresh_token&access_token=${encodeURIComponent(token)}`;
    const res = await fetch(url);
    const body = (await res.json().catch(() => ({}))) as {
      access_token?: string; expires_in?: number; error?: { message?: string };
    };
    if (!res.ok || !body.access_token) {
      return { ok: false, error: body.error?.message ?? `HTTP ${res.status}` };
    }
    return { ok: true, token: body.access_token, expiresInSeconds: typeof body.expires_in === "number" ? body.expires_in : null };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "refresh failed" };
  }
}

// ── Start ──────────────────────────────────────────────────────────────────────
export interface StartResult {
  ok: boolean;
  authUrl?: string;
  blocked?: "BLOCKED_BY_INSTAGRAM_APP_ENV" | "PUBLIC_BASE_URL_NOT_CONFIGURED";
  missing?: string[];
}

export async function startInstagramLogin(
  input: { restaurantId: string; userId: string; redirectUri: string | null },
): Promise<StartResult> {
  const creds = getInstagramLoginCreds();
  if (!creds) return { ok: false, blocked: "BLOCKED_BY_INSTAGRAM_APP_ENV", missing: getInstagramLoginEnvStatus().missing };
  if (!input.redirectUri) {
    return { ok: false, blocked: "PUBLIC_BASE_URL_NOT_CONFIGURED", missing: ["FOOCCI_BASE_URL=https://foocci.com.br"] };
  }

  const state = randomBytes(24).toString("hex");
  await prisma.metaOAuthState.create({
    data: {
      restaurantId: input.restaurantId,
      userId: input.userId,
      state,
      status: "PENDING",
      returnPlatform: INSTAGRAM_LOGIN_PLATFORM,
      expiresAt: new Date(Date.now() + STATE_TTL_MS),
    },
  });
  return { ok: true, authUrl: buildInstagramAuthUrl({ appId: creds.appId, redirectUri: input.redirectUri, state }) };
}

// ── Callback ─────────────────────────────────────────────────────────────────
export interface CallbackResult {
  ok: boolean;
  restaurantId: string | null;
  reason: string | null;
  username: string | null;
  /** How long the stored token lasts. null = unknown. A durable connection is ~60 days. */
  tokenExpiresInSeconds?: number | null;
  /** True when the long-lived exchange fell back to a short token (dies in ~1h). The
   *  connection still forms, but it is NOT healthy — the panel must say so, not show green. */
  shortLived?: boolean;
}

/** A token below this is treated as short-lived (the ~1h fallback), not a real 60-day token. */
export const DURABLE_TOKEN_MIN_SECONDS = 7 * 24 * 60 * 60; // 7 days

export async function handleInstagramLoginCallback(
  input: { state: string; code?: string | null; error?: string | null; redirectUri: string | null },
  graph: InstagramLoginGraph = realInstagramLoginGraph,
): Promise<CallbackResult> {
  if (!input.state) return { ok: false, restaurantId: null, reason: "state ausente", username: null };
  const row = await prisma.metaOAuthState.findUnique({ where: { state: input.state } });
  const platform = (row as { returnPlatform?: string | null } | null)?.returnPlatform ?? null;
  if (!row || row.status !== "PENDING" || platform !== INSTAGRAM_LOGIN_PLATFORM) {
    return { ok: false, restaurantId: row?.restaurantId ?? null, reason: "Sessão de conexão inválida ou já usada.", username: null };
  }
  if (row.expiresAt.getTime() < Date.now()) {
    await prisma.metaOAuthState.update({ where: { id: row.id }, data: { status: "CONSUMED", error: "expirado" } }).catch(() => undefined);
    return { ok: false, restaurantId: row.restaurantId, reason: "A conexão expirou. Tente novamente.", username: null };
  }
  if (input.error) {
    await prisma.metaOAuthState.update({ where: { id: row.id }, data: { status: "CONSUMED", error: input.error.slice(0, 300) } }).catch(() => undefined);
    return { ok: false, restaurantId: row.restaurantId, reason: "Autorização cancelada no Instagram.", username: null };
  }
  const creds = getInstagramLoginCreds();
  if (!creds || !input.code || !input.redirectUri) {
    return { ok: false, restaurantId: row.restaurantId, reason: "Configuração do Instagram ausente.", username: null };
  }

  try {
    const profile = await graph.exchange({ code: input.code, redirectUri: input.redirectUri, creds });
    if (!profile.igUserId) throw new Error("Não foi possível identificar a conta do Instagram.");

    // Durability gate. The long-lived exchange (ig_exchange_token) can fall back to the
    // ~1h short token — the exact failure that killed Sushi Cazza on 25-Jul. When that
    // happens the connection still forms, so without this the panel would show a green
    // "conectado" that dies within the hour and drops every DM in silence. Surface it as
    // an error on the config (Diagnóstico card + daily refresh alert carry the evidence),
    // and clear any stale error on a genuinely durable reconnect.
    const shortLived =
      typeof profile.expiresInSeconds === "number" && profile.expiresInSeconds < DURABLE_TOKEN_MIN_SECONDS;
    const lastError = shortLived
      ? "Conexão instável: o Instagram devolveu um token de curta duração (expira em ~1h) em vez do token de 60 dias. Reconecte a conta; se repetir, a troca long-lived está falhando em produção."
      : null;

    const result = await upsertInstagramConfig(row.restaurantId, {
      instagramBusinessAccountId: profile.igUserId,
      facebookPageId: null,
      pageAccessToken: profile.longLivedToken, // encrypted before storage
      mode: "RECEIVE_ONLY",
      // Receive from all customers by default — a fresh connection dropping every
      // DM (TEST_ACCOUNT_ONLY + empty allowlist) reads as "broken". The panel has a
      // one-click "Restringir a conta de teste" to narrow it back when needed.
      scope: "RESTAURANT_WIDE",
      enabled: true,
      paused: false,
      lastError,
      metadata: {
        connectedVia: INSTAGRAM_LOGIN_PLATFORM,
        connectedAt: new Date().toISOString(),
        facebookPageName: null,
        instagramUsername: profile.username,
        tokenExpiresAt: profile.expiresInSeconds
          ? new Date(Date.now() + profile.expiresInSeconds * 1000).toISOString()
          : null,
      },
    });

    await prisma.metaOAuthState.update({ where: { id: row.id }, data: { status: "CONSUMED", userAccessTokenEncrypted: null } }).catch(() => undefined);

    if (!result.ok) {
      return { ok: false, restaurantId: row.restaurantId, reason: result.error ?? "Não foi possível salvar a configuração.", username: profile.username };
    }
    return {
      ok: true,
      restaurantId: row.restaurantId,
      reason: null,
      username: profile.username,
      tokenExpiresInSeconds: profile.expiresInSeconds ?? null,
      shortLived,
    };
  } catch (err) {
    const reason = err instanceof Error ? err.message.slice(0, 200) : "erro ao conectar com o Instagram";
    await prisma.metaOAuthState.update({ where: { id: row.id }, data: { status: "CONSUMED", error: reason } }).catch(() => undefined);
    return { ok: false, restaurantId: row.restaurantId, reason, username: null };
  }
}
