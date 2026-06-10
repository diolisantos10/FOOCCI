/**
 * WhatsAppBrainReasoningAdapter v1 — the WhatsApp Agent as a COGNITIVE CONSUMER of
 * the Foocci Brain.
 *
 * Turns a WhatsApp message into a structured, SAFE decision (intent + recommended
 * action + handoff/order-link signals) using the Brain's deterministic guardrails.
 * It REASONS — it never sends, never calls Evolution, never creates an order/Pix,
 * never touches the runtime. v1 is pure (no DB, no LLM) so it is hermetic and
 * cron-diagnostic friendly. The webhook does NOT consume it yet (shadow/off).
 *
 * Iron rule (inherited from the Brain): a payment/benefit question can NEVER become
 * "cliente indeciso" nor a dish recommendation.
 */

import { detectWhatsAppIntent, type WhatsAppIntent } from "./whatsappIntentGuardrails";

export type WhatsAppRecommendedAction =
  | "SEND_ORDER_LINK"
  | "ANSWER_BASIC_INFO"
  | "HANDOFF_TO_HUMAN"
  | "KEEP_AI"
  | "NO_REPLY"
  | "ASK_CLARIFYING_QUESTION";

export interface WhatsAppBrainRequest {
  restaurantId: string;
  conversationId: string;
  customerId?: string;
  phone: string;
  customerName?: string;
  messageText: string;
  currentConversationStatus: string;
  isRestaurantOpen: boolean;
  source: "WHATSAPP";
}

export interface WhatsAppBrainResult {
  primaryIntent: WhatsAppIntent;
  confidence: number;
  recommendedAction: WhatsAppRecommendedAction;
  customerNeed: string;
  safeReplyStrategy: string;
  contextUsed: string[];
  missingContext: string[];
  shouldHandoff: boolean;
  handoffReason?: string;
  shouldSendOrderLink: boolean;
  safetyNotes: string[];
  /** Hard invariant: reasoning NEVER touches the live runtime. */
  runtimeTouched: false;
}

const NEEDS: Record<WhatsAppIntent, string> = {
  START_ORDER: "Fazer um pedido.",
  ASK_MENU: "Ver o cardápio / opções.",
  ASK_HOURS: "Saber o horário de funcionamento.",
  PAYMENT_QUESTION: "Saber como pode pagar.",
  PAYMENT_BENEFIT_QUESTION: "Saber se uma forma de pagamento / benefício refeição é aceita.",
  ASK_DELIVERY: "Saber sobre entrega/retirada, prazo ou taxa.",
  ASK_ATTENDANT: "Falar com um atendente humano.",
  COMPLAINT: "Registrar uma reclamação / resolver um problema.",
  PRAISE: "Elogiar o atendimento.",
  UNCLEAR: "Mensagem curta/ambígua — precisa esclarecer.",
  OTHER: "Atendimento geral.",
};

