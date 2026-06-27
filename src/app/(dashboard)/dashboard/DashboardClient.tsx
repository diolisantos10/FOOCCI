"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import type { CockpitReport, CockpitAction } from "@/services/dashboard/DashboardCockpitService";
import { Card, SectionTitle, Stat, Pill, Button, EmptyState } from "@/components/ui";

// ── Types ────────────────────────────────────────────────────────────────────

type PeriodKey = "today" | "yesterday" | "this_week" | "7d" | "current_month" | "30d" | "custom";

interface TopProduct { name: string; quantity: number; revenue: number; imageUrl: string | null; categoryName: string | null }
interface ChartBucket { bucketKey: string; label: string; revenue: number; orders: number }

interface DashboardData {
  period: PeriodKey; periodLabel: string; periodDays: number;
  ordersPeriod: number; revenuePeriod: number; avgTicket: number; ordersPrev: number; revenuePrev: number;
  avgTicketPrev: number; newCustomersPrev: number;
  openOrders: number; totalCustomers: number; newCustomersPeriod: number;
  pipeline: { pending: number; confirmed: number; preparing: number; ready: number; outForDelivery: number };
  delayedCount: number; pendingPaymentsCount: number;
  topProducts: TopProduct[]; chartBuckets: ChartBucket[]; chartBucketsPrev: ChartBucket[];
  prevPeriodLabel: string; granularity: "hour" | "day";
  ordersByType: { DELIVERY: number; PICKUP: number; DINE_IN: number };
  cancelledPeriod: number; ordersBySource: Record<string, number>;
  foocciProof: { upsellRevenue: number; upsellItemCount: number; recoveryTotal: number; recoveryConverted: number; recoveryRate: number | null };
  crmSegments: { quente: number; morno: number; frio: number; semPedidos: number };
}

// ── Utilities ────────────────────────────────────────────────────────────────

const fmtCurrency = (n: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 2 }).format(n);
const fmtNum = (n: number) => new Intl.NumberFormat("pt-BR").format(n);

/** Compact money for chart labels: "1,2k" · "12k" · "340". */
function fmtCompact(n: number): string {
  if (n <= 0) return "";
  if (n >= 10_000) return `${Math.round(n / 1000)}k`;
  if (n >= 1_000)  return `${(n / 1000).toFixed(1).replace(".", ",")}k`;
  return String(Math.round(n));
}

/** % change vs comparison window. Label has no sign (the arrow shows direction). */
function delta(cur: number, prev: number): { label: string; positive: boolean } | null {
  if (prev === 0) return null;
  const pct = ((cur - prev) / prev) * 100;
  return { label: `${Math.abs(pct).toFixed(0)}%`, positive: pct >= 0 };
}

function getGreeting(): string {
  const h = ((new Date().getUTCHours() - 3) + 24) % 24;
  if (h < 12) return "Bom dia";
  if (h < 18) return "Boa tarde";
  return "Boa noite";
}

// ── Period filter ────────────────────────────────────────────────────────────

const PERIOD_OPTIONS: { key: PeriodKey; label: string }[] = [
  { key: "today", label: "Hoje" }, { key: "yesterday", label: "Ontem" },
  { key: "this_week", label: "Esta semana" }, { key: "7d", label: "7 dias" },
  { key: "current_month", label: "Este mês" }, { key: "30d", label: "30 dias" },
];

