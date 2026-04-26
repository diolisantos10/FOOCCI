/**
 * Shared phone number utilities for customer identification.
 * Used by the identify API and the server-side page lookups.
 */

/**
 * Returns all plausible phone variants for a Brazilian number,
 * covering E.164, raw digits, and the 9th-digit expansion.
 */
export function phoneCandidates(raw: string): string[] {
  const digits = raw.replace(/\D/g, "");
  if (digits.length < 8) return [];

  const set = new Set<string>();

  if (digits.length >= 12 && digits.startsWith("55")) {
    set.add(`+${digits}`);
    set.add(digits);
  }

  if (digits.length === 11) {
    set.add(`+55${digits}`);
    set.add(digits);
  }

  if (digits.length === 10) {
    set.add(`+55${digits}`);
    set.add(`+55${digits.slice(0, 2)}9${digits.slice(2)}`);
  }

  set.add(digits);
  return [...set];
}

/** Normalise to +55XXXXXXXXXXX (E.164) where possible; otherwise return raw digits. */
export function toE164(raw: string): string {
  const digits = raw.replace(/\D/g, "");
  if (digits.length === 11) return `+55${digits}`;
  if (digits.length === 10) return `+55${digits.slice(0, 2)}9${digits.slice(2)}`;
  if (digits.length >= 12 && digits.startsWith("55")) return `+${digits}`;
  return digits;
}
