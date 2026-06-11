/**
 * Final CTA (home) — pre-launch band. Server component.
 *
 * No lead form in pre-launch mode: the home closes with anticipation + two
 * non-sales CTAs (explain the product / know the proposal).
 */

import Image from "next/image";
import { PrimaryCta, SecondaryCta } from "./Cta";
import { PRELAUNCH_NOTE } from "./config";

export function FinalCTASection() {
  return (
    <section aria-labelledby="fechamento-title" className="bg-gray-50 py-20 lg:py-24">
      <div className="mx-auto max-w-3xl px-5 text-center lg:px-8">
        <Image
          src="/brand/foocci/foocci-mascot.png"
          alt=""
          aria-hidden
          width={196}
          height={321}
          className="mx-auto mb-6 h-24 w-auto"
        />
        <h2 id="fechamento-title" className="text-3xl font-semibold tracking-tight text-[#0B0B0B] sm:text-4xl">
          Uma nova forma de vender, relacionar e fidelizar está chegando.
        </h2>
        <p className="mx-auto mt-4 max-w-2xl text-lg leading-relaxed text-gray-600">
          O Foocci está sendo preparado para ajudar restaurantes a transformar
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
