// ── Customer profile ──────────────────────────────────────────────────────────

export type CustomerBehavior =
  | "passive"
  | "guided"
  | "direct"
  | "indecisive"
  | "budget"
  | "premium";

export interface CustomerProfile {
  id:               string;
  name:             string;
  goal:             string;
  budget?:          number;
  groupSize?:       number;
  behavior:         CustomerBehavior;
  intentMessages:   string[];
  requiresCart:     boolean;
  requiresCheckout: boolean;
  expectedOutcome:  string;
  // ── Silent browsing extensions ─────────────────────────────────────────────
  isSilent?:             boolean;
  silentCartItems?:      string[][];  // per-item hint arrays; resolved against catalog by name
  permissionResponse?:   "accept" | "decline";
  requiresIdle?:         boolean;
  expectsCheckoutUpsell?: boolean;    // ON_CHECKOUT_STARTED must return cards (active upsell)
  requiresSearchCards?:   boolean;    // last ON_USER_MESSAGE must return cards[] (search/ingredient profiles)
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
  | "unknown_error"
  | "bad_product_fit"
  | "repeated_suggestion"
  | "invalid_card_id"
  // ── Silent customer failures ───────────────────────────────────────────────
  | "missed_final_upsell"
  | "premature_intervention"
  | "repeated_prompt"
  | "ignored_decline"
  | "wrong_cart_context"
  | "missed_drink_opportunity"
  | "missed_dessert_opportunity"
  | "invasive_after_item_add"
  | "checkout_prompt_repeated"
  | "silent_customer_not_supported"
  // ── Consultative sales failures ────────────────────────────────────────────
  | "objection_not_handled";

export type Severity = "low" | "medium" | "high" | "critical";

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
  isSilent:               boolean;
  // ── Diagnostic fields ─────────────────────────────────────────────────────
  customerGoal:      string;
  expectedIntent:    string;
  detectedIntent:    string;
  expectedAction:    string;
  actualAction:      string;
  waiterMessage:     string;
  optionsReturned:   { label: string; value: string }[];
  cardsReturned:     string[];
  renderedProducts:  string[];
  probableRootCause: string;
  recommendedFix:    string;
  severity:          Severity;
}

// ── Area scores ───────────────────────────────────────────────────────────────

export interface AreaScores {
  intentScore:         number;
  productFitScore:     number;
  visualSyncScore:     number;
  salesCopyScore:      number;
  userControlScore:    number;
  checkoutSafetyScore: number;
  overallScore:        number;
}

// ── Silent customer metrics ───────────────────────────────────────────────────

export interface SilentMetrics {
  silentScenarioCount:       number;
  silentPassed:              number;
  silentFailed:              number;
  silentConversionRate:      number;
  finalUpsellOfferedRate:    number;
  finalUpsellAcceptedRate:   number;
  invasionFailures:          number;
  missedUpsellOpportunities: number;
}

// ── Fix recommendation ────────────────────────────────────────────────────────

export interface FixRecommendation {
  priority:           number;
  failureType:        FailureType;
  affectedScenarios:  string[];
  reason:             string;
  implementationArea: string;
  expectedImpact:     string;
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
  score:            number;
  avgTurns:         number;
  avgCardsReturned: number;
  conversionRate:   number;
  failureTypes:     Partial<Record<FailureType, number>>;
  recommendations:  string[];
  scenarioResults:  ScenarioResult[];
  areaScores:       AreaScores;
  topFixes:         FixRecommendation[];
  silentMetrics:    SilentMetrics;
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
