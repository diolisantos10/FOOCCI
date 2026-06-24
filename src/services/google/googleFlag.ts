/**
 * Google integration feature flag + app-level config (env).
 *
 * One Foocci Google Cloud OAuth client powers BOTH the data integration
 * (Google Meu Negócio + Analytics GA4) and "Login com Google" (via NextAuth).
 *
 *   GOOGLE_OAUTH_CLIENT_ID       — OAuth 2.0 client id
 *   GOOGLE_OAUTH_CLIENT_SECRET   — OAuth 2.0 client secret
 *   GOOGLE_INTEGRATION_ENABLED   — "true" to surface the integration UI (optional;
 *                                  defaults to enabled when client creds exist)
 *
 * The data-integration redirect URI is:
 *   <FOOCCI_BASE_URL>/api/integrations/google/oauth/callback
 * The Login-com-Google redirect URI (NextAuth) is:
 *   <NEXTAUTH_URL>/api/auth/callback/google
 * Both must be registered in the Google Cloud OAuth client.
 */

export function googleClientId(): string | undefined {
  return process.env.GOOGLE_OAUTH_CLIENT_ID || process.env.GOOGLE_CLIENT_ID;
}

export function googleClientSecret(): string | undefined {
  return process.env.GOOGLE_OAUTH_CLIENT_SECRET || process.env.GOOGLE_CLIENT_SECRET;
}

/** OAuth creds present → the integration can run. */
export function googleOAuthConfigured(): boolean {
  return Boolean(googleClientId() && googleClientSecret());
}

/** UI gate. Defaults to "configured" so it ships dark until creds exist. */
export function isGoogleIntegrationEnabled(): boolean {
  if (process.env.GOOGLE_INTEGRATION_ENABLED === "false") return false;
  if (process.env.GOOGLE_INTEGRATION_ENABLED === "true") return true;
  return googleOAuthConfigured();
}

// ── OAuth endpoints ───────────────────────────────────────────────────────────
export const GOOGLE_AUTH_URL  = "https://accounts.google.com/o/oauth2/v2/auth";
export const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
export const GOOGLE_USERINFO_URL = "https://openidconnect.googleapis.com/v1/userinfo";

// ── Scopes for the data integration (Meu Negócio + GA4) ─────────────────────────
export const GOOGLE_SCOPE_BUSINESS  = "https://www.googleapis.com/auth/business.manage";
export const GOOGLE_SCOPE_ANALYTICS = "https://www.googleapis.com/auth/analytics.readonly";

/** Scopes requested by the one-click "Conectar Google" data flow. */
export const GOOGLE_DATA_SCOPES = [
  "openid",
  "email",
  GOOGLE_SCOPE_BUSINESS,
  GOOGLE_SCOPE_ANALYTICS,
];

export const GOOGLE_OAUTH_STATE_TTL_MS = 10 * 60 * 1000; // 10 minutes

/** True once a granted scope string contains the given scope. */
export function scopeGranted(scopes: string | null | undefined, scope: string): boolean {
  if (!scopes) return false;
  return scopes.split(/\s+/).includes(scope);
}
