"use client";

/**
 * CuponsTab — results of the coupon actions (CRM → Cupons).
 *
 * Shows how many coupons each campaign granted and their state (active / used /
 * expired). Redemption + revenue fill in once cart redemption (Fase B) is live.
 */

import { useState, useEffect } from "react";

interface CampaignRow { campaignId: string | null; campaignName: string; granted: number; active: number; used: number; }
interface Metrics {
  totalGranted: number; active: number; used: number; expired: number;
  grantedLast30Days: number; redemptionTracked: boolean; byCampaign: CampaignRow[];
}

function Stat({ label, value, tone = "default" }: { label: string; value: number; tone?: "default" | "green" | "amber" | "gray" }) {
  const cls = tone === "green" ? "text-emerald-600" : tone === "amber" ? "text-amber-600" : tone === "gray" ? "text-gray-400" : "text-ink";
  return (
    <div className="rounded-2xl border border-line bg-paper p-4">
      <p className={`text-2xl font-bold ${cls}`}>{value}</p>
      <p className="mt-0.5 text-xs text-muted">{label}</p>
    </div>
  );
}

const brl = (n: number) => `R$ ${n.toLocaleString("pt-BR")}`;

/**
 * Monthly coupon budget — moved here from CRM Configurações. Loads the full safety
 * config, edits only the coupon fields, and PATCHes the whole config back so the
 * other safety settings are preserved.
 */
function CouponBudgetSection() {
  const [cfg, setCfg]             = useState<Record<string, unknown> | null>(null);
  const [budget, setBudget]       = useState(0);
  const [avgTicket, setAvgTicket] = useState(50);
  const [committed, setCommitted] = useState(0); // distribuído/reservado (ainda válido)
  const [usedSpend, setUsedSpend] = useState(0); // gasto real (usado em compra)
  const [usedCount, setUsedCount] = useState(0);
  const [saving, setSaving]       = useState(false);
  const [saved, setSaved]         = useState(false);

  useEffect(() => {
    fetch("/api/settings/crm-safety")
      .then((r) => r.json())
      .then(({ data }) => {
        if (!data) return;
        setCfg(data);
        if (typeof data.couponMonthlyBudget === "number") setBudget(data.couponMonthlyBudget);
        if (typeof data.couponAvgTicket === "number") setAvgTicket(data.couponAvgTicket);
        if (typeof data.couponSpentThisMonth === "number") setCommitted(data.couponSpentThisMonth);
        if (typeof data.couponUsedSpend === "number") setUsedSpend(data.couponUsedSpend);
        if (typeof data.couponUsedCount === "number") setUsedCount(data.couponUsedCount);
      })
      .catch(() => {});
  }, []);

  async function save() {
    if (!cfg) return;
    setSaving(true); setSaved(false);
    try {
      const res = await fetch("/api/settings/crm-safety", {
        method:  "PATCH",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ ...cfg, couponMonthlyBudget: budget, couponAvgTicket: avgTicket }),
      });
      if (res.ok) { setSaved(true); setTimeout(() => setSaved(false), 2500); }
    } finally { setSaving(false); }
  }

  const on        = budget > 0;
  const remaining = on ? Math.max(0, budget - committed) : 0;
  const pct       = on ? Math.min(100, Math.round((committed / budget) * 100)) : 0;
  const low       = on && remaining <= Math.max(1, Math.round(budget * 0.1));
  const CFG_INPUT = "w-full rounded-xl border border-line bg-paper px-3 py-2 text-base text-ink focus:border-brand-400 focus:outline-none";

  return (
    <div className="rounded-2xl border border-line bg-paper p-4 sm:p-5">
      <p className="text-sm font-bold text-ink">Orçamento de cupons (mensal)</p>
      <p className="mt-0.5 text-xs text-muted">
        Teto em dinheiro para os cupons que o CRM distribui no mês. Distribuir um cupom só RESERVA o valor —
        o gasto de verdade acontece quando o cliente USA o cupom numa compra. Cupom que expira sem uso volta pro orçamento. 0 = sem limite.
      </p>

      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="rounded-xl border border-emerald-100 bg-emerald-50/50 px-4 py-3">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-emerald-700">💰 Gasto de verdade</p>
          <p className="mt-1 text-xl font-bold text-emerald-700">{brl(usedSpend)}</p>
          <p className="mt-0.5 text-[11px] text-muted">{usedCount} cupom{usedCount === 1 ? "" : "s"} usado{usedCount === 1 ? "" : "s"} em compras</p>
        </div>
        <div className="rounded-xl border border-line bg-[#FAFAF8] px-4 py-3">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted">Distribuído (reservado)</p>
          <p className="mt-1 text-xl font-bold text-ink">{brl(committed)}</p>
          <p className="mt-0.5 text-[11px] text-muted">cupons entregues, ainda não usados</p>
        </div>
        <div className="rounded-xl border border-line bg-[#FAFAF8] px-4 py-3">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted">Disponível este mês</p>
          <p className={`mt-1 text-xl font-bold ${!on ? "text-ink" : low ? "text-amber-600" : "text-emerald-600"}`}>{on ? brl(remaining) : "Sem limite"}</p>
          {on && <p className="mt-0.5 text-[11px] text-muted">de {brl(budget)}</p>}
        </div>
      </div>

      {on && (
        <div className="mt-4">
          <div className="h-2.5 w-full overflow-hidden rounded-full bg-gray-200">
            <div className={`h-full rounded-full ${low ? "bg-amber-500" : "bg-emerald-500"}`} style={{ width: `${pct}%` }} />
          </div>
          <p className="mt-1.5 text-xs text-muted">{brl(committed)} reservados de {brl(budget)} ({pct}%) · {brl(usedSpend)} gastos de verdade{low ? " · orçamento baixo." : "."}</p>
        </div>
      )}

      <div className="mt-4 grid gap-4 border-t border-line pt-4 sm:grid-cols-2">
        <div>
          <label className="mb-1 block text-xs font-semibold text-ink2">Orçamento mensal (R$)</label>
          <input type="number" min={0} max={1000000} value={budget}
            onChange={(e) => setBudget(Math.max(0, parseInt(e.target.value, 10) || 0))} className={CFG_INPUT} />
          <p className="mt-1 text-[11px] text-muted">Quanto o CRM pode gastar em cupons por mês. Zera no início de cada mês. 0 = sem limite.</p>
        </div>
        <div>
          <label className="mb-1 block text-xs font-semibold text-ink2">Ticket médio (R$)</label>
          <input type="number" min={1} max={100000} value={avgTicket}
            onChange={(e) => setAvgTicket(Math.max(1, parseInt(e.target.value, 10) || 50))} className={CFG_INPUT} />
          <p className="mt-1 text-[11px] text-muted">Serve para estimar o custo de um cupom de porcentagem (ex.: 20% de R$ 50 ≈ R$ 10).</p>
        </div>
      </div>

      <div className="mt-4 flex items-center gap-3">
        <button onClick={save} disabled={saving || !cfg}
          className="rounded-xl bg-brand-600 px-5 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50 transition">
          {saving ? "Salvando…" : "Salvar orçamento"}
        </button>
        {saved && <span className="text-xs font-semibold text-green-600">✓ Salvo!</span>}
      </div>
    </div>
  );
}

