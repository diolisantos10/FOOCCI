/**
 * WhatsAppTextOrderingConfigService
 *
 * Single source of truth for *live* WhatsApp Text Ordering activation, resolving
 * the effective config from (in priority order):
 *
 *   1. Global env kill switch — WHATSAPP_TEXT_ORDERING_ENABLED=false forces OFF
 *      for every restaurant, no matter what the DB says.
 *   2. Global env pause       — WHATSAPP_TEXT_ORDERING_PAUSED=true pauses everyone.
 *   3. Per-restaurant DB config (WhatsAppTextOrderingConfig) — the founder-facing
 *      activation panel writes here. enabled / mode / scope / phones / paused.
 *   4. Env fallback — when NO DB row exists, the legacy env-var config is used,
 *      preserving backward compatibility for any restaurant already configured
 *      via Railway.
 *
 * This service never sends WhatsApp, never creates orders, and never creates Pix.
 * It only reads/writes the activation config and computes the routing decision.
 */

import { prisma } from "@/lib/prisma";
import {
  getRoutingDecision,
  isRestaurantAllowlisted,
  isPhoneInList,
  isGlobalKillSwitchEngaged,
  isGlobalPauseEngaged,
  type WaOrderingMode,
  type WaOrderingScope,
  type WaRoutingDecision,
} from "@/lib/wa-text-ordering-flag";

const VALID_MODES: WaOrderingMode[] = ["DRY_RUN_ONLY", "ALLOWLIST_REPLY_ONLY", "ALLOWLIST_FULL_TEST"];
const VALID_SCOPES: WaOrderingScope[] = ["PHONE_ALLOWLIST", "RESTAURANT_WIDE"];

export interface WaTextOrderingConfig {
  restaurantId:      string;
  enabled:           boolean;
  mode:              WaOrderingMode;
  scope:             WaOrderingScope;
  allowlistedPhones: string[];
  paused:            boolean;
  notes:             string | null;
  updatedAt:         Date | null;
}

export interface WaPatchInput {
  enabled?:           boolean;
  mode?:              WaOrderingMode;
  scope?:             WaOrderingScope;
  allowlistedPhones?: string[];
  paused?:            boolean;
  notes?:             string | null;
}

// ── DB read ───────────────────────────────────────────────────────────────────

/** Loads the persisted per-restaurant config, or null when none exists. */
export async function getRestaurantConfig(restaurantId: string): Promise<WaTextOrderingConfig | null> {
  const row = await prisma.whatsAppTextOrderingConfig.findUnique({
    where: { restaurantId },
  });
  if (!row) return null;
  return rowToConfig(row);
}

function rowToConfig(row: {
  restaurantId: string;
  enabled: boolean;
  mode: string;
  scope: string;
  allowlistedPhones: unknown;
  paused: boolean;
  notes: string | null;
  updatedAt: Date;
}): WaTextOrderingConfig {
  return {
    restaurantId:      row.restaurantId,
    enabled:           row.enabled,
    mode:              normalizeMode(row.mode),
    scope:             normalizeScope(row.scope),
    allowlistedPhones: toPhoneArray(row.allowlistedPhones),
    paused:            row.paused,
    notes:             row.notes,
    updatedAt:         row.updatedAt,
  };
}

// ── DB write ────────────────────────────────────────────────────────────────

/**
 * Upserts the per-restaurant config. Pure data write — no WhatsApp send, no
 * order, no Pix, no campaign. Only provided fields are changed.
 */
export async function upsertRestaurantConfig(
  restaurantId: string,
  patch: WaPatchInput,
): Promise<WaTextOrderingConfig> {
  const data: Record<string, unknown> = {};
  if (patch.enabled !== undefined)           data.enabled = patch.enabled;
  if (patch.mode !== undefined)              data.mode = normalizeMode(patch.mode);
  if (patch.scope !== undefined)             data.scope = normalizeScope(patch.scope);
  if (patch.allowlistedPhones !== undefined) data.allowlistedPhones = sanitizePhones(patch.allowlistedPhones);
  if (patch.paused !== undefined)            data.paused = patch.paused;
  if (patch.notes !== undefined)             data.notes = patch.notes;

  const row = await prisma.whatsAppTextOrderingConfig.upsert({
    where:  { restaurantId },
    create: {
      restaurantId,
      enabled:           patch.enabled ?? false,
      mode:              normalizeMode(patch.mode ?? "DRY_RUN_ONLY"),
      scope:             normalizeScope(patch.scope ?? "PHONE_ALLOWLIST"),
      allowlistedPhones: sanitizePhones(patch.allowlistedPhones ?? []),
      paused:            patch.paused ?? false,
      notes:             patch.notes ?? null,
    },
    update: data,
  });
  return rowToConfig(row);
}

// ── Effective config resolution ───────────────────────────────────────────────

export interface ResolvedWaConfig {
  source:            "db" | "env";
  enabled:           boolean;
  mode:              WaOrderingMode;
  scope:             WaOrderingScope;
  allowlistedPhones: string[];
  paused:            boolean;
}

