/**
 * VisualStoryBlock — reusable premium narrative block for internal pages.
 * Server component. Pre-launch.
 *
 * Eyebrow + title + copy on one side and a visual composition on the other, over
 * a warm (veiled restaurant), dark or light atmosphere — so internal sections
 * carry the same premium force as the home, instead of "text + a thrown image".
 * Stacks on mobile. No fake data, no metrics.
 */

import type { ReactNode } from "react";
import Image from "next/image";
import { Eyebrow } from "./premium";
import { hasAsset, SITE_ASSETS } from "./siteAssets";

type Tone = "warm" | "dark" | "light";

type Props = {
  eyebrow?: string;
  title: ReactNode;
  titleId?: string;
  children: ReactNode;
  visual: ReactNode;
  tone?: Tone;
  reverse?: boolean;
  className?: string;
};

const SURFACE: Record<Tone, string> = {
  warm: "bg-[#fbf6ef]",
  dark: "bg-[#0B0B0B]",
  light: "bg-white",
};

export function VisualStoryBlock({
  eyebrow,
  title,
  titleId,
  children,
  visual,
  tone = "warm",
  reverse = false,
  className = "",
}: Props) {
  const dark = tone === "dark";
  const warm = tone === "warm" && hasAsset(SITE_ASSETS.heroBackground);
  return (
    <section
      aria-labelledby={titleId}
      className={`relative overflow-hidden ${SURFACE[tone]} py-20 lg:py-24 ${className}`}
    >
      {/* Warm restaurant atmosphere (veiled), so the block shares the home's stage */}
      {warm && (
        <>
          <Image
            src={`/${SITE_ASSETS.heroBackground}`}
            alt=""
            aria-hidden
            fill
            sizes="100vw"
            className="z-0 object-cover object-center opacity-[0.12]"
          />
          <div
            aria-hidden
            className="absolute inset-0 z-0 bg-gradient-to-b from-[#fbf6ef]/45 via-[#fbf6ef]/35 to-[#fbf6ef]/85"
          />
        </>
      )}
      {dark && (
        <div
          aria-hidden
          className="absolute left-1/2 top-0 z-0 h-72 w-[40rem] -translate-x-1/2 rounded-full bg-[radial-gradient(closest-side,rgba(249,115,22,0.16),transparent)]"
        />
      )}

      <div className="relative z-10 mx-auto grid max-w-6xl items-center gap-10 px-5 lg:grid-cols-2 lg:gap-14 lg:px-8">
        <div className={reverse ? "lg:order-2" : ""}>
          {eyebrow && <Eyebrow>{eyebrow}</Eyebrow>}
          <h2
            id={titleId}
            className={`mt-3 text-3xl font-semibold tracking-tight sm:text-4xl ${dark ? "text-white" : "text-[#0B0B0B]"}`}
          >
            {title}
          </h2>
          <div className={`mt-5 space-y-4 text-lg leading-relaxed ${dark ? "text-gray-300" : "text-gray-600"}`}>
            {children}
          </div>
        </div>
        <div className={`relative ${reverse ? "lg:order-1" : ""}`}>{visual}</div>
      </div>
    </section>
  );
}
