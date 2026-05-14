"use client";

import { useState, useEffect, useCallback } from "react";
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
  ImportedBaseline,
} from "@/services/analytics/AnalyticsService";

// ─── Analytics Agent types ────────────────────────────────────────────────────
// Mirrors AnalyticsInsightService — defined here to avoid bundling server code.

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
  return new Date(new Date().toLocaleDateString("en-CA")); // YYYY-MM-DD local
}

type Preset = "today" | "yesterday" | "7d" | "30d" | "90d" | "year" | "all" | "custom";

const PRESETS: { id: Preset; label: string }[] = [
  { id: "today",     label: "Hoje" },
  { id: "yesterday", label: "Ontem" },
  { id: "7d",        label: "7 dias" },
  { id: "30d",       label: "30 dias" },
  { id: "90d",       label: "90 dias" },
  { id: "year",      label: "12 meses" },
  { id: "all",       label: "Todo histórico" },
  { id: "custom",    label: "Personalizado" },
];

function presetRange(preset: Preset): { from: string; to: string } {
  const t = today();
  switch (preset) {
    case "today":     return { from: toISO(t),              to: toISO(t) };
    case "yesterday": return { from: toISO(addDays(t, -1)), to: toISO(addDays(t, -1)) };
    case "7d":        return { from: toISO(addDays(t, -6)), to: toISO(t) };
    case "30d":       return { from: toISO(addDays(t,-29)), to: toISO(t) };
    case "90d":       return { from: toISO(addDays(t,-89)), to: toISO(t) };
    case "year":      return { from: toISO(addDays(t,-364)), to: toISO(t) };
    case "all":       return { from: "2000-01-01",           to: toISO(t) };
    default:          return { from: toISO(addDays(t,-29)), to: toISO(t) };
  }
}

// ─── Tab config ───────────────────────────────────────────────────────────────

const TABS = [
  { id: "visao-geral",  label: "Visão Geral"        },
  { id: "produtos",     label: "Produtos"            },
  { id: "categorias",   label: "Categorias"          },
  { id: "clientes",     label: "Clientes"            },
  { id: "canais",       label: "Canais"              },
  { id: "historico",    label: "Histórico Importado" },
] as const;

type Tab = (typeof TABS)[number]["id"];

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
  SEM_PEDIDOS: "bg-gray-300",
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
  PRATA:    "bg-gray-400",
  BRONZE:   "bg-orange-400",
};

// ─── Base micro-components ────────────────────────────────────────────────────

function Card({ title, children, className = "" }: { title: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={`rounded-xl border border-gray-200 bg-white p-5 ${className}`}>
      <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-gray-500">{title}</h2>
      {children}
    </div>
  );
}

function KpiCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5">
      <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">{label}</p>
      <p className="mt-1 text-2xl font-bold text-gray-900">{value}</p>
      {sub && <p className="mt-0.5 text-xs text-gray-400">{sub}</p>}
    </div>
  );
}

function Empty({ msg = "Sem dados no período" }: { msg?: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 py-12 text-center">
      <span className="text-3xl text-gray-200">📊</span>
      <p className="text-sm text-gray-400">{msg}</p>
    </div>
  );
}

function Skeleton() {
  return (
    <div className="animate-pulse space-y-3">
      <div className="h-4 w-1/3 rounded bg-gray-100" />
      <div className="h-4 w-2/3 rounded bg-gray-100" />
      <div className="h-4 w-1/2 rounded bg-gray-100" />
    </div>
  );
}

// ─── Source badge ─────────────────────────────────────────────────────────────

