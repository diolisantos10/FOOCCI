/**
 * Next.js Edge Middleware – Auth + Multi-tenant context injection.
 *
 * Runs before every matching request. Responsibilities:
 *   1. Allow public routes through without a token.
 *   2. Reject unauthenticated requests to protected routes with 401.
 *   3. Inject tenant headers (x-restaurant-id, x-user-id, x-user-role)
 *      so route handlers and server components never need to decode JWT.
 *
 * IMPORTANT: This runs on the Edge runtime – no Node.js APIs.
 */

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";
import { TENANT_HEADER, USER_HEADER, ROLE_HEADER } from "@/lib/tenant";

// Routes that do NOT require authentication
const PUBLIC_PATHS: RegExp[] = [
  /^\/$/,                              // landing page
  /^\/privacidade$/,                   // PUBLIC privacy policy (required by Meta/Google app review)
  /^\/termos$/,                        // PUBLIC terms of use (required by Meta/Google app review)
  /^\/site(\/.*)?$/,                   // public marketing website (no auth)
  /^\/login(\/.*)?$/,                  // login + sub-pages
  /^\/api\/auth(\/.*)?$/,              // NextAuth endpoints
  /^\/api\/restaurants\/register$/,    // self-service registration
  /^\/api\/site\/leads$/,              // public demo-request form (rate-limited per IP)
  /^\/robots\.txt$/,                   // crawler rules — must never redirect to /login
  /^\/sitemap\.xml$/,                  // marketing sitemap
  /^\/api\/webhooks\/evolution$/,      // Evolution API webhook receiver (verified by HMAC)
  /^\/api\/webhooks\/meta\/whatsapp$/, // Meta WhatsApp Cloud API webhook (GET verify token + POST X-Hub-Signature-256)
  /^\/api\/webhooks\/instagram$/,      // Instagram Direct (Meta) webhook (GET verify token + POST X-Hub-Signature-256)
  /^\/setup$/,                         // First-time browser setup (blocked after first restaurant exists)
  /^\/api\/setup$/,                    // Setup API
  /^\/qr(\/.*)?$/,                     // Public QR dine-in menu pages
  /^\/api\/qr(\/.*)?$/,                // Public QR dine-in menu API
  /^\/pedido(\/.*)?$/,                 // Public AI ordering experience pages
  /^\/api\/pedido(\/.*)?$/,            // Public AI ordering experience API
  /^\/r(\/.*)?$/,                      // Public short redirects (WhatsApp menu link, cart recovery) — resolve a bearer code, then 302 to /pedido
  /^\/l(\/.*)?$/,                      // Public tracking short links — 302 to /pedido or /qr with UTM params
  /^\/api\/payments\/stone\/webhook$/, // Stone webhook (public, verified by HMAC)
  /^\/api\/payments\/mercadopago\/webhook$/, // Mercado Pago webhook (public — MP servers have no JWT)
  /^\/contratar(\/.*)?$/,                // Public plan-contract acceptance page (token-gated by construction)
  /^\/api\/billing\/accept$/,           // Terms acceptance (rate-limited; requires unguessable token)
  /^\/api\/billing\/mp-webhook$/,       // MP PLATFORM billing webhook (verified by refetch with our token)
  /^\/api\/payments\/sumup\/webhook$/, // SumUp webhook (public — re-verified via SumUp API before confirming)
  /^\/api\/integrations\/saipos\/webhook$/, // Saipos webhook (public — Saipos servers have no JWT)
  /^\/api\/v1(\/.*)?$/,                // Public external API — auth handled per-route via Bearer API key (ApiKeyService)
  /^\/api\/print-agent(\/.*)?$/,      // Local print agent (Carteiro) — auth handled per-route via agent token
  /^\/api\/media(\/.*)?$/,             // Public media (product images stored in DB)
  /^\/api\/health$/,                   // Health check (post-deploy validation)
  /^\/api\/cron(\/.*)?$/,              // CRM cron endpoints — auth handled per-route via CRON_SECRET bearer token
  // Global admin area — auth handled by admin cookie + layout, NOT by NextAuth
  /^\/admin(\/.*)?$/,                  // Admin UI pages
  /^\/api\/admin(\/.*)?$/,             // Admin API routes (each verifies x-admin-secret or admin cookie)
];

