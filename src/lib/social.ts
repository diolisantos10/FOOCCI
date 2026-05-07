/**
 * Social/contact URL builders for public menu headers.
 *
 * These helpers accept raw values (full URL or bare handle) and always return
 * a well-formed URL, or null when the input is empty/invalid.
 */

const WA_DEFAULT_MSG = "Olá! Vim pelo cardápio e gostaria de falar com a loja.";

/** Normalise an arbitrary phone string into a wa.me URL.
 *  Prepends the Brazilian country code (55) when the cleaned digits
 *  don't already start with it. */
export function buildWhatsAppUrl(
  phone: string | null | undefined,
  message = WA_DEFAULT_MSG,
): string | null {
  if (!phone) return null;
  const digits = phone.replace(/\D/g, "");
  if (!digits) return null;
  const normalized = digits.startsWith("55") ? digits : `55${digits}`;
  const qs = message ? `?text=${encodeURIComponent(message)}` : "";
  return `https://wa.me/${normalized}${qs}`;
}

/** Accept full Instagram URL or bare handle (with or without leading @). */
export function buildInstagramUrl(value: string | null | undefined): string | null {
  if (!value) return null;
  if (value.startsWith("http")) return value;
  return `https://www.instagram.com/${value.replace(/^@/, "")}`;
}

/** Accept full TikTok URL or bare handle (with or without leading @). */
export function buildTikTokUrl(value: string | null | undefined): string | null {
  if (!value) return null;
  if (value.startsWith("http")) return value;
  return `https://www.tiktok.com/@${value.replace(/^@/, "")}`;
}
