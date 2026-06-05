/**
 * Essence interlude — the page's dark anchor. Server component.
 *
 * A single near-black narrative break that interrupts the white/grey rhythm and
 * gives the scroll a focal moment. Copy is the approved emotional essence
 * (see docs/foocci-site/copy-decisions-v1.md) and the official triad — no CTA,
 * no metrics, no claims.
 */

import { TrendingUpIcon, UsersIcon, RepeatIcon } from "./icons";

const TRIAD = [
  { icon: TrendingUpIcon, label: "Vender mais" },
  { icon: UsersIcon, label: "Relacionar melhor" },
  { icon: RepeatIcon, label: "Fidelizar" },
];

export function EssenceBand() {
  return (
    <section aria-labelledby="essence-title" className="relative overflow-hidden bg-[#0B0B0B] py-24">
      {/* Soft brand glow — restrained, not a blob. */}
      <div
        aria-hidden
        className="pointer-events-none absolute left-1/2 top-0 -z-0 h-72 w-[36rem] -translate-x-1/2 rounded-full bg-[radial-gradient(closest-side,rgba(249,115,22,0.18),transparent)]"
      />
      <div className="relative mx-auto max-w-3xl px-5 text-center lg:px-8">
        <span className="text-sm font-semibold uppercase tracking-widest text-brand-400">
          A essência da Foocci
        </span>
        <h2
          id="essence-title"
          className="mt-4 text-3xl font-bold leading-tight tracking-tight text-white sm:text-4xl lg:text-[2.75rem]"
        >
          Transformando pedidos em experiências que fazem{" "}
          <span className="text-brand-400">clientes voltarem.</span>
        </h2>
        <p className="mx-auto mt-5 max-w-xl text-lg leading-relaxed text-gray-400">
          Vendas, relacionamento e fidelização em um só sistema — pensado para o
          restaurante, não para a tecnologia.
        </p>

        <div className="mx-auto mt-10 flex max-w-lg flex-col items-stretch gap-3 sm:flex-row sm:justify-center">
          {TRIAD.map(({ icon: Icon, label }) => (
            <div
              key={label}
              className="flex items-center justify-center gap-2.5 rounded-full border border-white/10 bg-white/[0.04] px-5 py-2.5 text-sm font-semibold text-white"
            >
              <Icon className="h-4 w-4 text-brand-400" />
              {label}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
