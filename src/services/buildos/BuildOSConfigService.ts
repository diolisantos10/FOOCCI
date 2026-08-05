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
import { buildOsPhoneNumberId, isBuildOsMetaChannelEnabled } from "./BuildOsMetaChannel";
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
  // ── Build OS WhatsApp Master/Admin channel ──
  whatsappChannel: BuildOsChannelConfig;
}

/** Load the authoritative BuildOSConfig row (most recent), or null. */
export async function getBuildOSConfigRow() {
  try {
    return await prisma.buildOSConfig.findFirst({ orderBy: { updatedAt: "desc" } });
  } catch {
    return null;
  }
}

// ── Build OS WhatsApp Master/Admin channel ──────────────────────────────────────

export interface BuildOsChannelConfig {
  /** True quando o número Master está configurado E o canal consegue responder. */
  configured: boolean;
  /**
   * Identidade do canal Master. Desde 04/08/2026 é o **`phone_number_id` da
   * Meta** — antes era o `instanceName` de uma instância Evolution, que deixou de
   * existir junto com a Evolution. O nome do campo ficou para não quebrar as
   * telas de diagnóstico que já o leem.
   */
  channelId: string | null;
  enabled: boolean;
  legacyFallbackEnabled: boolean;
}

/**
 * Lê a configuração do canal Master do Build OS.
 *
 * A identidade vem do número DEDICADO da Meta (`BUILDOS_META_PHONE_NUMBER_ID` +
 * `BUILDOS_META_ACCESS_TOKEN`) — **nunca** de um restaurante. O sinalizador de
 * fallback legado continua no `BuildOSConfig` (padrão desligado).
 */
export async function getBuildOsChannel(): Promise<BuildOsChannelConfig> {
  const cfgRow    = await getBuildOSConfigRow();
  const channelId = buildOsPhoneNumberId();
  const enabled   = isBuildOsMetaChannelEnabled();
  return {
    configured: !!channelId && enabled,
    channelId,
    enabled,
    legacyFallbackEnabled: !!cfgRow?.legacyRestaurantInstanceFallbackEnabled,
  };
}

export interface BuildOsChannelDecision {
  /** True se a lógica de comando do Build OS deve rodar para este canal. */
  isBuildOsChannel: boolean;
  /** True se existe um canal Master configurado + habilitado. */
  masterConfigured: boolean;
  /** True se a decisão veio do fallback legado explícito para restaurante. */
  viaLegacyFallback: boolean;
  /** True quando o número É o Master do sistema (não é de restaurante). */
  isAdminInstance: boolean;
  /** `phone_number_id` do Master (ver `BuildOsChannelConfig.channelId`). */
  masterChannelId: string | null;
}

/**
 * Decide se um `phone_number_id` que acabou de receber mensagem é o canal de
 * comando do Build OS.
 *
 *   • Master configurado + habilitado + bate → SIM (o caminho normal).
 *   • Sem Master configurado MAS fallback legado explicitamente LIGADO → SIM
 *     (temporário; a tela rotula "fallback legado").
 *   • Caso contrário → NÃO. Número de restaurante nunca é Build OS por padrão.
 */
export async function resolveBuildOsChannel(channelId: string | null | undefined): Promise<BuildOsChannelDecision> {
  const ch = await getBuildOsChannel();
  return decideBuildOsChannel(ch, channelId);
}

/**
 * Decisão pura (sem banco) — exportada para teste.
 */
export function decideBuildOsChannel(
  ch: BuildOsChannelConfig,
  channelId: string | null | undefined,
): BuildOsChannelDecision {
  const masterConfigured = ch.configured;
  const matchesMaster = !!channelId && !!ch.channelId && ch.enabled && channelId === ch.channelId;

  if (matchesMaster) {
    return { isBuildOsChannel: true, masterConfigured, viaLegacyFallback: false, isAdminInstance: true, masterChannelId: ch.channelId };
  }
  // Fallback legado SÓ quando não há Master configurado e ele foi ligado de propósito.
  if (!masterConfigured && ch.legacyFallbackEnabled) {
    return { isBuildOsChannel: true, masterConfigured, viaLegacyFallback: true, isAdminInstance: false, masterChannelId: ch.channelId };
  }
  return { isBuildOsChannel: false, masterConfigured, viaLegacyFallback: false, isAdminInstance: false, masterChannelId: ch.channelId };
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
  const whatsappChannel = await getBuildOsChannel();

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
    whatsappChannel,
  };
}

// ── Admin mutations (config) ────────────────────────────────────────────────────

