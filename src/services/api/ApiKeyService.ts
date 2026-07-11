/**
 * ApiKeyService — lifecycle for the read-only external-access keys the lojista
 * generates in Integrações → Conexões externas.
 *
 * Create returns the plaintext token ONCE (the caller must surface it to the
 * user immediately; it is unrecoverable afterwards). List/revoke never expose
 * secrets. resolveApiKey is the auth path for the public GET /api/v1/vendas.
 */

import { prisma } from "@/lib/prisma";
import { generateApiKey, hashApiKey, looksLikeApiKey } from "@/lib/api-key";
import { parseScopes, serializeScopes, type ApiScope } from "@/lib/api-scopes";

/** How often we bother writing lastUsedAt — avoids a DB write on every single
 *  call while still giving the user a meaningful "último uso" signal. */
const LAST_USED_THROTTLE_MS = 60_000;

export interface ApiKeyView {
  id: string;
  name: string | null;
  tokenPrefix: string;
  /** Parsed permission list (e.g. ["sales:read","customers:read"]). */
  scopes: ApiScope[];
  lastUsedAt: Date | null;
  createdAt: Date;
}

export interface CreatedApiKey extends ApiKeyView {
  /** Plaintext token — present ONLY on creation, shown to the user once. */
  token: string;
}

/** Active (non-revoked) keys for a restaurant, newest first — no secrets. */
export async function listApiKeys(restaurantId: string): Promise<ApiKeyView[]> {
  const rows = await prisma.apiKey.findMany({
    where:   { restaurantId, revokedAt: null },
    orderBy: { createdAt: "desc" },
    select:  { id: true, name: true, tokenPrefix: true, scope: true, lastUsedAt: true, createdAt: true },
  });
  return rows.map(({ scope, ...r }) => ({ ...r, scopes: parseScopes(scope) }));
}

/** Mint a new key with the chosen scopes. Returns the plaintext token once. */
export async function createApiKey(
  restaurantId: string,
  name: string | null,
  scopes: unknown,
  createdByUserId: string | null,
): Promise<CreatedApiKey> {
  const { token, tokenHash, tokenPrefix } = generateApiKey();
  const trimmed = name?.trim() || null;
  const scope = serializeScopes(scopes); // validated, deduped, defaults to sales:read
  const row = await prisma.apiKey.create({
    data: {
      restaurantId,
      name: trimmed ? trimmed.slice(0, 60) : null,
      tokenHash,
      tokenPrefix,
      scope,
      createdByUserId,
    },
    select: { id: true, name: true, tokenPrefix: true, scope: true, lastUsedAt: true, createdAt: true },
  });
  const { scope: stored, ...rest } = row;
  return { ...rest, scopes: parseScopes(stored), token };
}

/**
 * Revoke a key. Scoped to the restaurant so one tenant can never revoke
 * another's key. Returns true iff a key was actually revoked.
 */
export async function revokeApiKey(restaurantId: string, id: string): Promise<boolean> {
  const res = await prisma.apiKey.updateMany({
    where: { id, restaurantId, revokedAt: null },
    data:  { revokedAt: new Date() },
  });
  return res.count > 0;
}

export interface ResolvedApiKey {
  restaurantId: string;
  keyId: string;
  /** Parsed permission list this key was granted. */
  scopes: ApiScope[];
}

/**
 * Resolve a presented Bearer token to its restaurant + scopes, or null if it is
 * invalid or revoked. Bumps lastUsedAt (throttled). This is the sole auth path
 * for the public API — fail closed (return null) on anything unexpected.
 */
export async function resolveApiKey(token: string | null | undefined): Promise<ResolvedApiKey | null> {
  if (!looksLikeApiKey(token)) return null;
  try {
    const key = await prisma.apiKey.findFirst({
      where:  { tokenHash: hashApiKey(token), revokedAt: null },
      select: { id: true, restaurantId: true, scope: true, lastUsedAt: true },
    });
    if (!key) return null;

    const now = Date.now();
    if (!key.lastUsedAt || now - key.lastUsedAt.getTime() > LAST_USED_THROTTLE_MS) {
      // Best-effort — never let a bookkeeping write fail the actual request.
      await prisma.apiKey
        .update({ where: { id: key.id }, data: { lastUsedAt: new Date() } })
        .catch(() => undefined);
    }
    return { restaurantId: key.restaurantId, keyId: key.id, scopes: parseScopes(key.scope) };
  } catch {
    return null;
  }
}
