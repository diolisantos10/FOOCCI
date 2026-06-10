/**
 * WaiterBrainReasoningAdapter — the Waiter as a CONSUMER of the Foocci Brain.
 *
 * Maps BrainReasoningRequest → (existing, untouched) WaiterReasoningService →
 * BrainReasoningResult. The Waiter's specialized pipeline keeps working exactly
 * as before (all existing tests untouched); this adapter only expresses it in the
 * Brain's generic contract so CRM/WhatsApp/Analytics can follow the same shape.
 */

import { reasonAboutWaiterCase } from "@/services/agents/reasoning/WaiterReasoningService";
import type { BrainReasoningRequest, BrainReasoningResult } from "../core/BrainTypes";

export async function reasonViaBrain(request: BrainReasoningRequest): Promise<BrainReasoningResult> {
  if (request.agentId !== "waiter") {
    throw new Error(`Agente ${request.agentId} ainda não está conectado ao Brain — apenas waiter no v1.`);
  }

  const sourceType = request.sourceType === "SYSTEM_EVENT" ? "MANUAL_TEST" : request.sourceType;
  const result = await reasonAboutWaiterCase({
    restaurantId: request.businessId,
    customerMessage: request.sanitizedInput,
    waiterResponse: request.currentResponse ?? null,
    sanitizedConversation: null,
    sourceType,
  });

  return {
    primaryIntent: result.primaryIntent,
    secondaryIntents: result.secondaryIntents,
    confidence: result.confidence,
    customerNeed: result.customerNeed,
    contextNeeded: result.contextNeeded,
    availableContextUsed: result.availableContextUsed,
    missingContext: result.missingContext,
    directAnswerStrategy: result.directAnswerStrategy,
    idealResponse: result.idealResponse,
    trainingRule: result.trainingRule,
    expectedImpact: result.expectedImpact,
    safetyNotes: result.safetyNotes,
    shouldEscalate: result.shouldEscalate,
    escalationReason: result.escalationReason,
    coherenceCheck: {
      answersUserQuestion: result.coherenceCheck.answersCustomerQuestion,
      matchesIntent: result.coherenceCheck.matchesIntent,
      doesNotInventFacts: result.coherenceCheck.doesNotInventFacts,
      keepsBusinessObjective: result.coherenceCheck.keepsSalesFlow,
      verdict: result.coherenceCheck.verdict,
      reason: result.coherenceCheck.reason,
    },
    runtimeTouched: false,
  };
}
