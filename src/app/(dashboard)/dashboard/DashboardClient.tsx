"use client";

import { useState } from "react";
import Link from "next/link";

// ─── Time-filter types ────────────────────────────────────────
type Period = "today" | "yesterday" | "7days" | "month" | "year";

const PERIOD_OPTIONS: Array<{ id: Period; label: string }> = [
  { id: "today",     label: "Hoje" },
  { id: "yesterday", label: "Ontem" },
  { id: "7days",     label: "Últ. 7 dias" },
  { id: "month",     label: "Mês atual" },
  { id: "year",      label: "Ano atual" },
];

// ─────────────────────────────────────────────────────────────
//  Mock data — swap for real API calls when ready
// ─────────────────────────────────────────────────────────────

const MOCK_KPIS = {
  ordersToday: 47,
  revenueToday: 3_842.5,
  avgTicket: 81.76,
};

// Revenue headline per period (drives the dynamic header)
const MOCK_PERIOD_REVENUE: Record<Period, number> = {
  today:     3_842.50,
  yesterday: 4_210.00,
  "7days":   27_320.00,
  month:     104_500.00,
  year:      1_254_600.00,
};

// KPI values per period
const MOCK_PERIOD_KPIS: Record<
  Period,
  { orders: number; revenue: number; ticket: number; ordersChange: number; revenueChange: number; ticketChange: number }
> = {
  today:     { orders: 47,     revenue: 3_842.50,   ticket: 81.76, ordersChange: +12, revenueChange: +8,  ticketChange: -3 },
  yesterday: { orders: 53,     revenue: 4_210.00,   ticket: 79.43, ordersChange: +5,  revenueChange: +14, ticketChange: +2 },
  "7days":   { orders: 336,    revenue: 27_320.00,  ticket: 81.31, ordersChange: +7,  revenueChange: +11, ticketChange: +1 },
  month:     { orders: 1_284,  revenue: 104_500.00, ticket: 81.39, ordersChange: +4,  revenueChange: +9,  ticketChange:  0 },
  year:      { orders: 15_420, revenue: 1_254_600,  ticket: 81.36, ordersChange: +18, revenueChange: +23, ticketChange: +3 },
};

const MOCK_LIVE = {
  preparing: 8,
  delayed: 2,
  cancelled: 1,
};

const MOCK_OPERATION = {
  preparing:        8,
  delayed:          2,
  cancelled:        1,
  avgPrepTime:      22,   // minutes
  cancellationRate: 2.1,  // percent
};

const MOCK_ALERTS = [
  {
    id: "beverages",
    icon: "⚠️",
    message: "Nenhuma bebida vendida hoje",
    cta: "Ver cardápio",
    href: "/menu",
  },
  {
    id: "lunch",
    icon: "📉",
    message: "Baixa conversão no horário de almoço (12h–13h)",
    cta: null,
    href: null,
  },
  {
    id: "xburger",
    icon: "🛑",
    message: "X-Burguer Especial sem vendas há 2 dias",
    cta: "Ver produto",
    href: "/menu",
  },
];

type InsightType = "warning" | "opportunity" | "info";

const INSIGHT_STYLES: Record<
  InsightType,
  { bg: string; border: string; text: string; link: string }
> = {
  warning:     { bg: "bg-red-50",    border: "border-l-red-400",   text: "text-red-800",    link: "text-red-600"   },
  opportunity: { bg: "bg-green-50",  border: "border-l-green-400", text: "text-green-800",  link: "text-green-600" },
  info:        { bg: "bg-blue-50",   border: "border-l-blue-400",  text: "text-blue-800",   link: "text-blue-600"  },
};

const MOCK_INSIGHTS: Array<{
  id: string;
  type: InsightType;
  icon: string;
  message: string;
  action: string;
  href: string;
}> = [
  { id: "beverages", type: "warning",     icon: "🧃", message: "78% dos pedidos sem bebida",       action: "Ativar combo de bebida",  href: "/settings/experience" },
  { id: "ticket",    type: "warning",     icon: "📉", message: "Ticket médio caiu 3% hoje",        action: "Revisar upsell",          href: "/settings/experience" },
  { id: "dessert",   type: "warning",     icon: "🍰", message: "0 sobremesas vendidas hoje",       action: "Criar promoção",          href: "/marketing"           },
  { id: "crm",       type: "opportunity", icon: "👥", message: "3 clientes inativos há 30 dias",  action: "Reativar clientes",       href: "/crm"                 },
];

