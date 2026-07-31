"use client";

import { useState, useEffect } from "react";
import type { OverviewStats, CustomerTier, TopCustomersResult, TopCustomerSegment } from "@/services/crm/CRMService";
import type { CrmAction, CrmActionType, ActionPriority } from "@/services/crm/CrmActionCenterService";
import { ReviewRequestModal } from "./ReviewRequestModal";

// ── Config ────────────────────────────────────────────────────────────────────

const TIER_CONFIG: Record<CustomerTier, { label: string; icon: string; bar: string; text: string }> = {
  DIAMANTE: { label: "Diamante", icon: "💎", bar: "bg-cyan-400",   text: "text-cyan-700"   },
  OURO:     { label: "Ouro",     icon: "🥇", bar: "bg-amber-400",  text: "text-amber-700"  },
  PRATA:    { label: "Prata",    icon: "🥈", bar: "bg-muted",   text: "text-ink2"   },
  BRONZE:   { label: "Bronze",   icon: "🥉", bar: "bg-brand-400", text: "text-brand-600" },
};

// ── Date filter ───────────────────────────────────────────────────────────────

export type DateFilterPreset = "today" | "week7" | "week" | "total" | "month" | "year" | "custom";

// ── Action Center config ──────────────────────────────────────────────────────

const PRIORITY_STYLE: Record<ActionPriority, { dot: string; badge: string; label: string; border: string; bg: string }> = {
  HIGH:   { dot: "bg-red-500",    badge: "bg-red-50 text-red-700",       label: "Alta",  border: "border-red-100",    bg: "bg-red-50/30"     },
  MEDIUM: { dot: "bg-yellow-400", badge: "bg-amber-50 text-amber-700", label: "Média", border: "border-line",   bg: "bg-[#FAFAF8]/50"    },
  LOW:    { dot: "bg-line2",   badge: "bg-[#FAFAF8] text-muted",     label: "Baixa", border: "border-line",   bg: "bg-[#FAFAF8]/30"    },
};

const ACTION_ICON: Record<CrmActionType, string> = {
  RECOVER_COLD_CUSTOMERS:       "🔴",
  RECOVER_LOST_CUSTOMERS:       "👻",
  WARM_CUSTOMERS:               "🟡",
  VIP_APPRECIATION:             "💎",
  REVIEW_REQUEST:                "⭐",
  BIRTHDAY_CAMPAIGN:            "🎂",
  COUPON_OPPORTUNITY:           "🎁",
  NO_ORDER_FIRST_PURCHASE:      "🆕",
  HIGH_VALUE_CUSTOMER_ATTENTION:"🏆",
  CAMPAIGN_PERFORMANCE_ALERT:   "📊",
  SAFETY_ISSUE_ALERT:           "⚠️",
};

const CONFIG_ACTION_TYPES: CrmActionType[] = ["SAFETY_ISSUE_ALERT", "CAMPAIGN_PERFORMANCE_ALERT"];


// ReviewRequestModal imported from ./ReviewRequestModal (extracted for reuse in CustomersTab)

// ── Sub-components ────────────────────────────────────────────────────────────

