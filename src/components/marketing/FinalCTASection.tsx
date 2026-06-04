/**
 * Final CTA + demo request. Server component.
 * `id="demonstracao"` is the scroll target for every primary CTA and the
 * "Demonstração" nav item.
 */

import { DemoForm } from "./DemoForm";
import { WhatsAppCta } from "./Cta";

export function FinalCTASection() {
  return (
    <section id="demonstracao" className="scroll-mt-20 bg-gray-50 py-20">
      <div className="mx-auto max-w-3xl px-5 lg:px-8">
        <div className="text-center">
          <h2 className="text-3xl font-bold tracking-tight text-[#0B0B0B] sm:text-4xl">
            Pronto para transformar atendimento em venda e cliente em recorrência?
          </h2>
          <p className="mt-4 text-lg leading-relaxed text-gray-600">
            Veja como a Foocci pode funcionar no seu restaurante, com seu cardápio,
            seus clientes e sua operação.
          </p>
        </div>

        <div className="mt-10 rounded-3xl border border-gray-200 bg-white p-6 shadow-sm sm:p-8">
          <DemoForm />
          <div className="mt-4 flex justify-center">
            <WhatsAppCta className="w-full sm:w-auto" />
          </div>
        </div>

        <p className="mt-5 text-center text-sm text-gray-500">
          Demonstração rápida, sem compromisso e focada na realidade do seu restaurante.
        </p>
      </div>
    </section>
  );
}
