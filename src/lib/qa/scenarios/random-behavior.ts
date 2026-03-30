/**
 * Scenario: Random User Behavior
 *
 * Persona: indecisive
 * Simulates an unpredictable user: switches categories back and forth,
 * adds items, removes one, adds it back, opens/closes modal,
 * then eventually finalizes normally.
 *
 * Validates: state remains consistent through erratic navigation.
 */

import type { QAScenario } from "../types";

export const randomBehavior: QAScenario = {
  id: "random-behavior",
  name: "Random Behavior — Indecisive User",
  persona: "indecisive",
  severity: "medium",
  description:
    "User switches categories, adds/removes items, opens a modal, " +
    "then eventually completes the order. State must remain consistent.",
  actions: [
    // Browse around — main category
    { type: "switch_category", categoryType: "main" },
    { type: "add_product", productName: "Pizza Calabresa" },
    // Switch to drink, look around, switch back
    { type: "switch_category", categoryType: "drink" },
    { type: "switch_category", categoryType: "main" },
    // Add second main item
    { type: "add_product", productName: "Pizza Mussarela" },
    // Open modal on second item (simulates tap for details)
    { type: "open_product_modal", productName: "Pizza Mussarela" },
    { type: "assert_modal_open", expected: true },
    { type: "close_modal" },
    { type: "assert_modal_open", expected: false },
    // Change mind — remove the mussarela
    { type: "remove_product", productName: "Pizza Mussarela" },
    { type: "assert_cart_qty", productName: "Pizza Mussarela", expected: 0 },
    // Switch to drink, add one
    { type: "switch_category", categoryType: "drink" },
    { type: "add_first_from_category", categoryType: "drink" },
    // Switch to dessert, add one
    { type: "switch_category", categoryType: "dessert" },
    { type: "add_first_from_category", categoryType: "dessert" },
    // Verify cart state
    { type: "assert_cart_qty", productName: "Pizza Calabresa", expected: 1 },
    { type: "assert_cart_total", minExpected: 40.00 },
    // Finalize — all upsells covered (drink + dessert in cart)
    { type: "finalize" },
    { type: "assert_stage", expected: "DELIVERY_TYPE" },
    { type: "select_delivery", method: "delivery" },
    { type: "input_address", line1: "Av. Paulista, 1000", line2: "Bela Vista, Apto 5" },
    { type: "confirm_address" },
    { type: "input_name", name: "Indecisive User" },
    { type: "select_payment", method: "cartao" },
    { type: "confirm_order" },
    { type: "assert_stage", expected: "DONE" },
  ],
  checkpoints: [
    {
      id: "removed-item-gone",
      description: "Removed item is no longer in cart",
      severity: "high",
      validate: (s) => {
        const item = s.cart.find((c) => c.name === "Pizza Mussarela");
        return {
          passed: item === undefined,
          detail: `Pizza Mussarela in cart: ${item !== undefined}`,
        };
      },
    },
    {
      id: "calabresa-still-there",
      description: "Original item was not affected by removing another",
      severity: "high",
      validate: (s) => {
        const item = s.cart.find((c) => c.name === "Pizza Calabresa");
        return {
          passed: item !== undefined && item.qty === 1,
          detail: `Pizza Calabresa qty: ${item?.qty ?? 0}`,
        };
      },
    },
    {
      id: "order-done",
      description: "Order completed despite erratic navigation",
      severity: "critical",
      validate: (s) => ({
        passed: s.stage === "DONE",
        detail: `Final stage: ${s.stage}`,
      }),
    },
    {
      id: "address-complete",
      description: "All required address fields were collected",
      severity: "high",
      validate: (s) => {
        const ok =
          s.address.street.length > 0 &&
          s.address.number.length > 0 &&
          s.address.neighborhood.length > 0;
        return {
          passed: ok,
          detail: `address: ${JSON.stringify(s.address)}`,
        };
      },
    },
  ],
};
