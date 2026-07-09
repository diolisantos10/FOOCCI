/**
 * googleOAuth — the one-click "Conectar Google" handshake for the DATA integration
 * (Meu Negócio + Analytics GA4). Mirrors the Meta/Instagram OAuth pattern:
 *
 *   start    → create single-use CSRF state row → redirect to Google consent
 *   callback → validate state → exchange code → store encrypted tokens
 *   refresh  → exchange refresh_token for a fresh access_token when expired
 *
 * Trust is anchored on the `state` row (not just the session). Raw tokens never
 * leave the server; the client only sees masked status via GoogleConfigService.
 */

import { randomBytes } from "crypto";
import { prisma } from "@/lib/prisma";
import { getPublicBaseUrl } from "@/lib/public-base-url";
import {
  googleClientId, googleClientSecret, googleOAuthConfigured,
  GOOGLE_AUTH_URL, GOOGLE_TOKEN_URL, GOOGLE_USERINFO_URL,
  GOOGLE_DATA_SCOPES, GOOGLE_OAUTH_STATE_TTL_MS,
} from "./googleFlag";
import {
  getGoogleConfig, saveTokens, decryptRefreshToken, decryptAccessToken, markRefreshRevoked,
} from "./GoogleConfigService";
import type { GoogleIntegrationConfig } from "@prisma/client";

export type StartBlock = "PUBLIC_BASE_URL_NOT_CONFIGURED" | "BLOCKED_BY_GOOGLE_APP_ENV";
export interface StartResult { ok: boolean; authUrl?: string; blocked?: StartBlock }
export interface CallbackResult { ok: boolean; restaurantId?: string; error?: string }

/** Canonical redirect URI registered in the Google Cloud OAuth client. */
export function googleRedirectUri(originFallback?: string): string {
  const base = getPublicBaseUrl(originFallback).url ?? "";
  return `${base}/api/integrations/google/oauth/callback`;
}

export async function startGoogleConnect(input: {
  restaurantId: string; userId: string; originFallback?: string;
}): Promise<StartResult> {
  if (!googleOAuthConfigured()) return { ok: false, blocked: "BLOCKED_BY_GOOGLE_APP_ENV" };

  const base = getPublicBaseUrl(input.originFallback);
  if (!base.url) return { ok: false, blocked: "PUBLIC_BASE_URL_NOT_CONFIGURED" };

  const state = randomBytes(24).toString("hex");
  await prisma.googleOAuthState.create({
    data: {
      restaurantId: input.restaurantId,
      userId:       input.userId,
      state,
      status:       "PENDING",
      expiresAt:    new Date(Date.now() + GOOGLE_OAUTH_STATE_TTL_MS),
    },
  });

  const url = new URL(GOOGLE_AUTH_URL);
  url.searchParams.set("client_id", googleClientId()!);
  url.searchParams.set("redirect_uri", `${base.url}/api/integrations/google/oauth/callback`);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", GOOGLE_DATA_SCOPES.join(" "));
  url.searchParams.set("access_type", "offline"); // request a refresh_token
  url.searchParams.set("prompt", "consent");      // force refresh_token even on re-auth
  url.searchParams.set("include_granted_scopes", "true");
  url.searchParams.set("state", state);
  return { ok: true, authUrl: url.toString() };
}

interface GoogleTokenResponse {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  scope?: string;
  id_token?: string;
  error?: string;
  error_description?: string;
}

export async function handleGoogleCallback(input: {
  state: string; code: string | null; error: string | null; originFallback?: string;
}): Promise<CallbackResult> {
  if (input.error) return { ok: false, error: input.error };
  if (!input.state || !input.code) return { ok: false, error: "missing_state_or_code" };

  const stateRow = await prisma.googleOAuthState.findUnique({ where: { state: input.state } });
  if (!stateRow || stateRow.status !== "PENDING" || stateRow.expiresAt < new Date()) {
    return { ok: false, error: "invalid_state" };
  }
  // Single-use: consume immediately.
  await prisma.googleOAuthState.update({ where: { id: stateRow.id }, data: { status: "CONSUMED" } });

  try {
    const redirectUri = googleRedirectUri(input.originFallback);
    const body = new URLSearchParams({
      client_id:     googleClientId()!,
      client_secret: googleClientSecret()!,
      code:          input.code,
      grant_type:    "authorization_code",
      redirect_uri:  redirectUri,
    });
    const res = await fetch(GOOGLE_TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: body.toString(),
    });
    const json = (await res.json().catch(() => ({}))) as GoogleTokenResponse;
    if (!res.ok || !json.access_token) {
      return { ok: false, error: json.error_description ?? json.error ?? "token_exchange_failed" };
    }

    // Look up the connected account email (display only).
    let email: string | null = null;
    let sub: string | null = null;
    try {
      const ui = await fetch(GOOGLE_USERINFO_URL, { headers: { Authorization: `Bearer ${json.access_token}` } });
      if (ui.ok) {
        const u = (await ui.json()) as { email?: string; sub?: string };
        email = u.email ?? null;
        sub = u.sub ?? null;
      }
    } catch { /* best-effort */ }

    await saveTokens(stateRow.restaurantId, {
      accessToken:  json.access_token,
      refreshToken: json.refresh_token, // only present with prompt=consent / first grant
      tokenExpiresAt: json.expires_in ? new Date(Date.now() + json.expires_in * 1000) : null,
      scopes:       json.scope ?? GOOGLE_DATA_SCOPES.join(" "),
      googleEmail:  email,
      googleUserId: sub,
    });
    return { ok: true, restaurantId: stateRow.restaurantId };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "callback_failed" };
  }
}

/** Exchange the stored refresh_token for a fresh access_token. */
async function refreshAccessToken(row: GoogleIntegrationConfig): Promise<string | null> {
  const refresh = decryptRefreshToken(row);
  if (!refresh || !googleOAuthConfigured()) return null;
  try {
    const body = new URLSearchParams({
      client_id:     googleClientId()!,
      client_secret: googleClientSecret()!,
      refresh_token: refresh,
      grant_type:    "refresh_token",
    });
    const res = await fetch(GOOGLE_TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: body.toString(),
    });
    const json = (await res.json().catch(() => ({}))) as GoogleTokenResponse & { error?: string };
    if (!res.ok || !json.access_token) {
      // invalid_grant = refresh token revoked/expired → permanent. Flip to
      // disconnected so the UI stops prompting reconnect against dead creds.
      // Transient failures (5xx / network) keep the connection for a later retry.
      if (json.error === "invalid_grant") {
        await markRefreshRevoked(row.restaurantId).catch(() => {});
      }
      return null;
    }
    await saveTokens(row.restaurantId, {
      accessToken:    json.access_token,
      tokenExpiresAt: json.expires_in ? new Date(Date.now() + json.expires_in * 1000) : null,
      scopes:         json.scope ?? row.scopes ?? undefined,
    });
    return json.access_token;
  } catch {
    return null;
  }
}

/**
 * Returns a usable access token for a restaurant, refreshing if expired/near-expiry.
 * Returns null when the restaurant is not connected or the refresh fails.
 */
export async function getValidAccessToken(restaurantId: string): Promise<string | null> {
  const row = await getGoogleConfig(restaurantId);
  if (!row || !row.connected) return null;

  const expiresSoon = !row.tokenExpiresAt || row.tokenExpiresAt.getTime() - Date.now() < 60_000;
  if (!expiresSoon && row.accessTokenEncrypted) {
    const cached = decryptAccessToken(row);
    if (cached) return cached;
  }
  return refreshAccessToken(row);
}
