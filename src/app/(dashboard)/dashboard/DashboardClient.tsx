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
      className={`rounded-2xl p-6 ${
        accent
          ? "bg-orange-500 text-white shadow-lg shadow-orange-200"
          : "border border-gray-100 bg-white shadow-sm"
      }`}
    >
      <p className={`text-xs font-semibold uppercase tracking-wide ${accent ? "text-orange-100" : "text-gray-400"}`}>
        {label}
      </p>
      <p className={`mt-3 text-3xl font-bold leading-none sm:text-4xl ${accent ? "text-white" : "text-gray-900"}`}>
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
  const H     = 150;
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
                fill={isLast ? "#ea580c" : "#fed7aa"}
              />
              <text x={x + BAR_W / 2} y={H + 16} textAnchor="middle" fontSize={9} fill="#9ca3af">
                {d.label}
              </text>
            </g>
          );
        })}

        {/* Orders line */}
        <path d={linePath} stroke="#1f2937" strokeWidth={1.5} fill="none" strokeLinejoin="round" />
        {pts.map((p, i) => (
          <circle key={i} cx={p.x} cy={p.y} r={3} fill="white" stroke="#1f2937" strokeWidth={1.5} />
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

function ProductList({
  items,
  color,
}: {
  items: ProductRow[];
  color: string;
}) {
  const maxSales = Math.max(...items.map((i) => i.sales), 1);

  return (
    <ol className="space-y-3">
      {items.map((item, i) => (
        <li key={i} className="flex items-center gap-2">
          <span className="w-4 shrink-0 text-center text-[10px] font-bold text-gray-300">
            {i + 1}
          </span>
          <div className="flex-1 min-w-0">
            <div className="flex items-baseline justify-between gap-2">
              <span className="truncate text-sm font-medium text-gray-800">
                {item.name}
              </span>
              <div className="shrink-0 text-right">
                <span className="text-xs font-semibold text-gray-700">
                  {item.sales}×
                </span>
                <span className="ml-1.5 text-xs text-gray-400">
                  {fmtCurrency(item.revenue)}
                </span>
              </div>
            </div>
            <div className="mt-1.5 h-1 w-full overflow-hidden rounded-full bg-gray-100">
              <div
                className={`h-full rounded-full ${color}`}
                style={{ width: `${(item.sales / maxSales) * 100}%` }}
              />
            </div>
          </div>
        </li>
      ))}
    </ol>
  );
}

function ProductPerformance() {
  return (
    <Card className="flex flex-col p-5">
      <div className="mb-4">
        <SectionTitle>Produtos</SectionTitle>
      </div>

      <div className="mb-5">
        <div className="mb-3 flex items-center gap-1.5">
          <span>🔥</span>
          <span className="text-sm font-semibold text-gray-800">Mais vendidos</span>
        </div>
        <ProductList items={MOCK_TOP_ITEMS} color="bg-indigo-400" />
      </div>

      <div className="border-t border-gray-100 pt-5">
        <div className="mb-3 flex items-center gap-1.5">
          <span>🧊</span>
          <span className="text-sm font-semibold text-gray-800">
            Menos vendidos
          </span>
        </div>
        <ProductList items={MOCK_WORST_ITEMS} color="bg-rose-300" />
      </div>
    </Card>
  );
}

// ─────────────────────────────────────────────────────────────
//  7. CustomerSummary
// ─────────────────────────────────────────────────────────────

function CustomerSummary() {
  const { total, newToday, returningToday } = MOCK_CUSTOMERS;
  const todayTotal = newToday + returningToday;
  const newPct = todayTotal > 0 ? (newToday / todayTotal) * 100 : 50;

  return (
    <Card className="p-5">
      <SectionTitle>Clientes</SectionTitle>

      {/* Total */}
      <div className="mt-3 mb-5 flex items-end gap-2">
        <span className="text-4xl font-bold text-gray-900">{total}</span>
        <span className="mb-0.5 text-sm text-gray-400">clientes ativos</span>
      </div>

      {/* New vs returning today */}
      <div className="space-y-3">
        <div className="flex justify-between text-sm">
          <span className="text-gray-500">Novos hoje</span>
          <span className="font-semibold text-gray-900">{newToday}</span>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-gray-500">Recorrentes hoje</span>
          <span className="font-semibold text-gray-900">{returningToday}</span>
        </div>

        {/* Split bar */}
        <div className="mt-1 overflow-hidden rounded-full h-2.5 bg-gray-100 flex">
          <div
            className="h-full bg-indigo-500 rounded-l-full transition-all duration-500"
            style={{ width: `${newPct}%` }}
          />
          <div className="h-full flex-1 bg-emerald-400 rounded-r-full" />
        </div>
        <div className="flex justify-between text-[10px] font-medium">
          <span className="text-indigo-500">Novos ({Math.round(newPct)}%)</span>
          <span className="text-emerald-500">
            Recorrentes ({Math.round(100 - newPct)}%)
          </span>
        </div>
      </div>
    </Card>
  );
}

// ─────────────────────────────────────────────────────────────
//  8. PaymentMethods
// ─────────────────────────────────────────────────────────────

const PAYMENT_COLORS = [
  "bg-indigo-500",
  "bg-violet-500",
  "bg-emerald-500",
  "bg-amber-500",
];

function PaymentMethods() {
  const sorted = [...MOCK_PAYMENTS].sort((a, b) => b.amount - a.amount);
  const maxAmount = sorted[0]?.amount ?? 1;
  const totalAmount = sorted.reduce((s, d) => s + d.amount, 0);

  return (
    <Card className="p-5">
      <div className="mb-4 flex items-start justify-between">
        <SectionTitle>Pagamentos</SectionTitle>
        <span className="text-sm font-semibold text-gray-700">
          {fmtCurrency(totalAmount)} total
        </span>
      </div>

      <div className="space-y-4">
        {sorted.map((d, i) => {
          const pct = Math.round((d.amount / totalAmount) * 100);
          return (
            <div key={d.method}>
              <div className="mb-1.5 flex items-center justify-between text-sm">
                <div className="flex items-center gap-2">
                  <span
                    className={`inline-block h-2 w-2 rounded-full ${
                      PAYMENT_COLORS[i] ?? "bg-gray-300"
                    }`}
                  />
                  <span className="font-medium text-gray-800">{d.method}</span>
                </div>
                <div className="flex items-center gap-3 text-xs text-gray-500">
                  <span>{d.count} pedidos</span>
                  <span className="font-semibold text-gray-700">
                    {fmtCurrency(d.amount)}
                  </span>
                  <span className="w-8 text-right text-gray-400">{pct}%</span>
                </div>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-gray-100">
                <div
                  className={`h-full rounded-full ${
                    PAYMENT_COLORS[i] ?? "bg-gray-300"
                  } transition-all duration-500`}
                  style={{ width: `${(d.amount / maxAmount) * 100}%` }}
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
  today:     (r) => `Hoje seu restaurante já faturou ${r} 👇`,
  yesterday: (r) => `Ontem você faturou ${r} no total`,
  "7days":   (r) => `Nos últimos 7 dias você faturou ${r}`,
  month:     (r) => `Este mês seu restaurante faturou ${r}`,
  year:      (r) => `Este ano o faturamento chegou a ${r}`,
};

function DashboardHeader({
  userName,
  period,
  onPeriodChange,
}: {
  userName: string;
  period: Period;
  onPeriodChange: (p: Period) => void;
}) {
  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Bom dia" : hour < 18 ? "Boa tarde" : "Boa noite";

  const revenue = MOCK_PERIOD_REVENUE[period];
  const revFormatted = fmtCurrency(revenue);
  const buildHeadline = PERIOD_HEADLINES[period];
  const headline = buildHeadline(revFormatted);
  // Split headline so the currency figure gets the orange accent
  const [before, after] = headline.split(revFormatted);

  return (
    <div className="flex flex-col gap-4">
      {/* Greeting row */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-gray-400">
            {greeting}, {userName}
          </p>
          <h2 className="mt-1 text-2xl font-bold leading-snug text-gray-900">
            {before}
            <span className="text-orange-500">{revFormatted}</span>
            {after}
          </h2>
        </div>
        <div className="shrink-0 sm:mt-1">
          <StoreStatusBadge />
        </div>
      </div>

      {/* Time filter */}
      <TimeFilter period={period} onChange={onPeriodChange} />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
//  Root export
// ─────────────────────────────────────────────────────────────

export default function DashboardClient({ userName }: { userName: string }) {
  const [period, setPeriod] = useState<Period>("today");

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="mx-auto max-w-7xl px-4 py-6 pb-12 sm:px-6 space-y-5">

        {/* ── HEADER ── */}
        <DashboardHeader
          userName={userName}
          period={period}
          onPeriodChange={setPeriod}
        />

        {/* ── 3-COLUMN GRID ── */}
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">

          {/* ── BANNER CARDS ── */}
          <div className="lg:col-span-3">
            <BannerSection />
          </div>

          {/* ── KPI CARDS ── */}
          <KPISection period={period} />

          {/* ── MAIN CHART (2 cols) + AI INSIGHTS PANEL (1 col) ── */}
          <div className="lg:col-span-2">
            <SalesChart />
          </div>

          <div className="lg:col-span-1">
            {/* TODO Step 3: AI Insights Panel */}
            <div className="rounded-2xl border border-dashed border-gray-300 bg-white p-5 h-full flex flex-col gap-3">
              <p className="text-[11px] font-semibold uppercase tracking-widest text-gray-400">
                Insights IA
              </p>
              <Alerts />
            </div>
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

          {/* ── ACTION CENTER (full width) ── */}
          <div className="lg:col-span-3">
            {/* TODO Step 4: Action Center */}
            <div className="rounded-2xl border border-dashed border-gray-300 bg-white p-5">
              <p className="text-[11px] font-semibold uppercase tracking-widest text-gray-400 mb-3">
                Central de ações
              </p>
              <div className="flex flex-wrap gap-3">
                {["Criar promoção", "Ativar upsell", "Reativar clientes", "Ver pedidos"].map(
                  (label) => (
                    <div
                      key={label}
                      className="rounded-xl border border-gray-200 bg-gray-50 px-5 py-3 text-sm font-medium text-gray-400"
                    >
                      {label}
                    </div>
                  )
                )}
              </div>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}
