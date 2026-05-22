/**
 * Customer-facing public URL helpers.
 *
 * NEXT_PUBLIC_SITE_URL  — canonical domain sent to customers (e.g. https://foocci.com.br).
 *                         Set this in Railway/env; defaults to https://foocci.com.br.
 * NEXT_PUBLIC_APP_URL   — deployment origin used for NextAuth OAuth callbacks. This is
 *                         typically the Railway internal proxy URL and must NEVER appear
 *                         in customer-facing WhatsApp messages, QR codes, or links.
 *
 * All services that generate links for customers should import from here, not read
 * NEXT_PUBLIC_APP_URL directly.
 */

const SITE_URL = (
  process.env.NEXT_PUBLIC_SITE_URL ?? "https://foocci.com.br"
).replace(/\/$/, "");

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
