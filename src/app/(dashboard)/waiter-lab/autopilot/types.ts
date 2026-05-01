// ── Customer profile ──────────────────────────────────────────────────────────

export type CustomerBehavior =
  | "passive"
  | "guided"
  | "direct"
  | "indecisive"
  | "budget"
  | "premium";

export interface CustomerProfile {
  id:              string;
  name:            string;
  goal:            string;
  budget?:         number;
  groupSize?:      number;
  behavior:        CustomerBehavior;
  intentMessages:  string[];
  requiresCart:    boolean;
  requiresCheckout: boolean;
  expectedOutcome: string;
}

// ── Shared item shape ─────────────────────────────────────────────────────────

export interface CatalogItem {
  id:    string;
  name:  string;
  price: number;
}

export interface CartItem extends CatalogItem {
  qty: number;
}

// ── Failure taxonomy ──────────────────────────────────────────────────────────

export type FailureType =
  | "missing_options"
  | "missing_cards"
  | "product_mismatch"
  | "invisible_product_mention"
  | "extra_buttons_after_cards"
  | "wrong_intent_detection"
  | "weak_sales_response"
  | "ui_invasion_after_click"
  | "checkout_interference"
  | "cart_not_updated"
  | "checkout_not_reached"
  | "order_not_confirmed"
  | "response_contract_error"
  | "timeout"
  | "unknown_error";

// ── Step & scenario shapes ────────────────────────────────────────────────────

export interface StepAssertion {
  label:   string;
  pass:    boolean;
  detail?: string;
}

export interface WaiterResponse {
  reply:   string;
  cards:   string[];
  options: { label: string; value: string }[];
  mode:    string;
}

export interface ScenarioStep {
  stepIndex:    number;
  event:        string;
  message:      string;
  response:     WaiterResponse | null;
  assertions:   StepAssertion[];
  passed:       boolean;
  failureTypes: FailureType[];
  durationMs:   number;
}

export interface ScenarioResult {
  profileId:              string;
  profileName:            string;
  goal:                   string;
  status:                 "PASS" | "FAIL" | "ERROR";
  stepsRun:               number;
  failures:               FailureType[];
  steps:                  ScenarioStep[];
  waiterMessages:         string[];
  cardsShown:             string[];
  cartFinal:              CartItem[];
  checkoutReached:        boolean;
  orderConfirmed:         boolean;
  improvementSuggestions: string[];
  durationMs:             number;
}

// ── Report ────────────────────────────────────────────────────────────────────

export interface AutoPilotReport {
  runAt:            string;
  slug:             string;
  restaurantName:   string;
  totalScenarios:   number;
  passed:           number;
  failed:           number;
  errored:          number;
  score:            number;       // 0–100
  avgTurns:         number;
  avgCardsReturned: number;
  conversionRate:   number;       // % of scenarios that reached checkout
  failureTypes:     Partial<Record<FailureType, number>>;
  recommendations:  string[];
  scenarioResults:  ScenarioResult[];
}

// ── Runner state ──────────────────────────────────────────────────────────────

export type AutoPilotStatus = "idle" | "running" | "stopped" | "done";

export interface AutoPilotProgress {
  profileIndex:   number;
  profileName:    string;
  stepLabel:      string;
  completedSteps: ScenarioStep[];
  partialResults: ScenarioResult[];
}
