/**
 * P0 unknown/fallback handler for WhatsApp Agent.
 *
 * When the agent cannot answer confidently it must NEVER stay silent, loop,
 * hallucinate, or send a generic menu link. Instead it sends the canonical
 * safe phrase and triggers human handoff.
 */

export const FAILURE_CATEGORIES = [
  "UNKNOWN_INTENT",
  "LOW_CONFIDENCE_MENU_MATCH",
  "PRODUCT_NOT_FOUND",
  "PRICE_LOOKUP_FAILED",
  "REQUIRED_OPTION_UNRESOLVED",
  "REPEATED_CLARIFICATION_LOOP",
  "PAYMENT_UNSUPPORTED",
  "DELIVERY_UNSUPPORTED",
  "ADDRESS_UNCLEAR",
  "CUSTOMER_FRUSTRATED",
  "CUSTOMER_REQUESTED_HUMAN",
  "INTERNAL_ERROR",
  "NO_USEFUL_REPLY",
] as const;

export type FailureCategory = (typeof FAILURE_CATEGORIES)[number];

/** The canonical P0 customer-safe fallback reply. Never alter this string. */
export const P0_FALLBACK_REPLY = "Só um minutinho, vou chamar um atendente para te ajudar. 🤝";

export interface UnknownFallbackContext {
  customerMessage:      string;
  previousStage?:       string;
  currentDraftJson?:    unknown;
  detectedIntent?:      string;
  reasonForUncertainty: string;
  attemptedMatches?:    string[];
  failureCategory:      FailureCategory;
}

/** Always returns the canonical P0 safe fallback reply. */
export function buildFallbackReply(): string {
  return P0_FALLBACK_REPLY;
}

/**
 * Returns true if the agent has sent sufficiently similar messages 2+ times
 * in recent conversation history, indicating a REPEATED_CLARIFICATION_LOOP.
 *
 * @param recentAgentReplies  Last N outbound agent messages, oldest first
 * @param currentReply        The reply the agent is about to send this turn
 */
export function isRepeatedClarificationLoop(
  recentAgentReplies: string[],
  currentReply:       string,
): boolean {
  if (recentAgentReplies.length < 2) return false;
  const fp = (s: string) =>
    s.toLowerCase().replace(/[^a-záàãâéêíóôõúç\s]/g, "").trim().slice(0, 50);
  const current = fp(currentReply);
  if (current.length < 10) return false;
  const prefix  = current.slice(0, 30);
  const matches = recentAgentReplies.filter((r) => fp(r).startsWith(prefix));
  return matches.length >= 2;
}

/** Classify a receptionist-path handoff into the appropriate FailureCategory. */
export function classifyReceptionistFailure(
  intent:          string,
  gptNeedsHandoff: boolean,
  hasKnowledge:    boolean,
): FailureCategory {
  if (intent === "HUMAN_REQUEST") return "CUSTOMER_REQUESTED_HUMAN";
  if (intent === "COMPLAINT")     return "CUSTOMER_FRUSTRATED";
  if (intent === "ORDER_STATUS")  return "CUSTOMER_REQUESTED_HUMAN";
  if (intent === "UNKNOWN" && gptNeedsHandoff && !hasKnowledge) return "UNKNOWN_INTENT";
  if (intent === "UNKNOWN" && gptNeedsHandoff)                   return "NO_USEFUL_REPLY";
  return "INTERNAL_ERROR";
}

/** Classify a text-ordering-path handoff into the appropriate FailureCategory. */
export function classifyTextOrderFailure(
  stage:   string,
  actions: string[],
  intent?: string,
): FailureCategory {
  if (intent === "HUMAN_NEEDED")              return "CUSTOMER_REQUESTED_HUMAN";
  if (stage === "HANDOFF_REQUIRED")           return "DELIVERY_UNSUPPORTED";
  if (actions.includes("NO_ITEMS_PARSED"))    return "PRODUCT_NOT_FOUND";
  if (actions.includes("REQUEST_CLARIFICATION")) return "LOW_CONFIDENCE_MENU_MATCH";
  if (actions.includes("ASK_MISSING_OPTIONS")) return "REQUIRED_OPTION_UNRESOLVED";
  return "UNKNOWN_INTENT";
}
