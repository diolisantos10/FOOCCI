/**
 * simulationSanitizer — strips PII/secrets from transcripts before they are stored
 * or shown in the admin UI. Simulations use synthetic data, but this is a hard
 * backstop so a phone/email/token can never leak into a saved transcript.
 */

import type { TranscriptTurn } from "./types";

const PATTERNS: Array<{ re: RegExp; replacement: string }> = [
  // Emails
  { re: /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, replacement: "[email]" },
  // Brazilian phone numbers (with or without +55, parentheses, dashes, spaces)
  { re: /(\+?55\s?)?\(?\d{2}\)?\s?9?\d{4}[-\s]?\d{4}/g, replacement: "[telefone]" },
  // Long digit runs (cards / CPF-ish) — 11+ digits
  { re: /\b\d{11,}\b/g, replacement: "[numero]" },
  // Obvious secret/token shapes
  { re: /\b(sk|pk|rk|whsec|Bearer)[-_ ]?[A-Za-z0-9._-]{8,}\b/g, replacement: "[secret]" },
];

export function sanitizeText(input: string): string {
  let out = input ?? "";
  for (const { re, replacement } of PATTERNS) out = out.replace(re, replacement);
  return out;
}

export function sanitizeTranscript(turns: TranscriptTurn[]): TranscriptTurn[] {
  return turns.map((t) => ({ ...t, content: sanitizeText(t.content) }));
}
