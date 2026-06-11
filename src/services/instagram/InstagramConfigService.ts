/**
 * InstagramConfigService — per-restaurant Instagram Direct connection config.
 *
 * Tokens are stored ENCRYPTED (AES-256-GCM via lib/crypto). The webhook verify
 * token is stored as a SHA-256 hash and only ever compared, never returned.
 * API views NEVER expose the token — only a `tokenConfigured` boolean.
 *
 * Pure config I/O — never sends a Direct message, never creates an order/Pix.
 */

import { createHash } from "crypto";
import { prisma } from "@/lib/prisma";
import { encrypt, decrypt } from "@/lib/crypto";
import type { InstagramMode, InstagramScope } from "./types";
import { INSTAGRAM_MODES, INSTAGRAM_SCOPES } from "./types";

export interface InstagramConfigRow {
  id: string;
  restaurantId: string;
  enabled: boolean;
  paused: boolean;
  mode: InstagramMode;
  scope: InstagramScope;
  instagramBusinessAccountId: string | null;
  facebookPageId: string | null;
  pageAccessTokenEncrypted: string | null;
  verifyTokenHash: string | null;
  appId: string | null;
  appSecretRef: string | null;
  allowlistedExternalUserIds: string[];
  lastWebhookAt: Date | null;
  lastError: string | null;
}

/** Operator-safe view — never includes the token. */
export interface InstagramConfigView {
  restaurantId: string;
  enabled: boolean;
  paused: boolean;
  mode: InstagramMode;
  scope: InstagramScope;
  instagramBusinessAccountId: string | null;
  facebookPageId: string | null;
  tokenConfigured: boolean;
  verifyTokenConfigured: boolean;
  appId: string | null;
  allowlistCount: number;
  lastWebhookAt: Date | null;
  lastError: string | null;
}

export interface InstagramConfigPatch {
  enabled?: boolean;
  paused?: boolean;
  mode?: InstagramMode;
  scope?: InstagramScope;
  instagramBusinessAccountId?: string | null;
  facebookPageId?: string | null;
  pageAccessToken?: string; // plaintext IN — encrypted before storage, never stored raw
  verifyToken?: string; // plaintext IN — hashed before storage
  appId?: string | null;
  appSecretRef?: string | null;
  allowlistedExternalUserIds?: string[];
}

export function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function normalizeMode(m: string): InstagramMode {
  return (INSTAGRAM_MODES as string[]).includes(m) ? (m as InstagramMode) : "DISABLED";
}
function normalizeScope(s: string): InstagramScope {
  return (INSTAGRAM_SCOPES as string[]).includes(s) ? (s as InstagramScope) : "TEST_ACCOUNT_ONLY";
}

function rowToTyped(row: {
  id: string; restaurantId: string; enabled: boolean; paused: boolean; mode: string; scope: string;
  instagramBusinessAccountId: string | null; facebookPageId: string | null;
  pageAccessTokenEncrypted: string | null; verifyTokenHash: string | null; appId: string | null;
  appSecretRef: string | null; allowlistedExternalUserIds: unknown; lastWebhookAt: Date | null; lastError: string | null;
}): InstagramConfigRow {
  return {
    ...row,
    mode: normalizeMode(row.mode),
    scope: normalizeScope(row.scope),
    allowlistedExternalUserIds: Array.isArray(row.allowlistedExternalUserIds)
      ? (row.allowlistedExternalUserIds as string[]) : [],
  };
}

export async function getInstagramConfig(restaurantId: string): Promise<InstagramConfigRow | null> {
  const row = await prisma.instagramChannelConfig.findUnique({ where: { restaurantId } });
  return row ? rowToTyped(row) : null;
}

export function toView(row: InstagramConfigRow): InstagramConfigView {
  return {
    restaurantId: row.restaurantId,
    enabled: row.enabled,
    paused: row.paused,
    mode: row.mode,
    scope: row.scope,
    instagramBusinessAccountId: row.instagramBusinessAccountId,
    facebookPageId: row.facebookPageId,
    tokenConfigured: !!row.pageAccessTokenEncrypted,
    verifyTokenConfigured: !!row.verifyTokenHash,
    appId: row.appId,
    allowlistCount: row.allowlistedExternalUserIds.length,
    lastWebhookAt: row.lastWebhookAt,
    lastError: row.lastError,
  };
}

