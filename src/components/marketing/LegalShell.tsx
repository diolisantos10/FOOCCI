/**
 * Shared shell for legal pages (privacy / terms). Server component.
 *
 * TODO(legal): these are plain-language starter documents and require a final
 * legal / LGPD review before production use.
 */

import type { ReactNode } from "react";

export function LegalShell({
  title,
  lastUpdated,
  children,
}: {
  title: string;
  lastUpdated: string;
  children: ReactNode;
}) {
  return (
    <>
      <section aria-labelledby="legal-title" className="relative overflow-hidden bg-paper">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-48 bg-gradient-to-b from-canvas to-paper"
        />
        <div className="mx-auto max-w-3xl px-5 pb-8 pt-16 text-center lg:px-8 lg:pt-20">
          <span className="inline-flex items-center gap-2 rounded-full border border-line bg-paper px-3 py-1 text-xs font-semibold text-ink2">
            <span className="h-1.5 w-1.5 rounded-full bg-brand-500" />
            Legal
          </span>
          <h1 id="legal-title" className="mt-5 text-3xl font-semibold tracking-tight text-ink sm:text-4xl">{title}</h1>
          <p className="mt-3 text-sm text-muted">Última atualização: {lastUpdated}</p>
        </div>
      </section>

      <section className="bg-paper pb-20">
        <div className="mx-auto max-w-3xl space-y-8 px-5 lg:px-8">{children}</div>
      </section>
    </>
  );
}

export function LegalBlock({ heading, children }: { heading: string; children: ReactNode }) {
  return (
    <div>
      <h2 className="text-xl font-semibold text-ink">{heading}</h2>
      <div className="mt-3 space-y-3 text-base leading-relaxed text-ink2">{children}</div>
    </div>
  );
}
