/**
 * /site/precos — pricing direction without fake values. Inherits /site/layout.tsx.
 */

import type { Metadata } from "next";
import { PageHero } from "@/components/marketing/PageHero";
import { CtaBand } from "@/components/marketing/CtaBand";
import { PrimaryCta } from "@/components/marketing/Cta";

const TITLE = "Preços Foocci | Planos para restaurantes";
const DESCRIPTION =
  "Conheça os planos da Foocci para restaurantes que querem vender mais, ativar CRM, atender melhor no WhatsApp e aumentar recorrência.";

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
        badge="Planos"
        title="Planos pensados para diferentes momentos do restaurante."
        subtitle="A melhor configuração depende do tamanho da operação, canais de atendimento, volume de pedidos e nível de CRM desejado."
      />

      {/* 1. Pricing cards (no fake prices) */}
      <section className="bg-gray-50 py-20">
        <div className="mx-auto max-w-6xl px-5 lg:px-8">
          <div className="grid gap-6 lg:grid-cols-3">
            {PLANS.map((plan) => (
              <div
                key={plan.name}
                className={`relative flex flex-col rounded-2xl border bg-white p-7 ${
                  plan.highlighted ? "border-brand-200 shadow-md ring-1 ring-brand-100" : "border-gray-200"
                }`}
              >
                {plan.highlighted && (
                  <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-brand-500 px-3 py-1 text-xs font-semibold text-white">
                    Mais escolhido
                  </span>
                )}
                <h2 className="text-xl font-bold text-[#0B0B0B]">{plan.name}</h2>
                <p className="mt-3 text-sm text-gray-500">
                  <span className="font-semibold text-gray-700">Para:</span> {plan.forWho}
                </p>
                <p className="mt-3 text-base text-gray-600">{plan.copy}</p>
                <p className="mt-6 rounded-xl bg-gray-50 px-4 py-3 text-sm font-semibold text-gray-700">
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

      {/* 2. Why demo first */}
      <section className="bg-white py-20">
        <div className="mx-auto max-w-3xl px-5 text-center lg:px-8">
          <h2 className="text-3xl font-bold tracking-tight text-[#0B0B0B] sm:text-4xl">
            Por que começamos pela demonstração?
          </h2>
          <p className="mt-5 text-lg leading-relaxed text-gray-600">
            Porque a Foocci se adapta ao tipo de restaurante, ao momento da operação,
            aos canais que você já usa e ao seu objetivo comercial. A demonstração é a
            forma mais honesta de indicar a configuração certa — sem empurrar um plano
            que não faz sentido para você.
          </p>
        </div>
      </section>

      {/* 3. CTA */}
      <CtaBand title="Vamos entender o melhor plano para sua operação?" label="Solicitar demonstração" />
    </>
  );
}
