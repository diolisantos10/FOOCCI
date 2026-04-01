/**
 * FOOCCI Internal QA — Shared Types
 *
 * All types used by the scenario engine, driver, runner, and reporter.
 */

// ─── Primitives ───────────────────────────────────────────────

export type Persona =
  | "direct"       // knows what they want, no hesitation
  | "indecisive"   // switches categories, changes mind
  | "resistant"    // declines upsells
  | "confused"     // makes incomplete inputs, goes back
  | "impatient";   // clicks finalize early and often

export type Severity = "critical" | "high" | "medium" | "low";

export type Stage =
  | "BROWSE"
  | "DELIVERY_TYPE"
  | "ADDRESS_INPUT"
  | "ADDRESS_DETAILS"
  | "ADDRESS_CONFIRM"
  | "ASK_NAME"
  | "PAYMENT"
  | "PAYMENT_METHOD"
  | "PAYMENT_LINK"
  | "REVIEW_ORDER"
  | "DONE";

export type DeliveryMethod = "delivery" | "pickup";
/** @deprecated Use PaymentMode + PaymentMethodSub instead */
export type PaymentMethod = "pix" | "cartao" | "dinheiro";
export type PaymentMode = "pay_now" | "pay_on_delivery" | "pay_on_pickup";
export type PaymentMethodSub = "card_machine" | "pix_in_person" | "cash";
export type UpsellOffered = "drink" | "dessert" | null;
export type CategoryType = "main" | "drink" | "dessert";

// ─── Menu fixtures ────────────────────────────────────────────

export interface MenuItemFixture {
  id: string;
  name: string;
  price: number;
  description: string | null;
  imageUrl: string | null;
}

export interface MenuCategoryFixture {
  id: string;
  name: string;
  imageUrl: string | null;
  items: MenuItemFixture[];
}

// ─── Runtime cart ─────────────────────────────────────────────

export interface CartItem {
  id: string;
  name: string;
  price: number;
  qty: number;
}

export interface Address {
  street: string;
  number: string;
  neighborhood: string;
  complement: string;
}

// ─── QA Runtime State ─────────────────────────────────────────
//
// Mirrors the React state in page.tsx, plus three simulated
// UI-snapshot fields that reflect what would be visible on screen.

export interface QAState {
  // Business state (mirrors page.tsx)
  stage: Stage;
  cart: CartItem[];
  offeredDrink:       boolean;
  offeredDessert:     boolean;
  refusedDrink:       boolean;
  refusedDessert:     boolean;
  lastUpsellCategory: "drink" | "dessert" | null;
  deliveryMethod: DeliveryMethod | null;
  address: Address;
  customerName: string;
  paymentMethod: PaymentMethod | null;  // legacy
  paymentMode: PaymentMode | null;
  paymentMethodSub: PaymentMethodSub | null;

  // Simulated UI snapshot
  visibleCategoryId: string | null;   // which category tab is active
  isCheckoutVisible: boolean;          // checkout UI panel is showing
  isModalOpen: boolean;                // product detail modal is open
}

// ─── Actions ──────────────────────────────────────────────────

export type QAAction =
  | { type: "add_product";              productName: string }
  | { type: "add_first_from_category";  categoryType: CategoryType }
  | { type: "remove_product";           productName: string }
  | { type: "switch_category";          categoryType: CategoryType }
  | { type: "open_product_modal";       productName: string }
  | { type: "close_modal" }
  | { type: "finalize" }
  | { type: "accept_upsell" }        // add item from upsell category + call finalize
  | { type: "refuse_upsell" }        // call finalize again without adding (advance sequence)
  | { type: "select_delivery";         method: DeliveryMethod }
  | { type: "input_address";           line1: string; line2?: string }
  | { type: "confirm_address" }
  | { type: "input_name";              name: string }
  | { type: "select_payment";          method: PaymentMethod }  // legacy – maps to 2-step flow
  | { type: "select_payment_mode";     mode: PaymentMode }
  | { type: "select_payment_method_sub"; method: PaymentMethodSub }
  | { type: "confirm_order" }
  | { type: "go_back_to_browse" }
  // Inline assertions — fail-fast if state doesn't match
  | { type: "assert_stage";            expected: Stage }
  | { type: "assert_upsell";           expected: UpsellOffered }
  | { type: "assert_cart_qty";         productName: string; expected: number }
  | { type: "assert_cart_total";       minExpected: number }
  | { type: "assert_checkout_visible"; expected: boolean }
  | { type: "assert_modal_open";       expected: boolean };

// ─── Checkpoints ──────────────────────────────────────────────

export interface QACheckpoint {
  id: string;
  description: string;
  severity: Severity;
  validate: (state: QAState) => { passed: boolean; detail?: string };
}

// ─── Scenario ─────────────────────────────────────────────────

export interface QAScenario {
  id: string;
  name: string;
  persona: Persona;
  description: string;
  actions: QAAction[];
  checkpoints: QACheckpoint[];
  severity: Severity;   // severity of THIS scenario failing overall
}

// ─── Logging ──────────────────────────────────────────────────

export interface QAActionLog {
  seq: number;
  action: QAAction;
  timestamp: string;
  stateBefore: QAState;
  stateAfter: QAState;
  assertionError?: string;  // set when an assert_ action fails
  error?: string;            // set when an action throws
}

export interface QACheckpointResult {
  checkpointId: string;
  description: string;
  severity: Severity;
  passed: boolean;
  detail?: string;
}

export interface QAFailure {
  source: "action" | "checkpoint" | "loop";
  id: string;
  description: string;
  severity: Severity;
  detail: string;
  actionSeq?: number;
}

export interface QAScenarioResult {
  scenarioId: string;
  scenarioName: string;
  persona: Persona;
  timestamp: string;
  durationMs: number;
  outcome: "pass" | "fail" | "error";
  actions: QAActionLog[];
  checkpointResults: QACheckpointResult[];
  failures: QAFailure[];
}

export interface QASummary {
  total: number;
  passed: number;
  failed: number;
  errored: number;
  critical: number;
  high: number;
  medium: number;
  low: number;
  recommendation: "READY" | "NOT_READY" | "READY_FOR_CONTROLLED_PILOT";
}

export interface QARunLog {
  runId: string;
  timestamp: string;
  totalDurationMs: number;
  scenarios: QAScenarioResult[];
  summary: QASummary;
}
