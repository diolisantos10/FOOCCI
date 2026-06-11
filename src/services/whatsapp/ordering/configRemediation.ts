/**
 * Text-order CONFIG remediation — SAFETY-ONLY corrective writes.
 *
 * The only write path that a cron-secret caller (no ADMIN_SECRET in CI) may use,
 * and it can ONLY reduce exposure:
 *   - forces scope=PHONE_ALLOWLIST (never RESTAURANT_WIDE)
 *   - clamps mode to at most ALLOWLIST_REPLY_ONLY (never FULL_TEST)
 *   - preserves the existing allowlist (optionally appends one team phone)
 *   - keeps the feature enabled + unpaused so the team can keep validating
 *
 * It NEVER opens RESTAURANT_WIDE, NEVER enables FULL_TEST, NEVER sends a WhatsApp
 * message, creates an order, or generates a Pix. Reaching for higher exposure is
 * impossible through this endpoint by construction — those values are not wired.
 */

import { prisma } from "@/lib/prisma";
import {
  getRestaurantConfig,
  upsertRestaurantConfig,
  resolveWaConfig,
} from "./WhatsAppTextOrderingConfigService";
import { isPhoneInList } from "@/lib/wa-text-ordering-flag";
import { runConfigDiagnostic, type ConfigDiagnosticResult } from "./configDiagnostic";

export interface SecureScopeInput {
  restaurantId?: string;
  restaurantSlug?: string;
  /** Optional team phone to ensure is present in the allowlist (E.164). */
  addPhone?: string;
}

interface ConfigSnapshot {
  enabled: boolean;
  mode: string;
  scope: string;
  paused: boolean;
  allowlistCount: number;
}

export interface SecureScopeResult {
  ok: boolean;
  restaurantId: string | null;
  restaurantName: string | null;
  before: ConfigSnapshot | null;
  after: ConfigSnapshot | null;
  changed: boolean;
  actions: string[];
  /** Re-run diagnostic AFTER the correction, so the caller sees the safe state. */
  diagnostic: ConfigDiagnosticResult | null;
  runtimeTouched: false;
}

const snap = (c: { enabled: boolean; mode: string; scope: string; paused: boolean; allowlistedPhones: string[] }): ConfigSnapshot => ({
  enabled: c.enabled, mode: c.mode, scope: c.scope, paused: c.paused, allowlistCount: c.allowlistedPhones.length,
});

/**
 * Applies the safe corrective config. Idempotent: re-running on an already-safe
 * config makes no write and reports changed=false.
 */
export async function secureScope(input: SecureScopeInput): Promise<SecureScopeResult> {
  let restaurantId = input.restaurantId ?? null;
  let restaurantName: string | null = null;
  if (!restaurantId && input.restaurantSlug) {
    const r = await prisma.restaurant.findFirst({ where: { slug: input.restaurantSlug }, select: { id: true, name: true } }).catch(() => null);
    restaurantId = r?.id ?? null;
    restaurantName = r?.name ?? null;
  } else if (restaurantId) {
    const r = await prisma.restaurant.findUnique({ where: { id: restaurantId }, select: { name: true } }).catch(() => null);
    restaurantName = r?.name ?? null;
  }

  if (!restaurantId) {
    return {
      ok: false, restaurantId: null, restaurantName, before: null, after: null,
      changed: false, actions: ["restaurante não encontrado"], diagnostic: null, runtimeTouched: false,
    };
  }

  const current = await resolveWaConfig(restaurantId);
  const before: ConfigSnapshot = snap(current);
  const actions: string[] = [];

  // ── Build the SAFE target (clamp-only) ──────────────────────────────────────
  const allowlist = [...current.allowlistedPhones];
  if (input.addPhone && input.addPhone.trim() && !isPhoneInList(input.addPhone, allowlist)) {
    allowlist.push(input.addPhone.trim());
    actions.push("telefone do time adicionado à allowlist");
  }

  // scope: always PHONE_ALLOWLIST. mode: clamped to REPLY_ONLY (never FULL_TEST).
  const targetScope = "PHONE_ALLOWLIST" as const;
  const targetMode = "ALLOWLIST_REPLY_ONLY" as const;

  if (current.scope !== targetScope) actions.push(`scope ${current.scope} → PHONE_ALLOWLIST (corta exposição de cliente real)`);
  if (current.mode === "ALLOWLIST_FULL_TEST") actions.push("mode ALLOWLIST_FULL_TEST → ALLOWLIST_REPLY_ONLY (rebaixa para seguro)");
  else if (current.mode !== "ALLOWLIST_REPLY_ONLY") actions.push(`mode ${current.mode} → ALLOWLIST_REPLY_ONLY`);
  if (!current.enabled) actions.push("enabled → true (mantém o time validando)");
  if (current.paused) actions.push("paused → false");

  const needsWrite =
    current.scope !== targetScope ||
    current.mode !== targetMode ||
    !current.enabled ||
    current.paused ||
    allowlist.length !== current.allowlistedPhones.length;

  if (needsWrite) {
    await upsertRestaurantConfig(restaurantId, {
      enabled: true,
      mode: targetMode,
      scope: targetScope,
      paused: false,
      allowlistedPhones: allowlist,
    });
  } else {
    actions.push("já estava seguro — nenhuma alteração necessária");
  }

  const after = await getRestaurantConfig(restaurantId);
  const diagnostic = await runConfigDiagnostic({ restaurantId, phone: input.addPhone });

  return {
    ok: true,
    restaurantId,
    restaurantName,
    before,
    after: after ? snap(after) : null,
    changed: needsWrite,
    actions,
    diagnostic,
    runtimeTouched: false,
  };
}
