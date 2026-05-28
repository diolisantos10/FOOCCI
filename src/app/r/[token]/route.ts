/**
 * GET /r/[token]
 *
 * Cart recovery short-link redirect.
 * Validates an HMAC-signed recovery token, signs a fresh waToken for the
 * customer, and redirects to /pedido/[slug]?waToken=...&src=recovery so the
 * customer is auto-identified when they land on the menu.
 *
 * Failures (invalid/expired token, missing restaurant/customer) redirect to
 * the public menu if the slug can be recovered, otherwise to the site root.
 * No error body is ever exposed to the browser.
 */

import { NextRequest, NextResponse } from "next/server";
import { verifyRecoveryToken } from "@/lib/recovery-token";
import { signWaToken } from "@/lib/wa-token";
import { prisma } from "@/lib/prisma";
import { getPublicMenuUrl, getPublicSiteUrl } from "@/lib/public-url";

export const runtime = "nodejs";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;

  const payload = verifyRecoveryToken(token);
  if (!payload) {
    return NextResponse.redirect(getPublicSiteUrl() + "/", { status: 302 });
  }

  const [customer, restaurant] = await Promise.all([
    prisma.customer.findUnique({
      where:  { id: payload.customerId },
      select: { phone: true, name: true },
    }),
    prisma.restaurant.findUnique({
      where:  { id: payload.restaurantId },
      select: { slug: true },
    }),
  ]);

  const slug = restaurant?.slug;
  if (!slug) {
    return NextResponse.redirect(getPublicSiteUrl() + "/", { status: 302 });
  }

  const menuBase = getPublicMenuUrl(slug);

  if (!customer?.phone) {
    const url = new URL(menuBase);
    url.searchParams.set("src", "recovery");
    return NextResponse.redirect(url.toString(), { status: 302 });
  }

  try {
    const waToken = signWaToken({
      phone: customer.phone,
      ...(customer.name ? { name: customer.name.trim().split(/\s+/)[0] } : {}),
    });
    const url = new URL(menuBase);
    url.searchParams.set("waToken", waToken);
    url.searchParams.set("src", "recovery");
    return NextResponse.redirect(url.toString(), { status: 302 });
  } catch {
    const url = new URL(menuBase);
    url.searchParams.set("src", "recovery");
    return NextResponse.redirect(url.toString(), { status: 302 });
  }
}
