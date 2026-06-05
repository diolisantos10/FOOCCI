/**
 * Shared section heading for the marketing site. Server component.
 *
 * Enforces one consistent rhythm across sections: a brand eyebrow, an H2 (with a
 * stable id so the parent <section> can be labelled via aria-labelledby) and an
 * optional subtitle. Centered by default; supports left alignment for split
 * (two-column) sections.
 */

import type { ReactNode } from "react";

export function SectionHeading({
  id,
  eyebrow,
  title,
  subtitle,
  align = "center",
  className = "",
}: {
  /** Used as the H2 id (pair with `aria-labelledby={id}` on the section). */
  id?: string;
  eyebrow?: string;
  title: ReactNode;
  subtitle?: ReactNode;
  align?: "center" | "left";
  className?: string;
}) {
  const centered = align === "center";
  return (
    <div className={`${centered ? "mx-auto max-w-2xl text-center" : "text-left"} ${className}`}>
      {eyebrow && (
        <span className="text-sm font-semibold uppercase tracking-widest text-brand-500">
          {eyebrow}
        </span>
      )}
      <h2
        id={id}
        className={`text-3xl font-bold tracking-tight text-[#0B0B0B] sm:text-4xl ${
          eyebrow ? "mt-3" : ""
        }`}
      >
        {title}
      </h2>
      {subtitle && (
        <p
          className={`mt-4 text-lg leading-relaxed text-gray-600 ${
            centered ? "mx-auto max-w-2xl" : "max-w-xl"
          }`}
        >
          {subtitle}
        </p>
      )}
    </div>
  );
}
