/**
 * BuildOSConfigService — DB-first admin configuration for Build OS (Pri 1.4.1).
 *
 * Moves NORMAL activation + operator management out of env vars and into the
 * admin DB. Env vars remain bootstrap/emergency only:
 *
 *   ENABLE precedence:
 *     1. BUILDOS_HARD_DISABLED=true  → always OFF (emergency kill-switch).
 *     2. BuildOSConfig row exists    → use its isEnabled.
 *     3. else                        → fallback to env BUILDOS_ENABLED.
 *
 *   AUTHORIZATION precedence (per phone, Brazilian 9th-digit tolerant):
 *     1. Active BuildAuthorizedSender in DB (match any phone variant) → allow.
 *     2. else, IF (no active DB senders) OR (config.allowEnvAuthorizedPhonesFallback)
 *        → fallback to env BUILD_OS_AUTHORIZED_PHONES.
 *     3. else → deny.
 *
 * NO Claude, NO GitHub, NO LLM, NO execution. Defensive — never throws into the
 * webhook hot path (callers should still guard).
 */

import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import {
  isBuildOsEnabled as isEnvBuildOsEnabled,
  isAuthorizedBuildSender as isEnvAuthorizedSender,
  normalizeSenderPhone,
  phoneVariants,
} from "./BuildCommandRouter";

/** Hard emergency kill-switch (env). When true, Build OS never processes anything. */
export function isBuildOsHardDisabled(): boolean {
  return (process.env.BUILDOS_HARD_DISABLED ?? "").toLowerCase() === "true";
}

export type ConfigSource = "database" | "env_fallback" | "hard_disabled" | "default_off";

export interface EffectiveBuildOsStatus {
  enabled: boolean;
  source: ConfigSource;
  mode: "INTERNAL_ONLY" | "PRODUCT";
  hardDisabled: boolean;
  hasDbConfig: boolean;
  envEnabledFallback: boolean;
  allowEnvPhonesFallback: boolean;
  activeDbSenderCount: number;
  envPhoneFallbackActive: boolean;
  updatedAt: string | null;
}

/** Load the authoritative BuildOSConfig row (most recent), or null. */
export async function getBuildOSConfigRow() {
  try {
    return await prisma.buildOSConfig.findFirst({ orderBy: { updatedAt: "desc" } });
  } catch {
    return null;
  }
}

/**
 * Resolve whether Build OS is enabled right now, honoring the precedence above.
 * Defensive: any DB failure falls back to env. Returns enabled + source.
 */
export async function resolveBuildOsEnabled(): Promise<{ enabled: boolean; source: ConfigSource }> {
  if (isBuildOsHardDisabled()) return { enabled: false, source: "hard_disabled" };

  const row = await getBuildOSConfigRow();
  if (row) return { enabled: row.isEnabled, source: "database" };

  // No DB config → env bootstrap fallback.
  if (isEnvBuildOsEnabled()) return { enabled: true, source: "env_fallback" };
  return { enabled: false, source: "default_off" };
}

/** Count of ACTIVE DB authorized senders. Defensive: 0 on failure. */
export async function countActiveDbSenders(): Promise<number> {
  try {
    return await prisma.buildAuthorizedSender.count({ where: { isActive: true } });
  } catch {
    return 0;
  }
}

/**
 * Authorize a sender phone (DB-first, env fallback). Returns whether authorized
 * and where the decision came from. Brazilian 9th-digit variants are matched.
 */
export async function authorizeSender(
  phone: string,
): Promise<{ authorized: boolean; source: "database" | "env_fallback" | "denied"; senderId?: string }> {
  const normalized = normalizeSenderPhone(phone);
  if (!normalized) return { authorized: false, source: "denied" };

  const variants = Array.from(phoneVariants(normalized));

  // 1. DB active sender (match any variant).
  try {
    const sender = await prisma.buildAuthorizedSender.findFirst({
      where: { isActive: true, phone: { in: variants } },
      select: { id: true },
    });
    if (sender) return { authorized: true, source: "database", senderId: sender.id };
  } catch {
    // fall through to env
  }

  // 2. Env fallback — allowed when (no active DB senders) OR (config allows it).
  const row = await getBuildOSConfigRow();
  const activeCount = await countActiveDbSenders();
  const fallbackAllowed = !row || row.allowEnvAuthorizedPhonesFallback || activeCount === 0;
  if (fallbackAllowed && isEnvAuthorizedSender(phone)) {
    return { authorized: true, source: "env_fallback" };
  }

  return { authorized: false, source: "denied" };
}

