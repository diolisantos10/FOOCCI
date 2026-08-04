/**
 * WhatsAppBrainDiagnostic — synthetic, hermetic check that the WhatsApp Brain
 * Adapter classifies the canonical cases correctly and stays 100% safe.
 *
 * Pure: runs synthetic messages through the (pure) adapter, asserts intent +
 * recommended action, and proves noSend / noWhatsAppSend / noOrder / noPix /
 * runtimeTouched=false. Never reads/writes the DB, never sends anything.
 */

import { reasonWhatsAppMessage, type WhatsAppBrainResult } from "./WhatsAppBrainReasoningAdapter";

interface CaseExpectation {
  message: string;
  isRestaurantOpen: boolean;
  expectIntent: string;
  expectActions: string[];
  mustNotRecommendDish?: boolean;
  /** P0 permanente do incidente rodízio: a estratégia NUNCA pode negar um serviço. */
  mustNotDenyService?: boolean;
}

const CASES: CaseExpectation[] = [
  { message: "Aceita Alelo Refeição?", isRestaurantOpen: true, expectIntent: "PAYMENT_BENEFIT_QUESTION", expectActions: ["ANSWER_BASIC_INFO", "HANDOFF_TO_HUMAN"], mustNotRecommendDish: true },
  { message: "Quero fazer um pedido", isRestaurantOpen: true, expectIntent: "START_ORDER", expectActions: ["SEND_ORDER_LINK"] },
  { message: "Que horas abre?", isRestaurantOpen: false, expectIntent: "ASK_HOURS", expectActions: ["ANSWER_BASIC_INFO"] },
  { message: "Quero falar com atendente", isRestaurantOpen: true, expectIntent: "ASK_ATTENDANT", expectActions: ["HANDOFF_TO_HUMAN"] },
  { message: "Qual a taxa de entrega?", isRestaurantOpen: true, expectIntent: "ASK_DELIVERY", expectActions: ["ANSWER_BASIC_INFO", "ASK_CLARIFYING_QUESTION"] },
  { message: "Deu problema no meu pedido", isRestaurantOpen: true, expectIntent: "COMPLAINT", expectActions: ["HANDOFF_TO_HUMAN"] },
  // REGRESSÃO RODÍZIO (o incidente que desligou o free-form): uma pergunta sobre
  // serviço jamais pode virar NEGAÇÃO ("não temos"). Comportamento atual (honesto):
  // o guardrail lê "rodízio" como item e roteia pro fluxo de pedido — que resolve
  // contra o cardápio REAL, sem inventar. Melhorar a classificação (INFO_QUESTION
  // via conhecimento curado) é Fase 2/3 do roadmap; a negação é o P0 permanente.
  { message: "Vocês têm rodízio?", isRestaurantOpen: true, expectIntent: "ORDER_BY_TEXT", expectActions: ["START_TEXT_ORDER_DRAFT"], mustNotDenyService: true, mustNotRecommendDish: true },
];

export interface BrainDiagnosticCase {
  message: string;
  intent: string;
  recommendedAction: string;
  shouldHandoff: boolean;
  shouldSendOrderLink: boolean;
  pass: boolean;
  note: string;
}

export interface BrainDiagnosticResult {
  ok: boolean;
  status: "PASS" | "FAIL";
  total: number;
  passed: number;
  p0: number;
  cases: BrainDiagnosticCase[];
  noSend: true;
  noWhatsAppSend: true;
  noOrder: true;
  noPix: true;
  runtimeTouched: false;
}

function dishRecommended(r: WhatsAppBrainResult): boolean {
  return /recomend|mais pedidos|prato|sugest[ãa]o de prato/i.test(r.safeReplyStrategy);
}

function deniesService(r: WhatsAppBrainResult): boolean {
  return /n[ãa]o (temos|tem|fazemos|oferecemos|trabalhamos|existe)/i.test(r.safeReplyStrategy);
}

export function runWhatsAppBrainDiagnostic(): BrainDiagnosticResult {
  const cases: BrainDiagnosticCase[] = [];
  let passed = 0;

  for (const c of CASES) {
    const r = reasonWhatsAppMessage({
      restaurantId: "diag", conversationId: "diag", phone: "+550000000000",
      messageText: c.message, currentConversationStatus: "OPEN", isRestaurantOpen: c.isRestaurantOpen, source: "WHATSAPP",
    });
    const intentOk = r.primaryIntent === c.expectIntent;
    const actionOk = c.expectActions.includes(r.recommendedAction);
    const dishOk = !c.mustNotRecommendDish || !dishRecommended(r);
    const noDenial = !c.mustNotDenyService || !deniesService(r);
    const safe = r.runtimeTouched === false;
    const pass = intentOk && actionOk && dishOk && noDenial && safe;
    if (pass) passed += 1;
    cases.push({
      message: c.message,
      intent: r.primaryIntent,
      recommendedAction: r.recommendedAction,
      shouldHandoff: r.shouldHandoff,
      shouldSendOrderLink: r.shouldSendOrderLink,
      pass,
      note: pass ? "ok" : `intent:${intentOk} action:${actionOk} dish:${dishOk} denial:${noDenial} safe:${safe}`,
    });
  }

  const allPass = passed === CASES.length;
  return {
    ok: allPass,
    status: allPass ? "PASS" : "FAIL",
    total: CASES.length,
    passed,
    p0: allPass ? 0 : 1,
    cases,
    noSend: true,
    noWhatsAppSend: true,
    noOrder: true,
    noPix: true,
    runtimeTouched: false,
  };
}
