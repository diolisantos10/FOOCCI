/**
 * /contratar/[token] — a página pública de aceite do Termo de Contratação.
 *
 * O CEO fecha a venda 1:1 e manda este link. A página mostra o resumo do plano
 * fechado + o Termo, e o aceite registra quem/quando/IP/versão. Token errado =
 * 404 — a página não confirma nem nega que exista assinatura nenhuma.
 */

import { notFound } from "next/navigation";
import { PlanSubscriptionService, CYCLE_MONTHS } from "@/services/billing/PlanSubscriptionService";
import { TERMS_SECTIONS, TERMS_VERSION } from "@/lib/billing/terms";
import { AcceptClient } from "./AcceptClient";

export const dynamic = "force-dynamic";

const PLAN_LABEL: Record<string, string> = {
  STARTER: "Essencial",
  GROWTH: "Crescimento",
  PRO: "Performance",
};

function money(cents: number): string {
  return (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export default async function ContratarPage({ params }: { params: { token: string } }) {
  const sub = await PlanSubscriptionService.getByToken(params.token);
  if (!sub || sub.status === "CANCELADA") notFound();

  const months = CYCLE_MONTHS[sub.cycle];

  return (
    <main className="min-h-screen bg-canvas px-4 py-10">
      <div className="mx-auto max-w-2xl">
        <div className="mb-8 text-center">
          <div className="text-2xl font-semibold tracking-tight">
            f<span className="text-brand-500">oo</span>cci
          </div>
          <h1 className="mt-4 text-xl font-semibold text-ink">Contratação do plano</h1>
          <p className="mt-1 text-sm text-ink2">
            Para: <span className="font-semibold">{sub.customerName}</span>
          </p>
        </div>

        <div className="rounded-2xl border border-line bg-paper p-6">
          <div className="flex items-baseline justify-between">
            <div>
              <div className="text-sm text-muted">Plano</div>
              <div className="text-lg font-semibold text-ink">{PLAN_LABEL[sub.plan] ?? sub.plan}</div>
            </div>
            <div className="text-right">
              <div className="text-sm text-muted">
                Ciclo {sub.cycle.toLowerCase()} ({months} {months === 1 ? "mês" : "meses"})
              </div>
              <div className="text-lg font-semibold text-brand-600">{money(sub.priceCents)}</div>
            </div>
          </div>
        </div>

        <div className="mt-6 rounded-2xl border border-line bg-paper p-6">
          <h2 className="text-base font-semibold text-ink">Termo de Contratação do Serviço Foocci</h2>
          <p className="mt-1 text-xs text-muted">Versão {TERMS_VERSION}</p>
          <div className="mt-4 max-h-[50vh] space-y-4 overflow-y-auto pr-2 text-sm leading-relaxed text-ink2">
            {TERMS_SECTIONS.map((s) => (
              <section key={s.title}>
                <h3 className="font-semibold text-ink">{s.title}</h3>
                <p className="mt-1">{s.body}</p>
              </section>
            ))}
          </div>
        </div>

        <AcceptClient
          token={sub.acceptToken}
          alreadyAccepted={!!sub.termsAcceptedAt}
          paymentUrl={sub.mpInitPoint}
        />

        <p className="mt-8 text-center text-xs text-muted">
          Foocci · CNPJ 59.120.811/0001-79 · foocci.com.br
        </p>
      </div>
    </main>
  );
}
