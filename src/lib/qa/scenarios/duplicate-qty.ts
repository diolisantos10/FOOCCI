/**
 * Scenario: Duplicate Quantity
 *
 * Persona: direct
 * User adds the same product multiple times. Quantity must increment
 * correctly (not create duplicate cart entries). Cart total must
 * reflect the correct multiplied price.
 *
 * Validates: cart deduplication and quantity accumulation.
 */

import type { QAScenario } from "../types";

const PRODUCT = "Pizza Calabresa";
const UNIT_PRICE = 42.90;

export const duplicateQty: QAScenario = {
  id: "duplicate-qty",
  name: "Duplicate Quantity — Cart Dedup",
  persona: "direct",
  severity: "critical",
  description:
    "User adds the same pizza three times. Cart must show qty=3, " +
    "a single line item (no duplicates), and the correct total.",
  actions: [
    { type: "add_product", productName: PRODUCT },
    { type: "assert_cart_qty", productName: PRODUCT, expected: 1 },
    { type: "add_product", productName: PRODUCT },
    { type: "assert_cart_qty", productName: PRODUCT, expected: 2 },
    { type: "add_product", productName: PRODUCT },
    { type: "assert_cart_qty", productName: PRODUCT, expected: 3 },
    // Total should be 3 × 42.90 = 128.70
    { type: "assert_cart_total", minExpected: UNIT_PRICE * 3 - 0.01 },
  ],
  checkpoints: [
    {
      id: "qty-is-three",
      description: `"${PRODUCT}" has qty=3 after being added three times`,
      severity: "critical",
      validate: (s) => {
        const item = s.cart.find((c) => c.name === PRODUCT);
        return {
          passed: item?.qty === 3,
          detail: `qty: ${item?.qty ?? 0}`,
        };
      },
    },
    {
      id: "single-cart-entry",
      description: "Cart has exactly one unique entry for the product (no duplicates)",
      severity: "critical",
      validate: (s) => {
        const entries = s.cart.filter((c) => c.name === PRODUCT);
        return {
          passed: entries.length === 1,
          detail: `Found ${entries.length} entry/entries for "${PRODUCT}"`,
        };
      },
    },
    {
      id: "total-correct",
      description: `Cart total equals ${(UNIT_PRICE * 3).toFixed(2)}`,
      severity: "high",
      validate: (s) => {
        const total = s.cart.reduce((acc, i) => acc + i.price * i.qty, 0);
        const expected = UNIT_PRICE * 3;
        return {
          passed: Math.abs(total - expected) < 0.01,
          detail: `Total: R$${total.toFixed(2)}, expected: R$${expected.toFixed(2)}`,
        };
      },
    },
  ],
};
