/**
 * startOrderFromMenu — bridges the WhatsApp menu's "Digitar pedido" option into
 * the Text Ordering engine.
 *
 * When the customer picks "Digitar pedido", we want the order engine to drive the
 * conversation. The engine normally engages on detected order-intent or an active
 * session; this opens an (empty) session up front so the very next message — even
 * one that doesn't "look like" an order — is handled by the engine.
 *
 * SAFE BY DEFAULT: only engages when Text Ordering is live AND reply-capable for
 * this restaurant+phone (ALLOWLIST_REPLY_ONLY / ALLOWLIST_FULL_TEST), using the
 * same authoritative routing decision the Evolution webhook applies. When the
 * engine is off (the default), it returns null and the caller keeps its current
 * behaviour. This helper NEVER creates an order or a Pix — only an empty session.
 */

import {
  getRoutingDecisionForRestaurant,
  isReplyCapableMode,
} from "./WhatsAppTextOrderingConfigService";
import { WhatsAppOrderingSessionService } from "./WhatsAppOrderingSessionService";

export interface StartOrderFromMenuInput {
  restaurantId:    string;
  phone:           string;
  conversationId?: string | null;
  customerId?:     string | null;
}

/** Opening prompt shown when the engine takes over from the menu. */
export const ORDER_FROM_MENU_PROMPT =
  "Perfeito! 📝 Pode mandar seu pedido — me diga os itens e as quantidades.\n" +
  "Ex: *2 yakisoba e 1 coca*\n\n0. menu";

/**
 * Opens an order session and returns the opening prompt when the engine is live
 * for this restaurant+phone; otherwise returns null (caller falls back to its
 * own default reply, e.g. the canned "type your order" message).
 */
export async function startOrderFromMenu(
  input: StartOrderFromMenuInput,
): Promise<string | null> {
  if (!input.phone) return null;

  const decision = await getRoutingDecisionForRestaurant(input.restaurantId, input.phone);
  if (!decision.shouldUseTextOrdering || !isReplyCapableMode(decision.mode)) {
    return null;
  }

  // Reuse a session already in flight; otherwise open a fresh one so the next
  // message routes to the engine (one active session per restaurant+phone).
  const existing = await WhatsAppOrderingSessionService.findActiveSession({
    restaurantId:   input.restaurantId,
    phone:          input.phone,
    conversationId: input.conversationId ?? undefined,
  });
  if (!existing) {
    await WhatsAppOrderingSessionService.createSession({
      restaurantId:   input.restaurantId,
      phone:          input.phone,
      conversationId: input.conversationId ?? null,
      customerId:     input.customerId ?? null,
      mode:           decision.mode,
      source:         "menu_digitar_pedido",
    });
  }

  return ORDER_FROM_MENU_PROMPT;
}
