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
import { detectIntent } from "./parser";
import { WhatsAppOrderingSessionService } from "./WhatsAppOrderingSessionService";
import type { WaDetectedIntent } from "./types";

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

// ── Message-aware routing contract ───────────────────────────────────────────
//
// The config-level decision above answers "is this restaurant+phone eligible for
// Text Ordering?". It is NOT sufficient to route a live message, because the old
// WhatsApp Agent (Receptionist) is the DEFAULT HOST for the conversation. Text
// Ordering is an order-taking TOOL that must only engage when the customer is
// actually ordering.
//
// Contract:  route to Text Ordering ONLY when
//              routingEligible && (hasActiveSession || messageHasOrderIntent)
//
// Everything else — greetings ("Bom dia", "Oi"), cardápio/hours/address questions,
// general chat, unknown text — stays with the old WhatsApp Agent. This is what
// restores the menu/greeting reply that broke when RESTAURANT_WIDE was activated.

export type WaFinalHandler =
  | "TEXT_ORDERING"
  | "OLD_WHATSAPP_AGENT"
  | "HUMAN_HANDOFF"
  | "IGNORED";

/**
 * A mode that is allowed to send a live WhatsApp reply. DRY_RUN_ONLY is NOT —
 * in dry-run the engine observes the turn silently and never sends, so the old
 * WhatsApp Agent remains the effective responder for the customer.
 */
export function isReplyCapableMode(mode: WaOrderingMode | string): boolean {
  return mode === "ALLOWLIST_REPLY_ONLY" || mode === "ALLOWLIST_FULL_TEST";
}

/**
 * The handler the CUSTOMER actually hears from on the live path.
 *
 * `wouldRouteToTextOrdering` answers "does this message go to the engine?".
 * It is NOT the same as "does the customer get a Text Ordering reply?", because
 * a DRY_RUN_ONLY config routes the message to the engine but the engine stays
 * SILENT (canReply=false) → the webhook's textOrderingHandled stays false → the
 * old WhatsApp Agent falls back and answers. This helper collapses routing +
 * reply-capability into the single customer-facing outcome, and is shared by the
 * Evolution webhook trace and the admin diagnostic so they never disagree.
 */
export function effectiveLiveHandler(
  wouldRouteToTextOrdering: boolean,
  mode: WaOrderingMode | string,
): WaFinalHandler {
  return wouldRouteToTextOrdering && isReplyCapableMode(mode)
    ? "TEXT_ORDERING"
    : "OLD_WHATSAPP_AGENT";
}

export interface MessageAwareRouteInput {
  restaurantId:    string;
  phone:           string;
  messageText:     string;
  conversationId?: string | null;
}

export interface MessageAwareRouteDecision {
  /** The underlying config-level (restaurant+phone) eligibility decision. */
  config:                   WaRoutingDecision;
  /** config.shouldUseTextOrdering — restaurant+phone are eligible by config. */
  routingEligible:          boolean;
  /** An ACTIVE WhatsAppOrderingSession already exists for this restaurant+phone. */
  hasActiveSession:         boolean;
  detectedIntent:           WaDetectedIntent;
  /** True only for genuine ORDER_REQUEST intent. */
  messageHasOrderIntent:    boolean;
  /** The full contract result: eligible && (session || order intent). */
  wouldRouteToTextOrdering: boolean;
  /** Routing verdict (does the message reach the engine?). */
  finalHandler:             WaFinalHandler;
  /** True when the resolved mode permits a live reply (REPLY_ONLY / FULL_TEST). */
  replyCapable:             boolean;
  /**
   * Customer-facing outcome. Differs from finalHandler when the message routes to
   * the engine but the mode is DRY_RUN_ONLY: the engine observes silently and the
   * old WhatsApp Agent answers, so this is OLD_WHATSAPP_AGENT.
   */
  effectiveFinalHandler:    WaFinalHandler;
  declineReason:            string | null;
}

/**
 * The single message-aware routing decision shared by the live Evolution webhook
 * gate and the admin diagnostic. Pure read: never sends WhatsApp, never creates
 * an order, never creates Pix. Looks up the active session only when the config
 * is eligible (otherwise the verdict is "old agent" regardless of session state).
 */
export async function getMessageAwareRoutingDecision(
  input: MessageAwareRouteInput,
): Promise<MessageAwareRouteDecision> {
  const config = await getRoutingDecisionForRestaurant(input.restaurantId, input.phone);
  const routingEligible = config.shouldUseTextOrdering;

  const detectedIntent = detectIntent(input.messageText);
  const messageHasOrderIntent = detectedIntent === "ORDER_REQUEST";

  let hasActiveSession = false;
  if (routingEligible) {
    try {
      const session = await WhatsAppOrderingSessionService.findActiveSession({
        restaurantId:   input.restaurantId,
        phone:          input.phone,
        conversationId: input.conversationId ?? undefined,
      });
      hasActiveSession = session !== null;
    } catch {
      // A session-lookup failure must never silence the customer: fall back to the
      // old agent (hasActiveSession stays false) rather than guess "ordering".
      hasActiveSession = false;
    }
  }

  const wouldRouteToTextOrdering =
    routingEligible && (hasActiveSession || messageHasOrderIntent);

  let declineReason: string | null = null;
  if (!wouldRouteToTextOrdering) {
    if (!routingEligible) {
      declineReason = config.declineReason
        ?? "Configuração não elegível para Pedido por Texto.";
    } else {
      declineReason =
        "Mensagem sem intenção de pedido e sem sessão ativa — tratada pelo Agente WhatsApp (host).";
    }
  }

  const finalHandler: WaFinalHandler = wouldRouteToTextOrdering
    ? "TEXT_ORDERING"
    : "OLD_WHATSAPP_AGENT";

  // Reply-capability: even an eligible, order-intent message stays with the old
  // agent if the mode is DRY_RUN_ONLY (engine observes silently). This is the
  // single most common reason a routed order message still gets the old agent's
  // reply in production, so we surface it explicitly.
  const replyCapable = isReplyCapableMode(config.mode);
  const effectiveFinalHandler = effectiveLiveHandler(wouldRouteToTextOrdering, config.mode);

  if (wouldRouteToTextOrdering && !replyCapable) {
    declineReason =
      `Mensagem tem intenção de pedido e é elegível, mas o modo é ${config.mode} ` +
      `(sem resposta): o motor observa em silêncio e o Agente WhatsApp (host) responde. ` +
      `Troque para ALLOWLIST_REPLY_ONLY para o Pedido por Texto responder.`;
  }

  return {
    config,
    routingEligible,
    hasActiveSession,
    detectedIntent,
    messageHasOrderIntent,
    wouldRouteToTextOrdering,
    finalHandler,
    replyCapable,
    effectiveFinalHandler,
    declineReason,
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
