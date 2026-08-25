/**
 * /contratar/obrigado — onde o cliente cai depois de pagar.
 *
 * Esta página era referenciada como `back_url` do Mercado Pago e NÃO EXISTIA:
 * quem pagasse batia num 404 logo depois de passar o cartão. É o pior lugar
 * possível para um 404.
 *
 * A página diz a verdade sobre o estado real, e são quatro estados diferentes —
 * porque o retorno do MP é mais rápido que o webhook:
 *
 *  1. Conta pronta → endereço real da loja + como entrar.
 *  2. Pago, conta ainda nascendo → "estamos preparando", com recarga automática.
 *     Não promete o que ainda não aconteceu.
 *  3. Aceite registrado, pagamento não confirmado → o que falta.
 *  4. Sem token / token inválido → mensagem genérica. Não confirma nem nega que
 *     exista assinatura alguma (mesma postura da página de aceite).
 *
 * O caso "pagou e a conta não nasceu" (`provisionError`) NÃO é escondido do
 * cliente: ele vê que a equipe foi avisada e como falar com a gente. Tela alegre
 * mentindo sobre conta que não existe é o que gera o chamado raivoso.
 */

import type { Metadata } from "next";
import { prisma } from "@/lib/prisma";
import { PlanSubscriptionService } from "@/services/billing/PlanSubscriptionService";
import { PLAN_LABEL, CYCLE_LABEL, formatBRL, type PlanCode, type CycleCode } from "@/lib/billing/pricing";
import { FoocciWordmark } from "@/components/brand/FoocciWordmark";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: { absolute: "Contratação recebida | Foocci" },
  robots: { index: false, follow: false },
};

function Shell({ children, refreshSeconds }: { children: React.ReactNode; refreshSeconds?: number }) {
  return (
    <main className="min-h-screen bg-canvas px-4 py-12">
      {/* Recarga só no estado "ainda processando": é o único em que a página
          muda sozinha. Nos demais, recarregar seria ruído. */}
      {refreshSeconds ? <meta httpEquiv="refresh" content={String(refreshSeconds)} /> : null}
      <div className="mx-auto max-w-xl">
        <div className="mb-8 flex justify-center">
          <FoocciWordmark className="h-7 w-auto" />
        </div>
        {children}
      </div>
    </main>
  );
}

function Card({ children }: { children: React.ReactNode }) {
  return <div className="rounded-2xl border border-line bg-paper p-6 sm:p-8">{children}</div>;
}

