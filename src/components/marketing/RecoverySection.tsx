/**
 * Recovery section. Server component.
 * No promise of guaranteed recovery — "ajuda a identificar oportunidades".
 * Flow: Oportunidade → Mensagem → Retorno → Pedido.
 */

import { ArrowRightIcon } from "./icons";
import { SectionHeading } from "./SectionHeading";

const FLOW = ["Oportunidade", "Mensagem", "Retorno", "Pedido"];

const EXAMPLES = [
  "Pedido não concluído",
  "Cliente recorrente que esfriou",
  "Aniversariante",
  "Cliente VIP sem retorno",
  "Campanha de reativação",
];

export function RecoverySection() {
  return (
    <section aria-labelledby="recuperacao-title" className="bg-white py-20">
      <div className="mx-auto max-w-5xl px-5 lg:px-8">
        <SectionHeading
          id="recuperacao-title"
          eyebrow="Recuperação"
          title="Nem todo pedido perdido precisa continuar perdido."
          subtitle="O Foocci ajuda a identificar oportunidades de recuperação, como clientes que começaram um pedido, sumiram ou ficaram muito tempo sem comprar."
        />

        {/* Flow: Oportunidade → Mensagem → Retorno → Pedido */}
        <div className="mt-12 flex flex-col items-stretch gap-3 sm:flex-row sm:items-center sm:justify-center">
          {FLOW.map((step, i) => (
            <div key={step} className="flex flex-col items-center gap-3 sm:flex-row">
              <div className="flex items-center justify-center rounded-2xl border border-gray-200 bg-gray-50 px-6 py-4 text-center text-base font-semibold text-[#0B0B0B] sm:min-w-[140px]">
                {step}
              </div>
              {i < FLOW.length - 1 && (
                <ArrowRightIcon className="h-5 w-5 rotate-90 text-brand-500 sm:rotate-0" />
              )}
            </div>
          ))}
        </div>

        {/* Examples */}
        <div className="mt-10">
          <p className="text-center text-sm font-semibold uppercase tracking-widest text-gray-400">
            Exemplos de oportunidade
          </p>
          <div className="mt-4 flex flex-wrap justify-center gap-2.5">
            {EXAMPLES.map((ex) => (
              <span
                key={ex}
                className="rounded-full border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700"
              >
                {ex}
              </span>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