/**
 * Resolves the effective config for a restaurant. DB row wins when present;
 * otherwise the env-based config is used for backward compatibility.
 * Global env kill switch / pause are applied at decision time, not here.
 */
export async function resolveWaConfig(restaurantId: string): Promise<ResolvedWaConfig> {
  const db = await getRestaurantConfig(restaurantId);
  if (db) {
    return {
      source:            "db",
      enabled:           db.enabled,
      mode:              db.mode,
      scope:             db.scope,
      allowlistedPhones: db.allowlistedPhones,
      paused:            db.paused,
    };
  }
  // Env fallback — mirror the legacy env-only decision via the sync helper.
  const envDecision = getRoutingDecision(restaurantId, "");
  return {
    source:            "env",
    enabled:           envDecision.enabledForRestaurant,
    mode:              envDecision.mode,
    scope:             envDecision.scope,
    allowlistedPhones: parseEnvPhones(),
    paused:            envDecision.paused,
  };
}

/**
 * The authoritative live-routing decision used by the Evolution webhook and the
 * admin diagnostics. DB-aware. Applies global kill switch / pause overrides.
 */
export async function getRoutingDecisionForRestaurant(
  restaurantId: string,
  phone:        string,
): Promise<WaRoutingDecision> {
  const globalKillSwitch = isGlobalKillSwitchEngaged();
  const globalPaused     = isGlobalPauseEngaged();

  const resolved = await resolveWaConfig(restaurantId);

  // When falling back to env config, the legacy sync decision already encodes the
  // exact env semantics (including allowlists + global flags). Reuse it verbatim so
  // backward compatibility is byte-for-byte, then tag the source.
  if (resolved.source === "env") {
    const env = getRoutingDecision(restaurantId, phone);
    return {
      ...env,
      source:           "env",
      dbConfigPresent:  false,
      globalKillSwitch,
    };
  }

  // DB-driven decision.
  const phoneAllowlisted = resolved.scope === "RESTAURANT_WIDE"
    ? true
    : isPhoneInList(phone, resolved.allowlistedPhones);
  const effectivePaused  = resolved.paused || globalPaused;
  const enabledForRestaurant = resolved.enabled && !globalKillSwitch;
  const shouldUseTextOrdering = enabledForRestaurant && !effectivePaused && phoneAllowlisted;

  let declineReason: string | null = null;
  if (!shouldUseTextOrdering) {
    if (globalKillSwitch) {
      declineReason = "Bloqueado pelo kill switch global no Railway (WHATSAPP_TEXT_ORDERING_ENABLED=false)";
    } else if (!resolved.enabled) {
      declineReason = "Pedido por Texto desativado para este restaurante (ative no painel de controle)";
    } else if (effectivePaused) {
      declineReason = globalPaused
        ? "Pausado globalmente (WHATSAPP_TEXT_ORDERING_PAUSED=true no Railway)"
        : "Pausado para este restaurante (retome no painel de controle)";
    } else if (resolved.scope === "PHONE_ALLOWLIST" && !phoneAllowlisted) {
      declineReason = "Telefone não está na lista liberada (adicione no painel ou troque o escopo para RESTAURANT_WIDE)";
    } else {
      declineReason = "unknown";
    }
  }

  return {
    masterEnabled:         !globalKillSwitch,
    paused:                effectivePaused,
    mode:                  resolved.mode,
    scope:                 resolved.scope,
    restaurantAllowlisted: true, // a DB config row means this restaurant is configured
    enabledForRestaurant,
    phoneAllowlisted,
    shouldUseTextOrdering,
    declineReason,
    source:                "db",
    dbConfigPresent:       true,
    globalKillSwitch,
  };
}

// ── helpers ─────────────────────────────────────────────────────────────────

function normalizeMode(raw: string): WaOrderingMode {
  const up = (raw ?? "").trim().toUpperCase();
  return (VALID_MODES as string[]).includes(up) ? (up as WaOrderingMode) : "DRY_RUN_ONLY";
}

function normalizeScope(raw: string): WaOrderingScope {
  const up = (raw ?? "").trim().toUpperCase();
  return (VALID_SCOPES as string[]).includes(up) ? (up as WaOrderingScope) : "PHONE_ALLOWLIST";
}

function toPhoneArray(raw: unknown): string[] {
  if (Array.isArray(raw)) return raw.filter((p): p is string => typeof p === "string" && p.trim().length > 0);
  return [];
}

function sanitizePhones(phones: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const p of phones) {
    const trimmed = (p ?? "").trim();
    if (!trimmed) continue;
    if (seen.has(trimmed)) continue;
    seen.add(trimmed);
    out.push(trimmed);
  }
  return out;
}

function parseEnvPhones(): string[] {
  return (process.env.WHATSAPP_TEXT_ORDERING_ALLOWLIST_PHONES ?? "")
    .split(",").map(s => s.trim()).filter(Boolean);
}

export const VALID_WA_MODES = VALID_MODES;
export const VALID_WA_SCOPES = VALID_SCOPES;
