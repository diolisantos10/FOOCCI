"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import type { DashboardData } from "./page";

// ── Helpers ────────────────────────────────────────────────────────────────

function fmt(n: number) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    minimumFractionDigits: 2,
  }).format(n);
}

function delta(now: number, prev: number): { label: string; up: boolean | null } {
  if (prev === 0) {
    if (now === 0) return { label: "—", up: null };
    return { label: "+100%", up: true };
  }
  const d = ((now - prev) / prev) * 100;
  return {
    label: (d >= 0 ? "+" : "") + d.toFixed(1) + "%",
    up: d >= 0,
  };
}

const TYPE_LABEL: Record<string, string> = {
  DELIVERY: "Delivery",
  PICKUP: "Retirada",
  DINE_IN: "Mesa / QR",
};

// ── Banner data ────────────────────────────────────────────────────────────

const BANNERS = [
  {
    id: "qr",
    icon: "🌐",
    type: "update" as const,
    message: "Novo: Web Menu disponível! Compartilhe o link QR com seus clientes.",
    cta: "Ver Web Menu",
    href: "/web-menu",
  },
  {
    id: "hours",
    icon: "⏰",
    type: "tip" as const,
    message: "Configure seus horários de funcionamento para exibi-los no cardápio online.",
    cta: "Configurar",
    href: "/settings",
  },
  {
    id: "agent",
    icon: "🤖",
    type: "tip" as const,
    message: "Personalize a mensagem de boas-vindas do seu agente de WhatsApp.",
    cta: "Agente WA",
    href: "/settings/agent",
  },
  {
    id: "upgrade",
    icon: "🚀",
    type: "upgrade" as const,
    message: "Plano Growth desbloqueia campanhas automáticas e relatórios avançados.",
    cta: "Ver planos",
    href: "#",
  },
];

const BANNER_BG: Record<string, string> = {
  update: "bg-indigo-50 border-indigo-200 text-indigo-800",
  tip: "bg-amber-50 border-amber-200 text-amber-800",
  upgrade: "bg-emerald-50 border-emerald-200 text-emerald-800",
};

// ── Sub-components ─────────────────────────────────────────────────────────

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-400">
        {title}
      </h2>
      {children}
    </section>
  );
}

function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`rounded-xl border border-gray-100 bg-white p-4 shadow-sm ${className}`}>
      {children}
    </div>
  );
}

// ── Banner ──────────────────────────────────────────────────────────────────

function TopBanner() {
  const [idx, setIdx] = useState(0);
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());

  useEffect(() => {
    const id = setInterval(() => {
      setIdx((i) => (i + 1) % BANNERS.length);
    }, 6000);
    return () => clearInterval(id);
  }, []);

  const visible = BANNERS.filter((b) => !dismissed.has(b.id));
  if (visible.length === 0) return null;

  const banner = visible[idx % visible.length];
  if (!banner) return null;

  return (
    <div
      className={`flex items-start gap-3 rounded-xl border px-4 py-3 text-sm ${BANNER_BG[banner.type]}`}
    >
      <span className="text-lg leading-none">{banner.icon}</span>
      <p className="flex-1">{banner.message}</p>
      <div className="flex shrink-0 items-center gap-2">
        {banner.href !== "#" && (
          <Link href={banner.href} className="font-medium underline underline-offset-2">
            {banner.cta}
          </Link>
        )}
        <button
          onClick={() => setDismissed((d) => new Set([...d, banner.id]))}
          className="ml-1 opacity-50 hover:opacity-100"
          aria-label="Fechar"
        >
          ✕
        </button>
      </div>
    </div>
  );
}

// ── KPI card ────────────────────────────────────────────────────────────────

