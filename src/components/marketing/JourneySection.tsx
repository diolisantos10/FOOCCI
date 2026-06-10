/**
 * Journey — the V3 thesis translated visually. Server component.
 *
 * Cliente chega → Pedido guiado → CRM ativo → Campanha → Cliente volta.
 * Relationship → recurrence → revenue. A warm editorial panel with large medallions,
 * numbered badges and dotted orange connectors (desktop); stacked on mobile. No
 * photos, no fake data.
 */

import { QrIcon, SparklesIcon, UsersIcon, MegaphoneIcon, RepeatIcon } from "./icons";
import { Eyebrow } from "./premium";

const JOURNEY = [
  { icon: QrIcon, title: "Cliente chega", copy: "Recepção acolhedora e experiência personalizada desde o primeiro contato." },
  { icon: SparklesIcon, title: "Pedido guiado", copy: "Cardápio inteligente e sugestões que aumentam satisfação e valor do pedido." },
  { icon: UsersIcon, title: "CRM ativo", copy: "Dados que geram contexto e constroem relacionamentos relevantes." },
  { icon: MegaphoneIcon, title: "Campanha", copy: "Comunicação no momento certo, com ofertas que fazem sentido." },
  { icon: RepeatIcon, title: "Cliente volta", copy: "Experiências memoráveis criam preferência e geram recorrência natural." },
];

export function JourneySection() {
  return (
    <section id="jornada" aria-labelledby="jornada-title" className="relative scroll-mt-20 bg-white pb-20 pt-2 lg:pb-24">
      <div className="mx-auto max-w-6xl px-5 lg:px-8">
        <div className="mx-auto max-w-2xl text-center">
          <Eyebrow>A jornada Foocci</Eyebrow>
          <h2 id="jornada-title" className="mt-3 text-3xl font-semibold tracking-tight text-[#0B0B0B] sm:text-4xl">
            Relacionamento vira recorrência. Em cada etapa.
          </h2>
          <p className="mt-4 text-lg leading-relaxed text-gray-600">
            Do primeiro contato ao retorno: a Foocci conduz a experiência para o
            cliente voltar — e o faturamento crescer como consequência.
          </p>
        </div>

        {/* Warm editorial panel */}
        <div className="relative mt-12 overflow-hidden rounded-[2rem] border border-amber-100/70 bg-gradient-to-b from-[#fdf6ee] to-white p-6 shadow-[0_2px_4px_rgba(120,72,20,0.05),0_24px_50px_-28px_rgba(120,72,20,0.30)] sm:p-9 lg:p-10">
          <div className="grid gap-x-3 gap-y-9 sm:grid-cols-2 lg:grid-cols-5">
            {JOURNEY.map(({ icon: Icon, title, copy }, i) => (
              <div key={title} className="relative flex flex-col items-center text-center">
                {/* dotted orange connector to the next step (desktop) */}
                {i < JOURNEY.length - 1 && (
                  <span
                    aria-hidden
                    className="absolute left-[60%] top-10 hidden w-full border-t-2 border-dashed border-brand-300 lg:block"
                  />
                )}

                {/* medallion */}
                <span className="relative z-10 flex h-20 w-20 items-center justify-center rounded-full bg-gradient-to-br from-brand-50 to-amber-50 text-brand-600 ring-1 ring-brand-100 shadow-[inset_0_1px_2px_rgba(255,255,255,0.8),0_10px_24px_-12px_rgba(120,72,20,0.35)]">
                  <Icon className="h-8 w-8" />
                  <span className="absolute -bottom-1 -right-1 flex h-6 w-6 items-center justify-center rounded-full bg-brand-500 text-[11px] font-bold text-white ring-2 ring-white">
                    {i + 1}
                  </span>
                </span>

                <h3 className="mt-4 text-base font-semibold text-[#0B0B0B]">{title}</h3>
                <p className="mt-1.5 max-w-[15rem] text-sm leading-relaxed text-gray-600">{copy}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
