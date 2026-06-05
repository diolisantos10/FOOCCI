/**
 * "Hospitalidade digital inteligente" — proprietary brand section. Server component.
 *
 * Differentiates Foocci from generic SaaS: the mascot (institutional warmth) beside
 * an editorial statement + four experience cards. Backstage vs frontstage — the
 * restaurant stays the protagonist. No metrics, no fake data.
 */

import { SparklesIcon, ChatIcon, HeartIcon, RepeatIcon } from "./icons";
import { DotGrid, Halo, Eyebrow, PremiumCard, MascotPanel } from "./premium";

const EXPERIENCES = [
  { icon: SparklesIcon, title: "Pedido mais simples", desc: "Uma jornada guiada, visual e sem atrito até a finalização." },
  { icon: ChatIcon, title: "Atendimento com contexto", desc: "Conversas que lembram o cliente e o histórico — não recomeçam do zero." },
  { icon: HeartIcon, title: "Relacionamento contínuo", desc: "A relação não termina no pedido: ela continua viva no CRM." },
  { icon: RepeatIcon, title: "Cliente voltando", desc: "Experiência que cria recorrência — o cliente volta porque quer." },
];

export function HospitalitySection() {
  return (
    <section aria-labelledby="hospitalidade-title" className="relative overflow-hidden bg-white py-20 lg:py-28">
      <DotGrid className="[mask-image:radial-gradient(ellipse_at_center,black,transparent_70%)]" />
      <Halo className="left-1/2 top-0 h-72 w-[44rem] -translate-x-1/2" color="rgba(249,115,22,0.08)" />

      <div className="mx-auto max-w-6xl px-5 lg:px-8">
        <div className="grid items-center gap-12 lg:grid-cols-[0.85fr_1.15fr] lg:gap-16">
          {/* Mascot — institutional brand presence */}
          <div className="order-2 lg:order-1">
            <MascotPanel className="mx-auto h-80 w-full max-w-sm p-6" imgClassName="h-64 w-auto" />
          </div>

          {/* Editorial statement + experience cards */}
          <div className="order-1 lg:order-2">
            <Eyebrow>Hospitalidade digital inteligente</Eyebrow>
            <h2
              id="hospitalidade-title"
              className="mt-3 text-3xl font-semibold leading-tight tracking-tight text-[#0B0B0B] sm:text-4xl"
            >
              Hospitalidade digital inteligente para restaurantes.
            </h2>
            <p className="mt-5 max-w-xl text-lg leading-relaxed text-gray-600">
              A Foocci trabalha no bastidor para que o cliente sinta uma experiência mais
              simples, fluida e personalizada — sem o restaurante perder sua identidade.
            </p>

            <div className="mt-8 grid gap-4 sm:grid-cols-2">
              {EXPERIENCES.map(({ icon: Icon, title, desc }) => (
                <PremiumCard key={title} hover className="p-5">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-50 text-brand-600 ring-1 ring-brand-100">
                    <Icon className="h-5 w-5" />
                  </div>
                  <h3 className="mt-4 text-base font-semibold text-[#0B0B0B]">{title}</h3>
                  <p className="mt-1.5 text-sm leading-relaxed text-gray-600">{desc}</p>
                </PremiumCard>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
