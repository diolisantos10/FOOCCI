/**
 * menuFooter — the mandatory "0. menu" footer of the WhatsApp text-order flow.
 *
 * Product rule: EVERY active-flow message ends with exactly `0. menu` (never
 * "0. voltar ao menu principal" or long variants), and a bare `0`/"menu" returns
 * to the WhatsApp Agent main menu — asking continue/discard first when an order
 * draft is in progress. Pure helpers, no DB, no side effects.
 */

export const MENU_FOOTER = "0. menu";

const FOOTER_VARIANTS_RE = /\n*\s*0\.\s*(menu( principal)?|voltar( ao menu( principal)?)?)\s*$/i;

/** Ensures a reply ends with exactly `\n\n0. menu` (idempotent, strips variants). */
export function withMenuFooter(reply: string): string {
  const base = (reply ?? "").replace(FOOTER_VARIANTS_RE, "").trimEnd();
  if (!base) return MENU_FOOTER;
  return `${base}\n\n${MENU_FOOTER}`;
}

/**
 * True when the customer asked to go back to the main menu. Inside the ORDER flow
 * only a bare `0` triggers the return — the word "menu" alone keeps meaning
 * "mostrar o cardápio" (existing behavior of the menu-question handler).
 */
export function isMenuReturn(text: string): boolean {
  return /^\s*0\s*$/.test(text ?? "");
}
