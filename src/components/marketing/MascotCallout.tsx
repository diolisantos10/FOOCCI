/**
 * MascotCallout — the official Foocci mascot as institutional host beside a short
 * callout. Server component. Masculine voice ("o Foocci"). Presentation only.
 *
 * The mascot PNG carries a soft #f8f8f8 plate that blends into the light panel,
 * so there is no visible seam.
 */

import type { ReactNode } from "react";
import Image from "next/image";
import { DotGrid, Halo, Eyebrow } from "./premium";

type Props = {
  eyebrow?: string;
  title: ReactNode;
  children: ReactNode;
  reverse?: boolean;
  className?: string;
};

export function MascotCallout({ eyebrow, title, children, reverse = false, className = "" }: Props) {
  return (
    <div className={`grid items-center gap-8 lg:grid-cols-2 lg:gap-12 ${className}`}>
      <div className={`relative mx-auto w-full max-w-sm ${reverse ? "lg:order-2" : ""}`}>
        <div className="relative flex items-end justify-center overflow-hidden rounded-[2rem] bg-gradient-to-b from-gray-50 to-white ring-1 ring-gray-900/[0.05]">
          <DotGrid />
          <Halo className="left-1/2 top-3 h-44 w-44 -translate-x-1/2" />
          <Image
            src="/brand/foocci/foocci-mascot.png"
            alt="Mascote do Foocci, anfitrião do restaurante"
            width={196}
            height={321}
            className="relative h-56 w-auto sm:h-64"
          />
        </div>
      </div>
      <div className={reverse ? "lg:order-1" : ""}>
        {eyebrow && <Eyebrow>{eyebrow}</Eyebrow>}
        <h2 className="mt-3 text-3xl font-semibold tracking-tight text-[#0B0B0B] sm:text-4xl">{title}</h2>
        <div className="mt-5 space-y-4 text-lg leading-relaxed text-gray-600">{children}</div>
      </div>
    </div>
  );
}
