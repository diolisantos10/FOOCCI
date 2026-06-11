/**
 * "Mais que tecnologia, hospitalidade." — implements the APPROVED MOCKUP row.
 * Server component.
 *
 * Centered orange eyebrow between hairlines, four clean cards (outlined circular
 * icon, bold two-line title, short copy) and the trust strip with the tagline.
 * The mascot lives in the hero as the host (per mockup) — not here. No metrics,
 * no fake data.
 */

import { HeartIcon, UsersIcon, ChartIcon, SparklesIcon, CheckIcon, MenuBookIcon } from "./icons";

const CARDS = [
  {
    icon: MenuBookIcon,
    title: ["Hospitalidade", "digital inteligente"],
    copy: "Tecnologia que respeita a essência do seu restaurante e potencializa cada ponto de contato.",
  },
  {
    icon: UsersIcon,
    title: ["Atendimento", "com contexto"],
    copy: "Conheça seu cliente, antecipe necessidades e ofereça experiências mais humanas e eficientes.",
  },
  {
    icon: HeartIcon,
    title: ["Relacionamento", "contínuo"],
    copy: "Aproxime-se com comunicação relevante e personalizada em todos os momentos.",
  },
  {
    icon: ChartIcon,
    title: ["Recorrência", "que cresce"],
    copy: "Estratégias inteligentes transformam boas experiências em clientes fiéis e resultados consistentes.",
  },
];

const TRUST = [
  { icon: ChartIcon, label: "Foco em resultados reais" },
  { icon: SparklesIcon, label: "Implantação rápida e simples" },
  { icon: UsersIcon, label: "Suporte próximo e especialista" },
  { icon: CheckIcon, label: "Segurança e conformidade" },
];

export function HospitalitySection() {
  return (
    <section aria-labelledby="hospitalidade-title" className="bg-white pb-20 pt-4 lg:pb-24">
      <div className="mx-auto max-w-7xl px-5 lg:px-8">
        {/* Centered eyebrow between hairlines (per mockup) */}
        <div className="flex items-center justify-center gap-4">
          <span aria-hidden className="h-px w-12 bg-gray-200 sm:w-24" />
          <h2
            id="hospitalidade-title"
            className="whitespace-nowrap text-center text-xs font-semibold uppercase tracking-[0.18em] text-brand-500 sm:text-sm"
          >
            Mais que tecnologia, hospitalidade
          </h2>
          <span aria-hidden className="h-px w-12 bg-gray-200 sm:w-24" />
        </div>

        {/* Four clean cards (per mockup) */}
        <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {CARDS.map(({ icon: Icon, title, copy }) => (
            <div
              key={title.join(" ")}
              className="rounded-2xl border border-gray-200/80 bg-white p-6 shadow-[0_1px_2px_rgba(15,23,42,0.03),0_14px_30px_-22px_rgba(15,23,42,0.25)]"
            >
              <span className="flex h-12 w-12 items-center justify-center rounded-full border border-brand-200 bg-white text-brand-500">
                <Icon className="h-5 w-5" />
              </span>
              <h3 className="mt-4 text-base font-bold leading-snug text-[#0B0B0B]">
                {title[0]}
                <br />
                {title[1]}
              </h3>
              <p className="mt-2 text-[13px] leading-relaxed text-gray-600">{copy}</p>
            </div>
          ))}
        </div>

        {/* Tagline + trust strip (per mockup) */}
        <div className="mt-14">
          <div aria-hidden className="mx-auto h-px max-w-4xl bg-gradient-to-r from-transparent via-gray-200 to-transparent" />
          <p className="mt-8 text-center text-base font-medium text-gray-800">
            Feito para restaurantes que querem crescer com propósito e encantar sempre.
          </p>
          <div className="mt-6 flex flex-wrap items-center justify-center gap-x-9 gap-y-3">
            {TRUST.map(({ icon: Icon, label }) => (
              <span key={label} className="inline-flex items-center gap-2 text-sm font-medium text-gray-600">
                <Icon className="h-4 w-4 text-gray-500" />
                {label}
              </span>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
