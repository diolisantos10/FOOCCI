/**
 * IntentGuardrails — Brain re-export of the deterministic intent guardrails.
 * Guardrails are a BRAIN capability (they protect every agent from obvious
 * misclassification); the Waiter implementation is the v1 reference.
 */

export {
  detectGuardrailIntent,
  isPaymentIntent,
  type GuardrailMatch,
} from "@/services/agents/reasoning/waiterIntentGuardrails";
