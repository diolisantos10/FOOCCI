/**
 * GET /r/[code]
 *
 * Dual-purpose short redirect handler:
 *
 * 1. Cart recovery tokens — HMAC-signed `/r/{recoveryToken}` links sent via
 *    WhatsApp recovery messages.  Verified in-memory (no DB hit on the fast
 *    path).  On success: loads customer phone + restaurant slug, signs a fresh
 *    waToken, and redirects to `/pedido/[slug]?waToken=...&src=recovery`.
 *    On invalid/expired token: falls through to the tracking-link lookup below
 *    (a recovery token will never match a shortCode anyway).
 *
 * 2. Tracking links — Resolves TrackingLink by shortCode, increments
 *    clickCount (fire-and-forget), builds destination URL with UTM params +
 *    _tlid, returns 302 redirect.
 *
 * If code is unknown or link is inactive, redirects to "/" safely.
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyRecoveryToken } from "@/lib/recovery-token";
import { signWaToken } from "@/lib/wa-token";

type Params = { params: Promise<{ code: string }> };

export async function GET(req: NextRequest, { params }: Params) {
  const { code } = await params;

  // ── 1. Try recovery token (in-memory, no DB) ──────────────────────────────
  const recovery = verifyRecoveryToken(code);
  if (recovery) {
    try {
      const customer = await prisma.customer.findUnique({
        where:  { id: recovery.customerId },
        select: { phone: true, name: true },
      });
      const restaurant = await prisma.restaurant.findUnique({
        where:  { id: recovery.restaurantId },
        select: { slug: true },
      });

      if (customer?.phone && restaurant?.slug) {
        const waToken = signWaToken({ phone: customer.phone, name: customer.name ?? undefined });
        const dest = new URL(`/pedido/${restaurant.slug}`, req.nextUrl.origin);
        dest.searchParams.set("waToken", waToken);
        dest.searchParams.set("src", "recovery");
        return NextResponse.redirect(dest, 302);
      }
    } catch {
      // Fall through to safe home redirect on any unexpected error
    }
    return NextResponse.redirect(new URL("/", req.url), 302);
  }

  // ── 2. Tracking link lookup ───────────────────────────────────────────────
  const link = await prisma.trackingLink.findUnique({
    where:   { shortCode: code },
    include: { restaurant: { select: { slug: true } } },
  });

  if (!link || !link.isActive) {
    // If we have the restaurant slug, fall back to its menu; otherwise home
    const fallback = link?.restaurant?.slug
      ? `/pedido/${link.restaurant.slug}`
      : "/";
    return NextResponse.redirect(new URL(fallback, req.url), 302);
  }

  // Increment clickCount — fire-and-forget (same as long redirect)
  prisma.trackingLink
    .update({
      where: { id: link.id },
      data:  { clickCount: { increment: 1 } },
    })
    .catch(() => {});

  // Build destination URL — same logic as /l/[restaurantSlug]/[trackingSlug]
  const restaurantSlug = link.restaurant.slug;
  const base     = req.nextUrl.origin;
  const destPath = link.destinationType === "QR"
    ? `/qr/${restaurantSlug}`
    : `/pedido/${restaurantSlug}`;

  const dest = new URL(destPath, base);
  if (link.source)   dest.searchParams.set("utm_source",   link.source);
  if (link.medium)   dest.searchParams.set("utm_medium",   link.medium);
  if (link.campaign) dest.searchParams.set("utm_campaign", link.campaign);
  if (link.content)  dest.searchParams.set("utm_content",  link.content);
  if (link.term)     dest.searchParams.set("utm_term",     link.term);
  dest.searchParams.set("_tlid", link.id);

  return NextResponse.redirect(dest, 302);
}
