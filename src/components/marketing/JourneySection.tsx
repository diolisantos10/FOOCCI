/**
 * Journey — the V3 thesis translated visually. Server component.
 *
 * Cliente chega → Pedido guiado → CRM ativo → Campanha → Cliente volta.
 * Relationship → recurrence → revenue. Editorial horizontal line on desktop
 * (discreet orange connectors), stacked cards on mobile. No fake data.
 */

import { QrIcon, SparklesIcon, UsersIcon, MegaphoneIcon, RepeatIcon, ArrowRightIcon } from "./icons";
import { DotGrid, Eyebrow, PremiumCard, GradientRule } from "./premium";

const JOURNEY = [
  {
    icon: QrIcon,
    title: "Cliente chega",
    copy: "Recepção acolhedora e experiência personalizada desde o primeiro contato.",
  },
  {
    icon: SparklesIcon,
    title: "Pedido guiado",
    copy: "Cardápio inteligente e sugestões que aumentam satisfação e valor do pedido.",
  },
  {
    icon: UsersIcon,
    title: "CRM ativo",
    copy: "Dados que geram contexto e constroem relacionamentos relevantes.",
  },
  {
    icon: MegaphoneIcon,
    title: "Campanha",
    copy: "Comunicação no momento certo, com ofertas que fazem sentido.",
  },
  {
    icon: RepeatIcon,
    title: "Cliente volta",
    copy: "Experiências memoráveis criam preferência e geram recorrência natural.",
  },
];

export function JourneySection() {
  return (
    <section id="jornada" aria-labelledby="jornada-title" className="relative scroll-mt-20 overflow-hidden bg-white pb-20 pt-4 lg:pb-24">
      <div className="mx-auto max-w-6xl px-5 lg:px-8">
        <GradientRule className="mb-14" />
        <DotGrid className="[mask-image:radial-gradient(ellipse_at_bottom,black,transparent_65%)]" />

        <div className="relative mx-auto max-w-2xl text-center">
          <Eyebrow>A jornada Foocci</Eyebrow>
          <h2 id="jornada-title" className="mt-3 text-3xl font-semibold tracking-tight text-[#0B0B0B] sm:text-4xl">
            Relacionamento vira recorrência. Em cada etapa.
          </h2>
          <p className="mt-4 text-lg leading-relaxed text-gray-600">
            Do primeiro contato ao retorno: a Foocci conduz a experiência para o
            cliente voltar — e o faturamento crescer como consequência.
          </p>
        </div>

        {/* Desktop: editorial line with connectors · Mobile: stacked cards */}
        <div className="relative mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-5 lg:gap-3">
          {JOURNEY.map(({ icon: Icon, title, copy }, i) => (
            <div key={title} className="relative flex">
              <PremiumCard hover className="flex w-full flex-col p-5">
                <div className="flex items-center justify-between">
                  <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-50 text-brand-600 ring-1 ring-brand-100">
                    <Icon className="h-5 w-5" />
                  </span>
                  <span className="text-xs font-semibold tabular-nums text-gray-300">0{i + 1}</span>
                </div>
                <h3 className="mt-4 text-base font-semibold text-[#0B0B0B]">{title}</h3>
                <p className="mt-1.5 text-sm leading-relaxed text-gray-600">{copy}</p>
              </PremiumCard>

              {/* discreet orange connector between steps (desktop) */}
              {i < JOURNEY.length - 1 && (
                <span
                  aria-hidden
                  className="absolute -right-3 top-1/2 z-10 hidden h-6 w-6 -translate-y-1/2 items-center justify-center rounded-full bg-white text-brand-500 shadow-[0_4px_12px_-4px_rgba(15,23,42,0.25)] ring-1 ring-gray-900/[0.05] lg:flex"
                >
                  <ArrowRightIcon className="h-3.5 w-3.5" />
                </span>
              )}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
