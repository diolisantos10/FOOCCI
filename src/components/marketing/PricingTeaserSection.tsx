/**
 * Pricing teaser (home) — pre-launch. Server component.
 * No prices and no "demonstração" language: plans are being defined for launch.
 */

import { PrimaryCta } from "./Cta";
import { COMO_FUNCIONA_URL } from "./config";

const PLANS = [
  { name: "Essencial", desc: "Para começar a vender melhor pelos canais diretos.", highlighted: false },
  { name: "Crescimento", desc: "Para ativar relacionamento e recorrência.", highlighted: true },
  { name: "Performance", desc: "Para escalar vendas com inteligência comercial.", highlighted: false },
];

export function PricingTeaserSection() {
  return (
    <section id="precos" aria-labelledby="planos-title" className="scroll-mt-20 bg-gray-50 py-20">
      <div className="mx-auto max-w-6xl px-5 lg:px-8">
        <div className="mx-auto max-w-2xl text-center">
          <span className="text-sm font-semibold uppercase tracking-widest text-brand-500">Planos</span>
          <h2 id="planos-title" className="mt-3 text-3xl font-semibold tracking-tight text-[#0B0B0B] sm:text-4xl">
            Planos serão apresentados no lançamento comercial.
          </h2>
          <p className="mt-4 text-lg text-gray-600">
            O Foocci está em fase piloto. Os planos oficiais serão definidos para
            diferentes momentos e tamanhos de operação.
          </p>
        </div>

        <div className="mt-12 grid gap-6 lg:grid-cols-3">
          {PLANS.map((plan) => (
            <div
              key={plan.name}
              className={`relative flex flex-col rounded-2xl border bg-white p-7 ${
                plan.highlighted ? "border-brand-200 shadow-md ring-1 ring-brand-100" : "border-gray-200"
              }`}
            >
              <h3 className="text-xl font-semibold text-[#0B0B0B]">{plan.name}</h3>
              <p className="mt-2 text-base text-gray-600">{plan.desc}</p>
              <p className="mt-6 rounded-xl bg-gray-50 px-4 py-3 text-sm font-semibold text-gray-600">
                Em definição para o lançamento
              </p>
            </div>
          ))}
        </div>

        <div className="mt-10 flex justify-center">
          <PrimaryCta label="Conhecer como o Foocci funciona" href={COMO_FUNCIONA_URL} />
        </div>
      </div>
    </section>
  );
}
