/**
 * Scenario: Recovery Test
 *
 * Persona: confused
 * User starts checkout, then goes back to the menu to add more items,
 * then re-finalizes. The second finalize must fast-track (skip upsell)
 * because finalizeAttemptCount was already incremented.
 *
 * Validates:
 *   - go_back_to_browse preserves finalizeAttemptCount
 *   - Second finalize fast-tracks to DELIVERY_TYPE
 *   - Cart items added after back-to-browse are included
 */

import type { QAScenario } from "../types";

export const recovery: QAScenario = {
  id: "recovery",
  name: "Recovery — Back to Menu Then Re-Checkout",
  persona: "confused",
  severity: "high",
  description:
    "User enters checkout, goes back to browse, adds more items, " +
    "then finalizes again. Second finalize must fast-track.",
  actions: [
    { type: "add_first_from_category", categoryType: "main" },
    // Skip both upsells to reach checkout
    { type: "finalize" },
    { type: "refuse_upsell" },  // drink → dessert upsell
    { type: "refuse_upsell" },  // dessert → DELIVERY_TYPE
    { type: "assert_stage", expected: "DELIVERY_TYPE" },
    // Go back to browse — finalizeAttemptCount stays at 1
    { type: "go_back_to_browse" },
    { type: "assert_stage", expected: "BROWSE" },
    { type: "assert_checkout_visible", expected: false },
    // Add a drink while back in browse
    { type: "add_first_from_category", categoryType: "drink" },
    // Re-finalize — finalizeAttemptCount=1 → fast-track directly to DELIVERY_TYPE
    { type: "finalize" },
    { type: "assert_stage", expected: "DELIVERY_TYPE" },
    // Complete delivery checkout
    { type: "select_delivery", method: "delivery" },
    { type: "assert_stage", expected: "ADDRESS_INPUT" },
    { type: "input_address", line1: "Rua B, 50", line2: "Jardim América" },
    { type: "assert_stage", expected: "ADDRESS_CONFIRM" },
    { type: "confirm_address" },
    { type: "assert_stage", expected: "ASK_NAME" },
    { type: "input_name", name: "Recovery User" },
    { type: "select_payment", method: "dinheiro" },
    { type: "confirm_order" },
    { type: "assert_stage", expected: "DONE" },
  ],
  checkpoints: [
    {
      id: "order-done",
      description: "Order reaches DONE after recovery",
      severity: "critical",
      validate: (s) => ({
        passed: s.stage === "DONE",
        detail: `Final stage: ${s.stage}`,
      }),
    },
    {
      id: "fast-track-worked",
      description: "finalizeAttemptCount > 1 after second finalize (fast-track used)",
      severity: "high",
      validate: (s) => ({
        passed: s.finalizeAttemptCount > 1,
        detail: `finalizeAttemptCount: ${s.finalizeAttemptCount}`,
      }),
    },
    {
      id: "drink-in-final-cart",
      description: "Drink added after back-to-browse is in final cart",
      severity: "high",
      validate: (s) => {
        const hasMain  = s.cart.some((c) => c.name === "Pizza Calabresa");
        const hasDrink = s.cart.length >= 2;
        return {
          passed: hasMain && hasDrink,
          detail: `cart items: ${s.cart.map((c) => c.name).join(", ")}`,
        };
      },
    },
    {
      id: "delivery-method-set",
      description: "Delivery method was set after recovery",
      severity: "medium",
      validate: (s) => ({
        passed: s.deliveryMethod === "delivery",
        detail: `deliveryMethod: ${s.deliveryMethod}`,
      }),
    },
  ],
};
