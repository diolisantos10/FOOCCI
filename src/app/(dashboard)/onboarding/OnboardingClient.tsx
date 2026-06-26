"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import type { OnboardingStatusData, StepStatus } from "@/app/api/onboarding/status/route";

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

const STEP_DOT: Record<StepStatus, string> = {
  COMPLETE: "bg-green-500",
  PENDING:  "bg-amber-400",
  WARNING:  "bg-brand-400",
  BLOCKED:  "bg-red-500",
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
  const color = pct === 100 ? "bg-green-500" : pct >= 60 ? "bg-amber-400" : "bg-red-400";
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-2 bg-[#F4F4F2] rounded-full overflow-hidden">
        <div className={`h-full rounded-full transition-all duration-500 ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs font-semibold text-muted w-10 text-right">{value}/{max}</span>
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
  const iconColor = { COMPLETE: "bg-green-500", PENDING: "bg-amber-400", WARNING: "bg-brand-400", BLOCKED: "bg-red-500" }[step.status];
  const borderColor = { COMPLETE: "border-green-200", PENDING: "border-line2", WARNING: "border-brand-200", BLOCKED: "border-red-200" }[step.status];

  return (
    <div className={`rounded-2xl border bg-paper p-5 shadow-sm ${borderColor}`}>
      <div className="flex items-start gap-4">
        <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-bold text-white ${iconColor}`}>
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
          <p className={`mt-2 text-xs font-medium ${STEP_TEXT[step.status]}`}>{step.message}</p>
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
      <div className="min-h-screen bg-[#F5F5F5]">
        <div className="mx-auto max-w-3xl px-4 py-10 space-y-4">
          {[1, 2, 3].map((i) => <div key={i} className="h-28 animate-pulse rounded-2xl bg-paper" />)}
        </div>
      </div>
    );
  }

  if (error || !status) {
    return (
      <div className="min-h-screen bg-[#F5F5F5]">
        <div className="mx-auto max-w-3xl px-4 py-10">
          <div className="rounded-2xl border border-red-200 bg-red-50 px-5 py-4 text-sm text-red-700">
            {error ?? "Não foi possível carregar o status de configuração."}
          </div>
        </div>
      </div>
    );
  }

  const r = READINESS_LABELS[status.readiness];
  const stepsArr = Object.values(status.steps);
  const completedCount = stepsArr.filter((s) => s.status === "COMPLETE").length;
  const checkedCount = Object.values(checked).filter(Boolean).length;

  return (
    <div className="min-h-screen bg-[#F5F5F5]">
      <div className="mx-auto max-w-3xl px-4 py-8 pb-16 space-y-6">

        {/* ── Header ── */}
        <div className={`rounded-2xl border ${r.border} ${r.bg} px-6 py-5`}>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-widest text-muted">
                {status.restaurantName}
              </p>
              <h1 className={`mt-1 text-xl font-bold ${r.color}`}>{r.label}</h1>
            </div>
            <span className={`rounded-full border px-4 py-1.5 text-sm font-bold ${r.color} ${r.border} bg-paper`}>
              {completedCount}/{stepsArr.length} etapas
            </span>
          </div>
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
                className={`rounded-full border px-3 py-1 font-medium ${
                  active
                    ? "border-green-200 bg-green-50 text-green-700"
                    : "border-line2 bg-[#FAFAF8] text-muted"
                }`}
              >
                {active ? "✓" : "○"} {label}
              </span>
            ))}
            {!status.payment.hasOnlineProvider && (
              <span className="rounded-full border border-amber-200 bg-amber-50 px-3 py-1 font-medium text-amber-700">
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
                <p className="text-xl font-bold text-ink">{value}</p>
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
            <span className={`rounded-full border px-3 py-1 font-medium ${status.whatsapp.hasPhone ? "border-green-200 bg-green-50 text-green-700" : "border-amber-200 bg-amber-50 text-amber-700"}`}>
              {status.whatsapp.hasPhone ? "✓" : "⚠"} Telefone WhatsApp
            </span>
            <span className={`rounded-full border px-3 py-1 font-medium ${status.whatsapp.hasEvolution ? "border-green-200 bg-green-50 text-green-700" : "border-line2 bg-[#FAFAF8] text-muted"}`}>
              {status.whatsapp.hasEvolution ? "✓" : "○"} Evolution API
            </span>
            <span className="rounded-full border border-line2 bg-[#FAFAF8] px-3 py-1 font-medium text-ink2">
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

        {/* ── Actions ── */}
        <div className="flex flex-wrap gap-3 pt-2">
          <a
            href={status.links.delivery}
            target="_blank"
            rel="noopener noreferrer"
            className="flex-1 min-w-36 text-center rounded-xl border border-line2 bg-paper py-2.5 text-sm font-semibold text-ink2 shadow-sm hover:bg-[#FAFAF8] transition-colors"
          >
            Abrir cardápio delivery ↗
          </a>
          <Link
            href="/dashboard"
            className="flex-1 min-w-36 text-center rounded-xl bg-brand-500 py-2.5 text-sm font-semibold text-white hover:bg-brand-600 transition-colors"
          >
            Voltar ao painel
          </Link>
        </div>
      </div>
    </div>
  );
}
