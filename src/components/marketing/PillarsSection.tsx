/**
 * Three pillars: sell more, relate better, bring customers back. Server component.
 */

import { TrendingUpIcon, UsersIcon, RepeatIcon } from "./icons";
import { SectionHeading } from "./SectionHeading";

const PILLARS = [
  {
    icon: TrendingUpIcon,
    title: "Venda mais",
    desc: "Conduza pedidos, sugira complementos e reduza atritos até a compra.",
  },
  {
    icon: UsersIcon,
    title: "Relacione melhor",
    desc: "Organize clientes, histórico e oportunidades em um CRM simples para restaurante.",
  },
  {
    icon: RepeatIcon,
    title: "Faça clientes voltarem",
    desc: "Ative campanhas, recupere oportunidades e construa recorrência com mais inteligência.",
  },
];

export function PillarsSection() {
  return (
    <section aria-labelledby="pilares-title" className="bg-gray-50 py-20">
      <div className="mx-auto max-w-6xl px-5 lg:px-8">
        <SectionHeading
          id="pilares-title"
          eyebrow="Por que Foocci"
          title="Venda, relacionamento e fidelização trabalhando juntos."
        />

        <div className="mt-12 grid gap-6 md:grid-cols-3">
          {PILLARS.map(({ icon: Icon, title, desc }) => (
            <div
              key={title}
              className="rounded-2xl border border-gray-200 bg-white p-7 ring-1 ring-gray-900/[0.02] transition-shadow hover:shadow-md"
            >
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-brand-50 text-brand-600">
                <Icon className="h-6 w-6" />
              </div>
              <h3 className="mt-5 text-xl font-semibold text-[#0B0B0B]">{title}</h3>
              <p className="mt-2 text-base leading-relaxed text-gray-600">{desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
