/**
 * Feature flag for WhatsApp Text Ordering engine.
 *
 * W0/W1: disabled by default. Even if this file is deployed, production
 * WhatsApp webhook routing is NOT changed (see webhooks/evolution/route.ts).
 *
 * To enable for controlled testing after restaurant closes:
 *   WHATSAPP_TEXT_ORDERING_ENABLED=true
 *   WHATSAPP_TEXT_ORDERING_ALLOWLIST=restaurant-id-1,restaurant-id-2  (optional)
 *
 * NEVER enable without explicit opt-in per restaurant.
 */

export function isWaTextOrderingEnabled(restaurantId?: string): boolean {
  // Master switch — must be explicitly "true"
  if (process.env.WHATSAPP_TEXT_ORDERING_ENABLED !== "true") return false;

  // Optional per-restaurant allowlist for controlled rollout
  const raw = process.env.WHATSAPP_TEXT_ORDERING_ALLOWLIST ?? "";
  const allowlist = raw.split(",").map(s => s.trim()).filter(Boolean);

  if (allowlist.length === 0) return true; // flag on, no restriction
  if (!restaurantId) return false;         // flag on, list present, but no id given
  return allowlist.includes(restaurantId);
}
