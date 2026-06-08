/**
 * Feature flag + controlled-rollout config for WhatsApp Text Ordering.
 *
 * W2–W6: the engine is fully built but released safely. Three controlled modes:
 *
 *   DRY_RUN_ONLY        — default. No real WhatsApp send, no real order, no real
 *                         Pix. Admin simulator only. Production webhook unaffected.
 *   ALLOWLIST_REPLY_ONLY— may send a reply ONLY to allowlisted restaurant+phone.
 *                         Never creates an order or Pix.
 *   ALLOWLIST_FULL_TEST — may create a real order + Pix, ONLY for allowlisted
 *                         restaurant+phone, with customer confirmation.
 *
 * Two scope modes (WHATSAPP_TEXT_ORDERING_SCOPE):
 *   PHONE_ALLOWLIST  — (default) gate requires BOTH restaurant AND phone on allowlists.
 *   RESTAURANT_WIDE  — gate requires only restaurant allowlist; routes ALL customer
 *                      phones for that restaurant. Use for full restaurant rollout.
 *
 * Kill switch (WHATSAPP_TEXT_ORDERING_PAUSED=true):
 *   Instantly pauses live routing for ALL restaurants without clearing other flags.
 *   ENABLED stays true so diagnostics/dry-run still work. Unset or set to "false"
 *   to resume. Takes effect on next inbound message — no deploy required.
 *
 * Env vars (all optional; safe defaults):
 *   WHATSAPP_TEXT_ORDERING_ENABLED=false
 *   WHATSAPP_TEXT_ORDERING_MODE=DRY_RUN_ONLY
 *   WHATSAPP_TEXT_ORDERING_SCOPE=PHONE_ALLOWLIST
 *   WHATSAPP_TEXT_ORDERING_ALLOWLIST_RESTAURANTS=rest-id-1,rest-id-2
 *   WHATSAPP_TEXT_ORDERING_ALLOWLIST_PHONES=+5511999990000,+5511888887777
 *   WHATSAPP_TEXT_ORDERING_PAUSED=false
 */

export type WaOrderingMode =
  | "DRY_RUN_ONLY"
  | "ALLOWLIST_REPLY_ONLY"
  | "ALLOWLIST_FULL_TEST";

export type WaOrderingScope =
  | "PHONE_ALLOWLIST"
  | "RESTAURANT_WIDE";

const VALID_MODES: WaOrderingMode[] = [
  "DRY_RUN_ONLY",
  "ALLOWLIST_REPLY_ONLY",
  "ALLOWLIST_FULL_TEST",
];

const VALID_SCOPES: WaOrderingScope[] = ["PHONE_ALLOWLIST", "RESTAURANT_WIDE"];

/** Whether the master switch is on. Defaults to false. */
export function isWaTextOrderingEnabled(restaurantId?: string): boolean {
  if (process.env.WHATSAPP_TEXT_ORDERING_ENABLED !== "true") return false;

  const allowlist = parseList(process.env.WHATSAPP_TEXT_ORDERING_ALLOWLIST_RESTAURANTS);
  if (allowlist.length === 0) return true; // flag on, no restriction (dry-run convenience)
  if (!restaurantId) return false;
  return allowlist.includes(restaurantId);
}

/** The configured runtime mode. Defaults to the safest: DRY_RUN_ONLY. */
export function getWaTextOrderingMode(): WaOrderingMode {
  const raw = (process.env.WHATSAPP_TEXT_ORDERING_MODE ?? "").trim().toUpperCase();
  return (VALID_MODES as string[]).includes(raw) ? (raw as WaOrderingMode) : "DRY_RUN_ONLY";
}

/**
 * The configured scope.
 *   PHONE_ALLOWLIST (default) — both restaurant AND phone must be allowlisted.
 *   RESTAURANT_WIDE           — all phones for an allowlisted restaurant are routed.
 */
export function getWaTextOrderingScope(): WaOrderingScope {
  const raw = (process.env.WHATSAPP_TEXT_ORDERING_SCOPE ?? "").trim().toUpperCase();
  return (VALID_SCOPES as string[]).includes(raw) ? (raw as WaOrderingScope) : "PHONE_ALLOWLIST";
}

