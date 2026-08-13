"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { Button, ButtonLink } from "@/components/ui";
import type { OnboardingStatusData, StepStatus } from "@/services/onboarding/onboardingStatus";

// ── Types ──────────────────────────────────────────────────────────────────────

type Status = OnboardingStatusData | null;

// ── Constants ──────────────────────────────────────────────────────────────────

const READINESS_LABELS: Record<OnboardingStatusData["readiness"], { label: string; color: string; bg: string; border: string }> = {
  NAO_INICIADO:      { label: "Não iniciado",       color: "text-ink2",  bg: "bg-[#F4F4F2]",    border: "border-line2" },
  EM_CONFIGURACAO:   { label: "Em configuração",    color: "text-blue-700",  bg: "bg-blue-50",     border: "border-blue-200" },
  PRONTO_PARA_TESTE: { label: "Pronto para teste",  color: "text-amber-700", bg: "bg-amber-50",    border: "border-amber-200" },
  PRONTO_PARA_PILOTO:{ label: "Pronto para piloto", color: "text-green-700", bg: "bg-green-50",    border: "border-green-200" },
  BLOQUEADO:         { label: "Bloqueado",           color: "text-red-700",   bg: "bg-red-50",      border: "border-red-200" },
};

const STEP_ICON: Record<StepStatus, string> = {
  COMPLETE: "✓",
  PENDING:  "○",
  WARNING:  "⚠",
  BLOCKED:  "✕",
};

const STEP_TEXT: Record<StepStatus, string> = {
  COMPLETE: "text-green-700",
  PENDING:  "text-amber-700",
  WARNING:  "text-brand-700",
  BLOCKED:  "text-red-700",
};

const FINAL_TEST_ITEMS = [
  "Abrir link de delivery no celular",
  "Verificar se o cardápio carregou corretamente",
  "Adicionar um produto ao pedido",
  "Finalizar pedido com pagamento na entrega/retirada",
  "Confirmar que o pedido aparece em Pedidos",
  "Confirmar que o cliente aparece no CRM",
  "Confirmar que Analytics registrou o pedido",
  "Abrir link do QR Code",
  "Verificar se o QR carregou no celular",
  "Confirmar horários de funcionamento estão corretos",
];

// ── Utilities ──────────────────────────────────────────────────────────────────

function CopyBtn({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={() => { void navigator.clipboard.writeText(text).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500); }); }}
      className={`ml-1 shrink-0 text-xs transition-colors ${copied ? "text-green-600" : "text-muted hover:text-ink2"}`}
    >
      {copied ? "✓" : "📋"}
    </button>
  );
}

