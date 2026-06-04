/**
 * /site/demonstracao — lead conversion page. Inherits /site/layout.tsx.
 *
 * The lead form has no backend (see DemoForm). It does not fake a submission:
 * it opens WhatsApp with the details when a number is configured, otherwise the
 * submit stays disabled. TODO(backend): wire a real lead-capture endpoint.
 */

import type { Metadata } from "next";
import { PageHero } from "@/components/marketing/PageHero";
import { DemoForm } from "@/components/marketing/DemoForm";
import { WhatsAppCta } from "@/components/marketing/Cta";
import { CheckIcon } from "@/components/marketing/icons";

const TITLE = "Demonstração Foocci | Veja a Foocci funcionando no seu restaurante";
const DESCRIPTION =
  "Solicite uma demonstração da Foocci e veja como vender mais, atender melhor no WhatsApp e ativar CRM para seu restaurante.";

export const metadata: Metadata = {
  title: { absolute: TITLE },
  description: DESCRIPTION,
  robots: { index: true, follow: true },
  openGraph: { type: "website", locale: "pt_BR", siteName: "Foocci", title: TITLE, description: DESCRIPTION },
};

const STEPS = [
  "Entendemos seu tipo de restaurante.",
  "Vemos como seus pedidos chegam hoje.",
  "Mostramos como a Foocci conduz pedido e relacionamento.",
  "Indicamos uma configuração inicial para sua operação.",
];

export default function DemonstracaoPage() {
  return (
    <>
      <PageHero
        badge="Demonstração"
        title="Veja como a Foocci pode funcionar no seu restaurante."
        subtitle="Em uma demonstração rápida, mostramos como a Foocci pode atuar no seu cardápio, WhatsApp, pedidos e relacionamento com clientes."
        primaryLabel="Solicitar demonstração"
        primaryHref="#form"
      />

      {/* 1. What happens in the demo */}
      <section className="bg-gray-50 py-20">
        <div className="mx-auto max-w-5xl px-5 lg:px-8">
          <h2 className="text-center text-3xl font-bold tracking-tight text-[#0B0B0B] sm:text-4xl">
            O que acontece na demonstração
          </h2>
          <div className="mt-12 grid gap-5 sm:grid-cols-2">
            {STEPS.map((s) => (
              <div key={s} className="flex items-start gap-3 rounded-2xl border border-gray-200 bg-white p-6">
                <CheckIcon className="mt-0.5 h-5 w-5 shrink-0 text-brand-500" />
                <p className="text-base font-medium text-gray-800">{s}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* 2. Lead form */}
      <section id="form" className="scroll-mt-20 bg-white py-20">
        <div className="mx-auto max-w-2xl px-5 lg:px-8">
          <div className="text-center">
            <h2 className="text-3xl font-bold tracking-tight text-[#0B0B0B] sm:text-4xl">
              Solicite sua demonstração
            </h2>
            <p className="mt-4 text-lg text-gray-600">
              Conte um pouco sobre sua operação e a gente prepara uma demonstração focada na sua realidade.
            </p>
          </div>
          <div className="mt-10 rounded-3xl border border-gray-200 bg-gray-50 p-6 shadow-sm sm:p-8">
            <DemoForm includeChallenge />
          </div>
        </div>
      </section>

      {/* 3. WhatsApp alternative */}
      <section className="bg-gray-50 py-16">
        <div className="mx-auto max-w-2xl px-5 text-center lg:px-8">
          <h2 className="text-2xl font-bold tracking-tight text-[#0B0B0B] sm:text-3xl">
            Prefere falar direto?
          </h2>
          <div className="mt-6 flex justify-center">
            <WhatsAppCta label="Chamar no WhatsApp" fallbackHref="#form" />
          </div>
        </div>
      </section>
    </>
  );
}
