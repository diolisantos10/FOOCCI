/**
 * waiterIntentGuardrails — deterministic, keyword-based intent guardrails that run
 * BEFORE/AFTER the LLM to prevent obvious misclassifications.
 *
 * The motivating bug: "Aceita Alelo Refeição?" was classified as INDECISIVE and
 * answered with "recommend the most ordered dishes". A payment/benefit question
 * MUST be a payment intent — never indecision/hunger/menu. These rules are hard
 * guardrails: when one matches, it OVERRIDES any softer classification.
 */

import type { AgentReasoningIntent } from "./AgentReasoningTypes";

export interface GuardrailMatch {
  intent: AgentReasoningIntent;
  matchedTerms: string[];
  /** Forced guardrails win over the LLM; soft ones only fill UNKNOWN. */
  forced: boolean;
}

interface Rule {
  intent: AgentReasoningIntent;
  forced: boolean;
  terms: RegExp;
}

// Meal-voucher brands/benefits — these are PAYMENT_BENEFIT questions specifically.
const MEAL_VOUCHER = /\b(alelo|sodexo|vr\b|ticket\s*(refei|restaur)|vale[-\s]?refei|vale[-\s]?aliment|refeic[aã]o)\b/i;
// Generic payment terms.
const PAYMENT = /\b(forma de pagamento|pagamento|pagar|cart[aã]o|cr[eé]dito|d[eé]bito|pix|dinheiro|maquininha|maquineta)\b/i;
const DELIVERY = /\b(entrega|entregam|frete|taxa de entrega|demora|prazo|quanto tempo|chega em)\b/i;
const PICKUP = /\b(retirad|retirar|buscar no local|pegar a[ií]|tirar no balc)\b/i;
const DIETARY = /\b(vegan|vegetarian|sem carne|sem peixe|sem camar[aã]o|al[eé]rgi|alergia|gl[uú]ten|sem lactose|intoler)\b/i;
const ORDER_BY_TEXT = /\b(quero pedir|quero esse|quero aquele|vou querer|me v[eê]|manda (um|uma|o|a)\b|pode mandar|adiciona)\b/i;
const PRICE = /\b(quanto custa|qual o pre[cç]o|qual valor|quanto [eé]|t[aá] quanto)\b/i;

const RULES: Rule[] = [
  // Payment benefit is the MOST specific — check before generic payment.
  { intent: "PAYMENT_BENEFIT_QUESTION", forced: true, terms: MEAL_VOUCHER },
  { intent: "PAYMENT_QUESTION", forced: true, terms: PAYMENT },
  { intent: "DELIVERY_QUESTION", forced: true, terms: DELIVERY },
  { intent: "PICKUP_QUESTION", forced: true, terms: PICKUP },
  { intent: "DIETARY_RESTRICTION", forced: true, terms: DIETARY },
  { intent: "ORDER_BY_TEXT", forced: false, terms: ORDER_BY_TEXT },
  { intent: "PRICE_QUESTION", forced: false, terms: PRICE },
];

/**
 * Returns the strongest guardrail match for a message, or null. The first match
 * wins (rules are ordered most-specific first).
 */
export function detectGuardrailIntent(message: string): GuardrailMatch | null {
  const text = message ?? "";
  for (const rule of RULES) {
    const m = text.match(rule.terms);
    if (m) return { intent: rule.intent, matchedTerms: [m[0]], forced: rule.forced };
  }
  return null;
}

/** Is this intent a payment-family intent? (used by the coherence validator) */
export function isPaymentIntent(intent: AgentReasoningIntent): boolean {
  return intent === "PAYMENT_QUESTION" || intent === "PAYMENT_BENEFIT_QUESTION";
}
