/**
 * How it works — first message to next order. Server component.
 */

const STEPS = [
  "O cliente chega pelo WhatsApp, QR Code ou link.",
  "A Foocci ajuda a conduzir o pedido.",
  "O sistema sugere complementos no momento certo.",
  "O cliente fica registrado no CRM.",
  "O restaurante pode reativar, fidelizar e acompanhar oportunidades.",
  "O dono ganha mais clareza sobre vendas e relacionamento.",
];

export function HowItWorksSection() {
  return (
    <section id="como-funciona" className="scroll-mt-20 bg-white py-20">
      <div className="mx-auto max-w-6xl px-5 lg:px-8">
        <div className="mx-auto max-w-2xl text-center">
          <span className="text-sm font-semibold uppercase tracking-widest text-brand-500">
            Como funciona
          </span>
          <h2 className="mt-3 text-3xl font-bold tracking-tight text-[#0B0B0B] sm:text-4xl">
            Da primeira mensagem ao próximo pedido.
          </h2>
        </div>

        <ol className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {STEPS.map((step, i) => (
            <li key={step} className="flex items-start gap-4 rounded-2xl border border-gray-200 bg-white p-6">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-500 text-sm font-bold text-white">
                {i + 1}
              </span>
              <p className="text-base leading-relaxed text-gray-700">{step}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
