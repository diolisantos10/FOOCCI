/**
 * Customer-facing public URL helpers.
 *
 * Resolution priority (first non-empty, non-localhost-in-production wins):
 *   1. NEXT_PUBLIC_SITE_URL  — canonical customer domain (e.g. https://foocci.com.br).
 *                              Set this in Railway to override everything else.
 *   2. NEXTAUTH_URL          — Next-Auth callback base; typically set to the public domain.
 *   3. NEXT_PUBLIC_APP_URL   — deployment origin used for NextAuth OAuth callbacks. This is
 *                              typically the Railway internal proxy URL and must NEVER appear
 *                              in customer-facing WhatsApp messages, QR codes, or links.
 *   4. Hard fallback         — https://foocci.com.br
 *
 * Guard: if NODE_ENV=production and a candidate URL contains "localhost", it is skipped
 * and an error is logged. This prevents Railway's internal loopback from leaking into
 * customer-visible links (recovery links, QR codes, WhatsApp messages).
 *
 * All services that generate customer-facing links must import from here.
 */

function resolvePublicSiteUrl(): string {
  const candidates = [
    process.env.NEXT_PUBLIC_SITE_URL,
    process.env.NEXTAUTH_URL,
    process.env.NEXT_PUBLIC_APP_URL,
  ];

  for (const raw of candidates) {
    if (!raw) continue;
    const trimmed = raw.replace(/\/$/, "");
    if (process.env.NODE_ENV === "production" && trimmed.includes("localhost")) {
      console.error(
        `[public-url] Skipping candidate URL that contains "localhost" in production: "${trimmed}"`,
      );
      continue;
    }
    return trimmed;
  }

  if (process.env.NODE_ENV === "production") {
    console.error(
      "[public-url] No valid public site URL found in env — using hardcoded fallback https://foocci.com.br",
    );
  }
  return "https://foocci.com.br";
}

const SITE_URL = resolvePublicSiteUrl();

/** Delivery/ordering menu URL — sent to customers over WhatsApp, CRM, etc. */
export function getPublicMenuUrl(slug: string): string {
  return `${SITE_URL}/pedido/${slug}`;
}

/** QR/dine-in menu URL — for salão / read-only menu scenarios. */
export function getPublicQrUrl(slug: string): string {
  return `${SITE_URL}/qr/${slug}`;
}

/** The canonical public site URL (no trailing slash). */
export function getPublicSiteUrl(): string {
  return SITE_URL;
}
