/**
 * How it works — first message to next order, as a timeline. Server component.
 * Vertical timeline (connecting line + numbered badges) — works at all breakpoints.
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
      <div className="mx-auto max-w-3xl px-5 lg:px-8">
        <div className="mx-auto max-w-2xl text-center">
          <span className="text-sm font-semibold uppercase tracking-widest text-brand-500">
            Como funciona
          </span>
          <h2 className="mt-3 text-3xl font-bold tracking-tight text-[#0B0B0B] sm:text-4xl">
            Da primeira mensagem ao próximo pedido.
          </h2>
        </div>

        <ol className="relative mt-12">
          {/* vertical connecting line */}
          <span
            aria-hidden
            className="absolute left-[18px] top-2 bottom-2 w-px bg-gray-200"
          />
          {STEPS.map((step, i) => (
            <li key={step} className="relative flex gap-5 pb-8 last:pb-0">
              <span className="relative z-10 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-500 text-sm font-bold text-white ring-4 ring-white">
                {i + 1}
              </span>
              <p className="pt-1 text-base leading-relaxed text-gray-700">{step}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