/**
 * Resolves the connected config for an inbound webhook by the account/page id in
 * the Meta payload (`entry[].id`). Returns null when no enabled config matches.
 */
export async function resolveConfigByInstagramAccountId(accountId: string): Promise<InstagramConfigRow | null> {
  if (!accountId) return null;
  const row = await prisma.instagramChannelConfig.findFirst({
    where: {
      enabled: true,
      OR: [{ instagramBusinessAccountId: accountId }, { facebookPageId: accountId }],
    },
  });
  return row ? rowToTyped(row) : null;
}

/** Decrypts the Page Access Token for internal use (send client only). Throws if absent/no key. */
export function decryptPageToken(row: InstagramConfigRow): string | null {
  if (!row.pageAccessTokenEncrypted) return null;
  try {
    return decrypt(row.pageAccessTokenEncrypted);
  } catch {
    return null;
  }
}

export interface UpsertResult {
  ok: boolean;
  view?: InstagramConfigView;
  error?: string;
}

export async function upsertInstagramConfig(restaurantId: string, patch: InstagramConfigPatch): Promise<UpsertResult> {
  const data: Record<string, unknown> = {};
  if (patch.enabled !== undefined) data.enabled = patch.enabled;
  if (patch.paused !== undefined) data.paused = patch.paused;
  if (patch.mode !== undefined) data.mode = normalizeMode(patch.mode);
  if (patch.scope !== undefined) data.scope = normalizeScope(patch.scope);
  if (patch.instagramBusinessAccountId !== undefined) data.instagramBusinessAccountId = patch.instagramBusinessAccountId;
  if (patch.facebookPageId !== undefined) data.facebookPageId = patch.facebookPageId;
  if (patch.appId !== undefined) data.appId = patch.appId;
  if (patch.appSecretRef !== undefined) data.appSecretRef = patch.appSecretRef;
  if (patch.allowlistedExternalUserIds !== undefined) data.allowlistedExternalUserIds = patch.allowlistedExternalUserIds;

  // Token: encrypt before storage. Never store plaintext; never log.
  if (patch.pageAccessToken !== undefined && patch.pageAccessToken !== "") {
    try {
      data.pageAccessTokenEncrypted = encrypt(patch.pageAccessToken);
    } catch {
      return { ok: false, error: "ENCRYPTION_KEY ausente — não é possível salvar o token com segurança." };
    }
  }
  if (patch.verifyToken !== undefined && patch.verifyToken !== "") {
    data.verifyTokenHash = sha256(patch.verifyToken);
  }

  const row = await prisma.instagramChannelConfig.upsert({
    where: { restaurantId },
    create: { restaurantId, ...data },
    update: data,
  });
  return { ok: true, view: toView(rowToTyped(row)) };
}

export async function recordWebhookReceived(restaurantId: string): Promise<void> {
  await prisma.instagramChannelConfig
    .update({ where: { restaurantId }, data: { lastWebhookAt: new Date(), lastError: null } })
    .catch(() => undefined);
}

export async function recordWebhookError(restaurantId: string, message: string): Promise<void> {
  await prisma.instagramChannelConfig
    .update({ where: { restaurantId }, data: { lastError: message.slice(0, 500) } })
    .catch(() => undefined);
}

/** Verify-token check for the Meta webhook GET handshake (per-config). */
export function verifyTokenMatches(row: InstagramConfigRow | null, presented: string): boolean {
  if (!row?.verifyTokenHash || !presented) return false;
  return row.verifyTokenHash === sha256(presented);
}

/**
 * App-level verify-token resolution for the Meta GET handshake. Meta sends one
 * verify token (no account id), so we accept either the env-level token
 * (INSTAGRAM_WEBHOOK_VERIFY_TOKEN) or ANY restaurant config whose hash matches.
 */
export async function isValidWebhookVerifyToken(presented: string): Promise<boolean> {
  if (!presented) return false;
  const envToken = process.env.INSTAGRAM_WEBHOOK_VERIFY_TOKEN;
  if (envToken && presented === envToken) return true;
  const hash = sha256(presented);
  const match = await prisma.instagramChannelConfig.findFirst({ where: { verifyTokenHash: hash }, select: { id: true } }).catch(() => null);
  return !!match;
}
