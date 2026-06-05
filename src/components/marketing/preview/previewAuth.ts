/**
 * Marketing preview gate — server-only auth helpers.
 *
 * PRIVATE PRE-LAUNCH: the /site marketing website is gated behind a single shared
 * password (env `MARKETING_PREVIEW_PASSWORD`) so the founder can review it on a real
 * URL without it being publicly reachable. This is a lightweight preview gate, NOT
 * product authentication — it does not touch NextAuth, middleware or any product flow.
 *
 * Mechanism: the gate stores `sha256(password)` in an httpOnly cookie. Each request
 * the /site layout recomputes the expected token and compares (constant-time). The
 * raw password is never sent to the client and never stored in the cookie.
 *
 * FAIL CLOSED: if the env var is missing, no token exists, so access is denied — the
 * pre-launch site is never exposed publicly by accident.
 *
 * Imported only by server code (the /site layout and the /site/acesso · /site/sair
 * route handlers). Uses next/headers + node:crypto, so it must never be imported by a
 * client component.
 */

import { cookies } from "next/headers";
import { createHash, timingSafeEqual } from "crypto";

export const PREVIEW_COOKIE = "foocci_preview";

/** Cookie lifetime: 30 days. */
export const PREVIEW_MAX_AGE = 60 * 60 * 24 * 30;

function rawPassword(): string | null {
  const pw = process.env.MARKETING_PREVIEW_PASSWORD;
  return pw && pw.length > 0 ? pw : null;
}

/** True when a preview password is configured in the environment. */
export function isPreviewConfigured(): boolean {
  return rawPassword() !== null;
}

/** The expected cookie token (sha256 of the password), or null when not configured. */
export function previewToken(): string | null {
  const pw = rawPassword();
  return pw ? createHash("sha256").update(pw).digest("hex") : null;
}

function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

/** Validate a submitted password against the configured one (constant-time). */
export function verifyPassword(input: string): boolean {
  const pw = rawPassword();
  return pw !== null && safeEqual(input, pw);
}

/** True when the current request carries a valid preview cookie. Fail-closed. */
export function isPreviewAuthed(): boolean {
  const token = previewToken();
  if (!token) return false; // not configured → denied
  const cookie = cookies().get(PREVIEW_COOKIE)?.value;
  return cookie !== undefined && safeEqual(cookie, token);
}
