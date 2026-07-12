/**
 * Short WhatsApp menu link.
 *
 * The receptionist used to send the full identified /pedido URL, which carries a
 * ~180-char signed waToken — huge and ugly in WhatsApp. Instead we keep a tiny,
 * stable code per (restaurant, customer) and send `foocci.com.br/r/<code>`. When
 * the customer taps it, /r/[code] signs a FRESH waToken and 302-redirects to the
 * identified /pedido page — same identity handoff, clean link.
 *
 * Server-only (Node crypto + prisma). Never import from client components.
 */

import { randomBytes } from "crypto";
import { prisma } from "@/lib/prisma";
import { getPublicSiteUrl } from "@/lib/public-url";

// Unambiguous alphabet (no 0/O/1/l/I) — same set the recovery codes use.
const CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";
const CODE_LEN = 7; // 54^7 ≈ 10^12 — collision-safe, still short
const TTL_MS = 90 * 24 * 60 * 60 * 1000; // 90 days, refreshed on every send

/** Random URL-safe short code (7 chars from CODE_CHARS). */
export function generateWaMenuCode(): string {
  const bytes = randomBytes(CODE_LEN);
  let code = "";
  for (const byte of bytes) code += CODE_CHARS[byte % CODE_CHARS.length];
  return code;
}

/**
 * Ensures a stable short code for (restaurant, phone) and returns the full short
 * URL (`<site>/r/<code>`), refreshing its expiry. Returns null when it can't be
 * created — the caller then falls back to the long identified URL, so the worst
 * case is exactly today's behavior.
 */
export async function buildShortMenuUrl(
  restaurantId: string,
  phone: string,
  name: string | null,
): Promise<string | null> {
  if (!phone?.trim()) return null;
  const expiresAt = new Date(Date.now() + TTL_MS);
  const key = { restaurantId_phone: { restaurantId, phone } };

  try {
    // Reuse the customer's existing code (stable link), just bump the expiry.
    const existing = await prisma.waMenuLink.findUnique({ where: key, select: { code: true } });
    if (existing) {
      await prisma.waMenuLink.update({
        where: key,
        data:  { expiresAt, ...(name ? { name } : {}) },
      });
      return `${getPublicSiteUrl()}/r/${existing.code}`;
    }

    // First time for this customer — create with a fresh unique code.
    for (let attempt = 0; attempt < 5; attempt++) {
      const code = generateWaMenuCode();
      try {
        await prisma.waMenuLink.create({
          data: { code, restaurantId, phone, name: name ?? null, expiresAt },
        });
        return `${getPublicSiteUrl()}/r/${code}`;
      } catch {
        // Either a code collision (retry) or a (restaurant,phone) race — in the
        // race, reuse whichever row won.
        const raced = await prisma.waMenuLink.findUnique({ where: key, select: { code: true } });
        if (raced) return `${getPublicSiteUrl()}/r/${raced.code}`;
      }
    }
    return null;
  } catch (err) {
    console.error("[buildShortMenuUrl] failed — falling back to long link", {
      restaurantId,
      err: err instanceof Error ? err.message : String(err),
    });
    return null;
  }
}
