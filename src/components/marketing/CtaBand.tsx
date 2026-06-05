/**
 * Reusable end-of-page CTA band for internal marketing pages. Server component.
 */

import { DEMO_URL, PRIMARY_CTA_LABEL } from "./config";
import { PrimaryCta } from "./Cta";

export function CtaBand({
  title,
  label = PRIMARY_CTA_LABEL,
  href = DEMO_URL,
}: {
  title: string;
  label?: string;
  href?: string;
}) {
  return (
    <section className="bg-white py-20">
      <div className="mx-auto max-w-4xl px-5 lg:px-8">
        <div className="rounded-3xl border border-gray-200 bg-gray-50 px-6 py-12 text-center sm:px-12">
          <h2 className="mx-auto max-w-2xl text-2xl font-semibold tracking-tight text-[#0B0B0B] sm:text-3xl">
            {title}
          </h2>
          <div className="mt-7 flex justify-center">
            <PrimaryCta label={label} href={href} />
          </div>
        </div>
      </div>
    </section>
  );
}