function ProgressBar({ value, max }: { value: number; max: number }) {
  const pct = max > 0 ? Math.round((value / max) * 100) : 0;
  // Progresso é progresso: laranja da casa enquanto anda, verde ao fechar. A
  // barra vermelha de antes repreendia quem tinha acabado de começar.
  const color = pct === 100 ? "bg-green-500" : "bg-brand-500";
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-2 bg-[#F4F4F2] rounded-full overflow-hidden">
        <div className={`h-full rounded-full transition-all duration-500 ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="w-10 text-right text-xs font-semibold text-muted">{value}/{max}</span>
    </div>
  );
}

// ── Step card ──────────────────────────────────────────────────────────────────

function StepCard({
  number,
  title,
  subtitle,
  step,
  href,
  children,
}: {
  number: number;
  title: string;
  subtitle: string;
  step: OnboardingStatusData["steps"][keyof OnboardingStatusData["steps"]];
  href?: string;
  children?: React.ReactNode;
}) {
  // Etapa que ainda não começou é NEUTRA. Sete bolinhas amarelas e vermelhas de
  // uma vez transformam a tela num painel de alarme, e aí nenhuma cor significa
  // mais nada — a cor fica reservada ao que exige atenção de verdade.
  const iconColor = {
    COMPLETE: "bg-green-500 text-white",
    PENDING:  "bg-[#F4F4F2] text-ink2",
    WARNING:  "bg-brand-500 text-white",
    BLOCKED:  "bg-red-500 text-white",
  }[step.status];
  const borderColor = { COMPLETE: "border-green-200", PENDING: "border-line", WARNING: "border-brand-200", BLOCKED: "border-red-200" }[step.status];

  return (
    <div className={`rounded-2xl border bg-paper p-5 shadow-[0_1px_2px_rgba(11,11,11,.03)] ${borderColor}`}>
      <div className="flex items-start gap-4">
        <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-semibold ${iconColor}`}>
          {step.status === "COMPLETE" ? "✓" : number}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <h3 className="font-semibold text-ink">{title}</h3>
            <span className={`text-xs font-semibold ${STEP_TEXT[step.status]}`}>
              {STEP_ICON[step.status]} {step.status === "COMPLETE" ? "Concluído" : step.status === "BLOCKED" ? "Bloqueado" : step.status === "WARNING" ? "Atenção" : "Pendente"}
            </span>
          </div>
          <p className="mt-0.5 text-sm text-muted">{subtitle}</p>
          <p className={`mt-2 text-xs font-semibold ${STEP_TEXT[step.status]}`}>{step.message}</p>
          {children && <div className="mt-3">{children}</div>}
          {href && step.status !== "COMPLETE" && (
            <Link
              href={href}
              className="mt-3 inline-flex items-center gap-1 rounded-lg border border-line2 bg-[#FAFAF8] px-3 py-1.5 text-xs font-semibold text-ink2 transition-colors hover:bg-[#F4F4F2]"
            >
              Configurar →
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────

export default function OnboardingClient() {
  const [status, setStatus]     = useState<Status>(null);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState<string | null>(null);
  const [marking, setMarking]   = useState(false);
  const [checked, setChecked]   = useState<Record<number, boolean>>({});

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res  = await fetch("/api/onboarding/status");
      const json = await res.json() as { data?: OnboardingStatusData; error?: string };
      if (!res.ok) { setError(json.error ?? "Erro ao carregar status."); return; }
      setStatus(json.data ?? null);
    } catch {
      setError("Erro de rede.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function markTestComplete() {
    setMarking(true);
    try {
      const res  = await fetch("/api/onboarding/status", { method: "POST" });
      const json = await res.json() as { data?: OnboardingStatusData };
      if (res.ok && json.data) setStatus(json.data);
    } finally {
      setMarking(false);
    }
  }

  if (loading) {
    return (
      <div className="min-h-full bg-canvas">
        <div className="mx-auto max-w-3xl px-4 py-8 space-y-4">
          {[1, 2, 3].map((i) => <div key={i} className="h-28 animate-pulse rounded-2xl bg-line2" />)}
        </div>
      </div>
    );
  }

  // Erro: o que houve + como resolver + "Tentar de novo" (DESIGN.md §6.1). Antes
  // era um retângulo vermelho sem saída — tela morta na primeira falha de rede.
  if (error || !status) {
    return (
      <div className="min-h-full bg-canvas">
        <div className="mx-auto max-w-3xl px-4 py-8">
          <div className="rounded-2xl border border-red-200 bg-red-50 px-5 py-4">
            <p className="text-sm font-semibold text-red-700">
              {error ?? "Não foi possível carregar a configuração do restaurante."}
            </p>
            <p className="mt-1 text-xs text-red-600">
              Nada foi perdido — o que você já configurou continua salvo.
            </p>
            <Button variant="secondary" className="mt-3" onClick={() => void load()}>
              Tentar de novo
            </Button>
          </div>
        </div>
      </div>
    );
  }

  const r = READINESS_LABELS[status.readiness];
  const stepsArr = Object.values(status.steps);
  const completedCount = stepsArr.filter((s) => s.status === "COMPLETE").length;
  const tudoPronto = status.readiness === "PRONTO_PARA_PILOTO";
  const checkedCount = Object.values(checked).filter(Boolean).length;

  return (
    <div className="min-h-full bg-canvas">
      <div className="mx-auto max-w-3xl px-4 py-8 pb-16 space-y-6">

        {/* ── Header ──
            Esta é a PRIMEIRA tela de quem acabou de contratar (13/08/2026): o
            painel manda para cá quem ainda não tem cardápio. O título era o
            rótulo de prontidão — e num restaurante recém-criado ele é
            "Bloqueado", em vermelho, tamanho manchete. Boas-vindas nenhuma, e a
            palavra nem é do vocabulário do lojista: ele não bloqueou nada, ele
            só ainda não configurou. O rótulo continua na tela, como status
            secundário, porque quem acompanha o piloto usa ele. */}
        <div className="rounded-2xl border border-line bg-paper px-5 py-5 shadow-[0_1px_2px_rgba(11,11,11,.03)] sm:px-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="truncate text-xs font-semibold uppercase tracking-widest text-muted">
                {status.restaurantName}
              </p>
              <h1 className="mt-1 text-xl font-semibold text-ink">
                {tudoPronto ? "Tudo pronto para vender" : "Vamos configurar seu restaurante"}
              </h1>
            </div>
            <span className={`shrink-0 rounded-full border px-3 py-1 text-[11.5px] font-semibold ${r.color} ${r.border} ${r.bg}`}>
              {r.label}
            </span>
          </div>
          <p className="mt-2 text-[13px] leading-snug text-ink2">
            {tudoPronto
              ? "Todas as etapas estão concluídas. Seu restaurante está pronto para receber pedidos de verdade."
              : "Siga as etapas abaixo para deixar seu restaurante pronto para receber pedidos. Cada uma leva você direto para a tela certa."}
          </p>
          <div className="mt-4">
            <ProgressBar value={completedCount} max={stepsArr.length} />
          </div>
        </div>

        {/* ── Step 1: Loja ── */}
        <StepCard
          number={1}
          title="Loja"
          subtitle="Dados principais, endereço e telefone do restaurante."
          step={status.steps.loja}
          href="/settings/store"
        />

        {/* ── Step 2: Funcionamento ── */}
        <StepCard
          number={2}
          title="Horários de funcionamento"
          subtitle="Configure os dias e horários em que o restaurante está aberto."
          step={status.steps.funcionamento}
          href="/settings/operation"
        />

        {/* ── Step 3: Entrega e retirada ── */}
        <StepCard
          number={3}
          title="Entrega e retirada"
          subtitle="Habilite delivery, retirada e configure taxas e raio de entrega."
          step={status.steps.entrega}
          href="/settings/delivery"
        />

        {/* ── Step 4: Pagamentos ── */}
        <StepCard
          number={4}
          title="Pagamentos"
          subtitle="Para o piloto, recomendamos começar com dinheiro, Pix ou cartão na entrega."
          step={status.steps.pagamentos}
          href="/settings/payments"
        >
          <div className="flex flex-wrap gap-2 text-xs">
            {[
              { label: "Dinheiro",   active: status.payment.acceptCash },
              { label: "Pix",        active: status.payment.acceptPix  },
              { label: "Cartão",     active: status.payment.acceptCard },
            ].map(({ label, active }) => (
              <span
                key={label}
                className={`rounded-full border px-3 py-1 font-semibold ${
                  active
                    ? "border-green-200 bg-green-50 text-green-700"
                    : "border-line2 bg-[#FAFAF8] text-muted"
                }`}
              >
                {active ? "✓" : "○"} {label}
              </span>
            ))}
            {!status.payment.hasOnlineProvider && (
              <span className="rounded-full border border-amber-200 bg-amber-50 px-3 py-1 font-semibold text-amber-700">
                ⚠ Pagamento online não configurado
              </span>
            )}
          </div>
          <p className="mt-2 text-[11px] text-muted">
            Pagamento online deve ser ativado somente após teste em ambiente de produção.
          </p>
        </StepCard>

        {/* ── Step 5: Cardápio ── */}
        <StepCard
          number={5}
          title="Cardápio"
          subtitle="Adicione categorias e produtos com preço antes de abrir para clientes."
          step={status.steps.cardapio}
          href="/menu"
        >
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 text-center">
            {[
              { label: "Categorias",  value: status.counts.categories },
              { label: "Ativos",      value: status.counts.activeProducts },
              { label: "Total",       value: status.counts.totalProducts },
              { label: "Com foto",    value: status.counts.productsWithImage },
            ].map(({ label, value }) => (
              <div key={label} className="rounded-xl bg-[#FAFAF8] px-3 py-2.5">
                <p className="text-xl font-semibold text-ink">{value}</p>
                <p className="text-[10px] text-muted mt-0.5">{label}</p>
              </div>
            ))}
          </div>
          <div className="mt-3 flex gap-2 flex-wrap">
            <Link href="/menu" className="inline-flex items-center gap-1 rounded-lg border border-line2 bg-paper px-3 py-1.5 text-xs font-semibold text-ink2 hover:bg-[#FAFAF8] transition-colors">
              Abrir cardápio →
            </Link>
          </div>
        </StepCard>

        {/* ── Step 6: Canais ── */}
        <StepCard
          number={6}
          title="Canais e links públicos"
          subtitle="Compartilhe os links de delivery e QR com seus clientes."
          step={status.steps.canais}
        >
          {/* Links */}
          <div className="space-y-2">
            {[
              { label: "Delivery",  url: status.links.delivery },
              { label: "QR Salão",  url: status.links.qr },
            ].map(({ label, url }) => (
              <div key={label} className="flex items-center gap-2 rounded-xl border border-line2 bg-[#FAFAF8] px-3 py-2">
                <div className="min-w-0 flex-1">
                  <p className="text-[10px] text-muted uppercase">{label}</p>
                  <p className="text-xs text-ink2 font-mono truncate">{url || "—"}</p>
                </div>
                {url && (
                  <div className="flex gap-1 shrink-0">
                    <CopyBtn text={url} />
                    <a href={url} target="_blank" rel="noopener noreferrer" className="text-xs text-muted hover:text-ink2">↗</a>
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* WhatsApp */}
          <div className="mt-3 flex flex-wrap gap-2 text-xs">
            <span className={`rounded-full border px-3 py-1 font-semibold ${status.whatsapp.hasPhone ? "border-green-200 bg-green-50 text-green-700" : "border-amber-200 bg-amber-50 text-amber-700"}`}>
              {status.whatsapp.hasPhone ? "✓" : "⚠"} Telefone WhatsApp
            </span>
            <span className={`rounded-full border px-3 py-1 font-semibold ${status.whatsapp.hasWhatsApp ? "border-green-200 bg-green-50 text-green-700" : "border-line2 bg-[#FAFAF8] text-muted"}`}>
              {status.whatsapp.hasWhatsApp ? "✓" : "○"} WhatsApp oficial (Meta)
            </span>
            <span className="rounded-full border border-line2 bg-[#FAFAF8] px-3 py-1 font-semibold text-ink2">
              Modo: {status.whatsapp.agentMode === "RECEPTIONIST_ONLY" ? "Recepcionista" : status.whatsapp.agentMode === "HUMAN_ASSISTED" ? "Humano Assistido" : "IA Pedidos (exp.)"}
            </span>
          </div>
          <div className="mt-2 flex gap-2">
            <Link href="/integracoes/whatsapp" className="inline-flex items-center gap-1 rounded-lg border border-line2 bg-paper px-3 py-1.5 text-xs font-semibold text-ink2 hover:bg-[#FAFAF8] transition-colors">
              Configurar WhatsApp →
            </Link>
          </div>
        </StepCard>

        {/* ── Step 7: Teste final ── */}
        <StepCard
          number={7}
          title="Teste final"
          subtitle="Realize um pedido de teste completo antes de abrir para clientes reais."
          step={status.steps.teste}
        >
          {status.steps.teste.status !== "COMPLETE" ? (
            <>
              <div className="space-y-2 mb-4">
                {FINAL_TEST_ITEMS.map((item, i) => (
                  <label key={i} className="flex items-start gap-2.5 cursor-pointer group">
                    <input
                      type="checkbox"
                      checked={!!checked[i]}
                      onChange={(e) => setChecked((prev) => ({ ...prev, [i]: e.target.checked }))}
                      className="mt-0.5 h-4 w-4 shrink-0 rounded border-line2 accent-green-500"
                    />
                    <span className={`text-sm transition-colors ${checked[i] ? "text-muted line-through" : "text-ink2"}`}>
                      {item}
                    </span>
                  </label>
                ))}
              </div>
              <div className="mb-3">
                <ProgressBar value={checkedCount} max={FINAL_TEST_ITEMS.length} />
              </div>
              <button
                type="button"
                onClick={() => void markTestComplete()}
                disabled={marking || checkedCount < FINAL_TEST_ITEMS.length}
                className="w-full rounded-xl bg-green-600 py-2.5 text-sm font-semibold text-white hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {marking ? "Salvando…" : checkedCount < FINAL_TEST_ITEMS.length ? `Conclua todos os ${FINAL_TEST_ITEMS.length} itens para marcar como feito` : "Marcar teste como concluído"}
              </button>
            </>
          ) : (
            <div className="flex items-center gap-3 rounded-xl border border-green-200 bg-green-50 px-4 py-3">
              <span className="text-green-600 text-lg">✓</span>
              <div>
                <p className="text-sm font-semibold text-green-800">Teste concluído</p>
                <p className="text-xs text-green-600">
                  {status.finalTestCompletedAt
                    ? `Marcado em ${new Date(status.finalTestCompletedAt).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" })}`
                    : "Restaurante pronto para o piloto!"}
                </p>
              </div>
            </div>
          )}
        </StepCard>

        {/* ── Actions ──
            `?painel=1` é a saída do vaivém: sem cardápio, o `/dashboard` devolve
            para cá. O parâmetro diz "eu quero o painel mesmo assim". */}
        <div className="flex flex-wrap gap-3 pt-2">
          <a
            href={status.links.delivery}
            target="_blank"
            rel="noopener noreferrer"
            className="flex-1 min-w-36 text-center rounded-xl border border-line2 bg-paper py-2.5 text-sm font-semibold text-ink2 shadow-sm hover:bg-[#FAFAF8] transition-colors"
          >
            Abrir cardápio delivery ↗
          </a>
          <ButtonLink href="/dashboard?painel=1" variant="primary" className="flex-1 min-w-36">
            Ir para o painel
          </ButtonLink>
        </div>
      </div>
    </div>
  );
}
