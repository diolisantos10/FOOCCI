"use client";

import { useState, useEffect } from "react";
import Link from "next/link";

// ── Types ──────────────────────────────────────────────────────────────────────

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
  ordersToday:          number;
  revenueToday:         number;
  avgTicket:            number;
  openOrders:           number;
  totalCustomers:       number;
  newCustomersToday:    number;
  ordersYesterday:      number;
  revenueYesterday:     number;
  revenue7Days:         number;
  trend7Days:           { date: string; revenue: number; orders: number }[];
  pipeline: {
    pending:        number;
    confirmed:      number;
    preparing:      number;
    ready:          number;
    outForDelivery: number;
  };
  delayedCount:         number;
  pendingPaymentsCount: number;
  topProducts:          TopProduct[];
  hourlyOrders:         { hour: number; orders: number; revenue: number }[];
  ordersByType:         { DELIVERY: number; PICKUP: number; DINE_IN: number };
  activeCampaigns:      Campaign[];
}

// ── Utilities ──────────────────────────────────────────────────────────────────

function fmtCurrency(n: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 2 }).format(n);
}

function fmtNum(n: number) {
  return new Intl.NumberFormat("pt-BR").format(n);
}

function pctChange(current: number, previous: number): { label: string; positive: boolean } | null {
  if (previous === 0) return null;
  const pct      = ((current - previous) / previous) * 100;
  const positive = pct >= 0;
  return { label: `${positive ? "+" : ""}${pct.toFixed(0)}% vs ontem`, positive };
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

function TopProductsSection({ products }: { products: TopProduct[] }) {
  return (
    <Card className="p-4">
      <SectionHeader title="Mais vendidos hoje" sub="Por quantidade" href="/analytics" hrefLabel="Analytics" />

      {products.length === 0 ? (
        <div className="flex flex-col items-center gap-2 py-8 text-center">
          <span className="text-2xl">🍽</span>
          <p className="text-sm text-gray-400">Os mais vendidos aparecerão quando houver pedidos hoje</p>
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

function OrderTypesSection({ types, total }: { types: DashboardData["ordersByType"]; total: number }) {
  return (
    <Card className="p-4">
      <SectionHeader title="Modalidade" sub="Pedidos de hoje por tipo" />

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
              <div key={m.key} className="flex items-center gap-2.5">
                <span className="text-base">{m.icon}</span>
                <div className="flex-1 min-w-0">
                  <div className="mb-1 flex items-center justify-between text-xs">
                    <span className="font-medium text-gray-700">{m.label}</span>
                    <span className="text-gray-500">{count} · {pct}%</span>
                  </div>
                  <div className="h-1.5 overflow-hidden rounded-full bg-gray-100">
                    <div className={`h-full rounded-full transition-all ${m.color}`} style={{ width: `${pct}%` }} />
                  </div>
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

// ── 7-Day Trend ────────────────────────────────────────────────────────────────

const DAY_NAMES = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"] as const;

function WeekTrendSection({ trend, totalRevenue }: { trend: DashboardData["trend7Days"]; totalRevenue: number }) {
  const maxRev = Math.max(1, ...trend.map(d => d.revenue));

  return (
    <Card className="p-4">
      <SectionHeader
        title="Últimos 7 dias"
        sub={`${fmtCurrency(totalRevenue)} em receita`}
        href="/analytics"
        hrefLabel="Analytics"
      />
      <div className="flex items-end gap-1" style={{ height: 56 }}>
        {trend.map((d, i) => {
          const isToday = i === trend.length - 1;
          const parts   = d.date.split("-") as [string, string, string];
          const jsDay   = new Date(+parts[0], +parts[1] - 1, +parts[2]).getDay();
          const label   = isToday ? "Hoje" : (DAY_NAMES[jsDay] ?? "?");
          const barH    = d.revenue > 0 ? Math.max(4, Math.round((d.revenue / maxRev) * 48)) : 2;

          return (
            <div key={d.date} className="flex flex-1 flex-col items-center gap-1"
              title={`${label}: ${fmtCurrency(d.revenue)} · ${d.orders} pedido${d.orders !== 1 ? "s" : ""}`}>
              <div
                className={`w-full rounded-t-sm ${isToday ? "bg-orange-500" : "bg-gray-200"}`}
                style={{ height: barH }}
              />
              <span className={`text-[9px] leading-none ${isToday ? "font-bold text-orange-500" : "text-gray-400"}`}>
                {label}
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

// ── CRM Section ────────────────────────────────────────────────────────────────

function CrmSection({
  totalCustomers, newToday, campaignCount,
}: {
  totalCustomers: number; newToday: number; campaignCount: number;
}) {
  return (
    <Card className="p-4">
      <SectionHeader title="CRM" sub="Clientes e relacionamento" href="/crm" hrefLabel="Abrir CRM" />
      <div className="grid grid-cols-3 gap-2">
        {[
          { icon: "👥", value: fmtNum(totalCustomers), label: "Clientes"    },
          { icon: "✨", value: fmtNum(newToday),        label: "Novos hoje"  },
          { icon: "📣", value: fmtNum(campaignCount),   label: "Campanhas"   },
        ].map(item => (
          <div key={item.label} className="flex flex-col items-center rounded-xl bg-gray-50 p-3 text-center">
            <span className="text-xl">{item.icon}</span>
            <span className="mt-1 text-xl font-bold text-gray-900">{item.value}</span>
            <span className="text-[10px] leading-tight text-gray-500">{item.label}</span>
          </div>
        ))}
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <Link
          href="/crm"
          className="flex items-center justify-center gap-1 rounded-xl border border-gray-200 py-2 text-xs font-semibold text-gray-600 transition-colors hover:bg-gray-50"
        >
          Ver CRM →
        </Link>
        <Link
          href="/crm"
          className="flex items-center justify-center gap-1 rounded-xl bg-orange-500 py-2 text-xs font-bold text-white transition-colors hover:bg-orange-600"
        >
          Criar campanha
        </Link>
      </div>
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

// ── Main Component ─────────────────────────────────────────────────────────────

export default function DashboardClient({ userName }: { userName: string }) {
  const [data,       setData]       = useState<DashboardData | null>(null);
  const [loading,    setLoading]    = useState(true);
  const [error,      setError]      = useState(false);
  const [dateStr,    setDateStr]    = useState("");
  const [retryCount, setRetryCount] = useState(0);

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
        const res  = await fetch("/api/dashboard");
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
    const id = setInterval(() => { void load(); }, 120_000);
    return () => { active = false; clearInterval(id); };
  }, [retryCount]);

  const greeting = getGreeting();

  // Header always visible
  const header = (
    <div className="flex flex-col gap-3 p-4 pb-2 sm:flex-row sm:items-start sm:justify-between">
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

  const revenueChange = pctChange(data.revenueToday, data.revenueYesterday);
  const ordersChange  = pctChange(data.ordersToday,  data.ordersYesterday);

  return (
    <div>
      {header}

      <div className="space-y-4 px-4 pb-10">
        {/* KPI Row */}
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <KpiCard
            label="Receita hoje"
            value={fmtCurrency(data.revenueToday)}
            change={revenueChange}
            href="/orders"
            accent
          />
          <KpiCard
            label="Pedidos hoje"
            value={fmtNum(data.ordersToday)}
            change={ordersChange}
            href="/orders"
          />
          <KpiCard
            label="Ticket médio"
            value={data.ordersToday > 0 ? fmtCurrency(data.avgTicket) : "—"}
            sub={data.ordersToday > 0 ? "por pedido" : "sem pedidos ainda"}
          />
          <KpiCard
            label="Em andamento"
            value={fmtNum(data.openOrders)}
            sub={data.openOrders > 0 ? "pedidos ativos agora" : "todos concluídos"}
            href={data.openOrders > 0 ? "/orders" : undefined}
          />
        </div>

        {/* Pipeline */}
        <PipelineSection
          pipeline={data.pipeline}
          delayed={data.delayedCount}
          pendingPayments={data.pendingPaymentsCount}
        />

        {/* Products + Modality */}
        <div className="grid gap-4 lg:grid-cols-3">
          <div className="lg:col-span-2">
            <TopProductsSection products={data.topProducts} />
          </div>
          <OrderTypesSection types={data.ordersByType} total={data.ordersToday} />
        </div>

        {/* Hourly rhythm */}
        <HourlyChart hourlyOrders={data.hourlyOrders} />

        {/* 7-day trend */}
        <WeekTrendSection trend={data.trend7Days} totalRevenue={data.revenue7Days} />

        {/* Active campaigns */}
        <CampaignSection campaigns={data.activeCampaigns} />

        {/* CRM summary */}
        <CrmSection
          totalCustomers={data.totalCustomers}
          newToday={data.newCustomersToday}
          campaignCount={data.activeCampaigns.length}
        />

        {/* Analytics link */}
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
