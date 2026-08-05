"use client";

import { useState, useEffect, useCallback } from "react";
import { appendTranscript, useVoiceInput, VoiceButton, VoiceStatus } from "@/components/voice";
import type {
  AnalyticsOverview,
  KpiOverview,
  DailyPoint,
  ProductRow,
  CategoryRow,
  AttachRate,
  TopCustomer,
  SegmentCount,
  TierCount,
  ChannelRow,
  Insight,
  ZeroSalesProduct,
  UpsellRevenue,
  UpsellExample,
} from "@/services/analytics/AnalyticsService";

// ─── Analytics Agent types ────────────────────────────────────────────────────

type InsightSeverity = "GOOD" | "INFO" | "WARNING" | "CRITICAL" | "OPPORTUNITY";

interface AgentInsight {
  id:             string;
  type:           string;
  severity:       InsightSeverity;
  title:          string;
  explanation:    string;
  metric?:        string;
  recommendation: string;
  ctaLabel?:      string;
  ctaTarget?:     string;
}

interface ComparisonPoint {
  current:  number;
  previous: number;
  deltaPct: number;
  trend:    "UP" | "DOWN" | "STABLE";
}

interface PeriodComparison {
  available:          boolean;
  unavailableReason?: string;
  revenue:   ComparisonPoint;
  orders:    ComparisonPoint;
  avgTicket: ComparisonPoint;
}

interface AgentReport {
  summary:     string;
  insights:    AgentInsight[];
  comparison:  PeriodComparison;
  hasData:     boolean;
  dataQuality: "NONE" | "LOW" | "SUFFICIENT";
}

// ─── Diagnosis Engine types (W1) ──────────────────────────────────────────────

interface DiagnosisFinding {
  id:                string;
  title:             string;
  severity:          InsightSeverity;
  metric:            string;
  currentValue:      number;
  previousValue:     number;
  deltaAbs:          number;
  deltaPct:          number;
  likelyCauses:      string[];
  evidence:          string[];
  confidence:        "LOW" | "MEDIUM" | "HIGH";
  recommendedAction: string;
  relatedEntities:   {
    products?:      string[];
    categories?:    string[];
    campaignIds?:   string[];
    channel?:       string;
    paymentMethod?: string;
  };
}

interface DiagnosisAnomaly {
  id:                string;
  severity:          InsightSeverity;
  metric:            string;
  threshold:         string;
  observedValue:     number;
  whyItMatters:      string;
  recommendedAction: string;
}

interface DiagnosisReport {
  period:             { from: string; to: string; label: string };
  comparisonPeriod:   { from: string; to: string; label: string } | null;
  summary:            string;
  findings:           DiagnosisFinding[];
  anomalies:          DiagnosisAnomaly[];
  recommendedActions: string[];
  limitations:        string[];
  dataQuality:        "NONE" | "LOW" | "SUFFICIENT";
  hasComparison:      boolean;
}

// ─── Retention types (W2) ────────────────────────────────────────────────────

interface CohortData {
  cohortMonth:            string;
  newCustomers:           number;
  returned30d:            number;
  returned60d:            number;
  returned90d:            number;
  retention30dPct:        number;
  retention60dPct:        number;
  retention90dPct:        number;
  averageSecondOrderDays: number | null;
  totalRevenue:           number;
  repeatRevenue:          number;
  repeatRevenuePct:       number;
  maturityNote:           string | null;
}

interface RetentionReport {
  period:      { from: string; to: string };
  cohorts:     CohortData[];
  summary:     { avgRetention30d: number; avgRetention60d: number; avgRetention90d: number; bestCohort30d: string | null; worstCohort30d: string | null };
  insights:    string[];
  limitations: string[];
  hasData:     boolean;
}

// ─── Operational Efficiency types (W2) ───────────────────────────────────────

interface Bottleneck {
  stage:          "FULFILLMENT" | "PAYMENT" | "CANCELLATION";
  severity:       "INFO" | "WARNING" | "CRITICAL";
  observedValue:  number;
  threshold:      string;
  affectedOrders: number;
  recommendation: string;
}

interface OperationalEfficiencyReport {
  period:      { from: string; to: string };
  metrics: {
    ordersWithTiming:         number;
    avgFulfillmentMinutes:    number;
    medianFulfillmentMinutes: number;
    p90FulfillmentMinutes:    number;
    delayedOrders:            number;
    delayedRate:              number;
    totalOrders:              number;
    cancelledOrders:          number;
    cancellationRate:         number;
    awaitingPaymentCount:     number;
    awaitingPaymentTotal:     number;
    byType: { type: string; ordersWithTiming: number; avgFulfillmentMinutes: number; delayedOrders: number; delayedRate: number; delayThresholdMinutes: number }[];
  };
  bottlenecks: Bottleneck[];
  insights:    string[];
  limitations: string[];
  hasData:     boolean;
}

// ─── W3 Conversational Agent types ───────────────────────────────────────────

interface AgentMetric {
  label: string;
  value: string | number;
  unit?: string;
}

type AnalyticsIntent =
  | "SALES_OVERVIEW" | "REVENUE_DROP_DIAGNOSIS" | "PRODUCT_PERFORMANCE"
  | "CUSTOMER_RETENTION" | "OPERATIONAL_EFFICIENCY" | "CAMPAIGN_PERFORMANCE"
  | "COUPON_ATTRIBUTION" | "UPSELL_PERFORMANCE" | "CART_RECOVERY"
  | "REVIEW_PERFORMANCE" | "ACTION_RECOMMENDATION" | "UNKNOWN_UNSUPPORTED";

interface AnalyticsAgentAnswer {
  answer:             string;
  summary:            string;
  intent:             AnalyticsIntent;
  confidence:         "LOW" | "MEDIUM" | "HIGH";
  dataSourcesUsed:    string[];
  metrics:            AgentMetric[];
  findings:           string[];
  recommendedActions: string[];
  limitations:        string[];
  followUpQuestions:  string[];
}

// ─── Date helpers ─────────────────────────────────────────────────────────────

function toISO(d: Date) {
  return d.toISOString().slice(0, 10);
}
function addDays(d: Date, n: number) {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}
function today() {
  return new Date(new Date().toLocaleDateString("en-CA"));
}

type Preset = "today" | "yesterday" | "7d" | "30d" | "last_month" | "90d" | "year" | "custom";

const PRESETS: { id: Preset; label: string }[] = [
  { id: "today",     label: "Hoje" },
  { id: "yesterday", label: "Ontem" },
  { id: "7d",        label: "7 dias" },
  { id: "30d",       label: "30 dias" },
  { id: "last_month", label: "Mês anterior" },
  { id: "90d",       label: "90 dias" },
  { id: "year",      label: "12 meses" },
  { id: "custom",    label: "Personalizado" },
];

function presetRange(preset: Preset): { from: string; to: string } {
  const t = today();
  switch (preset) {
    case "today":     return { from: toISO(t),              to: toISO(t) };
    case "yesterday": return { from: toISO(addDays(t, -1)), to: toISO(addDays(t, -1)) };
    case "7d":        return { from: toISO(addDays(t, -6)), to: toISO(t) };
    case "30d":       return { from: toISO(addDays(t,-29)), to: toISO(t) };
    case "last_month": {
      const first = new Date(t.getFullYear(), t.getMonth() - 1, 1);
      const last  = new Date(t.getFullYear(), t.getMonth(), 0); // último dia do mês passado
      return { from: toISO(first), to: toISO(last) };
    }
    case "90d":       return { from: toISO(addDays(t,-89)), to: toISO(t) };
    case "year":      return { from: toISO(addDays(t,-364)), to: toISO(t) };
    default:          return { from: toISO(addDays(t,-29)), to: toISO(t) };
  }
}

// ─── Tab config ───────────────────────────────────────────────────────────────

const TABS = [
  { id: "visao-geral",  label: "Visão Geral"        },
  { id: "analista",     label: "Analista"            },
  { id: "produtos",     label: "Produtos"            },
  { id: "categorias",   label: "Categorias"          },
  { id: "clientes",     label: "Clientes"            },
  { id: "canais",       label: "Canais"              },
  { id: "incremental",  label: "Receita Incremental" },
  { id: "delivery",     label: "Cardápio Delivery"   },
] as const;

type Tab = (typeof TABS)[number]["id"];

// ─── Delivery tab types ───────────────────────────────────────────────────────

interface MenuSourceRow {
  source:         string;
  label:          string;
  visits:         number;
  orders:         number;
  revenue:        number;
  conversionRate: number;
  avgTicket:      number;
}

// ─── TabDelivery ──────────────────────────────────────────────────────────────

