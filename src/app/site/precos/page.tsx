/**
 * /site/precos — PRE-LAUNCH. Inherits /site/layout.tsx.
 * No prices and no sales language: plans are being defined for the launch.
 */

import type { Metadata } from "next";
import { PageHero } from "@/components/marketing/PageHero";
import { CtaBand } from "@/components/marketing/CtaBand";
import { COMO_FUNCIONA_URL, PRELAUNCH_NOTE } from "@/components/marketing/config";

const TITLE = "Preços Foocci | Planos em definição para lançamento";
const DESCRIPTION =
  "Os planos da Foocci serão definidos para o lançamento comercial, pensados para diferentes momentos e tamanhos de operação de restaurante.";

export const metadata: Metadata = {
  title: { absolute: TITLE },
  description: DESCRIPTION,
  robots: { index: true, follow: true },
  openGraph: { type: "website", locale: "pt_BR", siteName: "Foocci", title: TITLE, description: DESCRIPTION },
};

const PLANS = [
  {
    name: "Essencial",
    forWho: "Restaurantes que querem começar a vender melhor no pedido direto.",
    copy: "Base para cardápio, pedido e organização comercial inicial.",
    highlighted: false,
  },
  {
    name: "Crescimento",
    forWho: "Restaurantes que querem unir pedido, WhatsApp e relacionamento.",
    copy: "Mais foco em CRM, campanhas e recorrência.",
    highlighted: true,
  },
  {
    name: "Performance",
    forWho: "Operações que precisam de mais inteligência comercial e acompanhamento.",
    copy: "Mais profundidade em dados, campanhas e oportunidades.",
    highlighted: false,
  },
];

export default function PrecosPage() {
  return (
    <>
      <PageHero
        badge="Planos · em definição"
        title="Planos em definição para o lançamento comercial."
        subtitle="A Foocci está em fase piloto. Os planos oficiais serão definidos para diferentes momentos, canais e tamanhos de operação."
        primaryLabel="Ver como a Foocci funciona"
        primaryHref={COMO_FUNCIONA_URL}
        note={PRELAUNCH_NOTE}
      />

      {/* Plan directions (no prices) */}
      <section aria-label="Direções de planos" className="bg-gray-50 py-20">
        <div className="mx-auto max-w-6xl px-5 lg:px-8">
          <div className="grid gap-6 lg:grid-cols-3">
            {PLANS.map((plan) => (
              <div
                key={plan.name}
                className={`relative flex flex-col rounded-2xl border bg-white p-7 ${
                  plan.highlighted
                    ? "border-brand-200 shadow-md ring-1 ring-brand-100"
                    : "border-gray-200 ring-1 ring-gray-900/[0.02]"
                }`}
              >
                <h2 className="text-xl font-bold text-[#0B0B0B]">{plan.name}</h2>
                <p className="mt-3 text-sm text-gray-500">
                  <span className="font-semibold text-gray-700">Para:</span> {plan.forWho}
                </p>
                <p className="mt-3 text-base text-gray-600">{plan.copy}</p>
                <p className="mt-6 rounded-xl bg-gray-50 px-4 py-3 text-sm font-semibold text-gray-600">
                  Em definição para o lançamento
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Why plans are defined at launch */}
      <section aria-labelledby="planos-porque-title" className="bg-white py-20">
        <div className="mx-auto max-w-3xl px-5 text-center lg:px-8">
          <h2 id="planos-porque-title" className="text-3xl font-bold tracking-tight text-[#0B0B0B] sm:text-4xl">
            Por que os planos serão definidos no lançamento?
          </h2>
          <p className="mt-5 text-lg leading-relaxed text-gray-600">
            Porque a Foocci se adapta ao tipo de restaurante, ao momento da operação,
            aos canais que você já usa e ao seu objetivo comercial. Estamos no piloto
            justamente para definir planos que façam sentido de verdade — sem promessas
            antes da hora.
          </p>
        </div>
      </section>

      <CtaBand
        title="Quer entender o que a Foocci pode fazer pela sua operação?"
        label="Conhecer como a Foocci funciona"
        href={COMO_FUNCIONA_URL}
      />
    </>
  );
}
