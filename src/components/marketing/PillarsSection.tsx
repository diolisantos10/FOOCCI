/**
 * Three pillars: sell more, relate better, bring customers back. Server component.
 */

import { TrendingUpIcon, UsersIcon, RepeatIcon } from "./icons";
import { SectionHeading } from "./SectionHeading";
import { DotGrid, PremiumCard } from "./premium";

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
    <section aria-labelledby="pilares-title" className="relative overflow-hidden bg-gray-50 py-20 lg:py-24">
      <DotGrid className="[mask-image:radial-gradient(ellipse_at_top,black,transparent_68%)]" />
      <div className="relative mx-auto max-w-6xl px-5 lg:px-8">
        <SectionHeading
          id="pilares-title"
          eyebrow="Por que Foocci"
          title="Venda, relacionamento e fidelização trabalhando juntos."
          subtitle="Três pilares que se reforçam — do primeiro pedido à recorrência."
        />

        <div className="mt-12 grid gap-6 md:grid-cols-3">
          {PILLARS.map(({ icon: Icon, title, desc }, i) => (
            <PremiumCard key={title} hover className="relative p-7">
              <span className="absolute right-6 top-6 text-sm font-semibold tabular-nums text-gray-200">
                0{i + 1}
              </span>
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-brand-50 text-brand-600 ring-1 ring-brand-100">
                <Icon className="h-6 w-6" />
              </div>
              <h3 className="mt-5 text-xl font-semibold text-[#0B0B0B]">{title}</h3>
              <p className="mt-2 text-base leading-relaxed text-gray-600">{desc}</p>
            </PremiumCard>
          ))}
        </div>
      </div>
    </section>
  );
}
