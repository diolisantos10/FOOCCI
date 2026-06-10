/**
 * "Mais que tecnologia, hospitalidade." — proprietary brand section (V3).
 * Server component.
 *
 * The mascot (institutional warmth) beside an editorial statement + four
 * hospitality cards. Backstage vs frontstage — the restaurant stays the
 * protagonist. No metrics, no fake data.
 */

import { HeartIcon, ChatIcon, RepeatIcon, TrendingUpIcon, ChartIcon, SparklesIcon, UsersIcon, CheckIcon } from "./icons";
import { DotGrid, Halo, Eyebrow, PremiumCard, MascotPanel, GradientRule } from "./premium";

const TRUST = [
  { icon: ChartIcon, label: "Foco em resultados reais" },
  { icon: SparklesIcon, label: "Implantação rápida e simples" },
  { icon: UsersIcon, label: "Suporte próximo e especialista" },
  { icon: CheckIcon, label: "Segurança e conformidade" },
];

const CARDS = [
  {
    icon: HeartIcon,
    title: "Hospitalidade digital inteligente",
    copy: "Tecnologia que respeita a essência do seu restaurante e potencializa cada ponto de contato.",
  },
  {
    icon: ChatIcon,
    title: "Atendimento com contexto",
    copy: "Conheça seu cliente, antecipe necessidades e ofereça experiências mais humanas e eficientes.",
  },
  {
    icon: RepeatIcon,
    title: "Relacionamento contínuo",
    copy: "Aproxime-se com comunicação relevante e personalizada em todos os momentos.",
  },
  {
    icon: TrendingUpIcon,
    title: "Recorrência que cresce",
    copy: "Estratégias inteligentes transformam boas experiências em clientes fiéis e resultados consistentes.",
  },
];

export function HospitalitySection() {
  return (
    <section aria-labelledby="hospitalidade-title" className="relative overflow-hidden bg-gray-50 py-20 lg:py-28">
      <DotGrid className="[mask-image:radial-gradient(ellipse_at_center,black,transparent_70%)]" />
      <Halo className="left-1/2 top-0 h-72 w-[44rem] -translate-x-1/2" color="rgba(249,115,22,0.08)" />

      <div className="mx-auto max-w-6xl px-5 lg:px-8">
        <div className="grid items-center gap-12 lg:grid-cols-[0.85fr_1.15fr] lg:gap-16">
          {/* Mascot — institutional brand presence */}
          <div className="order-2 lg:order-1">
            <MascotPanel className="mx-auto h-80 w-full max-w-sm p-6" imgClassName="h-64 w-auto" />
          </div>

          {/* Editorial statement + hospitality cards */}
          <div className="order-1 lg:order-2">
            <Eyebrow>Hospitalidade</Eyebrow>
            <h2
              id="hospitalidade-title"
              className="mt-3 text-3xl font-semibold leading-tight tracking-tight text-[#0B0B0B] sm:text-4xl"
            >
              Mais que tecnologia, hospitalidade.
            </h2>
            <p className="mt-5 max-w-xl text-lg leading-relaxed text-gray-600">
              A Foocci trabalha no bastidor para que cada cliente sinta uma experiência
              mais simples, inteligente e próxima.
            </p>

            <div className="mt-8 grid gap-4 sm:grid-cols-2">
              {CARDS.map(({ icon: Icon, title, copy }) => (
                <PremiumCard key={title} hover className="p-5">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-50 text-brand-600 ring-1 ring-brand-100">
                    <Icon className="h-5 w-5" />
                  </div>
                  <h3 className="mt-4 text-base font-semibold text-[#0B0B0B]">{title}</h3>
                  <p className="mt-1.5 text-sm leading-relaxed text-gray-600">{copy}</p>
                </PremiumCard>
              ))}
            </div>
          </div>
        </div>

        {/* Trust strip — generic value statements (no metrics, no testimonials) */}
        <div className="mt-16">
          <GradientRule className="via-amber-200/60" />
          <p className="mt-8 text-center text-base font-medium text-gray-700">
            Feito para restaurantes que querem crescer com propósito e encantar sempre.
          </p>
          <div className="mt-6 flex flex-wrap items-center justify-center gap-x-8 gap-y-3">
            {TRUST.map(({ icon: Icon, label }) => (
              <span key={label} className="inline-flex items-center gap-2 text-sm font-medium text-gray-500">
                <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-brand-50 text-brand-600">
                  <Icon className="h-4 w-4" />
                </span>
                {label}
              </span>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
