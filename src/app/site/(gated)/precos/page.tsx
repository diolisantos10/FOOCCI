/**
 * /site/precos — PRE-LAUNCH. Inherits /site/layout.tsx.
 * No prices and no sales language: plans are being defined for the launch. The
 * page now carries more design — plan directions, a maturity ladder and a
 * "value before price" band. Masculine voice ("o Foocci").
 */

import type { Metadata } from "next";
import { PageHero } from "@/components/marketing/PageHero";
import { CtaBand } from "@/components/marketing/CtaBand";
import { VisualStepCard } from "@/components/marketing/VisualStepCard";
import { DotGrid, Eyebrow } from "@/components/marketing/premium";
import { TrendingUpIcon, UsersIcon, RepeatIcon } from "@/components/marketing/icons";
import { COMO_FUNCIONA_URL, AGENDAR_URL, PRELAUNCH_NOTE } from "@/components/marketing/config";

const TITLE = "Planos Foocci | Um plano para cada momento do restaurante";
const DESCRIPTION =
  "O Foocci tem planos para diferentes momentos e tamanhos de operação. Peça uma demonstração e monte a proposta certa para o seu restaurante.";

export const metadata: Metadata = {
  title: { absolute: TITLE },
  description: DESCRIPTION,
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

const MATURITY = [
  { icon: TrendingUpIcon, title: "Começar a vender direto", copy: "Tirar o pedido do papel e vender melhor pelos canais diretos do restaurante." },
  { icon: UsersIcon, title: "Organizar relacionamento", copy: "Reunir clientes, histórico e contexto em um só lugar." },
  { icon: RepeatIcon, title: "Criar recorrência", copy: "Ativar campanhas e reativação para o cliente voltar com mais frequência." },
];

export default function PrecosPage() {
  return (
    <>
      <PageHero
        badge="Planos"
        title="Um plano para cada momento do seu restaurante."
        subtitle="O valor depende do tamanho da operação e do que você vai usar. Peça uma demonstração e a gente apresenta a proposta certa — sem compromisso."
        primaryLabel="Agendar demonstração"
        primaryHref={AGENDAR_URL}
        note={PRELAUNCH_NOTE}
      />

      {/* Plan directions (no prices) */}
      <section aria-label="Direções de planos" className="relative overflow-hidden bg-gray-50 py-20 lg:py-24">
        <DotGrid className="[mask-image:radial-gradient(ellipse_at_top,black,transparent_70%)]" />
        <div className="relative mx-auto max-w-6xl px-5 lg:px-8">
          <div className="grid gap-6 lg:grid-cols-3">
            {PLANS.map((plan) => (
              <div
                key={plan.name}
                className={`relative flex flex-col rounded-2xl border bg-white p-7 shadow-[0_1px_2px_rgba(15,23,42,0.04),0_14px_34px_-20px_rgba(15,23,42,0.22)] ${
                  plan.highlighted
                    ? "border-brand-200 ring-1 ring-brand-100"
                    : "border-gray-200/80 ring-1 ring-gray-900/[0.02]"
                }`}
              >
                {plan.highlighted && (
                  <span className="absolute right-6 top-7 rounded-full bg-brand-50 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-brand-600 ring-1 ring-brand-100">
                    Destaque
                  </span>
                )}
                <h2 className="text-xl font-semibold text-[#0B0B0B]">{plan.name}</h2>
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

      {/* Maturity ladder + value-before-price band */}
      <section aria-labelledby="maturidade-title" className="bg-white py-20 lg:py-24">
        <div className="mx-auto max-w-6xl px-5 lg:px-8">
          <div className="mx-auto max-w-2xl text-center">
            <Eyebrow>Antes de preço, proposta de valor</Eyebrow>
            <h2 id="maturidade-title" className="mt-3 text-3xl font-semibold tracking-tight text-[#0B0B0B] sm:text-4xl">
              Planos que acompanham o momento do seu restaurante.
            </h2>
            <p className="mt-4 text-lg leading-relaxed text-gray-600">
              Você fala com a gente, a gente entende sua operação e monta a proposta.
              A ideia é acompanhar o momento do restaurante — do pedido direto à
              recorrência inteligente.
            </p>
          </div>

          <div className="mt-12 grid gap-5 md:grid-cols-3">
            {MATURITY.map((m, i) => (
              <VisualStepCard key={m.title} index={i + 1} icon={m.icon} title={m.title} copy={m.copy} />
            ))}
          </div>

          <div className="mt-12 overflow-hidden rounded-3xl bg-[#0B0B0B] px-6 py-8 text-center sm:px-10">
            <p className="text-xl font-semibold tracking-tight text-white sm:text-2xl">
              Antes de preço, <span className="text-brand-400">proposta de valor.</span>
            </p>
            <p className="mx-auto mt-3 max-w-xl text-base leading-relaxed text-gray-400">
              Estamos no piloto justamente para definir planos que façam sentido de
              verdade — sem promessas antes da hora.
            </p>
          </div>
        </div>
      </section>

      {/* Why plans are defined at launch */}
      <section aria-labelledby="planos-porque-title" className="bg-gray-50 py-20">
        <div className="mx-auto max-w-3xl px-5 text-center lg:px-8">
          <h2 id="planos-porque-title" className="text-3xl font-semibold tracking-tight text-[#0B0B0B] sm:text-4xl">
            Por que os planos serão definidos no lançamento?
          </h2>
          <p className="mt-5 text-lg leading-relaxed text-gray-600">
            Porque o Foocci se adapta ao tipo de restaurante, ao momento da operação,
            aos canais que você já usa e ao seu objetivo comercial. Estamos no piloto
            justamente para definir planos que façam sentido de verdade — sem promessas
            antes da hora.
          </p>
        </div>
      </section>

      <CtaBand
        title="Quer saber quanto fica para o seu restaurante?"
        label="Agendar demonstração"
        href={AGENDAR_URL}
      />
    </>
  );
}
