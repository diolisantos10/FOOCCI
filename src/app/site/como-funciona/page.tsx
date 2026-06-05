/**
 * /site/como-funciona — explains the Foocci journey. Inherits /site/layout.tsx.
 */

import type { Metadata } from "next";
import { PageHero } from "@/components/marketing/PageHero";
import { CtaBand } from "@/components/marketing/CtaBand";
import { ArrowRightIcon } from "@/components/marketing/icons";
import { OrderMockup } from "@/components/marketing/mockups";
import { PROPOSTA_URL, PRELAUNCH_NOTE } from "@/components/marketing/config";

const TITLE = "Como funciona a Foocci | Sistema inteligente para restaurantes";
const DESCRIPTION =
  "Entenda como a Foocci conecta pedido, atendimento, WhatsApp, IA e CRM para ajudar restaurantes a vender mais e fazer clientes voltarem.";

export const metadata: Metadata = {
  title: { absolute: TITLE },
  description: DESCRIPTION,
  robots: { index: true, follow: true },
  openGraph: { type: "website", locale: "pt_BR", siteName: "Foocci", title: TITLE, description: DESCRIPTION },
};

const STEPS = [
  { title: "Cliente chega", desc: "Pelo WhatsApp, QR Code ou link do cardápio." },
  { title: "Foocci conduz o pedido", desc: "O cliente recebe uma experiência mais simples, visual e orientada à compra." },
  { title: "O pedido fica mais completo", desc: "Sugestões de bebida, sobremesa e complementos podem ajudar a aumentar o valor do pedido." },
  { title: "O cliente entra no CRM", desc: "Histórico, dados e comportamento começam a formar uma base comercial." },
  { title: "O relacionamento continua", desc: "O restaurante pode criar campanhas, reativações e ações de retorno." },
  { title: "O dono enxerga oportunidades", desc: "Dados simples ajudam a entender clientes, pedidos e campanhas." },
];

const FLOW = ["Cliente", "Pedido", "CRM", "Campanha", "Retorno"];

export default function ComoFuncionaPage() {
  return (
    <>
      <PageHero
        badge="Como funciona"
        title="Da primeira mensagem ao próximo pedido."
        subtitle="A Foocci conecta atendimento, cardápio, WhatsApp, CRM e inteligência comercial para ajudar seu restaurante a vender melhor antes, durante e depois do pedido."
        primaryLabel="Conhecer a proposta"
        primaryHref={PROPOSTA_URL}
        note={PRELAUNCH_NOTE}
      />

      {/* 1. The journey */}
      <section aria-labelledby="jornada-title" className="bg-gray-50 py-20">
        <div className="mx-auto max-w-3xl px-5 lg:px-8">
          <h2 id="jornada-title" className="text-center text-3xl font-bold tracking-tight text-[#0B0B0B] sm:text-4xl">
            A jornada, passo a passo
          </h2>
          <ol className="relative mt-12">
            <span aria-hidden className="absolute left-[18px] top-2 bottom-2 w-px bg-gray-200" />
            {STEPS.map((step, i) => (
              <li key={step.title} className="relative flex gap-5 pb-8 last:pb-0">
                <span className="relative z-10 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-500 text-sm font-bold text-white ring-4 ring-gray-50">
                  {i + 1}
                </span>
                <div className="pt-0.5">
                  <h3 className="text-lg font-semibold text-[#0B0B0B]">{step.title}</h3>
                  <p className="mt-1 text-base leading-relaxed text-gray-600">{step.desc}</p>
                </div>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* 2. Backstage */}
      <section aria-labelledby="bastidor-title" className="bg-white py-20">
        <div className="mx-auto grid max-w-6xl items-center gap-12 px-5 lg:grid-cols-2 lg:px-8">
          <div>
            <span className="text-sm font-semibold uppercase tracking-widest text-brand-500">Bastidor</span>
            <h2 id="bastidor-title" className="mt-3 text-3xl font-bold tracking-tight text-[#0B0B0B] sm:text-4xl">
              A tecnologia trabalha no bastidor. A experiência aparece para o cliente.
            </h2>
            <p className="mt-5 text-lg leading-relaxed text-gray-600">
              A Foocci não rouba o protagonismo do restaurante. Ela apoia a experiência:
              o cliente vê a sua marca e o seu atendimento, enquanto a inteligência
              comercial trabalha por trás para conduzir a venda e manter o relacionamento.
            </p>
          </div>
          <div className="lg:pl-6">
            <OrderMockup />
          </div>
        </div>
      </section>

      {/* 3. Visual flow */}
      <section aria-labelledby="fluxo-title" className="bg-gray-50 py-20">
        <div className="mx-auto max-w-5xl px-5 lg:px-8">
          <h2 id="fluxo-title" className="text-center text-3xl font-bold tracking-tight text-[#0B0B0B] sm:text-4xl">
            Do atendimento ao retorno
          </h2>
          <div className="mt-12 flex flex-col items-stretch gap-3 sm:flex-row sm:items-center sm:justify-center">
            {FLOW.map((node, i) => (
              <div key={node} className="flex flex-col items-center gap-3 sm:flex-row">
                <div className="flex items-center justify-center rounded-2xl border border-gray-200 bg-white px-6 py-4 text-center text-base font-semibold text-[#0B0B0B] sm:min-w-[120px]">
                  {node}
                </div>
                {i < FLOW.length - 1 && (
                  <ArrowRightIcon className="h-5 w-5 rotate-90 text-brand-500 sm:rotate-0" />
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* 4. CTA */}
      <CtaBand
        title="A Foocci está sendo preparada para restaurantes como o seu."
        label="Conhecer a proposta"
        href={PROPOSTA_URL}
      />
    </>
  );
}
