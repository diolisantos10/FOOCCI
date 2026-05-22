/**
 * Lightweight signed token for WhatsApp → /pedido identity handoff.
 *
 * Format: <base64url-payload>.<hex-hmac-sha256>
 * Signed with NEXTAUTH_SECRET (falls back to APP_SECRET).
 * Default TTL: 7 days — long enough for a browsing session, short enough to
 * limit replay if a link is forwarded.
 *
 * Server-only (Node.js crypto). Never import from client components.
 */

import { createHmac, timingSafeEqual } from "crypto";

export interface WaTokenPayload {
  phone:       string;
  name?:       string;
  exp:         number; // Unix ms
}

const TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000;

function signingSecret(): string {
  return process.env.NEXTAUTH_SECRET ?? process.env.APP_SECRET ?? "";
}

export function signWaToken(payload: Omit<WaTokenPayload, "exp">): string {
  const s = signingSecret();
  if (!s) throw new Error("wa-token: NEXTAUTH_SECRET not configured");
  const full: WaTokenPayload = { ...payload, exp: Date.now() + TOKEN_TTL_MS };
  const body = Buffer.from(JSON.stringify(full)).toString("base64url");
  const sig  = createHmac("sha256", s).update(body).digest("hex");
  return `${body}.${sig}`;
}

export function verifyWaToken(token: string): WaTokenPayload | null {
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
    const p = JSON.parse(Buffer.from(body, "base64url").toString()) as WaTokenPayload;
    if (typeof p.exp !== "number" || p.exp < Date.now()) return null;
    if (typeof p.phone !== "string" || !p.phone) return null;
    return p;
  } catch {
    return null;
  }
}
