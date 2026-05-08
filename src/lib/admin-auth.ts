/**
 * Admin authentication helpers.
 *
 * Global admin access is gated by ADMIN_SECRET env var — no DB user required.
 * The browser receives a signed, httpOnly cookie on login; API routes accept
 * either the cookie or the legacy x-admin-secret header.
 */

import { createHash } from "crypto";
import { cookies } from "next/headers";
import type { NextRequest } from "next/server";

export const ADMIN_COOKIE = "foocci-admin-token";

/** Derives a stable session token from the current ADMIN_SECRET. */
export function makeAdminToken(): string {
  const secret = process.env.ADMIN_SECRET;
  if (!secret) return "";
  return createHash("sha256").update(`${secret}:foocci-admin-v1`).digest("hex");
}

/** Returns true if `token` matches the current ADMIN_SECRET-derived value. */
export function isValidAdminToken(token: string | undefined): boolean {
  const expected = makeAdminToken();
  return !!expected && !!token && expected === token;
}

/**
 * For use in Server Components — checks the admin session cookie.
 * Next.js 14: cookies() is synchronous.
 */
export function isAdminAuthenticated(): boolean {
  try {
    const jar = cookies();
    const token = jar.get(ADMIN_COOKIE)?.value;
    return isValidAdminToken(token);
  } catch {
    return false;
  }
}

/**
 * For use in Route Handlers — accepts either:
 *   1. x-admin-secret header (backward compat / curl usage)
 *   2. foocci-admin-token httpOnly cookie (browser UI)
 */
export function checkAdminRequest(req: NextRequest): boolean {
  const envSecret = process.env.ADMIN_SECRET;
  if (!envSecret) return false;

  // Header-based (legacy + server-to-server)
  const header = req.headers.get("x-admin-secret");
  if (header === envSecret) return true;

  // Cookie-based (browser sessions)
  const cookie = req.cookies.get(ADMIN_COOKIE)?.value;
  return isValidAdminToken(cookie);
}
