/**
 * Three pillars: sell more, relate better, bring customers back. Server component.
 */

import { TrendingUpIcon, UsersIcon, RepeatIcon } from "./icons";

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
    <section className="bg-gray-50 py-20">
      <div className="mx-auto max-w-6xl px-5 lg:px-8">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-3xl font-bold tracking-tight text-[#0B0B0B] sm:text-4xl">
            Venda, relacionamento e fidelização trabalhando juntos.
          </h2>
        </div>

        <div className="mt-12 grid gap-6 md:grid-cols-3">
          {PILLARS.map(({ icon: Icon, title, desc }) => (
            <div key={title} className="rounded-2xl border border-gray-200 bg-white p-7">
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
