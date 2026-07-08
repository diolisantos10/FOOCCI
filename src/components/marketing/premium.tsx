/**
 * Foocci Premium Pre-launch System — shared visual primitives. Server components.
 *
 * Subtle depth for a "minimalismo premium com hospitalidade moderna" feel WITHOUT
 * clutter: faint dot-grid, controlled orange halos, off-white surfaces, elegant
 * cards and a tasteful mascot panel. 90% neutro + 10% laranja.
 *
 * No fake data, no metrics — purely presentational brand layers.
 */

import type { ReactNode } from "react";
import Image from "next/image";

/* ── Background depth ─────────────────────────────────────────────────────────── */

/** Faint dot grid, edge-masked so it never reads as a "techy" pattern. Decorative. */
export function DotGrid({ className = "" }: { className?: string }) {
  return (
    <div
      aria-hidden
      className={`pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(circle_at_center,rgba(11,11,11,0.05)_1px,transparent_1px)] [background-size:22px_22px] [mask-image:radial-gradient(ellipse_at_center,black,transparent_72%)] ${className}`}
    />
  );
}

/** Soft brand-orange halo (controlled, ≤14% opacity). Decorative. */
export function Halo({
  className = "",
  color = "rgba(249,115,22,0.12)",
}: {
  className?: string;
  color?: string;
}) {
  return (
    <div
      aria-hidden
      style={{ background: `radial-gradient(closest-side, ${color}, transparent)` }}
      className={`pointer-events-none absolute -z-10 rounded-full ${className}`}
    />
  );
}

/** Top→bottom neutral wash, for off-white section surfaces. Decorative. */
export function TopWash({ className = "" }: { className?: string }) {
  return (
    <div
      aria-hidden
      className={`pointer-events-none absolute inset-x-0 top-0 -z-10 h-64 bg-gradient-to-b from-gray-50 to-transparent ${className}`}
    />
  );
}

/** Hairline gradient divider — a more sophisticated separator than a flat border. */
export function GradientRule({ className = "" }: { className?: string }) {
  return (
    <div
      aria-hidden
      className={`h-px w-full bg-gradient-to-r from-transparent via-gray-200 to-transparent ${className}`}
    />
  );
}

/* ── Surfaces ─────────────────────────────────────────────────────────────────── */

/** One consistent premium card: soft border, layered shadow, subtle ring. */
export function PremiumCard({
  children,
  className = "",
  hover = false,
}: {
  children: ReactNode;
  className?: string;
  hover?: boolean;
}) {
  return (
    <div
      className={`rounded-2xl border border-gray-200/80 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04),0_14px_34px_-20px_rgba(15,23,42,0.22)] ring-1 ring-gray-900/[0.02] ${
        hover ? "transition-shadow duration-300 hover:shadow-[0_2px_4px_rgba(15,23,42,0.05),0_22px_48px_-22px_rgba(15,23,42,0.30)]" : ""
      } ${className}`}
    >
      {children}
    </div>
  );
}

/** Small uppercase brand eyebrow. */
export function Eyebrow({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <span className={`text-xs font-semibold uppercase tracking-[0.18em] text-brand-500 ${className}`}>
      {children}
    </span>
  );
}

/** Pre-launch / status micro-badge with a live dot. */
export function BrandBadge({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <span
      className={`inline-flex items-center gap-2 rounded-full border border-brand-200 bg-brand-50 px-3 py-1 text-xs font-semibold text-brand-700 ring-1 ring-brand-100 ${className}`}
    >
      <span className="relative flex h-1.5 w-1.5">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-brand-400 opacity-75" />
        <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-brand-500" />
      </span>
      {children}
    </span>
  );
}

/* ── Mascot ───────────────────────────────────────────────────────────────────── */

/**
 * Official mascot inside a premium light panel (its #f8f8f8 plate blends into the
 * soft surface, so no seam). Used with moderation — institutional brand warmth.
 */
export function MascotPanel({
  className = "",
  imgClassName = "h-44 w-auto",
  glow = true,
  alt = "Mascote do Foocci",
}: {
  className?: string;
  imgClassName?: string;
  glow?: boolean;
  alt?: string;
}) {
  return (
    <div
      className={`relative flex items-end justify-center overflow-hidden rounded-3xl bg-gradient-to-b from-gray-50 to-white ring-1 ring-gray-900/[0.04] ${className}`}
    >
      <DotGrid />
      {glow && <Halo className="left-1/2 top-2 h-44 w-44 -translate-x-1/2" />}
      <Image
        src="/brand/foocci/foocci-mascot.png"
        alt={alt}
        width={503}
        height={875}
        className={`relative ${imgClassName}`}
      />
    </div>
  );
}

/** Tiny floating mascot avatar (for hero composition). Decorative. */
export function MascotAvatar({ className = "" }: { className?: string }) {
  return (
    <span
      aria-hidden
      className={`inline-flex h-14 w-14 items-center justify-center overflow-hidden rounded-2xl bg-gray-50 ring-1 ring-gray-900/[0.04] ${className}`}
    >
      <Image src="/brand/foocci/foocci-mascot.png" alt="" width={503} height={875} className="h-12 w-auto" />
    </span>
  );
}
