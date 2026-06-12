/**
 * Free-text parser + intent detection for WhatsApp ordering. Pure, no I/O.
 *
 * Extracted from WhatsAppTextOrderService so both the W0/W1 dry-run analyzer and
 * the W2+ state machine share one implementation.
 */

import type { WaDetectedIntent, WaParsedItem } from "./types";

// ── Intent detection ──────────────────────────────────────────────────────────

const ORDER_PATTERNS: RegExp[] = [
  /\b(quero|queria|pode me trazer|me traz|pode mandar|pode ser|coloca|vai|pedir|pede|adiciona|me d[aá]|me manda|manda|quero pedir|vou querer|vou de)\b/i,
  /\b(um|uma|dois|duas|tr[eê]s|quatro|cinco|seis|sete|oito|nove|dez)\s+\w{3}/i,
  /\b\d+\s*[xX×]\s*\w/,
  /\b(pedido|combo|prato|por[çc][aã]o|lanche|pizza|hambur[gq]uer|sushi|temaki|yakisoba|ramen|sashimi|uramaki|rodízio)\b/i,
];

const QUESTION_PATTERNS: RegExp[] = [
  /\b(t[eê]m|voc[eê]s?\s+t[eê]m|qual|quais|quanto custa|pre[çc]o|card[aá]pio|menu|dispon[ií]vel|como funciona|hor[aá]rio|funcionam|entrega)\b/i,
  /\?/,
];

const HUMAN_PATTERNS: RegExp[] = [
  /\b(atendente|humano|pessoa|operador|falar com|falar com algu[eé]m|preciso de ajuda|respons[aá]vel|gerente)\b/i,
];

const COMPLAINT_PATTERNS: RegExp[] = [
  /\b(reclama[çc][aã]o|reclamar|p[eé]ssimo|horr[ií]vel|errado|veio errado|faltou|estragad|atrasad|demorou|reembolso|estorno|cancelar pedido|n[aã]o chegou|fria|frio)\b/i,
];

// Starts with a question word → almost certainly a question even if it names a product
const QUESTION_START_RE = /^(qual|quais|quanto|como|quando|onde|por que|t[eê]m\s|voc[eê]s?\s+t[eê]m|h[aá]\s)/i;

export function detectIntent(text: string): WaDetectedIntent {
  if (COMPLAINT_PATTERNS.some(p => p.test(text))) return "COMPLAINT";
  if (HUMAN_PATTERNS.some(p => p.test(text)))     return "HUMAN_NEEDED";

  // Strong question signal wins even if a product name is mentioned
  const isQuestion = QUESTION_START_RE.test(text.trim()) ||
    (text.includes("?") && QUESTION_PATTERNS.some(p => p.test(text)));
  if (isQuestion) return "QUESTION";

  if (ORDER_PATTERNS.some(p => p.test(text)))    return "ORDER_REQUEST";
  if (QUESTION_PATTERNS.some(p => p.test(text))) return "QUESTION";
  return "UNKNOWN";
}

// ── Quantity + item parsing ──────────────────────────────────────────────────

const NUMBER_WORDS: Record<string, number> = {
  um: 1, uma: 1, hum: 1,
  dois: 2, duas: 2,
  "três": 3, tres: 3,
  quatro: 4, cinco: 5, seis: 6, sete: 7, oito: 8, nove: 9, dez: 10,
};

// Standalone delivery/payment tokens stripped from product item lists. They
// appear as separate items when the customer writes a mixed one-line message
// like "2 yakisoba, entrega, pix" — we don't want them as menu lookups.
export const DELIVERY_STANDALONE_RE = /^(entrega|delivery|retirada|retirar|buscar|pegar|balc[aã]o|no local)\s*$/i;
export const PAYMENT_STANDALONE_RE  = /^(pix|cart[aã]o|cr[eé]dito|d[eé]bito|dinheiro|esp[eé]cie|cash)\s*$/i;

/** Normalizes spelling variants and strips Portuguese plural suffixes from a product name. */
export function normalizePluralAndSpelling(text: string): string {
  return text
    // Known spelling variants (common WhatsApp typos + abbreviations)
    .replace(/\bcocacola\b/gi, "coca cola")
    .replace(/\bcoca-cola\b/gi, "coca cola")
    .replace(/\bkisoba\b/gi, "yakisoba")
    .replace(/\brefri\b/gi, "refrigerante")
    .replace(/\bpiza\b/gi, "pizza")
    .replace(/\bhamburger\b/gi, "hamburguer")
    .replace(/\bhamburguesa\b/gi, "hamburguer")
    .replace(/\bfrapp[eê]\b/gi, "frappe")
    .replace(/\bwrapt?\b/gi, "wrap")
    // Strip trailing -s from words with stem ≥ 4 chars
    // handles: cocas→coca, yakisobas→yakisoba, temakis→temaki, combos→combo, pizzas→pizza
    .replace(/\b([a-záéíóúâêîôûãõàèìòùç]{4,})s\b/g, "$1")
    .trim();
}

export function parseQuantity(token: string): { qty: number; rest: string } {
  const xMatch = token.match(/^(\d+)\s*[xX×]\s*([\s\S]*)/);
  if (xMatch) return { qty: Math.max(1, parseInt(xMatch[1] ?? "1", 10)), rest: (xMatch[2] ?? "").trim() };

  const digitMatch = token.match(/^(\d+)\s+([\s\S]*)/);
  if (digitMatch) return { qty: Math.max(1, parseInt(digitMatch[1] ?? "1", 10)), rest: (digitMatch[2] ?? "").trim() };

  const lower = token.toLowerCase();
  for (const [word, qty] of Object.entries(NUMBER_WORDS)) {
    if (lower.startsWith(word + " ") || lower === word) {
      return { qty, rest: token.slice(word.length).trim() };
    }
  }
  return { qty: 1, rest: token.trim() };
}

const INTENT_PREFIX_RE = /^(quero|queria|pode me trazer|me traz|coloca a[íi]|coloca no pedido|adiciona|me d[aá]|me manda|me manda|manda|gostaria de|gostaria|vai|pede|pedido de|pedir|vou querer|vou de)\s+/i;

// Filler words/phrases that aren't part of a product name — stripped from the
// end (or whole) of each parsed item so "uma coca também" → "coca".
const FILLER_RE = /\b(tamb[eé]m|por favor|pfv|pf|obrigad[oa]|valeu|ai|a[íi]|ent[aã]o|pra mim|por gentileza)\b/gi;

export function stripIntent(text: string): string {
  return text.trim().replace(INTENT_PREFIX_RE, "").trim();
}

export function stripFiller(text: string): string {
  return text.replace(FILLER_RE, " ").replace(/\s+/g, " ").trim();
}

export function parseTextItems(messageText: string): WaParsedItem[] {
  const cleaned = stripIntent(messageText);

  const parts = cleaned
    .split(/\s+e\s+|\s*,\s*|\s*\+\s*|\s+mais\s+/i)
    .map(p => stripFiller(p.trim()))
    .filter(p =>
      p.length > 1 &&
      !DELIVERY_STANDALONE_RE.test(p) &&
      !PAYMENT_STANDALONE_RE.test(p),
    );

  return parts.map(part => {
    const { qty, rest } = parseQuantity(part);
    const rawName = stripFiller(rest) || part;
    return { rawText: part, quantity: qty, name: normalizePluralAndSpelling(rawName) };
  });
}
