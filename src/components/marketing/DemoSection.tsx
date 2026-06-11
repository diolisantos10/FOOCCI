"use client";

/**
 * Product preview with tabs. Client component (tab state).
 *
 * Uses the shared mockup language (mockups.tsx) so every preview reads like real
 * product UI — no real screenshots, no fake/specific data, no invented metrics.
 * The five tabs map 1:1 to the five canonical mockups.
 */

import { useState } from "react";
import {
  OrderMockup,
  WhatsAppContextMockup,
  CrmProfileMockup,
  CampaignMockup,
  InsightMockup,
} from "./mockups";

type TabInfo = { id: string; title: string; benefit: string; render: () => JSX.Element };

const TABS: TabInfo[] = [
  { id: "Pedido", title: "Pedido guiado", benefit: "Do cardápio à finalização, com menos atrito para o cliente.", render: () => <OrderMockup /> },
  { id: "WhatsApp", title: "WhatsApp com contexto", benefit: "Conversas organizadas e direcionadas para o pedido.", render: () => <WhatsAppContextMockup /> },
  { id: "CRM", title: "Base de clientes viva", benefit: "Quem comprou, voltou, sumiu e merece atenção.", render: () => <CrmProfileMockup /> },
  { id: "Campanhas", title: "Reativação inteligente", benefit: "Mensagens para os clientes certos, no momento certo.", render: () => <CampaignMockup /> },
  { id: "Dados", title: "Clareza comercial", benefit: "Vendas, clientes e oportunidades em um olhar.", render: () => <InsightMockup /> },
];

export function DemoSection() {
  const [active, setActive] = useState<string>("Pedido");
  const current = TABS.find((t) => t.id === active) ?? TABS[0]!;

  return (
    <section id="produto" aria-labelledby="produto-title" className="scroll-mt-20 bg-gray-50 py-20 lg:py-24">
      <div className="mx-auto max-w-5xl px-5 lg:px-8">
        <div className="mx-auto max-w-2xl text-center">
          <span className="text-sm font-semibold uppercase tracking-widest text-brand-500">Sistema inteligente</span>
          <h2 id="produto-title" className="mt-3 text-3xl font-semibold tracking-tight text-[#0B0B0B] sm:text-4xl">
            Veja o Foocci trabalhando no dia a dia do restaurante.
          </h2>
        </div>

        {/* Tabs */}
        <div role="tablist" aria-label="Telas do produto" className="mt-10 flex flex-wrap justify-center gap-2">
          {TABS.map((t) => {
            const selected = active === t.id;
            return (
              <button
                key={t.id}
                type="button"
                role="tab"
                aria-selected={selected}
                onClick={() => setActive(t.id)}
                className={`rounded-full px-4 py-2 text-sm font-semibold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 focus-visible:ring-offset-2 ${
                  selected
                    ? "bg-brand-500 text-white shadow-sm"
                    : "border border-gray-200 bg-white text-gray-600 hover:border-gray-300 hover:text-gray-900"
                }`}
              >
                {t.id}
              </button>
            );
          })}
        </div>

        {/* Preview surface */}
        <div className="mt-8 grid items-center gap-8 rounded-3xl border border-gray-200 bg-white p-6 shadow-[0_2px_4px_rgba(15,23,42,0.04),0_18px_40px_-20px_rgba(15,23,42,0.22)] sm:p-10 lg:grid-cols-2 lg:gap-12">
          <div className="order-2 text-center lg:order-1 lg:text-left">
            <span className="inline-flex items-center gap-2 rounded-full border border-brand-200 bg-brand-50 px-3 py-1 text-xs font-semibold text-brand-700">
              {current.id}
            </span>
            <h3 className="mt-4 text-2xl font-semibold text-[#0B0B0B]">{current.title}</h3>
            <p className="mx-auto mt-2 max-w-sm text-base leading-relaxed text-gray-600 lg:mx-0">
              {current.benefit}
            </p>
          </div>
          <div className="order-1 lg:order-2">{current.render()}</div>
        </div>
      </div>
    </section>
  );
}