export function CuponsTab() {
  const [m, setM]           = useState<Metrics | null>(null);
  const [loading, setLoad]  = useState(true);

  useEffect(() => {
    fetch("/api/crm/coupon-metrics")
      .then((r) => r.json())
      .then((j) => { if (j?.data) setM(j.data as Metrics); })
      .catch(() => {})
      .finally(() => setLoad(false));
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <span className="h-6 w-6 animate-spin rounded-full border-2 border-brand-500 border-t-transparent" />
      </div>
    );
  }
  if (!m) return <p className="py-12 text-center text-sm text-muted">Não foi possível carregar as métricas.</p>;

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-base font-bold text-ink">Cupons</h2>
        <p className="mt-0.5 text-xs text-muted">Resultados dos cupons enviados pelas campanhas. Cupons valem só para compras online.</p>
      </div>

      <CouponBudgetSection />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        <Stat label="Cupons enviados" value={m.totalGranted} />
        <Stat label="Ativos na carteira" value={m.active} tone="green" />
        <Stat label="Usados" value={m.used} tone="green" />
        <Stat label="Expirados" value={m.expired} tone="gray" />
        <Stat label="Enviados (30 dias)" value={m.grantedLast30Days} />
      </div>

      {!m.redemptionTracked && (
        <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
          O uso dos cupons no carrinho ainda não está integrado — por enquanto medimos quantos foram enviados e
          quantos estão ativos. Assim que o resgate no carrinho entrar, aparecem aqui os cupons usados e a receita gerada.
        </p>
      )}

      <div className="rounded-2xl border border-line bg-paper">
        <div className="border-b border-line px-4 py-3">
          <p className="text-xs font-bold uppercase tracking-widest text-muted">Por campanha</p>
        </div>
        {m.byCampaign.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-muted">Nenhum cupom enviado ainda.</p>
        ) : (
          <div className="divide-y divide-line">
            {m.byCampaign.map((r) => (
              <div key={r.campaignId ?? "none"} className="flex items-center justify-between gap-3 px-4 py-3">
                <p className="text-sm font-semibold text-ink">{r.campaignName}</p>
                <div className="flex gap-4 text-xs">
                  <span className="text-muted">Enviados: <span className="font-bold text-ink">{r.granted}</span></span>
                  <span className="text-emerald-600">Ativos: <span className="font-bold">{r.active}</span></span>
                  <span className="text-emerald-600">Usados: <span className="font-bold">{r.used}</span></span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
