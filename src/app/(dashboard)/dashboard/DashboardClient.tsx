"use client";

import { useState } from "react";
import Link from "next/link";

// ─────────────────────────────────────────────────────────────
//  Mock data — swap for real API calls when ready
// ─────────────────────────────────────────────────────────────

const MOCK_KPIS = {
  ordersToday: 47,
  revenueToday: 3_842.5,
  avgTicket: 81.76,
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

const BANNERS = [
  {
    id: "combo",
    gradient: "from-indigo-600 to-violet-600",
    icon: "🚀",
    title: "Aumente seu ticket médio com combos",
    subtitle: "Clientes que adicionam bebida gastam em média 23% mais",
    cta: "Ver estratégia",
    href: "/marketing",
  },
  {
    id: "dessert",
    gradient: "from-amber-500 to-orange-500",
    icon: "⚠️",
    title: "Nenhuma sobremesa vendida hoje",
    subtitle: "Ative uma promoção relâmpago para recuperar as vendas",
    cta: "Criar promoção",
    href: "/marketing",
  },
  {
    id: "crm",
    gradient: "from-emerald-500 to-teal-500",
    icon: "💡",
    title: "Recupere clientes inativos com o CRM",
    subtitle: "2 clientes não compram há mais de 30 dias",
    cta: "Ativar CRM",
    href: "/crm",
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
        active ? "bg-indigo-600 text-white" : "text-gray-500 hover:bg-gray-50"
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
    <div className="space-y-2.5">
      {BANNERS.map((b) => (
        <Link
          key={b.id}
          href={b.href}
          className={`flex items-center justify-between gap-4 rounded-2xl bg-gradient-to-r ${b.gradient} p-4 text-white transition-opacity hover:opacity-95`}
        >
          <div className="flex items-center gap-3 min-w-0">
            <span className="shrink-0 text-2xl">{b.icon}</span>
            <div className="min-w-0">
              <p className="font-semibold leading-snug">{b.title}</p>
              <p className="hidden text-sm opacity-80 sm:block">{b.subtitle}</p>
            </div>
          </div>
          <span className="shrink-0 rounded-xl bg-white/20 px-3 py-1.5 text-sm font-medium backdrop-blur-sm hover:bg-white/30">
            {b.cta} →
          </span>
        </Link>
      ))}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
//  2. KPISection
// ─────────────────────────────────────────────────────────────

function KPICard({
  label,
  value,
  icon,
  accent = false,
}: {
  label: string;
  value: string;
  icon: string;
  accent?: boolean;
}) {
  return (
    <div
      className={`rounded-2xl p-6 ${
        accent
          ? "bg-indigo-600 text-white shadow-lg shadow-indigo-200"
          : "border border-gray-100 bg-white shadow-sm"
      }`}
    >
      <div className="mb-3 flex items-center justify-between">
        <span
          className={`text-xs font-semibold uppercase tracking-wide ${
            accent ? "text-indigo-200" : "text-gray-400"
          }`}
        >
          {label}
        </span>
        <span className="text-xl">{icon}</span>
      </div>
      <p
        className={`text-3xl font-bold leading-none sm:text-4xl ${
          accent ? "text-white" : "text-gray-900"
        }`}
      >
        {value}
      </p>
    </div>
  );
}

function KPISection() {
  return (
    <>
      <KPICard
        label="Pedidos hoje"
        value={String(MOCK_KPIS.ordersToday)}
        icon="📋"
      />
      <KPICard
        label="Receita hoje"
        value={fmtCurrency(MOCK_KPIS.revenueToday)}
        icon="💰"
        accent
      />
      <KPICard
        label="Ticket médio"
        value={fmtCurrency(MOCK_KPIS.avgTicket)}
        icon="🎯"
      />
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

function BarChart({
  data,
  metric,
}: {
  data: ChartPoint[];
  metric: "orders" | "revenue";
}) {
  const values = data.map((d) => (metric === "revenue" ? d.revenue : d.orders));
  const max = Math.max(...values, 1);
  const BAR_W = 28;
  const GAP = 6;
  const H = 110;
  const totalW = data.length * (BAR_W + GAP) - GAP;

  return (
    <div className="overflow-x-auto">
      <svg
        viewBox={`0 0 ${totalW} ${H + 22}`}
        className="w-full"
        style={{ minWidth: totalW }}
      >
        {data.map((d, i) => {
          const val = metric === "revenue" ? d.revenue : d.orders;
          const barH = Math.max((val / max) * H, 2);
          const x = i * (BAR_W + GAP);
          const y = H - barH;
          const isLast = i === data.length - 1;
          return (
            <g key={i}>
              <title>
                {d.label}: {metric === "revenue" ? fmtCurrency(val) : `${val} pedidos`}
              </title>
              <rect
                x={x}
                y={y}
                width={BAR_W}
                height={barH}
                rx={5}
                fill={isLast ? "#6366f1" : "#a5b4fc"}
              />
              <text
                x={x + BAR_W / 2}
                y={H + 14}
                textAnchor="middle"
                fontSize={9}
                fill="#9ca3af"
              >
                {d.label}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

function SalesChart() {
  const [view, setView] = useState<"today" | "week">("today");
  const [metric, setMetric] = useState<"revenue" | "orders">("revenue");
  const data = view === "today" ? MOCK_CHART_TODAY : MOCK_CHART_WEEK;

  const totalOrders = data.reduce((s, d) => s + d.orders, 0);
  const totalRevenue = data.reduce((s, d) => s + d.revenue, 0);

  return (
    <Card className="p-5">
      <div className="flex flex-wrap items-start justify-between gap-2 mb-4">
        <div>
          <SectionTitle>Vendas</SectionTitle>
          <p className="text-lg font-bold text-gray-900">
            {metric === "revenue"
              ? fmtCurrency(totalRevenue)
              : `${totalOrders} pedidos`}
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <ToggleGroup>
            <ToggleBtn
              active={metric === "revenue"}
              onClick={() => setMetric("revenue")}
            >
              Receita
            </ToggleBtn>
            <ToggleBtn
              active={metric === "orders"}
              onClick={() => setMetric("orders")}
            >
              Pedidos
            </ToggleBtn>
          </ToggleGroup>
          <ToggleGroup>
            <ToggleBtn active={view === "today"} onClick={() => setView("today")}>
              Hoje
            </ToggleBtn>
            <ToggleBtn active={view === "week"} onClick={() => setView("week")}>
              7 dias
            </ToggleBtn>
          </ToggleGroup>
        </div>
      </div>
      <BarChart data={data} metric={metric} />
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
//  Root export
// ─────────────────────────────────────────────────────────────

export default function DashboardClient({ userName }: { userName: string }) {
  const hour = new Date().getHours();
  const greeting =
    hour < 12 ? "Bom dia" : hour < 18 ? "Boa tarde" : "Boa noite";

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="mx-auto max-w-7xl px-4 py-6 pb-12 sm:px-6">
        {/* Greeting */}
        <p className="mb-6 text-sm text-gray-500">
          {greeting},{" "}
          <span className="font-semibold text-gray-900">{userName}</span> —
          aqui está o que está acontecendo agora.
        </p>

        <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
          {/* ── 1. Banners (full width) ── */}
          <div className="lg:col-span-3">
            <BannerSection />
          </div>

          {/* ── 2. KPIs (3 columns) ── */}
          <KPISection />

          {/* ── 3. Live status (full width) ── */}
          <div className="lg:col-span-3">
            <LiveStatus />
          </div>

          {/* ── 4. Alerts (full width) ── */}
          <div className="lg:col-span-3">
            <SectionTitle>Alertas inteligentes</SectionTitle>
            <Alerts />
          </div>

          {/* ── 5. Sales chart (2 cols) ── */}
          <div className="lg:col-span-2">
            <SalesChart />
          </div>

          {/* ── 6. Product performance (1 col) ── */}
          <div className="lg:col-span-1">
            <ProductPerformance />
          </div>

          {/* ── 7. Customer summary (1 col) ── */}
          <div className="lg:col-span-1">
            <CustomerSummary />
          </div>

          {/* ── 8. Payment methods (2 cols) ── */}
          <div className="lg:col-span-2">
            <PaymentMethods />
          </div>
        </div>
      </div>
    </div>
  );
}
