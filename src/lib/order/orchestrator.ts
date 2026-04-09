/**
 * Order Orchestrator — mandatory gate before every AI response.
 *
 * Enforces the required ordering flow so the AI can NEVER:
 *   - finalise an order with missing data
 *   - skip required steps (items → delivery type → address → name → payment)
 *   - assume information the customer has not yet provided
 *
 * Usage:
 *   const gate = validateOrderFlow(context);
 *   if (gate.block) return respondWith(gate.message);   // short-circuit AI
 *   // else: call runAITurn() normally
 *
 * The function is pure (no DB calls, no side effects) and runs in < 1 ms.
 */

import type { AIContext } from "@/lib/ai-context/types";

// ── Result type ───────────────────────────────────────────────────────────────

export type OrderFlowReason =
  | "NO_ITEMS"
  | "MISSING_DELIVERY"
  | "MISSING_ADDRESS"
  | "MISSING_NAME"
  | "MISSING_PAYMENT";

export interface OrderFlowBlocked {
  block:   true;
  reason:  OrderFlowReason;
  message: string;
}

export interface OrderFlowClear {
  block: false;
}

export type OrderFlowResult = OrderFlowBlocked | OrderFlowClear;

// ── Validator ─────────────────────────────────────────────────────────────────

export function validateOrderFlow(context: AIContext): OrderFlowResult {
  const { operational, customer } = context;

  const { cart, deliveryMethod, address, paymentMethod } = operational;

  // ── Required field checks ─────────────────────────────────────────────────

  const hasItems       = cart.length > 0;
  // Accept name from DB customer OR from the ordering-flow state (anonymous customers)
  const hasName        = !!(customer?.name?.trim() || operational.customerName?.trim());
  const hasDeliveryType = !!deliveryMethod;           // "delivery" | "pickup"
  const hasAddress     = !!address?.trim();
  const hasPayment     = !!paymentMethod?.trim();

  // ── Flow rules (strict ordering) ─────────────────────────────────────────

  // 1. Cart must have at least one item before anything else matters.
  if (!hasItems) {
    return {
      block:   true,
      reason:  "NO_ITEMS",
      message: "Vamos começar escolhendo seu pedido 👇",
    };
  }

  // 2. Delivery type must be resolved before we can ask for address or payment.
  if (!hasDeliveryType) {
    return {
      block:   true,
      reason:  "MISSING_DELIVERY",
      message: "Seu pedido é para entrega ou retirada?",
    };
  }

  // 3. Delivery requires an address; pickup does not.
  if (deliveryMethod === "delivery" && !hasAddress) {
    return {
      block:   true,
      reason:  "MISSING_ADDRESS",
      message: "Me informe seu endereço para entrega 👇",
    };
  }

  // 4. Customer name — needed to personalise the order confirmation.
  if (!hasName) {
    return {
      block:   true,
      reason:  "MISSING_NAME",
      message: "Como posso te chamar?",
    };
  }

  // 5. Payment method must be chosen before the order can be finalised.
  if (!hasPayment) {
    return {
      block:   true,
      reason:  "MISSING_PAYMENT",
      message: "Qual será a forma de pagamento?",
    };
  }

  // ── All checks passed — order is ready to confirm ─────────────────────────
  return { block: false };
}