type QuickActionColor = { iconBg: string; iconText: string; hoverBorder: string };

const QUICK_ACTIONS: Array<{
  id: string;
  icon: string;
  label: string;
  desc: string;
  href: string;
  color: QuickActionColor;
}> = [
  { id: "promo",   icon: "🎁", label: "Criar promoção",    desc: "Aumentar vendas",     href: "/marketing",           color: { iconBg: "bg-orange-100", iconText: "text-orange-600", hoverBorder: "hover:border-orange-300" } },
  { id: "upsell",  icon: "🚀", label: "Ativar upsell",     desc: "Configurar IA",       href: "/settings/experience", color: { iconBg: "bg-violet-100",  iconText: "text-violet-600",  hoverBorder: "hover:border-violet-300"  } },
  { id: "clients", icon: "👥", label: "Reativar clientes", desc: "Enviar mensagens",    href: "/crm",                 color: { iconBg: "bg-emerald-100", iconText: "text-emerald-600", hoverBorder: "hover:border-emerald-300" } },
  { id: "orders",  icon: "📋", label: "Ver pedidos",       desc: "Central ao vivo",     href: "/orders",              color: { iconBg: "bg-blue-100",    iconText: "text-blue-600",    hoverBorder: "hover:border-blue-300"    } },
];

const MOCK_CHART_TODAY = [
  { label: "08h", orders: 2, revenue: 142 },
  { label: "09h", orders: 4, revenue: 310 },
  { label: "10h", orders: 3, revenue: 248 },
  { label: "11h", orders: 6, revenue: 492 },
  { label: "12h", orders: 11, revenue: 901 },
  { label: "13h", orders: 8, revenue: 655 },
  { label: "14h", orders: 5, revenue: 410 },
  { label: "15h", orders: 3, revenue: 246 },
  { label: "16h", orders: 2, revenue: 164 },
  { label: "17h", orders: 3, revenue: 274 },
];

const MOCK_CHART_WEEK = [
  { label: "Seg", orders: 32, revenue: 2_100 },
  { label: "Ter", orders: 41, revenue: 2_870 },
  { label: "Qua", orders: 38, revenue: 2_640 },
  { label: "Qui", orders: 45, revenue: 3_120 },
  { label: "Sex", orders: 62, revenue: 4_380 },
  { label: "Sáb", orders: 71, revenue: 5_120 },
  { label: "Hoje", orders: 47, revenue: 3_842 },
];

const MOCK_TOP_ITEMS = [
  { name: "X-Burguer Especial", sales: 18, revenue: 540 },
  { name: "Frango Grelhado", sales: 14, revenue: 392 },
  { name: "Combo Família", sales: 11, revenue: 660 },
  { name: "Pizza Margherita", sales: 9, revenue: 360 },
  { name: "Açaí 500ml", sales: 8, revenue: 200 },
];

const MOCK_WORST_ITEMS = [
  { name: "Salada Caesar", sales: 1, revenue: 28 },
  { name: "Suco Detox", sales: 1, revenue: 15 },
  { name: "Sobremesa do Dia", sales: 0, revenue: 0 },
  { name: "Prato Vegano", sales: 0, revenue: 0 },
  { name: "Combo Kids", sales: 2, revenue: 50 },
];

const MOCK_CUSTOMERS = {
  total: 342,
  newToday: 12,
  returningToday: 35,
};

const MOCK_PAYMENTS = [
  { method: "PIX", count: 28, amount: 2_241 },
  { method: "Cartão Crédito", count: 12, amount: 987 },
  { method: "Cartão Débito", count: 5, amount: 432 },
  { method: "Dinheiro", count: 2, amount: 182 },
];

type BannerVariant = "opportunity" | "warning" | "info";

const BANNER_VARIANT_STYLES: Record<
  BannerVariant,
  { iconBg: string; iconText: string; btn: string }
> = {
  opportunity: {
    iconBg:   "bg-orange-50",
    iconText: "text-orange-500",
    btn:      "bg-orange-500 hover:bg-orange-600 text-white",
  },
  warning: {
    iconBg:   "bg-amber-50",
    iconText: "text-amber-600",
    btn:      "bg-amber-500 hover:bg-amber-600 text-white",
  },
  info: {
    iconBg:   "bg-blue-50",
    iconText: "text-blue-600",
    btn:      "bg-blue-600 hover:bg-blue-700 text-white",
  },
};

