/**
 * Customer-facing public URL helpers.
 *
 * Resolution priority (first non-empty, non-canonical-in-production wins):
 *   1. NEXT_PUBLIC_SITE_URL  — canonical customer domain (e.g. https://foocci.com.br).
 *                              Set this in Railway to override everything else.
 *   2. NEXTAUTH_URL          — Next-Auth callback base; typically set to the public domain.
 *   3. NEXT_PUBLIC_APP_URL   — deployment origin used for NextAuth OAuth callbacks. This is
 *                              typically the Railway internal proxy URL and must NEVER appear
 *                              in customer-facing WhatsApp messages, QR codes, or links.
 *   4. Hard fallback         — https://foocci.com.br
 *
 * Guards: in production, any candidate that contains "localhost" or ".railway.app" is
 * rejected and an error is logged. This prevents Railway's internal domain from leaking
 * into customer-visible links (recovery links, QR codes, WhatsApp messages).
 *
 * All services that generate customer-facing links must import from here.
 */

function isNonCanonicalHost(url: string): boolean {
  return url.includes("localhost") || url.includes(".railway.app");
}

function resolvePublicSiteUrl(): string {
  const candidates = [
    process.env.NEXT_PUBLIC_SITE_URL,
    process.env.NEXTAUTH_URL,
    process.env.NEXT_PUBLIC_APP_URL,
  ];

  for (const raw of candidates) {
    if (!raw) continue;
    const trimmed = raw.replace(/\/$/, "");
    if (process.env.NODE_ENV === "production" && isNonCanonicalHost(trimmed)) {
      console.error(
        `[public-url] Skipping non-canonical candidate URL in production: "${trimmed}"`,
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

/**
 * The canonical Evolution webhook URL (base, no token) — the SINGLE source of
 * truth used by the diagnostics card, the live-status comparison, and the sync
 * endpoint. Always built from the canonical site URL (never the Railway proxy
 * host), so a `host`-derived `foocci.up.railway.app` can never be applied to
 * Evolution by mistake.
 */
export function getExpectedEvolutionWebhookUrl(): string {
  return `${SITE_URL}/api/webhooks/evolution`;
}

/**
 * Sanitizes a URL stored in the database (e.g. WhatsAppAgentConfig.menuUrl)
 * by replacing non-canonical hosts (Railway domain, localhost) with the canonical
 * site URL. Call this before using any admin-configured URL in customer-facing output.
 */
export function sanitizeCustomerUrl(storedUrl: string): string {
  try {
    const parsed = new URL(storedUrl);
    if (isNonCanonicalHost(parsed.hostname)) {
      const canonical = new URL(SITE_URL);
      console.warn("[public-url] rejected non-canonical customer host", {
        host: parsed.hostname,
        fallbackHost: canonical.hostname,
      });
      parsed.protocol = canonical.protocol;
      parsed.hostname = canonical.hostname;
      parsed.port = "";
      return parsed.toString();
    }
    return storedUrl;
  } catch {
    return storedUrl;
  }
}
