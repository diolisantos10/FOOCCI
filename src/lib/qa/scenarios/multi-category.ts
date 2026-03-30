/**
 * Scenario: Multiple Categories
 *
 * Persona: direct
 * User explicitly switches between categories and adds one item
 * from each. Cart total must be the sum of all three prices.
 * Finalize must go straight to checkout (all upsells covered).
 *
 * Validates: category switching + multi-category cart math.
 */

import type { QAScenario } from "../types";

// Mock menu prices: pizza 42.90 + drink 12.90 + dessert 6.90 = 62.70
const EXPECTED_MIN_TOTAL = 62.00;

export const multiCategory: QAScenario = {
  id: "multi-category",
  name: "Multiple Categories — Cross-Category Cart",
  persona: "direct",
  severity: "high",
  description:
    "User switches categories and adds items from main, drink, and dessert. " +
    "Total must reflect all three items. Finalize must not trigger upsell.",
  actions: [
    { type: "switch_category", categoryType: "main" },
    { type: "add_first_from_category", categoryType: "main" },
    { type: "switch_category", categoryType: "drink" },
    { type: "add_first_from_category", categoryType: "drink" },
    { type: "switch_category", categoryType: "dessert" },
    { type: "add_first_from_category", categoryType: "dessert" },
    { type: "assert_cart_total", minExpected: EXPECTED_MIN_TOTAL },
    // All categories covered → no upsell, goes straight to DELIVERY_TYPE
    { type: "finalize" },
    { type: "assert_stage", expected: "DELIVERY_TYPE" },
    { type: "assert_upsell", expected: null },
    // Complete checkout
    { type: "select_delivery", method: "pickup" },
    { type: "input_name", name: "Ana" },
    { type: "select_payment", method: "pix" },
    { type: "confirm_order" },
    { type: "assert_stage", expected: "DONE" },
  ],
  checkpoints: [
    {
      id: "three-items-in-cart",
      description: "Cart contains items from 3 different products",
      severity: "high",
      validate: (s) => ({
        passed: s.cart.length === 3,
        detail: `Cart entries: ${s.cart.length}`,
      }),
    },
    {
      id: "total-correct",
      description: `Cart total is at least R$${EXPECTED_MIN_TOTAL.toFixed(2)}`,
      severity: "high",
      validate: (s) => {
        const total = s.cart.reduce((acc, i) => acc + i.price * i.qty, 0);
        return {
          passed: total >= EXPECTED_MIN_TOTAL,
          detail: `Total: R$${total.toFixed(2)}`,
        };
      },
    },
    {
      id: "no-upsell-triggered",
      description: "No upsell was triggered (all categories already covered)",
      severity: "high",
      validate: (s) => ({
        passed: !s.offeredDrink && !s.offeredDessert,
        detail: `offeredDrink: ${s.offeredDrink}, offeredDessert: ${s.offeredDessert}`,
      }),
    },
    {
      id: "order-done",
      description: "Order completed successfully",
      severity: "critical",
      validate: (s) => ({
        passed: s.stage === "DONE",
        detail: `Final stage: ${s.stage}`,
      }),
    },
  ],
};
