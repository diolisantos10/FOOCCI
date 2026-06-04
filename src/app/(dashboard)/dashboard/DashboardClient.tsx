"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import type { CockpitReport, CockpitAlert, CockpitAction, HealthStatus } from "@/services/dashboard/DashboardCockpitService";

// ── Types ──────────────────────────────────────────────────────────────────────

type PeriodKey = "today" | "yesterday" | "this_week" | "7d" | "current_month" | "30d" | "custom";

interface TopProduct {
  name:         string;
  quantity:     number;
  revenue:      number;
  imageUrl:     string | null;
  categoryName: string | null;
}

interface Campaign {
  id:             string;
  name:           string;
  status:         string;
  totalSent:      number;
  totalResponded: number;
  totalAudience:  number;
}

interface DashboardData {
  // Period metadata
  period:             PeriodKey;
  periodLabel:        string;
  periodDays:         number;

  // Period KPIs
  ordersPeriod:       number;
  revenuePeriod:      number;
  avgTicket:          number;
  ordersPrev:         number;
  revenuePrev:        number;

  // Real-time
  openOrders:         number;
  totalCustomers:     number;
  newCustomersPeriod: number;
  pipeline: {
    pending:        number;
    confirmed:      number;
    preparing:      number;
    ready:          number;
    outForDelivery: number;
  };
  delayedCount:         number;
  pendingPaymentsCount: number;

  // Charts
  topProducts:   TopProduct[];
  hourlyOrders:  { hour: number; orders: number; revenue: number }[];
  ordersByType:  { DELIVERY: number; PICKUP: number; DINE_IN: number };
  trendDays:     { date: string; revenue: number; orders: number }[];
  revenueTrend:  number;

  activeCampaigns: Campaign[];

  foocciProof: {
    upsellRevenue:    number;
    upsellItemCount:  number;
    recoveryTotal:    number;
    recoveryConverted: number;
    recoveryRate:     number | null;
  };

  crmSegments: {
    quente:     number;
    morno:      number;
    frio:       number;
    semPedidos: number;
  };
}

// ── Utilities ──────────────────────────────────────────────────────────────────

function fmtCurrency(n: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 2 }).format(n);
}

function fmtNum(n: number) {
  return new Intl.NumberFormat("pt-BR").format(n);
}

/** Compact currency for chart labels: "R$ 120", "1,2k", "12k" */
function fmtCompact(n: number): string {
  if (n === 0) return "";
  if (n >= 10_000) return `${Math.round(n / 1000)}k`;
  if (n >= 1_000)  return `${(n / 1000).toFixed(1).replace(".", ",")}k`;
  return `R$${Math.round(n)}`;
}

function pctChange(current: number, previous: number): { label: string; positive: boolean } | null {
  if (previous === 0) return null;
  const pct      = ((current - previous) / previous) * 100;
  const positive = pct >= 0;
  return { label: `${positive ? "+" : ""}${pct.toFixed(0)}% vs anterior`, positive };
}

function getGreeting(): string {
  const h = ((new Date().getUTCHours() - 3) + 24) % 24;
  if (h < 12) return "Bom dia";
  if (h < 18) return "Boa tarde";
  return "Boa noite";
}

// ── Skeleton ───────────────────────────────────────────────────────────────────

function Pulse({ className }: { className: string }) {
  return <div className={`animate-pulse rounded-xl bg-gray-100 ${className}`} />;
}

function LoadingSkeleton() {
  return (
    <div className="space-y-4 px-4 pb-8 pt-2">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[0, 1, 2, 3].map(i => <Pulse key={i} className="h-24" />)}
      </div>
      <Pulse className="h-32" />
      <div className="grid gap-4 lg:grid-cols-3">
        <Pulse className="h-56 lg:col-span-2" />
        <Pulse className="h-56" />
      </div>
      <Pulse className="h-24" />
      <Pulse className="h-24" />
    </div>
  );
}

// ── Period Filter ──────────────────────────────────────────────────────────────

const PERIOD_OPTIONS: { key: PeriodKey; label: string }[] = [
  { key: "today",      label: "Hoje"          },
  { key: "yesterday",  label: "Ontem"         },
  { key: "this_week",  label: "Esta semana"   },
  { key: "7d",         label: "Últimos 7 dias" },
  { key: "custom",     label: "Personalizado"  },
];