export default async function ObrigadoPage({ searchParams }: { searchParams: { s?: string } }) {
  const token = searchParams.s ?? "";
  const sub = token ? await PlanSubscriptionService.getByToken(token) : null;

  // ── 4. Sem contexto: genérico, sem vazar existência de assinatura ────────
  if (!sub) {
    return (
      <Shell>
        <Card>
          <h1 className="text-xl font-semibold text-ink">Recebemos sua contratação</h1>
          <p className="mt-3 text-sm leading-relaxed text-ink2">
            Assim que o pagamento for confirmado pelo Mercado Pago, sua conta é criada e você entra no painel com o
            e-mail e a senha que cadastrou. Isso costuma levar poucos minutos.
          </p>
          <a
            href="/login"
            className="mt-6 inline-block rounded-xl bg-brand-500 px-6 py-3 text-sm font-semibold text-white hover:bg-brand-600"
          >
            Ir para o login
          </a>
        </Card>
      </Shell>
    );
  }

  const restaurant = sub.restaurantId
    ? await prisma.restaurant.findUnique({ where: { id: sub.restaurantId }, select: { name: true, slug: true } })
    : null;

  const planName = PLAN_LABEL[sub.plan as PlanCode] ?? sub.plan;
  const cycleName = CYCLE_LABEL[sub.cycle as CycleCode] ?? sub.cycle;

  const Resumo = (
    <div className="mt-6 rounded-xl border border-line bg-canvas p-4 text-sm">
      <div className="flex items-baseline justify-between">
        <span className="text-muted">Plano</span>
        <span className="font-semibold text-ink">
          {planName} · {cycleName}
        </span>
      </div>
      <div className="mt-2 flex items-baseline justify-between">
        <span className="text-muted">Pago agora</span>
        <span className="font-semibold tabular-nums text-ink">
          {formatBRL(sub.firstChargeCents ?? sub.priceCents)}
        </span>
      </div>
      <div className="mt-2 flex items-baseline justify-between">
        <span className="text-muted">Renovação</span>
        <span className="tabular-nums text-ink2">{formatBRL(sub.priceCents)}</span>
      </div>
    </div>
  );

  // ── 1. Conta pronta ──────────────────────────────────────────────────────
  if (restaurant) {
    return (
      <Shell>
        <Card>
          <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-green-700">Tudo certo</p>
          <h1 className="mt-2 text-xl font-semibold text-ink">Sua conta já está no ar, {sub.customerName.split(" ")[0]}.</h1>
          <p className="mt-3 text-sm leading-relaxed text-ink2">
            O <span className="font-semibold text-ink">{restaurant.name}</span> já existe no Foocci. Entre no painel com
            o e-mail <span className="font-semibold text-ink">{sub.customerEmail}</span> e a senha que você acabou de
            cadastrar — o próprio painel te guia no primeiro cardápio.
          </p>

          <div className="mt-5 rounded-xl border border-line bg-canvas p-4">
            <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-muted">Endereço da sua loja</p>
            <p className="mt-1 break-all text-sm font-semibold text-ink">foocci.com.br/pedido/{restaurant.slug}</p>
          </div>

          {Resumo}

          <a
            href="/login"
            className="mt-6 inline-block w-full rounded-xl bg-brand-500 px-6 py-3.5 text-center text-sm font-semibold text-white hover:bg-brand-600"
          >
            Entrar no painel
          </a>
          <p className="mt-3 text-center text-xs text-muted">
            A nota fiscal desta cobrança é emitida e enviada em seguida.
          </p>
        </Card>
      </Shell>
    );
  }

  // ── Falha de criação de conta com pagamento já confirmado ────────────────
  if (sub.provisionError) {
    return (
      <Shell>
        <Card>
          <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-brand-700">Pagamento recebido</p>
          <h1 className="mt-2 text-xl font-semibold text-ink">Seu pagamento entrou — a conta travou na criação.</h1>
          <p className="mt-3 text-sm leading-relaxed text-ink2">
            Não vamos fingir que está tudo pronto: houve uma falha ao criar sua conta e nossa equipe já foi avisada
            automaticamente, com os seus dados. Sua contratação está registrada e seu pagamento não se perdeu — vamos
            concluir a criação e te avisar pelo WhatsApp{" "}
            <span className="font-semibold text-ink">{sub.customerWhatsapp}</span>.
          </p>
          {Resumo}
        </Card>
      </Shell>
    );
  }

  // ── 2. Pago, conta ainda nascendo ────────────────────────────────────────
  if (sub.status === "ATIVA") {
    return (
      <Shell refreshSeconds={10}>
        <Card>
          <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-brand-700">Pagamento confirmado</p>
          <h1 className="mt-2 text-xl font-semibold text-ink">Estamos preparando sua conta.</h1>
          <p className="mt-3 text-sm leading-relaxed text-ink2">
            Leva alguns segundos. Esta página se atualiza sozinha — quando terminar, o endereço da sua loja aparece
            aqui e você já entra no painel.
          </p>
          {Resumo}
        </Card>
      </Shell>
    );
  }

  // ── 3. Aceite registrado, pagamento ainda não confirmado ─────────────────
  return (
    <Shell refreshSeconds={15}>
      <Card>
        <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-muted">Contratação registrada</p>
        <h1 className="mt-2 text-xl font-semibold text-ink">Estamos aguardando a confirmação do pagamento.</h1>
        <p className="mt-3 text-sm leading-relaxed text-ink2">
          {sub.termsAcceptedAt
            ? "Seu aceite do Termo já está registrado. Assim que o Mercado Pago confirmar a cobrança, sua conta é criada automaticamente e você entra com o e-mail e a senha que cadastrou."
            : "Falta registrar o aceite do Termo para concluir a contratação."}
        </p>
        {!sub.termsAcceptedAt && (
          <a
            href={`/contratar/${sub.acceptToken}`}
            className="mt-5 inline-block rounded-xl bg-brand-500 px-6 py-3 text-sm font-semibold text-white hover:bg-brand-600"
          >
            Aceitar o Termo
          </a>
        )}
        {sub.mpInitPoint && !sub.termsAcceptedAt ? null : sub.mpInitPoint ? (
          <a
            href={sub.mpInitPoint}
            className="mt-5 inline-block rounded-xl border border-line bg-canvas px-6 py-3 text-sm font-semibold text-ink hover:border-line2"
          >
            Retomar o pagamento
          </a>
        ) : null}
        {Resumo}
      </Card>
    </Shell>
  );
}
