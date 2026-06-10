/**
 * whatsappIntentGuardrails — deterministic WhatsApp-specific intent detection,
 * layered ON TOP of the Foocci Brain guardrails (reused from the Waiter Reasoning
 * Layer). The Brain guardrails already own the critical case: payment / meal
 * voucher (Alelo/VR/Sodexo/ticket/vale-refeição/cartão/pix/dinheiro) → a PAYMENT
 * intent — NEVER "indecisão" nor a dish recommendation.
 *
 * Pure, no DB, no LLM — safe to run in a cron diagnostic.
 */

import { detectGuardrailIntent } from "@/services/brain/reasoning/IntentGuardrails";

export type WhatsAppIntent =
  | "START_ORDER"
  | "ORDER_BY_TEXT"
  | "MENU_RETURN"
  | "ASK_MENU"
  | "ASK_HOURS"
  | "PAYMENT_QUESTION"
  | "PAYMENT_BENEFIT_QUESTION"
  | "ASK_DELIVERY"
  | "ASK_ATTENDANT"
  | "COMPLAINT"
  | "PRAISE"
  | "UNCLEAR"
  | "OTHER";

// WhatsApp-only patterns (the Brain guardrails cover payment/delivery/order/diet).
const WA_RULES: Array<{ intent: WhatsAppIntent; re: RegExp }> = [
  { intent: "ASK_ATTENDANT", re: /\b(atendente|humano|falar com (algu[eé]m|uma pessoa|gente)|pessoa de verdade|suporte humano)\b/i },
  { intent: "COMPLAINT", re: /\b(reclama|problema|deu (errado|ruim)|n[ãa]o chegou|errad[oa]|p[ée]ssimo|horr[íi]vel|cad[êe] meu pedido|atrasou|demorou demais)\b/i },
  { intent: "PRAISE", re: /\b(adorei|amei|excelente|maravilh|muito bom|parab[ée]ns|top demais|melhor|nota 10)\b/i },
  { intent: "ASK_HOURS", re: /\b(que horas|hor[áa]rio|abre|fecha|t[áa] aberto|est[áa] aberto|funciona (hoje|agora)|atende (hoje|agora)|aberto agora)\b/i },
  { intent: "ASK_MENU", re: /\b(card[áa]pio|menu|ver op[çc][õo]es|o que (voc[êe]s )?t[êe]m|quais? (op[çc][õo]es|sabores|pratos)|me mostra)\b/i },
  { intent: "START_ORDER", re: /\b(quero (fazer )?(um )?pedido|fazer (um )?pedido|vou querer|quero pedir|fazer pedido|come[çc]ar pedido|pedir agora)\b/i },
];

/** Maps a Brain guardrail intent into the WhatsApp vocabulary. */
function fromBrainIntent(intent: string): WhatsAppIntent | null {
  switch (intent) {
    case "PAYMENT_BENEFIT_QUESTION": return "PAYMENT_BENEFIT_QUESTION";
    case "PAYMENT_QUESTION": return "PAYMENT_QUESTION";
    case "DELIVERY_QUESTION": return "ASK_DELIVERY";
    case "PICKUP_QUESTION": return "ASK_DELIVERY";
    case "ORDER_BY_TEXT": return "START_ORDER";
    case "PRICE_QUESTION": return "ASK_MENU";
    default: return null;
  }
}

export interface WhatsAppGuardrailMatch {
  intent: WhatsAppIntent;
  matchedTerm: string;
  source: "BRAIN_GUARDRAIL" | "WHATSAPP_RULE" | "FALLBACK";
}

/**
 * Detect the WhatsApp intent. The Brain payment guardrail wins FIRST so a payment
 * question can never be misread; then WhatsApp-specific rules; else UNCLEAR/OTHER.
 */
export function detectWhatsAppIntent(message: string): WhatsAppGuardrailMatch {
  const text = (message ?? "").trim();
  if (!text) return { intent: "UNCLEAR", matchedTerm: "", source: "FALLBACK" };

  // 1) Brain guardrails — payment/benefit MUST be caught before anything else.
  const brain = detectGuardrailIntent(text);
  if (brain && (brain.intent === "PAYMENT_BENEFIT_QUESTION" || brain.intent === "PAYMENT_QUESTION")) {
    return { intent: fromBrainIntent(brain.intent)!, matchedTerm: brain.matchedTerms[0] ?? "", source: "BRAIN_GUARDRAIL" };
  }

  // 2) WhatsApp-specific rules (attendant/complaint/praise/hours/menu/order).
  for (const rule of WA_RULES) {
    const m = text.match(rule.re);
    if (m) return { intent: rule.intent, matchedTerm: m[0], source: "WHATSAPP_RULE" };
  }

  // 3) Remaining Brain guardrails (delivery/order/price/diet).
  if (brain) {
    const mapped = fromBrainIntent(brain.intent);
    if (mapped) return { intent: mapped, matchedTerm: brain.matchedTerms[0] ?? "", source: "BRAIN_GUARDRAIL" };
  }

  // 4) Nothing matched → unclear (short) or other.
  return { intent: text.split(/\s+/).length <= 2 ? "UNCLEAR" : "OTHER", matchedTerm: "", source: "FALLBACK" };
}
