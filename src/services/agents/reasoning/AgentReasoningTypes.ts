/**
 * AgentReasoningTypes — the generic Agent Reasoning Contract (v1).
 *
 * A reusable contract so any Foocci agent (Waiter first, then CRM / WhatsApp /
 * Analytics) can REASON before answering or proposing a learning: understand the
 * real intent, gather safe context, produce an ideal contextual answer + a
 * training rule, and self-check coherence. Provider-agnostic by design.
 */

export type AgentReasoningIntent =
  | "PAYMENT_QUESTION"
  | "PAYMENT_BENEFIT_QUESTION"
  | "MENU_QUESTION"
  | "PRICE_QUESTION"
  | "DELIVERY_QUESTION"
  | "PICKUP_QUESTION"
  | "ORDER_BY_TEXT"
  | "INDECISIVE_CUSTOMER"
  | "HUNGRY_CUSTOMER"
  | "GROUP_ORDER"
  | "DIETARY_RESTRICTION"
  | "COMPLAINT"
  | "PRAISE"
  | "ABANDONMENT_RISK"
  | "UPSELL_ACCEPTED"
  | "UPSELL_REJECTED"
  | "GENERAL_SUPPORT"
  | "UNKNOWN";

export type ReasoningVerdict = "PASS" | "FAIL" | "NEEDS_REVIEW";
export type ReasoningMode = "LLM" | "FALLBACK";

export interface AgentReasoningCoherenceCheck {
  answersCustomerQuestion: boolean;
  matchesIntent: boolean;
  doesNotInventFacts: boolean;
  keepsSalesFlow: boolean;
  verdict: ReasoningVerdict;
  reason: string;
}

export interface AgentReasoningResult {
  primaryIntent: AgentReasoningIntent;
  secondaryIntents: AgentReasoningIntent[];
  confidence: number; // 0–1
  customerNeed: string;
  contextNeeded: string[];
  availableContextUsed: string[];
  missingContext: string[];
  directAnswerStrategy: string;
  idealResponse: string;
  trainingRule: string;
  expectedImpact: string;
  safetyNotes: string[];
  shouldEscalate: boolean;
  escalationReason?: string;
  coherenceCheck: AgentReasoningCoherenceCheck;
  /** How the reasoning was produced (real LLM vs deterministic guardrail fallback). */
  reasoningMode: ReasoningMode;
}

export type ReasoningSourceType = "REAL_CONVERSATION" | "SIMULATION" | "MANUAL_TEST";

export interface AgentReasoningInput {
  restaurantId?: string | null;
  /** Sanitized transcript (no PII, no raw text). */
  sanitizedConversation?: string | null;
  /** The (sanitized) customer message to reason about. */
  customerMessage: string;
  /** The (sanitized) Waiter response if available. */
  waiterResponse?: string | null;
  sourceType: ReasoningSourceType;
}

/** Safe, read-only restaurant context the reasoning may use (never invented). */
export interface AgentReasoningContext {
  restaurantName?: string | null;
  /** Configured payment methods (e.g. ["PIX","Dinheiro","Cartão"]). */
  paymentMethods: string[];
  /** Whether the catalog/config knows about meal-voucher benefits (Alelo/VR/…). */
  knowsMealVoucher: boolean;
  acceptsDelivery?: boolean | null;
  acceptsPickup?: boolean | null;
  tone?: string | null;
  /** Which requested context pieces were actually available. */
  availableContextUsed: string[];
  /** Which requested context pieces were missing (so we never invent them). */
  missingContext: string[];
}