function SourceBadge({ source }: { source: "foocci" | "importado" }) {
  if (source === "foocci") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-indigo-50 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-indigo-600">
        📋 Pedidos Foocci
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-700">
      📦 Histórico importado — dados agregados, não pedidos detalhados
    </span>
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
            <span className="w-32 shrink-0 truncate text-right text-xs text-gray-600">{String(row[labelKey])}</span>
            <div className="flex-1 rounded-full bg-gray-100 h-2.5">
              <div className={`${color} h-2.5 rounded-full transition-all`} style={{ width: `${pct}%` }} />
            </div>
            <span className="w-20 shrink-0 text-right text-xs font-medium text-gray-800">
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

  const width  = 640;
  const maxV   = Math.max(...points.map((p) => p.revenue), 1);
  const step   = width / (points.length - 1);

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

// ─── Stacked bar (progress-like) ─────────────────────────────────────────────

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
            className={`${colorMap[s.key] ?? "bg-gray-300"} transition-all`}
            style={{ width: `${s.share}%` }}
            title={`${labelMap[s.key] ?? s.key}: ${s.count}`}
          />
        ))}
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-1">
        {nonZero.map((s) => (
          <div key={s.key} className="flex items-center gap-1.5 text-xs text-gray-600">
            <span className={`inline-block h-2.5 w-2.5 rounded-full ${colorMap[s.key] ?? "bg-gray-300"}`} />
            <span>{labelMap[s.key] ?? s.key}</span>
            <span className="font-medium text-gray-900">{fmtNum(s.count)}</span>
            <span className="text-gray-400">({fmtPct(s.share)})</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Original insight card (from AnalyticsService) ────────────────────────────

const INSIGHT_STYLE: Record<string, { bg: string; text: string; icon: string }> = {
  warning: { bg: "bg-amber-50 border-amber-200",  text: "text-amber-800",  icon: "⚠️" },
  success: { bg: "bg-green-50 border-green-200",  text: "text-green-800",  icon: "✅" },
  info:    { bg: "bg-blue-50  border-blue-200",   text: "text-blue-800",   icon: "💡" },
};

function ImportedBaselineSection({ baseline }: { baseline: ImportedBaseline }) {
  const periodFrom = new Date(baseline.periodStart).toLocaleDateString("pt-BR");
  const periodTo   = new Date(baseline.periodEnd).toLocaleDateString("pt-BR");

  return (
    <div className="rounded-xl border-2 border-indigo-200 bg-white p-5">
      {/* Header */}
      <div className="mb-4 flex items-start gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-indigo-100 text-lg">
          📦
        </div>
        <div>
          <h2 className="text-sm font-bold text-indigo-900">Histórico importado — Saipos/Nemo</h2>
          <p className="mt-0.5 text-xs text-indigo-600">
            Dados anteriores ao Foocci, importados de bases externas. Não representam pedidos detalhados — são agregados históricos.
          </p>
        </div>
        <span className="ml-auto shrink-0 rounded-full bg-indigo-100 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-indigo-700">
          Histórico
        </span>
      </div>

      {/* Period banner */}
      <div className="mb-4 rounded-lg border border-indigo-100 bg-indigo-50 px-3 py-2 text-xs text-indigo-700">
        Período importado: <strong>{periodFrom}</strong> a <strong>{periodTo}</strong>
        {" · "}esse período é independente do filtro de datas acima.
      </div>

      {/* Summary KPIs */}
      <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-xl bg-gray-50 px-4 py-3">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">Receita histórica</p>
          <p className="mt-1 text-lg font-bold text-gray-900">{fmtBRL(baseline.totalRevenue)}</p>
        </div>
        <div className="rounded-xl bg-gray-50 px-4 py-3">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">Qtd vendida</p>
          <p className="mt-1 text-lg font-bold text-gray-900">{fmtNum(baseline.totalQuantity)}</p>
        </div>
        <div className="rounded-xl bg-gray-50 px-4 py-3">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">Prod./Categorias</p>
          <p className="mt-1 text-lg font-bold text-gray-900">{fmtNum(baseline.rowCount)}</p>
        </div>
        <div className="rounded-xl bg-gray-50 px-4 py-3">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">Sem classificação</p>
          <p className="mt-1 text-lg font-bold text-gray-900">{fmtNum(baseline.semClassificacaoCount)}</p>
        </div>
      </div>

      {/* Top categories */}
      {baseline.topCategories.length > 0 && (
        <div className="mb-5">
          <p className="mb-2 text-xs font-semibold text-gray-500 uppercase tracking-wider">Top categorias (receita)</p>
          <div className="space-y-1.5">
            {baseline.topCategories.slice(0, 8).map((cat, i) => {
              const share = baseline.totalRevenue > 0 ? (cat.revenue / baseline.totalRevenue) * 100 : 0;
              return (
                <div key={i} className="flex items-center gap-2 text-xs">
                  <span className="w-4 text-right font-semibold text-gray-400">{i + 1}</span>
                  <div className="flex-1">
                    <div className="flex items-center justify-between mb-0.5">
                      <span className="font-medium text-gray-800">{cat.name}</span>
                      <span className="text-gray-500">{fmtBRL(cat.revenue)} · {fmtNum(cat.qty)} un</span>
                    </div>
                    <div className="h-1 w-full rounded bg-gray-100">
                      <div className="h-1 rounded bg-indigo-400" style={{ width: `${share.toFixed(1)}%` }} />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Top products */}
      {baseline.topProducts.length > 0 && (
        <div>
          <p className="mb-2 text-xs font-semibold text-gray-500 uppercase tracking-wider">Top produtos (receita)</p>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b text-left text-gray-400">
                  <th className="pb-1.5 pr-3 font-medium">#</th>
                  <th className="pb-1.5 pr-3 font-medium">Produto</th>
                  <th className="pb-1.5 pr-3 font-medium">Categoria</th>
                  <th className="pb-1.5 pr-3 font-medium text-right">Receita</th>
                  <th className="pb-1.5 font-medium text-right">Qtd</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {baseline.topProducts.slice(0, 15).map((p, i) => (
                  <tr key={i}>
                    <td className="py-1.5 pr-3 text-gray-400">{i + 1}</td>
                    <td className="py-1.5 pr-3 font-medium text-gray-800">{p.name}</td>
                    <td className="py-1.5 pr-3 text-gray-500">{p.category}</td>
                    <td className="py-1.5 pr-3 text-right text-gray-700">{fmtBRL(p.revenue)}</td>
                    <td className="py-1.5 text-right text-gray-500">{fmtNum(p.qty)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {baseline.semClassificacaoCount > 0 && (
        <p className="mt-3 text-[11px] text-amber-600">
          ⚠ {baseline.semClassificacaoCount} produto{baseline.semClassificacaoCount !== 1 ? "s" : ""} sem classificação de categoria — podem precisar de revisão no cardápio.
        </p>
      )}
    </div>
  );
}

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

// ─── Analytics Agent components ───────────────────────────────────────────────

const SEVERITY_STYLE: Record<InsightSeverity, {
  border: string; bg: string; badge: string; badgeText: string; icon: string;
}> = {
  GOOD:        { border: "border-green-200",  bg: "bg-green-50",   badge: "bg-green-100",  badgeText: "text-green-700",  icon: "✅" },
  INFO:        { border: "border-blue-200",   bg: "bg-blue-50",    badge: "bg-blue-100",   badgeText: "text-blue-700",   icon: "💡" },
  WARNING:     { border: "border-amber-200",  bg: "bg-amber-50",   badge: "bg-amber-100",  badgeText: "text-amber-700",  icon: "⚠️" },
  CRITICAL:    { border: "border-red-200",    bg: "bg-red-50",     badge: "bg-red-100",    badgeText: "text-red-700",    icon: "🚨" },
  OPPORTUNITY: { border: "border-indigo-200", bg: "bg-indigo-50",  badge: "bg-indigo-100", badgeText: "text-indigo-700", icon: "🎯" },
};

const SEVERITY_LABEL: Record<InsightSeverity, string> = {
  GOOD:        "Bom",
  INFO:        "Info",
  WARNING:     "Alerta",
  CRITICAL:    "Crítico",
  OPPORTUNITY: "Oportunidade",
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
        <p className="text-sm font-semibold text-gray-900">{insight.title}</p>
        {insight.metric && (
          <p className="mt-0.5 text-xs font-bold text-gray-500">{insight.metric}</p>
        )}
      </div>

      <p className="text-xs text-gray-600 leading-relaxed">{insight.explanation}</p>
      <p className="text-xs text-gray-500 italic">{insight.recommendation}</p>

      {insight.ctaLabel && insight.ctaTarget && (
        <a
          href={insight.ctaTarget}
          className="mt-auto inline-flex items-center gap-1 rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-indigo-700 transition-colors w-fit"
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
    return <span className="text-gray-400 font-bold">→</span>;
  };

  const DeltaLabel = ({ pt, isGoodUp = true }: { pt: ComparisonPoint; isGoodUp?: boolean }) => {
    const isPositive = pt.deltaPct > 2;
    const isNegative = pt.deltaPct < -2;
    const color =
      isPositive ? (isGoodUp ? "text-green-600" : "text-red-500")  :
      isNegative ? (isGoodUp ? "text-red-500"   : "text-green-600") :
      "text-gray-400";
    return (
      <span className={`text-xs font-semibold ${color}`}>
        {pt.deltaPct >= 0 ? "+" : ""}{pt.deltaPct.toFixed(1)}%
      </span>
    );
  };

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4">
      <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-400">
        Comparativo com período anterior
      </p>
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: "Receita",       pt: comparison.revenue,   fmt: fmtBRL },
          { label: "Pedidos",       pt: comparison.orders,    fmt: fmtNum },
          { label: "Ticket médio",  pt: comparison.avgTicket, fmt: fmtBRL },
        ].map(({ label, pt, fmt }) => (
          <div key={label} className="text-center">
            <p className="text-xs text-gray-500 mb-1">{label}</p>
            <div className="flex items-center justify-center gap-1">
              <Arrow trend={pt.trend} />
              <DeltaLabel pt={pt} />
            </div>
            <p className="mt-0.5 text-[11px] text-gray-400">
              {fmt(pt.previous)} → <span className="font-semibold text-gray-700">{fmt(pt.current)}</span>
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
      <div className="h-4 w-3/4 rounded bg-indigo-100" />
      <div className="h-4 w-1/2 rounded bg-indigo-100" />
      <div className="grid grid-cols-3 gap-3">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-32 rounded-xl bg-indigo-100" />
        ))}
      </div>
    </div>
  );
}

function QuestionBoxPlaceholder() {
  return (
    <div className="rounded-xl border border-dashed border-indigo-200 bg-white p-4">
      <div className="flex items-center gap-2 mb-2">
        <span className="text-base">💬</span>
        <p className="text-sm font-semibold text-gray-700">Pergunte ao Gerente Comercial IA</p>
      </div>
      <div className="flex gap-2">
        <input
          type="text"
          placeholder="Ex: Como vender mais sobremesa?"
          readOnly
          className="flex-1 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-xs text-gray-400 cursor-not-allowed"
        />
        <button
          disabled
          className="rounded-lg bg-gray-100 px-3 py-2 text-xs font-medium text-gray-400 cursor-not-allowed"
        >
          Perguntar
        </button>
      </div>
      <p className="mt-2 text-[11px] text-gray-400">
        Perguntas ao agente serão conectadas em uma próxima etapa.
      </p>
    </div>
  );
}

function AgentPanel({ data, loading }: { data: AgentReport | null; loading: boolean }) {
  return (
    <div className="rounded-xl border-2 border-indigo-100 bg-gradient-to-br from-indigo-50/60 to-white p-6 space-y-5">
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-indigo-600 text-xl shadow-sm">
          🧠
        </div>
        <div>
          <h2 className="text-base font-bold text-gray-900">Gerente Comercial IA</h2>
          <p className="text-xs text-gray-500 mt-0.5">
            Leitura inteligente dos seus dados para ajudar você a vender mais.
          </p>
        </div>
      </div>

      {loading && <AgentSkeleton />}

      {!loading && !data && (
        <p className="text-sm text-gray-400">Não foi possível carregar a análise. Tente novamente.</p>
      )}

      {!loading && data && !data.hasData && (
        <div className="rounded-xl border border-dashed border-indigo-200 bg-white p-6 text-center">
          <p className="text-2xl mb-2">📊</p>
          <p className="text-sm text-gray-500 max-w-md mx-auto">{data.summary}</p>
          {data.dataQuality === "NONE" && (
            <p className="mt-2 text-xs text-gray-400">
              Use <strong>Links Rastreáveis</strong> ou <strong>Importação de Histórico</strong> para começar.
            </p>
          )}
        </div>
      )}

      {!loading && data && data.hasData && (
        <>
          <div className="rounded-xl bg-white border border-indigo-100 p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-indigo-400 mb-2">Resumo executivo</p>
            <p className="text-sm text-gray-700 leading-relaxed">{data.summary}</p>
          </div>

          {data.comparison.available ? (
            <ComparisonRow comparison={data.comparison} />
          ) : data.comparison.unavailableReason ? (
            <p className="text-xs text-gray-400 italic px-1">{data.comparison.unavailableReason}</p>
          ) : null}

          {data.insights.length > 0 && (
            <div className="space-y-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-gray-400 px-1">
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

// ─── Tab content sections ─────────────────────────────────────────────────────

function TabVisaoGeral({
  data, loading, agentData, agentLoading,
}: {
  data: AnalyticsOverview | null;
  loading: boolean;
  agentData: AgentReport | null;
  agentLoading: boolean;
}) {
  const kpi = data?.kpi;
  const hasRealOrders = (kpi?.orders ?? 0) > 0;
  const hasImported   = (data?.importedBaseline?.rowCount ?? 0) > 0;

  return (
    <div className="space-y-6">
      {/* KPI grid — real Foocci orders */}
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <SourceBadge source="foocci" />
          {!hasRealOrders && (
            <span className="text-xs text-gray-400">Sem pedidos no período selecionado</span>
          )}
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

      {/* Teaser when imported baseline exists but no real orders */}
      {!hasRealOrders && hasImported && (
        <div className="rounded-xl border border-indigo-200 bg-indigo-50 p-4 flex items-start gap-3">
          <span className="text-xl shrink-0">📦</span>
          <div>
            <p className="text-sm font-semibold text-indigo-900">Histórico importado disponível</p>
            <p className="mt-0.5 text-xs text-indigo-700">
              Há {fmtNum(data!.importedBaseline!.rowCount)} registros do Saipos/Nemo com receita histórica de{" "}
              <strong>{fmtBRL(data!.importedBaseline!.totalRevenue)}</strong>.
              Acesse a aba <strong>Histórico Importado</strong>, <strong>Produtos</strong> ou{" "}
              <strong>Categorias</strong> para explorar.
            </p>
          </div>
        </div>
      )}

      {/* Analytics Agent */}
      <AgentPanel data={agentData} loading={agentLoading} />

      {/* AnalyticsService legacy insights */}
      {data && data.insights.length > 0 && (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {data.insights.map((ins, i) => <InsightCard key={i} insight={ins} />)}
        </div>
      )}
    </div>
  );
}

function TabProdutos({ data, loading }: { data: AnalyticsOverview | null; loading: boolean }) {
  const hasReal     = (data?.topProducts.length ?? 0) > 0;
  const hasImported = (data?.importedBaseline?.topProducts.length ?? 0) > 0;

  if (loading) return <Skeleton />;

  if (hasReal) {
    const slow = data!.topProducts.length > 5
      ? [...data!.topProducts].sort((a, b) => a.revenue - b.revenue)
          .slice(0, Math.min(10, Math.floor(data!.topProducts.length / 2)))
      : [];

    return (
      <div className="space-y-6">
        <div className="flex items-center gap-2">
          <SourceBadge source="foocci" />
        </div>

        <Card title="Produtos mais vendidos">
          <BarChart
            data={data!.topProducts as unknown as Record<string, number | string>[]}
            valueKey="revenue"
            labelKey="name"
            color="bg-indigo-500"
          />
        </Card>

        <Card title="Tabela completa — produtos">
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b text-left text-gray-400">
                  <th className="pb-2 pr-4 font-medium">#</th>
                  <th className="pb-2 pr-4 font-medium">Produto</th>
                  <th className="pb-2 pr-4 font-medium">Categoria</th>
                  <th className="pb-2 pr-4 font-medium text-right">Receita</th>
                  <th className="pb-2 pr-4 font-medium text-right">Qtd</th>
                  <th className="pb-2 font-medium text-right">Pedidos</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {data!.topProducts.map((p, i) => (
                  <tr key={i}>
                    <td className="py-2 pr-4 text-gray-400">{i + 1}</td>
                    <td className="py-2 pr-4 font-medium text-gray-800">{p.name}</td>
                    <td className="py-2 pr-4 text-gray-500">{p.category ?? "—"}</td>
                    <td className="py-2 pr-4 text-right font-medium">{fmtBRL(p.revenue)}</td>
                    <td className="py-2 pr-4 text-right text-gray-500">{fmtNum(p.qty)}</td>
                    <td className="py-2 text-right text-gray-500">{fmtNum(p.orderCount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>

        {slow.length > 0 && (
          <Card title="Produtos com baixo desempenho no período">
            <p className="mb-3 text-xs text-gray-400">
              Itens com menor receita no período. Considere ações de destaque, promoção ou revisão de preço.
            </p>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b text-left text-gray-400">
                    <th className="pb-2 pr-4 font-medium">Produto</th>
                    <th className="pb-2 pr-4 font-medium">Categoria</th>
                    <th className="pb-2 pr-4 font-medium text-right">Receita</th>
                    <th className="pb-2 pr-4 font-medium text-right">Qtd vendida</th>
                    <th className="pb-2 font-medium text-right">Pedidos</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {slow.map((p, i) => (
                    <tr key={i}>
                      <td className="py-2 pr-4 font-medium text-gray-800">{p.name}</td>
                      <td className="py-2 pr-4 text-gray-500">{p.category ?? "—"}</td>
                      <td className="py-2 pr-4 text-right text-amber-600 font-medium">{fmtBRL(p.revenue)}</td>
                      <td className="py-2 pr-4 text-right text-gray-500">{fmtNum(p.qty)}</td>
                      <td className="py-2 text-right text-gray-500">{fmtNum(p.orderCount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="mt-3 text-[11px] text-gray-400 italic">
              Produtos sem nenhuma venda no período não aparecem aqui — eles não geram registros de pedido.
            </p>
          </Card>
        )}
      </div>
    );
  }

  if (hasImported) {
    const baseline = data!.importedBaseline!;
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-2">
          <SourceBadge source="importado" />
        </div>

        {/* KPIs */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div className="rounded-xl bg-gray-50 px-4 py-3">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">Receita histórica</p>
            <p className="mt-1 text-lg font-bold text-gray-900">{fmtBRL(baseline.totalRevenue)}</p>
          </div>
          <div className="rounded-xl bg-gray-50 px-4 py-3">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">Qtd vendida</p>
            <p className="mt-1 text-lg font-bold text-gray-900">{fmtNum(baseline.totalQuantity)}</p>
          </div>
          <div className="rounded-xl bg-gray-50 px-4 py-3">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">Produtos</p>
            <p className="mt-1 text-lg font-bold text-gray-900">{fmtNum(baseline.topProducts.length)}</p>
          </div>
          <div className="rounded-xl bg-gray-50 px-4 py-3">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">Sem classificação</p>
            <p className="mt-1 text-lg font-bold text-gray-900">{fmtNum(baseline.semClassificacaoCount)}</p>
          </div>
        </div>

        <Card title="Top produtos por receita">
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b text-left text-gray-400">
                  <th className="pb-1.5 pr-3 font-medium">#</th>
                  <th className="pb-1.5 pr-3 font-medium">Produto</th>
                  <th className="pb-1.5 pr-3 font-medium">Categoria</th>
                  <th className="pb-1.5 pr-3 font-medium text-right">Receita</th>
                  <th className="pb-1.5 font-medium text-right">Qtd</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {baseline.topProducts.map((p, i) => {
                  const share = baseline.totalRevenue > 0 ? (p.revenue / baseline.totalRevenue) * 100 : 0;
                  return (
                    <tr key={i}>
                      <td className="py-1.5 pr-3 text-gray-400">{i + 1}</td>
                      <td className="py-1.5 pr-3 font-medium text-gray-800">{p.name}</td>
                      <td className="py-1.5 pr-3 text-gray-500">{p.category}</td>
                      <td className="py-1.5 pr-3 text-right text-gray-700">{fmtBRL(p.revenue)}</td>
                      <td className="py-1.5 text-right text-gray-500">
                        <span className="text-gray-700">{fmtNum(p.qty)}</span>
                        <span className="ml-1.5 text-gray-300">({share.toFixed(1)}%)</span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>

        {baseline.semClassificacaoCount > 0 && (
          <p className="text-[11px] text-amber-600">
            ⚠ {baseline.semClassificacaoCount} produto{baseline.semClassificacaoCount !== 1 ? "s" : ""} sem classificação de categoria.
          </p>
        )}
      </div>
    );
  }

  return <Empty msg="Sem dados de produtos no período." />;
}

function TabCategorias({ data, loading }: { data: AnalyticsOverview | null; loading: boolean }) {
  const hasReal     = (data?.categories.length ?? 0) > 0;
  const hasImported = (data?.importedBaseline?.topCategories.length ?? 0) > 0;

  if (loading) return <Skeleton />;

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
                <span className="w-28 shrink-0 truncate text-right text-gray-600">{cat.name}</span>
                <div className="flex-1 rounded-full bg-gray-100 h-2.5">
                  <div className="bg-violet-500 h-2.5 rounded-full" style={{ width: `${cat.share}%` }} />
                </div>
                <span className="w-20 shrink-0 text-right font-medium">{fmtBRL(cat.revenue)}</span>
                <span className="w-12 shrink-0 text-right text-gray-400">{fmtPct(cat.share)}</span>
              </div>
            ))}
          </div>
        </Card>
      </div>
    );
  }

  if (hasImported) {
    const baseline = data!.importedBaseline!;
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-2">
          <SourceBadge source="importado" />
        </div>

        <Card title="Top categorias por receita">
          <div className="space-y-2">
            {baseline.topCategories.map((cat, i) => {
              const share = baseline.totalRevenue > 0 ? (cat.revenue / baseline.totalRevenue) * 100 : 0;
              return (
                <div key={i} className="flex items-center gap-3 text-xs">
                  <span className="w-32 shrink-0 truncate text-right text-gray-600">{cat.name}</span>
                  <div className="flex-1 rounded-full bg-gray-100 h-2.5">
                    <div className="bg-indigo-400 h-2.5 rounded-full" style={{ width: `${share.toFixed(1)}%` }} />
                  </div>
                  <span className="w-20 shrink-0 text-right font-medium text-gray-800">{fmtBRL(cat.revenue)}</span>
                  <span className="w-16 shrink-0 text-right text-gray-400">{fmtNum(cat.qty)} un</span>
                  <span className="w-10 shrink-0 text-right text-gray-400">{share.toFixed(1)}%</span>
                </div>
              );
            })}
          </div>
        </Card>

        {/* Table with product breakdown per category */}
        <Card title="Categorias — detalhamento">
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b text-left text-gray-400">
                  <th className="pb-1.5 pr-3 font-medium">#</th>
                  <th className="pb-1.5 pr-3 font-medium">Categoria</th>
                  <th className="pb-1.5 pr-3 font-medium text-right">Receita</th>
                  <th className="pb-1.5 pr-3 font-medium text-right">Qtd</th>
                  <th className="pb-1.5 font-medium text-right">% receita</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {baseline.topCategories.map((cat, i) => {
                  const share = baseline.totalRevenue > 0 ? (cat.revenue / baseline.totalRevenue) * 100 : 0;
                  return (
                    <tr key={i}>
                      <td className="py-1.5 pr-3 text-gray-400">{i + 1}</td>
                      <td className="py-1.5 pr-3 font-medium text-gray-800">{cat.name}</td>
                      <td className="py-1.5 pr-3 text-right text-gray-700">{fmtBRL(cat.revenue)}</td>
                      <td className="py-1.5 pr-3 text-right text-gray-500">{fmtNum(cat.qty)}</td>
                      <td className="py-1.5 text-right text-gray-500">{share.toFixed(1)}%</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      </div>
    );
  }

  return <Empty msg="Sem dados de categorias no período." />;
}

function TabClientes({ data, loading }: { data: AnalyticsOverview | null; loading: boolean }) {
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <SourceBadge source="foocci" />
      </div>

      {/* Top customers */}
      <Card title="Top clientes no período">
        {loading ? <Skeleton /> : data && data.topCustomers.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b text-left text-gray-400">
                  <th className="pb-1.5 pr-3 font-medium">Nome</th>
                  <th className="pb-1.5 pr-3 font-medium text-right">Gasto</th>
                  <th className="pb-1.5 pr-3 font-medium text-right">Pedidos</th>
                  <th className="pb-1.5 font-medium">Tier</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {data.topCustomers.map((c) => (
                  <tr key={c.id}>
                    <td className="py-1.5 pr-3 font-medium text-gray-800">{c.name}</td>
                    <td className="py-1.5 pr-3 text-right">{fmtBRL(c.totalSpend)}</td>
                    <td className="py-1.5 pr-3 text-right text-gray-500">{c.totalOrders}</td>
                    <td className="py-1.5">
                      <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold text-white ${TIER_COLOR[c.tier] ?? "bg-gray-300"}`}>
                        {TIER_LABEL[c.tier] ?? c.tier}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : !loading && <Empty />}
      </Card>

      {/* Segments + Tiers */}
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

      {/* Attach rates */}
      <Card title="Taxa de attach (complementos)">
        {loading ? <Skeleton /> : data && data.attachRates.length > 0 ? (
          <div className="grid gap-6 sm:grid-cols-2">
            {data.attachRates.map((ar) => (
              <div key={ar.label} className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="font-medium text-gray-700">{ar.label}</span>
                  <span className="text-lg font-bold text-gray-900">{fmtPct(ar.rate)}</span>
                </div>
                <div className="h-2.5 w-full rounded-full bg-gray-100">
                  <div
                    className={`h-2.5 rounded-full transition-all ${ar.rate >= 40 ? "bg-green-500" : ar.rate >= 20 ? "bg-amber-400" : "bg-rose-400"}`}
                    style={{ width: `${Math.min(ar.rate, 100)}%` }}
                  />
                </div>
                <p className="text-xs text-gray-400">
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

function TabCanais({ data, loading }: { data: AnalyticsOverview | null; loading: boolean }) {
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <SourceBadge source="foocci" />
      </div>

      <Card title="Canais de origem">
        {loading ? <Skeleton /> : data && data.channels.length > 0 ? (
          <div className="space-y-2">
            {data.channels.map((ch) => (
              <div key={ch.source} className="flex items-center gap-3 text-xs">
                <span className="w-24 shrink-0 truncate text-right capitalize text-gray-600">{ch.source}</span>
                <div className="flex-1 rounded-full bg-gray-100 h-2.5">
                  <div className="bg-teal-500 h-2.5 rounded-full" style={{ width: `${ch.share}%` }} />
                </div>
                <span className="w-10 shrink-0 text-right text-gray-500">{fmtNum(ch.orders)}</span>
                <span className="w-20 shrink-0 text-right font-medium">{fmtBRL(ch.revenue)}</span>
                <span className="w-12 shrink-0 text-right text-gray-400">{fmtPct(ch.share)}</span>
              </div>
            ))}
          </div>
        ) : !loading && <Empty />}
      </Card>

      <Card title="Receita por dia">
        {loading ? <Skeleton /> : data && data.salesByDay.length > 0 ? (
          <div className="space-y-3">
            <Sparkline points={data.salesByDay} height={80} />
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b text-left text-gray-400">
                    <th className="pb-1.5 pr-4 font-medium">Data</th>
                    <th className="pb-1.5 pr-4 font-medium text-right">Receita</th>
                    <th className="pb-1.5 font-medium text-right">Pedidos</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {[...data.salesByDay].reverse().slice(0, 14).map((pt) => (
                    <tr key={pt.date}>
                      <td className="py-1 pr-4 text-gray-600">{pt.date}</td>
                      <td className="py-1 pr-4 text-right font-medium">{fmtBRL(pt.revenue)}</td>
                      <td className="py-1 text-right text-gray-600">{fmtNum(pt.orders)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : !loading && <Empty />}
      </Card>
    </div>
  );
}

function TabHistorico({ data, loading }: { data: AnalyticsOverview | null; loading: boolean }) {
  if (loading) return <Skeleton />;
  if (!data?.importedBaseline) {
    return (
      <div className="space-y-4">
        <Empty msg="Nenhum histórico importado disponível para este restaurante." />
        <p className="text-center text-xs text-gray-400">
          Importe seu histórico do Saipos/Nemo em <strong>Configurações → Importação</strong> para ver seus dados aqui.
        </p>
      </div>
    );
  }
  return <ImportedBaselineSection baseline={data.importedBaseline} />;
}

// ─── Main component ───────────────────────────────────────────────────────────

export function AnalyticsClient() {
  const [preset, setPreset]   = useState<Preset>("30d");
  const [from, setFrom]       = useState(() => presetRange("30d").from);
  const [to,   setTo]         = useState(() => presetRange("30d").to);
  const [loading, setLoading] = useState(false);
  const [data, setData]       = useState<AnalyticsOverview | null>(null);
  const [error, setError]     = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<Tab>("visao-geral");

  const [agentData,    setAgentData]    = useState<AgentReport | null>(null);
  const [agentLoading, setAgentLoading] = useState(false);

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

  useEffect(() => {
    void load(from, to);
    void loadAgent(from, to);
  }, [from, to, load, loadAgent]);

  function handlePreset(p: Preset) {
    setPreset(p);
    if (p !== "custom") {
      const r = presetRange(p);
      setFrom(r.from);
      setTo(r.to);
    }
  }

  return (
    <div className="mx-auto max-w-7xl space-y-6 px-4 py-6 sm:px-6">
      {/* ── Date filter bar ── */}
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex flex-wrap gap-1.5">
          {PRESETS.map((p) => (
            <button
              key={p.id}
              onClick={() => handlePreset(p.id)}
              className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                preset === p.id
                  ? "bg-indigo-600 text-white"
                  : "bg-gray-100 text-gray-600 hover:bg-gray-200"
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
              className="rounded-lg border border-gray-200 px-2 py-1.5 text-xs"
            />
            <span className="text-xs text-gray-400">até</span>
            <input
              type="date"
              value={to}
              min={from}
              onChange={(e) => setTo(e.target.value)}
              className="rounded-lg border border-gray-200 px-2 py-1.5 text-xs"
            />
          </div>
        )}
        {loading && <span className="text-xs text-gray-400 animate-pulse">Carregando…</span>}
      </div>

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* ── Tab navigation ── */}
      <div className="overflow-x-auto">
        <div className="flex min-w-max gap-1 border-b border-gray-200 pb-0">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`whitespace-nowrap rounded-t-lg px-4 py-2 text-sm font-medium transition-colors ${
                activeTab === tab.id
                  ? "border-b-2 border-indigo-600 text-indigo-600"
                  : "text-gray-500 hover:text-gray-800"
              }`}
            >
              {tab.label}
              {tab.id === "historico" && (data?.importedBaseline?.rowCount ?? 0) > 0 && (
                <span className="ml-1.5 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-indigo-100 px-1 text-[9px] font-bold text-indigo-600">
                  {fmtNum(data!.importedBaseline!.rowCount)}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* ── Tab content ── */}
      {activeTab === "visao-geral" && (
        <TabVisaoGeral data={data} loading={loading} agentData={agentData} agentLoading={agentLoading} />
      )}
      {activeTab === "produtos" && (
        <TabProdutos data={data} loading={loading} />
      )}
      {activeTab === "categorias" && (
        <TabCategorias data={data} loading={loading} />
      )}
      {activeTab === "clientes" && (
        <TabClientes data={data} loading={loading} />
      )}
      {activeTab === "canais" && (
        <TabCanais data={data} loading={loading} />
      )}
      {activeTab === "historico" && (
        <TabHistorico data={data} loading={loading} />
      )}
    </div>
  );
}
