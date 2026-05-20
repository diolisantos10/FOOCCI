/**
 * GET /r/[code]
 *
 * Short redirect for tracking links.
 * Identical attribution logic to /l/[restaurantSlug]/[trackingSlug]:
 *   1. Resolves TrackingLink by shortCode.
 *   2. Increments clickCount (fire-and-forget).
 *   3. Builds destination URL with UTM params + _tlid.
 *   4. Returns 302 redirect.
 *
 * If code is unknown or link is inactive, redirects to "/" safely.
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

type Params = { params: Promise<{ code: string }> };

export async function GET(req: NextRequest, { params }: Params) {
  const { code } = await params;

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
