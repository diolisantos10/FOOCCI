/**
 * WaiterReasoningService — the Waiter's Agent Reasoning Layer v1 orchestrator.
 *
 * Flow: sanitized message → deterministic intent guardrails → safe read-only
 * context → LLM reasoning (if available) OR deterministic fallback → coherence
 * validation → structured AgentReasoningResult. The guardrail intent ALWAYS wins
 * over the model for payment/delivery/dietary/order questions, so
 * "Aceita Alelo Refeição?" can never become "indecisão".
 *
 * Read-only. Never sends, never creates an order/Pix, never touches the runtime.
 */

import type {
  AgentReasoningInput,
  AgentReasoningResult,
  AgentReasoningIntent,
  AgentReasoningContext,
} from "./AgentReasoningTypes";
import { detectGuardrailIntent } from "./waiterIntentGuardrails";
import { getWaiterReasoningContext } from "./WaiterReasoningContextService";
import { fallbackReasoning } from "./waiterReasoningFallback";
import { reasonWithLLM } from "./WaiterReasoningLLMService";
import { validateCoherence } from "./AgentReasoningCoherenceValidator";

const CONTEXT_NEEDED_BY_INTENT: Partial<Record<AgentReasoningIntent, string[]>> = {
  PAYMENT_QUESTION: ["formas de pagamento"],
  PAYMENT_BENEFIT_QUESTION: ["formas de pagamento", "benefício refeição (Alelo/VR/Sodexo)"],
  DELIVERY_QUESTION: ["delivery/retirada"],
  PICKUP_QUESTION: ["delivery/retirada"],
  PRICE_QUESTION: ["cardápio"],
  MENU_QUESTION: ["cardápio"],
  DIETARY_RESTRICTION: ["cardápio", "restrições"],
};

export interface ReasoningOptions {
  /** Force LLM on/off. Default: use LLM when OPENAI_API_KEY is present. */
  useLLM?: boolean;
  /** Inject context (tests). */
  context?: AgentReasoningContext;
}

export async function reasonAboutWaiterCase(
  input: AgentReasoningInput,
  options: ReasoningOptions = {},
): Promise<AgentReasoningResult> {
  // 1) Deterministic guardrail intent (overrides soft classification).
  const guardrail = detectGuardrailIntent(input.customerMessage);
  const forcedIntent = guardrail?.forced ? guardrail.intent : null;

  // 2) Safe, read-only context (never invents).
  const ctx = options.context ?? (await getWaiterReasoningContext(input.restaurantId).catch(() => null)) ?? {
    paymentMethods: [],
    knowsMealVoucher: false,
    availableContextUsed: [],
    missingContext: ["formas de pagamento", "perfil do restaurante", "delivery/retirada"],
  };

  const wantLLM = options.useLLM ?? !!process.env.OPENAI_API_KEY;

  // 3) Reasoning core — LLM if possible, else deterministic fallback.
  let core: ReturnType<typeof fallbackReasoning> & { secondaryIntents?: AgentReasoningIntent[]; confidence?: number };
  let reasoningMode: "LLM" | "FALLBACK" = "FALLBACK";

  if (wantLLM) {
    try {
      const llm = await reasonWithLLM(input, ctx, forcedIntent ?? guardrail?.intent ?? null);
      core = llm;
      reasoningMode = "LLM";
    } catch {
      core = fallbackReasoning(forcedIntent ?? guardrail?.intent ?? "INDECISIVE_CUSTOMER", ctx);
    }
  } else {
    core = fallbackReasoning(forcedIntent ?? guardrail?.intent ?? "INDECISIVE_CUSTOMER", ctx);
  }

  // 4) Enforce the forced guardrail intent over the model.
  const primaryIntent: AgentReasoningIntent = forcedIntent ?? core.primaryIntent;

  // 5) Coherence validation.
  const coherence = validateCoherence({
    primaryIntent,
    customerMessage: input.customerMessage,
    idealResponse: core.idealResponse,
    trainingRule: core.trainingRule,
    missingContext: ctx.missingContext,
  });

  const contextNeeded = CONTEXT_NEEDED_BY_INTENT[primaryIntent] ?? [];

  return {
    primaryIntent,
    secondaryIntents: core.secondaryIntents ?? [],
    confidence: core.confidence ?? (reasoningMode === "FALLBACK" ? 0.6 : 0.7),
    customerNeed: core.customerNeed,
    contextNeeded,
    availableContextUsed: ctx.availableContextUsed,
    missingContext: ctx.missingContext,
    directAnswerStrategy: core.directAnswerStrategy,
    idealResponse: core.idealResponse,
    trainingRule: core.trainingRule,
    expectedImpact: core.expectedImpact,
    safetyNotes: core.safetyNotes,
    shouldEscalate: core.shouldEscalate,
    escalationReason: core.escalationReason,
    coherenceCheck: coherence,
    reasoningMode,
  };
}