export function KPICard({
  label,
  value,
  sub,
  accent,
  loading,
  onClick,
  ctaLabel,
  pct,
}: {
  label: string;
  value: string | number;
  sub?: string;
  accent?: "green" | "yellow" | "red" | "blue" | "brand" | "gray" | "purple";
  loading?: boolean;
  onClick?: () => void;
  ctaLabel?: string;
  /** Optional share-of-base percentage, shown as a chip next to the value. */
  pct?: number;
}) {
  const accentClass = {
    green:  "text-green-700",
    yellow: "text-amber-600",
    red:    "text-red-600",
    blue:   "text-blue-700",
    brand:  "text-brand-700",
    gray:   "text-ink2",
    purple: "text-brand-600",
  }[accent ?? "brand"] ?? "text-brand-700";

  return (
    <div
      className={`flex flex-col rounded-2xl border border-line bg-paper p-4 shadow-sm${onClick ? " cursor-pointer hover:border-brand-200 hover:shadow-md transition-all" : ""}`}
      onClick={onClick}
    >
      {loading ? (
        <div className="h-8 w-16 animate-pulse rounded bg-[#F4F4F2]" />
      ) : (
        <div className="flex items-baseline gap-1.5">
          <p className={`text-2xl font-extrabold ${accentClass}`}>{value}</p>
          {pct !== undefined && (
            <span className="text-xs font-semibold text-muted">{pct}%</span>
          )}
        </div>
      )}
      <p className="mt-0.5 text-xs font-semibold text-ink2">{label}</p>
      {sub && <p className="mt-1 text-[10px] text-muted">{sub}</p>}
      {ctaLabel && onClick && (
        <p className="mt-auto pt-2 text-[10px] font-semibold text-brand-600">{ctaLabel} →</p>
      )}
    </div>
  );
}

// ── Revenue chart (proven CRM conversions over time) ──────────────────────────

function RevenueChart({
  series,
  granularity,
  type = "bar",
}: {
  series: Array<{ key: string; label: string; revenue: number; orders: number }>;
  granularity?: "hour" | "day" | "month";
  type?: "bar" | "line";
}) {
  const max = Math.max(0, ...series.map((b) => b.revenue));
  const labelEvery = series.length > 16 ? Math.ceil(series.length / 12) : 1;
  const fmt = (v: number) =>
    v.toLocaleString("pt-BR", { minimumFractionDigits: 0, maximumFractionDigits: 0 });
  const allZero = max === 0;

  if (type === "line") {
    // SVG polyline — simple, no deps.
    const W = 600;
    const H = 96;
    const pad = 4;
    const pts = series.map((b, i) => {
      const x = series.length > 1
        ? pad + (i / (series.length - 1)) * (W - pad * 2)
        : W / 2;
      const y = allZero ? H - pad : H - pad - ((b.revenue / max) * (H - pad * 2));
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    });
    return (
      <div>
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-24" preserveAspectRatio="none">
          {!allZero && (
            <polyline
              points={pts.join(" ")}
              fill="none"
              stroke="#22c55e"
              strokeWidth="2"
              strokeLinejoin="round"
              strokeLinecap="round"
            />
          )}
          {allZero && (
            <line x1={pad} y1={H - pad} x2={W - pad} y2={H - pad} stroke="#e5e7eb" strokeWidth="1.5" />
          )}
        </svg>
        <div className="mt-1 flex items-center justify-between text-[9px] text-muted">
          <span>R$ 0</span>
          <span className="capitalize">
            {granularity === "hour" ? "por hora" : granularity === "month" ? "por mês" : "por dia"}
          </span>
          <span>{allZero ? "R$ 0" : `R$ ${fmt(max)}`}</span>
        </div>
        {allZero && (
          <p className="mt-1 text-center text-[10px] text-muted">
            Nenhuma conversão comprovada no período
          </p>
        )}
      </div>
    );
  }

  return (
    <div>
      {/* Bars are DIRECT children of a fixed-height (h-24) row, so the per-bar
          percentage height resolves reliably. Labels live in a separate row. */}
      <div className="flex h-24 items-end gap-[2px]">
        {series.map((b) => {
          const h = max > 0 ? Math.round((b.revenue / max) * 100) : 0;
          return (
            <div
              key={b.key}
              className={`flex-1 rounded-t transition-all ${b.revenue > 0 ? "bg-green-500" : "bg-[#F4F4F2]"}`}
              style={{ minWidth: 3, height: `${b.revenue > 0 ? Math.max(h, 4) : 3}%` }}
              title={`${b.label}: R$ ${b.revenue.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} · ${b.orders} pedido${b.orders !== 1 ? "s" : ""}`}
            />
          );
        })}
      </div>
      <div className="mt-0.5 flex gap-[2px]">
        {series.map((b, i) => (
          <span key={b.key} className="flex-1 truncate text-center text-[7px] leading-none text-muted" style={{ minWidth: 3 }}>
            {i % labelEvery === 0 ? b.label : ""}
          </span>
        ))}
      </div>
      <div className="mt-1 flex items-center justify-between text-[9px] text-muted">
        <span>R$ 0</span>
        <span className="capitalize">
          {granularity === "hour" ? "por hora" : granularity === "month" ? "por mês" : "por dia"}
        </span>
        <span>{allZero ? "R$ 0" : `R$ ${fmt(max)}`}</span>
      </div>
      {allZero && (
        <p className="mt-1 text-center text-[10px] text-muted">
          Nenhuma conversão comprovada no período
        </p>
      )}
    </div>
  );
}

