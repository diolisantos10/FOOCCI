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
  ImportedCustomerRow,
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

// ─── Data-source helpers ──────────────────────────────────────────────────────

function shouldUseImportedProducts(
  preset: Preset,
  data: AnalyticsOverview | null,
): boolean {
  if (preset !== "all") return false;
  const importedCount = data?.importedBaseline?.topProducts.length ?? 0;
  const realCount     = data?.topProducts.length ?? 0;
  return importedCount > realCount;
}

function shouldUseImportedCategories(
  preset: Preset,
  data: AnalyticsOverview | null,
): boolean {
  if (preset !== "all") return false;
  const importedCount = data?.importedBaseline?.topCategories.length ?? 0;
  const realCount     = data?.categories.length ?? 0;
  return importedCount > realCount;
}

// ─── Base micro-components ────────────────────────────────────────────────────

function Card({ title, children, className = "" }: {
  title: string; children: React.ReactNode; className?: string;
}) {
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

function Empty({ msg = "Sem dados no período", sub }: { msg?: string; sub?: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 py-12 text-center">
      <span className="text-3xl text-gray-200">📊</span>
      <p className="text-sm text-gray-400">{msg}</p>
      {sub && <p className="text-xs text-gray-300 max-w-sm">{sub}</p>}
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

function SourceBadge({ source }: { source: "foocci" | "importado" | "mixed" }) {
  if (source === "foocci") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-indigo-50 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-indigo-600">
        📋 Pedidos Foocci
      </span>
    );
  }
  if (source === "mixed") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-violet-50 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-violet-700">
        📊 Foocci + histórico importado
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-700">
      📦 Histórico importado — dados agregados, não pedidos detalhados
    </span>
  );
}