function TabDelivery({ restaurantSlug }: { restaurantSlug: string }) {
  const [range,   setRange]   = useState<"today" | "7d" | "30d">("7d");
  const [rows,    setRows]    = useState<MenuSourceRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [copied,  setCopied]  = useState<string | null>(null);

  const SOURCES = [
    { key: "instagram", label: "Instagram",  icon: "📸" },
    { key: "whatsapp",  label: "WhatsApp",   icon: "💬" },
    { key: "google",    label: "Google",     icon: "🔍" },
    { key: "qrcode",    label: "QR Code",    icon: "📷" },
    { key: "crm",       label: "CRM",        icon: "📧" },
    { key: "manual",    label: "Manual",     icon: "✍️"  },
  ];

  const baseUrl = typeof window !== "undefined"
    ? `${window.location.origin}/pedido/${restaurantSlug}`
    : `/pedido/${restaurantSlug}`;

  function copyLink(src: string) {
    const url = `${baseUrl}?src=${src}`;
    navigator.clipboard.writeText(url).then(() => {
      setCopied(src);
      setTimeout(() => setCopied(null), 2000);
    });
  }

  const loadData = useCallback(async (r: "today" | "7d" | "30d") => {
    setLoading(true);
    try {
      const res  = await fetch(`/api/analytics/menu-sources?range=${r}`);
      const json = await res.json() as { data?: { rows: MenuSourceRow[] } };
      setRows(json.data?.rows ?? []);
    } catch {
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void loadData(range); }, [range, loadData]);

  const fmt = (n: number) =>
    n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

  const totalVisits  = rows.reduce((s, r) => s + r.visits,  0);
  const totalOrders  = rows.reduce((s, r) => s + r.orders,  0);
  const totalRevenue = rows.reduce((s, r) => s + r.revenue, 0);

  return (
    <div className="space-y-6">

      {/* Header + range selector */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-bold text-ink">Cardápio Delivery — Origem dos acessos</h2>
          <p className="text-xs text-muted mt-0.5">
            Visitas e pedidos por canal de origem
          </p>
        </div>
        <div className="flex gap-1 rounded-lg border border-line2 bg-paper p-0.5">
          {(["today", "7d", "30d"] as const).map((r) => (
            <button
              key={r}
              onClick={() => setRange(r)}
              className={`rounded-md px-3 py-1.5 text-xs font-semibold transition-colors ${
                range === r ? "bg-brand-500 text-white" : "text-muted hover:bg-[#F4F4F2]"
              }`}
            >
              {r === "today" ? "Hoje" : r === "7d" ? "7 dias" : "30 dias"}
            </button>
          ))}
        </div>
      </div>

      {/* Summary KPIs */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: "Visitas",  value: totalVisits.toLocaleString("pt-BR"),        color: "text-blue-700"  },
          { label: "Pedidos",  value: totalOrders.toLocaleString("pt-BR"),        color: "text-brand-700"},
          { label: "Receita",  value: fmt(totalRevenue),                           color: "text-green-700" },
        ].map((kpi) => (
          <div key={kpi.label} className="rounded-xl border border-line bg-paper p-4 shadow-sm">
            <p className="text-xs text-muted font-medium">{kpi.label}</p>
            <p className={`mt-1 text-xl font-bold ${kpi.color}`}>{kpi.value}</p>
          </div>
        ))}
      </div>

      {/* Source breakdown table */}
      <div className="rounded-xl border border-line bg-paper shadow-sm overflow-hidden">
        <div className="border-b border-line px-5 py-3">
          <h3 className="text-xs font-bold uppercase tracking-widest text-muted">Por canal</h3>
        </div>
        {loading ? (
          <div className="py-10 text-center text-sm text-muted">Carregando…</div>
        ) : rows.length === 0 ? (
          <div className="py-10 text-center text-sm text-muted">
            Nenhum dado ainda. Use os links rastreáveis abaixo para começar a monitorar origens.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-line bg-[#FAFAF8]">
                  {["Canal", "Visitas", "Pedidos", "Receita", "Conversão", "Ticket médio"].map((h) => (
                    <th key={h} className="px-4 py-2.5 text-left text-[10px] font-bold uppercase tracking-wider text-muted">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {rows.map((row) => (
                  <tr key={row.source} className="hover:bg-[#FAFAF8] transition-colors">
                    <td className="px-4 py-3 font-semibold text-ink">{row.label}</td>
                    <td className="px-4 py-3 tabular-nums text-ink2">{row.visits.toLocaleString("pt-BR")}</td>
                    <td className="px-4 py-3 tabular-nums text-ink2">{row.orders.toLocaleString("pt-BR")}</td>
                    <td className="px-4 py-3 tabular-nums text-ink2">{fmt(row.revenue)}</td>
                    <td className="px-4 py-3 tabular-nums">
                      <span className={`font-semibold ${row.conversionRate >= 5 ? "text-green-700" : "text-ink2"}`}>
                        {row.conversionRate}%
                      </span>
                    </td>
                    <td className="px-4 py-3 tabular-nums text-ink2">
                      {row.avgTicket > 0 ? fmt(row.avgTicket) : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Link generator */}
      <div className="rounded-xl border border-line bg-paper shadow-sm">
        <div className="border-b border-line px-5 py-3">
          <h3 className="text-sm font-bold text-ink">Links rastreáveis do cardápio</h3>
          <p className="text-xs text-muted mt-0.5">Clique para copiar e cole na bio, stories ou QR Code</p>
        </div>
        <div className="divide-y divide-line">
          {SOURCES.map((src) => {
            const url = `${baseUrl}?src=${src.key}`;
            const isCopied = copied === src.key;
            return (
              <div key={src.key} className="flex items-center gap-3 px-5 py-3">
                <span className="text-base">{src.icon}</span>
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-semibold text-ink2">{src.label}</p>
                  <p className="truncate text-[11px] font-mono text-muted">{url}</p>
                </div>
                <button
                  onClick={() => copyLink(src.key)}
                  className={`shrink-0 rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
                    isCopied
                      ? "bg-green-100 text-green-700"
                      : "bg-[#F4F4F2] text-ink2 hover:bg-line2"
                  }`}
                >
                  {isCopied ? "✓ Copiado!" : "Copiar link"}
                </button>
              </div>
            );
          })}
        </div>
      </div>

    </div>
  );
}

// ─── Formatters ───────────────────────────────────────────────────────────────

function fmtBRL(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}
function fmtPct(v: number) {
  return v.toFixed(1) + "%";
}
function fmtNum(v: number) {
  return v.toLocaleString("pt-BR");
}

// ─── Segment / tier config ────────────────────────────────────────────────────

const SEGMENT_LABEL: Record<string, string> = {
  QUENTE:      "Quente",
  MORNO:       "Morno",
  FRIO:        "Frio",
  SEM_PEDIDOS: "Sem pedidos",
};
const SEGMENT_COLOR: Record<string, string> = {
  QUENTE:      "bg-rose-500",
  MORNO:       "bg-amber-400",
  FRIO:        "bg-sky-400",
  SEM_PEDIDOS: "bg-line2",
};

const TIER_LABEL: Record<string, string> = {
  DIAMANTE: "Diamante",
  OURO:     "Ouro",
  PRATA:    "Prata",
  BRONZE:   "Bronze",
};
const TIER_COLOR: Record<string, string> = {
  DIAMANTE: "bg-cyan-400",
  OURO:     "bg-yellow-400",
  PRATA:    "bg-muted",
  BRONZE:   "bg-brand-400",
};

// ─── Base micro-components ────────────────────────────────────────────────────

function Card({ title, children, className = "" }: {
  title: string; children: React.ReactNode; className?: string;
}) {
  return (
    <div className={`rounded-xl border border-line2 bg-paper p-5 ${className}`}>
      <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-muted">{title}</h2>
      {children}
    </div>
  );
}

function KpiCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-xl border border-line2 bg-paper p-5">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted">{label}</p>
      <p className="mt-1 text-2xl font-bold text-ink">{value}</p>
      {sub && <p className="mt-0.5 text-xs text-muted">{sub}</p>}
    </div>
  );
}

function Empty({ msg = "Sem dados no período", sub }: { msg?: string; sub?: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 py-12 text-center">
      <span className="text-3xl text-line2">📊</span>
      <p className="text-sm text-muted">{msg}</p>
      {sub && <p className="text-xs text-muted max-w-sm">{sub}</p>}
    </div>
  );
}

function Skeleton() {
  return (
    <div className="animate-pulse space-y-3">
      <div className="h-4 w-1/3 rounded bg-[#F4F4F2]" />
      <div className="h-4 w-2/3 rounded bg-[#F4F4F2]" />
      <div className="h-4 w-1/2 rounded bg-[#F4F4F2]" />
    </div>
  );
}

// ─── Source badge ─────────────────────────────────────────────────────────────

function SourceBadge({ source }: { source: "foocci" }) {
  void source;
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-brand-50 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-brand-500">
      📋 Pedidos Foocci
    </span>
  );
}

function FallbackPrompt() {
  return (
    <div className="rounded-lg border border-line2 bg-[#FAFAF8] p-4 text-center">
      <p className="text-xs text-muted">
        Sem dados Foocci neste período.
      </p>
    </div>
  );
}

// ─── Bar chart (pure CSS) ─────────────────────────────────────────────────────

function BarChart({ data, valueKey, labelKey, color = "bg-brand-500", formatValue = fmtBRL }: {
  data: Record<string, number | string>[];
  valueKey: string;
  labelKey: string;
  color?: string;
  formatValue?: (n: number) => string;
}) {
  if (data.length === 0) return <Empty />;
  const max = Math.max(...data.map((d) => Number(d[valueKey] ?? 0)), 1);
  return (
    <div className="space-y-1.5">
      {data.map((row, i) => {
        const val = Number(row[valueKey] ?? 0);
        const pct = (val / max) * 100;
        return (
          <div key={i} className="flex items-center gap-3">
            <span className="w-32 shrink-0 truncate text-right text-xs text-ink2">
              {String(row[labelKey])}
            </span>
            <div className="flex-1 rounded-full bg-[#F4F4F2] h-2.5">
              <div className={`${color} h-2.5 rounded-full transition-all`} style={{ width: `${pct}%` }} />
            </div>
            <span className="w-20 shrink-0 text-right text-xs font-medium text-ink">
              {formatValue(val)}
            </span>
          </div>
        );
      })}
    </div>
  );
}

// ─── Sparkline (SVG) ─────────────────────────────────────────────────────────

function Sparkline({ points, height = 64 }: { points: DailyPoint[]; height?: number }) {
  if (points.length < 2) return <Empty msg="Dados insuficientes para o gráfico" />;
  const width = 640;
  const maxV  = Math.max(...points.map((p) => p.revenue), 1);
  const step  = width / (points.length - 1);
  const coords = points.map((p, i) => ({
    x: i * step,
    y: height - (p.revenue / maxV) * (height - 8) - 4,
  }));
  const path = coords.map((c, i) => `${i === 0 ? "M" : "L"} ${c.x.toFixed(1)} ${c.y.toFixed(1)}`).join(" ");
  const area = `${path} L ${(coords.at(-1)!.x).toFixed(1)} ${height} L 0 ${height} Z`;
  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="w-full" preserveAspectRatio="none">
      <defs>
        <linearGradient id="sparkg" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%"   stopColor="#6366f1" stopOpacity="0.25" />
          <stop offset="100%" stopColor="#6366f1" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={area} fill="url(#sparkg)" />
      <path d={path} fill="none" stroke="#6366f1" strokeWidth="2" />
    </svg>
  );
}

// ─── Stacked bar ──────────────────────────────────────────────────────────────

function StackedBar({ segments, colorMap, labelMap }: {
  segments: { key: string; count: number; share: number }[];
  colorMap: Record<string, string>;
  labelMap: Record<string, string>;
}) {
  const nonZero = segments.filter((s) => s.count > 0);
  if (nonZero.length === 0) return <Empty />;
  return (
    <div className="space-y-3">
      <div className="flex h-4 w-full overflow-hidden rounded-full">
        {nonZero.map((s) => (
          <div
            key={s.key}
            className={`${colorMap[s.key] ?? "bg-line2"} transition-all`}
            style={{ width: `${s.share}%` }}
            title={`${labelMap[s.key] ?? s.key}: ${s.count}`}
          />
        ))}
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-1">
        {nonZero.map((s) => (
          <div key={s.key} className="flex items-center gap-1.5 text-xs text-ink2">
            <span className={`inline-block h-2.5 w-2.5 rounded-full ${colorMap[s.key] ?? "bg-line2"}`} />
            <span>{labelMap[s.key] ?? s.key}</span>
            <span className="font-medium text-ink">{fmtNum(s.count)}</span>
            <span className="text-muted">({fmtPct(s.share)})</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Insight cards ────────────────────────────────────────────────────────────

const INSIGHT_STYLE: Record<string, { bg: string; text: string; icon: string }> = {
  warning: { bg: "bg-amber-50 border-amber-200",  text: "text-amber-800",  icon: "⚠️" },
  success: { bg: "bg-green-50 border-green-200",  text: "text-green-800",  icon: "✅" },
  info:    { bg: "bg-blue-50  border-blue-200",   text: "text-blue-800",   icon: "💡" },
};

function InsightCard({ insight }: { insight: Insight }) {
  const s = INSIGHT_STYLE[insight.type] ?? INSIGHT_STYLE.info!;
  return (
    <div className={`rounded-lg border p-4 ${s.bg}`}>
      <p className={`text-sm ${s.text}`}>
        <span className="mr-2">{s.icon}</span>
        {insight.message}
      </p>
    </div>
  );
}

// ─── W2 panels ────────────────────────────────────────────────────────────────

const SEV_COLOR: Record<string, string> = {
  CRITICAL: "bg-red-100 text-red-800 border-red-200",
  WARNING:  "bg-amber-100 text-amber-800 border-amber-200",
  INFO:     "bg-blue-100 text-blue-800 border-blue-200",
};

function RetentionPanel({ data, loading }: { data: RetentionReport | null; loading: boolean }) {
  if (loading) return <Skeleton />;
  if (!data) return null;

  const { summary, cohorts, insights, limitations } = data;

  return (
    <div className="rounded-xl border border-brand-100 bg-paper p-5 shadow-sm space-y-4">
      <div className="flex items-center gap-2">
        <span className="text-lg">🔄</span>
        <h3 className="text-sm font-bold text-ink">Retenção de clientes</h3>
        {!data.hasData && (
          <span className="ml-auto rounded-full bg-[#F4F4F2] px-2 py-0.5 text-[10px] text-muted">Sem dados</span>
        )}
      </div>

      {/* Summary KPIs */}
      {data.hasData && (
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: "Retorno 30d", val: `${summary.avgRetention30d.toFixed(1)}%` },
            { label: "Retorno 60d", val: `${summary.avgRetention60d.toFixed(1)}%` },
            { label: "Retorno 90d", val: `${summary.avgRetention90d.toFixed(1)}%` },
          ].map((k) => (
            <div key={k.label} className="rounded-xl bg-brand-50 p-3 text-center">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-brand-500">{k.label}</p>
              <p className="mt-0.5 text-xl font-bold text-brand-700">{k.val}</p>
            </div>
          ))}
        </div>
      )}

      {/* Cohort table */}
      {cohorts.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b text-left text-muted">
                <th className="pb-1.5 pr-3 font-medium">Coorte</th>
                <th className="pb-1.5 pr-3 font-medium text-right">Novos</th>
                <th className="pb-1.5 pr-3 font-medium text-right">30d</th>
                <th className="pb-1.5 pr-3 font-medium text-right">60d</th>
                <th className="pb-1.5 pr-3 font-medium text-right">90d</th>
                <th className="pb-1.5 font-medium text-right">2.º pedido</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {cohorts.map((c) => (
                <tr key={c.cohortMonth}>
                  <td className="py-1.5 pr-3 font-medium text-ink">{c.cohortMonth}</td>
                  <td className="py-1.5 pr-3 text-right text-ink2">{c.newCustomers}</td>
                  <td className="py-1.5 pr-3 text-right text-ink">{c.retention30dPct.toFixed(1)}%</td>
                  <td className="py-1.5 pr-3 text-right text-ink2">{c.retention60dPct.toFixed(1)}%</td>
                  <td className="py-1.5 pr-3 text-right text-ink2">{c.retention90dPct.toFixed(1)}%</td>
                  <td className="py-1.5 text-right text-muted">
                    {c.averageSecondOrderDays != null ? `${c.averageSecondOrderDays}d` : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Insights */}
      {insights.length > 0 && (
        <ul className="space-y-1">
          {insights.map((ins, i) => (
            <li key={i} className="text-xs text-brand-600">• {ins}</li>
          ))}
        </ul>
      )}

      {/* Limitations */}
      {limitations.length > 0 && (
        <div className="rounded-lg bg-[#FAFAF8] p-3 space-y-0.5">
          {limitations.map((l, i) => (
            <p key={i} className="text-[10px] text-muted">{l}</p>
          ))}
        </div>
      )}
    </div>
  );
}

function OperationsPanel({ data, loading }: { data: OperationalEfficiencyReport | null; loading: boolean }) {
  if (loading) return <Skeleton />;
  if (!data) return null;

  const { metrics, bottlenecks, insights, limitations } = data;
  const hasTiming = metrics.ordersWithTiming > 0;

  return (
    <div className="rounded-xl border border-teal-100 bg-paper p-5 shadow-sm space-y-4">
      <div className="flex items-center gap-2">
        <span className="text-lg">⚙️</span>
        <h3 className="text-sm font-bold text-ink">Eficiência operacional</h3>
        {!data.hasData && (
          <span className="ml-auto rounded-full bg-[#F4F4F2] px-2 py-0.5 text-[10px] text-muted">Sem dados</span>
        )}
      </div>

      {/* KPI grid */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-xl bg-teal-50 p-3 text-center">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-teal-500">Tempo médio</p>
          <p className="mt-0.5 text-xl font-bold text-teal-800">
            {hasTiming ? `${metrics.avgFulfillmentMinutes}min` : "—"}
          </p>
        </div>
        <div className="rounded-xl bg-teal-50 p-3 text-center">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-teal-500">Mediana</p>
          <p className="mt-0.5 text-xl font-bold text-teal-800">
            {hasTiming ? `${metrics.medianFulfillmentMinutes}min` : "—"}
          </p>
        </div>
        <div className="rounded-xl bg-amber-50 p-3 text-center">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-amber-500">Atrasados</p>
          <p className="mt-0.5 text-xl font-bold text-amber-800">
            {hasTiming ? `${metrics.delayedRate.toFixed(1)}%` : "—"}
          </p>
        </div>
        <div className="rounded-xl bg-rose-50 p-3 text-center">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-rose-500">Cancelamentos</p>
          <p className="mt-0.5 text-xl font-bold text-rose-800">
            {metrics.cancellationRate > 0 ? `${metrics.cancellationRate.toFixed(1)}%` : "—"}
          </p>
        </div>
      </div>

      {/* Awaiting payment */}
      {metrics.awaitingPaymentCount > 0 && (
        <div className="rounded-lg bg-amber-50 border border-amber-100 px-3 py-2 flex items-center gap-2">
          <span className="text-amber-500">⏳</span>
          <p className="text-xs text-amber-800">
            <strong>{metrics.awaitingPaymentCount}</strong> pedidos aguardando pagamento
            {metrics.awaitingPaymentTotal > 0 && ` · ${fmtBRL(metrics.awaitingPaymentTotal)}`}
          </p>
        </div>
      )}

      {/* Bottlenecks */}
      {bottlenecks.length > 0 && (
        <div className="space-y-2">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted">Gargalos identificados</p>
          {bottlenecks.map((bn, i) => (
            <div key={i} className={`rounded-lg border px-3 py-2 text-xs ${SEV_COLOR[bn.severity] ?? SEV_COLOR.INFO}`}>
              <div className="flex items-center justify-between">
                <span className="font-semibold">{bn.stage}</span>
                <span className="text-[10px] font-bold uppercase">{bn.severity}</span>
              </div>
              <p className="mt-0.5 text-[11px]">{bn.recommendation}</p>
            </div>
          ))}
        </div>
      )}

      {/* Insights */}
      {insights.length > 0 && (
        <ul className="space-y-1">
          {insights.map((ins, i) => (
            <li key={i} className="text-xs text-teal-700">• {ins}</li>
          ))}
        </ul>
      )}

      {/* Limitations */}
      {limitations.length > 0 && (
        <div className="rounded-lg bg-[#FAFAF8] p-3 space-y-0.5">
          {limitations.slice(0, 2).map((l, i) => (
            <p key={i} className="text-[10px] text-muted">{l}</p>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Analytics Agent components ───────────────────────────────────────────────

const SEVERITY_STYLE: Record<InsightSeverity, {
  border: string; bg: string; badge: string; badgeText: string; icon: string;
}> = {
  GOOD:        { border: "border-green-200",  bg: "bg-green-50",  badge: "bg-green-100",  badgeText: "text-green-700",  icon: "✅" },
  INFO:        { border: "border-blue-200",   bg: "bg-blue-50",   badge: "bg-blue-100",   badgeText: "text-blue-700",   icon: "💡" },
  WARNING:     { border: "border-amber-200",  bg: "bg-amber-50",  badge: "bg-amber-100",  badgeText: "text-amber-700",  icon: "⚠️" },
  CRITICAL:    { border: "border-red-200",    bg: "bg-red-50",    badge: "bg-red-100",    badgeText: "text-red-700",    icon: "🚨" },
  OPPORTUNITY: { border: "border-brand-200", bg: "bg-brand-50", badge: "bg-brand-100", badgeText: "text-brand-600", icon: "🎯" },
};

const SEVERITY_LABEL: Record<InsightSeverity, string> = {
  GOOD: "Bom", INFO: "Info", WARNING: "Alerta", CRITICAL: "Crítico", OPPORTUNITY: "Oportunidade",
};

function AgentInsightCard({ insight }: { insight: AgentInsight }) {
  const s = SEVERITY_STYLE[insight.severity];
  return (
    <div className={`flex flex-col rounded-xl border p-4 gap-3 ${s.border} ${s.bg}`}>
      <div className="flex items-center justify-between">
        <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${s.badge} ${s.badgeText}`}>
          {SEVERITY_LABEL[insight.severity]}
        </span>
        <span className="text-lg leading-none">{s.icon}</span>
      </div>
      <div>
        <p className="text-sm font-semibold text-ink">{insight.title}</p>
        {insight.metric && (
          <p className="mt-0.5 text-xs font-bold text-muted">{insight.metric}</p>
        )}
      </div>
      <p className="text-xs text-ink2 leading-relaxed">{insight.explanation}</p>
      <p className="text-xs text-muted italic">{insight.recommendation}</p>
      {insight.ctaLabel && insight.ctaTarget && (
        <a
          href={insight.ctaTarget}
          className="mt-auto inline-flex items-center gap-1 rounded-lg bg-brand-500 px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-600 transition-colors w-fit"
        >
          {insight.ctaLabel}
          <span>→</span>
        </a>
      )}
    </div>
  );
}

function ComparisonRow({ comparison }: { comparison: PeriodComparison }) {
  if (!comparison.available) return null;

  const Arrow = ({ trend }: { trend: "UP" | "DOWN" | "STABLE" }) => {
    if (trend === "UP")   return <span className="text-green-600 font-bold">↑</span>;
    if (trend === "DOWN") return <span className="text-red-500  font-bold">↓</span>;
    return <span className="text-muted font-bold">→</span>;
  };

  const DeltaLabel = ({ pt }: { pt: ComparisonPoint }) => {
    const color =
      pt.deltaPct > 2  ? "text-green-600" :
      pt.deltaPct < -2 ? "text-red-500"   :
      "text-muted";
    return (
      <span className={`text-xs font-semibold ${color}`}>
        {pt.deltaPct >= 0 ? "+" : ""}{pt.deltaPct.toFixed(1)}%
      </span>
    );
  };

  return (
    <div className="rounded-xl border border-line2 bg-paper p-4">
      <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted">
        Comparativo com período anterior
      </p>
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: "Receita",      pt: comparison.revenue,   fmt: fmtBRL },
          { label: "Pedidos",      pt: comparison.orders,    fmt: fmtNum },
          { label: "Ticket médio", pt: comparison.avgTicket, fmt: fmtBRL },
        ].map(({ label, pt, fmt }) => (
          <div key={label} className="text-center">
            <p className="text-xs text-muted mb-1">{label}</p>
            <div className="flex items-center justify-center gap-1">
              <Arrow trend={pt.trend} />
              <DeltaLabel pt={pt} />
            </div>
            <p className="mt-0.5 text-[11px] text-muted">
              {fmt(pt.previous)} → <span className="font-semibold text-ink2">{fmt(pt.current)}</span>
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}

function AgentSkeleton() {
  return (
    <div className="animate-pulse space-y-4 py-2">
      <div className="h-4 w-3/4 rounded bg-brand-100" />
      <div className="h-4 w-1/2 rounded bg-brand-100" />
      <div className="grid grid-cols-3 gap-3">
        {[1, 2, 3].map((i) => <div key={i} className="h-32 rounded-xl bg-brand-100" />)}
      </div>
    </div>
  );
}

function QuestionBoxPlaceholder() {
  return (
    <div className="rounded-xl border border-dashed border-brand-200 bg-paper p-4">
      <div className="flex items-center gap-2 mb-2">
        <span className="text-base">💬</span>
        <p className="text-sm font-semibold text-ink2">Pergunte ao Gerente Comercial IA</p>
      </div>
      <div className="flex gap-2">
        <input
          type="text"
          placeholder="Ex: Como vender mais sobremesa?"
          readOnly
          className="flex-1 rounded-lg border border-line2 bg-[#FAFAF8] px-3 py-2 text-xs text-muted cursor-not-allowed"
        />
        <button
          disabled
          className="rounded-lg bg-[#F4F4F2] px-3 py-2 text-xs font-medium text-muted cursor-not-allowed"
        >
          Perguntar
        </button>
      </div>
      <p className="mt-2 text-[11px] text-muted">
        Perguntas ao agente serão conectadas em uma próxima etapa.
      </p>
    </div>
  );
}

// ─── Diagnosis Panel (W1) ─────────────────────────────────────────────────────

const CONFIDENCE_LABEL: Record<string, string> = {
  LOW: "confiança baixa", MEDIUM: "confiança média", HIGH: "confiança alta",
};

function SeverityBadge({ severity }: { severity: InsightSeverity }) {
  const s = SEVERITY_STYLE[severity];
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${s.badge} ${s.badgeText}`}>
      <span>{s.icon}</span>{SEVERITY_LABEL[severity]}
    </span>
  );
}

function DiagnosisFindingCard({ finding }: { finding: DiagnosisFinding }) {
  const s = SEVERITY_STYLE[finding.severity];
  return (
    <div className={`rounded-xl border p-4 space-y-2 ${s.border} ${s.bg}`}>
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-semibold text-ink">{finding.title}</p>
        <SeverityBadge severity={finding.severity} />
      </div>
      {finding.likelyCauses.length > 0 && (
        <ul className="space-y-1">
          {finding.likelyCauses.map((c, i) => (
            <li key={i} className="text-xs text-ink2 leading-relaxed">• {c}</li>
          ))}
        </ul>
      )}
      {finding.evidence.length > 0 && (
        <div className="rounded-lg bg-paper/70 px-2.5 py-1.5">
          {finding.evidence.map((e, i) => (
            <p key={i} className="text-[11px] font-mono text-muted">{e}</p>
          ))}
        </div>
      )}
      <p className="text-xs font-medium text-ink2">→ {finding.recommendedAction}</p>
      <p className="text-[10px] uppercase tracking-wide text-muted">
        {CONFIDENCE_LABEL[finding.confidence] ?? finding.confidence}
      </p>
    </div>
  );
}

function DiagnosisAnomalyRow({ anomaly }: { anomaly: DiagnosisAnomaly }) {
  return (
    <div className="flex items-start gap-3 rounded-lg border border-line bg-paper px-3 py-2.5">
      <SeverityBadge severity={anomaly.severity} />
      <div className="min-w-0 flex-1">
        <p className="text-xs font-semibold text-ink">
          {anomaly.metric} <span className="font-normal text-muted">· {anomaly.threshold}</span>
        </p>
        <p className="text-[11px] text-muted leading-relaxed">{anomaly.whyItMatters}</p>
        <p className="mt-0.5 text-[11px] font-medium text-ink2">→ {anomaly.recommendedAction}</p>
      </div>
    </div>
  );
}

function DiagnosisPanel({ data, loading }: { data: DiagnosisReport | null; loading: boolean }) {
  const topFindings  = data?.findings.slice(0, 3) ?? [];
  const topAnomalies = data?.anomalies.slice(0, 3) ?? [];

  return (
    <div className="rounded-xl border-2 border-rose-100 bg-gradient-to-br from-rose-50/50 to-white p-6 space-y-5">
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-rose-500 text-xl shadow-sm">
          🩺
        </div>
        <div>
          <h2 className="text-base font-bold text-ink">Diagnóstico do período</h2>
          <p className="text-xs text-muted mt-0.5">
            Por que mudou, onde está vazando e qual ação tomar — baseado nos seus dados.
          </p>
        </div>
      </div>

      {loading && <AgentSkeleton />}

      {!loading && !data && (
        <p className="text-sm text-muted">Não foi possível gerar o diagnóstico. Tente novamente.</p>
      )}

      {!loading && data && data.dataQuality === "NONE" && (
        <div className="rounded-xl border border-dashed border-rose-200 bg-paper p-6 text-center">
          <p className="text-2xl mb-2">🩺</p>
          <p className="text-sm text-muted max-w-md mx-auto">{data.summary}</p>
        </div>
      )}

      {!loading && data && data.dataQuality !== "NONE" && (
        <>
          <div className="rounded-xl bg-paper border border-rose-100 p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-rose-400 mb-2">Resumo do diagnóstico</p>
            <p className="text-sm text-ink2 leading-relaxed">{data.summary}</p>
          </div>

          {topFindings.length > 0 ? (
            <div className="space-y-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted px-1">
                Principais achados
              </p>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {topFindings.map((f) => <DiagnosisFindingCard key={f.id} finding={f} />)}
              </div>
            </div>
          ) : (
            <div className="rounded-xl bg-green-50 border border-green-200 p-4 text-center">
              <p className="text-sm text-green-700 font-medium">✅ Nenhum problema relevante diagnosticado no período.</p>
            </div>
          )}

          {topAnomalies.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted px-1">
                Alertas (anomalias)
              </p>
              <div className="space-y-2">
                {topAnomalies.map((a) => <DiagnosisAnomalyRow key={a.id} anomaly={a} />)}
              </div>
            </div>
          )}

          {data.recommendedActions.length > 0 && (
            <div className="rounded-xl bg-paper border border-rose-100 p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-rose-400 mb-2">Ações recomendadas</p>
              <ol className="space-y-1.5">
                {data.recommendedActions.map((a, i) => (
                  <li key={i} className="flex gap-2 text-xs text-ink2">
                    <span className="font-bold text-rose-400">{i + 1}.</span>
                    <span>{a}</span>
                  </li>
                ))}
              </ol>
            </div>
          )}

          {data.limitations.length > 0 && (
            <div className="rounded-lg bg-[#FAFAF8] border border-line px-3 py-2.5">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-muted mb-1">Limitações</p>
              {data.limitations.map((l, i) => (
                <p key={i} className="text-[11px] text-muted leading-relaxed">• {l}</p>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

function AgentPanel({ data, loading }: { data: AgentReport | null; loading: boolean }) {
  return (
    <div className="rounded-xl border-2 border-brand-100 bg-gradient-to-br from-brand-50/60 to-white p-6 space-y-5">
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-500 text-xl shadow-sm">
          🧠
        </div>
        <div>
          <h2 className="text-base font-bold text-ink">Gerente Comercial IA</h2>
          <p className="text-xs text-muted mt-0.5">
            Leitura inteligente dos seus dados para ajudar você a vender mais.
          </p>
        </div>
      </div>

      {loading && <AgentSkeleton />}

      {!loading && !data && (
        <p className="text-sm text-muted">Não foi possível carregar a análise. Tente novamente.</p>
      )}

      {!loading && data && !data.hasData && (
        <div className="rounded-xl border border-dashed border-brand-200 bg-paper p-6 text-center">
          <p className="text-2xl mb-2">📊</p>
          <p className="text-sm text-muted max-w-md mx-auto">{data.summary}</p>
          {data.dataQuality === "NONE" && (
            <p className="mt-2 text-xs text-muted">
              Use <strong>Links Rastreáveis</strong> ou <strong>Importação de Histórico</strong> para começar.
            </p>
          )}
        </div>
      )}

      {!loading && data && data.hasData && (
        <>
          <div className="rounded-xl bg-paper border border-brand-100 p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-brand-400 mb-2">Resumo executivo</p>
            <p className="text-sm text-ink2 leading-relaxed">{data.summary}</p>
          </div>

          {data.comparison.available ? (
            <ComparisonRow comparison={data.comparison} />
          ) : data.comparison.unavailableReason ? (
            <p className="text-xs text-muted italic px-1">{data.comparison.unavailableReason}</p>
          ) : null}

          {data.insights.length > 0 && (
            <div className="space-y-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted px-1">
                Oportunidades e alertas
              </p>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {data.insights.map((ins) => (
                  <AgentInsightCard key={ins.id} insight={ins} />
                ))}
              </div>
            </div>
          )}

          {data.insights.length === 0 && (
            <div className="rounded-xl bg-green-50 border border-green-200 p-4 text-center">
              <p className="text-sm text-green-700 font-medium">✅ Nenhum alerta crítico no período!</p>
              <p className="text-xs text-green-600 mt-1">Seus principais indicadores estão saudáveis.</p>
            </div>
          )}

          <QuestionBoxPlaceholder />
        </>
      )}
    </div>
  );
}

// ─── Foocci Incremental Revenue Card ─────────────────────────────────────────

function UpsellRevenueCard({ upsell, onSeeHistory }: { upsell: UpsellRevenue | undefined; onSeeHistory?: () => void }) {
  const revenue    = upsell?.revenue         ?? 0;
  const share      = upsell?.revenueShare    ?? 0;
  const orders     = upsell?.ordersWithUpsell ?? 0;
  const avgPerOrder = upsell?.avgPerOrder    ?? 0;

  return (
    <div className="rounded-xl border border-emerald-100 bg-emerald-50 p-5">
      <div className="flex items-start gap-3 mb-4">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-emerald-100 text-base select-none">
          ✨
        </div>
        <div>
          <p className="text-sm font-bold text-emerald-900">Receita incremental Foocci</p>
          <p className="text-xs text-emerald-700 mt-0.5">
            Valor estimado de vendas adicionadas após sugestões do Foocci.
          </p>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { label: "Receita adicional",        val: fmtBRL(revenue) },
          { label: "% da receita total",       val: fmtPct(share) },
          { label: "Pedidos com upsell",       val: fmtNum(orders) },
          { label: "Média por pedido",         val: fmtBRL(avgPerOrder) },
        ].map((item) => (
          <div key={item.label} className="rounded-xl bg-paper px-3 py-2.5 shadow-sm">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted">{item.label}</p>
            <p className="mt-0.5 text-base font-bold text-ink">{item.val}</p>
          </div>
        ))}
      </div>
      {revenue === 0 && (
        <p className="mt-3 text-xs text-emerald-700">
          Nenhum upsell convertido neste período. Ative o agente IA para começar a gerar receita incremental.
        </p>
      )}

      {onSeeHistory && orders > 0 && (
        <div className="mt-4 text-center">
          <button
            onClick={onSeeHistory}
            className="rounded-lg border border-emerald-200 bg-paper px-3 py-1.5 text-xs font-semibold text-emerald-800 hover:bg-emerald-100"
          >
            Ver histórico completo →
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Tab: Receita Incremental (histórico completo de upsell) ──────────────────

function TabIncremental({ from, to, upsell }: { from: string; to: string; upsell?: UpsellRevenue }) {
  const [examples, setExamples] = useState<UpsellExample[]>([]);
  const [loading, setLoading]   = useState(true);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/analytics/upsell-history?from=${from}&to=${to}`)
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((j: { data?: { examples?: UpsellExample[] } }) => setExamples(j.data?.examples ?? []))
      .catch(() => setExamples([]))
      .finally(() => setLoading(false));
  }, [from, to]);

  const totalValue = examples.reduce((s, e) => s + e.value, 0);

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-lg font-bold text-ink">Receita incremental — histórico completo</h2>
        <p className="mt-0.5 text-sm text-muted">
          Cada item que o cliente adicionou <strong>após uma sugestão do Foocci</strong>, no período selecionado.
        </p>
      </div>

      <div className="grid grid-cols-3 gap-3">
        {[
          { label: "Itens adicionados",  val: loading ? "…" : fmtNum(examples.length) },
          { label: "Receita adicional",  val: loading ? "…" : fmtBRL(upsell?.revenue ?? totalValue) },
          { label: "Pedidos com upsell", val: loading ? "…" : fmtNum(upsell?.ordersWithUpsell ?? 0) },
        ].map((s) => (
          <div key={s.label} className="rounded-xl border border-emerald-100 bg-emerald-50 px-3 py-2.5">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-emerald-600">{s.label}</p>
            <p className="mt-0.5 text-lg font-extrabold text-emerald-700">{s.val}</p>
          </div>
        ))}
      </div>

      {loading ? (
        <div className="space-y-2">
          {[1, 2, 3, 4, 5].map((i) => <div key={i} className="h-12 animate-pulse rounded-lg bg-[#F4F4F2]" />)}
        </div>
      ) : examples.length === 0 ? (
        <div className="rounded-xl border border-line bg-paper p-8 text-center">
          <p className="text-sm font-semibold text-ink">Sem upsell no período</p>
          <p className="mt-1 text-xs text-muted">
            Quando um cliente aceitar uma sugestão do Foocci, o item aparece aqui.
          </p>
        </div>
      ) : (
        <div className="divide-y divide-line rounded-xl border border-line bg-paper">
          {examples.map((ex) => (
            <div key={ex.orderId + ex.itemName + ex.date} className="flex items-center justify-between gap-3 px-4 py-2.5">
              <div className="min-w-0">
                <p className="truncate text-[13px] font-semibold text-ink">
                  {ex.quantity > 1 ? `${ex.quantity}× ` : ""}{ex.itemName}
                </p>
                <p className="text-[10px] text-muted">
                  {ex.customerName ? `${ex.customerName} · ` : ""}
                  {new Date(ex.date).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit" })} · adicionado após sugestão
                </p>
              </div>
              <span className="shrink-0 text-sm font-bold text-emerald-700">+ {fmtBRL(ex.value)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Tab: Visão Geral ─────────────────────────────────────────────────────────

function TabVisaoGeral({
  data, loading, agentData, agentLoading, diagnosisData, diagnosisLoading,
  operationsData, operationsLoading, onSeeUpsellHistory,
}: {
  data: AnalyticsOverview | null;
  loading: boolean;
  agentData: AgentReport | null;
  agentLoading: boolean;
  diagnosisData: DiagnosisReport | null;
  diagnosisLoading: boolean;
  operationsData: OperationalEfficiencyReport | null;
  operationsLoading: boolean;
  onSeeUpsellHistory?: () => void;
}) {
  const kpi            = data?.kpi;
  const hasRealOrders  = (kpi?.orders ?? 0) > 0;

  return (
    <div className="space-y-6">
      {/* Real Foocci KPIs */}
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <SourceBadge source="foocci" />
          {loading && <span className="text-xs text-muted animate-pulse">Carregando…</span>}
        </div>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
          <KpiCard label="Receita"        value={kpi ? fmtBRL(kpi.revenue)         : "—"} />
          <KpiCard label="Pedidos"        value={kpi ? fmtNum(kpi.orders)          : "—"} />
          <KpiCard label="Ticket médio"   value={kpi ? fmtBRL(kpi.avgTicket)       : "—"} />
          <KpiCard label="Novos clientes" value={kpi ? fmtNum(kpi.newCustomers)    : "—"} />
          <KpiCard label="Cancelamentos"  value={kpi ? fmtNum(kpi.cancelledOrders) : "—"}
                   sub={kpi ? fmtPct(kpi.cancellationRate) + " do total" : undefined} />
          <KpiCard label="Cancelamento %" value={kpi ? fmtPct(kpi.cancellationRate) : "—"} />
        </div>
      </div>

      {/* Foocci incremental revenue — shown when there are real orders */}
      {!loading && hasRealOrders && <UpsellRevenueCard upsell={data?.upsellRevenue} onSeeHistory={onSeeUpsellHistory} />}

      {/* Fallback when no real orders */}
      {!loading && !hasRealOrders && (
        <FallbackPrompt />
      )}

      {/* Operational Efficiency — fulfillment timing + delays (W2) */}
      <OperationsPanel data={operationsData} loading={operationsLoading} />

      {/* Diagnosis Engine — period root-cause + anomalies (W1) */}
      <DiagnosisPanel data={diagnosisData} loading={diagnosisLoading} />

      {/* Analytics Agent */}
      <AgentPanel data={agentData} loading={agentLoading} />

      {/* Legacy AnalyticsService insights */}
      {data && data.insights.length > 0 && (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {data.insights.map((ins, i) => <InsightCard key={i} insight={ins} />)}
        </div>
      )}
    </div>
  );
}

// ─── Zero-sales card ─────────────────────────────────────────────────────────

function ZeroSalesCard({ products }: { products: ZeroSalesProduct[] }) {
  if (products.length === 0) return null;
  return (
    <Card title={`Produtos parados no período (${products.length})`}>
      <p className="mb-3 text-xs text-muted">
        Produtos ativos no cardápio sem nenhuma venda no período selecionado. Considere revisar descrição, foto ou preço, ou criar uma promoção.
      </p>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b text-left text-muted">
              <th className="pb-2 pr-4 font-medium">Produto</th>
              <th className="pb-2 pr-4 font-medium">Categoria</th>
              <th className="pb-2 font-medium text-right">Preço</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {products.map((p, i) => (
              <tr key={i}>
                <td className="py-2 pr-4 font-medium text-ink">
                  {p.name}
                  {!p.isAvailable && (
                    <span className="ml-1.5 rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-700">
                      Esgotado
                    </span>
                  )}
                </td>
                <td className="py-2 pr-4 text-muted">{p.category}</td>
                <td className="py-2 text-right text-muted">{fmtBRL(p.price)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

// ─── Tab: Produtos ────────────────────────────────────────────────────────────

function TabProdutos({ data, loading }: {
  data: AnalyticsOverview | null;
  loading: boolean;
}) {
  if (loading) return <Skeleton />;

  const hasReal     = (data?.topProducts.length ?? 0) > 0;

  // ── Real Foocci path ──────────────────────────────────────────────────────
  if (hasReal) {
    const slow = data!.topProducts.length > 5
      ? [...data!.topProducts].sort((a, b) => a.revenue - b.revenue)
          .slice(0, Math.min(10, Math.floor(data!.topProducts.length / 2)))
      : [];
    const zeroSales: ZeroSalesProduct[] = data!.zeroSalesProducts ?? [];

    return (
      <div className="space-y-6">
        <div className="flex items-center gap-2">
          <SourceBadge source="foocci" />
        </div>

        <Card title="Top produtos por receita">
          <BarChart
            data={data!.topProducts as unknown as Record<string, number | string>[]}
            valueKey="revenue"
            labelKey="name"
            color="bg-brand-500"
          />
        </Card>

        <Card title="Tabela completa — produtos">
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b text-left text-muted">
                  <th className="pb-2 pr-4 font-medium">#</th>
                  <th className="pb-2 pr-4 font-medium">Produto</th>
                  <th className="pb-2 pr-4 font-medium">Categoria</th>
                  <th className="pb-2 pr-4 font-medium text-right">Receita</th>
                  <th className="pb-2 pr-4 font-medium text-right">% receita</th>
                  <th className="pb-2 pr-4 font-medium text-right">Qtd</th>
                  <th className="pb-2 font-medium text-right">Pedidos</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {data!.topProducts.map((p, i) => (
                  <tr key={i}>
                    <td className="py-2 pr-4 text-muted">{i + 1}</td>
                    <td className="py-2 pr-4 font-medium text-ink">{p.name}</td>
                    <td className="py-2 pr-4 text-muted">{p.category ?? "—"}</td>
                    <td className="py-2 pr-4 text-right font-medium">{fmtBRL(p.revenue)}</td>
                    <td className="py-2 pr-4 text-right text-muted">{fmtPct(p.share ?? 0)}</td>
                    <td className="py-2 pr-4 text-right text-muted">{fmtNum(p.qty)}</td>
                    <td className="py-2 text-right text-muted">{fmtNum(p.orderCount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>

        {slow.length > 0 && (
          <Card title="Produtos com baixo desempenho no período">
            <p className="mb-3 text-xs text-muted">
              Itens com menor receita no período. Considere promoção ou revisão de preço.
            </p>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b text-left text-muted">
                    <th className="pb-2 pr-4 font-medium">Produto</th>
                    <th className="pb-2 pr-4 font-medium">Categoria</th>
                    <th className="pb-2 pr-4 font-medium text-right">Receita</th>
                    <th className="pb-2 pr-4 font-medium text-right">Qtd</th>
                    <th className="pb-2 font-medium text-right">Pedidos</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {slow.map((p, i) => (
                    <tr key={i}>
                      <td className="py-2 pr-4 font-medium text-ink">{p.name}</td>
                      <td className="py-2 pr-4 text-muted">{p.category ?? "—"}</td>
                      <td className="py-2 pr-4 text-right text-amber-600 font-medium">{fmtBRL(p.revenue)}</td>
                      <td className="py-2 pr-4 text-right text-muted">{fmtNum(p.qty)}</td>
                      <td className="py-2 text-right text-muted">{fmtNum(p.orderCount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        )}

        <ZeroSalesCard products={zeroSales} />
      </div>
    );
  }

  const noSalesZero: ZeroSalesProduct[] = data?.zeroSalesProducts ?? [];
  return (
    <div className="space-y-4">
      <Empty msg="Sem dados de produtos neste período." />
      <FallbackPrompt />
      <ZeroSalesCard products={noSalesZero} />
    </div>
  );
}

// ─── Tab: Categorias ──────────────────────────────────────────────────────────

function TabCategorias({ data, loading }: {
  data: AnalyticsOverview | null;
  loading: boolean;
}) {
  if (loading) return <Skeleton />;

  const hasReal     = (data?.categories.length ?? 0) > 0;

  // ── Real Foocci path ──────────────────────────────────────────────────────
  if (hasReal) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-2">
          <SourceBadge source="foocci" />
        </div>
        <Card title="Desempenho por categoria">
          <div className="space-y-2">
            {data!.categories.map((cat) => (
              <div key={cat.name} className="flex items-center gap-3 text-xs">
                <span className="w-28 shrink-0 truncate text-right text-ink2">{cat.name}</span>
                <div className="flex-1 rounded-full bg-[#F4F4F2] h-2.5">
                  <div className="bg-brand-500 h-2.5 rounded-full" style={{ width: `${cat.share}%` }} />
                </div>
                <span className="w-20 shrink-0 text-right font-medium">{fmtBRL(cat.revenue)}</span>
                <span className="w-12 shrink-0 text-right text-muted">{fmtPct(cat.share)}</span>
              </div>
            ))}
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <Empty msg="Sem dados de categorias neste período." />
      <FallbackPrompt />
    </div>
  );
}

// ─── Tab: Clientes ────────────────────────────────────────────────────────────

function TabClientes({ data, loading, retentionData, retentionLoading }: {
  data: AnalyticsOverview | null;
  loading: boolean;
  retentionData: RetentionReport | null;
  retentionLoading: boolean;
}) {
  const hasRealCustomers = (data?.topCustomers.length ?? 0) > 0;

  return (
    <div className="space-y-6">

      {/* ── Retention cohorts (W2) ────────────────────────────────────────── */}
      <RetentionPanel data={retentionData} loading={retentionLoading} />

      {/* ── Real Foocci top customers ───────────────────────────────────────── */}
      <div className="space-y-2">
        {hasRealCustomers && (
          <div className="flex items-center gap-2">
            <SourceBadge source="foocci" />
          </div>
        )}
        <Card title="Top clientes no período (pedidos Foocci)">
          {loading ? <Skeleton /> : hasRealCustomers ? (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b text-left text-muted">
                    <th className="pb-1.5 pr-3 font-medium">Nome</th>
                    <th className="pb-1.5 pr-3 font-medium text-right">Gasto</th>
                    <th className="pb-1.5 pr-3 font-medium text-right">Pedidos</th>
                    <th className="pb-1.5 font-medium">Tier</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {data!.topCustomers.map((c) => (
                    <tr key={c.id}>
                      <td className="py-1.5 pr-3 font-medium text-ink">{c.name}</td>
                      <td className="py-1.5 pr-3 text-right">{fmtBRL(c.totalSpend)}</td>
                      <td className="py-1.5 pr-3 text-right text-muted">{c.totalOrders}</td>
                      <td className="py-1.5">
                        <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold text-white ${TIER_COLOR[c.tier] ?? "bg-line2"}`}>
                          {TIER_LABEL[c.tier] ?? c.tier}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <Empty
              msg={loading ? "Carregando…" : "Sem pedidos Foocci no período."}
            />
          )}
        </Card>
      </div>

      {/* ── Segments + Tiers ────────────────────────────────────────────────── */}
      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="Segmentos CRM (base total)">
          {loading ? <Skeleton /> : data ? (
            <StackedBar
              segments={data.segments.map((s) => ({ key: s.segment, count: s.count, share: s.share }))}
              colorMap={SEGMENT_COLOR}
              labelMap={SEGMENT_LABEL}
            />
          ) : <Empty />}
        </Card>

        <Card title="Tiers de clientes (base total)">
          {loading ? <Skeleton /> : data ? (
            <StackedBar
              segments={data.tiers.map((t) => ({ key: t.tier, count: t.count, share: t.share }))}
              colorMap={TIER_COLOR}
              labelMap={TIER_LABEL}
            />
          ) : <Empty />}
        </Card>
      </div>

      {/* ── Attach rates ────────────────────────────────────────────────────── */}
      <Card title="Taxa de attach (complementos)">
        {loading ? <Skeleton /> : data && data.attachRates.length > 0 ? (
          <div className="grid gap-6 sm:grid-cols-2">
            {data.attachRates.map((ar) => (
              <div key={ar.label} className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="font-medium text-ink2">{ar.label}</span>
                  <span className="text-lg font-bold text-ink">{fmtPct(ar.rate)}</span>
                </div>
                <div className="h-2.5 w-full rounded-full bg-[#F4F4F2]">
                  <div
                    className={`h-2.5 rounded-full transition-all ${ar.rate >= 40 ? "bg-green-500" : ar.rate >= 20 ? "bg-amber-400" : "bg-rose-400"}`}
                    style={{ width: `${Math.min(ar.rate, 100)}%` }}
                  />
                </div>
                <p className="text-xs text-muted">
                  {fmtNum(ar.withCount)} de {fmtNum(ar.total)} pedidos · {fmtBRL(ar.addedRevenue)} em receita
                </p>
              </div>
            ))}
          </div>
        ) : !loading && <Empty />}
      </Card>
    </div>
  );
}

// ─── Tab: Canais ──────────────────────────────────────────────────────────────

function TabCanais({ data, loading }: { data: AnalyticsOverview | null; loading: boolean }) {
  const hasChannels  = (data?.channels.length ?? 0) > 0;
  const hasSalesData = (data?.salesByDay.length ?? 0) > 0;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <SourceBadge source="foocci" />
      </div>

      <Card title="Canais de origem">
        {loading ? <Skeleton /> : hasChannels ? (
          <div className="space-y-2">
            {data!.channels.map((ch) => (
              <div key={ch.source} className="flex items-center gap-3 text-xs">
                <span className="w-24 shrink-0 truncate text-right capitalize text-ink2">{ch.source}</span>
                <div className="flex-1 rounded-full bg-[#F4F4F2] h-2.5">
                  <div className="bg-teal-500 h-2.5 rounded-full" style={{ width: `${ch.share}%` }} />
                </div>
                <span className="w-10 shrink-0 text-right text-muted">{fmtNum(ch.orders)}</span>
                <span className="w-20 shrink-0 text-right font-medium">{fmtBRL(ch.revenue)}</span>
                <span className="w-12 shrink-0 text-right text-muted">{fmtPct(ch.share)}</span>
              </div>
            ))}
          </div>
        ) : (
          <div className="flex flex-col items-center gap-2 py-10 text-center">
            <span className="text-3xl text-line2">🔗</span>
            <p className="text-sm text-muted font-medium">Sem dados de canais ainda</p>
            <p className="text-xs text-muted max-w-sm">
              Os canais serão preenchidos a partir de links rastreáveis, QR Codes e campanhas futuras.
              Configure em <strong>Canais</strong> no menu lateral.
            </p>
          </div>
        )}
      </Card>

      <Card title="Receita por dia">
        {loading ? <Skeleton /> : hasSalesData ? (
          <div className="space-y-3">
            <Sparkline points={data!.salesByDay} height={80} />
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b text-left text-muted">
                    <th className="pb-1.5 pr-4 font-medium">Data</th>
                    <th className="pb-1.5 pr-4 font-medium text-right">Receita</th>
                    <th className="pb-1.5 font-medium text-right">Pedidos</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {[...data!.salesByDay].reverse().slice(0, 14).map((pt) => (
                    <tr key={pt.date}>
                      <td className="py-1 pr-4 text-ink2">{pt.date}</td>
                      <td className="py-1 pr-4 text-right font-medium">{fmtBRL(pt.revenue)}</td>
                      <td className="py-1 text-right text-ink2">{fmtNum(pt.orders)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : (
          <Empty msg="Sem dados de venda por dia no período." />
        )}
      </Card>
    </div>
  );
}

// ─── Tab: Analista (W3 — Conversational Analytics) ───────────────────────────

const QUICK_PROMPTS = [
  "Por que as vendas caíram?",
  "Quais produtos mais venderam?",
  "Os clientes estão voltando?",
  "Como está a operação?",
  "O que devo fazer hoje?",
];

const INTENT_LABELS: Record<AnalyticsIntent, string> = {
  SALES_OVERVIEW:          "Visão de vendas",
  REVENUE_DROP_DIAGNOSIS:  "Diagnóstico de queda",
  PRODUCT_PERFORMANCE:     "Desempenho de produtos",
  CUSTOMER_RETENTION:      "Retenção de clientes",
  OPERATIONAL_EFFICIENCY:  "Eficiência operacional",
  CAMPAIGN_PERFORMANCE:    "Performance de campanhas",
  COUPON_ATTRIBUTION:      "Atribuição de cupons",
  UPSELL_PERFORMANCE:      "Upsell / Attach",
  CART_RECOVERY:           "Recuperação de carrinho",
  REVIEW_PERFORMANCE:      "Avaliações",
  ACTION_RECOMMENDATION:   "Recomendações de ação",
  UNKNOWN_UNSUPPORTED:     "Pergunta não reconhecida",
};

const CONFIDENCE_CONFIG: Record<"LOW" | "MEDIUM" | "HIGH", { label: string; cls: string }> = {
  HIGH:   { label: "Alta confiança",   cls: "bg-green-100 text-green-700"  },
  MEDIUM: { label: "Média confiança",  cls: "bg-amber-100 text-amber-700" },
  LOW:    { label: "Baixa confiança",  cls: "bg-[#F4F4F2] text-ink2"    },
};

function TabAnalista({ from, to }: { from: string; to: string }) {
  const [question,  setQuestion]  = useState("");
  const [loading,   setLoading]   = useState(false);
  const [answer,    setAnswer]    = useState<AnalyticsAgentAnswer | null>(null);
  const [error,     setError]     = useState("");
  const [showRaw,   setShowRaw]   = useState(false);

  // Ditado: a pergunta falada cai no campo; quem pergunta lê e aperta Perguntar.
  const voice = useVoiceInput((t) => setQuestion((prev) => appendTranscript(prev, t)), {
    fileName: "pergunta.webm",
  });

  async function ask(q: string) {
    if (!q.trim() || loading) return;
    setLoading(true);
    setError("");
    setAnswer(null);
    try {
      const res = await fetch("/api/analytics/agent", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ question: q.trim(), from, to }),
      });
      const json = await res.json() as { data?: AnalyticsAgentAnswer; error?: string };
      if (!res.ok || json.error) {
        setError(json.error ?? "Erro ao processar pergunta.");
      } else {
        setAnswer(json.data ?? null);
      }
    } catch {
      setError("Falha de rede. Tente novamente.");
    } finally {
      setLoading(false);
    }
  }

  const conf = answer ? CONFIDENCE_CONFIG[answer.confidence] : null;

  return (
    <div className="space-y-6">
      {/* ── Header ── */}
      <div className="rounded-xl border border-brand-100 bg-brand-50/60 px-5 py-4">
        <p className="text-sm font-semibold text-brand-700">Analista de Dados</p>
        <p className="mt-0.5 text-xs text-brand-500">
          Faça uma pergunta sobre o seu negócio. As respostas são baseadas nos dados reais do período selecionado — sem invenções.
        </p>
      </div>

      {/* ── Quick prompts ── */}
      <div className="space-y-1.5">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-muted">Perguntas rápidas</p>
        <div className="flex flex-wrap gap-2">
          {QUICK_PROMPTS.map((q) => (
            <button
              key={q}
              type="button"
              disabled={loading}
              onClick={() => { setQuestion(q); void ask(q); }}
              className="rounded-full border border-brand-200 bg-paper px-3 py-1.5 text-xs text-brand-600 hover:bg-brand-50 disabled:opacity-50 transition-colors"
            >
              {q}
            </button>
          ))}
        </div>
      </div>

      {/* ── Input ── */}
      <div>
        <div className="flex gap-2">
          <div className="flex min-w-0 flex-1 items-center gap-1 rounded-xl border border-line2 bg-paper pl-2.5 pr-1.5 transition-colors focus-within:border-brand-400 focus-within:ring-2 focus-within:ring-brand-100">
            <input
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") void ask(question); }}
              placeholder="Digite ou fale sua pergunta"
              disabled={loading}
              className="min-w-0 flex-1 border-0 bg-transparent px-1.5 py-2.5 text-sm text-ink placeholder:text-muted focus:outline-none focus:!ring-0 disabled:opacity-60"
            />
            <VoiceButton voice={voice} label="Ditar a pergunta por voz" disabled={loading} />
          </div>
          <button
            type="button"
            disabled={loading || !question.trim()}
            onClick={() => void ask(question)}
            className="shrink-0 rounded-xl bg-brand-500 px-5 py-2.5 text-sm font-semibold text-white hover:bg-brand-600 disabled:opacity-50 transition-colors"
          >
            {loading ? (
              <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
            ) : "Perguntar"}
          </button>
        </div>
        <VoiceStatus voice={voice} />
      </div>

      {/* ── Error ── */}
      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* ── Answer card ── */}
      {answer && (
        <div className="rounded-xl border border-line2 bg-paper shadow-sm divide-y divide-line">

          {/* Intent + confidence header */}
          <div className="flex flex-wrap items-center gap-2 px-5 py-3">
            <span className="rounded-full bg-brand-100 px-2.5 py-0.5 text-[11px] font-semibold text-brand-600">
              {INTENT_LABELS[answer.intent] ?? answer.intent}
            </span>
            {conf && (
              <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${conf.cls}`}>
                {conf.label}
              </span>
            )}
            {answer.dataSourcesUsed.length > 0 && (
              <span className="ml-auto text-[10px] text-muted">
                Fontes: {answer.dataSourcesUsed.join(", ")}
              </span>
            )}
          </div>

          {/* Answer text */}
          <div className="px-5 py-4">
            <p className="text-sm leading-relaxed text-ink whitespace-pre-line">{answer.answer}</p>
          </div>

          {/* Metrics */}
          {answer.metrics.length > 0 && (
            <div className="px-5 py-3">
              <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted">Métricas</p>
              <div className="flex flex-wrap gap-3">
                {answer.metrics.map((m, i) => (
                  <div key={i} className="rounded-lg border border-line bg-[#FAFAF8] px-3 py-2">
                    <p className="text-[10px] text-muted">{m.label}</p>
                    <p className="text-sm font-semibold text-ink">{String(m.value)}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Recommended actions */}
          {answer.recommendedActions.length > 0 && (
            <div className="px-5 py-3">
              <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted">Ações recomendadas</p>
              <ul className="space-y-1.5">
                {answer.recommendedActions.map((a, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm text-ink2">
                    <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-brand-100 text-[10px] font-bold text-brand-500">{i + 1}</span>
                    {a}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Limitations */}
          {answer.limitations.length > 0 && (
            <div className="px-5 py-3 bg-amber-50/60">
              <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-amber-600">Limitações dos dados</p>
              <ul className="space-y-1">
                {answer.limitations.map((l, i) => (
                  <li key={i} className="text-xs text-amber-700">• {l}</li>
                ))}
              </ul>
            </div>
          )}

          {/* Follow-up questions */}
          {answer.followUpQuestions.length > 0 && (
            <div className="px-5 py-3">
              <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted">Perguntas de continuidade</p>
              <div className="flex flex-wrap gap-2">
                {answer.followUpQuestions.map((q) => (
                  <button
                    key={q}
                    type="button"
                    disabled={loading}
                    onClick={() => { setQuestion(q); void ask(q); }}
                    className="rounded-full border border-line2 bg-[#FAFAF8] px-3 py-1 text-xs text-ink2 hover:bg-[#F4F4F2] disabled:opacity-50 transition-colors"
                  >
                    {q}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Raw data toggle (debug) */}
          <div className="px-5 py-2">
            <button
              type="button"
              onClick={() => setShowRaw((v) => !v)}
              className="text-[10px] text-muted hover:text-ink2"
            >
              {showRaw ? "Ocultar detalhes técnicos" : "Ver detalhes técnicos"}
            </button>
            {showRaw && (
              <pre className="mt-2 overflow-x-auto rounded-lg bg-[#FAFAF8] p-3 text-[10px] text-muted">
                {JSON.stringify({ intent: answer.intent, confidence: answer.confidence, dataSourcesUsed: answer.dataSourcesUsed, findings: answer.findings }, null, 2)}
              </pre>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export function AnalyticsClient({ restaurantSlug = "" }: { restaurantSlug?: string }) {
  const [preset, setPreset]   = useState<Preset>("30d");
  const [from, setFrom]       = useState(() => presetRange("30d").from);
  const [to,   setTo]         = useState(() => presetRange("30d").to);
  const [loading, setLoading] = useState(false);
  const [data, setData]       = useState<AnalyticsOverview | null>(null);
  const [error, setError]     = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<Tab>("visao-geral");

  const [agentData,    setAgentData]    = useState<AgentReport | null>(null);
  const [agentLoading, setAgentLoading] = useState(false);

  const [diagnosisData,    setDiagnosisData]    = useState<DiagnosisReport | null>(null);
  const [diagnosisLoading, setDiagnosisLoading] = useState(false);

  const [retentionData,    setRetentionData]    = useState<RetentionReport | null>(null);
  const [retentionLoading, setRetentionLoading] = useState(false);

  const [operationsData,    setOperationsData]    = useState<OperationalEfficiencyReport | null>(null);
  const [operationsLoading, setOperationsLoading] = useState(false);

  const load = useCallback(async (f: string, t: string) => {
    setLoading(true);
    setError(null);
    try {
      const res  = await fetch(`/api/analytics/overview?from=${f}&to=${t}`);
      const json = await res.json() as { data?: AnalyticsOverview; error?: string };
      if (!res.ok || json.error) { setError(json.error ?? "Erro ao carregar"); return; }
      setData(json.data!);
    } catch {
      setError("Falha de rede. Tente novamente.");
    } finally {
      setLoading(false);
    }
  }, []);

  const loadAgent = useCallback(async (f: string, t: string) => {
    setAgentLoading(true);
    try {
      const res  = await fetch(`/api/analytics/agent?from=${f}&to=${t}`);
      const json = await res.json() as { data?: AgentReport; error?: string };
      if (res.ok && json.data) setAgentData(json.data);
      else setAgentData(null);
    } catch {
      setAgentData(null);
    } finally {
      setAgentLoading(false);
    }
  }, []);

  const loadDiagnosis = useCallback(async (f: string, t: string) => {
    setDiagnosisLoading(true);
    try {
      const res  = await fetch(`/api/analytics/diagnosis?from=${f}&to=${t}`);
      const json = await res.json() as { data?: DiagnosisReport; error?: string };
      if (res.ok && json.data) setDiagnosisData(json.data);
      else setDiagnosisData(null);
    } catch {
      setDiagnosisData(null);
    } finally {
      setDiagnosisLoading(false);
    }
  }, []);

  const loadRetention = useCallback(async (f: string, t: string) => {
    setRetentionLoading(true);
    try {
      const res  = await fetch(`/api/analytics/retention?from=${f}&to=${t}`);
      const json = await res.json() as { data?: RetentionReport; error?: string };
      if (res.ok && json.data) setRetentionData(json.data);
      else setRetentionData(null);
    } catch {
      setRetentionData(null);
    } finally {
      setRetentionLoading(false);
    }
  }, []);

  const loadOperations = useCallback(async (f: string, t: string) => {
    setOperationsLoading(true);
    try {
      const res  = await fetch(`/api/analytics/operations?from=${f}&to=${t}`);
      const json = await res.json() as { data?: OperationalEfficiencyReport; error?: string };
      if (res.ok && json.data) setOperationsData(json.data);
      else setOperationsData(null);
    } catch {
      setOperationsData(null);
    } finally {
      setOperationsLoading(false);
    }
  }, []);

  useEffect(() => {
    void load(from, to);
    void loadAgent(from, to);
    void loadDiagnosis(from, to);
    void loadRetention(from, to);
    void loadOperations(from, to);
  }, [from, to, load, loadAgent, loadDiagnosis, loadRetention, loadOperations]);

  function handlePreset(p: Preset) {
    setPreset(p);
    if (p !== "custom") {
      const r = presetRange(p);
      setFrom(r.from);
      setTo(r.to);
    }
  }

  // Source label for the filter area
  const sourceLabel = "Fonte: Pedidos Foocci";

  return (
    <div className="mx-auto max-w-7xl space-y-0 px-4 py-6 sm:px-6">

      {/* ── 1. Tab navigation — FIRST ── */}
      <div className="overflow-x-auto border-b border-line2">
        <div className="flex min-w-max gap-0">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`whitespace-nowrap px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
                activeTab === tab.id
                  ? "border-brand-500 text-brand-500"
                  : "border-transparent text-muted hover:text-ink hover:border-line2"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* ── 2. Date filter bar — SECOND, below tabs ── */}
      <div className="flex flex-wrap items-center gap-3 border-b border-line bg-[#FAFAF8]/60 px-2 py-3">
        <div className="flex flex-wrap gap-1.5">
          {PRESETS.map((p) => (
            <button
              key={p.id}
              onClick={() => handlePreset(p.id)}
              className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                preset === p.id
                  ? "bg-brand-500 text-white"
                  : "bg-paper border border-line2 text-ink2 hover:bg-[#F4F4F2]"
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
        {preset === "custom" && (
          <div className="flex items-center gap-2">
            <input
              type="date"
              value={from}
              max={to}
              onChange={(e) => setFrom(e.target.value)}
              className="rounded-lg border border-line2 px-2 py-1.5 text-xs"
            />
            <span className="text-xs text-muted">até</span>
            <input
              type="date"
              value={to}
              min={from}
              onChange={(e) => setTo(e.target.value)}
              className="rounded-lg border border-line2 px-2 py-1.5 text-xs"
            />
          </div>
        )}
        <div className="ml-auto flex items-center gap-2">
          {loading && <span className="text-xs text-muted animate-pulse">Carregando…</span>}
          <span className="hidden text-[10px] text-muted sm:block">{sourceLabel}</span>
        </div>
      </div>

      {/* ── Error ── */}
      {error && (
        <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* ── 3. Tab content ── */}
      <div className="mt-6">
        {activeTab === "analista" && (
          <TabAnalista from={from} to={to} />
        )}
        {activeTab === "visao-geral" && (
          <TabVisaoGeral
            data={data}
            loading={loading}
            agentData={agentData}
            agentLoading={agentLoading}
            diagnosisData={diagnosisData}
            diagnosisLoading={diagnosisLoading}
            operationsData={operationsData}
            operationsLoading={operationsLoading}
            onSeeUpsellHistory={() => setActiveTab("incremental")}
          />
        )}
        {activeTab === "produtos" && (
          <TabProdutos data={data} loading={loading} />
        )}
        {activeTab === "incremental" && (
          <TabIncremental from={from} to={to} upsell={data?.upsellRevenue} />
        )}
        {activeTab === "categorias" && (
          <TabCategorias data={data} loading={loading} />
        )}
        {activeTab === "clientes" && (
          <TabClientes
            data={data}
            loading={loading}
            retentionData={retentionData}
            retentionLoading={retentionLoading}
          />
        )}
        {activeTab === "canais" && (
          <TabCanais data={data} loading={loading} />
        )}
        {activeTab === "delivery" && (
          <TabDelivery restaurantSlug={restaurantSlug} />
        )}
      </div>
    </div>
  );
}
