/**
 * GET /l/[restaurantSlug]/[trackingSlug]
 *
 * Trackable redirect endpoint.
 *
 * 1. Resolves restaurant by slug.
 * 2. Resolves TrackingLink by (restaurantId, trackingSlug).
 * 3. Increments clickCount (fire-and-forget).
 * 4. Builds destination URL with UTM params.
 * 5. Returns 302 redirect.
 *
 * The destination also receives `_tlid=<id>` so PedidoClient can
 * capture it in sessionStorage and attach it to the order.
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

type Params = { params: Promise<{ restaurantSlug: string; trackingSlug: string }> };

export async function GET(req: NextRequest, { params }: Params) {
  const { restaurantSlug, trackingSlug } = await params;

  // 1. Resolve restaurant
  const restaurant = await prisma.restaurant.findUnique({
    where:  { slug: restaurantSlug },
    select: { id: true, slug: true },
  });

  if (!restaurant) {
    return NextResponse.redirect(new URL("/", req.url), 302);
  }

  // 2. Resolve tracking link
  const link = await prisma.trackingLink.findUnique({
    where: { restaurantId_slug: { restaurantId: restaurant.id, slug: trackingSlug } },
  });

  if (!link || !link.isActive) {
    // Fallback: redirect to public menu
    return NextResponse.redirect(
      new URL(`/pedido/${restaurantSlug}`, req.url),
      302,
    );
  }

  // 3. Increment clickCount — fire-and-forget
  prisma.trackingLink
    .update({
      where: { id: link.id },
      data:  { clickCount: { increment: 1 } },
    })
    .catch(() => {});

  // 4. Build destination URL
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