export function reasonWhatsAppMessage(req: WhatsAppBrainRequest): WhatsAppBrainResult {
  const match = detectWhatsAppIntent(req.messageText);
  const intent = match.intent;
  const open = req.isRestaurantOpen;
  const contextUsed: string[] = [open ? "restaurante aberto" : "restaurante fechado"];
  const missingContext: string[] = [];
  const safetyNotes: string[] = [];

  let recommendedAction: WhatsAppRecommendedAction = "ANSWER_BASIC_INFO";
  let shouldHandoff = false;
  let handoffReason: string | undefined;
  let shouldSendOrderLink = false;
  let safeReplyStrategy = "";

  switch (intent) {
    case "PAYMENT_BENEFIT_QUESTION":
      // The schema has NO meal-voucher config → never claim acceptance.
      missingContext.push("benefício refeição (Alelo/VR/Sodexo) — não cadastrado");
      recommendedAction = "ANSWER_BASIC_INFO";
      safeReplyStrategy =
        "Responder sobre pagamento usando apenas as formas cadastradas. Se for um benefício não cadastrado, confirmar sem inventar e manter o cliente no fluxo do pedido.";
      safetyNotes.push("NUNCA recomendar prato. NUNCA afirmar que aceita um benefício não cadastrado.");
      contextUsed.push("formas de pagamento cadastradas");
      break;
    case "PAYMENT_QUESTION":
      recommendedAction = "ANSWER_BASIC_INFO";
      safeReplyStrategy = "Responder com as formas de pagamento cadastradas e conduzir ao fechamento do pedido.";
      safetyNotes.push("NUNCA recomendar prato. Usar só formas cadastradas, sem inventar taxas.");
      contextUsed.push("formas de pagamento cadastradas");
      break;
    case "START_ORDER":
      recommendedAction = "SEND_ORDER_LINK";
      shouldSendOrderLink = true;
      safeReplyStrategy = open
        ? "Enviar o link do cardápio/pedido já identificado e conduzir o cliente."
        : "Enviar o link do cardápio (ele continua funcionando) e avisar o horário de funcionamento.";
      if (!open) safetyNotes.push("Fora do horário: avisar quando o restaurante reabre.");
      break;
    case "ASK_MENU":
      recommendedAction = "ANSWER_BASIC_INFO";
      shouldSendOrderLink = true;
      safeReplyStrategy = "Enviar o link do cardápio para o cliente ver as opções reais.";
      break;
    case "ASK_HOURS":
      recommendedAction = "ANSWER_BASIC_INFO";
      safeReplyStrategy = "Informar o horário de funcionamento configurado e o próximo horário de abertura se estiver fechado.";
      contextUsed.push("horário de funcionamento");
      break;
    case "ASK_DELIVERY":
      recommendedAction = "ANSWER_BASIC_INFO";
      safeReplyStrategy = "Explicar que entrega/taxa aparecem no fechamento conforme o endereço; usar só regras cadastradas, sem inventar prazo.";
      contextUsed.push("regras de entrega/retirada");
      break;
    case "ASK_ATTENDANT":
      if (open) {
        recommendedAction = "HANDOFF_TO_HUMAN";
        shouldHandoff = true;
        handoffReason = "CUSTOMER_REQUEST";
        safeReplyStrategy = "Avisar que vai chamar um atendente e passar a conversa para o humano.";
      } else {
        recommendedAction = "ANSWER_BASIC_INFO";
        safeReplyStrategy = "Fora do horário: informar que o atendimento humano está indisponível agora e quando retorna.";
        safetyNotes.push("Fora do horário: não prometer atendente imediato.");
      }
      break;
    case "COMPLAINT":
      recommendedAction = "HANDOFF_TO_HUMAN";
      shouldHandoff = true;
      handoffReason = "COMPLAINT";
      safeReplyStrategy = "Acolher com empatia e encaminhar para a equipe do restaurante; não prometer reembolso/brinde por conta própria.";
      safetyNotes.push("Reclamação é crítica: não retornar para IA automaticamente depois.");
      break;
    case "PRAISE":
      recommendedAction = "KEEP_AI";
      safeReplyStrategy = "Agradecer com simpatia e convidar para seguir/repetir o pedido.";
      break;
    case "UNCLEAR":
      recommendedAction = "ASK_CLARIFYING_QUESTION";
      safeReplyStrategy = "Fazer UMA pergunta curta para entender o que o cliente precisa (pedido, cardápio, horário ou atendente).";
      break;
    case "OTHER":
    default:
      recommendedAction = "ANSWER_BASIC_INFO";
      safeReplyStrategy = "Responder de forma geral e oferecer ajuda com pedido, cardápio, horário ou atendente.";
      break;
  }

  const confidence = match.source === "FALLBACK" ? 0.4 : 0.85;

  return {
    primaryIntent: intent,
    confidence,
    recommendedAction,
    customerNeed: NEEDS[intent],
    safeReplyStrategy,
    contextUsed,
    missingContext,
    shouldHandoff,
    handoffReason,
    shouldSendOrderLink,
    safetyNotes,
    runtimeTouched: false,
  };
}

// ── Safe config (shadow/off by default) — NOT consumed by the webhook in v1 ──────
export function isWhatsAppBrainAdapterEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.WHATSAPP_BRAIN_ADAPTER_ENABLED === "true";
}
export function isWhatsAppBrainShadowMode(env: NodeJS.ProcessEnv = process.env): boolean {
  // Shadow is ON by default: the adapter may be computed for logging/diagnostics,
  // but it never drives a real reply until WHATSAPP_BRAIN_ADAPTER_ENABLED=true.
  return env.WHATSAPP_BRAIN_SHADOW_MODE !== "false";
}
