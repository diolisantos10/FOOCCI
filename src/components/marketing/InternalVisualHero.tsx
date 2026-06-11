/**
 * InternalVisualHero — two-column hero for product-focused internal pages.
 * Server component. Pre-launch (no sales).
 *
 * Left: badge, H1, subtitle, optional CTAs and pilot note. Right: a visual node
 * (product showcase / mockup). A warm restaurant backdrop, veiled to white,
 * shares the home's hospitality language. Falls back to a clean white hero when
 * the backdrop asset is absent.
 */

import type { ReactNode } from "react";
import Image from "next/image";
import { PrimaryCta, SecondaryCta } from "./Cta";
import { hasAsset, SITE_ASSETS } from "./siteAssets";

type Props = {
  badge: string;
  title: ReactNode;
  subtitle: string;
  visual: ReactNode;
  primaryLabel?: string;
  primaryHref?: string;
  secondaryLabel?: string;
  secondaryHref?: string;
  note?: string;
};

export function InternalVisualHero({
  badge,
  title,
  subtitle,
  visual,
  primaryLabel,
  primaryHref,
  secondaryLabel,
  secondaryHref,
  note,
}: Props) {
  const warm = hasAsset(SITE_ASSETS.heroBackground);
  const hasCta = Boolean(primaryLabel || secondaryLabel);
  return (
    <section aria-labelledby="page-hero-title" className="relative overflow-hidden bg-white">
      {warm ? (
        <>
          <Image
            src={`/${SITE_ASSETS.heroBackground}`}
            alt=""
            aria-hidden
            fill
            priority
            sizes="100vw"
            className="-z-20 object-cover object-center opacity-25"
          />
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 -z-10 bg-gradient-to-b from-white/80 via-white/90 to-white"
          />
        </>
      ) : (
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-64 bg-gradient-to-b from-gray-50 to-white"
        />
      )}

      <div className="mx-auto grid max-w-7xl items-center gap-10 px-5 pb-14 pt-14 lg:grid-cols-[1fr_1.05fr] lg:gap-8 lg:px-8 lg:pb-20 lg:pt-20">
        <div className="relative z-10 text-center lg:text-left">
          <span className="inline-flex items-center gap-2 rounded-full border border-brand-200 bg-brand-50 px-3 py-1 text-xs font-semibold text-brand-700 ring-1 ring-brand-100">
            <span className="h-1.5 w-1.5 rounded-full bg-brand-500" />
            {badge}
          </span>
          <h1
            id="page-hero-title"
            className="mt-5 text-[2rem] font-semibold leading-[1.1] tracking-tight text-[#0B0B0B] sm:text-4xl lg:text-[2.9rem]"
          >
            {title}
          </h1>
          <p className="mx-auto mt-5 max-w-xl text-lg leading-relaxed text-gray-600 lg:mx-0">{subtitle}</p>
          {hasCta && (
            <div className="mt-8 flex flex-col items-center gap-3 sm:flex-row lg:justify-start">
              {primaryLabel && <PrimaryCta label={primaryLabel} href={primaryHref} className="w-full sm:w-auto" />}
              {secondaryLabel && (
                <SecondaryCta label={secondaryLabel} href={secondaryHref} className="w-full sm:w-auto" />
              )}
            </div>
          )}
          {note && <p className="mt-4 text-sm text-gray-500">{note}</p>}
        </div>

        <div className="relative z-10">{visual}</div>
      </div>
    </section>
  );
}
