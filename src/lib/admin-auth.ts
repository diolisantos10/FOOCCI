/**
 * Admin authentication helpers.
 *
 * Global admin access is gated by ADMIN_SECRET env var — no DB user required.
 * The browser receives a signed, httpOnly cookie on login; API routes accept
 * either the cookie or the legacy x-admin-secret header.
 */

import { createHash, timingSafeEqual } from "crypto";
import { cookies } from "next/headers";
import type { NextRequest } from "next/server";

export const ADMIN_COOKIE = "foocci-admin-token";

/**
 * Constant-time string comparison. A plain `===` on a secret returns at the
 * first differing byte, which leaks how much of a guess was right through
 * response timing. Network jitter makes exploiting this hard, but the fix
 * costs one line — and this helper guards EVERY admin route, so it is the one
 * place where the cheap version is worth doing right. Hashing both sides
 * first also removes the length leak (timingSafeEqual throws on unequal
 * lengths, which would itself be an oracle).
 */
function safeEqual(a: string, b: string): boolean {
  const ha = createHash("sha256").update(a).digest();
  const hb = createHash("sha256").update(b).digest();
  return timingSafeEqual(ha, hb);
}

/** Derives a stable session token from the current ADMIN_SECRET. */
export function makeAdminToken(): string {
  const secret = process.env.ADMIN_SECRET;
  if (!secret) return "";
  return createHash("sha256").update(`${secret}:foocci-admin-v1`).digest("hex");
}

/** Returns true if `token` matches the current ADMIN_SECRET-derived value. */
export function isValidAdminToken(token: string | undefined): boolean {
  const expected = makeAdminToken();
  return !!expected && !!token && safeEqual(expected, token);
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
 * Guarda ESTRITA, só por cabeçalho `x-admin-secret` — sem cookie.
 *
 * Existe para o punhado de rotas cujo efeito é IRREVERSÍVEL (apagar contas, por
 * exemplo). Aceitar o cookie de sessão ali significaria que um clique numa aba
 * aberta basta; exigir o cabeçalho força um comando deliberado, com a credencial
 * na mão. A comparação é a mesma de tempo constante do resto do arquivo, e sem
 * `ADMIN_SECRET` configurado a resposta é sempre `false` — ausência de segredo
 * nunca libera (guardrail 2).
 */
export function checkAdminSecretHeader(req: NextRequest): boolean {
  const envSecret = process.env.ADMIN_SECRET;
  if (!envSecret) return false;
  const header = req.headers.get("x-admin-secret");
  return !!header && safeEqual(header, envSecret);
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
  if (header && safeEqual(header, envSecret)) return true;

  // Cookie-based (browser sessions)
  const cookie = req.cookies.get(ADMIN_COOKIE)?.value;
  return isValidAdminToken(cookie);
}
