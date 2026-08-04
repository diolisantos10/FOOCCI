/**
 * Pricing teaser (home). Server component.
 *
 * Values are deliberately absent ("Valor sob consulta"): the three plan prices were
 * not closed by launch day, and guardrail 7 + decision D3 forbid publishing an
 * invented number. Adding them later is a content change here and in
 * `/site/precos` — nothing else depends on it.
 *
 * ⚠️ These are COMMERCIAL names (Essencial / Crescimento / Performance). The
 * database enum is `Plan { STARTER, GROWTH, PRO }` — same three tiers, different
 * labels. Keep the mapping in that order; never print the enum on the site, and
 * never print these names in the panel.
 */

import { PrimaryCta } from "./Cta";
import { DEMO_URL } from "./config";
import { PLANS } from "@/lib/site/plans";
import { formatBRL } from "@/lib/site/commissionRates";

// Os planos vêm de `lib/site/plans.ts` — a MESMA fonte que a seção de ancoragem lê.
// Antes esta lista era local, e a página se contradizia: mostrava "R$ 429" na
// ancoragem e "Valor sob consulta" no card do mesmo plano, a três telas de distância.

export function PricingTeaserSection() {
  return (
    <section id="precos" aria-labelledby="planos-title" className="scroll-mt-20 bg-canvas py-12 sm:py-20">
      <div className="mx-auto max-w-6xl px-5 lg:px-8">
        <div className="mx-auto max-w-2xl text-center">
          <span className="text-sm font-semibold uppercase tracking-widest text-brand-500">Planos</span>
          <h2 id="planos-title" className="mt-2 text-[1.7rem] font-semibold tracking-tight text-ink sm:mt-3 sm:text-4xl">
Um plano para cada momento do seu restaurante.
          </h2>
          <p className="mt-3 text-base text-ink2 sm:mt-4 sm:text-lg">
            Cada plano abre pelo que só ele te dá. Peça uma demonstração e a gente
            monta a proposta certa para o seu tamanho — sem compromisso.
          </p>
        </div>

        <div className="mt-6 grid gap-3 lg:mt-8 lg:grid-cols-3 lg:gap-4">
          {PLANS.map((plan) => (
            <div
              key={plan.id}
              className={`relative flex flex-col rounded-2xl border bg-paper p-6 sm:p-7 ${
                plan.id === "crescimento" ? "border-brand-200 shadow-md ring-1 ring-brand-100" : "border-line"
              }`}
            >
              <h3 className="text-xl font-semibold text-ink">{plan.name}</h3>
              <p className="mt-1.5 text-sm font-semibold text-brand-600">{plan.onlyHere}</p>
              <p className="mt-2 text-base text-ink2">{plan.forWho}</p>
              {plan.monthly ? (
                <p className="mt-4 rounded-xl bg-canvas px-4 py-2.5 text-ink">
                  <span className="text-2xl font-semibold">{formatBRL(plan.monthly)}</span>
                  <span className="text-sm text-ink2"> por mês</span>
                </p>
              ) : (
                <p className="mt-4 rounded-xl bg-canvas px-4 py-2.5 text-sm font-semibold text-ink2">
                  Valor sob consulta
                </p>
              )}
            </div>
          ))}
        </div>

        <div className="mt-7 flex justify-center">
          <PrimaryCta label="Pedir uma demonstração" href={DEMO_URL} />
        </div>
      </div>
    </section>
  );
}
