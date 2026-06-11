/**
 * Text-order CONFIG diagnostic — read-only readiness check for the controlled
 * test (REPLY_ONLY → FULL_TEST). Reports the resolved config, payment settings,
 * sample products and saved-address availability, plus an honest readiness
 * verdict and the rollback steps. NEVER changes anything: no config writes, no
 * allowlist additions, no mode switches, no sends.
 */

import { prisma } from "@/lib/prisma";
import { resolveWaConfig, getRestaurantConfig } from "./WhatsAppTextOrderingConfigService";
import { isGlobalKillSwitchEngaged, isGlobalPauseEngaged, isPhoneInList } from "@/lib/wa-text-ordering-flag";

export interface ConfigDiagnosticInput {
  restaurantId?: string;
  restaurantSlug?: string;
  /** Optional phone to check against the allowlist (reported as boolean only). */
  phone?: string;
}

export interface ConfigDiagnosticResult {
  ok: boolean;
  restaurantId: string | null;
  restaurantName: string | null;
  featureEnabled: boolean;
  globalKillSwitch: boolean;
  globalPause: boolean;
  paused: boolean;
  mode: string;
  scope: string;
  restaurantWideApproved: boolean;
  allowlistCount: number;
  phoneInAllowlist: boolean | null;
  paymentOptionsEnabled: boolean;
  pixEnabled: boolean;
  cashEnabled: boolean;
  cardEnabled: boolean;
  sampleProductsAvailable: number;
  savedAddressAvailableForTestCustomer: boolean | null;
  riskLevel: "LOW" | "MEDIUM" | "HIGH";
  canRunReplyOnly: boolean;
  canRunFullTest: boolean;
  missingForReplyOnly: string[];
  missingForFullTest: string[];
  rollbackSteps: string[];
  runtimeTouched: false;
}

/**
 * Approval marker for RESTAURANT_WIDE. A scope=RESTAURANT_WIDE config exposes the
 * flow to EVERY real customer, so it is only considered "approved for production"
 * when this marker is present in the config `notes` (a deliberate, auditable
 * human sign-off — e.g. after a Brain Director change request). Without it, a live
 * RESTAURANT_WIDE config is treated as accidental exposure → riskLevel=HIGH.
 */
export const RESTAURANT_WIDE_APPROVAL_MARKER = "[RW_APPROVED]";

export function isRestaurantWideApproved(notes: string | null | undefined): boolean {
  return typeof notes === "string" && notes.includes(RESTAURANT_WIDE_APPROVAL_MARKER);
}

export const ROLLBACK_STEPS = [
  "PATCH /api/admin/diagnostics/whatsapp-text-ordering/config { paused: true } — pausa imediata (~30s).",
  "Ou { mode: \"DRY_RUN_ONLY\" } — engine continua, mas não responde nem cria nada.",
  "Ou { allowlistedPhones: [] } — ninguém entra no fluxo.",
  "Emergência global: WHATSAPP_TEXT_ORDERING_PAUSED=true (env) ou WHATSAPP_TEXT_ORDERING_ENABLED=false.",
  "O recepcionista normal do WhatsApp segue funcionando em todos os casos.",
];

