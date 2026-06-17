/**
 * Production governance for the WhatsApp Text Order agent.
 *
 * Single place for the three governed transitions:
 *   • promoteToFullTest  — REPLY_ONLY → ALLOWLIST_FULL_TEST (allowlist-bound),
 *     ONLY when every gate passes and the operator confirms explicitly.
 *   • rollbackTextOrder  — 30-second kill: paused + DRY_RUN_ONLY + PHONE_ALLOWLIST
 *     (history/config/allowlist preserved; receptionist unaffected).
 *   • requestRestaurantWide — NEVER opens production; runs the gates and creates a
 *     Brain Director Change Request (PENDING_APPROVAL, runtimeImpact=PRODUCTION ⇒
 *     CRITICAL + quality gate). Opening wide stays a separate human decision.
 *
 * Every function here only changes CONFIG: no WhatsApp send, no Evolution, no
 * order, no Pix — runtimeTouched is false by construction.
 */

import { prisma } from "@/lib/prisma";
import {
  getRestaurantConfig,
  upsertRestaurantConfig,
  resolveWaConfig,
} from "./WhatsAppTextOrderingConfigService";
import { runConfigDiagnostic } from "./configDiagnostic";
import { runTextOrderSimulator } from "./WhatsAppTextOrderSimulatorService";
import { runWhatsAppTextOrderDiagnostic } from "@/services/whatsapp/brain/WhatsAppTextOrderDiagnostic";
import { createChangeRequest } from "@/services/brain/director/PersistentBrainDirectorService";

export const PROMOTE_CONFIRM = "PROMOTE_WHATSAPP_TEXT_ORDER_FULL_TEST";
export const ROLLBACK_CONFIRM = "ROLLBACK_WHATSAPP_TEXT_ORDER";
export const REQUEST_WIDE_CONFIRM = "REQUEST_WHATSAPP_TEXT_ORDER_RESTAURANT_WIDE";
export const OPEN_WIDE_CONFIRM = "OPEN_WHATSAPP_TEXT_ORDER_RESTAURANT_WIDE";

export interface GovernanceGates {
  scopeIsPhoneAllowlist: boolean;
  allowlistNotEmpty: boolean;
  featureEnabledNotPaused: boolean;
  configRiskNotHigh: boolean;
  flowDiagnosticPass: boolean; // hermetic flow PASS + p0=0
  cockpitPass: boolean; // simulator PASS/WARNING + p0=0 (P0 is the blocker)
  allPass: boolean;
  notes: string[];
}

async function resolveRestaurantId(input: { restaurantId?: string; restaurantSlug?: string }): Promise<string | null> {
  if (input.restaurantId) return input.restaurantId;
  if (!input.restaurantSlug) return null;
  const r = await prisma.restaurant.findFirst({ where: { slug: input.restaurantSlug }, select: { id: true } }).catch(() => null);
  return r?.id ?? null;
}

