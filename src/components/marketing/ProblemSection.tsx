/**
 * Problem / agitation. Server component.
 */

import { SectionHeading } from "./SectionHeading";
import { PremiumCard } from "./premium";

const CARDS = [
  "Conversas que não viram pedido.",
  "Clientes que compram uma vez e somem.",
  "Cardápios que mostram, mas não conduzem venda.",
  "Promoções enviadas sem estratégia.",
  "Dados de clientes espalhados ou esquecidos.",
];

export function ProblemSection() {
  return (
    <section aria-labelledby="problema-title" className="bg-white py-20 lg:py-24">
      <div className="mx-auto max-w-6xl px-5 lg:px-8">
        <SectionHeading
          id="problema-title"
          eyebrow="O problema"
          title="Todos os dias, restaurantes perdem clientes que poderiam voltar."
          subtitle="Clientes desistem no WhatsApp, abandonam pedidos, esquecem de voltar e acabam comprando de outro lugar. A maioria dessas oportunidades desaparece sem registro, sem recuperação e sem relacionamento."
        />

        <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {CARDS.map((text, i) => (
            <PremiumCard
              key={text}
              className={`flex items-start gap-3 p-5 ${
                i === CARDS.length - 1 ? "sm:col-span-2 lg:col-span-1" : ""
              }`}
            >
              <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-gray-100 text-sm font-semibold text-gray-400">
                {i + 1}
              </span>
              <p className="text-base font-medium text-gray-800">{text}</p>
            </PremiumCard>
          ))}
        </div>
      </div>
    </section>
  );
}
