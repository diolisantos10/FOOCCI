/**
 * Problem / agitation. Server component.
 */

const CARDS = [
  "Conversas que não viram pedido.",
  "Clientes que compram uma vez e somem.",
  "Cardápios que mostram, mas não conduzem venda.",
  "Promoções enviadas sem estratégia.",
  "Dados de clientes espalhados ou esquecidos.",
];

export function ProblemSection() {
  return (
    <section className="bg-gray-50 py-20">
      <div className="mx-auto max-w-6xl px-5 lg:px-8">
        <div className="mx-auto max-w-3xl text-center">
          <h2 className="text-3xl font-bold tracking-tight text-[#0B0B0B] sm:text-4xl">
            Seu restaurante pode estar perdendo vendas todos os dias sem perceber.
          </h2>
          <p className="mt-4 text-lg leading-relaxed text-gray-600">
            Clientes desistem no WhatsApp, abandonam pedidos, esquecem de voltar e
            acabam comprando de outro lugar. A maioria dessas oportunidades desaparece
            sem registro, sem recuperação e sem relacionamento.
          </p>
        </div>

        <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {CARDS.map((text, i) => (
            <div
              key={text}
              className={`flex items-start gap-3 rounded-2xl border border-gray-200 bg-white p-5 ${
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
