/**
 * simulationSanitizer — strips PII/secrets from any text/transcript BEFORE it is
 * stored or shown. Real conversations are never persisted raw: only the sanitized
 * form is kept. Over-masking is acceptable; leaking is not.
 *
 * Masks: email, phone (BR), CPF, CNPJ, street address, person name (after common
 * cues), order numbers, long digit runs, and secret/token shapes.
 */

import type { TranscriptTurn } from "./types";

interface Rule { flag: string; re: RegExp; replacement: string }

// Order matters: most specific first. Phone runs BEFORE the CPF rule so a bare
// 11-digit cell (DDD + 9 + 8 digits) is labelled [telefone], not [cpf]. CNPJ is
// disambiguated from CPF by requiring the "/" group; the CPF rule requires the
// punctuated form so it never swallows a phone number.
const RULES: Rule[] = [
  { flag: "email", re: /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, replacement: "[email]" },
  { flag: "secret", re: /\b(sk|pk|rk|whsec|Bearer)[-_ ]?[A-Za-z0-9._-]{8,}\b/g, replacement: "[secret]" },
  { flag: "cnpj", re: /\b\d{2}\.?\d{3}\.?\d{3}\/\d{4}-?\d{2}\b/g, replacement: "[cnpj]" },
  // BR mobile: optional +55, optional (DD), DDD + leading 9 + 8 digits.
  { flag: "phone", re: /(\+?55\s?)?\(?\d{2}\)?[\s-]?9\d{4}[-\s]?\d{4}\b/g, replacement: "[telefone]" },
  // BR landline: DDD + first digit 2-5 + 7 digits.
  { flag: "phone", re: /(\+?55\s?)?\(?\d{2}\)?[\s-]?[2-5]\d{3}[-\s]?\d{4}\b/g, replacement: "[telefone]" },
  // CPF — only the punctuated form (so a phone is never mistaken for a CPF).
  { flag: "cpf", re: /\b\d{3}\.\d{3}\.\d{3}-\d{2}\b/g, replacement: "[cpf]" },
  // Person name after a common self-introduction cue.
  { flag: "name", re: /\b(sou (?:o|a)|meu nome (?:é|e)|me chamo|aqui (?:é|e) (?:o|a)|falo com (?:o|a)?)\s+[A-ZÀ-Ý][a-zà-ÿ]+(?:\s+[A-ZÀ-Ý][a-zà-ÿ]+)?/g, replacement: "$1 [nome]" },
  // Street address after a logradouro keyword, up to a comma/number/end.
  { flag: "address", re: /\b(rua|avenida|av\.?|alameda|al\.?|travessa|pra[cç]a|rodovia|estrada|r\.)\s+[^,.\n;]{2,40}/gi, replacement: "[endereco]" },
  // Order / pedido number.
  { flag: "order", re: /\b(pedido|order|comanda)\s*#?\s*\d+/gi, replacement: "[pedido]" },
  { flag: "order", re: /#\d{3,}/g, replacement: "[pedido]" },
  // Backstop: any remaining long digit run (cards, CPF-ish, etc.).
  { flag: "number", re: /\b\d{8,}\b/g, replacement: "[numero]" },
];

/** Sanitizes a single string. */
export function sanitizeText(input: string): string {
  let out = input ?? "";
  for (const { re, replacement } of RULES) out = out.replace(re, replacement);
  return out;
}

/** Returns which PII/secret categories were present (for riskFlags auditing). */
export function detectRiskFlags(input: string): string[] {
  const found = new Set<string>();
  for (const { flag, re } of RULES) {
    // Use a fresh regex (global state) to test.
    if (new RegExp(re.source, re.flags).test(input ?? "")) found.add(flag);
  }
  return [...found];
}

export function sanitizeTranscript(turns: TranscriptTurn[]): TranscriptTurn[] {
  return turns.map((t) => ({ ...t, content: sanitizeText(t.content) }));
}
