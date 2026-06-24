/**
 * GoogleConfigService — persistence for the per-restaurant Google connection.
 *
 * Tokens are AES-256-GCM encrypted at rest and NEVER returned to the client.
 * The client only ever sees `toView()` (connection status, masked account,
 * selected location/property names) — never an access/refresh token.
 */

import { prisma } from "@/lib/prisma";
import { encrypt, decrypt } from "@/lib/crypto";
import type { GoogleIntegrationConfig } from "@prisma/client";

export interface GoogleTokenPatch {
  accessToken?: string;      // plaintext IN — encrypted before storage
  refreshToken?: string;     // plaintext IN — encrypted before storage (kept if omitted)
  tokenExpiresAt?: Date | null;
  scopes?: string | null;
  googleEmail?: string | null;
  googleUserId?: string | null;
}

export interface GoogleConfigView {
  connected: boolean;
  googleEmail: string | null;
  scopes: string[];
  hasBusinessScope: boolean;
  hasAnalyticsScope: boolean;
  // Meu Negócio
  businessLocationId: string | null;
  businessLocationName: string | null;
  // GA4
  ga4PropertyId: string | null;
  ga4PropertyName: string | null;
  connectedAt: string | null;
  lastSyncedAt: string | null;
  lastError: string | null;
}

const BUSINESS_SCOPE  = "https://www.googleapis.com/auth/business.manage";
const ANALYTICS_SCOPE = "https://www.googleapis.com/auth/analytics.readonly";

export async function getGoogleConfig(restaurantId: string): Promise<GoogleIntegrationConfig | null> {
  return prisma.googleIntegrationConfig.findUnique({ where: { restaurantId } });
}

/** Operator-safe projection. No tokens, ever. */
export function toView(row: GoogleIntegrationConfig | null): GoogleConfigView {
  const scopes = row?.scopes ? row.scopes.split(/\s+/).filter(Boolean) : [];
  const meta = (row?.metadata ?? null) as { connectedAt?: string } | null;
  return {
    connected:            Boolean(row?.connected && row?.refreshTokenEncrypted),
    googleEmail:          row?.googleEmail ?? null,
    scopes,
    hasBusinessScope:     scopes.includes(BUSINESS_SCOPE),
    hasAnalyticsScope:    scopes.includes(ANALYTICS_SCOPE),
    businessLocationId:   row?.businessLocationId ?? null,
    businessLocationName: row?.businessLocationName ?? null,
    ga4PropertyId:        row?.ga4PropertyId ?? null,
    ga4PropertyName:      row?.ga4PropertyName ?? null,
    connectedAt:          meta?.connectedAt ?? null,
    lastSyncedAt:         row?.lastSyncedAt?.toISOString() ?? null,
    lastError:            row?.lastError ?? null,
  };
}

/** Store/refresh OAuth tokens after a successful authorization or refresh. */
export async function saveTokens(restaurantId: string, patch: GoogleTokenPatch): Promise<void> {
  const data: Record<string, unknown> = { connected: true, lastError: null };
  if (patch.accessToken !== undefined)  data.accessTokenEncrypted  = encrypt(patch.accessToken);
  if (patch.refreshToken)               data.refreshTokenEncrypted = encrypt(patch.refreshToken);
  if (patch.tokenExpiresAt !== undefined) data.tokenExpiresAt = patch.tokenExpiresAt;
  if (patch.scopes !== undefined)       data.scopes = patch.scopes;
  if (patch.googleEmail !== undefined)  data.googleEmail = patch.googleEmail;
  if (patch.googleUserId !== undefined) data.googleUserId = patch.googleUserId;

  await prisma.googleIntegrationConfig.upsert({
    where:  { restaurantId },
    create: {
      restaurantId,
      ...data,
      metadata: { connectedAt: new Date().toISOString() },
    },
    update: data,
  });
}

export function decryptAccessToken(row: GoogleIntegrationConfig): string | null {
  if (!row.accessTokenEncrypted) return null;
  try { return decrypt(row.accessTokenEncrypted); } catch { return null; }
}

export function decryptRefreshToken(row: GoogleIntegrationConfig): string | null {
  if (!row.refreshTokenEncrypted) return null;
  try { return decrypt(row.refreshTokenEncrypted); } catch { return null; }
}

export async function setBusinessLocation(
  restaurantId: string,
  accountId: string | null,
  locationId: string | null,
  locationName: string | null,
): Promise<void> {
  await prisma.googleIntegrationConfig.update({
    where: { restaurantId },
    data: { businessAccountId: accountId, businessLocationId: locationId, businessLocationName: locationName },
  });
}

export async function setGa4Property(
  restaurantId: string,
  propertyId: string | null,
  propertyName: string | null,
): Promise<void> {
  await prisma.googleIntegrationConfig.update({
    where: { restaurantId },
    data: { ga4PropertyId: propertyId, ga4PropertyName: propertyName },
  });
}

export async function recordError(restaurantId: string, message: string): Promise<void> {
  await prisma.googleIntegrationConfig.updateMany({
    where: { restaurantId },
    data:  { lastError: message.slice(0, 300) },
  });
}

export async function recordSync(restaurantId: string): Promise<void> {
  await prisma.googleIntegrationConfig.updateMany({
    where: { restaurantId },
    data:  { lastSyncedAt: new Date(), lastError: null },
  });
}

/** Full disconnect: wipe tokens + selections. History (the row) is preserved. */
export async function disconnectGoogle(restaurantId: string): Promise<void> {
  await prisma.googleIntegrationConfig.updateMany({
    where: { restaurantId },
    data: {
      connected: false,
      accessTokenEncrypted: null,
      refreshTokenEncrypted: null,
      tokenExpiresAt: null,
      scopes: null,
      googleEmail: null,
      googleUserId: null,
      businessAccountId: null,
      businessLocationId: null,
      businessLocationName: null,
      ga4PropertyId: null,
      ga4PropertyName: null,
      lastError: null,
    },
  });
}
