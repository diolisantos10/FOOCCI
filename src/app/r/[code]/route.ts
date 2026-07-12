/**
 * GET /r/[code]
 *
 * Three-way short redirect handler (tried in order):
 *
 * 1. Short recovery code — DB lookup on OrderDraft.recoveryCode.  Generates a
 *    fresh waToken and redirects to /pedido/[slug]?waToken=...&src=recovery.
 *    Used for all recovery messages sent after the short-code migration.
 *
 * 2. HMAC recovery token — legacy signed `/r/{token}` links (stateless, no DB).
 *    Backward compat for links already delivered to customers before the migration.
 *
 * 3. Tracking links — Resolves TrackingLink by shortCode, increments clickCount
 *    (fire-and-forget), builds destination URL with UTM params + _tlid, 302.
 *
 * If code matches nothing, redirects to "/" safely.
 *
 * IMPORTANT: req.nextUrl.origin / req.url must NOT be used to build destination
 * URLs.  In Railway, Next.js runs on http://localhost:3000 internally; using the
 * request origin would send customers to localhost.  All destinations are built
 * with getPublicSiteUrl() which reads NEXT_PUBLIC_SITE_URL → NEXTAUTH_URL →
 * NEXT_PUBLIC_APP_URL → https://foocci.com.br and guards against localhost in
 * production.
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyRecoveryToken } from "@/lib/recovery-token";
import { signWaToken } from "@/lib/wa-token";
import { getPublicSiteUrl } from "@/lib/public-url";

type Params = { params: Promise<{ code: string }> };

export async function GET(req: NextRequest, { params }: Params) {
  const { code } = await params;

  // Canonical public origin — never localhost in production.
  const siteUrl = getPublicSiteUrl();

  // ── 1. Short recovery code (DB lookup) ────────────────────────────────────
  // Short codes are ≤ 8 alphanumeric chars; HMAC tokens contain "." separators.
  // We always try this path first — fast index scan on order_drafts.recoveryCode.
  if (!code.includes(".")) {
    try {
      const draft = await prisma.orderDraft.findFirst({
        where: { recoveryCode: code },
        select: {
          customerId:   true,
          restaurantId: true,
          customer:     { select: { phone: true, name: true } },
          restaurant:   { select: { slug: true } },
        },
      });

      if (draft?.customer?.phone && draft.restaurant?.slug) {
        const waToken = signWaToken({
          phone: draft.customer.phone,
          name:  draft.customer.name ?? undefined,
        });
        const dest = new URL(`${siteUrl}/pedido/${draft.restaurant.slug}`);
        dest.searchParams.set("waToken", waToken);
        dest.searchParams.set("src", "recovery");
        return NextResponse.redirect(dest, 302);
      }
    } catch {
      // Fall through to HMAC path on any unexpected error
    }

    // ── 1b. WhatsApp short menu link (DB lookup) ─────────────────────────────
    // The receptionist sends foocci.com.br/r/<code> instead of the long
    // identified /pedido URL. Sign a FRESH waToken here and redirect. Same
    // identity handoff, clean short link. (src=whatsapp, not recovery.)
    try {
      const menuLink = await prisma.waMenuLink.findUnique({
        where:  { code },
        select: { phone: true, name: true, expiresAt: true, restaurant: { select: { slug: true } } },
      });
      if (menuLink?.restaurant?.slug) {
        if (menuLink.expiresAt > new Date()) {
          // Fire-and-forget click counter.
          prisma.waMenuLink.update({ where: { code }, data: { hits: { increment: 1 } } }).catch(() => {});
          const waToken = signWaToken({ phone: menuLink.phone, name: menuLink.name ?? undefined });
          const dest = new URL(`${siteUrl}/pedido/${menuLink.restaurant.slug}`);
          dest.searchParams.set("waToken", waToken);
          dest.searchParams.set("src", "whatsapp");
          return NextResponse.redirect(dest, 302);
        }
        // Expired code → still send them to the menu, just without auto-identify.
        return NextResponse.redirect(`${siteUrl}/pedido/${menuLink.restaurant.slug}`, 302);
      }
    } catch {
      // Fall through to HMAC path on any unexpected error
    }
  }

  // ── 2. Legacy HMAC recovery token (in-memory, no DB) ─────────────────────
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
        const dest = new URL(`${siteUrl}/pedido/${restaurant.slug}`);
        dest.searchParams.set("waToken", waToken);
        dest.searchParams.set("src", "recovery");
        return NextResponse.redirect(dest, 302);
      }
    } catch {
      // Fall through to safe home redirect on any unexpected error
    }
    return NextResponse.redirect(`${siteUrl}/`, 302);
  }

  // ── 3. Tracking link lookup ───────────────────────────────────────────────
  const link = await prisma.trackingLink.findUnique({
    where:   { shortCode: code },
    include: { restaurant: { select: { slug: true } } },
  });

  if (!link || !link.isActive) {
    // If we have the restaurant slug, fall back to its menu; otherwise home
    const fallback = link?.restaurant?.slug
      ? `${siteUrl}/pedido/${link.restaurant.slug}`
      : `${siteUrl}/`;
    return NextResponse.redirect(fallback, 302);
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
  const destPath = link.destinationType === "QR"
    ? `/qr/${restaurantSlug}`
    : `/pedido/${restaurantSlug}`;

  const dest = new URL(`${siteUrl}${destPath}`);
  if (link.source)   dest.searchParams.set("utm_source",   link.source);
  if (link.medium)   dest.searchParams.set("utm_medium",   link.medium);
  if (link.campaign) dest.searchParams.set("utm_campaign", link.campaign);
  if (link.content)  dest.searchParams.set("utm_content",  link.content);
  if (link.term)     dest.searchParams.set("utm_term",     link.term);
  dest.searchParams.set("_tlid", link.id);

  return NextResponse.redirect(dest, 302);
}
