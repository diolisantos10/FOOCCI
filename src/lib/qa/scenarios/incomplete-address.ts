/**
 * Scenario: Incomplete Address
 *
 * Persona: confused
 * User attempts delivery but:
 *   1. Provides a street without a number (blocked at ADDRESS_INPUT)
 *   2. Then provides a valid line1 but empty line2 (blocked at ADDRESS_DETAILS)
 *   3. Then attempts confirm_address while still in ADDRESS_DETAILS (blocked)
 *
 * Validates: address gate — no progression without required fields.
 */

import type { QAScenario } from "../types";

export const incompleteAddress: QAScenario = {
  id: "incomplete-address",
  name: "Incomplete Address — Validation Gate",
  persona: "confused",
  severity: "critical",
  description:
    "User enters address without number, then without neighborhood. " +
    "System must block progression at each missing field.",
  actions: [
    { type: "add_first_from_category", categoryType: "main" },
    { type: "finalize" },
    // Skip upsells to reach checkout
    { type: "refuse_upsell" },  // drink upsell → dessert
    { type: "refuse_upsell" },  // dessert upsell → DELIVERY_TYPE
    { type: "assert_stage", expected: "DELIVERY_TYPE" },
    { type: "select_delivery", method: "delivery" },
    { type: "assert_stage", expected: "ADDRESS_INPUT" },

    // Attempt 1: street without number → must stay in ADDRESS_INPUT
    { type: "input_address", line1: "Rua das Flores" },
    { type: "assert_stage", expected: "ADDRESS_INPUT" },

    // Attempt 2: valid line1 but empty line2 → must stay in ADDRESS_DETAILS
    { type: "input_address", line1: "Rua das Flores, 123", line2: "" },
    { type: "assert_stage", expected: "ADDRESS_DETAILS" },

    // Attempt 3: try to confirm while in ADDRESS_DETAILS (not ADDRESS_CONFIRM)
    // confirm_address checks required fields and is a no-op if incomplete
    { type: "confirm_address" },
    { type: "assert_stage", expected: "ADDRESS_DETAILS" },
  ],
  checkpoints: [
    {
      id: "blocked-without-number",
      description: "Stage stays at ADDRESS_INPUT when number is missing",
      severity: "critical",
      validate: (s) => {
        // After the scenario, we're still in ADDRESS_DETAILS (last blocked state)
        const blocked =
          s.stage === "ADDRESS_DETAILS" || s.stage === "ADDRESS_INPUT";
        return {
          passed: blocked,
          detail: `Final stage: ${s.stage} (expected ADDRESS_INPUT or ADDRESS_DETAILS)`,
        };
      },
    },
    {
      id: "no-name-collected",
      description: "System did not advance to ASK_NAME without complete address",
      severity: "critical",
      validate: (s) => ({
        passed: s.customerName === "",
        detail: `customerName: "${s.customerName}"`,
      }),
    },
    {
      id: "address-number-populated",
      description: "Street number is stored when provided",
      severity: "high",
      validate: (s) => ({
        passed: s.address.number === "123",
        detail: `address.number: "${s.address.number}"`,
      }),
    },
    {
      id: "neighborhood-empty",
      description: "Neighborhood is empty because it was never provided",
      severity: "high",
      validate: (s) => ({
        passed: s.address.neighborhood === "",
        detail: `address.neighborhood: "${s.address.neighborhood}"`,
      }),
    },
  ],
};
