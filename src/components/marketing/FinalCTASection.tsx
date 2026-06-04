/**
 * Final CTA (home) — pre-launch band. Server component.
 *
 * No lead form in pre-launch mode: the home closes with anticipation + two
 * non-sales CTAs (explain the product / know the proposal).
 */

import { PrimaryCta, SecondaryCta } from "./Cta";
import { PRELAUNCH_NOTE } from "./config";

export function FinalCTASection() {
  return (
    <section className="bg-gray-50 py-20">
      <div className="mx-auto max-w-3xl px-5 text-center lg:px-8">
        <h2 className="text-3xl font-bold tracking-tight text-[#0B0B0B] sm:text-4xl">
          Uma nova forma de vender, relacionar e fidelizar está chegando.
        </h2>
        <p className="mx-auto mt-4 max-w-2xl text-lg leading-relaxed text-gray-600">
          A Foocci está sendo preparada para ajudar restaurantes a transformar
          atendimento, pedidos e clientes em uma operação mais inteligente.
        </p>

        <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <PrimaryCta className="w-full sm:w-auto" />
          <SecondaryCta className="w-full sm:w-auto" />
        </div>

        <p className="mt-4 text-sm text-gray-500">{PRELAUNCH_NOTE}</p>
      </div>
    </section>
  );
}
