/**
 * PII masking for the WhatsApp learning layer. Mirrors the agent-training
 * masker (kept local so the learning modules don't pull the training service's
 * Prisma graph). Masks Brazilian phones, CPF, street numbers and long digit runs
 * before any customer text is summarized, queued, or shown to a manager.
 */
export function maskPII(text: string): string {
  return (text ?? "")
    // Brazilian phone numbers
    .replace(/(\+?55\s*)?(\(?\d{2}\)?\s*)\d{4,5}[-\s]?\d{4}/g, (m) => m.slice(0, 5) + "***-****")
    // CPF
    .replace(/\d{3}\.\d{3}\.\d{3}-\d{2}/g, "***.***.***-**")
    // Street numbers ("nº 123", "número 45")
    .replace(/\b(nº?|número|n\.?)\s*\d+/gi, "$1 ***")
    // Long digit sequences (potential IDs / tokens / bare phone numbers)
    .replace(/\b\d{8,}\b/g, "***");
}
