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

function getPresetRange(preset: DateFilterPreset): { from: Date; to: Date } | undefined {
  const now = new Date();
  if (preset === "month") {
    return { from: new Date(now.getFullYear(), now.getMonth(), 1), to: now };
  }
  if (preset === "year") {
    return { from: new Date(now.getFullYear(), 0, 1), to: now };
  }
  return undefined;
}

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
  accent?: "green" | "red" | "blue" | "brand";
  loading?: boolean;
}) {
  const accentClass = {
    green: "text-green-700",
    red:   "text-red-600",
    blue:  "text-blue-700",
    brand: "text-brand-700",
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

  const activeRate = stats.totalCustomers > 0
    ? Math.round((stats.activeCustomers / stats.totalCustomers) * 100)
    : 0;

  const totalSegmented = stats.segments.reduce((s, x) => s + x.count, 0);
  const totalOrderTypes = stats.deliveryOrders + stats.dineInOrders;
  const deliveryPct = totalOrderTypes > 0 ? Math.round((stats.deliveryOrders / totalOrderTypes) * 100) : 0;
  const dineInPct   = totalOrderTypes > 0 ? Math.round((stats.dineInOrders  / totalOrderTypes) * 100) : 0;

  const DATE_PRESETS: { id: DateFilterPreset; label: string }[] = [
    { id: "total", label: "Total"      },
    { id: "month", label: "Este mês"   },
    { id: "year",  label: "Este ano"   },
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
    if (localFrom && localTo) {
      onDateChange("custom", localFrom, localTo);
    }
  }

  const newCustomersLabel =
    datePreset === "month"  ? "Novos clientes (mês)"  :
    datePreset === "year"   ? "Novos clientes (ano)"   :
    datePreset === "custom" ? "Novos clientes (período)" :
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

      {/* ── KPI grid ─────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <KPICard
          label="Total de clientes"
          value={stats.totalCustomers}
          accent="brand"
          loading={loading}
        />
        <KPICard
          label="Clientes ativos"
          value={stats.activeCustomers}
          sub="Pedido nos últimos 30 dias"
          accent="green"
          loading={loading}
        />
        <KPICard
          label="Clientes inativos"
          value={stats.inactiveCustomers}
          sub="Sem pedido há 30+ dias"
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

      {/* ── Engajamento ──────────────────────────────────────────────────── */}
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

      {/* ── Delivery / Presencial ─────────────────────────────────────────── */}
      <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-widest text-gray-400 mb-3">
          Canal de pedidos
        </p>
        {totalOrderTypes === 0 ? (
          <p className="text-sm text-gray-400">Nenhum pedido registrado ainda.</p>
        ) : (
          <>
            <div className="flex h-3 w-full overflow-hidden rounded-full bg-gray-100 mb-3">
              <div
                className="bg-blue-500 transition-all"
                style={{ width: `${deliveryPct}%` }}
              />
              <div
                className="bg-amber-400 transition-all"
                style={{ width: `${dineInPct}%` }}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-xl bg-blue-50 p-3">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-blue-500 mb-1">
                  🛵 Delivery
                </p>
                <p className="text-xl font-extrabold text-blue-700">{stats.deliveryOrders.toLocaleString("pt-BR")}</p>
                <p className="text-[10px] text-blue-400">{deliveryPct}% dos pedidos</p>
              </div>
              <div className="rounded-xl bg-amber-50 p-3">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-amber-600 mb-1">
                  🍽️ Presencial
                </p>
                <p className="text-xl font-extrabold text-amber-700">{stats.dineInOrders.toLocaleString("pt-BR")}</p>
                <p className="text-[10px] text-amber-500">{dineInPct}% dos pedidos</p>
              </div>
            </div>
          </>
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