/** Runs every promotion gate. Read-only — diagnostics are hermetic/read-only. */
export async function runPromotionGates(restaurantId: string): Promise<GovernanceGates> {
  const [config, flow, cockpit] = await Promise.all([
    runConfigDiagnostic({ restaurantId }),
    runWhatsAppTextOrderDiagnostic(),
    runTextOrderSimulator("REPLY_ONLY"),
  ]);

  const notes: string[] = [];
  const scopeIsPhoneAllowlist = config.scope === "PHONE_ALLOWLIST";
  if (!scopeIsPhoneAllowlist) notes.push(`scope atual ${config.scope} — exigido PHONE_ALLOWLIST`);
  const allowlistNotEmpty = config.allowlistCount > 0;
  if (!allowlistNotEmpty) notes.push("allowlist vazia — adicione o telefone do time");
  const featureEnabledNotPaused = config.featureEnabled && !config.paused && !config.globalKillSwitch && !config.globalPause;
  if (!featureEnabledNotPaused) notes.push("feature desligada/pausada");
  const configRiskNotHigh = config.riskLevel !== "HIGH";
  if (!configRiskNotHigh) notes.push("riskLevel=HIGH — corrija a exposição antes");
  const flowDiagnosticPass = flow.status === "PASS" && flow.p0 === 0;
  if (!flowDiagnosticPass) notes.push(`flow diagnostic ${flow.status} (p0=${flow.p0})`);
  const cockpitPass = cockpit.status !== "FAIL" && cockpit.p0 === 0;
  if (!cockpitPass) notes.push(`cockpit ${cockpit.status} (p0=${cockpit.p0})`);

  const allPass =
    scopeIsPhoneAllowlist && allowlistNotEmpty && featureEnabledNotPaused &&
    configRiskNotHigh && flowDiagnosticPass && cockpitPass;

  return { scopeIsPhoneAllowlist, allowlistNotEmpty, featureEnabledNotPaused, configRiskNotHigh, flowDiagnosticPass, cockpitPass, allPass, notes };
}

export interface PromoteResult {
  success: boolean;
  previousMode: string;
  newMode: string;
  scope: string;
  gates: GovernanceGates | null;
  error: string | null;
  runtimeTouched: false;
}

/**
 * Promotes REPLY_ONLY → ALLOWLIST_FULL_TEST (allowlist-bound). Config-only:
 * sends nothing, creates nothing. Refuses without the exact confirm string or
 * with any failed gate. Forces scope=PHONE_ALLOWLIST and appends an audit note.
 */
export async function promoteToFullTest(input: {
  restaurantId?: string;
  restaurantSlug?: string;
  confirm: string;
}): Promise<PromoteResult> {
  const fail = (error: string, gates: GovernanceGates | null = null, prev = "?"): PromoteResult =>
    ({ success: false, previousMode: prev, newMode: prev, scope: "PHONE_ALLOWLIST", gates, error, runtimeTouched: false });

  if (input.confirm !== PROMOTE_CONFIRM) {
    return fail(`Confirmação inválida — envie confirm: "${PROMOTE_CONFIRM}".`);
  }
  const restaurantId = await resolveRestaurantId(input);
  if (!restaurantId) return fail("Restaurante não encontrado.");

  const current = await resolveWaConfig(restaurantId);
  const gates = await runPromotionGates(restaurantId);
  if (!gates.allPass) {
    return fail(`Gates reprovados: ${gates.notes.join("; ")}`, gates, current.mode);
  }

  const existing = await getRestaurantConfig(restaurantId);
  const audit = `[AUDIT ${new Date().toISOString()}] promote FULL_TEST (gates PASS, confirm explícito)`;
  await upsertRestaurantConfig(restaurantId, {
    mode: "ALLOWLIST_FULL_TEST",
    scope: "PHONE_ALLOWLIST", // never widened here
    paused: false,
    enabled: true,
    notes: existing?.notes ? `${existing.notes}\n${audit}`.slice(-2000) : audit,
  });

  return {
    success: true,
    previousMode: current.mode,
    newMode: "ALLOWLIST_FULL_TEST",
    scope: "PHONE_ALLOWLIST",
    gates,
    error: null,
    runtimeTouched: false,
  };
}

// ── Open to final customers (RESTAURANT_WIDE) ────────────────────────────────

const ROLLBACK_INFO = {
  endpoint: "/api/admin/whatsapp/text-order/rollback",
  cronEndpoint: "/api/cron/whatsapp/text-order-rollback",
  confirm: ROLLBACK_CONFIRM,
  appliesTo: { paused: true, mode: "DRY_RUN_ONLY", scope: "PHONE_ALLOWLIST" },
} as const;

interface ConfigSnapshot { mode: string; scope: string; enabled: boolean; paused: boolean; allowlistCount: number }

