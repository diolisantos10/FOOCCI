/**
 * Shared config for the public marketing site (/site and /site/*).
 *
 * Single source of truth for CTAs, navigation and contact destinations so the
 * restaurant owner can wire real values in one place.
 *
 * NOTE (documented, intentional): no Foocci sales WhatsApp number is configured
 * yet. While `WHATSAPP_SALES_NUMBER` is null, every "Falar no WhatsApp" CTA falls
 * back to the demo page. Set a number (international format, digits only) to
 * activate WhatsApp everywhere.
 */

export const LOGIN_URL = "/login";

/** TODO(owner): set the real Foocci sales WhatsApp (e.g. "5511999999999"). */
export const WHATSAPP_SALES_NUMBER: string | null = null;

/** Canonical conversion destination — the dedicated demo page. */
export const DEMO_URL = "/site/demonstracao";

export const PRIMARY_CTA_LABEL = "Quero ver a Foocci funcionando";
export const WHATSAPP_CTA_LABEL = "Falar no WhatsApp";

const DEFAULT_WA_MESSAGE = "Olá! Quero ver a Foocci funcionando no meu restaurante.";

/** Returns a wa.me URL when a number is configured, otherwise null. */
export function whatsappUrl(message: string = DEFAULT_WA_MESSAGE): string | null {
  if (!WHATSAPP_SALES_NUMBER) return null;
  return `https://wa.me/${WHATSAPP_SALES_NUMBER}?text=${encodeURIComponent(message)}`;
}

/** Props for a link that is external (WhatsApp) when configured, else internal. */
export function ctaTarget(href: string): { href: string } & Record<string, string> {
  const external = href.startsWith("http");
  return external
    ? { href, target: "_blank", rel: "noopener noreferrer" }
    : { href };
}

export const NAV_LINKS: { href: string; label: string }[] = [
  { href: "/site/como-funciona", label: "Como funciona" },
  { href: "/site#solucoes", label: "Soluções" },
  { href: "/site#crm", label: "CRM" },
  { href: "/site/precos", label: "Preços" },
  { href: "/site/demonstracao", label: "Demonstração" },
];
