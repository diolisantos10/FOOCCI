/**
 * Shared config for the public marketing site (/site and /site/*).
 *
 * LAUNCH MODE (2026-08-03): Foocci is commercially open. The pre-launch gate is
 * off, the CTAs invite a real demo request, and `DemoForm` posts to a real
 * lead-capture endpoint (`/api/site/leads`).
 *
 * Prices are NOT published yet — the CEO had not closed the three plan values by
 * launch day, and guardrail 7 ("nunca vender como pronto o que está em piloto")
 * plus decision D3 forbid inventing one. `/site/precos` therefore presents the
 * plans qualitatively and routes to the demo form. Publishing values later is a
 * content change on that page; nothing else here depends on it.
 *
 * History of the pre-launch posture: docs/foocci-site/pre-launch-mode-v1.md.
 */

export const LOGIN_URL = "/login";

/**
 * Sales WhatsApp. Still null: the launch conversion path is the demo form, which
 * persists every lead. Setting a number here lights up `whatsappUrl()` and the
 * WhatsApp CTAs without any other change.
 */
export const WHATSAPP_SALES_NUMBER: string | null = null;

/** Internal destinations used by the CTAs. */
export const COMO_FUNCIONA_URL = "/site/como-funciona";
export const PROPOSTA_URL = "/site/sobre";
export const DEMO_URL = "/site/demonstracao";
/** Agendamento real: o visitante escolhe um horário livre da agenda do fundador. */
export const AGENDAR_URL = "/site/agendar";
export const AGENDAR_LABEL = "Agendar uma conversa";

/** CTA copy. */
export const PRIMARY_CTA_LABEL = "Ver como o Foocci funciona";
export const SECONDARY_CTA_LABEL = "Conhecer a proposta";
/** Hero secondary + header CTA — the commercial conversion path. */
export const FOLLOW_LAUNCH_LABEL = "Solicitar demonstração";

/** Launch messaging. */
export const PRELAUNCH_BADGE = "Para restaurantes que querem ser donos dos próprios clientes";
export const PRELAUNCH_NOTE = "Fale com a gente e veja o Foocci no seu restaurante.";

const DEFAULT_WA_MESSAGE = "Olá! Quero saber mais sobre o Foocci.";

/** Returns a wa.me URL when a sales number is configured. */
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
  { href: "/site/precos", label: "Planos" },
  { href: "/site/demonstracao", label: "Demonstração" },
  { href: "/site/agendar", label: "Agendar conversa" },
];