export interface OpenWideResult {
  success: boolean;
  previousConfig: ConfigSnapshot | null;
  newConfig: ConfigSnapshot | null;
  gates: GovernanceGates | null;
  changeRequestId: string | null;
  rollback: typeof ROLLBACK_INFO;
  error: string | null;
  runtimeTouched: false;
}

/**
 * Opens the WhatsApp Text Order to FINAL CUSTOMERS: scope → RESTAURANT_WIDE,
 * mode stays ALLOWLIST_FULL_TEST (the existing mode that creates a real order
 * and a real Pix ONLY after the customer's final confirmation), enabled=true,
 * paused=false.
 *
 * Hard gates (no bypass): exact confirm string; explicit acknowledgments of real
 * customers/orders/Pix; current mode already ALLOWLIST_FULL_TEST (the validated
 * stage); and every promotion gate PASS (config risk not HIGH, flow PASS p0=0,
 * cockpit p0=0). Config-only — sends nothing, creates no order, generates no Pix
 * (runtimeTouched=false). Records a Brain Director audit trail and returns the
 * one-step rollback. Refuses (no change) if any gate or acknowledgment is missing.
 */
export async function openRestaurantWide(input: {
  restaurantId?: string;
  restaurantSlug?: string;
  confirm: string;
  acknowledgeRealCustomers?: boolean;
  acknowledgeRealOrders?: boolean;
  acknowledgeRealPix?: boolean;
}): Promise<OpenWideResult> {
  const fail = (error: string, gates: GovernanceGates | null = null, prev: ConfigSnapshot | null = null): OpenWideResult =>
    ({ success: false, previousConfig: prev, newConfig: null, gates, changeRequestId: null, rollback: ROLLBACK_INFO, error, runtimeTouched: false });

  if (input.confirm !== OPEN_WIDE_CONFIRM) {
    return fail(`Confirmação inválida — envie confirm: "${OPEN_WIDE_CONFIRM}".`);
  }
  if (!(input.acknowledgeRealCustomers === true && input.acknowledgeRealOrders === true && input.acknowledgeRealPix === true)) {
    return fail("Faltam reconhecimentos explícitos: acknowledgeRealCustomers, acknowledgeRealOrders e acknowledgeRealPix devem ser true.");
  }
  const restaurantId = await resolveRestaurantId(input);
  if (!restaurantId) return fail("Restaurante não encontrado.");

  const current = await resolveWaConfig(restaurantId);
  const prev: ConfigSnapshot = {
    mode: current.mode, scope: current.scope, enabled: current.enabled, paused: current.paused, allowlistCount: current.allowlistedPhones.length,
  };

  // Must already be on the validated FULL_TEST stage before opening to everyone.
  if (current.mode !== "ALLOWLIST_FULL_TEST") {
    return fail(`mode atual ${current.mode} — valide FULL_TEST controlado antes de abrir para clientes finais.`, null, prev);
  }

  // Pre-open gates run while still PHONE_ALLOWLIST (config risk MEDIUM, flow/cockpit p0=0).
  const gates = await runPromotionGates(restaurantId);
  if (!gates.allPass) {
    return fail(`Gates reprovados (não abrir): ${gates.notes.join("; ")}`, gates, prev);
  }

  // Governance audit trail (best-effort — never blocks the open).
  let changeRequestId: string | null = null;
  try {
    const cr = await createChangeRequest({
      businessId: restaurantId,
      businessType: "RESTAURANT",
      requestedByType: "CEO",
      requestedById: "admin",
      target: "AGENT_POLICY",
      summary: "Open WhatsApp Text Order to final customers for Sushi Cazza",
      rationale:
        "Abertura para clientes finais por decisão explícita do CEO (confirm + acknowledge real " +
        "customers/orders/Pix). Gates PASS (flow + cockpit p0=0). Pedido/Pix reais SOMENTE após " +
        "confirmação final do cliente. Rollback de 30s disponível (paused + DRY_RUN_ONLY).",
      proposedChange: {
        restaurantId,
        from: { mode: current.mode, scope: current.scope },
        to: { mode: "ALLOWLIST_FULL_TEST", scope: "RESTAURANT_WIDE" },
        rollback: ROLLBACK_INFO.appliesTo,
      },
      riskLevel: "CRITICAL",
      runtimeImpact: "PRODUCTION",
      metadata: { executed: true, acknowledgements: { realCustomers: true, realOrders: true, realPix: true }, gates },
    });
    changeRequestId = cr?.id ?? null;
  } catch {
    changeRequestId = null;
  }

  const existing = await getRestaurantConfig(restaurantId);
  const audit = `[RW_OPENED ${new Date().toISOString()}] scope→RESTAURANT_WIDE (confirm + ack real customers/orders/Pix, gates PASS${changeRequestId ? `, CR:${changeRequestId}` : ""})`;
  await upsertRestaurantConfig(restaurantId, {
    scope: "RESTAURANT_WIDE",
    mode: "ALLOWLIST_FULL_TEST", // real order/Pix ONLY after the customer's final confirmation
    enabled: true,
    paused: false,
    notes: existing?.notes ? `${existing.notes}\n${audit}`.slice(-2000) : audit,
  });

  return {
    success: true,
    previousConfig: prev,
    // Reflects exactly what was just written (avoids a stale re-read).
    newConfig: { mode: "ALLOWLIST_FULL_TEST", scope: "RESTAURANT_WIDE", enabled: true, paused: false, allowlistCount: prev.allowlistCount },
    gates,
    changeRequestId,
    rollback: ROLLBACK_INFO,
    error: null,
    runtimeTouched: false,
  };
}