export interface UpdateConfigInput {
  isEnabled?: boolean;
  mode?: "INTERNAL_ONLY" | "PRODUCT";
  defaultProjectId?: string | null;
  allowEnvAuthorizedPhonesFallback?: boolean;
  whatsappInstanceName?: string | null;
  whatsappEnabled?: boolean;
  legacyRestaurantInstanceFallbackEnabled?: boolean;
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
        whatsappInstanceName: input.whatsappInstanceName?.trim() || null,
        whatsappEnabled: input.whatsappEnabled ?? false,
        legacyRestaurantInstanceFallbackEnabled: input.legacyRestaurantInstanceFallbackEnabled ?? false,
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
  if (input.whatsappInstanceName !== undefined) {
    data.whatsappInstanceName = input.whatsappInstanceName?.trim() || null;
  }
  if (input.whatsappEnabled !== undefined) data.whatsappEnabled = input.whatsappEnabled;
  if (input.legacyRestaurantInstanceFallbackEnabled !== undefined) {
    data.legacyRestaurantInstanceFallbackEnabled = input.legacyRestaurantInstanceFallbackEnabled;
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

/** Internal command prefixes that make a trace eligible for one-click authorize. */
const AUTHORIZABLE_TRACE_PREFIXES = ["/build", "/cmd", "/prompt"];

export interface AuthorizeFromTraceInput {
  /** Full BuildWebhookTrace id (the only token the browser sends). */
  traceId: string;
  /** Optional operator name (default "Operador Build OS"). */
  name?: string | null;
  /** Optional role label (e.g. "owner"/"admin"); defaults to "owner". */
  role?: string | null;
}

export interface AuthorizeFromTraceResult {
  ok: boolean;
  error?: string;
  /** Masked phone only — the full number is NEVER returned to the caller. */
  maskedPhone?: string;
  /** Whether an existing sender was reactivated vs a new one created. */
  action?: "created" | "reactivated";
}

/**
 * Authorize the REAL sender behind an unauthorized /build webhook trace.
 *
 * Security model:
 *   • The browser only ever sends a `traceId` — never a phone. The full number
 *     is recovered SERVER-SIDE from the trace's `rawPhone` and is never returned.
 *   • Only traces that genuinely failed as `unauthorized_sender` for an internal
 *     command prefix are eligible — this can't be used to authorize arbitrary
 *     numbers, only ones that actually tried to run /build and were rejected.
 *   • Existing operators are never deleted; a matching one is reactivated.
 *   • Build OS config is kept enabled (never disabled here).
 *
 * Defensive: returns a structured error instead of throwing.
 */
export async function authorizeSenderFromTrace(
  input: AuthorizeFromTraceInput,
): Promise<AuthorizeFromTraceResult> {
  let trace;
  try {
    trace = await prisma.buildWebhookTrace.findUnique({ where: { id: input.traceId } });
  } catch {
    return { ok: false, error: "Não foi possível ler o registro de diagnóstico." };
  }
  if (!trace) return { ok: false, error: "Registro de diagnóstico não encontrado." };

  // Eligibility: must be a genuine unauthorized internal-command attempt.
  const prefix = (trace.prefixDetected ?? "").toLowerCase();
  const isInternalPrefix = AUTHORIZABLE_TRACE_PREFIXES.includes(prefix);
  if (!isInternalPrefix || trace.authorized !== false || trace.failureReason !== "unauthorized_sender") {
    return { ok: false, error: "Este registro não corresponde a um remetente não autorizado de comando interno." };
  }

  if (!trace.rawPhone) {
    // Trace predates the rawPhone column → no full number to recover. The flow
    // self-heals: the operator just needs to send /build again to generate a new
    // (authorizable) trace.
    return {
      ok: false,
      error: "Este registro é anterior à atualização e não guardou o número. Envie /build novamente no WhatsApp e tente outra vez.",
    };
  }

  const normalized = normalizeSenderPhone(trace.rawPhone);
  if (!normalized || normalized.length < 8) {
    return { ok: false, error: "Número do registro inválido." };
  }
  const masked = `${normalized.slice(0, 3)}***${normalized.slice(-4)}`;
  const variants = Array.from(phoneVariants(normalized));
  const name = (input.name ?? "").trim() || "Operador Build OS";
  const role = (input.role ?? "").trim().toLowerCase() || "owner";

  try {
    // Reactivate a matching sender (any 9th-digit variant) instead of duplicating.
    const existing = await prisma.buildAuthorizedSender.findFirst({
      where: { phone: { in: variants } },
      select: { id: true, isActive: true },
    });

    let action: "created" | "reactivated";
    if (existing) {
      await prisma.buildAuthorizedSender.update({
        where: { id: existing.id },
        data: { isActive: true, name, role },
      });
      action = "reactivated";
    } else {
      await prisma.buildAuthorizedSender.create({
        data: {
          phone: normalized,
          rawPhone: trace.rawPhone,
          name,
          role,
          isActive: true,
          allowedProjectIds: [] as Prisma.InputJsonValue,
        },
      });
      action = "created";
    }

    // Keep Build OS enabled so the next /build is actually processed. Never disables.
    const cfg = await getBuildOSConfigRow();
    if (!cfg) {
      await prisma.buildOSConfig.create({ data: { isEnabled: true } });
    } else if (!cfg.isEnabled) {
      await prisma.buildOSConfig.update({ where: { id: cfg.id }, data: { isEnabled: true } });
    }

    // Audit line — masked only, never the full number.
    try {
      console.log(
        `[BUILD_OS_ADMIN] ${JSON.stringify({
          event: "authorized_sender_via_trace",
          traceId: input.traceId,
          maskedPhone: masked,
          action,
          role,
        })}`,
      );
    } catch {
      /* logging must never throw */
    }

    return { ok: true, maskedPhone: masked, action };
  } catch {
    return { ok: false, error: "Não foi possível autorizar o remetente agora." };
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
