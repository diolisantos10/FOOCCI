/**
 * Scenario: Refuse Drink
 *
 * Persona: resistant
 * User adds only a main item. Refuses drink upsell by clicking
 * finalize again (without adding a drink). System must then offer
 * dessert. User refuses dessert too. System must proceed to checkout.
 *
 * Validates: double-refuse path (drink → dessert → checkout).
 * The system must NOT loop after two refusals.
 */

import type { QAScenario } from "../types";

export const refuseDrink: QAScenario = {
  id: "refuse-drink",
  name: "Refuse Drink — Double Upsell Skip",
  persona: "resistant",
  severity: "high",
  description:
    "User refuses both upsells by re-clicking finalize. " +
    "System must proceed to checkout after the dessert upsell is also refused.",
  actions: [
    { type: "add_first_from_category", categoryType: "main" },
    // First finalize → drink upsell
    { type: "finalize" },
    { type: "assert_stage", expected: "BROWSE" },
    { type: "assert_upsell", expected: "drink" },
    // Refuse drink (finalize again without adding) → dessert upsell
    { type: "refuse_upsell" },
    { type: "assert_stage", expected: "BROWSE" },
    { type: "assert_upsell", expected: "dessert" },
    // Refuse dessert → checkout (no more upsells)
    { type: "refuse_upsell" },
    { type: "assert_stage", expected: "DELIVERY_TYPE" },
    { type: "select_delivery", method: "pickup" },
    { type: "input_name", name: "Carlos" },
    { type: "select_payment", method: "dinheiro" },
    { type: "confirm_order" },
    { type: "assert_stage", expected: "DONE" },
  ],
  checkpoints: [
    {
      id: "checkout-after-double-refuse",
      description: "System reaches DONE after refusing both upsells",
      severity: "critical",
      validate: (s) => ({
        passed: s.stage === "DONE",
        detail: `Final stage: ${s.stage}`,
      }),
    },
    {
      id: "no-drink-in-cart",
      description: "Cart does not contain a drink (user refused)",
      severity: "high",
      validate: (s) => {
        // Check that no drink items were added (cart should have only main)
        const totalQty = s.cart.reduce((acc, i) => acc + i.qty, 0);
        return {
          passed: totalQty === 1,
          detail: `Total cart qty: ${totalQty} (expected 1 — only the main item)`,
        };
      },
    },
    {
      id: "finalize-count-correct",
      description: "Drink refusal was recorded before proceeding to checkout",
      severity: "medium",
      validate: (s) => ({
        passed: s.refusedDrink,
        detail: `refusedDrink: ${s.refusedDrink}, refusedDessert: ${s.refusedDessert}`,
      }),
    },
  ],
};