/**
 * Kill switch — pauses live routing instantly without clearing ENABLED.
 * Set WHATSAPP_TEXT_ORDERING_PAUSED=true to pause; unset or false to resume.
 */
export function isWaTextOrderingPaused(): boolean {
  return process.env.WHATSAPP_TEXT_ORDERING_PAUSED === "true";
}

/** True only if the master switch is on AND this restaurant is allowlisted. */
export function isRestaurantAllowlisted(restaurantId: string): boolean {
  if (process.env.WHATSAPP_TEXT_ORDERING_ENABLED !== "true") return false;
  const allowlist = parseList(process.env.WHATSAPP_TEXT_ORDERING_ALLOWLIST_RESTAURANTS);
  return allowlist.includes(restaurantId);
}

/** True only if the master switch is on AND this phone is allowlisted. */
export function isPhoneAllowlisted(phone: string): boolean {
  if (process.env.WHATSAPP_TEXT_ORDERING_ENABLED !== "true") return false;
  const allowlist = parseList(process.env.WHATSAPP_TEXT_ORDERING_ALLOWLIST_PHONES);
  const normalized = normalizePhone(phone);
  return allowlist.map(normalizePhone).includes(normalized);
}

export interface WaSideEffectPermissions {
  mode:          WaOrderingMode;
  canReply:      boolean; // may a real WhatsApp message be sent?
  canCreateOrder: boolean; // may a real Order be created?
  canCreatePix:  boolean; // may a real Pix be generated?
  reasons:       string[]; // why each capability is on/off
}

/**
 * Computes the exact side-effect permissions for a given restaurant+phone.
 * This is the single gate every runtime side effect must consult.
 */
export function resolveSideEffectPermissions(
  restaurantId: string,
  phone:        string,
): WaSideEffectPermissions {
  const mode    = getWaTextOrderingMode();
  const scope   = getWaTextOrderingScope();
  const paused  = isWaTextOrderingPaused();
  const reasons: string[] = [];

  const enabled        = process.env.WHATSAPP_TEXT_ORDERING_ENABLED === "true";
  const restOk         = isRestaurantAllowlisted(restaurantId);
  const phoneOk        = scope === "RESTAURANT_WIDE" ? true : isPhoneAllowlisted(phone);
  const fullyAllowed   = enabled && restOk && phoneOk && !paused;

  if (!enabled)  reasons.push("master switch off (WHATSAPP_TEXT_ORDERING_ENABLED!=true)");
  if (paused)    reasons.push("paused (WHATSAPP_TEXT_ORDERING_PAUSED=true)");
  if (!restOk)   reasons.push("restaurant not allowlisted");
  if (scope === "PHONE_ALLOWLIST" && !phoneOk) reasons.push("phone not allowlisted");

  let canReply = false;
  let canCreateOrder = false;
  let canCreatePix = false;

  if (fullyAllowed) {
    if (mode === "ALLOWLIST_REPLY_ONLY") {
      canReply = true;
      reasons.push("mode=ALLOWLIST_REPLY_ONLY → reply allowed, no order/Pix");
    } else if (mode === "ALLOWLIST_FULL_TEST") {
      canReply = true;
      canCreateOrder = true;
      canCreatePix = true;
      reasons.push("mode=ALLOWLIST_FULL_TEST → reply + order + Pix allowed");
    } else {
      reasons.push("mode=DRY_RUN_ONLY → no side effects");
    }
  } else {
    reasons.push("not fully allowlisted → DRY-RUN enforced (no side effects)");
  }

  return { mode, canReply, canCreateOrder, canCreatePix, reasons };
}

// ── Live routing decision (single source of truth for the webhook gate) ───────

export interface WaRoutingDecision {
  masterEnabled:         boolean;
  paused:                boolean;
  mode:                  WaOrderingMode;
  scope:                 WaOrderingScope;
  /** Restaurant explicitly present in the restaurant allowlist. */
  restaurantAllowlisted: boolean;
  /** Master flag on AND (restaurant allowlist empty OR restaurant included). */
  enabledForRestaurant:  boolean;
  phoneAllowlisted:      boolean;
  /** Final verdict — mirrors the live webhook gate exactly. */
  shouldUseTextOrdering: boolean;
  declineReason:         string | null;
}

