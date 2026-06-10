/**
 * reasoningSuggestionMapping — pure mapping from an AgentReasoningResult into the
 * WaiterTrainingSuggestion fields. Keeps the store thin and the mapping testable.
 *
 * Failing coherence does NOT silently drop the case: it stays in the review queue
 * with riskLevel HIGH and a clear "possible misclassification" problem note.
 */

import type { AgentReasoningResult, AgentReasoningIntent } from "@/services/agents/reasoning/AgentReasoningTypes";

export const REASONING_INTENT_LABELS: Record<AgentReasoningIntent, string> = {
  PAYMENT_QUESTION: "Pagamento",
  PAYMENT_BENEFIT_QUESTION: "Pagamento / benefício refeição",
  MENU_QUESTION: "Dúvida de cardápio",
  PRICE_QUESTION: "Dúvida de preço",
  DELIVERY_QUESTION: "Entrega",
  PICKUP_QUESTION: "Retirada",
  ORDER_BY_TEXT: "Pedido por texto",
  INDECISIVE_CUSTOMER: "Cliente indeciso",
  HUNGRY_CUSTOMER: "Cliente com muita fome",
  GROUP_ORDER: "Pedido para grupo",
  DIETARY_RESTRICTION: "Restrição alimentar",
  COMPLAINT: "Reclamação",
  PRAISE: "Elogio",
  ABANDONMENT_RISK: "Risco de desistência",
  UPSELL_ACCEPTED: "Aceitou sugestão extra",
  UPSELL_REJECTED: "Recusou sugestão extra",
  GENERAL_SUPPORT: "Atendimento geral",
  UNKNOWN: "A classificar",
};

const ACTION_BY_INTENT: Partial<Record<AgentReasoningIntent, string>> = {
  PAYMENT_QUESTION: "PAYMENT_RULE",
  PAYMENT_BENEFIT_QUESTION: "PAYMENT_RULE",
  DELIVERY_QUESTION: "RESPONSE_PATTERN",
  PICKUP_QUESTION: "RESPONSE_PATTERN",
  PRICE_QUESTION: "MENU_GUIDANCE",
  MENU_QUESTION: "MENU_GUIDANCE",
  DIETARY_RESTRICTION: "RESTRICTION_HANDLING",
  ORDER_BY_TEXT: "CHECKOUT_GUIDANCE",
  HUNGRY_CUSTOMER: "UPSELL_BEHAVIOR",
  GROUP_ORDER: "UPSELL_BEHAVIOR",
  COMPLAINT: "OBJECTION_HANDLING",
  PRAISE: "TONE_ADJUSTMENT",
  INDECISIVE_CUSTOMER: "RESPONSE_PATTERN",
};

export function intentLabel(intent: AgentReasoningIntent): string {
  return REASONING_INTENT_LABELS[intent] ?? "Atendimento";
}

export interface SuggestionFields {
  title: string;
  situationSummary: string;
  customerIntent: string;
  whatHappened: string;
  problemDetected: string;
  idealResponse: string;
  trainingRule: string;
  expectedImpact: string;
  suggestedActionType: string;
  riskLevel: "LOW" | "MEDIUM" | "HIGH";
  technicalDetails: Record<string, unknown>;
}

function riskFor(r: AgentReasoningResult): "LOW" | "MEDIUM" | "HIGH" {
  if (r.coherenceCheck.verdict === "FAIL") return "HIGH";
  if (r.primaryIntent === "DIETARY_RESTRICTION") return "HIGH";
  if (r.primaryIntent === "PAYMENT_QUESTION" || r.primaryIntent === "PAYMENT_BENEFIT_QUESTION" || r.primaryIntent === "COMPLAINT") return "MEDIUM";
  return "LOW";
}

export function mapReasoningToSuggestionFields(
  r: AgentReasoningResult,
  ctx: { customerExcerpt?: string | null; waiterExcerpt?: string | null },
): SuggestionFields {
  const label = intentLabel(r.primaryIntent);
  const said = ctx.customerExcerpt?.trim();
  const escalated = !!ctx.waiterExcerpt && /handoff|escal|atendente|humano/i.test(ctx.waiterExcerpt);

  const coherenceFail = r.coherenceCheck.verdict === "FAIL";
  const problemDetected = coherenceFail
    ? `Possível classificação errada. Revisar antes de aprovar. (${r.coherenceCheck.reason})`
    : `${label}: ${r.customerNeed}${escalated ? " — e o Waiter escalou para atendimento humano em vez de responder." : ""}`;

  return {
    title: `Ensinar o Waiter a responder: ${label}`,
    situationSummary: said ? `Cliente: “${said}” — ${label}.` : `Situação de ${label}.`,
    customerIntent: label,
    whatHappened: ctx.waiterExcerpt ? `O Waiter respondeu: “${ctx.waiterExcerpt}”` : "Não há resposta registrada do Waiter neste trecho.",
    problemDetected,
    idealResponse: r.idealResponse,
    trainingRule: r.trainingRule,
    expectedImpact: r.expectedImpact,
    suggestedActionType: ACTION_BY_INTENT[r.primaryIntent] ?? "RESPONSE_PATTERN",
    riskLevel: riskFor(r),
    technicalDetails: {
      reasoningMode: r.reasoningMode,
      primaryIntent: r.primaryIntent,
      secondaryIntents: r.secondaryIntents,
      confidence: r.confidence,
      availableContextUsed: r.availableContextUsed,
      missingContext: r.missingContext,
      coherence: { verdict: r.coherenceCheck.verdict, reason: r.coherenceCheck.reason },
      safetyNotes: r.safetyNotes,
      shouldEscalate: r.shouldEscalate,
    },
  };
}
