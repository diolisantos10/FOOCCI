/**
 * AdminWhatsAppConfigService — the Foocci/Futi ADMIN WhatsApp channel config.
 *
 * This is the Build OS command line. It is SYSTEM-level: it has NO restaurantId
 * and is never tied to a Restaurant / tenant / EvolutionConfig. Diego/CEO sends
 * internal commands here ("no cliente X, faça Y") and the target is named inside
 * the message.
 *
 * Credentials (apiKey, webhookSecret) are stored AES-256-GCM encrypted and are
 * NEVER returned in full — the UI only ever sees a mask + booleans. The decrypted
 * snapshot is server-only (Evolution calls + webhook signature verification).
 *
 * If global Evolution env credentials exist (EVOLUTION_DEFAULT_URL /
 * EVOLUTION_BASE_URL), they are offered as a default baseUrl. No restaurant
 * credentials are ever used here.
 */

import { randomBytes } from "crypto";
import { prisma } from "@/lib/prisma";
import { encrypt, decrypt, maskSecret } from "@/lib/crypto";
import type { EvolutionConfigSnapshot } from "@/lib/evolution/EvolutionClient";

/** Global Evolution base URL from env, if configured (never a restaurant URL). */
export function getEnvEvolutionBaseUrl(): string | null {
  return process.env.EVOLUTION_DEFAULT_URL || process.env.EVOLUTION_BASE_URL || null;
}

/** Load the authoritative admin WhatsApp config row (most recent), or null. */
export async function getAdminWhatsAppRow() {
  try {
    return await prisma.buildOSMasterWhatsAppConfig.findFirst({ orderBy: { updatedAt: "desc" } });
  } catch {
    return null;
  }
}

export interface AdminWhatsAppView {
  configured: boolean;       // instanceName + baseUrl + apiKey present
  instanceName: string | null;
  baseUrl: string | null;
  apiKeyMasked: string | null;
  hasApiKey: boolean;
  hasWebhookSecret: boolean;
  isEnabled: boolean;
  envBaseUrl: string | null; // suggested default from env (if any)
  updatedAt: string | null;
}

/** Masked, UI-safe view of the admin WhatsApp config. Never exposes secrets. */
export async function getAdminWhatsAppView(): Promise<AdminWhatsAppView> {
  const row = await getAdminWhatsAppRow();
  let apiKeyMasked: string | null = null;
  if (row?.apiKey) {
    try { apiKeyMasked = maskSecret(decrypt(row.apiKey)); } catch { apiKeyMasked = "••••"; }
  }
  return {
    configured: !!(row?.instanceName && row?.baseUrl && row?.apiKey),
    instanceName: row?.instanceName ?? null,
    baseUrl: row?.baseUrl ?? null,
    apiKeyMasked,
    hasApiKey: !!row?.apiKey,
    hasWebhookSecret: !!row?.webhookSecret,
    isEnabled: !!row?.isEnabled,
    envBaseUrl: getEnvEvolutionBaseUrl(),
    updatedAt: row?.updatedAt.toISOString() ?? null,
  };
}

/** Decrypted snapshot for Evolution calls (server-only). null when not configured. */
export async function getAdminWhatsAppSnapshot(includeWebhookSecret = false): Promise<EvolutionConfigSnapshot | null> {
  const row = await getAdminWhatsAppRow();
  if (!row?.instanceName || !row?.baseUrl || !row?.apiKey) return null;
  try {
    return {
      instanceName: row.instanceName,
      baseUrl: row.baseUrl,
      apiKey: decrypt(row.apiKey),
      ...(includeWebhookSecret && row.webhookSecret ? { webhookSecret: decrypt(row.webhookSecret) } : {}),
    };
  } catch {
    return null;
  }
}

/** For the webhook receiver: resolve the admin channel by instanceName. */
export async function findAdminWhatsAppByInstance(
  instanceName: string,
): Promise<{ webhookSecret: string; isEnabled: boolean } | null> {
  try {
    const row = await prisma.buildOSMasterWhatsAppConfig.findUnique({ where: { instanceName } });
    if (!row) return null;
    return { webhookSecret: row.webhookSecret ? decrypt(row.webhookSecret) : "", isEnabled: row.isEnabled };
  } catch {
    return null;
  }
}

export interface UpsertAdminWhatsAppInput {
  instanceName?: string;
  baseUrl?: string | null;
  /** Plaintext API key — encrypted before storage; omitted when unchanged. */
  apiKey?: string;
  isEnabled?: boolean;
}

export interface UpsertResult {
  ok: boolean;
  error?: string;
}

/**
 * Create/update the admin WhatsApp config. Encrypts the apiKey; generates a
 * webhookSecret on first save. Never logs/returns secrets.
 */
export async function upsertAdminWhatsApp(input: UpsertAdminWhatsAppInput): Promise<UpsertResult> {
  try {
    const row = await getAdminWhatsAppRow();

    if (!row) {
      const instanceName = (input.instanceName ?? "").trim();
      const baseUrl = (input.baseUrl ?? getEnvEvolutionBaseUrl() ?? "").trim();
      if (!instanceName) return { ok: false, error: "instanceName é obrigatório." };
      if (!baseUrl) return { ok: false, error: "baseUrl da Evolution é obrigatório (ou configure EVOLUTION_DEFAULT_URL)." };
      if (!input.apiKey || !input.apiKey.trim()) return { ok: false, error: "apiKey/token da Evolution é obrigatório no primeiro cadastro." };
      await prisma.buildOSMasterWhatsAppConfig.create({
        data: {
          instanceName,
          baseUrl,
          apiKey: encrypt(input.apiKey.trim()),
          webhookSecret: encrypt(randomBytes(24).toString("hex")),
          isEnabled: input.isEnabled ?? false,
        },
      });
      return { ok: true };
    }

    const data: Record<string, unknown> = {};
    if (input.instanceName !== undefined) {
      const v = input.instanceName.trim();
      if (!v) return { ok: false, error: "instanceName não pode ser vazio." };
      data.instanceName = v;
    }
    if (input.baseUrl !== undefined) {
      const v = (input.baseUrl ?? "").trim();
      if (!v) return { ok: false, error: "baseUrl não pode ser vazio." };
      data.baseUrl = v;
    }
    if (input.apiKey !== undefined && input.apiKey.trim()) data.apiKey = encrypt(input.apiKey.trim());
    if (input.isEnabled !== undefined) data.isEnabled = input.isEnabled;
    if (!row.webhookSecret) data.webhookSecret = encrypt(randomBytes(24).toString("hex"));

    await prisma.buildOSMasterWhatsAppConfig.update({ where: { id: row.id }, data });
    return { ok: true };
  } catch (err) {
    const msg = err instanceof Error ? err.message.slice(0, 200) : String(err).slice(0, 200);
    return { ok: false, error: `Não foi possível salvar a configuração: ${msg}` };
  }
}
