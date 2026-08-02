/**
 * How it works — first message to next order, as a timeline. Server component.
 * Vertical timeline (connecting line + numbered badges) — works at all breakpoints.
 */

// Três passos, não seis. A home foi cortada de 12 seções para 7 e esta é a seção que
// explica o produto — passo demais aqui rouba a atenção que a calculadora e os
// diferenciais precisam ter. O detalhe completo mora em /site/como-funciona.
const STEPS = [
  "O cliente chega pelo WhatsApp, pelo QR na mesa ou pelo link — sem passar por marketplace.",
  "A Foocci conduz o pedido, sugere o complemento certo e registra quem é aquele cliente.",
  "O CRM traz ele de volta antes de esfriar, e você vê no painel quanto isso trouxe de volta.",
];

export function HowItWorksSection() {
  return (
    <section id="como-funciona" aria-labelledby="como-funciona-title" className="scroll-mt-20 bg-paper py-12 sm:py-20">
      <div className="mx-auto max-w-3xl px-5 lg:px-8">
        <div className="mx-auto max-w-2xl text-center">
          <span className="text-sm font-semibold uppercase tracking-widest text-brand-500">
            Como funciona
          </span>
          <h2 id="como-funciona-title" className="mt-3 text-3xl font-semibold tracking-tight text-ink sm:text-4xl">
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
              <span className="relative z-10 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-500 text-sm font-semibold text-white ring-4 ring-white">
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