function isPublicPath(pathname: string): boolean {
  return PUBLIC_PATHS.some((pattern) => pattern.test(pathname));
}

// ── Marketing site (/site) is PUBLIC since the launch on 2026-08-03 ────────────
// Until then these pages sat behind a shared password. The gate lived in TWO
// places at once — here AND in `site/(gated)/layout.tsx` — because middleware is
// the only layer that can block a page BEFORE it renders or streams. Both were
// removed together; removing only one leaves the site shut with no error to
// explain it. `/site` is now matched by PUBLIC_PATHS like any other public route.

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Canônica: www.foocci.com.br → foocci.com.br (308, preservando caminho e
  // query). A apex é a URL registrada nos callbacks de Google/Meta/SumUp e em
  // todo link gerado — o www é só porta de entrada. Inerte enquanto o DNS do
  // www não existir; passa a valer no momento em que Railway + Hostinger
  // registrarem o subdomínio (docs/dominio-www-diagnostico.md).
  const host = req.headers.get("host") ?? "";
  if (host.startsWith("www.")) {
    const dest = req.nextUrl.clone();
    dest.host = host.slice(4);
    return NextResponse.redirect(dest, 308);
  }

  // Always allow Next.js internals and static assets
  if (
    pathname.startsWith("/_next/") ||
    pathname.startsWith("/favicon") ||
    pathname.match(/\.(ico|png|jpg|jpeg|webp|svg|css|js|woff|woff2)$/)
  ) {
    return NextResponse.next();
  }

  // Legacy private-preview entry point. /preview (and /preview/*) still forwards
  // to /site — the destination is simply public now. Kept so links shared during
  // the preview period do not 404.
  if (pathname === "/preview" || pathname.startsWith("/preview/")) {
    const dest = req.nextUrl.clone();
    dest.pathname = pathname.replace(/^\/preview/, "/site");
    dest.search = "";
    return NextResponse.redirect(dest);
  }

  // Explicit early exit for setup/recover — must never require auth, even behind proxies
  if (
    pathname === "/setup" ||
    pathname.startsWith("/api/setup") ||
    pathname === "/recover" ||
    pathname.startsWith("/api/recover") ||
    pathname.startsWith("/api/admin/reset-owner")
  ) {
    return NextResponse.next();
  }

  if (isPublicPath(pathname)) {
    return NextResponse.next();
  }

  // Decode the JWT (reads from the cookie or Authorization header)
  const token = await getToken({
    req,
    secret: process.env.NEXTAUTH_SECRET,
  });

  if (!token) {
    // API routes return JSON 401; page routes redirect to /login
    if (pathname.startsWith("/api/")) {
      return NextResponse.json(
        { success: false, error: "Unauthorized" },
        { status: 401 }
      );
    }

    // Use NEXTAUTH_URL (public domain) to build the redirect so that
    // Railway's internal hostname (localhost:8080) never leaks into callbackUrl.
    const publicBase =
      process.env.NEXTAUTH_URL?.replace(/\/$/, "") ??
      `${req.nextUrl.protocol}//${req.nextUrl.host}`;

    const loginUrl = new URL("/login", publicBase);
    loginUrl.searchParams.set("callbackUrl", `${publicBase}${pathname}`);
    return NextResponse.redirect(loginUrl);
  }

  // Inject tenant context as request headers so handlers don't parse JWT.
  const requestHeaders = new Headers(req.headers);
  requestHeaders.set(TENANT_HEADER, token.restaurantId as string);
  requestHeaders.set(USER_HEADER, token.id as string);
  requestHeaders.set(ROLE_HEADER, token.role as string);

  return NextResponse.next({
    request: { headers: requestHeaders },
  });
}

export const config = {
  // Match all routes except Next.js internals
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico).*)",
  ],
};
