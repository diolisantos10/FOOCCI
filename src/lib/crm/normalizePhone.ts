/**
 * Phone number normalization for CRM WhatsApp sends.
 *
 * Evolution API expects `number` in E.164 format WITHOUT the leading `+`:
 *   e.g. "5511999990000" (Brazil country code 55 + DDD + local number)
 *
 * Customers may have phones stored in many formats:
 *   "+55 (11) 99999-0000", "11999990000", "5511999990000", "(11) 9 9999-0000"
 *
 * This module normalizes all of them to the bare digit string expected by Evolution.
 */

/**
 * Normalize a raw phone string to E.164 digits (no `+`) for Evolution.
 * Returns `null` if the number cannot be reliably normalized to a valid
 * Brazilian WhatsApp-capable number.
 */
export function normalizePhoneForEvolution(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const digits = raw.replace(/\D/g, "");
  if (!digits) return null;

  // Already has full country code prefix (13 digits: 55 + 2-digit DDD + 9-digit mobile)
  // or 12 digits (55 + 2-digit DDD + 8-digit old landline/mobile)
  if ((digits.length === 13 || digits.length === 12) && digits.startsWith("55")) {
    return digits;
  }

  // Local format: 2-digit DDD + mobile (10–11 digits total)
  if (digits.length === 11 || digits.length === 10) {
    return `55${digits}`;
  }

  // Unrecognizable format — do not guess
  return null;
}

/** Returns true when `phone` is a valid E.164 digit string for Brazil. */
export function isValidEvolutionPhone(phone: string | null | undefined): phone is string {
  if (!phone) return false;
  const digits = phone.replace(/\D/g, "");
  return (
    digits.length >= 12 &&
    digits.length <= 13 &&
    digits.startsWith("55")
  );
}
