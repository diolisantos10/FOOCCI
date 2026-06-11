/**
 * Shared hero for internal marketing pages (/site/*). Server component.
 * Centered, white-dominant, single H1. Supports a primary + secondary CTA and
 * an optional pre-launch note.
 */

import type { ReactNode } from "react";
import Image from "next/image";
import { PrimaryCta, SecondaryCta } from "./Cta";
import { hasAsset, SITE_ASSETS } from "./siteAssets";

type PageHeroProps = {
  badge: string;
  title: ReactNode;
  subtitle: string;
  primaryLabel?: string;
  primaryHref?: string;
  secondaryLabel?: string;
  secondaryHref?: string;
  note?: string;
  /** Warm restaurant ambiance behind the hero (hospitality system). Default on. */
  ambient?: boolean;
};

export function PageHero({
  badge,
  title,
  subtitle,
  primaryLabel,
  primaryHref,
  secondaryLabel,
  secondaryHref,
  note,
  ambient = true,
}: PageHeroProps) {
  const hasCta = Boolean(primaryLabel || secondaryLabel);
  const warm = ambient && hasAsset(SITE_ASSETS.heroBackground);
  return (
    <section aria-labelledby="page-hero-title" className="relative overflow-hidden bg-white">
      {warm ? (
        /* Restaurant as stage — softened far behind the content, fading to white */
        <>
          <Image
            src={`/${SITE_ASSETS.heroBackground}`}
            alt=""
            aria-hidden
            fill
            priority
            sizes="100vw"
            className="-z-20 object-cover object-center opacity-30"
          />
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 -z-10 bg-gradient-to-b from-white/75 via-white/88 to-white"
          />
        </>
      ) : (
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-64 bg-gradient-to-b from-gray-50 to-white"
        />
      )}
      <div
        aria-hidden
        className="pointer-events-none absolute left-1/2 top-0 -z-10 h-72 w-[40rem] -translate-x-1/2 rounded-full bg-[radial-gradient(closest-side,rgba(249,115,22,0.07),transparent)]"
      />
      <div className="mx-auto max-w-3xl px-5 pb-12 pt-16 text-center lg:px-8 lg:pb-16 lg:pt-20">
        <span className="inline-flex items-center gap-2 rounded-full border border-brand-200 bg-brand-50 px-3 py-1 text-xs font-semibold text-brand-700 ring-1 ring-brand-100">
          <span className="h-1.5 w-1.5 rounded-full bg-brand-500" />
          {badge}
        </span>

        <h1 id="page-hero-title" className="mt-5 text-3xl font-semibold leading-[1.15] tracking-tight text-[#0B0B0B] sm:text-4xl lg:text-5xl">
          {title}
        </h1>

        <p className="mx-auto mt-5 max-w-2xl text-lg leading-relaxed text-gray-600">{subtitle}</p>

        {hasCta && (
          <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
            {primaryLabel && <PrimaryCta label={primaryLabel} href={primaryHref} className="w-full sm:w-auto" />}
            {secondaryLabel && <SecondaryCta label={secondaryLabel} href={secondaryHref} className="w-full sm:w-auto" />}
          </div>
        )}

        {note && <p className="mt-4 text-sm text-gray-500">{note}</p>}
      </div>
    </section>
  );
}
