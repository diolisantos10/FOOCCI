/**
 * Scenario: Finalize Early
 *
 * Persona: impatient
 * User adds only a main item and immediately clicks finalize.
 * System must trigger drink upsell, then dessert upsell.
 * User accepts drink, refuses dessert, then completes via pickup.
 *
 * Validates: upsell sequence (null → drink → dessert → checkout).
 */

import type { QAScenario } from "../types";

export const finalizeEarly: QAScenario = {
  id: "finalize-early",
  name: "Finalize Early — Upsell Sequence",
  persona: "impatient",
  severity: "critical",
  description:
    "User clicks finalize with only a main item. " +
    "System offers drink, user accepts. System offers dessert, user refuses. " +
    "Order completes via pickup.",
  actions: [
    { type: "add_first_from_category", categoryType: "main" },
    // Finalize with no drink and no dessert → drink upsell
    { type: "finalize" },
    { type: "assert_stage", expected: "BROWSE" },
    { type: "assert_upsell", expected: "drink" },
    // Accept drink: adds drink item and triggers finalize again
    // → upsellOffered was "drink", now checks dessert → triggers dessert upsell
    { type: "accept_upsell" },
    { type: "assert_stage", expected: "BROWSE" },
    { type: "assert_upsell", expected: "dessert" },
    // Refuse dessert: finalize again with upsellOffered="dessert" → checkout
    { type: "refuse_upsell" },
    { type: "assert_stage", expected: "DELIVERY_TYPE" },
    { type: "select_delivery", method: "pickup" },
    { type: "assert_stage", expected: "ASK_NAME" },
    { type: "input_name", name: "Maria" },
    { type: "assert_stage", expected: "PAYMENT" },
    { type: "select_payment", method: "cartao" },
    { type: "assert_stage", expected: "REVIEW_ORDER" },
    { type: "confirm_order" },
    { type: "assert_stage", expected: "DONE" },
  ],
  checkpoints: [
    {
      id: "upsell-drink-triggered",
      description: "Drink upsell is triggered when only main item is in cart",
      severity: "critical",
      validate: (s) => ({
        passed: s.stage === "DONE",
        detail: `Final stage: ${s.stage} (if DONE, upsell sequence completed correctly)`,
      }),
    },
    {
      id: "drink-in-cart",
      description: "Drink was added to cart after accepting upsell",
      severity: "high",
      validate: (s) => {
        const total = s.cart.reduce((acc, i) => acc + i.qty, 0);
        return {
          passed: total >= 2,
          detail: `Cart has ${total} total items`,
        };
      },
    },
    {
      id: "pickup-no-address",
      description: "Pickup flow does not collect address",
      severity: "high",
      validate: (s) => ({
        passed:
          s.deliveryMethod === "pickup" &&
          s.address.street === "" &&
          s.address.number === "",
        detail: `deliveryMethod: ${s.deliveryMethod}, street: "${s.address.street}"`,
      }),
    },
  ],
};