function PeriodFilter({
  period, customStart, customEnd, loading,
  onChange, onCustomChange,
}: {
  period:       PeriodKey;
  customStart:  string;
  customEnd:    string;
  loading:      boolean;
  onChange:     (p: PeriodKey) => void;
  onCustomChange: (start: string, end: string) => void;
}) {
  const [localStart, setLocalStart] = useState(customStart);
  const [localEnd,   setLocalEnd]   = useState(customEnd);

  // Sync outer → inner when period resets
  useEffect(() => { setLocalStart(customStart); setLocalEnd(customEnd); }, [customStart, customEnd]);

  function applyCustom() {
    if (localStart && localEnd && localStart <= localEnd) onCustomChange(localStart, localEnd);
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {PERIOD_OPTIONS.map(opt => (
        <button
          key={opt.key}
          type="button"
          onClick={() => onChange(opt.key)}
          disabled={loading}
          className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold transition-colors
            ${period === opt.key
              ? "bg-orange-500 text-white shadow-sm"
              : "border border-gray-200 bg-white text-gray-600 hover:border-orange-300 hover:text-orange-600"
            }
            ${loading ? "opacity-60 cursor-not-allowed" : ""}`}
        >
          {opt.label}
        </button>
      ))}

      {period === "custom" && (
        <div className="flex flex-wrap items-center gap-1.5">
          <input
            type="date"
            value={localStart}
            max={localEnd || undefined}
            onChange={e => setLocalStart(e.target.value)}
            className="h-7 rounded-lg border border-gray-200 px-2 text-xs text-gray-700 focus:border-orange-400 focus:outline-none"
          />
          <span className="text-xs text-gray-400">—</span>
          <input
            type="date"
            value={localEnd}
            min={localStart || undefined}
            max={new Date().toISOString().slice(0, 10)}
            onChange={e => setLocalEnd(e.target.value)}
            className="h-7 rounded-lg border border-gray-200 px-2 text-xs text-gray-700 focus:border-orange-400 focus:outline-none"
          />
          <button
            type="button"
            onClick={applyCustom}
            disabled={!localStart || !localEnd || localStart > localEnd || loading}
            className="h-7 rounded-lg bg-orange-500 px-2.5 text-xs font-bold text-white transition-colors hover:bg-orange-600 disabled:opacity-50"
          >
            Aplicar
          </button>
        </div>
      )}
    </div>
  );
}

// ── Shared primitives ──────────────────────────────────────────────────────────

function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`rounded-2xl border border-gray-100 bg-white shadow-sm ${className}`}>
      {children}
    </div>
  );
}

function SectionHeader({
  title, sub, href, hrefLabel = "Ver tudo",
}: {
  title: string; sub?: string; href?: string; hrefLabel?: string;
}) {
  return (
    <div className="mb-3 flex items-start justify-between gap-2">
      <div>
        <h3 className="text-sm font-semibold text-gray-800">{title}</h3>
        {sub && <p className="mt-0.5 text-xs text-gray-400">{sub}</p>}
      </div>
      {href && (
        <Link href={href} className="shrink-0 text-xs font-medium text-orange-500 hover:underline">
          {hrefLabel}
        </Link>
      )}
    </div>
  );
}

// ── KPI Card ───────────────────────────────────────────────────────────────────

function KpiCard({
  label, value, change, sub, href, accent = false,
}: {
  label:   string;
  value:   string;
  change?: { label: string; positive: boolean } | null;
  sub?:    string;
  href?:   string;
  accent?: boolean;
}) {
  const inner = (
    <div className={`rounded-2xl border p-4 shadow-sm transition-colors
      ${accent ? "border-orange-200 bg-orange-50" : "border-gray-100 bg-white"}
      ${href   ? "hover:border-gray-200 cursor-pointer" : ""}`}>
      <p className="text-xs font-medium text-gray-500">{label}</p>
      <p className={`mt-2 text-2xl font-bold leading-none ${accent ? "text-orange-600" : "text-gray-900"}`}>
        {value}
      </p>
      {change && (
        <p className={`mt-1.5 text-xs font-medium ${change.positive ? "text-green-600" : "text-red-500"}`}>
          {change.label}
        </p>
      )}
      {!change && sub && (
        <p className="mt-1.5 text-xs text-gray-400">{sub}</p>
      )}
    </div>
  );
  return href ? <Link href={href} className="block">{inner}</Link> : inner;
}

// ── Pipeline ───────────────────────────────────────────────────────────────────

const PIPELINE_STAGES = [
  { key: "pending",        label: "Aguardando", icon: "🕐" },
  { key: "confirmed",      label: "Confirmado",  icon: "✅" },
  { key: "preparing",      label: "Preparando",  icon: "👨‍🍳" },
  { key: "ready",          label: "Pronto",      icon: "🔔" },
  { key: "outForDelivery", label: "Entregando",  icon: "🛵" },
] as const;

function PipelineSection({
  pipeline, delayed, pendingPayments,
}: {
  pipeline:        DashboardData["pipeline"];
  delayed:         number;
  pendingPayments: number;
}) {
  const total = Object.values(pipeline).reduce((s, v) => s + v, 0);

  return (
    <Card className="p-4">
      <SectionHeader
        title="Em andamento agora"
        sub={total > 0 ? `${total} pedido${total !== 1 ? "s" : ""} ativos` : undefined}
        href="/orders"
        hrefLabel="Ver pedidos"
      />

      {total === 0 ? (
        <p className="py-4 text-center text-sm text-gray-400">Nenhum pedido em andamento</p>
      ) : (
        <div className="grid grid-cols-5 gap-1.5">
          {PIPELINE_STAGES.map(stage => {
            const count = pipeline[stage.key];
            return (
              <Link
                key={stage.key}
                href="/orders"
                className="flex flex-col items-center rounded-xl bg-gray-50 px-1 py-2.5 text-center hover:bg-orange-50 transition-colors"
              >
                <span className="text-sm">{stage.icon}</span>
                <span className={`mt-1 text-xl font-bold leading-none ${count > 0 ? "text-gray-900" : "text-gray-300"}`}>
                  {count}
                </span>
                <span className="mt-0.5 text-[9px] leading-tight text-gray-500">{stage.label}</span>
              </Link>
            );
          })}
        </div>
      )}

      {(delayed > 0 || pendingPayments > 0) && (
        <div className="mt-3 flex flex-wrap gap-2">
          {delayed > 0 && (
            <Link
              href="/orders"
              className="flex items-center gap-1.5 rounded-full border border-red-200 bg-red-50 px-3 py-1.5 text-xs font-semibold text-red-700 transition-colors hover:bg-red-100"
            >
              ⏱ {delayed} atrasado{delayed !== 1 ? "s" : ""}
            </Link>
          )}
          {pendingPayments > 0 && (
            <Link
              href="/orders"
              className="flex items-center gap-1.5 rounded-full border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs font-semibold text-amber-700 transition-colors hover:bg-amber-100"
            >
              💳 {pendingPayments} aguardando pagamento
            </Link>
          )}
        </div>
      )}
    </Card>
  );
}

// ── Top Products ───────────────────────────────────────────────────────────────

const RANK_ICON = ["🥇", "🥈", "🥉"] as const;

function TopProductsSection({ products, periodLabel }: { products: TopProduct[]; periodLabel: string }) {
  return (
    <Card className="p-4">
      <SectionHeader
        title="Mais vendidos"
        sub={`${periodLabel} · por quantidade`}
        href="/analytics"
        hrefLabel="Analytics"
      />

      {products.length === 0 ? (
        <div className="flex flex-col items-center gap-2 py-8 text-center">
          <span className="text-2xl">🍽</span>
          <p className="text-sm text-gray-400">Nenhuma venda no período selecionado</p>
        </div>
      ) : (
        <div className="divide-y divide-gray-50">
          {products.map((p, i) => (
            <div key={i} className="flex items-center gap-2.5 py-2.5 first:pt-0 last:pb-0">
              <span className="w-5 shrink-0 text-center text-xs font-bold text-gray-300">
                {i < 3 ? RANK_ICON[i] : `${i + 1}`}
              </span>
              {p.imageUrl ? (
                <img src={p.imageUrl} alt={p.name} className="h-8 w-8 shrink-0 rounded-lg object-cover" loading="lazy" />
              ) : (
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-orange-50 text-sm">🍽</div>
              )}
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-gray-900">{p.name}</p>
                {p.categoryName && <p className="text-[10px] text-gray-400">{p.categoryName}</p>}
              </div>
              <div className="shrink-0 text-right">
                <p className="text-sm font-bold text-gray-900">{p.quantity}×</p>
                <p className="text-[11px] text-gray-500">{fmtCurrency(p.revenue)}</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

// ── Order Types ────────────────────────────────────────────────────────────────

const ORDER_TYPE_META = [
  { key: "DELIVERY", label: "Delivery", icon: "🛵", color: "bg-orange-400" },
  { key: "PICKUP",   label: "Retirada", icon: "🛍", color: "bg-blue-400"   },
  { key: "DINE_IN",  label: "Mesa",     icon: "🪑", color: "bg-green-400"  },
] as const;

function OrderTypesSection({ types, total, periodLabel }: {
  types: DashboardData["ordersByType"]; total: number; periodLabel: string;
}) {
  return (
    <Card className="p-4">
      <SectionHeader title="Modalidade" sub={`${periodLabel} · por tipo`} />

      {total === 0 ? (
        <div className="flex flex-col items-center gap-2 py-6 text-center">
          <p className="text-sm text-gray-400">Pedidos aparecerão aqui</p>
        </div>
      ) : (
        <div className="space-y-3.5">
          {ORDER_TYPE_META.map(m => {
            const count = types[m.key];
            const pct   = total > 0 ? Math.round((count / total) * 100) : 0;
            return (
              <div key={m.key}>
                <div className="mb-1 flex items-center justify-between">
                  <span className="flex items-center gap-1 text-xs text-gray-600">
                    <span>{m.icon}</span> {m.label}
                  </span>
                  <span className="text-xs font-semibold text-gray-800">{count} <span className="font-normal text-gray-400">({pct}%)</span></span>
                </div>
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-gray-100">
                  <div className={`h-full rounded-full ${m.color}`} style={{ width: `${pct}%` }} />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}

// ── Hourly Chart ───────────────────────────────────────────────────────────────

function HourlyChart({ hourlyOrders }: { hourlyOrders: DashboardData["hourlyOrders"] }) {
  const nowBRTHour = ((new Date().getUTCHours() - 3) + 24) % 24;
  const endHour    = Math.min(23, Math.max(nowBRTHour, 20));
  const display    = hourlyOrders.filter(h => h.hour >= 7 && h.hour <= endHour);
  const maxOrders  = Math.max(1, ...display.map(h => h.orders));
  const peakHour   = display.reduce<{ hour: number; orders: number } | null>(
    (best, h) => best === null || h.orders > best.orders ? h : best, null
  );
  const hasData = display.some(h => h.orders > 0);

  return (
    <Card className="p-4">
      <SectionHeader
        title="Ritmo do dia"
        sub={hasData && peakHour && peakHour.orders > 0
          ? `Pico: ${peakHour.hour}h (${peakHour.orders} pedido${peakHour.orders !== 1 ? "s" : ""})`
          : "Pedidos por hora"}
      />
      {!hasData ? (
        <div className="flex h-12 items-center justify-center text-xs text-gray-400">
          Nenhum pedido ainda hoje
        </div>
      ) : (
        <div className="flex items-end gap-0.5" style={{ height: 48 }}>
          {display.map(h => {
            const barH    = h.orders > 0 ? Math.max(4, Math.round((h.orders / maxOrders) * 40)) : 2;
            const isPeak  = peakHour?.hour === h.hour && h.orders > 0;
            const isCurr  = h.hour === nowBRTHour;
            const bg      = isPeak ? "bg-orange-500" : isCurr ? "bg-orange-300" : h.orders > 0 ? "bg-orange-200" : "bg-gray-100";
            return (
              <div key={h.hour} className="flex flex-1 flex-col items-center gap-0.5"
                title={`${h.hour}h: ${h.orders} pedidos · ${fmtCurrency(h.revenue)}`}>
                <div className={`w-full rounded-t-sm ${bg}`} style={{ height: barH }} />
                {h.hour % 3 === 0 && <span className="text-[8px] leading-none text-gray-400">{h.hour}h</span>}
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}

// ── Trend Chart (daily bars — works for any period length) ─────────────────────

const DAY_NAMES = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"] as const;

function TrendChart({
  trend, totalRevenue, periodLabel, days, period,
}: {
  trend:        DashboardData["trendDays"];
  totalRevenue: number;
  periodLabel:  string;
  days:         number;
  period:       PeriodKey;
}) {
  if (trend.length === 0) return null;

  // Only the "today" view renders a rolling 7-day base where the final bar IS today.
  // Other single-day periods (e.g. "Ontem") must NOT highlight their bar as "Hoje".
  const isTodayView = period === "today";

  const maxRev = Math.max(1, ...trend.map(d => d.revenue));
  // For many bars, only show label every N days so they don't overlap
  const labelEvery = trend.length <= 7 ? 1 : trend.length <= 14 ? 2 : trend.length <= 21 ? 3 : 5;

  return (
    <Card className="p-4">
      <SectionHeader
        title={isTodayView ? "Últimos 7 dias" : `Tendência · ${periodLabel}`}
        sub={`${fmtCurrency(totalRevenue)} em receita`}
        href="/analytics"
        hrefLabel="Analytics"
      />
      {/* Container: items-end aligns bar bottoms; extra height for value labels */}
      <div className="flex items-end gap-px" style={{ height: 76 }}>
        {trend.map((d, i) => {
          const isLast  = i === trend.length - 1;
          const isToday = isTodayView ? isLast : false;
          const parts   = d.date.split("-") as [string, string, string];
          const jsDay   = new Date(+parts[0], +parts[1] - 1, +parts[2]).getDay();
          const label   = isToday ? "Hoje"
            : trend.length <= 7 ? (DAY_NAMES[jsDay] ?? "?")
            : (i % labelEvery === 0 ? parts[2] : ""); // show day-of-month number
          const barH    = d.revenue > 0 ? Math.max(6, Math.round((d.revenue / maxRev) * 48)) : 2;
          const valueLabel = fmtCompact(d.revenue);

          return (
            <div
              key={d.date}
              className="relative flex flex-1 flex-col items-center gap-0.5"
              title={`${d.date}: ${fmtCurrency(d.revenue)} · ${d.orders} pedido${d.orders !== 1 ? "s" : ""}`}
            >
              {/* Value label above bar — absolutely positioned to not shift bar alignment */}
              {d.revenue > 0 && (
                <span
                  className="pointer-events-none absolute left-0 right-0 text-center text-[7px] font-medium leading-none text-gray-500"
                  style={{ bottom: barH + 16 }}
                >
                  {valueLabel}
                </span>
              )}
              {/* Bar */}
              <div
                className={`w-full rounded-t-sm ${isToday ? "bg-orange-500" : "bg-gray-200"}`}
                style={{ height: barH }}
              />
              {/* Day label below bar */}
              <span className={`text-[8px] leading-none ${
                isToday ? "font-bold text-orange-500" :
                label    ? "text-gray-400"              : "text-transparent"
              }`}>
                {label || "·"}
              </span>
            </div>
          );
        })}
      </div>
    </Card>
  );
}

// ── Active Campaigns ───────────────────────────────────────────────────────────

const CAMP_STATUS: Record<string, { label: string; cls: string }> = {
  ACTIVE:    { label: "Ativo",    cls: "bg-green-100 text-green-700" },
  SCHEDULED: { label: "Agendado", cls: "bg-amber-100 text-amber-700" },
  SENDING:   { label: "Enviando", cls: "bg-blue-100  text-blue-700"  },
};

function CampaignSection({ campaigns }: { campaigns: Campaign[] }) {
  if (campaigns.length === 0) return null;

  return (
    <Card className="p-4">
      <SectionHeader
        title="Campanhas ativas"
        sub={`${campaigns.length} em execução`}
        href="/crm"
        hrefLabel="Gerenciar"
      />
      <div className="space-y-2.5">
        {campaigns.map(c => {
          const txResp   = c.totalSent > 0 ? `${((c.totalResponded / c.totalSent) * 100).toFixed(1)}%` : null;
          const statusMeta = CAMP_STATUS[c.status] ?? { label: c.status, cls: "bg-gray-100 text-gray-600" };
          return (
            <div key={c.id} className="rounded-xl border border-gray-100 bg-gray-50 p-3">
              <div className="flex items-start justify-between gap-2">
                <p className="min-w-0 truncate text-sm font-semibold text-gray-900">{c.name}</p>
                <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold ${statusMeta.cls}`}>
                  {statusMeta.label}
                </span>
              </div>
              <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-gray-500">
                <span>Audiência: <b className="text-gray-700">{fmtNum(c.totalAudience)}</b></span>
                <span>Enviados: <b className="text-gray-700">{fmtNum(c.totalSent)}</b></span>
                {c.totalResponded > 0 && (
                  <span>
                    Respostas: <b className="text-gray-700">{fmtNum(c.totalResponded)}</b>
                    {txResp && <span className="font-semibold text-green-600"> ({txResp})</span>}
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}

// ── Foocci Proof ──────────────────────────────────────────────────────────────

function FoocciProofSection({
  proof, periodLabel,
}: {
  proof: DashboardData["foocciProof"];
  periodLabel: string;
}) {
  const hasData = proof.upsellRevenue > 0 || proof.recoveryTotal > 0;

  return (
    <Card className="p-4">
      <SectionHeader
        title="Foocci em ação"
        sub={`${periodLabel} · upsell e recuperação gerados pela IA`}
        href="/analytics"
        hrefLabel="Analytics"
      />
      {!hasData ? (
        <p className="py-3 text-center text-xs text-gray-400">Nenhum dado de upsell ou recuperação no período</p>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div className="flex flex-col items-center rounded-xl bg-orange-50 p-3 text-center">
            <span className="text-lg">🚀</span>
            <span className="mt-1 text-lg font-bold text-orange-700">{fmtCurrency(proof.upsellRevenue)}</span>
            <span className="text-[10px] leading-tight text-gray-500">Receita upsell</span>
          </div>
          <div className="flex flex-col items-center rounded-xl bg-gray-50 p-3 text-center">
            <span className="text-lg">🛒</span>
            <span className="mt-1 text-lg font-bold text-gray-900">{proof.upsellItemCount}</span>
            <span className="text-[10px] leading-tight text-gray-500">Itens upsell</span>
          </div>
          <div className="flex flex-col items-center rounded-xl bg-gray-50 p-3 text-center">
            <span className="text-lg">♻️</span>
            <span className="mt-1 text-lg font-bold text-gray-900">
              {proof.recoveryConverted}/{proof.recoveryTotal}
            </span>
            <span className="text-[10px] leading-tight text-gray-500">Recuperações</span>
          </div>
          <div className="flex flex-col items-center rounded-xl bg-gray-50 p-3 text-center">
            <span className="text-lg">📈</span>
            <span className={`mt-1 text-lg font-bold ${proof.recoveryRate !== null && proof.recoveryRate > 0 ? "text-green-700" : "text-gray-400"}`}>
              {proof.recoveryRate !== null ? `${proof.recoveryRate}%` : "—"}
            </span>
            <span className="text-[10px] leading-tight text-gray-500">Taxa recuperação</span>
          </div>
        </div>
      )}
    </Card>
  );
}

// ── CRM Opportunities ─────────────────────────────────────────────────────────

const SEG_META = [
  { key: "quente",    label: "Ativos",          icon: "🔥", bg: "bg-red-50",    text: "text-red-700",    desc: "Compraram recentemente" },
  { key: "morno",     label: "Mornos",           icon: "☀️", bg: "bg-amber-50",  text: "text-amber-700",  desc: "Algum tempo sem comprar" },
  { key: "frio",      label: "Em risco",         icon: "❄️", bg: "bg-blue-50",   text: "text-blue-700",   desc: "Inativos — acionar CRM"  },
  { key: "semPedidos",label: "Sem pedidos",       icon: "👤", bg: "bg-gray-50",   text: "text-gray-500",   desc: "Nunca compraram"         },
] as const;

function CrmOpportunitiesSection({
  segments, totalCustomers,
}: {
  segments: DashboardData["crmSegments"];
  totalCustomers: number;
}) {
  const rows = SEG_META.map(m => ({ ...m, count: segments[m.key as keyof typeof segments] }));
  const atRisk = segments.frio;

  return (
    <Card className="p-4">
      <SectionHeader
        title="Base de clientes"
        sub={`${fmtNum(totalCustomers)} clientes · segmentação em tempo real`}
        href="/crm"
        hrefLabel="Abrir CRM"
      />
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {rows.map(row => (
          <div key={row.key} className={`flex flex-col items-center rounded-xl ${row.bg} p-3 text-center`}>
            <span className="text-base">{row.icon}</span>
            <span className={`mt-1 text-xl font-bold leading-none ${row.text}`}>{fmtNum(row.count)}</span>
            <span className="mt-0.5 text-[10px] font-semibold text-gray-600">{row.label}</span>
            <span className="mt-0.5 text-[9px] leading-tight text-gray-400">{row.desc}</span>
          </div>
        ))}
      </div>
      {atRisk > 0 && (
        <div className="mt-3 flex items-center justify-between rounded-xl border border-blue-100 bg-blue-50 px-3 py-2">
          <p className="text-xs text-blue-800">
            <span className="font-bold">{fmtNum(atRisk)}</span> clientes em risco de churn — considere uma campanha de reativação
          </p>
          <Link href="/crm" className="shrink-0 rounded-lg bg-blue-600 px-2.5 py-1 text-[11px] font-bold text-white hover:bg-blue-700">
            Criar campanha
          </Link>
        </div>
      )}
    </Card>
  );
}

// ── Quick Actions ──────────────────────────────────────────────────────────────

const QUICK_ACTIONS = [
  { label: "Pedidos",     href: "/orders",      icon: "📋", bg: "bg-blue-50   text-blue-700"   },
  { label: "Atendimento", href: "/atendimento",  icon: "💬", bg: "bg-green-50  text-green-700"  },
  { label: "CRM",         href: "/crm",          icon: "👥", bg: "bg-violet-50 text-violet-700" },
  { label: "Cardápio",    href: "/menu",         icon: "🍽", bg: "bg-orange-50 text-orange-700" },
] as const;

function QuickActions() {
  return (
    <div className="flex gap-2 overflow-x-auto pb-0.5 [&::-webkit-scrollbar]:hidden">
      {QUICK_ACTIONS.map(a => (
        <Link
          key={a.href}
          href={a.href}
          className={`flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold transition-opacity hover:opacity-75 ${a.bg}`}
        >
          <span>{a.icon}</span>
          <span>{a.label}</span>
        </Link>
      ))}
    </div>
  );
}

// ── Real-time badge ────────────────────────────────────────────────────────────

function RealtimeBadge() {
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-gray-200 bg-white px-2 py-0.5 text-[10px] text-gray-500">
      <span className="h-1.5 w-1.5 rounded-full bg-green-400" />
      Tempo real
    </span>
  );
}

// ── Cockpit: Alerts Strip ──────────────────────────────────────────────────────

const ALERT_STYLE: Record<string, { bg: string; border: string; text: string; dot: string }> = {
  CRITICAL: { bg: "bg-red-50",   border: "border-red-200",   text: "text-red-800",   dot: "bg-red-500"   },
  WARNING:  { bg: "bg-amber-50", border: "border-amber-200", text: "text-amber-800", dot: "bg-amber-500" },
  INFO:     { bg: "bg-blue-50",  border: "border-blue-200",  text: "text-blue-800",  dot: "bg-blue-500"  },
};

function AlertsStrip({ alerts }: { alerts: CockpitAlert[] }) {
  if (alerts.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-2">
      {alerts.map(a => {
        const s = ALERT_STYLE[a.severity] ?? ALERT_STYLE.INFO!;
        const inner = (
          <div className={`flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold ${s!.bg} ${s!.border} ${s!.text}`}>
            <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${s!.dot}`} />
            {a.title}
          </div>
        );
        return a.actionHref ? (
          <Link key={a.id} href={a.actionHref}>{inner}</Link>
        ) : (
          <div key={a.id}>{inner}</div>
        );
      })}
    </div>
  );
}

// ── Cockpit: Actions Section ───────────────────────────────────────────────────

const SOURCE_ICON: Record<string, string> = {
  OPERATIONS: "⚙️",
  CRM:        "👥",
  RECOVERY:   "♻️",
};

function ActionsSection({ actions }: { actions: CockpitAction[] }) {
  if (actions.length === 0) return null;
  return (
    <Card className="p-4">
      <SectionHeader title="O que fazer agora" sub="Ações recomendadas com base nos dados de hoje" />
      <div className="space-y-2.5">
        {actions.map(a => (
          <div key={a.id} className="flex items-center gap-3 rounded-xl border border-orange-100 bg-orange-50 p-3">
            <span className="text-lg shrink-0">{SOURCE_ICON[a.source] ?? "💡"}</span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-gray-900">{a.title}</p>
              <p className="text-xs text-gray-500">{a.description}</p>
            </div>
            <Link
              href={a.actionHref}
              className="shrink-0 rounded-lg bg-orange-500 px-2.5 py-1.5 text-[11px] font-bold text-white transition-colors hover:bg-orange-600"
            >
              {a.actionLabel}
            </Link>
          </div>
        ))}
      </div>
    </Card>
  );
}

// ── Cockpit: Health Row ────────────────────────────────────────────────────────

const HEALTH_STYLE: Record<HealthStatus, { bg: string; dot: string; text: string }> = {
  HEALTHY:  { bg: "bg-green-50",  dot: "bg-green-500",  text: "text-green-700"  },
  WARNING:  { bg: "bg-amber-50",  dot: "bg-amber-500",  text: "text-amber-700"  },
  CRITICAL: { bg: "bg-red-50",    dot: "bg-red-500",    text: "text-red-700"    },
  NO_DATA:  { bg: "bg-gray-50",   dot: "bg-gray-300",   text: "text-gray-500"   },
};

const HEALTH_LABELS: Record<string, string> = {
  sales:      "Vendas",
  operations: "Operações",
  crm:        "CRM",
  recovery:   "Carrinhos",
};

function HealthRow({ health }: { health: CockpitReport["health"] }) {
  const entries = (Object.entries(health) as [keyof typeof health, CockpitReport["health"][keyof CockpitReport["health"]]][]);
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
      {entries.map(([key, ind]) => {
        const s = HEALTH_STYLE[ind.status];
        return (
          <div key={key} className={`flex flex-col gap-0.5 rounded-xl p-3 ${s.bg}`}>
            <div className="flex items-center gap-1.5">
              <span className={`h-2 w-2 shrink-0 rounded-full ${s.dot}`} />
              <span className={`text-[11px] font-bold ${s.text}`}>{ind.label}</span>
            </div>
            <p className="text-[10px] leading-tight text-gray-500">{HEALTH_LABELS[key] ?? key}</p>
            {ind.sub && <p className="text-[10px] leading-tight text-gray-400">{ind.sub}</p>}
          </div>
        );
      })}
    </div>
  );
}

// ── Main Component ─────────────────────────────────────────────────────────────

export default function DashboardClient({ userName }: { userName: string }) {
  const [data,        setData]        = useState<DashboardData | null>(null);
  const [loading,     setLoading]     = useState(true);
  const [error,       setError]       = useState(false);
  const [dateStr,     setDateStr]     = useState("");
  const [retryCount,  setRetryCount]  = useState(0);
  const [period,      setPeriod]      = useState<PeriodKey>("today");
  const [customStart, setCustomStart] = useState("");
  const [customEnd,   setCustomEnd]   = useState("");
  const [cockpit,     setCockpit]     = useState<CockpitReport | null>(null);

  useEffect(() => {
    setDateStr(
      new Date().toLocaleDateString("pt-BR", {
        weekday: "long", day: "numeric", month: "long",
        timeZone: "America/Sao_Paulo",
      })
    );
  }, []);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(false);

    async function load() {
      try {
        const params = new URLSearchParams({ period });
        if (period === "custom" && customStart && customEnd) {
          params.set("startDate", customStart);
          params.set("endDate",   customEnd);
        }
        const res  = await fetch(`/api/dashboard?${params.toString()}`);
        if (!res.ok) throw new Error("api error");
        const json = (await res.json()) as { data: DashboardData };
        if (active) setData(json.data);
      } catch {
        if (active) setError(true);
      } finally {
        if (active) setLoading(false);
      }
    }

    void load();
    // Auto-refresh only for "today" (real-time operational view)
    const id = period === "today" ? setInterval(() => { void load(); }, 120_000) : null;
    return () => { active = false; if (id) clearInterval(id); };
  }, [period, customStart, customEnd, retryCount]);

  // Cockpit: fetch alerts, actions, health (today-only, non-blocking)
  useEffect(() => {
    let active = true;
    if (period !== "today") { setCockpit(null); return; }
    async function loadCockpit() {
      try {
        const res = await fetch("/api/dashboard/cockpit");
        if (!res.ok) return;
        const json = (await res.json()) as { data: CockpitReport };
        if (active) setCockpit(json.data);
      } catch { /* non-critical — silently omit cockpit sections */ }
    }
    void loadCockpit();
    const id = setInterval(() => { void loadCockpit(); }, 120_000);
    return () => { active = false; clearInterval(id); };
  }, [period, retryCount]);

  function handlePeriodChange(p: PeriodKey) {
    if (p !== "custom") {
      setCustomStart("");
      setCustomEnd("");
    }
    setPeriod(p);
  }

  function handleCustomChange(start: string, end: string) {
    setCustomStart(start);
    setCustomEnd(end);
    // Trigger reload via retryCount
    setRetryCount(c => c + 1);
  }

  const greeting = getGreeting();
  const pLabel   = data?.periodLabel ?? "Hoje";

  // Header always visible
  const header = (
    <div className="space-y-2 p-4 pb-2">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Início</h1>
          <p className="text-sm text-gray-500">
            {greeting}, {userName}
            {dateStr && <span className="mx-1.5 text-gray-300">·</span>}
            {dateStr}
          </p>
        </div>
        <QuickActions />
      </div>
      {/* Period filter strip */}
      <PeriodFilter
        period={period}
        customStart={customStart}
        customEnd={customEnd}
        loading={loading}
        onChange={handlePeriodChange}
        onCustomChange={handleCustomChange}
      />

      {/* Alert chips — today only */}
      {cockpit && cockpit.urgentAlerts.length > 0 && (
        <AlertsStrip alerts={cockpit.urgentAlerts} />
      )}
    </div>
  );

  if (loading) {
    return (
      <div>
        {header}
        <LoadingSkeleton />
      </div>
    );
  }

  if (error) {
    return (
      <div>
        {header}
        <div className="flex flex-col items-center justify-center gap-3 p-12 text-center">
          <span className="text-4xl">⚠️</span>
          <p className="text-sm font-semibold text-gray-700">Não foi possível carregar o resumo agora</p>
          <button
            type="button"
            onClick={() => setRetryCount(c => c + 1)}
            className="rounded-xl bg-orange-500 px-4 py-2 text-xs font-bold text-white transition-colors hover:bg-orange-600"
          >
            Tentar novamente
          </button>
        </div>
      </div>
    );
  }

  if (!data) return null;

  const revenueChange = pctChange(data.revenuePeriod, data.revenuePrev);
  const ordersChange  = pctChange(data.ordersPeriod,  data.ordersPrev);

  return (
    <div>
      {header}

      <div className="space-y-4 px-4 pb-10">
        {/* KPI Row */}
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <KpiCard
            label={`Receita · ${pLabel}`}
            value={fmtCurrency(data.revenuePeriod)}
            change={revenueChange}
            href="/orders"
            accent
          />
          <KpiCard
            label={`Pedidos · ${pLabel}`}
            value={fmtNum(data.ordersPeriod)}
            change={ordersChange}
            href="/orders"
          />
          <KpiCard
            label="Ticket médio"
            value={data.ordersPeriod > 0 ? fmtCurrency(data.avgTicket) : "—"}
            sub={data.ordersPeriod > 0 ? "por pedido" : "sem pedidos no período"}
          />
          <KpiCard
            label="Em andamento"
            value={fmtNum(data.openOrders)}
            sub={data.openOrders > 0 ? "pedidos ativos agora" : "todos concluídos"}
            href={data.openOrders > 0 ? "/orders" : undefined}
          />
        </div>

        {/* Real-time note for non-today periods */}
        {data.period !== "today" && (
          <div className="flex items-center gap-2 rounded-xl border border-gray-100 bg-gray-50 p-3 text-xs text-gray-500">
            <RealtimeBadge />
            <span>Pipeline, atrasados e pagamentos pendentes são sempre em tempo real.</span>
          </div>
        )}

        {/* Pipeline */}
        <PipelineSection
          pipeline={data.pipeline}
          delayed={data.delayedCount}
          pendingPayments={data.pendingPaymentsCount}
        />

        {/* Cockpit: "O que fazer agora" */}
        {cockpit && cockpit.recommendedActions.length > 0 && (
          <ActionsSection actions={cockpit.recommendedActions} />
        )}

        {/* Products + Modality */}
        <div className="grid gap-4 lg:grid-cols-3">
          <div className="lg:col-span-2">
            <TopProductsSection products={data.topProducts} periodLabel={pLabel} />
          </div>
          <OrderTypesSection types={data.ordersByType} total={data.ordersPeriod} periodLabel={pLabel} />
        </div>

        {/* Hourly rhythm (today only) */}
        {data.period === "today" && data.hourlyOrders.length > 0 && (
          <HourlyChart hourlyOrders={data.hourlyOrders} />
        )}

        {/* Trend chart */}
        <TrendChart
          trend={data.trendDays}
          totalRevenue={data.revenueTrend}
          periodLabel={pLabel}
          days={data.periodDays}
          period={data.period}
        />

        {/* Active campaigns */}
        <CampaignSection campaigns={data.activeCampaigns} />

        {/* CRM base + segment opportunities */}
        <CrmOpportunitiesSection
          segments={data.crmSegments}
          totalCustomers={data.totalCustomers}
        />

        {/* Foocci upsell + recovery proof */}
        <FoocciProofSection proof={data.foocciProof} periodLabel={pLabel} />

        {/* Cockpit: health indicators (today only) */}
        {cockpit && (
          <Card className="p-4">
            <SectionHeader title="Saúde do negócio" sub="Indicadores em tempo real · hoje" href="/analytics" hrefLabel="Analytics" />
            <HealthRow health={cockpit.health} />
          </Card>
        )}

        {/* Analytics deep-dive link */}
        <Card className="p-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-orange-50 text-xl">
              🤖
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-gray-800">Insights com IA</p>
              <p className="text-xs text-gray-400">Análise detalhada com período comparativo e recomendações</p>
            </div>
            <Link
              href="/analytics"
              className="shrink-0 rounded-xl bg-orange-500 px-3 py-1.5 text-xs font-bold text-white transition-colors hover:bg-orange-600"
            >
              Ver Analytics
            </Link>
          </div>
        </Card>
      </div>
    </div>
  );
}
