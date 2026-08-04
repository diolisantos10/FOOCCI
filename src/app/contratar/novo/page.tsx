/**
 * /contratar/novo — o checkout self-service público.
 *
 * O caminho que faltava: da página de preços até a conta rodando, sem humano no
 * meio. Chega por `?plano=essencial&ciclo=MENSAL` vindo dos botões de
 * `/site/precos`; sem parâmetro, abre no Crescimento mensal e o cliente troca.
 *
 * O preço mostrado aqui é o MESMO objeto que o servidor usa para cobrar
 * (`@/lib/billing/pricing`) — não há segunda tabela para divergir. A tela mostra
 * o que sai hoje (com os 50% do primeiro mês) e o que sai na renovação, os dois
 * lado a lado: o cliente não pode ser surpreendido no segundo mês.
 *
 * O aceite do Termo acontece AQUI, antes do pagamento.
 */

import type { Metadata } from "next";
import { TERMS_SECTIONS, TERMS_VERSION } from "@/lib/billing/terms";
import {
  normalizePlanCode,
  normalizeCycleCode,
  type PlanCode,
  type CycleCode,
} from "@/lib/billing/pricing";
import { CheckoutClient } from "./CheckoutClient";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: { absolute: "Contratar o Foocci" },
  description: "Escolha o plano, aceite o Termo e comece a rodar. Primeiro mês pela metade.",
  robots: { index: false, follow: false },
};

export default function NovoCheckoutPage({
  searchParams,
}: {
  searchParams: { plano?: string; ciclo?: string };
}) {
  const plan: PlanCode = normalizePlanCode(searchParams.plano) ?? "GROWTH";
  const cycle: CycleCode = normalizeCycleCode(searchParams.ciclo) ?? "MENSAL";

  return (
    <main className="min-h-screen bg-canvas px-4 py-8 sm:py-12">
      <div className="mx-auto max-w-3xl">
        <div className="mb-8 text-center">
          <a href="/site/precos" className="inline-block text-2xl font-semibold tracking-tight text-ink">
            f<span className="text-brand-500">oo</span>cci
          </a>
          <h1 className="mt-4 text-2xl font-semibold tracking-tight text-ink sm:text-3xl">
            Contrate e comece a rodar hoje.
          </h1>
          <p className="mt-2 text-sm leading-relaxed text-ink2">
            Escolha o plano, aceite o Termo e pague. Sua loja e seu acesso ficam prontos na hora.
          </p>
        </div>

        <CheckoutClient
          initialPlan={plan}
          initialCycle={cycle}
          terms={TERMS_SECTIONS}
          termsVersion={TERMS_VERSION}
        />

        <p className="mt-8 text-center text-xs text-muted">
          Foocci · CNPJ 59.120.811/0001-79 · foocci.com.br ·{" "}
          <a href="/site/demonstracao" className="underline decoration-line2 underline-offset-2 hover:text-ink2">
            Prefere ver antes? Peça uma demonstração
          </a>
        </p>
      </div>
    </main>
  );
}
