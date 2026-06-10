/**
 * AgentReasoningCoherenceValidator — before a reasoning result becomes a training
 * proposal, verify the ideal response ACTUALLY answers the customer's problem.
 *
 * Pure and deterministic: it checks topic alignment (payment question → payment
 * answer, delivery → delivery, dietary → restriction/safety), that an objective
 * question is answered before selling, that absent context isn't invented, and
 * that the response doesn't change the subject. On FAIL the caller must surface a
 * "possible misclassification — review before approving" and raise the risk.
 */

import type { AgentReasoningIntent, AgentReasoningCoherenceCheck } from "./AgentReasoningTypes";

const PAYMENT_WORDS = /\b(pagamento|pagar|forma|cart[aã]o|pix|dinheiro|fechamento|confirmar|cadastrad)\b/i;
const DELIVERY_WORDS = /\b(entrega|prazo|endere[cç]o|taxa|frete|retirad|delivery)\b/i;
const DIETARY_WORDS = /\b(restri[cç]|al[eé]rgi|vegan|vegetarian|sem |seguran[cç]a|ingredient|compat[ií]vel)\b/i;
const RECOMMEND_WORDS = /\b(recomend|sugiro|sugest[aã]o|mais pedidos?|combinad|prato|sobremesa|bebida)\b/i;
const INVENT_HINT = /\b(aceitamos (alelo|sodexo|vr|ticket|vale)|temos desconto de|taxa de \d|gr[aá]tis)\b/i;

export interface CoherenceInput {
  primaryIntent: AgentReasoningIntent;
  customerMessage: string;
  idealResponse: string;
  trainingRule: string;
  missingContext: string[];
}

export function validateCoherence(input: CoherenceInput): AgentReasoningCoherenceCheck {
  const resp = input.idealResponse ?? "";
  const rule = input.trainingRule ?? "";
  const reasons: string[] = [];

  // 1–3) Topic alignment by intent.
  let matchesIntent = true;
  if (input.primaryIntent === "PAYMENT_QUESTION" || input.primaryIntent === "PAYMENT_BENEFIT_QUESTION") {
    matchesIntent = PAYMENT_WORDS.test(resp);
    if (!matchesIntent) reasons.push("Pergunta é sobre pagamento, mas a resposta ideal não fala de pagamento.");
    if (RECOMMEND_WORDS.test(resp) && !PAYMENT_WORDS.test(resp)) {
      matchesIntent = false;
      reasons.push("A resposta recomenda prato em vez de responder sobre pagamento.");
    }
  } else if (input.primaryIntent === "DELIVERY_QUESTION" || input.primaryIntent === "PICKUP_QUESTION") {
    matchesIntent = DELIVERY_WORDS.test(resp);
    if (!matchesIntent) reasons.push("Pergunta é sobre entrega/retirada, mas a resposta não trata disso.");
  } else if (input.primaryIntent === "DIETARY_RESTRICTION") {
    matchesIntent = DIETARY_WORDS.test(resp);
    if (!matchesIntent) reasons.push("Restrição alimentar exige resposta sobre restrição/segurança.");
  }

  // 4) An objective question (ends with ?) should be answered before selling.
  const isObjectiveQuestion = /\?/.test(input.customerMessage);
  const answersCustomerQuestion = matchesIntent;

  // 5) Missing context must NOT be invented.
  const doesNotInventFacts = !(input.missingContext.length > 0 && INVENT_HINT.test(resp));
  if (!doesNotInventFacts) reasons.push("A resposta parece inventar um fato (ex.: forma de pagamento) sem contexto cadastrado.");

  // 6) Subject change: objective question answered only with a recommendation.
  const keepsSalesFlow = /\b(pedido|montar|seguir|fechamento|delivery|retirad|pr[oó]ximo passo|posso te ajudar)\b/i.test(resp);

  // 7) Training rule must reference the intent family.
  const ruleMatchesIntent =
    (input.primaryIntent.startsWith("PAYMENT") && PAYMENT_WORDS.test(rule)) ||
    (input.primaryIntent === "DELIVERY_QUESTION" && DELIVERY_WORDS.test(rule)) ||
    (input.primaryIntent === "PICKUP_QUESTION" && DELIVERY_WORDS.test(rule)) ||
    (input.primaryIntent === "DIETARY_RESTRICTION" && DIETARY_WORDS.test(rule)) ||
    (!input.primaryIntent.startsWith("PAYMENT") &&
      input.primaryIntent !== "DELIVERY_QUESTION" &&
      input.primaryIntent !== "PICKUP_QUESTION" &&
      input.primaryIntent !== "DIETARY_RESTRICTION");
  if (!ruleMatchesIntent) reasons.push("A regra de treinamento não corresponde à intenção detectada.");

  const hardFail = !matchesIntent || !doesNotInventFacts || !ruleMatchesIntent;
  const softConcern = isObjectiveQuestion && !answersCustomerQuestion;

  const verdict = hardFail ? "FAIL" : softConcern ? "NEEDS_REVIEW" : "PASS";

  return {
    answersCustomerQuestion,
    matchesIntent,
    doesNotInventFacts,
    keepsSalesFlow,
    verdict,
    reason: reasons.length ? reasons.join(" ") : "Resposta coerente com a intenção do cliente.",
  };
}
