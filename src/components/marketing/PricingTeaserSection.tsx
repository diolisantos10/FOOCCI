/**
 * Pricing teaser (home). Server component.
 *
 * O CARD MOSTRA O VALOR. Este cabeçalho dizia "values are deliberately absent
 * (Valor sob consulta)" e ficou dizendo isso depois de 04/08/2026, quando os três
 * planos ganharam valor fechado e o card passou a imprimir `formatBRL`. O ramo
 * "Valor sob consulta" logo abaixo é o FALLBACK de `plan.monthly === null`, que
 * hoje nunca acontece — e é ele que este comentário estava descrevendo como se
 * fosse o comportamento normal.
 *
 * O fallback continua existindo de propósito: é o caminho de um plano futuro sem
 * preço público, que é o que a decisão D3 protege. D3 proíbe **inventar** preço,
 * não publicar o que o CEO fechou.
 *
 * Os números vêm de `PLANS` → `@/lib/billing/pricing`, fonte única. Nenhum valor
 * é digitado aqui, e nenhum deve voltar a ser.
 *
 * ⚠️ These are COMMERCIAL names (Essencial / Crescimento / Performance). The
 * database enum is `Plan { STARTER, GROWTH, PRO }` — same three tiers, different
 * labels. Keep the mapping in that order; never print the enum on the site, and
 * never print these names in the panel.
 */

import { PrimaryCta } from "./Cta";
import { PRECOS_URL } from "./config";
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
            Cada plano abre pelo que só ele te dá. Veja a tabela completa — o que
            entra em cada um, mensal ou anual, e os adicionais.
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

        {/*
          Este bloco é RESUMO, e resumo termina na tabela — não no formulário (ordem
          do CEO, 05/08). Quem chegou até aqui está comparando preço, não pedindo
          reunião: mandar para a demonstração troca o passo natural (ver tudo) por um
          pedido de contato, e perde quem só queria conferir o que entra em cada plano.
          O caminho da demonstração continua no header e no fim da página.
        */}
        <div className="mt-7 flex justify-center">
          <PrimaryCta label="Ver os planos completos" href={PRECOS_URL} />
        </div>
      </div>
    </section>
  );
}
