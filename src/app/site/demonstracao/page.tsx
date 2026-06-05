/**
 * /site/demonstracao — PRE-LAUNCH. Inherits /site/layout.tsx.
 *
 * The commercial demo is not open yet. There is intentionally NO lead form and
 * NO WhatsApp CTA here: the page presents what a future demo will show, gives a
 * clearly-labelled illustrative preview of the product, and routes to the
 * educational page. Nothing fakes a submission or implies availability.
 */

import type { Metadata } from "next";
import { PageHero } from "@/components/marketing/PageHero";
import { CtaBand } from "@/components/marketing/CtaBand";
import { CheckIcon } from "@/components/marketing/icons";
import { OrderMockup, CrmProfileMockup, InsightMockup } from "@/components/marketing/mockups";
import { COMO_FUNCIONA_URL, PRELAUNCH_NOTE } from "@/components/marketing/config";

const TITLE = "Demonstração Foocci em breve | Conheça a proposta";
const DESCRIPTION =
  "A demonstração comercial da Foocci será aberta em breve. Enquanto isso, conheça a proposta, os pilares e o funcionamento do sistema.";

export const metadata: Metadata = {
  title: { absolute: TITLE },
  description: DESCRIPTION,
  openGraph: { type: "website", locale: "pt_BR", siteName: "Foocci", title: TITLE, description: DESCRIPTION },
};

const WILL_SHOW = [
  "Como a Foocci conduz o pedido a partir do seu cardápio.",
  "Como o WhatsApp se torna um canal de relacionamento.",
  "Como o CRM organiza seus clientes e oportunidades.",
  "Como campanhas e reativação ajudam o cliente a voltar.",
  "Qual configuração faz sentido para o seu tipo de restaurante.",
];

export default function DemonstracaoPage() {
  return (
    <>
      <PageHero
        badge="Demonstração · em breve"
        title="A demonstração comercial da Foocci será aberta em breve."
        subtitle="Enquanto a Foocci está em fase piloto, você pode conhecer a proposta, os pilares e o funcionamento do sistema."
        primaryLabel="Ver como a Foocci funciona"
        primaryHref={COMO_FUNCIONA_URL}
        secondaryLabel="Conhecer a proposta"
        note={PRELAUNCH_NOTE}
      />

      {/* Illustrative product preview */}
      <section aria-labelledby="previa-title" className="bg-gray-50 py-20">
        <div className="mx-auto max-w-5xl px-5 lg:px-8">
          <div className="mx-auto max-w-2xl text-center">
            <span className="text-sm font-semibold uppercase tracking-widest text-brand-500">Prévia</span>
            <h2 id="previa-title" className="mt-3 text-3xl font-semibold tracking-tight text-[#0B0B0B] sm:text-4xl">
              Uma prévia de como a Foocci se parece.
            </h2>
            <p className="mt-4 text-lg leading-relaxed text-gray-600">
              Pedido guiado, CRM e dados comerciais em uma só operação — pensados para
              o dia a dia do restaurante.
            </p>
          </div>

          <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-3 lg:items-center">
            <div className="lg:mt-10">
              <OrderMockup />
            </div>
            <CrmProfileMockup />
            <div className="sm:col-span-2 sm:mx-auto sm:max-w-sm lg:col-span-1 lg:mx-0 lg:mt-10 lg:max-w-none">
              <InsightMockup />
            </div>
          </div>

          <p className="mt-8 text-center text-xs text-gray-400">
            Telas ilustrativas do produto em fase piloto.
          </p>
        </div>
      </section>

      {/* What a future demo will show */}
      <section aria-labelledby="demo-mostra-title" className="bg-white py-20">
        <div className="mx-auto max-w-2xl px-5 lg:px-8">
          <div className="rounded-3xl border border-gray-200 bg-white p-7 shadow-sm ring-1 ring-gray-900/[0.03] sm:p-9">
            <span className="inline-flex items-center gap-2 rounded-full border border-brand-200 bg-brand-50 px-3 py-1 text-xs font-semibold text-brand-700">
              <span className="h-1.5 w-1.5 rounded-full bg-brand-500" />
              O que a demonstração vai mostrar
            </span>
            <h2 id="demo-mostra-title" className="sr-only">
              O que a demonstração vai mostrar
            </h2>
            <ul className="mt-6 space-y-3">
              {WILL_SHOW.map((item) => (
                <li key={item} className="flex items-start gap-3">
                  <CheckIcon className="mt-0.5 h-5 w-5 shrink-0 text-brand-500" />
                  <span className="text-base text-gray-700">{item}</span>
                </li>
              ))}
            </ul>
            <p className="mt-7 rounded-xl bg-gray-50 px-4 py-3 text-sm text-gray-500">
              O formulário de interesse será ativado no lançamento comercial.
            </p>
          </div>
        </div>
      </section>

      <CtaBand
        title="Quer entender se a Foocci faz sentido para o seu restaurante?"
        label="Ver como a Foocci funciona"
        href={COMO_FUNCIONA_URL}
      />
    </>
  );
}