const BANNERS: Array<{
  id: string;
  variant: BannerVariant;
  icon: string;
  title: string;
  description: string;
  cta: string;
  href: string;
}> = [
  {
    id: "ticket",
    variant: "opportunity",
    icon: "🎯",
    title: "Aumente seu ticket médio",
    description: "Clientes que adicionam bebida gastam em média 23% a mais por pedido.",
    cta: "Ver estratégia",
    href: "/marketing",
  },
  {
    id: "dessert",
    variant: "warning",
    icon: "🍰",
    title: "Você está perdendo vendas de sobremesa",
    description: "Nenhuma sobremesa vendida hoje. Ative uma promoção relâmpago agora.",
    cta: "Criar promoção",
    href: "/marketing",
  },
  {
    id: "feature",
    variant: "info",
    icon: "✨",
    title: "Nova funcionalidade disponível",
    description: "Configure o comportamento da IA e personalize a experiência do cliente.",
    cta: "Explorar",
    href: "/settings/experience",
  },
];

// ─────────────────────────────────────────────────────────────
//  Utilities
// ─────────────────────────────────────────────────────────────

function fmtCurrency(n: number) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    minimumFractionDigits: 2,
  }).format(n);
}

// ─────────────────────────────────────────────────────────────
//  Shared primitives
// ─────────────────────────────────────────────────────────────

function Card({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`rounded-2xl border border-gray-100 bg-white shadow-sm ${className}`}
    >
      {children}
    </div>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <p className="mb-1 text-[11px] font-semibold uppercase tracking-widest text-gray-400">
      {children}
    </p>
  );
}

function ToggleGroup({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex overflow-hidden rounded-lg border border-gray-200 text-xs">
      {children}
    </div>
  );
}

function ToggleBtn({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`px-3 py-1.5 font-medium transition-colors ${
        active ? "bg-orange-500 text-white" : "text-gray-500 hover:bg-gray-50"
      }`}
    >
      {children}
    </button>
  );
}

// ─────────────────────────────────────────────────────────────
//  1. BannerSection
// ─────────────────────────────────────────────────────────────

