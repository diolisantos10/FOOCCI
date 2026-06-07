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
 * Even with the master switch on, the engine is NEVER active for a customer
 * unless BOTH the restaurant and the phone are on their allowlists (except the
 * empty-allowlist convenience for DRY_RUN_ONLY, which has no side effects).
 *
 * Env vars (all optional; safe defaults):
 *   WHATSAPP_TEXT_ORDERING_ENABLED=false
 *   WHATSAPP_TEXT_ORDERING_MODE=DRY_RUN_ONLY
 *   WHATSAPP_TEXT_ORDERING_ALLOWLIST_RESTAURANTS=rest-id-1,rest-id-2
 *   WHATSAPP_TEXT_ORDERING_ALLOWLIST_PHONES=+5511999990000,+5511888887777
 */

export type WaOrderingMode =
  | "DRY_RUN_ONLY"
  | "ALLOWLIST_REPLY_ONLY"
  | "ALLOWLIST_FULL_TEST";

const VALID_MODES: WaOrderingMode[] = [
  "DRY_RUN_ONLY",
  "ALLOWLIST_REPLY_ONLY",
  "ALLOWLIST_FULL_TEST",
];

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
  const reasons: string[] = [];

  const enabled        = process.env.WHATSAPP_TEXT_ORDERING_ENABLED === "true";
  const restOk         = isRestaurantAllowlisted(restaurantId);
  const phoneOk        = isPhoneAllowlisted(phone);
  const fullyAllowed   = enabled && restOk && phoneOk;

  if (!enabled)  reasons.push("master switch off (WHATSAPP_TEXT_ORDERING_ENABLED!=true)");
  if (!restOk)   reasons.push("restaurant not allowlisted");
  if (!phoneOk)  reasons.push("phone not allowlisted");

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

// ── helpers ─────────────────────────────────────────────────────────────────

function parseList(raw: string | undefined): string[] {
  return (raw ?? "").split(",").map(s => s.trim()).filter(Boolean);
}

function normalizePhone(phone: string): string {
  return phone.replace(/\D/g, "");
}
