/**
 * getPublicBaseUrl — single source of truth for the PUBLIC base URL used by
 * integrations (Meta OAuth redirect URI, Instagram webhook URL, return links).
 *
 * Resolution order (first valid wins):
 *   1. FOOCCI_BASE_URL        — canonical (set in Railway: https://foocci.com.br)
 *   2. NEXT_PUBLIC_APP_URL
 *   3. APP_URL
 *   4. NEXT_PUBLIC_SITE_URL
 *   5. NEXTAUTH_URL
 *   6. request origin         — DEVELOPMENT ONLY fallback
 *
 * In production any candidate containing "localhost" or ".railway.app" is
 * rejected, and when nothing valid remains the result is an explicit
 * PUBLIC_BASE_URL_NOT_CONFIGURED error — never a broken localhost link.
 */

export interface PublicBaseUrlResult {
  url: string | null;
  configured: boolean;
  usesLocalhostInProduction: boolean;
  error: "PUBLIC_BASE_URL_NOT_CONFIGURED" | null;
}

function isNonCanonicalHost(url: string): boolean {
  return url.includes("localhost") || url.includes("127.0.0.1") || url.includes(".railway.app");
}

export function getPublicBaseUrl(originFallback?: string): PublicBaseUrlResult {
  const isProd = process.env.NODE_ENV === "production";
  const candidates = [
    process.env.FOOCCI_BASE_URL,
    process.env.NEXT_PUBLIC_APP_URL,
    process.env.APP_URL,
    process.env.NEXT_PUBLIC_SITE_URL,
    process.env.NEXTAUTH_URL,
  ];

  let sawLocalhostCandidate = false;
  for (const raw of candidates) {
    if (!raw) continue;
    const trimmed = raw.trim().replace(/\/$/, "");
    if (!trimmed) continue;
    if (isProd && isNonCanonicalHost(trimmed)) {
      sawLocalhostCandidate = true;
      continue; // never leak localhost/railway into production links
    }
    return { url: trimmed, configured: true, usesLocalhostInProduction: false, error: null };
  }

  // Development: the request origin is an acceptable fallback.
  if (!isProd && originFallback) {
    return { url: originFallback.replace(/\/$/, ""), configured: false, usesLocalhostInProduction: false, error: null };
  }

  // Production with nothing valid: explicit error — no broken link.
  return {
    url: null,
    configured: false,
    usesLocalhostInProduction: sawLocalhostCandidate || (isProd && !!originFallback && isNonCanonicalHost(originFallback)),
    error: "PUBLIC_BASE_URL_NOT_CONFIGURED",
  };
}

/** The canonical public domain — used as a last-resort redirect base in production. */
export const CANONICAL_PUBLIC_BASE_URL = "https://foocci.com.br";

/**
 * Base URL for user-facing REDIRECTS (return links, OAuth blocked-state pages).
 * Always reachable from a browser: the resolved public base when configured, else the
 * canonical public domain in production (NEVER the internal request origin, which is
 * http://localhost:8080 behind Railway). In development the request origin is fine.
 */
export function getReturnBaseUrl(originFallback?: string): string {
  const resolved = getPublicBaseUrl(originFallback).url;
  if (resolved) return resolved;
  if (process.env.NODE_ENV === "production") return CANONICAL_PUBLIC_BASE_URL;
  return (originFallback ?? CANONICAL_PUBLIC_BASE_URL).replace(/\/$/, "");
}
