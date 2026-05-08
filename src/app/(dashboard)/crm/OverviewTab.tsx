"use client";

import { useState } from "react";
import type { OverviewStats, CustomerTier } from "@/services/crm/CRMService";

// ── Config ────────────────────────────────────────────────────────────────────

const TIER_CONFIG: Record<CustomerTier, { label: string; icon: string; bar: string; text: string }> = {
  DIAMANTE: { label: "Diamante", icon: "💎", bar: "bg-cyan-400",   text: "text-cyan-700"   },
  OURO:     { label: "Ouro",     icon: "🥇", bar: "bg-amber-400",  text: "text-amber-700"  },
  PRATA:    { label: "Prata",    icon: "🥈", bar: "bg-gray-400",   text: "text-gray-600"   },
  BRONZE:   { label: "Bronze",   icon: "🥉", bar: "bg-orange-400", text: "text-orange-700" },
};

// ── Date filter ───────────────────────────────────────────────────────────────

export type DateFilterPreset = "total" | "month" | "year" | "custom";

// ── Sub-components ────────────────────────────────────────────────────────────

function KPICard({
  label,
  value,
  sub,
  accent,
  loading,
}: {
  label: string;
  value: string | number;
  sub?: string;
  accent?: "green" | "yellow" | "red" | "blue" | "brand";
  loading?: boolean;
}) {
  const accentClass = {
    green:  "text-green-700",
    yellow: "text-yellow-600",
    red:    "text-red-600",
    blue:   "text-blue-700",
    brand:  "text-brand-700",
  }[accent ?? "brand"] ?? "text-brand-700";

  return (
    <div className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
      {loading ? (
        <div className="h-8 w-16 animate-pulse rounded bg-gray-100" />
      ) : (
        <p className={`text-2xl font-extrabold ${accentClass}`}>{value}</p>
      )}
      <p className="mt-0.5 text-xs font-semibold text-gray-600">{label}</p>
      {sub && <p className="mt-1 text-[10px] text-gray-400">{sub}</p>}
    </div>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────

export function OverviewTab({
  stats,
  opportunitiesCount,
  loading,
  datePreset,
  customFrom,
  customTo,
  onDateChange,
}: {
  stats: OverviewStats;
  opportunitiesCount: number;
  loading: boolean;
  datePreset: DateFilterPreset;
  customFrom: string;
  customTo: string;
  onDateChange: (preset: DateFilterPreset, customFrom?: string, customTo?: string) => void;
}) {
  const [localFrom, setLocalFrom] = useState(customFrom);
  const [localTo,   setLocalTo]   = useState(customTo);

  // Temperature bar calculations
  const tempTotal = stats.ativoCustomers + stats.mornoCustomers + stats.frioCustomers;
  const ativoPct  = tempTotal > 0 ? Math.round((stats.ativoCustomers / tempTotal) * 100) : 0;
  const mornoPct  = tempTotal > 0 ? Math.round((stats.mornoCustomers / tempTotal) * 100) : 0;
  const frioPct   = tempTotal > 0 ? Math.round((stats.frioCustomers  / tempTotal) * 100) : 0;

  // Channel calculations
  const totalChannelCustomers = stats.deliveryOnlyCustomers + stats.dineInOnlyCustomers + stats.bothChannelsCustomers;

  const totalSegmented = stats.segments.reduce((s, x) => s + x.count, 0);

  const DATE_PRESETS: { id: DateFilterPreset; label: string }[] = [
    { id: "total",  label: "Total"         },
    { id: "month",  label: "Este mês"      },
    { id: "year",   label: "Este ano"      },
    { id: "custom", label: "Personalizado" },
  ];

  function handlePreset(preset: DateFilterPreset) {
    if (preset !== "custom") {
      onDateChange(preset);
    } else {
      onDateChange("custom", localFrom, localTo);
    }
  }

  function applyCustom() {
    if (localFrom && localTo) onDateChange("custom", localFrom, localTo);
  }

  const newCustomersLabel =
    datePreset === "month"  ? "Novos (mês)"     :
    datePreset === "year"   ? "Novos (ano)"      :
    datePreset === "custom" ? "Novos (período)"  :
                              "Novos clientes";

  return (
    <div className="space-y-6">

      {/* ── Date filter ──────────────────────────────────────────────────── */}
      <div className="space-y-2">
        <div className="flex flex-wrap gap-1.5">
          {DATE_PRESETS.map((p) => (
            <button
              key={p.id}
              onClick={() => handlePreset(p.id)}
              className={`rounded-full px-3.5 py-1.5 text-xs font-semibold transition-all ${
                datePreset === p.id
                  ? "bg-brand-600 text-white shadow-sm"
                  : "bg-gray-100 text-gray-600 hover:bg-gray-200"
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>

        {datePreset === "custom" && (
          <div className="flex flex-wrap items-center gap-2">
            <input
              type="date"
              value={localFrom}
              onChange={(e) => setLocalFrom(e.target.value)}
              className="rounded-lg border border-gray-300 px-2.5 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-brand-400"
            />
            <span className="text-xs text-gray-400">até</span>
            <input
              type="date"
              value={localTo}
              onChange={(e) => setLocalTo(e.target.value)}
              className="rounded-lg border border-gray-300 px-2.5 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-brand-400"
            />
            <button
              onClick={applyCustom}
              disabled={!localFrom || !localTo}
              className="rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-700 disabled:opacity-50"
            >
              Aplicar
            </button>
          </div>
        )}
      </div>

      {/* ── KPI grid (5 cards) ───────────────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        <KPICard
          label="Total"
          value={stats.totalCustomers}
          accent="brand"
          loading={loading}
        />
        <KPICard
          label="Ativos"
          value={stats.ativoCustomers}
          sub="≤ 30 dias"
          accent="green"
          loading={loading}
        />
        <KPICard
          label="Mornos"
          value={stats.mornoCustomers}
          sub="31–60 dias"
          accent="yellow"
          loading={loading}
        />
        <KPICard
          label="Frios"
          value={stats.frioCustomers}
          sub="> 60 dias"
          accent="red"
          loading={loading}
        />
        <KPICard
          label={newCustomersLabel}
          value={stats.newCustomers}
          accent="blue"
          loading={loading}
        />
      </div>

      {/* ── Temperatura da base ──────────────────────────────────────────── */}
      <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-widest text-gray-400 mb-3">
          Temperatura da base
        </p>
        {tempTotal === 0 ? (
          <p className="text-sm text-gray-400">Nenhum cliente com pedidos ainda.</p>
        ) : (
          <>
            <div className="flex h-3 w-full overflow-hidden rounded-full bg-gray-100">
              <div className="bg-green-500 transition-all"  style={{ width: `${ativoPct}%` }} />
              <div className="bg-yellow-400 transition-all" style={{ width: `${mornoPct}%` }} />
              <div className="bg-red-400 transition-all"    style={{ width: `${frioPct}%`  }} />
            </div>
            <div className="mt-2.5 flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-600">
              <span className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-green-500" />
                🔥 Quente: {ativoPct}% ({stats.ativoCustomers})
              </span>
              <span className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-yellow-400" />
                🟡 Morno: {mornoPct}% ({stats.mornoCustomers})
              </span>
              <span className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-red-400" />
                🔴 Frio: {frioPct}% ({stats.frioCustomers})
              </span>
            </div>
          </>
        )}
      </div>

      {/* ── Canal de pedidos (por clientes únicos) ────────────────────────── */}
      <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-widest text-gray-400 mb-3">
          Canal de pedidos
        </p>
        <p className="text-[10px] text-gray-400 mb-3">Clientes únicos por canal preferido</p>
        {totalChannelCustomers === 0 ? (
          <p className="text-sm text-gray-400">Nenhum pedido registrado ainda.</p>
        ) : (
          <div className="grid grid-cols-3 gap-3">
            <div className="rounded-xl bg-blue-50 p-3">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-blue-500 mb-1">🛵 Só Delivery</p>
              <p className="text-xl font-extrabold text-blue-700">{stats.deliveryOnlyCustomers.toLocaleString("pt-BR")}</p>
              <p className="text-[10px] text-blue-400">clientes</p>
            </div>
            <div className="rounded-xl bg-amber-50 p-3">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-amber-600 mb-1">🍽️ Só Presencial</p>
              <p className="text-xl font-extrabold text-amber-700">{stats.dineInOnlyCustomers.toLocaleString("pt-BR")}</p>
              <p className="text-[10px] text-amber-500">clientes</p>
            </div>
            <div className="rounded-xl bg-purple-50 p-3">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-purple-600 mb-1">🔀 Ambos</p>
              <p className="text-xl font-extrabold text-purple-700">{stats.bothChannelsCustomers.toLocaleString("pt-BR")}</p>
              <p className="text-[10px] text-purple-400">clientes</p>
            </div>
          </div>
        )}
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

    </div>
  );
}
