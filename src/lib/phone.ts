/**
 * Shared phone number utilities for customer identification.
 * Used by the identify API and the server-side page lookups.
 */

/**
 * Returns all plausible phone variants for a Brazilian number, covering E.164,
 * raw digits, the country-code prefix, AND both forms of the mobile 9th digit.
 *
 * Why both 9th-digit forms matter: a customer saved via the manual /pedido
 * identify flow is normalised to the 11-digit national form WITH the 9
 * (e.g. +5511999990000), but the same person's WhatsApp JID frequently arrives
 * WITHOUT the 9 (e.g. +551199990000). If the candidate set isn't symmetric, the
 * waToken phone fails to match the existing rich customer record, a duplicate
 * (empty) customer is created, and the customer appears "unrecognised" with no
 * history. Generating both forms makes the lookup match the existing record.
 */
export function phoneCandidates(raw: string): string[] {
  const digits = raw.replace(/\D/g, "");
  if (digits.length < 8) return [];

  const set = new Set<string>();

  // Always keep the literal digits as a fallback candidate.
  set.add(digits);

  // Emit every common storage form for a given national number (DDD + local).
  const addNational = (national: string) => {
    set.add(`+55${national}`);
    set.add(`55${national}`);
    set.add(national);
  };

  // Strip a leading 55 country code to isolate the national number when present.
  let national = digits;
  if ((digits.length === 12 || digits.length === 13) && digits.startsWith("55")) {
    national = digits.slice(2);
  }

  // national is DDD(2) + local(8 = no 9th digit, or 9 = with 9th digit).
  if (national.length === 10 || national.length === 11) {
    const ddd   = national.slice(0, 2);
    const local = national.slice(2);

    if (local.length === 9 && local.startsWith("9")) {
      addNational(`${ddd}${local}`);          // with the 9th digit
      addNational(`${ddd}${local.slice(1)}`); // without the 9th digit
    } else if (local.length === 8) {
      addNational(`${ddd}${local}`);          // without the 9th digit
      addNational(`${ddd}9${local}`);         // with the 9th digit (inserted)
    } else {
      addNational(national);
    }
  } else if (digits.length >= 12 && digits.startsWith("55")) {
    // Long international-ish number we can't split into a BR national form —
    // keep the +55 / raw forms so existing matches still work.
    set.add(`+${digits}`);
  }

  return [...set];
}

/**
 * Deterministic order for every customer lookup that matches `phoneCandidates()`.
 *
 * Why this must exist: the pre-fix 9th-digit bug (see phoneCandidates above)
 * created duplicate customer rows for the same person — one rich (name, orders)
 * and one empty. A `findFirst` without `orderBy` returns an ARBITRARY row, so the
 * lookup was a lottery: resolve the empty duplicate and the customer loses their
 * name and their "Comprar novamente" history. The rich row must always win.
 */
export const CUSTOMER_LOOKUP_ORDER = [
  { totalOrders: "desc" as const },
  { createdAt:   "asc"  as const },
];

/**
 * Extracts the display first name from a customer record, treating "phantom"
 * names as absent. Historical code paths created customers with name = their own
 * phone number (WhatsApp upsert fallbacks); a phone is not a name, and returning
 * it as one hides the fact that we never learned the customer's real name.
 */
export function customerFirstName(name: string | null | undefined): string | null {
  const trimmed = (name ?? "").trim();
  if (!trimmed) return null;
  // Phone-like: no letters at all and 8+ digits (covers "+5511…", "(11) 9…", etc.)
  const hasLetter = /\p{L}/u.test(trimmed);
  const digitCount = (trimmed.match(/\d/g) ?? []).length;
  if (!hasLetter && digitCount >= 8) return null;
  return trimmed.split(/\s+/)[0] ?? null;
}

/** Normalise to +55XXXXXXXXXXX (E.164) where possible; otherwise return raw digits. */
export function toE164(raw: string): string {
  const digits = raw.replace(/\D/g, "");
  if (digits.length === 11) return `+55${digits}`;
  if (digits.length === 10) return `+55${digits.slice(0, 2)}9${digits.slice(2)}`;
  if (digits.length >= 12 && digits.startsWith("55")) return `+${digits}`;
  return digits;
}
