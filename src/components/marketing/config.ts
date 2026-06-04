/**
 * Shared config for the public marketing site (/site and /site/*).
 *
 * PRE-LAUNCH MODE (pilot): Foocci is not selling yet. CTAs communicate the
 * proposal and the upcoming launch — no WhatsApp sales, no demo scheduling, no
 * working lead capture. The WhatsApp helpers below are RESERVED for launch and
 * are intentionally not wired to any CTA right now.
 * See docs/foocci-site/pre-launch-mode-v1.md.
 */

export const LOGIN_URL = "/login";

/** RESERVED for launch — not used by any CTA in pre-launch mode. */
export const WHATSAPP_SALES_NUMBER: string | null = null;

/** Internal destinations used by pre-launch CTAs. */
export const COMO_FUNCIONA_URL = "/site/como-funciona";
export const PROPOSTA_URL = "/site/sobre";
export const DEMO_URL = "/site/demonstracao";

/** Pre-launch CTA copy. */
export const PRIMARY_CTA_LABEL = "Ver como a Foocci funciona";
export const SECONDARY_CTA_LABEL = "Conhecer a proposta";

/** Pre-launch messaging. */
export const PRELAUNCH_BADGE = "Em breve para restaurantes selecionados";
export const PRELAUNCH_NOTE = "Lançamento comercial em breve.";

const DEFAULT_WA_MESSAGE = "Olá! Quero saber mais sobre a Foocci.";

/** RESERVED for launch. Returns a wa.me URL when a number is configured. */
export function whatsappUrl(message: string = DEFAULT_WA_MESSAGE): string | null {
  if (!WHATSAPP_SALES_NUMBER) return null;
  return `https://wa.me/${WHATSAPP_SALES_NUMBER}?text=${encodeURIComponent(message)}`;
}

/** Props for a link that is external when configured, else internal. */
export function ctaTarget(href: string): { href: string } & Record<string, string> {
  const external = href.startsWith("http");
  return external ? { href, target: "_blank", rel: "noopener noreferrer" } : { href };
}

export const NAV_LINKS: { href: string; label: string }[] = [
  { href: "/site/como-funciona", label: "Como funciona" },
  { href: "/site#solucoes", label: "Soluções" },
  { href: "/site#crm", label: "CRM" },
  { href: "/site/precos", label: "Preços" },
  { href: "/site/demonstracao", label: "Demonstração" },
];
