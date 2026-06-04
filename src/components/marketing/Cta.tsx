/**
 * Reusable CTA buttons for the marketing site.
 *
 * Plain presentational anchors (no hooks) so they can be used inside both
 * server and client section components.
 */

import {
  DEMO_ANCHOR,
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
  href = DEMO_ANCHOR,
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
};

/**
 * "Falar no WhatsApp" — opens WhatsApp when a sales number is configured,
 * otherwise scrolls to the on-page demo section (documented fallback).
 */
export function WhatsAppCta({ className = "", label = WHATSAPP_CTA_LABEL, block = false }: WhatsAppProps) {
  const href = whatsappUrl() ?? DEMO_ANCHOR;
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
