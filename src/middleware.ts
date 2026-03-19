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
  /^\/login(\/.*)?$/,                  // login + sub-pages
  /^\/api\/auth(\/.*)?$/,              // NextAuth endpoints
  /^\/api\/restaurants\/register$/,    // self-service registration
  /^\/api\/webhooks\/evolution$/,      // Evolution API webhook receiver (verified by HMAC)
  /^\/setup$/,                         // First-time browser setup (blocked after first restaurant exists)
  /^\/api\/setup$/,                    // Setup API
];

function isPublicPath(pathname: string): boolean {
  return PUBLIC_PATHS.some((pattern) => pattern.test(pathname));
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Always allow Next.js internals and static assets
  if (
    pathname.startsWith("/_next/") ||
    pathname.startsWith("/favicon") ||
    pathname.match(/\.(ico|png|jpg|jpeg|svg|css|js|woff|woff2)$/)
  ) {
    return NextResponse.next();
  }

  // Explicit early exit for setup — must never require auth, even behind proxies
  if (pathname === "/setup" || pathname.startsWith("/api/setup")) {
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

  // Inject tenant context as request headers so handlers don't parse JWT
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
