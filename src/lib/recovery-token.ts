/**
 * Stateless HMAC-signed token for cart recovery short links.
 *
 * Format: <base64url-payload>.<hex-hmac-sha256>
 * Signed with NEXTAUTH_SECRET (falls back to APP_SECRET).
 * TTL: 48 hours — enough for a customer to act on a recovery message.
 *
 * Server-only (Node.js crypto). Never import from client components.
 */

import { createHmac, timingSafeEqual } from "crypto";

export interface RecoveryTokenPayload {
  draftId:      string;
  customerId:   string;
  restaurantId: string;
  exp:          number; // Unix ms
}

const TOKEN_TTL_MS = 48 * 60 * 60 * 1000;

function signingSecret(): string {
  const s = process.env.NEXTAUTH_SECRET ?? process.env.APP_SECRET;
  if (s) return s;
  if (process.env.NODE_ENV !== "production") {
    return "__dev_recovery_token_fallback_set_NEXTAUTH_SECRET__";
  }
  return "";
}

export function signRecoveryToken(
  payload: Omit<RecoveryTokenPayload, "exp">,
): string {
  const s = signingSecret();
  if (!s) throw new Error("recovery-token: NEXTAUTH_SECRET not configured");
  const full: RecoveryTokenPayload = { ...payload, exp: Date.now() + TOKEN_TTL_MS };
  const body = Buffer.from(JSON.stringify(full)).toString("base64url");
  const sig  = createHmac("sha256", s).update(body).digest("hex");
  return `${body}.${sig}`;
}

export function verifyRecoveryToken(token: string): RecoveryTokenPayload | null {
  try {
    const s = signingSecret();
    if (!s) return null;
    const dot = token.lastIndexOf(".");
    if (dot < 0) return null;
    const body = token.slice(0, dot);
    const sig  = token.slice(dot + 1);
    const expected    = createHmac("sha256", s).update(body).digest("hex");
    const expectedBuf = Buffer.from(expected, "hex");
    const sigBuf      = Buffer.from(sig,      "hex");
    if (expectedBuf.length !== sigBuf.length || !timingSafeEqual(expectedBuf, sigBuf)) return null;
    const p = JSON.parse(Buffer.from(body, "base64url").toString()) as RecoveryTokenPayload;
    if (typeof p.exp !== "number" || p.exp < Date.now()) return null;
    if (!p.draftId || !p.customerId || !p.restaurantId) return null;
    return p;
  } catch {
    return null;
  }
}