/** Pure readiness logic (testable without DB). */
export function assessReadiness(input: {
  globalKillSwitch: boolean;
  globalPause: boolean;
  enabled: boolean;
  paused: boolean;
  mode: string;
  scope: string;
  allowlistCount: number;
  paymentOptionsEnabled: boolean;
  sampleProductsAvailable: number;
  /** RESTAURANT_WIDE only counts as intentional when a human approval marker is set. */
  scopeApproved?: boolean;
}): { canRunReplyOnly: boolean; canRunFullTest: boolean; missingForReplyOnly: string[]; missingForFullTest: string[]; riskLevel: "LOW" | "MEDIUM" | "HIGH" } {
  const missingForReplyOnly: string[] = [];
  if (input.globalKillSwitch) missingForReplyOnly.push("ligar WHATSAPP_TEXT_ORDERING_ENABLED=true (env global)");
  if (input.globalPause) missingForReplyOnly.push("desligar WHATSAPP_TEXT_ORDERING_PAUSED (env global)");
  if (!input.enabled) missingForReplyOnly.push("habilitar a feature para o restaurante (enabled=true)");
  if (input.paused) missingForReplyOnly.push("despausar o restaurante (paused=false)");
  if (input.scope !== "PHONE_ALLOWLIST") {
    missingForReplyOnly.push(
      `trocar scope para PHONE_ALLOWLIST (atual: ${input.scope}) — RESTAURANT_WIDE deixa QUALQUER cliente real entrar no fluxo`,
    );
  }
  if (input.allowlistCount === 0) missingForReplyOnly.push("adicionar o telefone do Diego/time à allowlist");
  if (input.mode !== "ALLOWLIST_REPLY_ONLY" && input.mode !== "ALLOWLIST_FULL_TEST") {
    missingForReplyOnly.push(`trocar mode para ALLOWLIST_REPLY_ONLY (atual: ${input.mode})`);
  }
  if (!input.paymentOptionsEnabled) missingForReplyOnly.push("configurar PaymentSettings (nenhuma forma ligada)");
  if (input.sampleProductsAvailable === 0) missingForReplyOnly.push("cadastrar/ativar produtos no cardápio");

  const canRunReplyOnly = missingForReplyOnly.length === 0;

  const missingForFullTest = [...missingForReplyOnly.filter((m) => !m.includes("ALLOWLIST_REPLY_ONLY"))];
  if (input.mode !== "ALLOWLIST_FULL_TEST") {
    missingForFullTest.push(`trocar mode para ALLOWLIST_FULL_TEST (atual: ${input.mode}) — só após REPLY_ONLY aprovado`);
  }
  const canRunFullTest = missingForFullTest.length === 0;

  // Risk for the CONTROLLED test:
  //   HIGH   — a real customer can enter the flow right now: scope=RESTAURANT_WIDE
  //            with the feature live (enabled, not paused, reply-capable mode) AND
  //            no human approval marker → accidental exposure.
  //   MEDIUM — intentional broad exposure (approved RESTAURANT_WIDE) or FULL_TEST
  //            mode (real order/Pix, allowlist-gated).
  //   LOW    — everything gated to the allowlist, reply-only or off.
  const featureLive =
    input.enabled && !input.paused && !input.globalKillSwitch && !input.globalPause &&
    (input.mode === "ALLOWLIST_REPLY_ONLY" || input.mode === "ALLOWLIST_FULL_TEST");
  const wideExposed = input.scope !== "PHONE_ALLOWLIST" && featureLive;
  const riskLevel: "LOW" | "MEDIUM" | "HIGH" =
    wideExposed && !input.scopeApproved ? "HIGH"
    : wideExposed && input.scopeApproved ? "MEDIUM"
    : input.mode === "ALLOWLIST_FULL_TEST" ? "MEDIUM"
    : "LOW";

  return { canRunReplyOnly, canRunFullTest, missingForReplyOnly, missingForFullTest, riskLevel };
}

