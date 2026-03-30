/**
 * Scenario: Direct Buyer
 *
 * Persona: direct
 * Knows exactly what they want. Adds main, drink, and dessert,
 * then completes a full delivery checkout in one pass.
 *
 * Validates: complete end-to-end happy path (delivery flow).
 */

import type { QAScenario } from "../types";

export const directBuyer: QAScenario = {
  id: "direct-buyer",
  name: "Direct Buyer — Full Delivery Flow",
  persona: "direct",
  severity: "critical",
  description:
    "User selects one item from each category, skips upsell (all covered), " +
    "completes delivery checkout with valid address.",
  actions: [
    { type: "add_first_from_category", categoryType: "main" },
    { type: "add_first_from_category", categoryType: "drink" },
    { type: "add_first_from_category", categoryType: "dessert" },
    // All categories covered → finalize goes straight to checkout
    { type: "finalize" },
    { type: "assert_stage", expected: "DELIVERY_TYPE" },
    { type: "assert_checkout_visible", expected: true },
    { type: "select_delivery", method: "delivery" },
    { type: "assert_stage", expected: "ADDRESS_INPUT" },
    { type: "input_address", line1: "Rua das Flores, 123", line2: "Centro" },
    { type: "assert_stage", expected: "ADDRESS_CONFIRM" },
    { type: "confirm_address" },
    { type: "assert_stage", expected: "ASK_NAME" },
    { type: "input_name", name: "João Silva" },
    { type: "assert_stage", expected: "PAYMENT" },
    { type: "select_payment", method: "pix" },
    { type: "assert_stage", expected: "REVIEW_ORDER" },
    { type: "confirm_order" },
    { type: "assert_stage", expected: "DONE" },
    { type: "assert_checkout_visible", expected: false },
  ],
  checkpoints: [
    {
      id: "reaches-done",
      description: "Order reaches DONE stage",
      severity: "critical",
      validate: (s) => ({
        passed: s.stage === "DONE",
        detail: `Final stage: ${s.stage}`,
      }),
    },
    {
      id: "cart-has-three-categories",
      description: "Cart contains items from main, drink, and dessert categories",
      severity: "high",
      validate: (s) => ({
        passed: s.cart.length >= 3,
        detail: `Cart has ${s.cart.length} item type(s)`,
      }),
    },
    {
      id: "customer-name-set",
      description: "Customer name was collected",
      severity: "medium",
      validate: (s) => ({
        passed: s.customerName.trim().length > 0,
        detail: `customerName: "${s.customerName}"`,
      }),
    },
    {
      id: "payment-recorded",
      description: "Payment method was recorded",
      severity: "medium",
      validate: (s) => ({
        passed: s.paymentMethod !== null,
        detail: `paymentMethod: ${s.paymentMethod}`,
      }),
    },
    {
      id: "no-upsell-needed",
      description: "No upsell was triggered (all categories covered before finalize)",
      severity: "low",
      validate: (s) => ({
        passed: !s.offeredDrink && !s.offeredDessert,
        detail: `offeredDrink: ${s.offeredDrink}, offeredDessert: ${s.offeredDessert}`,
      }),
    },
  ],
};
