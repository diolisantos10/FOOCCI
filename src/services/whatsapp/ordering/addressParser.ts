/**
 * Lightweight Brazilian address fragment parser. Pure, no I/O, no geocoding.
 *
 * Extracts what it can (CEP, street, number) from a free-text message. Geocoding
 * and fee calculation are done downstream by WhatsAppDeliveryService via the
 * canonical resolver — this only structures the text.
 */

import type { WaAddress } from "./types";

const CEP_RE    = /\b(\d{5})-?(\d{3})\b/;
const NUMBER_RE = /\b(?:n[º°.]?\s*|n[uú]mero\s*)?(\d{1,5})\b/;

export function parseAddressFragment(text: string): WaAddress {
  const out: WaAddress = { raw: text.trim() };

  const cep = text.match(CEP_RE);
  if (cep) out.cep = `${cep[1]}-${cep[2]}`;

  // Strip the CEP before looking for a house number, so we don't grab CEP digits
  const withoutCep = text.replace(CEP_RE, " ");

  // Try "Rua X, 123" style — street is text before the first comma/number
  const commaMatch = withoutCep.match(/^(.*?),\s*(\d{1,5})\b/);
  if (commaMatch) {
    out.street = commaMatch[1]?.trim();
    out.number = commaMatch[2];
  } else {
    // Fall back: number anywhere, street = text before it
    const numMatch = withoutCep.match(NUMBER_RE);
    if (numMatch && numMatch[1]) {
      out.number = numMatch[1];
      const idx = withoutCep.indexOf(numMatch[0]);
      const before = withoutCep.slice(0, idx).trim().replace(/[,;]+$/, "");
      if (before.length >= 3) out.street = before;
    } else if (withoutCep.trim().length >= 3) {
      // Only a street name, no number yet
      out.street = withoutCep.trim();
    }
  }

  return out;
}
