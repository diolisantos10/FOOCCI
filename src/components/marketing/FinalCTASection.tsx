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
    <section aria-labelledby="fechamento-title" className="bg-canvas py-12 lg:py-24">
      <div className="mx-auto max-w-3xl px-5 text-center lg:px-8">
        {/* Transparent cutout — the mascot floats free on the section bg, so the
            solid version's off-white canvas would read as a faint box here. */}
        <Image
          src="/brand/foocci/foocci-mascot-cutout.png"
          alt=""
          aria-hidden
          width={448}
          height={852}
          className="mx-auto mb-4 h-20 w-auto drop-shadow-sm lg:mb-6 lg:h-24"
        />
        <h2 id="fechamento-title" className="text-3xl font-semibold tracking-tight text-ink sm:text-4xl">
          Uma nova forma de vender, relacionar e fidelizar está chegando.
        </h2>
        <p className="mx-auto mt-3 max-w-2xl text-base leading-relaxed text-ink2 lg:mt-4 lg:text-lg">
          O Foocci está sendo preparado para ajudar restaurantes a transformar
          atendimento, pedidos e clientes em uma operação mais inteligente.
        </p>

        <div className="mt-6 flex flex-col items-center justify-center gap-3 sm:flex-row lg:mt-8">
          <PrimaryCta className="w-full sm:w-auto" />
          <SecondaryCta className="w-full sm:w-auto" />
        </div>

        <p className="mt-4 text-sm text-gray-500">{PRELAUNCH_NOTE}</p>
      </div>
    </section>
  );
}