// ── Revenue block (chart protagonist + summary cards) ────────────────────────

export function RevenueBlock({
  revenueSummary,
  revenueSummaryLoading,
}: {
  revenueSummary: {
    totalRevenue: number;
    totalSent: number;
    totalResponded: number;
    totalConverted: number;
    campaignCount: number;
    couponRevenue?: number;
    couponOrders?: number;
    couponCodesTracked?: number;
    series?: Array<{ key: string; label: string; revenue: number; orders: number }>;
    seriesRevenue?: number;
    seriesOrders?: number;
    granularity?: "hour" | "day" | "month";
    topCampaigns?: Array<{ id: string; name: string; revenue: number; converted: number; sent: number }>;
  } | null;
  revenueSummaryLoading: boolean;
}) {
  const [chartType, setChartType] = useState<"bar" | "line">("bar");

  const series = revenueSummary?.series ?? [];
  const seriesRevenue = revenueSummary?.seriesRevenue ?? 0;
  const hasChartData = series.length > 0;

  return (
    <div className="rounded-2xl border border-line bg-paper p-5 shadow-sm">
      <div className="mb-3 flex items-center justify-between">
        <p className="text-xs font-semibold uppercase tracking-widest text-muted">
          Receita gerada pelo CRM
        </p>
        <div className="flex items-center gap-2">
          {hasChartData && (
            <div className="flex rounded-lg border border-line overflow-hidden">
              <button
                onClick={() => setChartType("bar")}
                className={`px-2.5 py-1 text-[10px] font-semibold transition-colors ${chartType === "bar" ? "bg-ink text-white" : "text-muted hover:bg-[#FAFAF8]"}`}
              >
                Barras
              </button>
              <button
                onClick={() => setChartType("line")}
                className={`px-2.5 py-1 text-[10px] font-semibold transition-colors ${chartType === "line" ? "bg-ink text-white" : "text-muted hover:bg-[#FAFAF8]"}`}
              >
                Linha
              </button>
            </div>
          )}
          {revenueSummaryLoading && (
            <span className="text-[10px] text-muted">Carregando…</span>
          )}
        </div>
      </div>

      {revenueSummaryLoading && !revenueSummary ? (
        <div className="space-y-3">
          <div className="h-28 animate-pulse rounded-xl bg-[#F4F4F2]" />
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[1, 2, 3, 4].map((i) => <div key={i} className="h-16 animate-pulse rounded-xl bg-[#F4F4F2]" />)}
          </div>
        </div>
      ) : !revenueSummary ? (
        <p className="text-sm text-muted">Ainda não há receita atribuída ao CRM neste período.</p>
      ) : (
        <div className="space-y-4">
          {/* Chart — always shown when series data exists */}
          {hasChartData ? (
            <div>
              <div className="mb-2 flex items-baseline justify-between">
                <p className="text-[11px] font-semibold text-muted">
                  {seriesRevenue > 0 ? "Receita comprovada por conversão" : "Conversões comprovadas no período"}
                </p>
                {seriesRevenue > 0 && (
                  <p className="text-sm font-extrabold text-green-700">
                    R$ {seriesRevenue.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </p>
                )}
              </div>
              <RevenueChart series={series} granularity={revenueSummary.granularity} type={chartType} />
            </div>
          ) : (
            <div className="flex h-24 items-center justify-center rounded-xl bg-[#FAFAF8]">
              <p className="text-[11px] text-muted">
                Gráfico disponível após as primeiras conversões comprovadas
              </p>
            </div>
          )}

          {/* Summary cards */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div className="rounded-xl bg-green-50 p-3">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-green-600 mb-1">Receita atribuída</p>
              <p className="text-lg font-extrabold text-green-700">
                R$ {revenueSummary.totalRevenue.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </p>
              <p className="text-[10px] text-green-400 mt-0.5">Campanhas + automações</p>
            </div>
            <div className="rounded-xl bg-blue-50 p-3">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-blue-600 mb-1">Mensagens enviadas</p>
              <p className="text-lg font-extrabold text-blue-700">{revenueSummary.totalSent.toLocaleString("pt-BR")}</p>
              <p className="text-[10px] text-blue-400 mt-0.5">{revenueSummary.campaignCount} campanha{revenueSummary.campaignCount !== 1 ? "s" : ""}</p>
            </div>
            <div className="rounded-xl bg-brand-50 p-3">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-brand-500 mb-1">Converteram</p>
              <p className="text-lg font-extrabold text-brand-600">{revenueSummary.totalConverted.toLocaleString("pt-BR")}</p>
              <p className="text-[10px] text-brand-400 mt-0.5">
                {revenueSummary.totalSent > 0
                  ? `${Math.round((revenueSummary.totalConverted / revenueSummary.totalSent) * 100)}% dos enviados`
                  : "sem envios no período"}
              </p>
            </div>
            <div className="rounded-xl bg-brand-50 p-3">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-brand-600 mb-1">Cupons usados</p>
              <p className="text-lg font-extrabold text-brand-600">{(revenueSummary.couponOrders ?? 0).toLocaleString("pt-BR")}</p>
              <p className="text-[10px] text-brand-500 mt-0.5">
                {(revenueSummary.couponRevenue ?? 0) > 0
                  ? `R$ ${(revenueSummary.couponRevenue ?? 0).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                  : (revenueSummary.couponCodesTracked ?? 0) > 0 ? "Nenhum resgatado" : "Sem cupom vinculado"}
              </p>
            </div>
          </div>
        </div>
      )}
      <p className="mt-3 text-[10px] text-muted">
        * Receita estimada com base em campanhas e cupons vinculados. O gráfico usa conversões comprovadas (pedido após o envio).
      </p>
    </div>
  );
}

// ── Top customers (most valuable) ─────────────────────────────────────────────

const TOP_SEGMENT_BADGE: Record<TopCustomerSegment, { label: string; cls: string }> = {
  QUENTE:      { label: "Quente",   cls: "bg-green-50 text-green-700"  },
  MORNO:       { label: "Morno",    cls: "bg-amber-50 text-amber-700" },
  FRIO:        { label: "Frio",     cls: "bg-red-50 text-red-600"      },
  PERDIDO:     { label: "Perdido",  cls: "bg-[#F4F4F2] text-muted"   },
  SEM_PEDIDOS: { label: "Sem pedidos", cls: "bg-[#F4F4F2] text-muted" },
};

// Literal tier badge classes (Tailwind scans these at build — no dynamic strings).
const TOP_TIER_BADGE: Record<CustomerTier, string> = {
  DIAMANTE: "bg-cyan-100 text-cyan-700",
  OURO:     "bg-amber-100 text-amber-700",
  PRATA:    "bg-line2 text-ink2",
  BRONZE:   "bg-brand-100 text-brand-600",
};

function topRelativeDate(iso: string | null): string {
  if (!iso) return "sem pedidos";
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  if (days <= 0)  return "último pedido hoje";
  if (days === 1) return "último pedido ontem";
  if (days < 30)  return `último pedido há ${days} dias`;
  if (days < 365) return `último pedido há ${Math.floor(days / 30)} ${Math.floor(days / 30) === 1 ? "mês" : "meses"}`;
  return `último pedido há ${Math.floor(days / 365)} ${Math.floor(days / 365) === 1 ? "ano" : "anos"}`;
}

function TopCustomersBlock({
  data,
  loading,
}: {
  data: TopCustomersResult | null;
  loading: boolean;
}) {
  const customers = data?.customers ?? [];

  return (
    <div className="rounded-2xl border border-line bg-paper p-5 shadow-sm">
      <div className="mb-3">
        <p className="text-xs font-semibold uppercase tracking-widest text-muted">
          Clientes mais valiosos
        </p>
        <p className="mt-0.5 text-[11px] text-muted">Quem mais gastou com o restaurante</p>
      </div>

      {loading && !data ? (
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {[1, 2, 3, 4].map((i) => <div key={i} className="h-14 animate-pulse rounded-xl bg-[#F4F4F2]" />)}
        </div>
      ) : customers.length === 0 ? (
        <p className="text-sm text-muted">
          Sem dados suficientes para listar clientes valiosos neste período.
        </p>
      ) : (
        <>
          {data?.fallbackUsed && (
            <p className="mb-3 rounded-lg bg-[#FAFAF8] px-3 py-2 text-[11px] text-muted">
              Mostrando os clientes que mais gastaram nos últimos 12 meses.
            </p>
          )}
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {customers.map((c, i) => {
              const tier = TIER_CONFIG[c.tier];
              const seg  = TOP_SEGMENT_BADGE[c.segment];
              return (
                <div
                  key={c.customerId}
                  className="flex items-center gap-3 rounded-xl border border-line px-3 py-2.5"
                >
                  <span className="w-5 shrink-0 text-center text-sm font-bold text-muted">{i + 1}</span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <a
                        href={`/customers/${c.customerId}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="truncate text-sm font-semibold text-ink hover:text-brand-600 hover:underline"
                        title={c.name}
                      >
                        {c.name}
                      </a>
                    </div>
                    <p className="mt-0.5 text-[11px] text-muted">
                      <span className="font-semibold text-green-700">
                        R$ {c.totalSpent.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </span>
                      {" · "}{c.orderCount} pedido{c.orderCount !== 1 ? "s" : ""}
                      {" · "}{topRelativeDate(c.lastOrderAt)}
                    </p>
                    <div className="mt-1 flex flex-wrap items-center gap-1">
                      <span className={`rounded-full px-1.5 py-0.5 text-[9px] font-bold ${TOP_TIER_BADGE[c.tier]}`}>
                        {tier.icon} {tier.label}
                      </span>
                      <span className={`rounded-full px-1.5 py-0.5 text-[9px] font-semibold ${seg.cls}`}>
                        {seg.label}
                      </span>
                    </div>
                  </div>
                  <a
                    href={`/customers/${c.customerId}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="shrink-0 text-[11px] font-semibold text-brand-600 hover:text-brand-700"
                  >
                    Ver ficha →
                  </a>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────

export function OverviewTab({
  stats,
  opportunitiesCount,
  actions = [],
  onNavigateToTab,
  onSegmentClick,
  loading,
  datePreset,
  customFrom,
  customTo,
  onDateChange,
  revenueSummary,
  revenueSummaryLoading,
  topCustomers,
  topCustomersLoading,
}: {
  stats: OverviewStats;
  opportunitiesCount: number;
  actions?: CrmAction[];
  onNavigateToTab?: (tab: "campanhas" | "customers") => void;
  onSegmentClick?: (filter: "quente" | "morno" | "frio" | "novos" | "nao-compraram") => void;
  loading: boolean;
  datePreset: DateFilterPreset;
  customFrom: string;
  customTo: string;
  onDateChange: (preset: DateFilterPreset, customFrom?: string, customTo?: string) => void;
  revenueSummary?: {
    totalRevenue: number;
    totalSent: number;
    totalResponded: number;
    totalConverted: number;
    campaignCount: number;
    couponRevenue?: number;
    couponOrders?: number;
    couponCodesTracked?: number;
    series?: Array<{ key: string; label: string; revenue: number; orders: number }>;
    seriesRevenue?: number;
    seriesOrders?: number;
    granularity?: "hour" | "day" | "month";
    topCampaigns?: Array<{ id: string; name: string; revenue: number; converted: number; sent: number }>;
  } | null;
  revenueSummaryLoading?: boolean;
  topCustomers?: TopCustomersResult | null;
  topCustomersLoading?: boolean;
}) {
  const [localFrom, setLocalFrom] = useState(customFrom);
  const [localTo,   setLocalTo]   = useState(customTo);

  // Real segment thresholds so the KPI captions match the owner's configuration
  // (Configurações → Segmentação), not fixed 30/60/120.
  const [seg, setSeg] = useState({ hotMaxDays: 30, warmMaxDays: 60, lostMinDays: 120 });
  useEffect(() => {
    fetch("/api/settings/crm-segments")
      .then((r) => r.json())
      .then((j) => {
        const d = j?.data;
        if (d && typeof d.hotMaxDays === "number") {
          setSeg({ hotMaxDays: d.hotMaxDays, warmMaxDays: d.warmMaxDays, lostMinDays: d.lostMinDays });
        }
      })
      .catch(() => {});
  }, []);
  const HOT_DAYS  = seg.hotMaxDays;
  const WARM_DAYS = seg.warmMaxDays;
  const LOST_DAYS = seg.lostMinDays;

  // Temperature bar calculations
  const tempTotal = stats.ativoCustomers + stats.mornoCustomers + stats.frioCustomers;
  const ativoPct  = tempTotal > 0 ? Math.round((stats.ativoCustomers / tempTotal) * 100) : 0;
  const mornoPct  = tempTotal > 0 ? Math.round((stats.mornoCustomers / tempTotal) * 100) : 0;
  const frioPct   = tempTotal > 0 ? Math.round((stats.frioCustomers  / tempTotal) * 100) : 0;

  const perdidosCustomers = stats.perdidosCustomers ?? 0;
  const perdidoPct = tempTotal > 0 ? Math.round((perdidosCustomers / tempTotal) * 100) : 0;

  const totalSegmented = stats.segments.reduce((s, x) => s + x.count, 0);

  const DATE_PRESETS: { id: DateFilterPreset; label: string }[] = [
    { id: "today",  label: "Hoje"           },
    { id: "week7",  label: "Últimos 7 dias" },
    { id: "week",   label: "Esta semana"    },
    { id: "month",  label: "Este mês"       },
    { id: "year",   label: "Este ano"       },
    { id: "custom", label: "Personalizado"  },
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
    datePreset === "today"  ? "Novos hoje"           :
    datePreset === "week7"  ? "Novos (7 dias)"        :
    datePreset === "week"   ? "Novos esta semana"     :
    datePreset === "month"  ? "Novos este mês"        :
    datePreset === "year"   ? "Novos este ano"        :
    datePreset === "custom" ? "Novos no período"      :
                              "Novos clientes";
  const newCustomersSub =
    datePreset === "total" ? "Total de cadastros" : "Cadastrados no período selecionado";

  return (
    <div className="space-y-6">

      {/* 1. Números de clientes — primeira camada (não dependem do período) */}
      {/* 7 cards on one row from lg up (all client categories aligned, no wrap). */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7">
        <KPICard
          label="Clientes na base"
          value={stats.totalCustomers.toLocaleString("pt-BR")}
          sub="Inclui Foocci + importados"
          accent="brand"
          loading={loading}
        />
        <KPICard
          label="Quentes"
          value={stats.ativoCustomers.toLocaleString("pt-BR")}
          pct={ativoPct}
          sub={`Compraram nos últ. ${HOT_DAYS} dias`}
          accent="green"
          loading={loading}
          onClick={onSegmentClick ? () => onSegmentClick("quente") : undefined}
          ctaLabel={onSegmentClick ? "Ver quentes" : undefined}
        />
        <KPICard
          label="Mornos"
          value={stats.mornoCustomers.toLocaleString("pt-BR")}
          pct={mornoPct}
          sub={`${HOT_DAYS + 1}–${WARM_DAYS} dias sem comprar`}
          accent="yellow"
          loading={loading}
          onClick={onSegmentClick ? () => onSegmentClick("morno") : undefined}
          ctaLabel={onSegmentClick ? "Ver mornos" : undefined}
        />
        <KPICard
          label="Frios"
          value={stats.frioCustomers.toLocaleString("pt-BR")}
          pct={frioPct}
          sub={`Mais de ${WARM_DAYS} dias sem comprar`}
          accent="red"
          loading={loading}
          onClick={onSegmentClick ? () => onSegmentClick("frio") : undefined}
          ctaLabel={onSegmentClick ? "Ver frios" : undefined}
        />
        <KPICard
          label="Perdidos"
          value={perdidosCustomers.toLocaleString("pt-BR")}
          pct={perdidoPct}
          sub={`Mais de ${LOST_DAYS} dias sem comprar`}
          accent="gray"
          loading={loading}
          onClick={onSegmentClick ? () => onSegmentClick("frio") : undefined}
          ctaLabel={onSegmentClick ? "Ver frios" : undefined}
        />
        <KPICard
          label={newCustomersLabel}
          value={stats.newCustomers.toLocaleString("pt-BR")}
          sub={newCustomersSub}
          accent="blue"
          loading={loading}
          onClick={onSegmentClick ? () => onSegmentClick("novos") : undefined}
          ctaLabel={onSegmentClick ? "Ver novos" : undefined}
        />
        <KPICard
          label="Não compraram"
          value={(stats.naoCompraramCustomers ?? 0).toLocaleString("pt-BR")}
          sub="Cadastraram mas nunca pediram"
          accent="purple"
          loading={loading}
          onClick={onSegmentClick ? () => onSegmentClick("nao-compraram") : undefined}
          ctaLabel={onSegmentClick ? "Ver e criar campanha" : undefined}
        />
      </div>

      {/* 2. Filtro de período — abaixo dos números de clientes (não afeta frios/mornos/quentes) */}
      <div className="space-y-2">
        <div className="flex flex-wrap gap-1.5">
          {DATE_PRESETS.map((p) => (
            <button
              key={p.id}
              onClick={() => handlePreset(p.id)}
              className={`rounded-full px-3.5 py-1.5 text-xs font-semibold transition-all ${
                datePreset === p.id
                  ? "bg-brand-600 text-white shadow-sm"
                  : "bg-[#F4F4F2] text-ink2 hover:bg-line2"
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
              className="rounded-lg border border-line2 px-2.5 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-brand-400"
            />
            <span className="text-xs text-muted">até</span>
            <input
              type="date"
              value={localTo}
              onChange={(e) => setLocalTo(e.target.value)}
              className="rounded-lg border border-line2 px-2.5 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-brand-400"
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

      {/* 3. Receita gerada pelo CRM (gráfico) */}
      <RevenueBlock
        revenueSummary={revenueSummary ?? null}
        revenueSummaryLoading={!!revenueSummaryLoading}
      />

      {/* 4. Campanhas mais rentáveis (top 5) — quadradinhos, por período */}
      <div className="rounded-2xl border border-line bg-paper p-5 shadow-sm">
        <div className="mb-4 flex items-baseline justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-muted">
              Campanhas mais rentáveis
            </p>
            <p className="mt-0.5 text-[11px] text-muted">Top 5 por receita no período selecionado.</p>
          </div>
          {onNavigateToTab && (
            <button
              onClick={() => onNavigateToTab("campanhas")}
              className="shrink-0 text-xs font-semibold text-brand-600 hover:text-brand-700 transition-colors"
            >
              Ver todas →
            </button>
          )}
        </div>
        {revenueSummaryLoading ? (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="h-[104px] animate-pulse rounded-xl border border-line bg-[#FAFAF8]" />
            ))}
          </div>
        ) : (revenueSummary?.topCampaigns?.length ?? 0) === 0 ? (
          <p className="text-sm text-muted">Nenhuma campanha gerou receita comprovada neste período.</p>
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            {revenueSummary!.topCampaigns!.map((c, i) => (
              <div key={c.id} className="rounded-xl border border-line bg-[#FAFAF8] px-3 py-3">
                <div className="flex items-center justify-between">
                  <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-brand-100 text-[11px] font-bold text-brand-700">
                    {i + 1}º
                  </span>
                  {c.converted > 0 && (
                    <span className="text-[10px] font-semibold text-muted">{c.converted} pedido{c.converted !== 1 ? "s" : ""}</span>
                  )}
                </div>
                <p className="mt-2 truncate text-xs font-semibold text-ink" title={c.name}>{c.name}</p>
                <p className="mt-1 text-lg font-bold leading-none text-emerald-600">
                  R$ {c.revenue.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </p>
                <p className="mt-1 text-[10px] text-muted">{c.sent.toLocaleString("pt-BR")} enviada{c.sent !== 1 ? "s" : ""}</p>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 5. Clientes mais valiosos (replaces redundant temperature strip) */}
      <TopCustomersBlock data={topCustomers ?? null} loading={!!topCustomersLoading} />

      {/* 5. Programa de relacionamento */}
      <div className="rounded-2xl border border-line bg-paper p-5 shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-widest text-muted mb-4">
          Programa de relacionamento
        </p>
        {totalSegmented === 0 ? (
          <p className="text-sm text-muted">Nenhum cliente ainda.</p>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {stats.segments.map(({ tier, count }) => {
                const cfg = TIER_CONFIG[tier];
                const pct = totalSegmented > 0 ? Math.round((count / totalSegmented) * 100) : 0;
                return (
                  <div key={tier} className="rounded-xl border border-line bg-[#FAFAF8] px-3 py-3">
                    <div className="flex items-center gap-1.5 text-xs font-semibold text-ink2">
                      <span>{cfg.icon}</span>
                      <span>{cfg.label}</span>
                    </div>
                    <p className={`mt-1.5 text-2xl font-bold leading-none ${cfg.text}`}>
                      {count.toLocaleString("pt-BR")}
                    </p>
                    <p className="mt-1 text-[11px] text-muted">{pct}% da base</p>
                  </div>
                );
              })}
            </div>
            {stats.segments.find((s) => s.tier === "BRONZE")?.count === totalSegmented && totalSegmented > 0 && (
              <p className="mt-3 text-[11px] text-amber-700 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2">
                💡 Quase toda a base ainda está no Bronze. Há oportunidade de desenvolver clientes recorrentes.
              </p>
            )}
          </>
        )}
      </div>

      {/* "Oportunidades de receita" e "Configurações pendentes" foram removidas da
          Visão Geral: as campanhas fixas (recuperar perdidos/frios/mornos, VIP,
          aniversário, etc.) já rodam sozinhas e perpetuamente, então sugerir
          "criar campanha" para o que já é automático não faz mais sentido. */}

    </div>
  );
}