function BannerSection() {
  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
      {BANNERS.map((b) => {
        const v = BANNER_VARIANT_STYLES[b.variant];
        return (
          <div
            key={b.id}
            className="flex flex-col rounded-2xl border border-gray-100 bg-white p-5 shadow-sm"
          >
            {/* Icon */}
            <div
              className={`flex h-10 w-10 items-center justify-center rounded-xl text-xl ${v.iconBg} ${v.iconText}`}
            >
              {b.icon}
            </div>

            {/* Text */}
            <p className="mt-3 font-semibold leading-snug text-gray-900">
              {b.title}
            </p>
            <p className="mt-1 flex-1 text-sm leading-relaxed text-gray-500">
              {b.description}
            </p>

            {/* CTA */}
            <div className="mt-4">
              <Link
                href={b.href}
                className={`inline-flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${v.btn}`}
              >
                {b.cta} →
              </Link>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
//  2. KPISection
// ─────────────────────────────────────────────────────────────

function KPICard({
  label,
  value,
  change,
  accent = false,
}: {
  label: string;
  value: string;
  change?: number;
  accent?: boolean;
}) {
  const trendColor =
    change === undefined ? ""
    : change > 0  ? (accent ? "text-orange-100" : "text-green-600")
    : change < 0  ? (accent ? "text-orange-200" : "text-red-500")
    :               (accent ? "text-orange-200" : "text-gray-400");

  return (
    <div
      className={`rounded-2xl p-5 ${
        accent
          ? "bg-orange-500 text-white shadow-sm shadow-orange-100"
          : "border border-gray-100 bg-white shadow-sm"
      }`}
    >
      <p className={`text-xs font-semibold uppercase tracking-wide ${accent ? "text-orange-100" : "text-gray-400"}`}>
        {label}
      </p>
      <p className={`mt-2 text-2xl font-bold leading-none sm:text-3xl ${accent ? "text-white" : "text-gray-900"}`}>
        {value}
      </p>
      {change !== undefined && (
        <p className={`mt-2 flex items-center gap-1 text-xs font-medium ${trendColor}`}>
          <span>{change > 0 ? "↑" : change < 0 ? "↓" : "→"}</span>
          <span>{change > 0 ? "+" : ""}{change}% vs anterior</span>
        </p>
      )}
    </div>
  );
}

function KPISection({ period }: { period: Period }) {
  const k = MOCK_PERIOD_KPIS[period];
  return (
    <>
      <KPICard label="Pedidos"     value={k.orders.toLocaleString("pt-BR")} change={k.ordersChange}  />
      <KPICard label="Receita"     value={fmtCurrency(k.revenue)}           change={k.revenueChange} accent />
      <KPICard label="Ticket médio" value={fmtCurrency(k.ticket)}            change={k.ticketChange}  />
    </>
  );
}

// ─────────────────────────────────────────────────────────────
//  3. LiveStatus
// ─────────────────────────────────────────────────────────────

function LiveStatus() {
  const { preparing, delayed, cancelled } = MOCK_LIVE;

  const items = [
    {
      dot: "bg-green-500",
      label: "Preparando",
      count: preparing,
      text: "text-green-700",
      bg: "bg-green-50",
    },
    {
      dot: "bg-amber-500",
      label: delayed > 0 ? `Atrasado${delayed > 1 ? "s" : ""}` : "Atrasados",
      count: delayed,
      text: delayed > 0 ? "text-amber-700" : "text-gray-400",
      bg: delayed > 0 ? "bg-amber-50" : "bg-gray-50",
    },
    {
      dot: "bg-red-500",
      label: "Cancelados",
      count: cancelled,
      text: cancelled > 0 ? "text-red-700" : "text-gray-400",
      bg: cancelled > 0 ? "bg-red-50" : "bg-gray-50",
    },
  ];

  return (
    <Card className="flex divide-x divide-gray-100">
      {items.map((item, i) => (
        <div
          key={i}
          className={`flex flex-1 items-center gap-3 px-5 py-4 ${item.bg}`}
        >
          <span
            className={`h-2.5 w-2.5 shrink-0 rounded-full ${item.dot} ${
              item.count > 0 ? "animate-pulse" : "opacity-30"
            }`}
          />
          <div>
            <p className={`text-2xl font-bold leading-none ${item.text}`}>
              {item.count}
            </p>
            <p className="mt-0.5 text-xs text-gray-500">{item.label}</p>
          </div>
        </div>
      ))}
    </Card>
  );
}

// ─────────────────────────────────────────────────────────────
//  4. Alerts
// ─────────────────────────────────────────────────────────────

function Alerts() {
  return (
    <div className="grid gap-3 sm:grid-cols-3">
      {MOCK_ALERTS.map((a) => (
        <div
          key={a.id}
          className="flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4"
        >
          <span className="mt-0.5 text-lg leading-none">{a.icon}</span>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-amber-900">{a.message}</p>
            {a.cta && a.href && (
              <Link
                href={a.href}
                className="mt-1 inline-block text-xs font-medium text-amber-700 underline underline-offset-2 hover:text-amber-900"
              >
                {a.cta} →
              </Link>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
//  5. SalesChart
// ─────────────────────────────────────────────────────────────

type ChartPoint = { label: string; orders: number; revenue: number };

function BarChart({ data }: { data: ChartPoint[] }) {
  const maxRevenue = Math.max(...data.map((d) => d.revenue), 1);
  const maxOrders  = Math.max(...data.map((d) => d.orders),  1);
  const BAR_W = 28;
  const GAP   = 8;
  const H     = 90;
  const totalW = data.length * (BAR_W + GAP) - GAP;

  const pts = data.map((d, i) => ({
    x: i * (BAR_W + GAP) + BAR_W / 2,
    y: H - (d.orders / maxOrders) * H,
  }));
  const linePath = pts.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(" ");

  return (
    <div className="overflow-x-auto">
      <svg viewBox={`0 0 ${totalW} ${H + 24}`} className="w-full" style={{ minWidth: totalW }}>
        {data.map((d, i) => {
          const barH = Math.max((d.revenue / maxRevenue) * H, 2);
          const x = i * (BAR_W + GAP);
          const isLast = i === data.length - 1;
          return (
            <g key={i}>
              <title>{d.label}: {fmtCurrency(d.revenue)} · {d.orders} pedidos</title>
              <rect
                x={x} y={H - barH}
                width={BAR_W} height={barH}
                rx={5}
                fill={isLast ? "#f97316" : "#fde8c4"}
              />
              <text x={x + BAR_W / 2} y={H + 16} textAnchor="middle" fontSize={9} fill="#9ca3af">
                {d.label}
              </text>
            </g>
          );
        })}

        {/* Orders line */}
        <path d={linePath} stroke="#6b7280" strokeWidth={1} fill="none" strokeLinejoin="round" />
        {pts.map((p, i) => (
          <circle key={i} cx={p.x} cy={p.y} r={2} fill="white" stroke="#6b7280" strokeWidth={1} />
        ))}
      </svg>
    </div>
  );
}

function SalesChart() {
  const [view, setView] = useState<"today" | "week">("today");
  const data = view === "today" ? MOCK_CHART_TODAY : MOCK_CHART_WEEK;

  const totalRevenue = data.reduce((s, d) => s + d.revenue, 0);
  const totalOrders  = data.reduce((s, d) => s + d.orders,  0);

  return (
    <Card className="p-5">
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div>
          <SectionTitle>Pedidos &amp; Receita</SectionTitle>
          <div className="mt-1 flex items-baseline gap-3">
            <p className="text-2xl font-bold text-gray-900">{fmtCurrency(totalRevenue)}</p>
            <p className="text-sm text-gray-500">{totalOrders} pedidos</p>
          </div>
        </div>
        <ToggleGroup>
          <ToggleBtn active={view === "today"} onClick={() => setView("today")}>Hoje</ToggleBtn>
          <ToggleBtn active={view === "week"}  onClick={() => setView("week")}>7 dias</ToggleBtn>
        </ToggleGroup>
      </div>

      <BarChart data={data} />

      {/* Legend */}
      <div className="mt-3 flex items-center gap-5 text-xs text-gray-500">
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-2.5 w-2.5 rounded-sm bg-orange-300" />
          Receita
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-px w-5 border-t-2 border-gray-800" />
          Pedidos
        </span>
      </div>
    </Card>
  );
}

// ─────────────────────────────────────────────────────────────
//  6. ProductPerformance
// ─────────────────────────────────────────────────────────────

type ProductRow = { name: string; sales: number; revenue: number };

function ProductPerformance() {
  const [tab, setTab] = useState<"top" | "low">("top");
  const items   = tab === "top" ? MOCK_TOP_ITEMS : MOCK_WORST_ITEMS;
  const maxSales = Math.max(...items.map((i) => i.sales), 1);
  const barColor = tab === "top" ? "bg-orange-400" : "bg-rose-300";

  return (
    <Card className="flex flex-col p-5">
      <div className="mb-4 flex items-center justify-between">
        <SectionTitle>Produtos</SectionTitle>
        <div className="flex overflow-hidden rounded-lg border border-gray-200 text-[11px]">
          <button
            onClick={() => setTab("top")}
            className={`px-2.5 py-1 font-semibold transition-colors ${tab === "top" ? "bg-orange-500 text-white" : "text-gray-500 hover:bg-gray-50"}`}
          >
            🔥 Top
          </button>
          <button
            onClick={() => setTab("low")}
            className={`px-2.5 py-1 font-semibold transition-colors ${tab === "low" ? "bg-rose-500 text-white" : "text-gray-500 hover:bg-gray-50"}`}
          >
            🧊 Baixos
          </button>
        </div>
      </div>

      <ol className="space-y-3">
        {items.map((item, i) => (
          <li key={i} className="flex items-center gap-2">
            <span className="w-4 shrink-0 text-center text-[10px] font-bold text-gray-300">
              {i + 1}
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex items-baseline justify-between gap-2">
                <span className="truncate text-sm font-medium text-gray-800">{item.name}</span>
                <div className="shrink-0 text-right">
                  <span className="text-xs font-semibold text-gray-700">{item.sales}×</span>
                  <span className="ml-1.5 text-xs text-gray-400">{fmtCurrency(item.revenue)}</span>
                </div>
              </div>
              <div className="mt-1.5 h-1 w-full overflow-hidden rounded-full bg-gray-100">
                <div
                  className={`h-full rounded-full transition-all duration-500 ${barColor}`}
                  style={{ width: `${(item.sales / maxSales) * 100}%` }}
                />
              </div>
            </div>
          </li>
        ))}
      </ol>
    </Card>
  );
}

// ─────────────────────────────────────────────────────────────
//  7. CustomerSummary
// ─────────────────────────────────────────────────────────────

function CustomerSummary() {
  const { total, newToday, returningToday } = MOCK_CUSTOMERS;
  const todayTotal  = newToday + returningToday;
  const newPct      = todayTotal > 0 ? Math.round((newToday      / todayTotal) * 100) : 50;
  const returnPct   = todayTotal > 0 ? Math.round((returningToday / todayTotal) * 100) : 50;

  return (
    <Card className="p-5">
      <SectionTitle>Clientes</SectionTitle>

      {/* Total */}
      <div className="mt-3 mb-4 flex items-end gap-2">
        <span className="text-4xl font-bold text-gray-900">{total}</span>
        <span className="mb-1 text-sm text-gray-400">ativos</span>
      </div>

      {/* Rows */}
      <div className="space-y-2.5">
        <div className="flex items-center justify-between text-sm">
          <span className="flex items-center gap-1.5 text-gray-500">
            <span className="h-2 w-2 rounded-full bg-orange-400" />
            Novos hoje
          </span>
          <span className="font-semibold text-gray-900">{newToday}</span>
        </div>
        <div className="flex items-center justify-between text-sm">
          <span className="flex items-center gap-1.5 text-gray-500">
            <span className="h-2 w-2 rounded-full bg-emerald-400" />
            Recorrentes
          </span>
          <span className="font-semibold text-gray-900">{returningToday}</span>
        </div>
      </div>

      {/* Split bar */}
      <div className="mt-4 flex h-2 overflow-hidden rounded-full bg-gray-100">
        <div
          className="h-full bg-orange-400 transition-all duration-500"
          style={{ width: `${newPct}%` }}
        />
        <div className="h-full flex-1 bg-emerald-400" />
      </div>
      <div className="mt-1.5 flex justify-between text-[10px] font-semibold">
        <span className="text-orange-500">Novos {newPct}%</span>
        <span className="text-emerald-600">Retorno {returnPct}%</span>
      </div>
    </Card>
  );
}

// ─────────────────────────────────────────────────────────────
//  8. PaymentMethods
// ─────────────────────────────────────────────────────────────

const PAYMENT_META: Record<string, { icon: string; bar: string }> = {
  "PIX":            { icon: "⚡", bar: "bg-orange-400" },
  "Cartão Crédito": { icon: "💳", bar: "bg-violet-400" },
  "Cartão Débito":  { icon: "💳", bar: "bg-blue-400"   },
  "Dinheiro":       { icon: "💵", bar: "bg-emerald-400" },
};

function PaymentMethods() {
  const sorted      = [...MOCK_PAYMENTS].sort((a, b) => b.amount - a.amount);
  const totalAmount = sorted.reduce((s, d) => s + d.amount, 0);

  return (
    <Card className="p-5">
      <div className="mb-4 flex items-center justify-between">
        <SectionTitle>Pagamentos</SectionTitle>
        <span className="text-sm font-semibold text-gray-800">{fmtCurrency(totalAmount)}</span>
      </div>

      <div className="space-y-3.5">
        {sorted.map((d) => {
          const meta = PAYMENT_META[d.method] ?? { icon: "💰", bar: "bg-gray-400" };
          const pct  = Math.round((d.amount / totalAmount) * 100);
          return (
            <div key={d.method}>
              <div className="mb-1.5 flex items-center justify-between">
                <span className="flex items-center gap-2 text-sm font-medium text-gray-700">
                  <span className="text-base leading-none">{meta.icon}</span>
                  {d.method}
                </span>
                <div className="flex items-center gap-2 text-xs text-gray-500">
                  <span>{d.count} pedidos</span>
                  <span className="font-semibold text-gray-800">{fmtCurrency(d.amount)}</span>
                  <span className="w-7 text-right font-semibold text-gray-400">{pct}%</span>
                </div>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-gray-100">
                <div
                  className={`h-full rounded-full transition-all duration-500 ${meta.bar}`}
                  style={{ width: `${pct}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}

// ─────────────────────────────────────────────────────────────
//  9. OperationSummary
// ─────────────────────────────────────────────────────────────

function OperationSummary() {
  const { preparing, delayed, cancelled, avgPrepTime, cancellationRate } = MOCK_OPERATION;

  const stats: Array<{
    label: string;
    value: string | number;
    sub?: string;
    urgent?: boolean;
  }> = [
    { label: "Preparando",       value: preparing,              sub: "pedidos" },
    { label: "Atrasados",        value: delayed,                sub: "pedidos",    urgent: delayed > 0 },
    { label: "Cancelados",       value: cancelled,              sub: "hoje"  },
    { label: "Tempo médio",      value: `${avgPrepTime} min`,   sub: "de preparo" },
    { label: "Taxa cancelamento", value: `${cancellationRate}%`, sub: "dos pedidos" },
  ];

  return (
    <Card className="p-5">
      <div className="mb-4">
        <SectionTitle>Operação</SectionTitle>
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        {stats.map((s) => (
          <div
            key={s.label}
            className={`rounded-xl p-3 ${s.urgent ? "bg-red-50" : "bg-gray-50"}`}
          >
            <div className="flex items-center gap-1.5">
              {s.urgent && (
                <span className="h-1.5 w-1.5 shrink-0 animate-pulse rounded-full bg-red-500" />
              )}
              <p className={`text-xl font-bold leading-none ${s.urgent ? "text-red-600" : "text-gray-900"}`}>
                {s.value}
              </p>
            </div>
            <p className="mt-1 text-[11px] font-medium text-gray-400">{s.label}</p>
          </div>
        ))}
      </div>
    </Card>
  );
}

// ─────────────────────────────────────────────────────────────
//  10. AIInsightsPanel
// ─────────────────────────────────────────────────────────────

function AIInsightsPanel() {
  const warningCount = MOCK_INSIGHTS.filter((i) => i.type === "warning").length;

  return (
    <Card className="flex h-full flex-col p-5">
      {/* Header */}
      <div className="mb-4 flex items-center justify-between">
        <SectionTitle>Insights IA</SectionTitle>
        {warningCount > 0 && (
          <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-bold text-red-600">
            {warningCount} alertas
          </span>
        )}
      </div>

      {/* Insight rows */}
      <div className="flex flex-col gap-2">
        {MOCK_INSIGHTS.map((ins) => {
          const s = INSIGHT_STYLES[ins.type];
          return (
            <div
              key={ins.id}
              className={`flex items-start gap-3 rounded-xl border-l-4 px-3 py-2.5 ${s.bg} ${s.border}`}
            >
              <span className="mt-0.5 shrink-0 text-base leading-none">{ins.icon}</span>
              <div className="min-w-0 flex-1">
                <p className={`text-sm font-semibold leading-snug ${s.text}`}>
                  {ins.message}
                </p>
                <Link
                  href={ins.href}
                  className={`mt-0.5 inline-block text-xs font-medium hover:underline ${s.link}`}
                >
                  {ins.action} →
                </Link>
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}

// ─────────────────────────────────────────────────────────────
//  10. ActionCenter
// ─────────────────────────────────────────────────────────────

function ActionCenter() {
  return (
    <div>
      <div className="mb-3">
        <SectionTitle>Central de ações</SectionTitle>
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {QUICK_ACTIONS.map((a) => (
          <Link
            key={a.id}
            href={a.href}
            className={`group flex items-center gap-3 rounded-2xl border border-gray-100 bg-white p-4 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md ${a.color.hoverBorder}`}
          >
            <div
              className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-lg ${a.color.iconBg} ${a.color.iconText}`}
            >
              {a.icon}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-gray-800 leading-tight">{a.label}</p>
              <p className="text-xs text-gray-400">{a.desc}</p>
            </div>
            <span className="shrink-0 text-gray-300 transition-transform group-hover:translate-x-0.5">
              →
            </span>
          </Link>
        ))}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
//  Header components
// ─────────────────────────────────────────────────────────────

type StoreState = "open" | "closed" | "peak";

function getStoreState(hour: number): StoreState {
  if (hour < 10 || hour >= 23) return "closed";
  if ((hour >= 11 && hour < 14) || (hour >= 18 && hour < 21)) return "peak";
  return "open";
}

function StoreStatusBadge() {
  const state = getStoreState(new Date().getHours());

  const cfg: Record<StoreState, { dot: string; badge: string; text: string; label: string }> = {
    open:   { dot: "bg-green-500",  badge: "border-green-200 bg-green-50",   text: "text-green-700",  label: "Aberto" },
    closed: { dot: "bg-gray-400",   badge: "border-gray-200 bg-gray-50",     text: "text-gray-500",   label: "Fechado" },
    peak:   { dot: "bg-orange-500", badge: "border-orange-200 bg-orange-50", text: "text-orange-700", label: "Aberto · Pico" },
  };

  const { dot, badge, text, label } = cfg[state];

  return (
    <div className={`flex items-center gap-2 rounded-full border px-3 py-1.5 ${badge}`}>
      <span className={`h-2 w-2 rounded-full ${dot} ${state !== "closed" ? "animate-pulse" : ""}`} />
      <span className={`text-xs font-semibold ${text}`}>{label}</span>
    </div>
  );
}

function TimeFilter({
  period,
  onChange,
}: {
  period: Period;
  onChange: (p: Period) => void;
}) {
  return (
    <div className="flex overflow-x-auto rounded-xl border border-gray-200 bg-white p-1 shadow-sm w-fit gap-1">
      {PERIOD_OPTIONS.map((opt) => (
        <button
          key={opt.id}
          onClick={() => onChange(opt.id)}
          className={`rounded-lg px-4 py-1.5 text-xs font-semibold whitespace-nowrap transition-colors ${
            period === opt.id
              ? "bg-orange-500 text-white shadow-sm"
              : "text-gray-500 hover:bg-gray-100"
          }`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

const PERIOD_HEADLINES: Record<Period, (r: string) => string> = {
  today:     (r) => `Hoje seu restaurante já faturou ${r}`,
  yesterday: (r) => `Ontem você faturou ${r} no total`,
  "7days":   (r) => `Nos últimos 7 dias você faturou ${r}`,
  month:     (r) => `Este mês seu restaurante faturou ${r}`,
  year:      (r) => `Este ano o faturamento chegou a ${r}`,
};

// ─── Greeting (standalone, simple) ───────────────────────────

function GreetingSection({ userName }: { userName: string }) {
  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Bom dia" : hour < 18 ? "Boa tarde" : "Boa noite";
  return (
    <div className="flex items-center justify-between">
      <p className="text-xs font-semibold uppercase tracking-widest text-gray-400">
        {greeting}, {userName}
      </p>
      <StoreStatusBadge />
    </div>
  );
}

// ─── Revenue headline (below time filter) ────────────────────

function RevenueHeadline({ period }: { period: Period }) {
  const revenue      = MOCK_PERIOD_REVENUE[period];
  const revFormatted = fmtCurrency(revenue);
  const headline     = PERIOD_HEADLINES[period]!(revFormatted);
  const [before, after] = headline.split(revFormatted);
  return (
    <h2 className="text-xl font-bold leading-snug text-gray-900 sm:text-2xl">
      {before}
      <span className="text-orange-500">{revFormatted}</span>
      {after}
    </h2>
  );
}

// ─────────────────────────────────────────────────────────────
//  Root export
// ─────────────────────────────────────────────────────────────

export default function DashboardClient({ userName }: { userName: string }) {
  const [period, setPeriod] = useState<Period>("today");

  return (
    <div className="min-h-screen bg-[#F5F5F5]">
      <div className="mx-auto max-w-7xl px-4 py-6 pb-12 sm:px-6 space-y-6">

        {/* ── 1. GREETING ── */}
        <GreetingSection userName={userName} />

        {/* ── 2. BANNERS ── */}
        <BannerSection />

        {/* ── 3. TIME FILTER — below banners ── */}
        <TimeFilter period={period} onChange={setPeriod} />

        {/* ── 4. REVENUE HEADLINE ── */}
        <RevenueHeadline period={period} />

        {/* ── 5. GRID ── */}
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">

          {/* ── KPI CARDS ── */}
          <KPISection period={period} />

          {/* ── MAIN CHART (2 cols) + AI INSIGHTS PANEL (1 col) ── */}
          <div className="lg:col-span-2">
            <SalesChart />
          </div>

          <div className="lg:col-span-1">
            <AIInsightsPanel />
          </div>

          {/* ── PRODUCT PERFORMANCE (1 col) ── */}
          <div className="lg:col-span-1">
            <ProductPerformance />
          </div>

          {/* ── CUSTOMER SUMMARY (1 col) ── */}
          <div className="lg:col-span-1">
            <CustomerSummary />
          </div>

          {/* ── PAYMENT METHODS (1 col) ── */}
          <div className="lg:col-span-1">
            <PaymentMethods />
          </div>

          {/* ── OPERATION SUMMARY (full width) ── */}
          <div className="lg:col-span-3">
            <OperationSummary />
          </div>

          {/* ── ACTION CENTER (full width) ── */}
          <div className="lg:col-span-3">
            <ActionCenter />
          </div>

        </div>
      </div>
    </div>
  );
}
