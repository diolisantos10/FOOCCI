/**
 * instagramTokenRefresh — keeps Instagram long-lived tokens alive.
 *
 * Instagram user tokens last ~60 days. Without refreshing they silently expire and inbound
 * DMs stop arriving (the root cause of the July outage). This refreshes tokens BEFORE they
 * expire (default: within 10 days of expiry, or unknown/short expiry) via ig_refresh_token,
 * and stores the new token + expiry. Idempotent and best-effort — never throws.
 */

import { prisma } from "@/lib/prisma";
import { getInstagramConfig, decryptPageToken, upsertInstagramConfig } from "./InstagramConfigService";
import { refreshInstagramLongLivedToken } from "./instagramLoginOAuth";

export interface RefreshOneResult {
  restaurantId: string;
  refreshed:    boolean;
  reason?:      string;
  newExpiresAt?: string | null;
}

/** Refresh the token for one restaurant and persist the new token + expiry. */
export async function refreshInstagramTokenForRestaurant(restaurantId: string): Promise<RefreshOneResult> {
  const row = await getInstagramConfig(restaurantId);
  if (!row) return { restaurantId, refreshed: false, reason: "no config" };
  const token = decryptPageToken(row);
  if (!token) return { restaurantId, refreshed: false, reason: "no token" };

  const res = await refreshInstagramLongLivedToken(token);
  if (!res.ok || !res.token) {
    // Record the failure so a dead token is visible instead of silently expiring.
    await prisma.instagramChannelConfig.update({
      where: { restaurantId }, data: { lastError: `token refresh: ${res.error ?? "falhou"}` },
    }).catch(() => {});
    return { restaurantId, refreshed: false, reason: res.error ?? "refresh failed" };
  }

  const newExpiresAt = res.expiresInSeconds ? new Date(Date.now() + res.expiresInSeconds * 1000).toISOString() : null;
  await upsertInstagramConfig(restaurantId, {
    pageAccessToken: res.token,
    metadata: { tokenExpiresAt: newExpiresAt },
  });
  await prisma.instagramChannelConfig.update({ where: { restaurantId }, data: { lastError: null } }).catch(() => {});
  return { restaurantId, refreshed: true, newExpiresAt };
}

/**
 * Refresh every Instagram token that expires within `withinDays` (or whose expiry is
 * unknown). Instagram allows refreshing a token that is ≥24h old and not yet expired, so
 * running this daily keeps every connection alive indefinitely.
 */
export async function refreshExpiringInstagramTokens(withinDays = 10): Promise<{ checked: number; refreshed: number; results: RefreshOneResult[] }> {
  const rows = await prisma.instagramChannelConfig.findMany({
    where:  { enabled: true, pageAccessTokenEncrypted: { not: null } },
    select: { restaurantId: true, metadata: true },
  }).catch(() => []);

  const cutoff = Date.now() + withinDays * 24 * 60 * 60 * 1000;
  const results: RefreshOneResult[] = [];

  for (const row of rows) {
    const meta = (row.metadata && typeof row.metadata === "object") ? (row.metadata as Record<string, unknown>) : {};
    const expRaw = typeof meta.tokenExpiresAt === "string" ? meta.tokenExpiresAt : null;
    const expMs  = expRaw ? Date.parse(expRaw) : NaN;
    // Refresh when: expiry unknown, unparseable, or within the window. (An already-expired
    // token can't be refreshed — it needs a reconnect — but we still attempt and record it.)
    const due = !Number.isFinite(expMs) || expMs <= cutoff;
    if (!due) continue;
    results.push(await refreshInstagramTokenForRestaurant(row.restaurantId));
  }

  return { checked: rows.length, refreshed: results.filter((r) => r.refreshed).length, results };
}