export interface RollbackResult {
  success: boolean;
  before: { mode: string; scope: string; paused: boolean; enabled: boolean; allowlistCount: number } | null;
  after: { mode: string; scope: string; paused: boolean; enabled: boolean; allowlistCount: number } | null;
  error: string | null;
  runtimeTouched: false;
}

/**
 * 30-second rollback: paused=true + DRY_RUN_ONLY + PHONE_ALLOWLIST. Keeps the
 * allowlist, the config row and ALL history; the normal receptionist keeps
 * answering. Blocks FULL_TEST and RESTAURANT_WIDE by construction.
 */
export async function rollbackTextOrder(input: {
  restaurantId?: string;
  restaurantSlug?: string;
  confirm: string;
}): Promise<RollbackResult> {
  if (input.confirm !== ROLLBACK_CONFIRM) {
    return { success: false, before: null, after: null, error: `Confirmação inválida — envie confirm: "${ROLLBACK_CONFIRM}".`, runtimeTouched: false };
  }
  const restaurantId = await resolveRestaurantId(input);
  if (!restaurantId) return { success: false, before: null, after: null, error: "Restaurante não encontrado.", runtimeTouched: false };

  const current = await resolveWaConfig(restaurantId);
  const before = { mode: current.mode, scope: current.scope, paused: current.paused, enabled: current.enabled, allowlistCount: current.allowlistedPhones.length };

  const existing = await getRestaurantConfig(restaurantId);
  const audit = `[AUDIT ${new Date().toISOString()}] ROLLBACK → paused + DRY_RUN_ONLY`;
  await upsertRestaurantConfig(restaurantId, {
    paused: true,
    mode: "DRY_RUN_ONLY",
    scope: "PHONE_ALLOWLIST",
    notes: existing?.notes ? `${existing.notes}\n${audit}`.slice(-2000) : audit,
  });

  const updated = await resolveWaConfig(restaurantId);
  return {
    success: true,
    before,
    after: { mode: updated.mode, scope: updated.scope, paused: updated.paused, enabled: updated.enabled, allowlistCount: updated.allowlistedPhones.length },
    error: null,
    runtimeTouched: false,
  };
}

