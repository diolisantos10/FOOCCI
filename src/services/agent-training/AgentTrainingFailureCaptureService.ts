/**
 * AgentTrainingFailureCaptureService
 *
 * Captures live agent failures as training scenarios.
 * Must be called fire-and-forget (.catch(() => {})) — never blocks the customer reply.
 *
 * Privacy: masks phone numbers, CPF, street numbers from all stored text.
 */

import { prisma } from "@/lib/prisma";
import type { FailureCategory } from "@/services/ai/UnknownFallbackHandler";

export interface CaptureInput {
  restaurantId:          string;
  conversationId:        string;
  customerId?:           string | null;
  agentType:             string;
  source:                "REAL_CONVERSATION" | "LIVE_FAILURE";
  failureCategory:       FailureCategory;
  customerMessage:       string;
  recentTranscript:      Array<{ role: string; content: string; timestamp?: Date }>;
  agentReply:            string;
  stage?:                string | null;
  intent?:               string | null;
  draftJson?:            unknown;
  safetyNotes?:          string | null;
  operatorHandoffReason?: string | null;
}

function maskPII(text: string): string {
  return text
    // Brazilian phone numbers
    .replace(/(\+?55\s*)?(\(?\d{2}\)?\s*)\d{4,5}[-\s]?\d{4}/g, (m) => m.slice(0, 5) + "***-****")
    // CPF
    .replace(/\d{3}\.\d{3}\.\d{3}-\d{2}/g, "***.***.***-**")
    // Street numbers
    .replace(/\b(nº?|número|n\.?)\s*\d+/gi, "$1 ***")
    // Long digit sequences (potential IDs / tokens)
    .replace(/\b\d{9,}\b/g, "***");
}

const CATEGORY_LABELS: Record<FailureCategory, string> = {
  UNKNOWN_INTENT:              "Intenção desconhecida",
  LOW_CONFIDENCE_MENU_MATCH:   "Cardápio — baixa confiança",
  PRODUCT_NOT_FOUND:           "Produto não encontrado",
  PRICE_LOOKUP_FAILED:         "Preço não localizado",
  REQUIRED_OPTION_UNRESOLVED:  "Opção obrigatória sem resolução",
  REPEATED_CLARIFICATION_LOOP: "Loop de clarificação repetida",
  PAYMENT_UNSUPPORTED:         "Pagamento não suportado",
  DELIVERY_UNSUPPORTED:        "Entrega fora de área",
  ADDRESS_UNCLEAR:             "Endereço indefinido",
  CUSTOMER_FRUSTRATED:         "Cliente frustrado",
  CUSTOMER_REQUESTED_HUMAN:    "Cliente pediu atendente",
  INTERNAL_ERROR:              "Erro interno do agente",
  NO_USEFUL_REPLY:             "Agente sem resposta útil",
};

const EXPECTED_BEHAVIORS: Partial<Record<FailureCategory, string>> = {
  PRODUCT_NOT_FOUND:           "Agent should suggest alternatives or ask for clarification",
  LOW_CONFIDENCE_MENU_MATCH:   "Agent should confirm item before adding to order",
  REPEATED_CLARIFICATION_LOOP: "Agent should escalate after 2nd failed clarification attempt",
  CUSTOMER_REQUESTED_HUMAN:    "Agent should trigger handoff immediately",
  INTERNAL_ERROR:              "Agent should send safe message and trigger handoff",
  UNKNOWN_INTENT:              "Agent should ask a targeted question or escalate",
  NO_USEFUL_REPLY:             "Agent should escalate rather than send unhelpful reply",
};

/**
 * Capture a live failure as a training scenario.
 * Returns { scenarioId, runId } on success.
 * Safe to call fire-and-forget — all errors are propagated to caller.
 */
export async function captureFailure(input: CaptureInput): Promise<{ scenarioId: string; runId: string }> {
  const riskLevel = ["INTERNAL_ERROR", "CUSTOMER_FRUSTRATED", "REPEATED_CLARIFICATION_LOOP"].includes(
    input.failureCategory,
  )
    ? "HIGH"
    : "MEDIUM";

  const maskedTranscript = input.recentTranscript.map((t) => ({
    role:    t.role,
    content: maskPII(t.content),
    ts:      (t.timestamp ?? new Date()).toISOString(),
  }));

  const label  = CATEGORY_LABELS[input.failureCategory] ?? input.failureCategory;
  const idSlug = input.restaurantId.slice(0, 6);
  const title  = `${label} · ${idSlug}`;

  const failureSummary = [
    `Categoria: ${input.failureCategory}`,
    input.intent ? `Intenção: ${input.intent}` : null,
    input.stage  ? `Stage: ${input.stage}` : null,
    `Mensagem: "${maskPII(input.customerMessage).slice(0, 100)}"`,
    input.operatorHandoffReason ? `Handoff: ${input.operatorHandoffReason}` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  const run = await prisma.agentTrainingRun.create({
    data: {
      agentType:      input.agentType,
      restaurantId:   input.restaurantId,
      source:         "LIVE_FAILURE",
      mode:           "QUICK",
      status:         "COMPLETED",
      startedAt:      new Date(),
      completedAt:    new Date(),
      totalScenarios: 1,
      warnCount:      riskLevel === "HIGH" ? 0 : 1,
      failCount:      riskLevel === "HIGH" ? 1 : 0,
    },
  });

  type ScenarioCreateInput = Parameters<typeof prisma.agentTrainingScenario.create>[0]["data"];

  const scenario = await prisma.agentTrainingScenario.create({
    data: {
      runId:               run.id,
      restaurantId:        input.restaurantId,
      source:              input.source,
      sourceConversationId: input.conversationId,
      title,
      goal:                input.failureCategory,
      transcriptJson:      maskedTranscript as unknown as ScenarioCreateInput["transcriptJson"],
      actualOutcomeJson:   {
        agentReply:      maskPII(input.agentReply),
        failureCategory: input.failureCategory,
        stage:           input.stage ?? null,
        intent:          input.intent ?? null,
        safetyNotes:     input.safetyNotes ?? null,
      } as unknown as ScenarioCreateInput["actualOutcomeJson"],
      expectedOutcomeJson: {
        expectedBehavior: EXPECTED_BEHAVIORS[input.failureCategory] ?? "Agent should escalate to human",
        category:         input.failureCategory,
      } as unknown as ScenarioCreateInput["expectedOutcomeJson"],
      status:        riskLevel === "HIGH" ? "FAIL" : "WARN",
      riskLevel,
      failureSummary,
    },
  });

  return { scenarioId: scenario.id, runId: run.id };
}
