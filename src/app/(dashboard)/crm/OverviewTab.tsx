"use client";

import type { OverviewStats, CustomerTier } from "@/services/crm/CRMService";

// ── Config ────────────────────────────────────────────────────────────────────

const TIER_CONFIG: Record<CustomerTier, { label: string; icon: string; bar: string; text: string; bg: string }> = {
  DIAMANTE: { label: "Diamante", icon: "💎", bar: "bg-cyan-400",   text: "text-cyan-700",   bg: "bg-cyan-50"   },
  OURO:     { label: "Ouro",     icon: "🥇", bar: "bg-amber-400",  text: "text-amber-700",  bg: "bg-amber-50"  },
  PRATA:    { label: "Prata",    icon: "🥈", bar: "bg-gray-400",   text: "text-gray-600",   bg: "bg-gray-50"   },
  BRONZE:   { label: "Bronze",   icon: "🥉", bar: "bg-orange-400", text: "text-orange-700", bg: "bg-orange-50" },
};

function formatCurrency(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 2 });
}

// ── Sub-components ────────────────────────────────────────────────────────────

function KPICard({
  label,
  value,
  sub,
  accent,
}: {
  label: string;
  value: string | number;
  sub?: string;
  accent?: "green" | "red" | "blue" | "brand";
}) {
  const accentClass = {
    green: "text-green-700",
    red:   "text-red-600",
    blue:  "text-blue-700",
    brand: "text-brand-700",
  }[accent ?? "brand"] ?? "text-brand-700";

  return (
    <div className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
      <p className={`text-2xl font-extrabold ${accentClass}`}>{value}</p>
      <p className="mt-0.5 text-xs font-semibold text-gray-600">{label}</p>
      {sub && <p className="mt-1 text-[10px] text-gray-400">{sub}</p>}
    </div>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────

export function OverviewTab({
  stats,
  opportunitiesCount,
  onImportOpen,
  onGoToInactive,
  onGoToOpportunities,
}: {
  stats: OverviewStats;
  opportunitiesCount: number;
  onImportOpen: () => void;
  onGoToInactive: () => void;
  onGoToOpportunities: () => void;
}) {
  const activeRate = stats.totalCustomers > 0
    ? Math.round((stats.activeCustomers / stats.totalCustomers) * 100)
    : 0;

  const totalSegmented = stats.segments.reduce((s, x) => s + x.count, 0);

  return (
    <div className="space-y-6">

      {/* ── KPI grid ─────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <KPICard
          label="Total de clientes"
          value={stats.totalCustomers}
          accent="brand"
        />
        <KPICard
          label="Clientes ativos"
          value={stats.activeCustomers}
          sub="Pedido nos últimos 30 dias"
          accent="green"
        />
        <KPICard
          label="Clientes inativos"
          value={stats.inactiveCustomers}
          sub="Sem pedido há 30+ dias"
          accent="red"
        />
        <KPICard
          label="Novos este mês"
          value={stats.newThisMonth}
          accent="blue"
        />
      </div>

      {/* ── Ticket médio + Active rate ────────────────────────────────────── */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">

        {/* Ticket médio */}
        <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-widest text-gray-400 mb-1">
            Ticket médio
          </p>
          <p className="text-3xl font-extrabold text-gray-900">
            {stats.avgTicket > 0 ? formatCurrency(stats.avgTicket) : "—"}
          </p>
          <p className="mt-1 text-[10px] text-gray-400">
            Média de gasto por cliente que já fez ao menos 1 pedido
          </p>
        </div>

        {/* Active / Inactive bar */}
        <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-widest text-gray-400 mb-3">
            Engajamento da base
          </p>
          {stats.totalCustomers === 0 ? (
            <p className="text-sm text-gray-400">Nenhum cliente ainda.</p>
          ) : (
            <>
              <div className="flex h-3 w-full overflow-hidden rounded-full bg-gray-100">
                <div
                  className="bg-green-500 transition-all"
                  style={{ width: `${activeRate}%` }}
                />
                <div
                  className="bg-red-300 transition-all"
                  style={{ width: `${100 - activeRate}%` }}
                />
              </div>
              <div className="mt-2.5 flex gap-4 text-xs text-gray-600">
                <span className="flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-full bg-green-500" />
                  {activeRate}% ativos ({stats.activeCustomers})
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-full bg-red-300" />
                  {100 - activeRate}% inativos ({stats.inactiveCustomers})
                </span>
              </div>
            </>
          )}
        </div>
      </div>

      {/* ── Segmentos ────────────────────────────────────────────────────── */}
      <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-widest text-gray-400 mb-4">
          Distribuição por segmento
        </p>

        {totalSegmented === 0 ? (
          <p className="text-sm text-gray-400">Nenhum cliente ainda.</p>
        ) : (
          <div className="space-y-3">
            {stats.segments.map(({ tier, count }) => {
              const cfg = TIER_CONFIG[tier];
              const pct = totalSegmented > 0 ? Math.round((count / totalSegmented) * 100) : 0;
              return (
                <div key={tier} className="flex items-center gap-3">
                  <span className="w-[68px] shrink-0 text-xs font-semibold text-gray-600">
                    {cfg.icon} {cfg.label}
                  </span>
                  <div className="flex-1 h-2.5 rounded-full bg-gray-100 overflow-hidden">
                    <div
                      className={`h-full rounded-full ${cfg.bar} transition-all`}
                      style={{ width: count > 0 ? `${Math.max(pct, 2)}%` : "0%" }}
                    />
                  </div>
                  <span className={`w-8 shrink-0 text-right text-xs font-bold ${cfg.text}`}>
                    {count}
                  </span>
                  <span className="w-8 shrink-0 text-right text-[10px] text-gray-400">
                    {pct}%
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ── Quick actions ─────────────────────────────────────────────────── */}
      <div>
        <p className="text-xs font-semibold uppercase tracking-widest text-gray-400 mb-3">
          Ações rápidas
        </p>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={onImportOpen}
            className="flex items-center gap-2 rounded-xl border border-brand-200 bg-brand-50 px-4 py-2.5 text-sm font-semibold text-brand-700 hover:bg-brand-100 transition-colors"
          >
            <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5m-13.5-9L12 3m0 0 4.5 4.5M12 3v13.5" />
            </svg>
            Importar clientes
          </button>

          {stats.inactiveCustomers > 0 && (
            <button
              onClick={onGoToInactive}
              className="flex items-center gap-2 rounded-xl border border-red-100 bg-red-50 px-4 py-2.5 text-sm font-semibold text-red-700 hover:bg-red-100 transition-colors"
            >
              <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0ZM4.501 20.118a7.5 7.5 0 0 1 14.998 0A17.933 17.933 0 0 1 12 21.75c-2.676 0-5.216-.584-7.499-1.632Z" />
              </svg>
              Ver {stats.inactiveCustomers} inativos
            </button>
          )}

          {opportunitiesCount > 0 && (
            <button
              onClick={onGoToOpportunities}
              className="flex items-center gap-2 rounded-xl border border-amber-100 bg-amber-50 px-4 py-2.5 text-sm font-semibold text-amber-700 hover:bg-amber-100 transition-colors"
            >
              <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z" />
              </svg>
              {opportunitiesCount} oportunidade{opportunitiesCount !== 1 ? "s" : ""} identificada{opportunitiesCount !== 1 ? "s" : ""}
            </button>
          )}
        </div>
      </div>

    </div>
  );
}
