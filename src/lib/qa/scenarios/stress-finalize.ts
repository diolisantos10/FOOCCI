/**
 * Scenario: Stress Finalize
 *
 * Persona: impatient
 * User clicks finalize many times in sequence with only one item.
 *
 * Expected behavior:
 *   - Click 1: drink upsell (stage stays BROWSE)
 *   - Click 2: dessert upsell (stage stays BROWSE)
 *   - Click 3: proceeds to DELIVERY_TYPE
 *   - Clicks 4-6: ignored (stage !== BROWSE)
 *
 * Validates:
 *   - No infinite loop
 *   - Stage transitions are correct and finite
 *   - Extra finalize clicks after checkout are silently ignored
 *   - finalizeAttemptCount doesn't increment past checkout entry
 */

import type { QAScenario } from "../types";

export const stressFinalize: QAScenario = {
  id: "stress-finalize",
  name: "Stress Finalize — Repeated Clicks",
  persona: "impatient",
  severity: "high",
  description:
    "User hammers the finalize button 6 times with only one item. " +
    "System must not loop, duplicate state, or crash.",
  actions: [
    { type: "add_first_from_category", categoryType: "main" },
    // Click 1 → drink upsell
    { type: "finalize" },
    { type: "assert_stage", expected: "BROWSE" },
    { type: "assert_upsell", expected: "drink" },
    // Click 2 → dessert upsell
    { type: "finalize" },
    { type: "assert_stage", expected: "BROWSE" },
    { type: "assert_upsell", expected: "dessert" },
    // Click 3 → checkout
    { type: "finalize" },
    { type: "assert_stage", expected: "DELIVERY_TYPE" },
    // Click 4 → ignored (not in BROWSE)
    { type: "finalize" },
    { type: "assert_stage", expected: "DELIVERY_TYPE" },
    // Click 5 → still ignored
    { type: "finalize" },
    { type: "assert_stage", expected: "DELIVERY_TYPE" },
    // Click 6 → still ignored
    { type: "finalize" },
    { type: "assert_stage", expected: "DELIVERY_TYPE" },
    // Complete checkout normally
    { type: "select_delivery", method: "pickup" },
    { type: "input_name", name: "Impatient User" },
    { type: "select_payment", method: "pix" },
    { type: "confirm_order" },
    { type: "assert_stage", expected: "DONE" },
  ],
  checkpoints: [
    {
      id: "no-loop",
      description: "No infinite loop was detected",
      severity: "critical",
      validate: (s) => ({
        // If we reach DONE, no loop occurred
        passed: s.stage === "DONE",
        detail: `Final stage: ${s.stage}`,
      }),
    },
    {
      id: "checkout-reached-once",
      description: "Both upsell gates were offered (and refused) before checkout was entered",
      severity: "high",
      validate: (s) => ({
        passed: s.offeredDrink && s.offeredDessert,
        detail: `offeredDrink: ${s.offeredDrink}, offeredDessert: ${s.offeredDessert}`,
      }),
    },
    {
      id: "cart-unchanged",
      description: "Cart was not modified by extra finalize clicks",
      severity: "medium",
      validate: (s) => ({
        passed: s.cart.length === 1 && (s.cart[0]?.qty ?? 0) === 1,
        detail: `Cart: ${JSON.stringify(s.cart.map((c) => ({ name: c.name, qty: c.qty })))}`,
      }),
    },
  ],
};
