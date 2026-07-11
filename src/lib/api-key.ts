/**
 * API key primitives — generation, hashing, and display fragments.
 *
 * Security model (see the ApiKey Prisma model):
 *   • We generate a high-entropy random token and hand the PLAINTEXT back to the
 *     caller exactly once. We persist only its SHA-256 hash, so a database dump
 *     never yields a usable token.
 *   • Verification re-hashes the presented token and looks it up by hash — an
 *     O(1) indexed lookup, no per-row bcrypt needed (the token is 256 bits of
 *     random, not a low-entropy human password, so a plain fast hash is correct
 *     and appropriate here).
 *   • The prefix is a short, non-secret fragment shown in the UI list so the
 *     lojista can tell keys apart without ever re-revealing the secret.
 */

import { createHash, randomBytes } from "crypto";

/** Human-recognizable prefix: "foocci connect key". Also lets us (and the user)
 *  spot a Foocci token at a glance and pattern-match it in logs/paste fields. */
export const API_KEY_PREFIX = "fck_";

/** Length of the non-secret display fragment stored in tokenPrefix. */
const DISPLAY_PREFIX_LEN = 12;

export interface GeneratedApiKey {
  /** Full plaintext token — returned to the user ONCE, never stored. */
  token: string;
  /** SHA-256 hex of the token — this is what we persist and look up by. */
  tokenHash: string;
  /** Short non-secret fragment for display, e.g. "fck_a1b2c3d4". */
  tokenPrefix: string;
}

/** SHA-256 hex of a token. Deterministic — used both at creation and on every
 *  authenticated request to look the key up. */
export function hashApiKey(token: string): string {
  return createHash("sha256").update(token.trim(), "utf8").digest("hex");
}

/** Mint a fresh token: `fck_` + 32 random bytes as base64url (~43 chars). */
export function generateApiKey(): GeneratedApiKey {
  const secret = randomBytes(32).toString("base64url");
  const token = `${API_KEY_PREFIX}${secret}`;
  return {
    token,
    tokenHash: hashApiKey(token),
    tokenPrefix: token.slice(0, DISPLAY_PREFIX_LEN),
  };
}

/** Cheap shape check before hitting the DB — avoids a lookup for obvious junk. */
export function looksLikeApiKey(token: string | null | undefined): token is string {
  return typeof token === "string" && token.startsWith(API_KEY_PREFIX) && token.length >= 20;
}

/** Extract a Bearer token from an Authorization header (case-insensitive scheme). */
export function bearerToken(authorizationHeader: string | null): string | null {
  if (!authorizationHeader) return null;
  const m = /^Bearer\s+(.+)$/i.exec(authorizationHeader.trim());
  const captured = m?.[1];
  return captured ? captured.trim() : null;
}
