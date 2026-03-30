/**
 * Scenario: Recovery Test
 *
 * Persona: confused
 * User starts checkout, goes back to browse to add a drink,
 * then re-finalizes. On the second pass, drink gate is skipped
 * (drink now in cart) but dessert gate fires once more; user
 * refuses it and proceeds to checkout.
 *
 * Validates:
 *   - go_back_to_browse resets upsell state
 *   - Second finalize re-evaluates gates with updated cart
 *   - Cart items added after back-to-browse are included
 */

import type { QAScenario } from "../types";

export const recovery: QAScenario = {
  id: "recovery",
  name: "Recovery — Back to Menu Then Re-Checkout",
  persona: "confused",
  severity: "high",
  description:
    "User enters checkout, goes back to browse, adds a drink, " +
    "then finalizes again. Second pass: drink gate skipped (drink in cart), " +
    "dessert gate fires once more, user refuses, then proceeds to checkout.",
  actions: [
    { type: "add_first_from_category", categoryType: "main" },
    // First pass: skip both upsells to reach checkout
    { type: "finalize" },
    { type: "refuse_upsell" },  // drink upsell → dessert upsell
    { type: "refuse_upsell" },  // dessert upsell → DELIVERY_TYPE
    { type: "assert_stage", expected: "DELIVERY_TYPE" },
    // Go back to browse — upsell state resets
    { type: "go_back_to_browse" },
    { type: "assert_stage", expected: "BROWSE" },
    { type: "assert_checkout_visible", expected: false },
    // Add a drink while back in browse
    { type: "add_first_from_category", categoryType: "drink" },
    // Second pass: drink gate skips (drink in cart); dessert gate fires
    { type: "finalize" },
    { type: "assert_stage", expected: "BROWSE" },
    // Refuse dessert → proceeds to checkout
    { type: "refuse_upsell" },
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
      id: "drink-gate-skipped-on-second-pass",
      description: "Drink was in cart on second pass so drink gate was not re-offered",
      severity: "high",
      validate: (s) => {
        const hasDrink = s.cart.some((c) => c.qty > 0);
        return {
          passed: hasDrink && s.deliveryMethod !== null,
          detail: `cart items: ${s.cart.length}, deliveryMethod: ${s.deliveryMethod}`,
        };
      },
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