export async function runConfigDiagnostic(input: ConfigDiagnosticInput): Promise<ConfigDiagnosticResult> {
  // Resolve the restaurant (by id or slug) — read-only.
  let restaurantId = input.restaurantId ?? null;
  let restaurantName: string | null = null;
  if (!restaurantId && input.restaurantSlug) {
    const r = await prisma.restaurant
      .findFirst({ where: { slug: input.restaurantSlug }, select: { id: true, name: true } })
      .catch(() => null);
    restaurantId = r?.id ?? null;
    restaurantName = r?.name ?? null;
  } else if (restaurantId) {
    const r = await prisma.restaurant.findUnique({ where: { id: restaurantId }, select: { name: true } }).catch(() => null);
    restaurantName = r?.name ?? null;
  }

  const empty: ConfigDiagnosticResult = {
    ok: false, restaurantId, restaurantName,
    featureEnabled: false, globalKillSwitch: isGlobalKillSwitchEngaged(), globalPause: isGlobalPauseEngaged(),
    paused: false, mode: "?", scope: "?", restaurantWideApproved: false, allowlistCount: 0, phoneInAllowlist: null,
    paymentOptionsEnabled: false, pixEnabled: false, cashEnabled: false, cardEnabled: false,
    sampleProductsAvailable: 0, savedAddressAvailableForTestCustomer: null,
    riskLevel: "LOW", canRunReplyOnly: false, canRunFullTest: false,
    missingForReplyOnly: ["restaurante não encontrado"], missingForFullTest: ["restaurante não encontrado"],
    rollbackSteps: ROLLBACK_STEPS, runtimeTouched: false,
  };
  if (!restaurantId) return empty;

  const [config, rawConfig, payment, sampleProductsAvailable] = await Promise.all([
    resolveWaConfig(restaurantId),
    getRestaurantConfig(restaurantId).catch(() => null),
    prisma.paymentSettings
      .findUnique({ where: { restaurantId }, select: { acceptPix: true, acceptCash: true, acceptCard: true } })
      .catch(() => null),
    prisma.menuItem.count({ where: { category: { restaurantId }, isAvailable: true } }).catch(() => 0),
  ]);
  const restaurantWideApproved = isRestaurantWideApproved(rawConfig?.notes ?? null);

  // Saved-address availability for the (optional) test phone — boolean only, no PII.
  let savedAddressAvailableForTestCustomer: boolean | null = null;
  if (input.phone) {
    const customer = await prisma.customer
      .findFirst({ where: { restaurantId, phone: { contains: input.phone.replace(/\D/g, "").slice(-8) } }, select: { id: true } })
      .catch(() => null);
    if (customer) {
      const order = await prisma.order
        .findFirst({ where: { customerId: customer.id, deliveryAddressId: { not: null } }, select: { id: true } })
        .catch(() => null);
      savedAddressAvailableForTestCustomer = !!order;
    } else {
      savedAddressAvailableForTestCustomer = false;
    }
  }

  const pixEnabled = payment?.acceptPix ?? true;
  const cashEnabled = payment?.acceptCash ?? true;
  const cardEnabled = payment?.acceptCard ?? true;
  const paymentOptionsEnabled = pixEnabled || cashEnabled || cardEnabled;
  const allowlistCount = Array.isArray(config.allowlistedPhones) ? config.allowlistedPhones.length : 0;
  const phoneInAllowlist = input.phone ? isPhoneInList(input.phone, config.allowlistedPhones) : null;

  const readiness = assessReadiness({
    globalKillSwitch: isGlobalKillSwitchEngaged(),
    globalPause: isGlobalPauseEngaged(),
    enabled: config.enabled,
    paused: config.paused,
    mode: config.mode,
    scope: config.scope,
    allowlistCount,
    paymentOptionsEnabled,
    sampleProductsAvailable,
    scopeApproved: restaurantWideApproved,
  });

  return {
    ok: true,
    restaurantId,
    restaurantName,
    featureEnabled: config.enabled,
    globalKillSwitch: isGlobalKillSwitchEngaged(),
    globalPause: isGlobalPauseEngaged(),
    paused: config.paused,
    mode: config.mode,
    scope: config.scope,
    restaurantWideApproved,
    allowlistCount,
    phoneInAllowlist,
    paymentOptionsEnabled,
    pixEnabled,
    cashEnabled,
    cardEnabled,
    sampleProductsAvailable,
    savedAddressAvailableForTestCustomer,
    ...readiness,
    rollbackSteps: ROLLBACK_STEPS,
    runtimeTouched: false,
  };
}