/** Best-effort: stamp lastUsedAt when a DB sender's command is accepted. */
export async function touchSenderLastUsed(senderId: string): Promise<void> {
  try {
    await prisma.buildAuthorizedSender.update({
      where: { id: senderId },
      data: { lastUsedAt: new Date() },
    });
  } catch {
    /* ignore */
  }
}

/** Full effective status for the admin Configuração tab. */
export async function getEffectiveBuildOsStatus(): Promise<EffectiveBuildOsStatus> {
  const hardDisabled = isBuildOsHardDisabled();
  const row = await getBuildOSConfigRow();
  const activeDbSenderCount = await countActiveDbSenders();
  const { enabled, source } = await resolveBuildOsEnabled();
  const allowEnvPhonesFallback = row ? row.allowEnvAuthorizedPhonesFallback : true;
  const envPhoneFallbackActive = (allowEnvPhonesFallback || activeDbSenderCount === 0);

  return {
    enabled,
    source,
    mode: row?.mode ?? "INTERNAL_ONLY",
    hardDisabled,
    hasDbConfig: !!row,
    envEnabledFallback: isEnvBuildOsEnabled(),
    allowEnvPhonesFallback,
    activeDbSenderCount,
    envPhoneFallbackActive,
    updatedAt: row?.updatedAt.toISOString() ?? null,
  };
}

// ── Admin mutations (config) ────────────────────────────────────────────────────

export interface UpdateConfigInput {
  isEnabled?: boolean;
  mode?: "INTERNAL_ONLY" | "PRODUCT";
  defaultProjectId?: string | null;
  allowEnvAuthorizedPhonesFallback?: boolean;
}

/** Upsert the singleton config (creates the first row if none exists). */
export async function updateBuildOSConfig(input: UpdateConfigInput): Promise<void> {
  const row = await getBuildOSConfigRow();
  if (!row) {
    await prisma.buildOSConfig.create({
      data: {
        isEnabled: input.isEnabled ?? false,
        mode: (input.mode ?? "INTERNAL_ONLY") as never,
        defaultProjectId: input.defaultProjectId ?? null,
        allowEnvAuthorizedPhonesFallback: input.allowEnvAuthorizedPhonesFallback ?? true,
      },
    });
    return;
  }
  const data: Prisma.BuildOSConfigUpdateInput = {};
  if (input.isEnabled !== undefined) data.isEnabled = input.isEnabled;
  if (input.mode !== undefined) data.mode = input.mode as never;
  if (input.defaultProjectId !== undefined) data.defaultProjectId = input.defaultProjectId;
  if (input.allowEnvAuthorizedPhonesFallback !== undefined) {
    data.allowEnvAuthorizedPhonesFallback = input.allowEnvAuthorizedPhonesFallback;
  }
  await prisma.buildOSConfig.update({ where: { id: row.id }, data });
}

// ── Admin mutations (authorized senders) ────────────────────────────────────────

export interface AdminSenderView {
  id: string;
  name: string | null;
  rawPhone: string | null;
  phone: string;
  role: string;
  isActive: boolean;
  allowedProjectIds: string[];
  notes: string | null;
  lastUsedAt: string | null;
  createdAt: string;
}

