/**
 * Reusable CTA buttons for the marketing site (pre-launch mode).
 *
 * PrimaryCta + SecondaryCta are the only CTAs used right now. WhatsAppCta is
 * kept here RESERVED for launch but is intentionally not imported anywhere while
 * Foocci is in pilot (no WhatsApp sales links in pre-launch).
 */

import {
  COMO_FUNCIONA_URL,
  PROPOSTA_URL,
  PRIMARY_CTA_LABEL,
  SECONDARY_CTA_LABEL,
  ctaTarget,
  whatsappUrl,
} from "./config";
import { ArrowRightIcon, WhatsAppIcon } from "./icons";

type BtnProps = {
  className?: string;
  label?: string;
  href?: string;
  withArrow?: boolean;
  block?: boolean;
  /** Optional leading icon (mockup: play / calendar). */
  icon?: React.ReactNode;
};

export function PrimaryCta({
  className = "",
  label = PRIMARY_CTA_LABEL,
  href = COMO_FUNCIONA_URL,
  withArrow = true,
  block = false,
  icon,
}: BtnProps) {
  return (
    <a
      {...ctaTarget(href)}
      className={`inline-flex items-center justify-center gap-2 rounded-full bg-brand-500 px-6 py-3.5 text-base font-semibold text-white shadow-sm transition-colors hover:bg-brand-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-300 ${
        block ? "w-full" : ""
      } ${className}`}
    >
      {icon}
      {label}
      {withArrow && <ArrowRightIcon className="h-4 w-4" />}
    </a>
  );
}

export function SecondaryCta({
  className = "",
  label = SECONDARY_CTA_LABEL,
  href = PROPOSTA_URL,
  withArrow = false,
  block = false,
  icon,
}: BtnProps) {
  return (
    <a
      {...ctaTarget(href)}
      className={`inline-flex items-center justify-center gap-2 rounded-full border border-gray-300 bg-white px-6 py-3.5 text-base font-semibold text-gray-800 transition-colors hover:border-gray-400 hover:bg-gray-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-300 ${
        block ? "w-full" : ""
      } ${className}`}
    >
      {icon}
      {label}
      {withArrow && <ArrowRightIcon className="h-4 w-4" />}
    </a>
  );
}

/* ── RESERVED for launch — not used in pre-launch mode ───────────────────────── */

type WhatsAppProps = { className?: string; label?: string; block?: boolean; fallbackHref?: string };

export function WhatsAppCta({
  className = "",
  label = "Falar no WhatsApp",
  block = false,
  fallbackHref = COMO_FUNCIONA_URL,
}: WhatsAppProps) {
  const href = whatsappUrl() ?? fallbackHref;
  return (
    <a
      {...ctaTarget(href)}
      className={`inline-flex items-center justify-center gap-2 rounded-full border border-gray-300 bg-white px-6 py-3.5 text-base font-semibold text-gray-800 transition-colors hover:border-gray-400 hover:bg-gray-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-300 ${
        block ? "w-full" : ""
      } ${className}`}
    >
      <WhatsAppIcon className="h-5 w-5 text-[#25D366]" />
      {label}
    </a>
  );
}