function KPICard({
  label,
  value,
  sub,
  deltaLabel,
  deltaUp,
}: {
  label: string;
  value: string;
  sub?: string;
  deltaLabel: string;
  deltaUp: boolean | null;
}) {
  const color =
    deltaUp === null
      ? "text-gray-400"
      : deltaUp
      ? "text-emerald-600"
      : "text-red-500";

  return (
    <Card>
      <p className="text-xs font-medium text-gray-400">{label}</p>
      <p className="mt-1 text-2xl font-bold text-gray-900 leading-tight">{value}</p>
      {sub && <p className="text-xs text-gray-500 mt-0.5">{sub}</p>}
      <p className={`mt-2 text-xs font-semibold ${color}`}>
        {deltaLabel}{" "}
        <span className="font-normal text-gray-400">vs ontem</span>
      </p>
    </Card>
  );
}

// ── Operation pill ──────────────────────────────────────────────────────────

function OpCard({
  label,
  value,
  color,
  icon,
}: {
  label: string;
  value: number;
  color: string;
  icon: string;
}) {
  return (
    <Card className="flex items-center gap-3">
      <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-xl ${color}`}>
        {icon}
      </div>
      <div>
        <p className="text-2xl font-bold text-gray-900">{value}</p>
        <p className="text-xs text-gray-500">{label}</p>
      </div>
    </Card>
  );
}

// ── Hourly bar chart ────────────────────────────────────────────────────────

function HourlyChart({
  data,
  currentHour,
}: {
  data: DashboardData["hourlyOrders"];
  currentHour: number;
}) {
  const max = Math.max(...data.map((d) => d.count), 1);

  return (
    <div>
      <div className="flex items-end gap-px h-24 w-full">
        {data.map((d) => {
          const isPeak = d.count === max && d.count > 0;
          const isFuture = d.hour > currentHour;
          return (
            <div
              key={d.hour}
              className="group relative flex-1 flex flex-col justify-end"
              title={`${String(d.hour).padStart(2, "0")}h — ${d.count} pedido${d.count !== 1 ? "s" : ""}`}
            >
              <div
                className={`rounded-t transition-all duration-300 ${
                  isFuture
                    ? "bg-gray-100"
                    : isPeak
                    ? "bg-indigo-500"
                    : "bg-indigo-200"
                }`}
                style={{ height: `${(d.count / max) * 100}%`, minHeight: d.count > 0 ? 4 : 1 }}
              />
            </div>
          );
        })}
      </div>
      {/* Hour labels — show every 4h */}
      <div className="flex mt-1.5">
        {data.map((d) => (
          <div key={d.hour} className="flex-1 text-center">
            {d.hour % 4 === 0 && (
              <span className="text-[9px] text-gray-400">{String(d.hour).padStart(2, "0")}</span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Product performance tabs ────────────────────────────────────────────────

function ProductPerformance({
  topByQty,
  topByRev,
  zeroSalesCount,
}: {
  topByQty: DashboardData["topByQty"];
  topByRev: DashboardData["topByRev"];
  zeroSalesCount: number;
}) {
  const [tab, setTab] = useState<"qty" | "rev">("qty");
  const items = tab === "qty" ? topByQty : topByRev;

  return (
    <Card>
      <div className="flex items-center justify-between mb-3">
        <p className="text-sm font-semibold text-gray-700">Produtos</p>
        <div className="flex rounded-lg border border-gray-200 overflow-hidden text-xs">
          <button
            onClick={() => setTab("qty")}
            className={`px-3 py-1 ${tab === "qty" ? "bg-indigo-600 text-white" : "text-gray-500 hover:bg-gray-50"}`}
          >
            Mais pedidos
          </button>
          <button
            onClick={() => setTab("rev")}
            className={`px-3 py-1 ${tab === "rev" ? "bg-indigo-600 text-white" : "text-gray-500 hover:bg-gray-50"}`}
          >
            Mais receita
          </button>
        </div>
      </div>

      {items.length === 0 ? (
        <p className="py-4 text-center text-sm text-gray-400">Nenhuma venda hoje ainda.</p>
      ) : (
        <ol className="space-y-2">
          {items.map((item, i) => {
            const first = items[0];
            const barW = tab === "qty"
              ? ((first?.qty ?? 0) > 0 ? (item.qty / (first?.qty ?? 1)) * 100 : 0)
              : ((first?.rev ?? 0) > 0 ? (item.rev / (first?.rev ?? 1)) * 100 : 0);
            return (
              <li key={i} className="flex items-center gap-2 text-sm">
                <span className="w-4 text-center text-xs font-bold text-gray-300">{i + 1}</span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <span className="truncate font-medium text-gray-800">{item.name}</span>
                    <span className="ml-2 shrink-0 text-xs text-gray-500">
                      {tab === "qty" ? `${item.qty}×` : fmt(item.rev)}
                    </span>
                  </div>
                  <div className="mt-1 h-1 w-full rounded-full bg-gray-100">
                    <div
                      className="h-1 rounded-full bg-indigo-400"
                      style={{ width: `${barW}%` }}
                    />
                  </div>
                </div>
              </li>
            );
          })}
        </ol>
      )}

      {zeroSalesCount > 0 && (
        <p className="mt-3 rounded-lg bg-gray-50 px-3 py-2 text-xs text-gray-500">
          {zeroSalesCount} item{zeroSalesCount > 1 ? "ns" : ""} sem vendas hoje
        </p>
      )}
    </Card>
  );
}

// ── Customer behavior ───────────────────────────────────────────────────────

function CustomerBehavior({ customers }: { customers: DashboardData["customers"] }) {
  const { newCustomers, totalCustomers, typeDistribution } = customers;
  const returning = Math.max(0, totalCustomers - newCustomers);
  const total = typeDistribution.reduce((s, d) => s + d.count, 0);

  return (
    <Card>
      <p className="mb-3 text-sm font-semibold text-gray-700">Clientes</p>

      {/* New vs returning */}
      <div className="mb-4">
        <div className="flex items-center justify-between text-xs text-gray-500 mb-1">
          <span>Novos hoje</span>
          <span className="font-semibold text-gray-800">{newCustomers}</span>
        </div>
        <div className="flex items-center justify-between text-xs text-gray-500">
          <span>Base total</span>
          <span className="font-semibold text-gray-800">{returning}</span>
        </div>
        {newCustomers + returning > 0 && (
          <div className="mt-2 flex h-2 overflow-hidden rounded-full bg-gray-100">
            <div
              className="bg-indigo-500"
              style={{
                width: `${(newCustomers / (newCustomers + returning)) * 100}%`,
                minWidth: newCustomers > 0 ? 4 : 0,
              }}
            />
          </div>
        )}
        {newCustomers + returning > 0 && (
          <div className="mt-1 flex justify-between text-[10px] text-gray-400">
            <span>Novos</span>
            <span>Recorrentes</span>
          </div>
        )}
      </div>

      {/* Channel distribution */}
      <p className="mb-2 text-xs font-medium text-gray-500">Canal de pedidos hoje</p>
      {total === 0 ? (
        <p className="text-xs text-gray-400">Nenhum pedido ainda.</p>
      ) : (
        <ul className="space-y-1.5">
          {typeDistribution.map((d) => (
            <li key={d.type} className="flex items-center gap-2 text-xs">
              <span className="w-20 shrink-0 text-gray-600">
                {TYPE_LABEL[d.type] ?? d.type}
              </span>
              <div className="flex-1 h-1.5 rounded-full bg-gray-100 overflow-hidden">
                <div
                  className="h-full rounded-full bg-indigo-400"
                  style={{ width: `${(d.count / total) * 100}%` }}
                />
              </div>
              <span className="w-6 text-right font-medium text-gray-700">{d.count}</span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

// ── Insights ────────────────────────────────────────────────────────────────

function Insights({ insights }: { insights: string[] }) {
  return (
    <ul className="space-y-2">
      {insights.map((text, i) => (
        <li
          key={i}
          className="flex items-start gap-2 rounded-xl border border-gray-100 bg-white px-4 py-3 text-sm text-gray-700 shadow-sm"
        >
          <span className="mt-0.5 text-indigo-400">◆</span>
          {text}
        </li>
      ))}
    </ul>
  );
}

// ── Main client component ───────────────────────────────────────────────────

export default function DashboardClient({
  data,
  userName,
}: {
  data: DashboardData;
  userName: string;
}) {
  const { kpis, operations, topByQty, topByRev, customers, zeroSalesCount, insights, hourlyOrders, currentHour } =
    data;

  const rev = delta(kpis.revToday, kpis.revYesterday);
  const ord = delta(kpis.ordersToday, kpis.ordersYesterday);
  const tkt = delta(kpis.avgTicket, kpis.avgTicketYest);
  const conv =
    kpis.conversionRate !== null
      ? delta(kpis.conversionRate, kpis.convRateYest ?? 0)
      : { label: "—", up: null };

  return (
    <div className="mx-auto max-w-2xl space-y-6 px-4 py-5 pb-10">
      {/* Greeting */}
      <p className="text-sm text-gray-500">
        Bom dia, <span className="font-medium text-gray-800">{userName}</span>. Aqui está o resumo de hoje.
      </p>

      {/* 1. Top communication banner */}
      <TopBanner />

      {/* 2. KPIs */}
      <Section title="Desempenho hoje">
        <div className="grid grid-cols-2 gap-3">
          <KPICard
            label="Receita"
            value={fmt(kpis.revToday)}
            deltaLabel={rev.label}
            deltaUp={rev.up}
          />
          <KPICard
            label="Pedidos"
            value={String(kpis.ordersToday)}
            deltaLabel={ord.label}
            deltaUp={ord.up}
          />
          <KPICard
            label="Ticket médio"
            value={kpis.avgTicket > 0 ? fmt(kpis.avgTicket) : "—"}
            deltaLabel={tkt.label}
            deltaUp={tkt.up}
          />
          <KPICard
            label="Conversão"
            value={
              kpis.conversionRate !== null
                ? kpis.conversionRate.toFixed(0) + "%"
                : "—"
            }
            sub={
              kpis.conversionRate !== null
                ? "pedidos / tentativas"
                : "sem dados suficientes"
            }
            deltaLabel={conv.label}
            deltaUp={conv.up}
          />
        </div>
      </Section>

      {/* 3. Operation status */}
      <Section title="Operação agora">
        <div className="grid grid-cols-3 gap-3">
          <OpCard
            label="Em andamento"
            value={operations.inProgress}
            icon="⏳"
            color="bg-blue-50"
          />
          <OpCard
            label="Concluídos hoje"
            value={operations.completedToday}
            icon="✅"
            color="bg-green-50"
          />
          <OpCard
            label="Atrasados"
            value={operations.delayed}
            icon={operations.delayed > 0 ? "🔴" : "🟢"}
            color={operations.delayed > 0 ? "bg-red-50" : "bg-gray-50"}
          />
        </div>
        {operations.delayed > 0 && (
          <p className="mt-2 text-xs text-red-500 font-medium px-1">
            {operations.delayed} pedido{operations.delayed > 1 ? "s" : ""} aguardam atualização há mais de 45 min.{" "}
            <Link href="/orders" className="underline">Ver pedidos</Link>
          </p>
        )}
      </Section>

      {/* 4 + 5. Products + Customers in 2 columns on wider screens */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {/* 4. Product performance */}
        <ProductPerformance
          topByQty={topByQty}
          topByRev={topByRev}
          zeroSalesCount={zeroSalesCount}
        />

        {/* 5. Customer behavior */}
        <CustomerBehavior customers={customers} />
      </div>

      {/* 6. Insights */}
      <Section title="Oportunidades">
        <Insights insights={insights} />
      </Section>

      {/* 7. Mini chart */}
      <Section title="Pedidos por hora — hoje">
        <Card>
          <HourlyChart data={hourlyOrders} currentHour={currentHour} />
          <p className="mt-3 text-center text-xs text-gray-400">
            Barras azul-escuras = pico de pedidos · cinza = horas futuras
          </p>
        </Card>
      </Section>
    </div>
  );
}
