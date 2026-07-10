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
