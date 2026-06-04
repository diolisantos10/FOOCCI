/**
 * Reusable CTA buttons for the marketing site.
 *
 * Plain presentational anchors (no hooks) so they can be used inside both
 * server and client section components.
 */

import {
  DEMO_URL,
  PRIMARY_CTA_LABEL,
  WHATSAPP_CTA_LABEL,
  ctaTarget,
  whatsappUrl,
} from "./config";
import { ArrowRightIcon, WhatsAppIcon } from "./icons";

type PrimaryProps = {
  className?: string;
  label?: string;
  href?: string;
  withArrow?: boolean;
  block?: boolean;
};

export function PrimaryCta({
  className = "",
  label = PRIMARY_CTA_LABEL,
  href = DEMO_URL,
  withArrow = true,
  block = false,
}: PrimaryProps) {
  return (
    <a
      {...ctaTarget(href)}
      className={`inline-flex items-center justify-center gap-2 rounded-full bg-brand-500 px-6 py-3.5 text-base font-semibold text-white shadow-sm transition-colors hover:bg-brand-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-300 ${
        block ? "w-full" : ""
      } ${className}`}
    >
      {label}
      {withArrow && <ArrowRightIcon className="h-4 w-4" />}
    </a>
  );
}

type WhatsAppProps = {
  className?: string;
  label?: string;
  block?: boolean;
  /** Where to send the user when no WhatsApp number is configured. */
  fallbackHref?: string;
};

/**
 * "Falar no WhatsApp" — opens WhatsApp when a sales number is configured,
 * otherwise routes to the demo page (or a custom fallback).
 */
export function WhatsAppCta({
  className = "",
  label = WHATSAPP_CTA_LABEL,
  block = false,
  fallbackHref = DEMO_URL,
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