function PeriodFilter({ period, loading, onChange }: { period: PeriodKey; loading: boolean; onChange: (p: PeriodKey) => void }) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {PERIOD_OPTIONS.map((opt) => (
        <button
          key={opt.key}
          type="button"
          onClick={() => onChange(opt.key)}
          disabled={loading}
          className={`shrink-0 rounded-full px-3 py-1.5 text-[12.5px] font-semibold transition-colors ${
            period === opt.key
              ? "bg-ink text-white"
              : "border border-line2 bg-paper text-ink2 hover:border-brand-300 hover:text-brand-600"
          } ${loading ? "opacity-60" : ""}`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

// ── Sales chart (money on bars · current vs same weekday last week) ────────────

export function SalesChart({ data }: { data: DashboardData }) {
  const cur = data.chartBuckets;
  const prev = data.chartBucketsPrev;
  const maxRev = Math.max(1, ...cur.map((b) => b.revenue), ...prev.map((b) => b.revenue));
  const lastNonZero = cur.reduce((acc, b, i) => (b.revenue > 0 ? i : acc), -1);
  const hourly = data.granularity === "hour";
  const labelStep = hourly ? 3 : cur.length > 16 ? 2 : 1;
  // Only pair bars side-by-side when there is actually a comparison period to
  // show — otherwise (new restaurant, no history) keep clean full-width bars.
  const hasPrev = prev.some((p) => p && p.revenue > 0);

  return (
    <Card className="p-5">
      <SectionTitle meta={`${fmtCurrency(data.revenuePeriod)} · ${data.prevPeriodLabel}`}>Receita no período</SectionTitle>
      <div className="flex h-[168px] items-end gap-[5px] pt-5">
        {cur.map((b, i) => {
          const p = prev[i];
          const curH = b.revenue > 0 ? Math.max(3, Math.round((b.revenue / maxRev) * 132)) : 1;
          const prevH = p && p.revenue > 0 ? Math.max(2, Math.round((p.revenue / maxRev) * 132)) : 0;
          const isNow = i === lastNonZero;
          return (
            <div key={b.bucketKey} className="relative flex flex-1 flex-col items-center justify-end" title={`${b.label}: ${fmtCurrency(b.revenue)} · ${data.prevPeriodLabel.replace("vs. ", "")}: ${p ? fmtCurrency(p.revenue) : "—"}`}>
              {b.revenue > 0 && (
                <span className={`mb-1 text-[8.5px] font-semibold leading-none ${isNow ? "text-brand-600" : "text-muted"}`}>
                  {fmtCompact(b.revenue)}
                </span>
              )}
              {hasPrev ? (
                // Today vs. same weekday last week — two visible bars, never occluded.
                <div className="flex w-full items-end justify-center gap-[2px]">
                  <div
                    className={`w-1/2 max-w-[18px] rounded-[3px] ${isNow ? "bg-brand-500" : "bg-[#1A1814]"}`}
                    style={{ height: curH, opacity: isNow ? 1 : 0.9 }}
                  />
                  <div className="w-1/2 max-w-[12px] rounded-[3px] bg-[#C7C7C1]" style={{ height: prevH }} />
                </div>
              ) : (
                <div
                  className={`w-full rounded-[4px] ${isNow ? "bg-brand-500" : "bg-[#1A1814]"}`}
                  style={{ height: curH, opacity: isNow ? 1 : 0.9 }}
                />
              )}
            </div>
          );
        })}
      </div>
      <div className="mt-2 flex gap-[5px]">
        {cur.map((b, i) => (
          <span key={b.bucketKey} className="flex-1 text-center text-[9.5px] text-muted">{i % labelStep === 0 ? b.label : ""}</span>
        ))}
      </div>
      <div className="mt-3 flex items-center gap-4 text-[11px] text-muted">
        <span className="inline-flex items-center gap-1.5"><i className="inline-block h-2.5 w-2.5 rounded-sm bg-[#1A1814]" /> Atual</span>
        {hasPrev && (
          <span className="inline-flex items-center gap-1.5"><i className="inline-block h-2.5 w-2.5 rounded-sm bg-[#C7C7C1]" /> {data.prevPeriodLabel.replace("vs. ", "")}</span>
        )}
      </div>
    </Card>
  );
}

// ── Operação agora (pipeline — the operational essentials) ─────────────────────

export function OperationNow({ data }: { data: DashboardData }) {
  const cells = [
    { label: "Aguardando", value: data.pipeline.pending },
    { label: "Em preparo", value: data.pipeline.preparing + data.pipeline.confirmed },
    { label: "Prontos", value: data.pipeline.ready },
    { label: "Em entrega", value: data.pipeline.outForDelivery },
  ];
  return (
    <Card className="p-5">
      <SectionTitle meta={`${data.openOrders} ativos`} href="/orders" hrefLabel="Pedidos">Operação agora</SectionTitle>
      {data.openOrders === 0 && data.delayedCount === 0 && data.pendingPaymentsCount === 0 ? (
        <EmptyState icon="✓" title="Nenhum pedido em andamento" sub="Tudo concluído por aqui." />
      ) : (
        <>
          <div className="grid grid-cols-4 gap-2.5">
            {cells.map((c) => (
              <div key={c.label} className="rounded-xl border border-line bg-[#FAFAF8] px-3 py-3 text-center">
                <div className="text-[22px] font-extrabold leading-none tracking-[-.02em] text-ink">{c.value}</div>
                <div className="mt-1.5 text-[11px] font-medium text-muted">{c.label}</div>
              </div>
            ))}
          </div>
          {(data.delayedCount > 0 || data.pendingPaymentsCount > 0) && (
            <div className="mt-3 flex flex-wrap gap-2">
              {data.delayedCount > 0 && <Pill tone="amber">⏱ {data.delayedCount} atrasado{data.delayedCount !== 1 ? "s" : ""}</Pill>}
              {data.pendingPaymentsCount > 0 && <Pill tone="blue">💳 {data.pendingPaymentsCount} aguardando pagamento</Pill>}
            </div>
          )}
        </>
      )}
    </Card>
  );
}

// ── Mais vendidos ──────────────────────────────────────────────────────────────

export function TopSellers({ products }: { products: TopProduct[] }) {
  const max = Math.max(1, ...products.map((p) => p.quantity));
  return (
    <Card className="p-5">
      <SectionTitle meta="top 10 no período">Mais vendidos</SectionTitle>
      {products.length === 0 ? (
        <EmptyState icon="🍽" title="Sem vendas no período" />
      ) : (
        <div className="space-y-2.5">
          {products.map((p, i) => (
            <div key={p.name} className="flex items-center gap-2.5">
              <span className={`w-4 shrink-0 text-center text-[12px] font-bold ${i === 0 ? "text-brand-600" : "text-muted"}`}>{i + 1}</span>
              {p.imageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={p.imageUrl} alt="" className="h-9 w-9 shrink-0 rounded-lg border border-line object-cover" />
              ) : (
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[#F4F4F2] text-[14px]">🍽</div>
              )}
              <div className="min-w-0 flex-1">
                <div className="truncate text-[13px] font-semibold text-ink">{p.name}</div>
                <div className="mt-1 h-[5px] overflow-hidden rounded-[3px] bg-[#F0F0EE]"><i className="block h-full rounded-[3px] bg-brand-500" style={{ width: `${Math.max(8, (p.quantity / max) * 100)}%` }} /></div>
              </div>
              <span className="shrink-0 text-[12.5px] font-bold text-ink2">{p.quantity}</span>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

// ── O que fazer agora (cockpit actions) ────────────────────────────────────────

const ACTION_ICON: Record<string, string> = { RECOVERY: "💬", CRM: "🎁", OPERATIONS: "⚡" };

export function ActionsNow({ actions }: { actions: CockpitAction[] }) {
  return (
    <Card className="p-5">
      <SectionTitle>O que fazer agora</SectionTitle>
      {actions.length === 0 ? (
        <EmptyState icon="✦" title="Tudo em dia" sub="Sem ações pendentes no momento." />
      ) : (
        <div className="space-y-2.5">
          {actions.slice(0, 4).map((a) => (
            <Link key={a.id} href={a.actionHref} className="flex gap-3 rounded-xl border border-line border-l-[3px] border-l-brand-500 p-3.5 transition-colors hover:bg-[#FAFAF8]">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-[15px]">{ACTION_ICON[a.source] ?? "💡"}</span>
              <div className="min-w-0">
                <div className="text-[13.5px] font-semibold text-ink">{a.title}</div>
                <p className="mt-0.5 text-[12.5px] leading-snug text-ink2">{a.description}</p>
              </div>
            </Link>
          ))}
        </div>
      )}
    </Card>
  );
}

// ── Foocci em ação (brand proof + mascote) ─────────────────────────────────────

function FoocciMetric({ label, value, sub, href }: { label: string; value: React.ReactNode; sub?: React.ReactNode; href?: string }) {
  const inner = (
    <>
      <p className="flex items-center gap-1 text-[10.5px] font-semibold uppercase tracking-[.05em] text-muted">
        {label}{href && <span className="text-brand-500">→</span>}
      </p>
      <p className="mt-1.5 text-[22px] font-extrabold leading-none tracking-[-.02em] text-ink">{value}</p>
      {sub && <p className="mt-1.5 text-[11.5px] leading-snug text-ink2">{sub}</p>}
    </>
  );
  const base = "block rounded-xl border border-line bg-paper/70 px-4 py-3.5";
  return href ? (
    <Link href={href} className={`${base} transition-colors hover:border-brand-200 hover:bg-brand-50/50`}>{inner}</Link>
  ) : (
    <div className={base}>{inner}</div>
  );
}

/**
 * "Foocci em ação" — the product's impact, as one card combining what Foocci
 * sells (upsell), what it rescues (abandoned/recovered carts) and the
 * relationship base it nurtures (CRM segments). Header on top, three clickable
 * metrics below — each links to where you act on it.
 */
export function FoocciProof({ proof, crm }: { proof: DashboardData["foocciProof"]; crm: DashboardData["crmSegments"] }) {
  const abandoned = Math.max(0, proof.recoveryTotal - proof.recoveryConverted);
  return (
    <Card className="relative overflow-hidden ring-1 ring-brand-200">
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-brand-50 via-transparent to-transparent" />
      <div className="relative p-5">
        {/* Header — mascot + title */}
        <div className="flex items-center gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/brand/foocci/foocci-mascot-cutout.png" alt="" className="-my-1 w-14 shrink-0" />
          <div className="min-w-0">
            <p className="text-[13px] font-bold uppercase tracking-[.04em] text-brand-600">Foocci em ação</p>
            <p className="mt-0.5 text-[12.5px] leading-snug text-ink2">O que o Foocci faz por você hoje — vende, recupera e cuida da base.</p>
          </div>
        </div>
        {/* Mini-metrics — upsell · carrinhos · CRM, each links somewhere useful */}
        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
          <FoocciMetric
            href="/analytics"
            label="Vendas no upsell"
            value={fmtCurrency(proof.upsellRevenue)}
            sub={`${fmtNum(proof.upsellItemCount)} ${proof.upsellItemCount === 1 ? "item sugerido" : "itens sugeridos"}`}
          />
          <FoocciMetric
            href="/crm"
            label="Carrinhos recuperados"
            value={`${fmtNum(proof.recoveryConverted)}/${fmtNum(proof.recoveryTotal)}`}
            sub={proof.recoveryTotal > 0
              ? `${proof.recoveryRate ?? 0}% recuperados · ${fmtNum(abandoned)} ainda perdidos`
              : "nenhum carrinho abandonado"}
          />
          <FoocciMetric
            href="/crm"
            label="Clientes quentes (CRM)"
            value={fmtNum(crm.quente)}
            sub={`${fmtNum(crm.morno)} mornos · ${fmtNum(crm.frio)} frios`}
          />
        </div>
      </div>
    </Card>
  );
}

// ── Skeleton ───────────────────────────────────────────────────────────────────

function Pulse({ className }: { className: string }) { return <div className={`animate-pulse rounded-2xl bg-[#EFEFEC] ${className}`} />; }
function LoadingSkeleton() {
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">{[0, 1, 2, 3].map((i) => <Pulse key={i} className="h-28" />)}</div>
      <div className="grid gap-5 lg:grid-cols-[1.55fr_1fr]"><Pulse className="h-72" /><Pulse className="h-72" /></div>
    </div>
  );
}

// ── Main ────────────────────────────────────────────────────────────────────────

export default function DashboardClient({ userName }: { userName: string }) {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [dateStr, setDateStr] = useState("");
  const [retryCount, setRetryCount] = useState(0);
  const [period, setPeriod] = useState<PeriodKey>("today");
  const [cockpit, setCockpit] = useState<CockpitReport | null>(null);

  useEffect(() => {
    setDateStr(new Date().toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "long", timeZone: "America/Sao_Paulo" }));
  }, []);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(false);
    async function load() {
      try {
        const res = await fetch(`/api/dashboard?period=${period}`);
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
    const id = period === "today" ? setInterval(() => void load(), 120_000) : null;
    return () => { active = false; if (id) clearInterval(id); };
  }, [period, retryCount]);

  useEffect(() => {
    let active = true;
    if (period !== "today") { setCockpit(null); return; }
    async function loadCockpit() {
      try {
        const res = await fetch("/api/dashboard/cockpit");
        if (!res.ok) return;
        const json = (await res.json()) as { data: CockpitReport };
        if (active) setCockpit(json.data);
      } catch { /* non-critical */ }
    }
    void loadCockpit();
    const id = setInterval(() => void loadCockpit(), 120_000);
    return () => { active = false; clearInterval(id); };
  }, [period, retryCount]);

  // Declutter: only CRITICAL alerts surface prominently; config/setup (webhook,
  // Pix, etc.) collapse into a single discreet link to settings.
  const criticalAlerts = cockpit?.urgentAlerts.filter((a) => a.severity === "CRITICAL") ?? [];
  const setupAlerts = cockpit?.urgentAlerts.filter((a) => a.severity !== "CRITICAL") ?? [];

  const header = (
    <div className="border-b border-line bg-paper/70 px-6 py-5 backdrop-blur md:px-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-[21px] font-bold tracking-[-.02em] text-ink">{getGreeting()}, {userName} 👋</h1>
          {dateStr && <p className="mt-0.5 text-[13px] capitalize text-ink2">{dateStr} · visão em tempo real</p>}
        </div>
        <PeriodFilter period={period} loading={loading} onChange={setPeriod} />
      </div>
    </div>
  );

  return (
    <div className="min-h-full bg-canvas">
      {header}
      <div className="space-y-5 px-6 py-6 md:px-8">
        {/* Critical operational alerts only */}
        {criticalAlerts.map((a) => (
          <Card key={a.id} className="flex items-center gap-3 border-red-200 bg-red-50 p-3.5">
            <span className="text-lg">⚠️</span>
            <div className="min-w-0 flex-1"><p className="text-[13.5px] font-bold text-red-800">{a.title}</p><p className="text-[12.5px] text-red-700">{a.description}</p></div>
            {a.actionHref && <Link href={a.actionHref} className="shrink-0"><Button variant="secondary" className="!py-2 !text-[12.5px]">{a.actionLabel ?? "Resolver"}</Button></Link>}
          </Card>
        ))}

        {loading ? <LoadingSkeleton /> : error || !data ? (
          <EmptyState icon="⚠️" title="Não foi possível carregar o resumo" sub="Tente novamente em instantes." />
        ) : (
          <>
            {/* KPIs */}
            <div>
              <SectionTitle meta={`${data.periodLabel} · ${data.prevPeriodLabel}`}>Saúde do negócio</SectionTitle>
              <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
                <Stat label="Faturamento" value={fmtCurrency(data.revenuePeriod)} change={delta(data.revenuePeriod, data.revenuePrev)} sub={data.revenuePrev > 0 ? `de ${fmtCurrency(data.revenuePrev)}` : undefined} />
                <Stat label="Pedidos" value={fmtNum(data.ordersPeriod)} change={delta(data.ordersPeriod, data.ordersPrev)} sub={data.ordersPrev > 0 ? `de ${fmtNum(data.ordersPrev)}` : undefined} />
                <Stat label="Ticket médio" value={data.ordersPeriod > 0 ? fmtCurrency(data.avgTicket) : "—"} change={delta(data.avgTicket, data.avgTicketPrev)} sub={data.avgTicketPrev > 0 ? `de ${fmtCurrency(data.avgTicketPrev)}` : "por pedido"} />
                <Stat label="Novos clientes" value={fmtNum(data.newCustomersPeriod)} change={delta(data.newCustomersPeriod, data.newCustomersPrev)} sub={data.newCustomersPrev > 0 ? `de ${fmtNum(data.newCustomersPrev)}` : `${fmtNum(data.totalCustomers)} na base`} />
              </div>
            </div>

            {/* Two-column body */}
            <div className="grid gap-5 lg:grid-cols-[1.55fr_1fr] lg:items-start">
              <div className="space-y-5">
                <SalesChart data={data} />
                {/* Foocci em ação — right below the chart, above kitchen status */}
                <FoocciProof proof={data.foocciProof} crm={data.crmSegments} />
                <OperationNow data={data} />
              </div>
              <div className="space-y-5">
                {period === "today" && <ActionsNow actions={cockpit?.recommendedActions ?? []} />}
                <TopSellers products={data.topProducts} />
              </div>
            </div>

            {/* Deep-dive + discreet setup nudge (relocated noise) */}
            <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
              {setupAlerts.length > 0 ? (
                <Link href={setupAlerts[0]?.actionHref ?? "/integracoes"} className="inline-flex items-center gap-2 text-[12.5px] text-muted hover:text-ink2">
                  <span className="h-1.5 w-1.5 rounded-full bg-amber-400" />
                  {setupAlerts.length} ajuste{setupAlerts.length !== 1 ? "s" : ""} de configuração pendente{setupAlerts.length !== 1 ? "s" : ""}
                </Link>
              ) : <span />}
              <Link href="/analytics" className="text-[12.5px] font-semibold text-brand-600 hover:text-brand-700">Ver análise completa →</Link>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