export async function listAuthorizedSenders(): Promise<AdminSenderView[]> {
  try {
    const rows = await prisma.buildAuthorizedSender.findMany({
      orderBy: { createdAt: "desc" },
    });
    return rows.map((r) => ({
      id: r.id,
      name: r.name,
      rawPhone: r.rawPhone,
      phone: r.phone,
      role: r.role,
      isActive: r.isActive,
      allowedProjectIds: Array.isArray(r.allowedProjectIds)
        ? (r.allowedProjectIds as unknown[]).map(String)
        : [],
      notes: r.notes,
      lastUsedAt: r.lastUsedAt?.toISOString() ?? null,
      createdAt: r.createdAt.toISOString(),
    }));
  } catch {
    return [];
  }
}

export interface CreateSenderInput {
  name?: string | null;
  phone: string; // raw input from admin
  role?: string;
  isActive?: boolean;
  allowedProjectIds?: string[];
  notes?: string | null;
}

export interface SenderMutationResult {
  ok: boolean;
  error?: string;
  id?: string;
  normalizedPhone?: string;
}

/** Create an authorized sender, normalizing the phone canonically. */
export async function createAuthorizedSender(input: CreateSenderInput): Promise<SenderMutationResult> {
  const normalized = normalizeSenderPhone(input.phone);
  if (!normalized || normalized.length < 8) {
    return { ok: false, error: "Telefone inválido." };
  }
  try {
    const created = await prisma.buildAuthorizedSender.create({
      data: {
        phone: normalized,
        rawPhone: input.phone.trim(),
        name: input.name ?? null,
        role: input.role ?? "operator",
        isActive: input.isActive ?? true,
        allowedProjectIds: (input.allowedProjectIds ?? []) as Prisma.InputJsonValue,
        notes: input.notes ?? null,
      },
      select: { id: true },
    });
    return { ok: true, id: created.id, normalizedPhone: normalized };
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      return { ok: false, error: "Já existe um operador com esse telefone." };
    }
    return { ok: false, error: "Não foi possível criar o operador." };
  }
}

export interface UpdateSenderInput {
  name?: string | null;
  phone?: string;
  role?: string;
  isActive?: boolean;
  allowedProjectIds?: string[];
  notes?: string | null;
}

export async function updateAuthorizedSender(
  id: string,
  input: UpdateSenderInput,
): Promise<SenderMutationResult> {
  const data: Prisma.BuildAuthorizedSenderUpdateInput = {};
  if (input.name !== undefined) data.name = input.name;
  if (input.role !== undefined) data.role = input.role;
  if (input.isActive !== undefined) data.isActive = input.isActive;
  if (input.notes !== undefined) data.notes = input.notes;
  if (input.allowedProjectIds !== undefined) {
    data.allowedProjectIds = input.allowedProjectIds as Prisma.InputJsonValue;
  }
  let normalizedPhone: string | undefined;
  if (input.phone !== undefined) {
    normalizedPhone = normalizeSenderPhone(input.phone);
    if (!normalizedPhone || normalizedPhone.length < 8) {
      return { ok: false, error: "Telefone inválido." };
    }
    data.phone = normalizedPhone;
    data.rawPhone = input.phone.trim();
  }
  try {
    await prisma.buildAuthorizedSender.update({ where: { id }, data });
    return { ok: true, id, normalizedPhone };
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      return { ok: false, error: "Já existe um operador com esse telefone." };
    }
    return { ok: false, error: "Não foi possível atualizar o operador." };
  }
}

/** Soft-deactivate (default) — safer than delete; keeps audit/history intact. */
export async function deactivateAuthorizedSender(id: string): Promise<SenderMutationResult> {
  try {
    await prisma.buildAuthorizedSender.update({ where: { id }, data: { isActive: false } });
    return { ok: true, id };
  } catch {
    return { ok: false, error: "Não foi possível desativar o operador." };
  }
}

/** Hard delete — allowed (the model has no inbound FK), used by the DELETE route. */
export async function deleteAuthorizedSender(id: string): Promise<SenderMutationResult> {
  try {
    await prisma.buildAuthorizedSender.delete({ where: { id } });
    return { ok: true, id };
  } catch {
    return { ok: false, error: "Não foi possível remover o operador." };
  }
}
