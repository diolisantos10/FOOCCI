/**
 * Pricing teaser. Server component.
 * No currency values (none exist in the codebase / none provided). Each plan
 * shows "Configuração sob demonstração" and a fit line (not fixed features).
 */

import { PrimaryCta } from "./Cta";

const PLANS = [
  {
    name: "Essencial",
    desc: "Para começar a vender melhor pelos canais diretos.",
    fit: "Começar a vender melhor pelos canais diretos.",
    highlighted: false,
  },
  {
    name: "Crescimento",
    desc: "Para ativar relacionamento e recorrência.",
    fit: "Ativar CRM, campanhas e recorrência.",
    highlighted: true,
  },
  {
    name: "Performance",
    desc: "Para escalar vendas com inteligência comercial.",
    fit: "Escalar vendas com mais inteligência comercial.",
    highlighted: false,
  },
];

export function PricingTeaserSection() {
  return (
    <section id="precos" className="scroll-mt-20 bg-gray-50 py-20">
      <div className="mx-auto max-w-6xl px-5 lg:px-8">
        <div className="mx-auto max-w-2xl text-center">
          <span className="text-sm font-semibold uppercase tracking-widest text-brand-500">Preços</span>
          <h2 className="mt-3 text-3xl font-bold tracking-tight text-[#0B0B0B] sm:text-4xl">
            Planos pensados para diferentes momentos do restaurante.
          </h2>
          <p className="mt-4 text-lg text-gray-600">
            Comece com uma demonstração para entender qual configuração faz sentido
            para sua operação.
          </p>
        </div>

        <div className="mt-12 grid gap-6 lg:grid-cols-3">
          {PLANS.map((plan) => (
            <div
              key={plan.name}
              className={`relative flex flex-col rounded-2xl border p-7 ${
                plan.highlighted
                  ? "border-brand-200 bg-white shadow-md ring-1 ring-brand-100"
                  : "border-gray-200 bg-white"
              }`}
            >
              {plan.highlighted && (
                <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-brand-500 px-3 py-1 text-xs font-semibold text-white">
                  Mais escolhido
                </span>
              )}
              <h3 className="text-xl font-bold text-[#0B0B0B]">{plan.name}</h3>
              <p className="mt-2 text-base text-gray-600">{plan.desc}</p>

              <p className="mt-5 text-sm text-gray-500">
                <span className="font-semibold text-gray-700">Indicado para:</span> {plan.fit}
              </p>

              <p className="mt-5 rounded-xl bg-gray-50 px-4 py-3 text-sm font-semibold text-gray-700">
                Configuração sob demonstração
              </p>
              <div className="mt-6">
                <PrimaryCta label="Ver melhor plano para meu restaurante" withArrow={false} block />
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