export interface RequestWideResult {
  success: boolean;
  changeRequestId: string | null;
  changeRequestStatus: string | null;
  scopeChanged: false; // NEVER changes scope — governance only
  gates: GovernanceGates | null;
  error: string | null;
  runtimeTouched: false;
}

/**
 * Requests RESTAURANT_WIDE via the Brain Director: runs the gates and creates a
 * PENDING_APPROVAL change request (runtimeImpact=PRODUCTION ⇒ CRITICAL + quality
 * gate). NEVER opens production itself — the scope stays exactly as it is.
 */
export async function requestRestaurantWide(input: {
  restaurantId?: string;
  restaurantSlug?: string;
  confirm: string;
}): Promise<RequestWideResult> {
  const fail = (error: string, gates: GovernanceGates | null = null): RequestWideResult =>
    ({ success: false, changeRequestId: null, changeRequestStatus: null, scopeChanged: false, gates, error, runtimeTouched: false });

  if (input.confirm !== REQUEST_WIDE_CONFIRM) {
    return fail(`Confirmação inválida — envie confirm: "${REQUEST_WIDE_CONFIRM}".`);
  }
  const restaurantId = await resolveRestaurantId(input);
  if (!restaurantId) return fail("Restaurante não encontrado.");

  const gates = await runPromotionGates(restaurantId);
  const current = await resolveWaConfig(restaurantId);
  const cockpit = await runTextOrderSimulator("REPLY_ONLY");

  // FULL_TEST must at least be the current validated stage before asking for wide.
  if (current.mode !== "ALLOWLIST_FULL_TEST") {
    return fail(`mode atual ${current.mode} — valide FULL_TEST controlado antes de pedir produção geral.`, gates);
  }
  if (!gates.allPass) {
    return fail(`Gates reprovados: ${gates.notes.join("; ")}`, gates);
  }

  const cr = await createChangeRequest({
    businessId: restaurantId,
    businessType: "RESTAURANT",
    requestedByType: "CEO", // human-initiated admin action (confirm string)
    requestedById: "admin",
    target: "AGENT_POLICY",
    summary: "Abrir WhatsApp Text Order para RESTAURANT_WIDE (produção geral)",
    rationale:
      "Solicitação de produção geral do anotador de pedido por WhatsApp. " +
      `Gates: scope=PHONE_ALLOWLIST ok, allowlist>0 ok, flow PASS, cockpit ${cockpit.status} (p0=${cockpit.p0}). ` +
      "Rollback de 30s disponível (paused + DRY_RUN_ONLY). Abertura só após aprovação humana + quality gate; " +
      "aplicar exige marcar [RW_APPROVED] no notes e trocar o scope deliberadamente no admin.",
    proposedChange: {
      restaurantId,
      from: { mode: current.mode, scope: current.scope },
      to: { mode: "ALLOWLIST_FULL_TEST", scope: "RESTAURANT_WIDE" },
      rollback: { paused: true, mode: "DRY_RUN_ONLY", scope: "PHONE_ALLOWLIST" },
    },
    riskLevel: "CRITICAL",
    runtimeImpact: "PRODUCTION",
    metadata: {
      cockpitReport: { status: cockpit.status, passed: cockpit.passed, total: cockpit.total, p0: cockpit.p0, safety: cockpit.safety },
      gates,
    },
  });

  // Audit pointer in the config notes (no scope change!).
  const existing = await getRestaurantConfig(restaurantId);
  const audit = `[RW_REQUESTED:${cr.id} ${new Date().toISOString()}]`;
  await upsertRestaurantConfig(restaurantId, {
    notes: existing?.notes ? `${existing.notes}\n${audit}`.slice(-2000) : audit,
  });

  return {
    success: true,
    changeRequestId: cr.id,
    changeRequestStatus: cr.status,
    scopeChanged: false,
    gates,
    error: null,
    runtimeTouched: false,
  };
}
