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

/** Global Evolution API key from env, if configured. Never returned to the client. */
export function getEnvEvolutionApiKey(): string | null {
  const v = process.env.EVOLUTION_DEFAULT_API_KEY;
  return v && v.trim() ? v.trim() : null;
}

/** Where the effective apiKey comes from. */
export type ApiKeySource = "saved" | "env" | "none";

/**
 * Resolve the effective apiKey + its source, in priority order:
 *   1. apiKey saved (encrypted) on BuildOSMasterWhatsAppConfig
 *   2. EVOLUTION_DEFAULT_API_KEY (env)
 *   3. none
 * The decrypted key is server-only; callers must never return it to the client.
 */
function resolveApiKey(row: { apiKey: string | null } | null): { apiKey: string | null; source: ApiKeySource } {
  if (row?.apiKey) {
    try { return { apiKey: decrypt(row.apiKey), source: "saved" }; } catch { /* fall through */ }
  }
  const env = getEnvEvolutionApiKey();
  if (env) return { apiKey: env, source: "env" };
  return { apiKey: null, source: "none" };
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
  configured: boolean;       // instanceName + baseUrl present AND an apiKey is resolvable
  instanceName: string | null;
  baseUrl: string | null;
  /** Masked apiKey when saved manually; null when the key comes from env/none. */
  apiKeyMasked: string | null;
  /** True when an apiKey is available (saved OR env). */
  hasApiKey: boolean;
  /** Where the effective apiKey comes from — never the value itself. */
  apiKeySource: ApiKeySource;
  hasWebhookSecret: boolean;
  isEnabled: boolean;
  baseUrlSource: "saved" | "env" | "none";
  envBaseUrl: string | null;        // suggested default from env (if any)
  envApiKeyAvailable: boolean;      // EVOLUTION_DEFAULT_API_KEY is set
  updatedAt: string | null;
}

/** Masked, UI-safe view of the admin WhatsApp config. Never exposes secrets. */
export async function getAdminWhatsAppView(): Promise<AdminWhatsAppView> {
  const row = await getAdminWhatsAppRow();
  const { apiKey, source } = resolveApiKey(row);
  // Mask only when the key was saved manually; for env we expose origin, not value.
  let apiKeyMasked: string | null = null;
  if (source === "saved") {
    try { apiKeyMasked = maskSecret(apiKey ?? ""); } catch { apiKeyMasked = "••••"; }
  }
  const baseUrl = row?.baseUrl ?? getEnvEvolutionBaseUrl();
  const baseUrlSource: "saved" | "env" | "none" = row?.baseUrl ? "saved" : (getEnvEvolutionBaseUrl() ? "env" : "none");

  return {
    configured: !!(row?.instanceName && baseUrl && apiKey),
    instanceName: row?.instanceName ?? null,
    baseUrl: baseUrl ?? null,
    apiKeyMasked,
    hasApiKey: !!apiKey,
    apiKeySource: source,
    hasWebhookSecret: !!row?.webhookSecret,
    isEnabled: !!row?.isEnabled,
    baseUrlSource,
    envBaseUrl: getEnvEvolutionBaseUrl(),
    envApiKeyAvailable: !!getEnvEvolutionApiKey(),
    updatedAt: row?.updatedAt.toISOString() ?? null,
  };
}

/**
 * Decrypted snapshot for Evolution calls (server-only). Resolves apiKey/baseUrl
 * from saved config → env. null when instanceName, baseUrl or apiKey is missing.
 */
export async function getAdminWhatsAppSnapshot(includeWebhookSecret = false): Promise<EvolutionConfigSnapshot | null> {
  const row = await getAdminWhatsAppRow();
  const baseUrl = row?.baseUrl ?? getEnvEvolutionBaseUrl();
  const { apiKey } = resolveApiKey(row);
  if (!row?.instanceName || !baseUrl || !apiKey) return null;
  try {
    return {
      instanceName: row.instanceName,
      baseUrl,
      apiKey,
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
      // apiKey is optional when EVOLUTION_DEFAULT_API_KEY is set in env. A manual key
      // (encrypted) takes precedence; "" stored means "resolve from env".
      const manualKey = input.apiKey?.trim();
      if (!manualKey && !getEnvEvolutionApiKey()) {
        return { ok: false, error: "Defina EVOLUTION_DEFAULT_API_KEY no ambiente ou informe uma apiKey manual no card." };
      }
      await prisma.buildOSMasterWhatsAppConfig.create({
        data: {
          instanceName,
          baseUrl,
          apiKey: manualKey ? encrypt(manualKey) : "",
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
