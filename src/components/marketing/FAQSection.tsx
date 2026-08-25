"use client";

/**
 * FAQ accordion (home). Client component. Includes pre-launch questions.
 */

import { useState } from "react";
import { PlusIcon } from "./icons";
import { FAQS } from "@/lib/site/faq";

// O texto mora em `@/lib/site/faq` — o TA (o vendedor de IA) lê a MESMA
// fonte do lado do servidor. Duas cópias fariam o site dizer uma coisa ao
// visitante e o vendedor dizer outra ao mesmo visitante, no mesmo dia.

export function FAQSection() {
  const [open, setOpen] = useState<number | null>(0);

  return (
    <section id="perguntas" aria-labelledby="perguntas-title" className="scroll-mt-20 bg-white py-20">
      <div className="mx-auto max-w-3xl px-5 lg:px-8">
        <div className="text-center">
          <span className="text-sm font-semibold uppercase tracking-widest text-brand-500">Dúvidas</span>
          <h2 id="perguntas-title" className="mt-3 text-3xl font-semibold tracking-tight text-[#0B0B0B] sm:text-4xl">
            Perguntas frequentes
          </h2>
        </div>

        <div className="mt-10 divide-y divide-gray-200 overflow-hidden rounded-2xl border border-gray-200 bg-white ring-1 ring-gray-900/[0.02]">
          {FAQS.map((item, i) => {
            const isOpen = open === i;
            return (
              <div key={item.q}>
                <button
                  type="button"
                  onClick={() => setOpen(isOpen ? null : i)}
                  aria-expanded={isOpen}
                  aria-controls={`faq-panel-${i}`}
                  id={`faq-button-${i}`}
                  className="flex w-full items-center justify-between gap-4 px-5 py-5 text-left hover:bg-gray-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-400"
                >
                  <span className="text-base font-semibold text-[#0B0B0B]">{item.q}</span>
                  <PlusIcon
                    className={`h-5 w-5 shrink-0 text-brand-500 transition-transform duration-200 ${
                      isOpen ? "rotate-45" : ""
                    }`}
                  />
                </button>
                {isOpen && (
                  <p
                    id={`faq-panel-${i}`}
                    role="region"
                    aria-labelledby={`faq-button-${i}`}
                    className="px-5 pb-5 text-base leading-relaxed text-gray-600"
                  >
                    {item.a}
                  </p>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