/**
 * Computes the exact live-routing decision the Evolution webhook applies.
 * Single source of truth shared by webhook handler and admin diagnostics.
 *
 * Gate logic:
 *   PHONE_ALLOWLIST (default): enabled(restaurant) && !paused && phone allowlisted
 *   RESTAURANT_WIDE:           enabled(restaurant) && !paused  (all phones)
 */
export function getRoutingDecision(restaurantId: string, phone: string): WaRoutingDecision {
  const masterEnabled         = process.env.WHATSAPP_TEXT_ORDERING_ENABLED === "true";
  const paused                = isWaTextOrderingPaused();
  const mode                  = getWaTextOrderingMode();
  const scope                 = getWaTextOrderingScope();
  const restaurantAllowlisted = isRestaurantAllowlisted(restaurantId);
  const enabledForRestaurant  = isWaTextOrderingEnabled(restaurantId);
  const phoneAllowlisted      = isPhoneAllowlisted(phone);

  let shouldUseTextOrdering: boolean;
  if (scope === "RESTAURANT_WIDE") {
    shouldUseTextOrdering = enabledForRestaurant && !paused;
  } else {
    shouldUseTextOrdering = enabledForRestaurant && phoneAllowlisted && !paused;
  }

  let declineReason: string | null = null;
  if (!shouldUseTextOrdering) {
    if (!masterEnabled)              declineReason = "master switch off (WHATSAPP_TEXT_ORDERING_ENABLED!=true)";
    else if (paused)                 declineReason = "paused (WHATSAPP_TEXT_ORDERING_PAUSED=true)";
    else if (!enabledForRestaurant)  declineReason = "restaurant not allowlisted (set WHATSAPP_TEXT_ORDERING_ALLOWLIST_RESTAURANTS to the restaurant ID)";
    else if (scope === "PHONE_ALLOWLIST" && !phoneAllowlisted)
                                     declineReason = "phone not allowlisted (add the E.164 number to WHATSAPP_TEXT_ORDERING_ALLOWLIST_PHONES)";
    else                             declineReason = "unknown";
  }

  return {
    masterEnabled, paused, mode, scope,
    restaurantAllowlisted, enabledForRestaurant,
    phoneAllowlisted, shouldUseTextOrdering, declineReason,
  };
}

/** Masks a phone for safe logging: keeps country/DDD + last 2 digits. */
export function maskPhone(phone: string): string {
  const d = phone.replace(/\D/g, "");
  if (d.length <= 4) return "***";
  return `${d.slice(0, 4)}***${d.slice(-2)}`;
}

// ── helpers ─────────────────────────────────────────────────────────────────

function parseList(raw: string | undefined): string[] {
  return (raw ?? "").split(",").map(s => s.trim()).filter(Boolean);
}

/**
 * Canonicalises a Brazilian phone so all common formats collapse to one key.
 * These must all match each other:
 *   +5511999990000 · 5511999990000 · 11999990000 · +551199990000 · 1199990000
 *
 * Strategy: strip non-digits → drop a leading 55 country code (12/13-digit
 * numbers) → normalise the mobile 9th digit so "with 9" and "without 9" forms
 * resolve to the same canonical national number (DDD + 9 + 8 digits).
 *
 * This is the same tolerance the customer-identity phoneCandidates() helper uses;
 * without it an allowlist entry typed in one format silently fails to match the
 * E.164 JID Evolution delivers, and the message falls through to the old agent.
 */
function normalizePhone(phone: string): string {
  let digits = phone.replace(/\D/g, "");
  if (digits.length === 0) return "";

  // Drop the BR country code when present on a 12/13-digit number.
  if ((digits.length === 12 || digits.length === 13) && digits.startsWith("55")) {
    digits = digits.slice(2);
  }

  // National form is DDD(2) + local. Insert the mobile 9th digit when missing so
  // 10-digit (DDD + 8) and 11-digit (DDD + 9 + 8) forms canonicalise together.
  if (digits.length === 10) {
    return `${digits.slice(0, 2)}9${digits.slice(2)}`;
  }

  return digits;
}
