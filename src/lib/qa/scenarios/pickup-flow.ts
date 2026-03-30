/**
 * Scenario: Pickup Flow
 *
 * Persona: direct
 * User selects pickup. Address collection stages must be skipped
 * entirely. Flow goes directly DELIVERY_TYPE → ASK_NAME.
 *
 * Validates: pickup path skips address; order completes.
 */

import type { QAScenario } from "../types";

export const pickupFlow: QAScenario = {
  id: "pickup-flow",
  name: "Pickup Flow — No Address Collection",
  persona: "direct",
  severity: "high",
  description:
    "User selects pickup. System must skip ADDRESS_INPUT/DETAILS/CONFIRM " +
    "and go directly to ASK_NAME.",
  actions: [
    { type: "add_first_from_category", categoryType: "main" },
    { type: "add_first_from_category", categoryType: "drink" },
    { type: "add_first_from_category", categoryType: "dessert" },
    { type: "finalize" },
    { type: "assert_stage", expected: "DELIVERY_TYPE" },
    { type: "select_delivery", method: "pickup" },
    // Must jump directly to ASK_NAME, skipping all address stages
    { type: "assert_stage", expected: "ASK_NAME" },
    { type: "input_name", name: "Pedro" },
    { type: "assert_stage", expected: "PAYMENT" },
    { type: "select_payment", method: "cartao" },
    { type: "assert_stage", expected: "REVIEW_ORDER" },
    { type: "confirm_order" },
    { type: "assert_stage", expected: "DONE" },
  ],
  checkpoints: [
    {
      id: "order-done",
      description: "Order reaches DONE via pickup",
      severity: "critical",
      validate: (s) => ({
        passed: s.stage === "DONE",
        detail: `Final stage: ${s.stage}`,
      }),
    },
    {
      id: "delivery-method-pickup",
      description: "Delivery method is recorded as pickup",
      severity: "critical",
      validate: (s) => ({
        passed: s.deliveryMethod === "pickup",
        detail: `deliveryMethod: ${s.deliveryMethod}`,
      }),
    },
    {
      id: "no-address-collected",
      description: "No address was collected in pickup flow",
      severity: "high",
      validate: (s) => {
        const empty =
          s.address.street === "" &&
          s.address.number === "" &&
          s.address.neighborhood === "";
        return {
          passed: empty,
          detail: `address: ${JSON.stringify(s.address)}`,
        };
      },
    },
    {
      id: "name-collected",
      description: "Customer name was collected",
      severity: "high",
      validate: (s) => ({
        passed: s.customerName.length > 0,
        detail: `customerName: "${s.customerName}"`,
      }),
    },
  ],
};
