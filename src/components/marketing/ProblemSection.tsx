/**
 * Problem / agitation. Server component.
 */

import { SectionHeading } from "./SectionHeading";

const CARDS = [
  "Conversas que não viram pedido.",
  "Clientes que compram uma vez e somem.",
  "Cardápios que mostram, mas não conduzem venda.",
  "Promoções enviadas sem estratégia.",
  "Dados de clientes espalhados ou esquecidos.",
];

export function ProblemSection() {
  return (
    <section aria-labelledby="problema-title" className="bg-gray-50 py-20">
      <div className="mx-auto max-w-6xl px-5 lg:px-8">
        <SectionHeading
          id="problema-title"
          eyebrow="Antes da Foocci"
          title="Seu restaurante pode estar perdendo vendas todos os dias sem perceber."
          subtitle="Clientes desistem no WhatsApp, abandonam pedidos, esquecem de voltar e acabam comprando de outro lugar. A maioria dessas oportunidades desaparece sem registro, sem recuperação e sem relacionamento."
        />

        <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {CARDS.map((text, i) => (
            <div
              key={text}
              className={`flex items-start gap-3 rounded-2xl border border-gray-200 bg-white p-5 ring-1 ring-gray-900/[0.02] ${
                i === CARDS.length - 1 ? "sm:col-span-2 lg:col-span-1" : ""
              }`}
            >
              <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-gray-100 text-sm font-semibold text-gray-400">
                {i + 1}
              </span>
              <p className="text-base font-medium text-gray-800">{text}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