function FallbackPrompt({ preset }: { preset: Preset }) {
  if (preset === "all") return null;
  return (
    <div className="rounded-lg border border-gray-200 bg-gray-50 p-4 text-center">
      <p className="text-xs text-gray-500">
        Sem dados Foocci neste período.{" "}
        <span className="font-medium">Use "Todo histórico"</span> para ver a base importada Saipos/Nemo.
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
            <span className="w-32 shrink-0 truncate text-right text-xs text-gray-600">
              {String(row[labelKey])}
            </span>
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

// ─── Imported baseline section ────────────────────────────────────────────────

function ImportedBaselineSection({ baseline }: { baseline: ImportedBaseline }) {
  const periodFrom = new Date(baseline.periodStart).toLocaleDateString("pt-BR");
  const periodTo   = new Date(baseline.periodEnd).toLocaleDateString("pt-BR");

  return (
    <div className="rounded-xl border-2 border-indigo-200 bg-white p-5">
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

      <div className="mb-4 rounded-lg border border-indigo-100 bg-indigo-50 px-3 py-2 text-xs text-indigo-700">
        Período importado: <strong>{periodFrom}</strong> a <strong>{periodTo}</strong>
        {" · "}esse período é independente do filtro de datas acima.
      </div>

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

      {baseline.topCategories.length > 0 && (
        <div className="mb-5">
          <p className="mb-2 text-xs font-semibold text-gray-500 uppercase tracking-wider">
            Top categorias (receita)
          </p>
          <div className="space-y-1.5">
            {baseline.topCategories.slice(0, 10).map((cat, i) => {
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

      {baseline.topProducts.length > 0 && (
        <div>
          <p className="mb-2 text-xs font-semibold text-gray-500 uppercase tracking-wider">
            Top produtos (receita)
          </p>
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
          ⚠ {baseline.semClassificacaoCount} produto
          {baseline.semClassificacaoCount !== 1 ? "s" : ""} sem classificação de categoria.
        </p>
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
  OPPORTUNITY: { border: "border-indigo-200", bg: "bg-indigo-50", badge: "bg-indigo-100", badgeText: "text-indigo-700", icon: "🎯" },
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

  const DeltaLabel = ({ pt }: { pt: ComparisonPoint }) => {
    const color =
      pt.deltaPct > 2  ? "text-green-600" :
      pt.deltaPct < -2 ? "text-red-500"   :
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
          { label: "Receita",      pt: comparison.revenue,   fmt: fmtBRL },
          { label: "Pedidos",      pt: comparison.orders,    fmt: fmtNum },
          { label: "Ticket médio", pt: comparison.avgTicket, fmt: fmtBRL },
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
        {[1, 2, 3].map((i) => <div key={i} className="h-32 rounded-xl bg-indigo-100" />)}
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

// ─── Tab: Visão Geral ─────────────────────────────────────────────────────────

function TabVisaoGeral({
  data, loading, agentData, agentLoading, preset,
}: {
  data: AnalyticsOverview | null;
  loading: boolean;
  agentData: AgentReport | null;
  agentLoading: boolean;
  preset: Preset;
}) {
  const kpi            = data?.kpi;
  const hasRealOrders  = (kpi?.orders ?? 0) > 0;
  const hasImported    = (data?.importedBaseline?.rowCount ?? 0) > 0;
  const showAllMode    = preset === "all";

  return (
    <div className="space-y-6">
      {/* Real Foocci KPIs */}
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <SourceBadge source={showAllMode && hasImported ? "mixed" : "foocci"} />
          {loading && <span className="text-xs text-gray-400 animate-pulse">Carregando…</span>}
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

      {/* Imported baseline summary card — always shown when data exists; more prominent in "all" mode */}
      {!loading && hasImported && (
        <div className={`rounded-xl p-5 ${showAllMode
          ? "border-2 border-indigo-200 bg-indigo-50"
          : "border border-indigo-100 bg-white"}`}>
          <div className="flex items-start gap-3 mb-4">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-indigo-100 text-base">
              📦
            </div>
            <div className="flex-1">
              <p className={`text-sm font-bold ${showAllMode ? "text-indigo-900" : "text-gray-800"}`}>
                Histórico importado Saipos/Nemo
              </p>
              <p className="text-xs text-gray-500 mt-0.5">
                {(() => {
                  const b = data!.importedBaseline!;
                  const from = new Date(b.periodStart).getFullYear();
                  const to   = new Date(b.periodEnd).getFullYear();
                  return `${fmtNum(b.rowCount)} registros · ${from}–${to} · dados agregados, não pedidos`;
                })()}
              </p>
            </div>
            {showAllMode && (
              <span className="shrink-0 rounded-full bg-indigo-100 px-2 py-0.5 text-[10px] font-bold uppercase text-indigo-700">
                Em destaque
              </span>
            )}
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[
              { label: "Receita histórica",   val: fmtBRL(data!.importedBaseline!.totalRevenue) },
              { label: "Qtd vendida",          val: fmtNum(data!.importedBaseline!.totalQuantity) },
              { label: "Produtos/Categorias",  val: fmtNum(data!.importedBaseline!.rowCount) },
              { label: "Sem classificação",    val: fmtNum(data!.importedBaseline!.semClassificacaoCount) },
            ].map((item) => (
              <div key={item.label} className="rounded-xl bg-white px-3 py-2.5 shadow-sm">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">{item.label}</p>
                <p className="mt-0.5 text-base font-bold text-gray-900">{item.val}</p>
              </div>
            ))}
          </div>
          {!hasRealOrders && (
            <p className="mt-3 text-xs text-indigo-700">
              Acesse as abas <strong>Produtos</strong>, <strong>Categorias</strong> e{" "}
              <strong>Histórico Importado</strong> para análise detalhada.
            </p>
          )}
        </div>
      )}

      {/* Fallback when no real orders AND no imported data */}
      {!loading && !hasRealOrders && !hasImported && preset !== "all" && (
        <FallbackPrompt preset={preset} />
      )}

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

// ─── Tab: Produtos ────────────────────────────────────────────────────────────

function TabProdutos({ data, loading, preset }: {
  data: AnalyticsOverview | null;
  loading: boolean;
  preset: Preset;
}) {
  if (loading) return <Skeleton />;

  const useImported    = shouldUseImportedProducts(preset, data);
  const hasReal        = (data?.topProducts.length ?? 0) > 0;
  const hasImported    = (data?.importedBaseline?.topProducts.length ?? 0) > 0;

  // ── Imported path (Todo histórico + more imported rows than real) ──────────
  if (useImported && hasImported) {
    const baseline = data!.importedBaseline!;
    const allProducts = baseline.topProducts; // up to 150 rows

    return (
      <div className="space-y-6">
        <div className="flex items-center gap-2 flex-wrap">
          <SourceBadge source="importado" />
          <span className="text-xs text-gray-400">
            {fmtNum(allProducts.length)} produtos · receita total {fmtBRL(baseline.totalRevenue)}
          </span>
        </div>

        {/* Summary KPIs */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div className="rounded-xl bg-gray-50 px-4 py-3">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">Receita histórica</p>
            <p className="mt-1 text-lg font-bold text-gray-900">{fmtBRL(baseline.totalRevenue)}</p>
          </div>
          <div className="rounded-xl bg-gray-50 px-4 py-3">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">Qtd total vendida</p>
            <p className="mt-1 text-lg font-bold text-gray-900">{fmtNum(baseline.totalQuantity)}</p>
          </div>
          <div className="rounded-xl bg-gray-50 px-4 py-3">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">Produtos analisados</p>
            <p className="mt-1 text-lg font-bold text-gray-900">{fmtNum(allProducts.length)}</p>
          </div>
          <div className="rounded-xl bg-gray-50 px-4 py-3">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">Sem classificação</p>
            <p className="mt-1 text-lg font-bold text-gray-900">{fmtNum(baseline.semClassificacaoCount)}</p>
          </div>
        </div>

        {/* Top by revenue bar chart */}
        <Card title="Top 20 produtos por receita">
          <BarChart
            data={allProducts.slice(0, 20) as unknown as Record<string, number | string>[]}
            valueKey="revenue"
            labelKey="name"
            color="bg-indigo-500"
          />
        </Card>

        {/* Top by quantity */}
        <Card title="Top 20 produtos por quantidade vendida">
          <BarChart
            data={[...allProducts].sort((a, b) => b.qty - a.qty).slice(0, 20) as unknown as Record<string, number | string>[]}
            valueKey="qty"
            labelKey="name"
            color="bg-violet-400"
            formatValue={fmtNum}
          />
        </Card>

        {/* Full table */}
        <Card title={`Tabela completa — ${fmtNum(allProducts.length)} produtos`}>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b text-left text-gray-400">
                  <th className="pb-2 pr-4 font-medium">#</th>
                  <th className="pb-2 pr-4 font-medium">Produto</th>
                  <th className="pb-2 pr-4 font-medium">Categoria</th>
                  <th className="pb-2 pr-4 font-medium text-right">Receita</th>
                  <th className="pb-2 pr-4 font-medium text-right">Qtd</th>
                  <th className="pb-2 font-medium text-right">% receita</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {allProducts.map((p, i) => {
                  const share = baseline.totalRevenue > 0 ? (p.revenue / baseline.totalRevenue) * 100 : 0;
                  return (
                    <tr key={i}>
                      <td className="py-1.5 pr-4 text-gray-400">{i + 1}</td>
                      <td className="py-1.5 pr-4 font-medium text-gray-800">{p.name}</td>
                      <td className="py-1.5 pr-4 text-gray-500">{p.category || "—"}</td>
                      <td className="py-1.5 pr-4 text-right font-medium">{fmtBRL(p.revenue)}</td>
                      <td className="py-1.5 pr-4 text-right text-gray-500">{fmtNum(p.qty)}</td>
                      <td className="py-1.5 text-right text-gray-400">{share.toFixed(1)}%</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>

        {/* Sem classificação callout */}
        {baseline.semClassificacaoCount > 0 && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-4">
            <p className="text-xs text-amber-800">
              ⚠ <strong>{fmtNum(baseline.semClassificacaoCount)} produto
              {baseline.semClassificacaoCount !== 1 ? "s" : ""}</strong> sem classificação de categoria —
              podem precisar de revisão no cardápio.
            </p>
          </div>
        )}
      </div>
    );
  }

  // ── Real Foocci path ──────────────────────────────────────────────────────
  if (hasReal) {
    const slow = data!.topProducts.length > 5
      ? [...data!.topProducts].sort((a, b) => a.revenue - b.revenue)
          .slice(0, Math.min(10, Math.floor(data!.topProducts.length / 2)))
      : [];

    return (
      <div className="space-y-6">
        <div className="flex items-center gap-2">
          <SourceBadge source="foocci" />
          {data!.topProducts.length < 5 && (
            <span className="text-xs text-gray-400">
              Poucos produtos neste período. Use{" "}
              <button className="font-medium text-indigo-600 underline underline-offset-2">
                Todo histórico
              </button>{" "}
              para analisar a base Saipos/Nemo.
            </span>
          )}
        </div>

        <Card title="Top produtos por receita">
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
              Itens com menor receita no período. Considere promoção ou revisão de preço.
            </p>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b text-left text-gray-400">
                    <th className="pb-2 pr-4 font-medium">Produto</th>
                    <th className="pb-2 pr-4 font-medium">Categoria</th>
                    <th className="pb-2 pr-4 font-medium text-right">Receita</th>
                    <th className="pb-2 pr-4 font-medium text-right">Qtd</th>
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
          </Card>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <Empty
        msg="Sem dados de produtos neste período."
        sub={preset !== "all" ? 'Use "Todo histórico" para explorar a base importada Saipos/Nemo.' : undefined}
      />
      {preset !== "all" && <FallbackPrompt preset={preset} />}
    </div>
  );
}

// ─── Tab: Categorias ──────────────────────────────────────────────────────────

function TabCategorias({ data, loading, preset }: {
  data: AnalyticsOverview | null;
  loading: boolean;
  preset: Preset;
}) {
  if (loading) return <Skeleton />;

  const useImported = shouldUseImportedCategories(preset, data);
  const hasReal     = (data?.categories.length ?? 0) > 0;
  const hasImported = (data?.importedBaseline?.topCategories.length ?? 0) > 0;

  // ── Imported path ─────────────────────────────────────────────────────────
  if (useImported && hasImported) {
    const baseline   = data!.importedBaseline!;
    const categories = baseline.topCategories;

    return (
      <div className="space-y-6">
        <div className="flex items-center gap-2 flex-wrap">
          <SourceBadge source="importado" />
          <span className="text-xs text-gray-400">
            {fmtNum(categories.length)} categorias · {fmtBRL(baseline.totalRevenue)} receita total
          </span>
        </div>

        {/* Revenue bar */}
        <Card title="Participação por receita">
          <div className="space-y-2">
            {categories.map((cat, i) => {
              const share = baseline.totalRevenue > 0 ? (cat.revenue / baseline.totalRevenue) * 100 : 0;
              return (
                <div key={i} className="flex items-center gap-3 text-xs">
                  <span className="w-36 shrink-0 truncate text-right text-gray-600">{cat.name}</span>
                  <div className="flex-1 rounded-full bg-gray-100 h-2.5">
                    <div className="bg-indigo-400 h-2.5 rounded-full" style={{ width: `${share.toFixed(1)}%` }} />
                  </div>
                  <span className="w-24 shrink-0 text-right font-medium text-gray-800">{fmtBRL(cat.revenue)}</span>
                  <span className="w-12 shrink-0 text-right text-gray-400">{share.toFixed(1)}%</span>
                </div>
              );
            })}
          </div>
        </Card>

        {/* Quantity bar */}
        <Card title="Participação por quantidade vendida">
          <div className="space-y-2">
            {[...categories].sort((a, b) => b.qty - a.qty).map((cat, i) => {
              const totalQty = categories.reduce((s, c) => s + c.qty, 0);
              const share    = totalQty > 0 ? (cat.qty / totalQty) * 100 : 0;
              return (
                <div key={i} className="flex items-center gap-3 text-xs">
                  <span className="w-36 shrink-0 truncate text-right text-gray-600">{cat.name}</span>
                  <div className="flex-1 rounded-full bg-gray-100 h-2.5">
                    <div className="bg-violet-400 h-2.5 rounded-full" style={{ width: `${share.toFixed(1)}%` }} />
                  </div>
                  <span className="w-20 shrink-0 text-right font-medium text-gray-800">{fmtNum(cat.qty)} un</span>
                  <span className="w-12 shrink-0 text-right text-gray-400">{share.toFixed(1)}%</span>
                </div>
              );
            })}
          </div>
        </Card>

        {/* Detail table */}
        <Card title="Detalhamento por categoria">
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b text-left text-gray-400">
                  <th className="pb-2 pr-4 font-medium">#</th>
                  <th className="pb-2 pr-4 font-medium">Categoria</th>
                  <th className="pb-2 pr-4 font-medium text-right">Receita</th>
                  <th className="pb-2 pr-4 font-medium text-right">Qtd</th>
                  <th className="pb-2 font-medium text-right">% receita</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {categories.map((cat, i) => {
                  const share = baseline.totalRevenue > 0 ? (cat.revenue / baseline.totalRevenue) * 100 : 0;
                  return (
                    <tr key={i}>
                      <td className="py-2 pr-4 text-gray-400">{i + 1}</td>
                      <td className="py-2 pr-4 font-medium text-gray-800">{cat.name}</td>
                      <td className="py-2 pr-4 text-right font-medium">{fmtBRL(cat.revenue)}</td>
                      <td className="py-2 pr-4 text-right text-gray-500">{fmtNum(cat.qty)}</td>
                      <td className="py-2 text-right text-gray-400">{share.toFixed(1)}%</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>

        {/* Top products per category — derived from imported product rows */}
        {data!.importedBaseline!.topProducts.length > 0 && (
          <Card title="Top produtos por categoria">
            {(() => {
              type IRow = { name: string; category: string; revenue: number; qty: number; rowType: string };
              const byCategory = new Map<string, IRow[]>();
              for (const p of data!.importedBaseline!.topProducts) {
                const cat = p.category || "Sem categoria";
                if (!byCategory.has(cat)) byCategory.set(cat, []);
                byCategory.get(cat)!.push(p);
              }
              const sorted = [...byCategory.entries()].sort((a, b) => {
                const ra = a[1].reduce((s, p) => s + p.revenue, 0);
                const rb = b[1].reduce((s, p) => s + p.revenue, 0);
                return rb - ra;
              });
              return (
                <div className="space-y-6">
                  {sorted.slice(0, 10).map(([catName, products]) => (
                    <div key={catName}>
                      <p className="mb-2 text-xs font-semibold text-indigo-700 uppercase tracking-wide">
                        {catName}
                      </p>
                      <div className="space-y-1">
                        {products.slice(0, 5).map((p, i) => (
                          <div key={i} className="flex items-center justify-between text-xs">
                            <span className="text-gray-700">{p.name}</span>
                            <span className="text-gray-500">{fmtBRL(p.revenue)} · {fmtNum(p.qty)} un</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              );
            })()}
          </Card>
        )}
      </div>
    );
  }

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

  return (
    <div className="space-y-4">
      <Empty
        msg="Sem dados de categorias neste período."
        sub={preset !== "all" ? 'Use "Todo histórico" para explorar categorias da base Saipos/Nemo.' : undefined}
      />
      {preset !== "all" && <FallbackPrompt preset={preset} />}
    </div>
  );
}

// ─── Tab: Clientes ────────────────────────────────────────────────────────────

function TabClientes({ data, loading, preset }: {
  data: AnalyticsOverview | null;
  loading: boolean;
  preset: Preset;
}) {
  const hasRealCustomers     = (data?.topCustomers.length ?? 0) > 0;
  const hasImportedCustomers = (data?.importedTopCustomers.length ?? 0) > 0;
  const showAllMode          = preset === "all";

  return (
    <div className="space-y-6">
      {/* Imported customers — show in "Todo histórico" when available */}
      {!loading && showAllMode && hasImportedCustomers && (
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <SourceBadge source="importado" />
            <span className="text-xs text-gray-400">
              Histórico de compras importado do Saipos/Nemo — não reflete pedidos Foocci
            </span>
          </div>
          <Card title="Top clientes por gasto histórico">
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b text-left text-gray-400">
                    <th className="pb-1.5 pr-3 font-medium">Nome</th>
                    <th className="pb-1.5 pr-3 font-medium text-right">Gasto histórico</th>
                    <th className="pb-1.5 pr-3 font-medium text-right">Pedidos</th>
                    <th className="pb-1.5 pr-3 font-medium text-right">Ticket médio</th>
                    <th className="pb-1.5 pr-3 font-medium">Última compra</th>
                    <th className="pb-1.5 font-medium">Tier</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {data!.importedTopCustomers.map((c) => (
                    <tr key={c.id}>
                      <td className="py-1.5 pr-3 font-medium text-gray-800">{c.name}</td>
                      <td className="py-1.5 pr-3 text-right font-medium text-gray-900">
                        {fmtBRL(c.importedTotalSpent)}
                      </td>
                      <td className="py-1.5 pr-3 text-right text-gray-500">{fmtNum(c.importedOrderCount)}</td>
                      <td className="py-1.5 pr-3 text-right text-gray-500">
                        {c.averageTicket > 0 ? fmtBRL(c.averageTicket) : "—"}
                      </td>
                      <td className="py-1.5 pr-3 text-gray-500">
                        {c.importedLastOrderAt
                          ? new Date(c.importedLastOrderAt).toLocaleDateString("pt-BR")
                          : "—"}
                      </td>
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
          </Card>
        </div>
      )}

      {/* Real Foocci top customers */}
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
                  <tr className="border-b text-left text-gray-400">
                    <th className="pb-1.5 pr-3 font-medium">Nome</th>
                    <th className="pb-1.5 pr-3 font-medium text-right">Gasto</th>
                    <th className="pb-1.5 pr-3 font-medium text-right">Pedidos</th>
                    <th className="pb-1.5 font-medium">Tier</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {data!.topCustomers.map((c) => (
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
          ) : (
            <Empty
              msg={loading ? "Carregando…" : "Sem pedidos Foocci no período."}
              sub={!showAllMode ? 'Use "Todo histórico" para ver clientes por gasto histórico.' : undefined}
            />
          )}
        </Card>
      </div>

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
        ) : (
          <div className="flex flex-col items-center gap-2 py-10 text-center">
            <span className="text-3xl text-gray-200">🔗</span>
            <p className="text-sm text-gray-500 font-medium">Sem dados de canais ainda</p>
            <p className="text-xs text-gray-400 max-w-sm">
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
                  <tr className="border-b text-left text-gray-400">
                    <th className="pb-1.5 pr-4 font-medium">Data</th>
                    <th className="pb-1.5 pr-4 font-medium text-right">Receita</th>
                    <th className="pb-1.5 font-medium text-right">Pedidos</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {[...data!.salesByDay].reverse().slice(0, 14).map((pt) => (
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
        ) : (
          <Empty msg="Sem dados de venda por dia no período." />
        )}
      </Card>
    </div>
  );
}

// ─── Tab: Histórico Importado ─────────────────────────────────────────────────

function TabHistorico({ data, loading }: { data: AnalyticsOverview | null; loading: boolean }) {
  if (loading) return <Skeleton />;
  if (!data?.importedBaseline) {
    return (
      <div className="space-y-4">
        <Empty msg="Nenhum histórico importado disponível para este restaurante." />
        <p className="text-center text-xs text-gray-400">
          Importe seu histórico do Saipos/Nemo em{" "}
          <strong>Configurações → Importação</strong> para ver seus dados aqui.
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

  // Source label for the filter area
  const hasImported = (data?.importedBaseline?.rowCount ?? 0) > 0;
  const sourceLabel =
    preset === "all" && hasImported ? "Fonte: Foocci + histórico importado" :
    hasImported                     ? "Fonte: Pedidos Foocci (histórico importado disponível)" :
    "Fonte: Pedidos Foocci";

  return (
    <div className="mx-auto max-w-7xl space-y-0 px-4 py-6 sm:px-6">

      {/* ── 1. Tab navigation — FIRST ── */}
      <div className="overflow-x-auto border-b border-gray-200">
        <div className="flex min-w-max gap-0">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`whitespace-nowrap px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
                activeTab === tab.id
                  ? "border-indigo-600 text-indigo-600"
                  : "border-transparent text-gray-500 hover:text-gray-800 hover:border-gray-300"
              }`}
            >
              {tab.label}
              {tab.id === "historico" && hasImported && (
                <span className="ml-1.5 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-indigo-100 px-1 text-[9px] font-bold text-indigo-600">
                  {fmtNum(data!.importedBaseline!.rowCount)}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* ── 2. Date filter bar — SECOND, below tabs ── */}
      <div className="flex flex-wrap items-center gap-3 border-b border-gray-100 bg-gray-50/60 px-2 py-3">
        <div className="flex flex-wrap gap-1.5">
          {PRESETS.map((p) => (
            <button
              key={p.id}
              onClick={() => handlePreset(p.id)}
              className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                preset === p.id
                  ? "bg-indigo-600 text-white"
                  : "bg-white border border-gray-200 text-gray-600 hover:bg-gray-100"
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
        <div className="ml-auto flex items-center gap-2">
          {loading && <span className="text-xs text-gray-400 animate-pulse">Carregando…</span>}
          <span className="hidden text-[10px] text-gray-400 sm:block">{sourceLabel}</span>
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
        {activeTab === "visao-geral" && (
          <TabVisaoGeral
            data={data}
            loading={loading}
            agentData={agentData}
            agentLoading={agentLoading}
            preset={preset}
          />
        )}
        {activeTab === "produtos" && (
          <TabProdutos data={data} loading={loading} preset={preset} />
        )}
        {activeTab === "categorias" && (
          <TabCategorias data={data} loading={loading} preset={preset} />
        )}
        {activeTab === "clientes" && (
          <TabClientes data={data} loading={loading} preset={preset} />
        )}
        {activeTab === "canais" && (
          <TabCanais data={data} loading={loading} />
        )}
        {activeTab === "historico" && (
          <TabHistorico data={data} loading={loading} />
        )}
      </div>
    </div>
  );
}
