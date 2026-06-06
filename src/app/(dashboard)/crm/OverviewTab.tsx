"use client";

import { useState, useEffect } from "react";
import type { OverviewStats, CustomerTier, TopCustomersResult, TopCustomerSegment } from "@/services/crm/CRMService";
import type { CrmAction, CrmActionType, ActionPriority } from "@/services/crm/CrmActionCenterService";
import { ReviewRequestModal } from "./ReviewRequestModal";

// ── Config ────────────────────────────────────────────────────────────────────

const TIER_CONFIG: Record<CustomerTier, { label: string; icon: string; bar: string; text: string }> = {
  DIAMANTE: { label: "Diamante", icon: "💎", bar: "bg-cyan-400",   text: "text-cyan-700"   },
  OURO:     { label: "Ouro",     icon: "🥇", bar: "bg-amber-400",  text: "text-amber-700"  },
  PRATA:    { label: "Prata",    icon: "🥈", bar: "bg-gray-400",   text: "text-gray-600"   },
  BRONZE:   { label: "Bronze",   icon: "🥉", bar: "bg-orange-400", text: "text-orange-700" },
};

// ── Date filter ───────────────────────────────────────────────────────────────

export type DateFilterPreset = "today" | "week7" | "week" | "total" | "month" | "year" | "custom";

// ── Action Center config ──────────────────────────────────────────────────────

const PRIORITY_STYLE: Record<ActionPriority, { dot: string; badge: string; label: string; border: string; bg: string }> = {
  HIGH:   { dot: "bg-red-500",    badge: "bg-red-50 text-red-700",       label: "Alta",  border: "border-red-100",    bg: "bg-red-50/30"     },
  MEDIUM: { dot: "bg-yellow-400", badge: "bg-yellow-50 text-yellow-700", label: "Média", border: "border-gray-100",   bg: "bg-gray-50/50"    },
  LOW:    { dot: "bg-gray-300",   badge: "bg-gray-50 text-gray-500",     label: "Baixa", border: "border-gray-100",   bg: "bg-gray-50/30"    },
};

const ACTION_ICON: Record<CrmActionType, string> = {
  RECOVER_COLD_CUSTOMERS:       "🔴",
  RECOVER_LOST_CUSTOMERS:       "👻",
  WARM_CUSTOMERS:               "🟡",
  VIP_APPRECIATION:             "💎",
  REVIEW_REQUEST:                "⭐",
  BIRTHDAY_CAMPAIGN:            "🎂",
  COUPON_OPPORTUNITY:           "🎁",
  NO_ORDER_FIRST_PURCHASE:      "🆕",
  HIGH_VALUE_CUSTOMER_ATTENTION:"🏆",
  CAMPAIGN_PERFORMANCE_ALERT:   "📊",
  SAFETY_ISSUE_ALERT:           "⚠️",
};

const CONFIG_ACTION_TYPES: CrmActionType[] = ["SAFETY_ISSUE_ALERT", "CAMPAIGN_PERFORMANCE_ALERT"];

// ── AI Draft Preview (W6 — draft-only, no send) ──────────────────────────────

interface MessagePreview {
  draftMessage: string | null;
  alternatives: string[];
  safetyNotes: string[];
  usedFacts: string[];
  missingFacts: string[];
  blockedReasons: string[];
  requiresApproval: boolean;
  generatedBy: string;
}

function DraftPreviewPanel({ action }: { action: CrmAction }) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [preview, setPreview] = useState<MessagePreview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const sampleCustomerId = action.linkedCustomerSample[0]?.id;

  async function generate() {
    setLoading(true);
    setError(null);
    setCopied(false);
    try {
      const res = await fetch("/api/crm/message-variation/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customerId: sampleCustomerId,
          actionType: action.type,
          maxVariants: 3,
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        setError(json?.error ?? "Não foi possível gerar a mensagem.");
        return;
      }
      setPreview(json.data as MessagePreview);
    } catch {
      setError("Erro de conexão ao gerar a mensagem.");
    } finally {
      setLoading(false);
    }
  }

  function handleToggle() {
    const next = !open;
    setOpen(next);
    if (next && !preview && !loading) void generate();
  }

  function copyDraft() {
    if (!preview?.draftMessage) return;
    void navigator.clipboard.writeText(preview.draftMessage);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <div className="mt-3 border-t border-gray-100 pt-3">
      <button
        onClick={handleToggle}
        className="text-xs font-semibold text-brand-700 hover:text-brand-800"
      >
        {open ? "▾ Ocultar rascunho" : "✨ Gerar mensagem com IA"}
      </button>

      {open && (
        <div className="mt-2 space-y-2">
          {loading && (
            <div className="h-12 animate-pulse rounded-lg bg-gray-100" />
          )}

          {error && <p className="text-xs text-red-600">{error}</p>}

          {!loading && preview && (
            <>
              {preview.blockedReasons.length > 0 ? (
                <div className="rounded-lg border border-red-100 bg-red-50/50 p-3">
                  <p className="text-[11px] font-semibold text-red-700 mb-1">
                    Rascunho não gerado (bloqueado por segurança):
                  </p>
                  <ul className="list-disc pl-4 text-[11px] text-red-600">
                    {preview.blockedReasons.map((r, i) => <li key={i}>{r}</li>)}
                  </ul>
                </div>
              ) : preview.draftMessage ? (
                <>
                  <div className="rounded-lg border border-gray-200 bg-white p-3">
                    <p className="text-xs text-gray-800 whitespace-pre-wrap">{preview.draftMessage}</p>
                    <div className="mt-2 flex items-center gap-2">
                      <button
                        onClick={copyDraft}
                        className="rounded-md border border-gray-200 px-2 py-1 text-[10px] font-semibold text-gray-600 hover:bg-gray-50"
                      >
                        {copied ? "Copiado!" : "Copiar"}
                      </button>
                      <button
                        onClick={generate}
                        className="rounded-md border border-gray-200 px-2 py-1 text-[10px] font-semibold text-gray-600 hover:bg-gray-50"
                      >
                        Gerar outra
                      </button>
                      <span className="text-[10px] text-gray-400">
                        {preview.generatedBy === "llm" ? "Gerado por IA" : "Modelo padrão"} · requer aprovação
                      </span>
                    </div>
                  </div>

                  {preview.alternatives.length > 0 && (
                    <div className="space-y-1">
                      <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">Alternativas</p>
                      {preview.alternatives.map((alt, i) => (
                        <p key={i} className="rounded-md bg-gray-50 p-2 text-[11px] text-gray-600">{alt}</p>
                      ))}
                    </div>
                  )}

                  {preview.usedFacts.length > 0 && (
                    <p className="text-[10px] text-gray-500">
                      <span className="font-semibold">Fatos usados:</span> {preview.usedFacts.join(" · ")}
                    </p>
                  )}
                  {preview.missingFacts.length > 0 && (
                    <p className="text-[10px] text-gray-400">
                      <span className="font-semibold">Dados ausentes:</span> {preview.missingFacts.join(" · ")}
                    </p>
                  )}
                  {preview.safetyNotes.length > 0 && (
                    <ul className="list-disc pl-4 text-[10px] text-amber-600">
                      {preview.safetyNotes.map((n, i) => <li key={i}>{n}</li>)}
                    </ul>
                  )}
                </>
              ) : (
                <p className="text-xs text-gray-500">Nenhum rascunho disponível.</p>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

// ReviewRequestModal imported from ./ReviewRequestModal (extracted for reuse in CustomersTab)

function ActionCard({
  action,
  onNavigateToTab,
}: {
  action: CrmAction;
  onNavigateToTab: (tab: "campanhas" | "customers") => void;
}) {
  const ps = PRIORITY_STYLE[action.priority];
  const icon = ACTION_ICON[action.type];
  const isAlert =
    action.type === "SAFETY_ISSUE_ALERT" || action.type === "CAMPAIGN_PERFORMANCE_ALERT";
  const canPreview = !isAlert && action.linkedCustomerSample.length > 0;
  const [reviewCustomer, setReviewCustomer] = useState<{ id: string; name: string; phone: string } | null>(null);
  // Human-confirmed review send is available on REVIEW_REQUEST actions that have
  // at least one contactable sample customer and a configured review link.
  const canSendReview =
    action.type === "REVIEW_REQUEST" &&
    action.recommendedCampaignType !== null &&
    action.linkedCustomerSample.length > 0;

  return (
    <div className={`rounded-xl border p-4 ${ps.border} ${ps.bg}`}>
      <div className="flex items-start gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2 mb-1">
            <span className={`h-2 w-2 rounded-full shrink-0 ${ps.dot}`} />
            <span className="text-sm font-semibold text-gray-900">
              {icon} {action.title}
            </span>
            <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold shrink-0 ${ps.badge}`}>
              {ps.label}
            </span>
          </div>
          <p className="text-xs text-gray-500 mb-2">{action.description}</p>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-gray-600">
            {action.eligibleCount > 0 && (
              <span>{action.eligibleCount} contactável{action.eligibleCount !== 1 ? "is" : ""}</span>
            )}
            {action.blockedCount > 0 && (
              <span className="text-gray-400">{action.blockedCount} bloqueado{action.blockedCount !== 1 ? "s" : ""}</span>
            )}
            {action.estimatedRevenueOpportunity > 0 && (
              <span className="font-semibold text-green-700">
                ~R$ {action.estimatedRevenueOpportunity.toLocaleString("pt-BR")}
              </span>
            )}
          </div>
          {action.safetyStatus === "BLOCKED" && action.blockerReasons.length > 0 && (
            <p className="mt-2 text-[10px] text-red-600 border-t border-red-100 pt-2">
              Bloqueado: {action.blockerReasons.join(" · ")}
            </p>
          )}
        </div>
        <div className="flex flex-col gap-1.5 shrink-0">
          {canSendReview && (
            <button
              onClick={() => setReviewCustomer(action.linkedCustomerSample[0]!)}
              className="rounded-lg bg-amber-500 px-3 py-1.5 text-xs font-semibold text-white hover:bg-amber-600 whitespace-nowrap"
            >
              ⭐ Pedir avaliação
            </button>
          )}
          {!isAlert && (
            <button
              onClick={() => onNavigateToTab("campanhas")}
              disabled={action.safetyStatus === "BLOCKED"}
              className="rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-700 disabled:opacity-40 whitespace-nowrap"
            >
              Criar campanha
            </button>
          )}
          {!isAlert && action.linkedCustomerSample.length > 0 && (
            <button
              onClick={() => onNavigateToTab("customers")}
              className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-50 whitespace-nowrap"
            >
              Ver clientes
            </button>
          )}
          {isAlert && (
            <button
              onClick={() => onNavigateToTab("campanhas")}
              className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-50 whitespace-nowrap"
            >
              Ver campanhas
            </button>
          )}
        </div>
      </div>

      {canPreview && <DraftPreviewPanel action={action} />}

      {reviewCustomer && (
        <ReviewRequestModal customer={reviewCustomer} onClose={() => setReviewCustomer(null)} />
      )}
    </div>
  );
}

function CompactOpportunitiesSection({
  actions,
  onNavigateToTab,
}: {
  actions: CrmAction[];
  onNavigateToTab: (tab: "campanhas" | "customers") => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const commercialActions = actions.filter((a) => !CONFIG_ACTION_TYPES.includes(a.type));
  if (commercialActions.length === 0) return null;

  const COMPACT_LIMIT = 6;
  const top = expanded ? commercialActions : commercialActions.slice(0, COMPACT_LIMIT);
  const highCount = commercialActions.filter((a) => a.priority === "HIGH").length;

  return (
    <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
      <div className="mb-3 flex items-center justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-gray-400">
            Oportunidades de receita
          </p>
          {highCount > 0 && (
            <p className="mt-0.5 text-[10px] text-red-600">{highCount} de alta prioridade</p>
          )}
        </div>
        {highCount > 0 ? (
          <span className="rounded-full bg-red-50 px-2.5 py-0.5 text-xs font-semibold text-red-700">
            {highCount} urgente{highCount !== 1 ? "s" : ""}
          </span>
        ) : (
          <span className="rounded-full bg-brand-50 px-2.5 py-0.5 text-xs font-semibold text-brand-700">
            {commercialActions.length} {commercialActions.length !== 1 ? "recomendações" : "recomendação"}
          </span>
        )}
      </div>

      <div className="space-y-2">
        {top.map((action) => {
          const ps = PRIORITY_STYLE[action.priority];
          const icon = ACTION_ICON[action.type];
          return (
            <div
              key={action.id}
              className={`flex items-center gap-3 rounded-xl border px-3 py-2.5 ${ps.border} ${ps.bg}`}
            >
              <span className={`h-2 w-2 shrink-0 rounded-full ${ps.dot}`} />
              <span className="text-sm">{icon}</span>
              <div className="flex-1 min-w-0">
                <p className="truncate text-xs font-semibold text-gray-800">{action.title}</p>
                {action.eligibleCount > 0 && (
                  <p className="text-[10px] text-gray-500">
                    {action.eligibleCount} cliente{action.eligibleCount !== 1 ? "s" : ""}
                    {action.estimatedRevenueOpportunity > 0 && ` · ~R$ ${action.estimatedRevenueOpportunity.toLocaleString("pt-BR")}`}
                  </p>
                )}
              </div>
              <button
                onClick={() => onNavigateToTab("campanhas")}
                disabled={action.safetyStatus === "BLOCKED"}
                className="shrink-0 rounded-lg bg-brand-600 px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-brand-700 disabled:opacity-40"
              >
                Criar campanha
              </button>
            </div>
          );
        })}
      </div>

      {commercialActions.length > COMPACT_LIMIT && (
        <button
          onClick={() => setExpanded((v) => !v)}
          className="mt-3 w-full rounded-lg border border-gray-100 py-2 text-xs font-semibold text-gray-500 hover:bg-gray-50 transition-colors"
        >
          {expanded
            ? "Ver menos"
            : `Ver mais oportunidades (${commercialActions.length - COMPACT_LIMIT} restantes)`}
        </button>
      )}
    </div>
  );
}

function ConfigAlertsSection({
  actions,
  onNavigateToTab,
}: {
  actions: CrmAction[];
  onNavigateToTab: (tab: "campanhas" | "customers") => void;
}) {
  const configActions = actions.filter((a) => CONFIG_ACTION_TYPES.includes(a.type));
  const reviewBlockedNoLink = actions.some(
    (a) => a.type === "REVIEW_REQUEST" && a.recommendedCampaignType === null,
  );
  if (configActions.length === 0 && !reviewBlockedNoLink) return null;
  const total = configActions.length + (reviewBlockedNoLink ? 1 : 0);

  return (
    <div className="rounded-2xl border border-amber-100 bg-amber-50/40 p-4 shadow-sm">
      <div className="mb-2 flex items-center gap-2">
        <p className="text-xs font-semibold uppercase tracking-widest text-amber-700">
          Configurações pendentes
        </p>
        <span className="rounded-full bg-amber-100 px-2 py-px text-[10px] font-semibold text-amber-700">
          {total} ajuste{total !== 1 ? "s" : ""}
        </span>
      </div>
      <div className="space-y-2">
        {configActions.map((action) => (
          <div key={action.id} className="flex items-center justify-between gap-3 rounded-xl border border-amber-100 bg-white px-3 py-2">
            <p className="text-[11px] text-amber-800 flex-1 min-w-0">{ACTION_ICON[action.type]} {action.title}</p>
            <button
              onClick={() => onNavigateToTab("campanhas")}
              className="shrink-0 rounded-lg border border-amber-200 px-2.5 py-1 text-[11px] font-semibold text-amber-700 hover:bg-amber-100"
            >
              Ver
            </button>
          </div>
        ))}
        {reviewBlockedNoLink && (
          <div className="flex items-center justify-between gap-3 rounded-xl border border-amber-100 bg-white px-3 py-2">
            <p className="text-[11px] text-amber-800 flex-1">⭐ Configure o link do Google ou iFood para pedir avaliações.</p>
            <a
              href="/marca"
              className="shrink-0 rounded-lg bg-amber-600 px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-amber-700"
            >
              Configurar
            </a>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

function KPICard({
  label,
  value,
  sub,
  accent,
  loading,
  onClick,
  ctaLabel,
  pct,
}: {
  label: string;
  value: string | number;
  sub?: string;
  accent?: "green" | "yellow" | "red" | "blue" | "brand" | "gray";
  loading?: boolean;
  onClick?: () => void;
  ctaLabel?: string;
  /** Optional share-of-base percentage, shown as a chip next to the value. */
  pct?: number;
}) {
  const accentClass = {
    green:  "text-green-700",
    yellow: "text-yellow-600",
    red:    "text-red-600",
    blue:   "text-blue-700",
    brand:  "text-brand-700",
    gray:   "text-gray-700",
  }[accent ?? "brand"] ?? "text-brand-700";

  return (
    <div
      className={`flex flex-col rounded-2xl border border-gray-100 bg-white p-4 shadow-sm${onClick ? " cursor-pointer hover:border-brand-200 hover:shadow-md transition-all" : ""}`}
      onClick={onClick}
    >
      {loading ? (
        <div className="h-8 w-16 animate-pulse rounded bg-gray-100" />
      ) : (
        <div className="flex items-baseline gap-1.5">
          <p className={`text-2xl font-extrabold ${accentClass}`}>{value}</p>
          {pct !== undefined && (
            <span className="text-xs font-semibold text-gray-400">{pct}%</span>
          )}
        </div>
      )}
      <p className="mt-0.5 text-xs font-semibold text-gray-600">{label}</p>
      {sub && <p className="mt-1 text-[10px] text-gray-400">{sub}</p>}
      {ctaLabel && onClick && (
        <p className="mt-auto pt-2 text-[10px] font-semibold text-brand-600">{ctaLabel} →</p>
      )}
    </div>
  );
}

// ── Revenue chart (proven CRM conversions over time) ──────────────────────────

function RevenueChart({
  series,
  granularity,
  type = "bar",
}: {
  series: Array<{ key: string; label: string; revenue: number; orders: number }>;
  granularity?: "hour" | "day" | "month";
  type?: "bar" | "line";
}) {
  const max = Math.max(0, ...series.map((b) => b.revenue));
  const labelEvery = series.length > 16 ? Math.ceil(series.length / 12) : 1;
  const fmt = (v: number) =>
    v.toLocaleString("pt-BR", { minimumFractionDigits: 0, maximumFractionDigits: 0 });
  const allZero = max === 0;

  if (type === "line") {
    // SVG polyline — simple, no deps.
    const W = 600;
    const H = 96;
    const pad = 4;
    const pts = series.map((b, i) => {
      const x = series.length > 1
        ? pad + (i / (series.length - 1)) * (W - pad * 2)
        : W / 2;
      const y = allZero ? H - pad : H - pad - ((b.revenue / max) * (H - pad * 2));
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    });
    return (
      <div>
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-24" preserveAspectRatio="none">
          {!allZero && (
            <polyline
              points={pts.join(" ")}
              fill="none"
              stroke="#22c55e"
              strokeWidth="2"
              strokeLinejoin="round"
              strokeLinecap="round"
            />
          )}
          {allZero && (
            <line x1={pad} y1={H - pad} x2={W - pad} y2={H - pad} stroke="#e5e7eb" strokeWidth="1.5" />
          )}
        </svg>
        <div className="mt-1 flex items-center justify-between text-[9px] text-gray-300">
          <span>R$ 0</span>
          <span className="capitalize">
            {granularity === "hour" ? "por hora" : granularity === "month" ? "por mês" : "por dia"}
          </span>
          <span>{allZero ? "R$ 0" : `R$ ${fmt(max)}`}</span>
        </div>
        {allZero && (
          <p className="mt-1 text-center text-[10px] text-gray-400">
            Nenhuma conversão comprovada no período
          </p>
        )}
      </div>
    );
  }

  return (
    <div>
      <div className="flex h-24 items-end gap-[2px]">
        {series.map((b, i) => {
          const h = max > 0 ? Math.round((b.revenue / max) * 100) : 0;
          return (
            <div key={b.key} className="flex flex-1 flex-col items-center justify-end" style={{ minWidth: 3 }}>
              <div
                className={`w-full rounded-t transition-all ${b.revenue > 0 ? "bg-green-500" : "bg-gray-100"}`}
                style={{ height: `${b.revenue > 0 ? Math.max(h, 4) : 3}%` }}
                title={`${b.label}: R$ ${b.revenue.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} · ${b.orders} pedido${b.orders !== 1 ? "s" : ""}`}
              />
              <span className="mt-0.5 h-3 text-[7px] leading-none text-gray-400">
                {i % labelEvery === 0 ? b.label : ""}
              </span>
            </div>
          );
        })}
      </div>
      <div className="mt-1 flex items-center justify-between text-[9px] text-gray-300">
        <span>R$ 0</span>
        <span className="capitalize">
          {granularity === "hour" ? "por hora" : granularity === "month" ? "por mês" : "por dia"}
        </span>
        <span>{allZero ? "R$ 0" : `R$ ${fmt(max)}`}</span>
      </div>
      {allZero && (
        <p className="mt-1 text-center text-[10px] text-gray-400">
          Nenhuma conversão comprovada no período
        </p>
      )}
    </div>
  );
}

// ── Revenue block (chart protagonist + summary cards) ────────────────────────

function RevenueBlock({
  revenueSummary,
  revenueSummaryLoading,
}: {
  revenueSummary: {
    totalRevenue: number;
    totalSent: number;
    totalResponded: number;
    totalConverted: number;
    campaignCount: number;
    couponRevenue?: number;
    couponOrders?: number;
    couponCodesTracked?: number;
    series?: Array<{ key: string; label: string; revenue: number; orders: number }>;
    seriesRevenue?: number;
    seriesOrders?: number;
    granularity?: "hour" | "day" | "month";
  } | null;
  revenueSummaryLoading: boolean;
}) {
  const [chartType, setChartType] = useState<"bar" | "line">("bar");

  const series = revenueSummary?.series ?? [];
  const seriesRevenue = revenueSummary?.seriesRevenue ?? 0;
  const hasChartData = series.length > 0;

  return (
    <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
      <div className="mb-3 flex items-center justify-between">
        <p className="text-xs font-semibold uppercase tracking-widest text-gray-400">
          Receita gerada pelo CRM
        </p>
        <div className="flex items-center gap-2">
          {hasChartData && (
            <div className="flex rounded-lg border border-gray-100 overflow-hidden">
              <button
                onClick={() => setChartType("bar")}
                className={`px-2.5 py-1 text-[10px] font-semibold transition-colors ${chartType === "bar" ? "bg-gray-900 text-white" : "text-gray-500 hover:bg-gray-50"}`}
              >
                Barras
              </button>
              <button
                onClick={() => setChartType("line")}
                className={`px-2.5 py-1 text-[10px] font-semibold transition-colors ${chartType === "line" ? "bg-gray-900 text-white" : "text-gray-500 hover:bg-gray-50"}`}
              >
                Linha
              </button>
            </div>
          )}
          {revenueSummaryLoading && (
            <span className="text-[10px] text-gray-400">Carregando…</span>
          )}
        </div>
      </div>

      {revenueSummaryLoading && !revenueSummary ? (
        <div className="space-y-3">
          <div className="h-28 animate-pulse rounded-xl bg-gray-100" />
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[1, 2, 3, 4].map((i) => <div key={i} className="h-16 animate-pulse rounded-xl bg-gray-100" />)}
          </div>
        </div>
      ) : !revenueSummary ? (
        <p className="text-sm text-gray-400">Ainda não há receita atribuída ao CRM neste período.</p>
      ) : (
        <div className="space-y-4">
          {/* Chart — always shown when series data exists */}
          {hasChartData ? (
            <div>
              <div className="mb-2 flex items-baseline justify-between">
                <p className="text-[11px] font-semibold text-gray-500">
                  {seriesRevenue > 0 ? "Receita comprovada por conversão" : "Conversões comprovadas no período"}
                </p>
                {seriesRevenue > 0 && (
                  <p className="text-sm font-extrabold text-green-700">
                    R$ {seriesRevenue.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </p>
                )}
              </div>
              <RevenueChart series={series} granularity={revenueSummary.granularity} type={chartType} />
            </div>
          ) : (
            <div className="flex h-24 items-center justify-center rounded-xl bg-gray-50">
              <p className="text-[11px] text-gray-400">
                Gráfico disponível após as primeiras conversões comprovadas
              </p>
            </div>
          )}

          {/* Summary cards */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div className="rounded-xl bg-green-50 p-3">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-green-600 mb-1">Receita atribuída</p>
              <p className="text-lg font-extrabold text-green-700">
                R$ {revenueSummary.totalRevenue.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </p>
              <p className="text-[10px] text-green-400 mt-0.5">Campanhas + automações</p>
            </div>
            <div className="rounded-xl bg-blue-50 p-3">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-blue-600 mb-1">Mensagens enviadas</p>
              <p className="text-lg font-extrabold text-blue-700">{revenueSummary.totalSent.toLocaleString("pt-BR")}</p>
              <p className="text-[10px] text-blue-400 mt-0.5">{revenueSummary.campaignCount} campanha{revenueSummary.campaignCount !== 1 ? "s" : ""}</p>
            </div>
            <div className="rounded-xl bg-purple-50 p-3">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-purple-600 mb-1">Converteram</p>
              <p className="text-lg font-extrabold text-purple-700">{revenueSummary.totalConverted.toLocaleString("pt-BR")}</p>
              <p className="text-[10px] text-purple-400 mt-0.5">
                {revenueSummary.totalResponded > 0
                  ? `${Math.round((revenueSummary.totalConverted / revenueSummary.totalResponded) * 100)}% das respostas`
                  : `${revenueSummary.totalResponded} responderam`}
              </p>
            </div>
            <div className="rounded-xl bg-orange-50 p-3">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-orange-600 mb-1">Cupons usados</p>
              <p className="text-lg font-extrabold text-orange-700">{(revenueSummary.couponOrders ?? 0).toLocaleString("pt-BR")}</p>
              <p className="text-[10px] text-orange-400 mt-0.5">
                {(revenueSummary.couponRevenue ?? 0) > 0
                  ? `R$ ${(revenueSummary.couponRevenue ?? 0).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                  : (revenueSummary.couponCodesTracked ?? 0) > 0 ? "Nenhum resgatado" : "Sem cupom vinculado"}
              </p>
            </div>
          </div>
        </div>
      )}
      <p className="mt-3 text-[10px] text-gray-400">
        * Receita estimada com base em campanhas e cupons vinculados. O gráfico usa conversões comprovadas (pedido após o envio).
      </p>
    </div>
  );
}

// ── Top customers (most valuable) ─────────────────────────────────────────────

const TOP_SEGMENT_BADGE: Record<TopCustomerSegment, { label: string; cls: string }> = {
  QUENTE:      { label: "Quente",   cls: "bg-green-50 text-green-700"  },
  MORNO:       { label: "Morno",    cls: "bg-yellow-50 text-yellow-700" },
  FRIO:        { label: "Frio",     cls: "bg-red-50 text-red-600"      },
  PERDIDO:     { label: "Perdido",  cls: "bg-gray-100 text-gray-500"   },
  SEM_PEDIDOS: { label: "Sem pedidos", cls: "bg-gray-100 text-gray-400" },
};

// Literal tier badge classes (Tailwind scans these at build — no dynamic strings).
const TOP_TIER_BADGE: Record<CustomerTier, string> = {
  DIAMANTE: "bg-cyan-100 text-cyan-700",
  OURO:     "bg-amber-100 text-amber-700",
  PRATA:    "bg-gray-200 text-gray-700",
  BRONZE:   "bg-orange-100 text-orange-700",
};

function topRelativeDate(iso: string | null): string {
  if (!iso) return "sem pedidos";
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  if (days <= 0)  return "último pedido hoje";
  if (days === 1) return "último pedido ontem";
  if (days < 30)  return `último pedido há ${days} dias`;
  if (days < 365) return `último pedido há ${Math.floor(days / 30)} ${Math.floor(days / 30) === 1 ? "mês" : "meses"}`;
  return `último pedido há ${Math.floor(days / 365)} ${Math.floor(days / 365) === 1 ? "ano" : "anos"}`;
}

function TopCustomersBlock({
  data,
  loading,
}: {
  data: TopCustomersResult | null;
  loading: boolean;
}) {
  const customers = data?.customers ?? [];

  return (
    <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
      <div className="mb-3">
        <p className="text-xs font-semibold uppercase tracking-widest text-gray-400">
          Clientes mais valiosos
        </p>
        <p className="mt-0.5 text-[11px] text-gray-400">Quem mais gastou com o restaurante</p>
      </div>

      {loading && !data ? (
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {[1, 2, 3, 4].map((i) => <div key={i} className="h-14 animate-pulse rounded-xl bg-gray-100" />)}
        </div>
      ) : customers.length === 0 ? (
        <p className="text-sm text-gray-400">
          Sem dados suficientes para listar clientes valiosos neste período.
        </p>
      ) : (
        <>
          {data?.fallbackUsed && (
            <p className="mb-3 rounded-lg bg-gray-50 px-3 py-2 text-[11px] text-gray-500">
              Mostrando os clientes que mais gastaram nos últimos 12 meses.
            </p>
          )}
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {customers.map((c, i) => {
              const tier = TIER_CONFIG[c.tier];
              const seg  = TOP_SEGMENT_BADGE[c.segment];
              return (
                <div
                  key={c.customerId}
                  className="flex items-center gap-3 rounded-xl border border-gray-100 px-3 py-2.5"
                >
                  <span className="w-5 shrink-0 text-center text-sm font-bold text-gray-300">{i + 1}</span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <a
                        href={`/customers/${c.customerId}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="truncate text-sm font-semibold text-gray-900 hover:text-brand-600 hover:underline"
                        title={c.name}
                      >
                        {c.name}
                      </a>
                    </div>
                    <p className="mt-0.5 text-[11px] text-gray-500">
                      <span className="font-semibold text-green-700">
                        R$ {c.totalSpent.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </span>
                      {" · "}{c.orderCount} pedido{c.orderCount !== 1 ? "s" : ""}
                      {" · "}{topRelativeDate(c.lastOrderAt)}
                    </p>
                    <div className="mt-1 flex flex-wrap items-center gap-1">
                      <span className={`rounded-full px-1.5 py-0.5 text-[9px] font-bold ${TOP_TIER_BADGE[c.tier]}`}>
                        {tier.icon} {tier.label}
                      </span>
                      <span className={`rounded-full px-1.5 py-0.5 text-[9px] font-semibold ${seg.cls}`}>
                        {seg.label}
                      </span>
                    </div>
                  </div>
                  <a
                    href={`/customers/${c.customerId}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="shrink-0 text-[11px] font-semibold text-brand-600 hover:text-brand-700"
                  >
                    Ver ficha →
                  </a>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────

export function OverviewTab({
  stats,
  opportunitiesCount,
  actions = [],
  onNavigateToTab,
  onSegmentClick,
  loading,
  datePreset,
  customFrom,
  customTo,
  onDateChange,
  revenueSummary,
  revenueSummaryLoading,
  topCustomers,
  topCustomersLoading,
}: {
  stats: OverviewStats;
  opportunitiesCount: number;
  actions?: CrmAction[];
  onNavigateToTab?: (tab: "campanhas" | "customers") => void;
  onSegmentClick?: (filter: "quente" | "morno" | "frio" | "novos") => void;
  loading: boolean;
  datePreset: DateFilterPreset;
  customFrom: string;
  customTo: string;
  onDateChange: (preset: DateFilterPreset, customFrom?: string, customTo?: string) => void;
  revenueSummary?: {
    totalRevenue: number;
    totalSent: number;
    totalResponded: number;
    totalConverted: number;
    campaignCount: number;
    couponRevenue?: number;
    couponOrders?: number;
    couponCodesTracked?: number;
    series?: Array<{ key: string; label: string; revenue: number; orders: number }>;
    seriesRevenue?: number;
    seriesOrders?: number;
    granularity?: "hour" | "day" | "month";
  } | null;
  revenueSummaryLoading?: boolean;
  topCustomers?: TopCustomersResult | null;
  topCustomersLoading?: boolean;
}) {
  const [localFrom, setLocalFrom] = useState(customFrom);
  const [localTo,   setLocalTo]   = useState(customTo);

  // Use hardcoded defaults for display labels (actual thresholds enforced server-side)
  const HOT_DAYS  = 30;
  const WARM_DAYS = 60;
  const LOST_DAYS = 120;

  // Temperature bar calculations
  const tempTotal = stats.ativoCustomers + stats.mornoCustomers + stats.frioCustomers;
  const ativoPct  = tempTotal > 0 ? Math.round((stats.ativoCustomers / tempTotal) * 100) : 0;
  const mornoPct  = tempTotal > 0 ? Math.round((stats.mornoCustomers / tempTotal) * 100) : 0;
  const frioPct   = tempTotal > 0 ? Math.round((stats.frioCustomers  / tempTotal) * 100) : 0;

  const perdidosCustomers = stats.perdidosCustomers ?? 0;
  const perdidoPct = tempTotal > 0 ? Math.round((perdidosCustomers / tempTotal) * 100) : 0;

  const totalSegmented = stats.segments.reduce((s, x) => s + x.count, 0);

  const DATE_PRESETS: { id: DateFilterPreset; label: string }[] = [
    { id: "today",  label: "Hoje"           },
    { id: "week7",  label: "Últimos 7 dias" },
    { id: "week",   label: "Esta semana"    },
    { id: "month",  label: "Este mês"       },
    { id: "year",   label: "Este ano"       },
    { id: "total",  label: "Total"          },
    { id: "custom", label: "Personalizado"  },
  ];

  function handlePreset(preset: DateFilterPreset) {
    if (preset !== "custom") {
      onDateChange(preset);
    } else {
      onDateChange("custom", localFrom, localTo);
    }
  }

  function applyCustom() {
    if (localFrom && localTo) onDateChange("custom", localFrom, localTo);
  }

  const newCustomersLabel =
    datePreset === "today"  ? "Novos hoje"           :
    datePreset === "week7"  ? "Novos (7 dias)"        :
    datePreset === "week"   ? "Novos esta semana"     :
    datePreset === "month"  ? "Novos este mês"        :
    datePreset === "year"   ? "Novos este ano"        :
    datePreset === "custom" ? "Novos no período"      :
                              "Novos clientes";
  const newCustomersSub =
    datePreset === "total" ? "Total de cadastros" : "Cadastrados no período selecionado";

  return (
    <div className="space-y-6">

      {/* 1. Date filter */}
      <div className="space-y-2">
        <div className="flex flex-wrap gap-1.5">
          {DATE_PRESETS.map((p) => (
            <button
              key={p.id}
              onClick={() => handlePreset(p.id)}
              className={`rounded-full px-3.5 py-1.5 text-xs font-semibold transition-all ${
                datePreset === p.id
                  ? "bg-brand-600 text-white shadow-sm"
                  : "bg-gray-100 text-gray-600 hover:bg-gray-200"
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>

        {datePreset === "custom" && (
          <div className="flex flex-wrap items-center gap-2">
            <input
              type="date"
              value={localFrom}
              onChange={(e) => setLocalFrom(e.target.value)}
              className="rounded-lg border border-gray-300 px-2.5 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-brand-400"
            />
            <span className="text-xs text-gray-400">até</span>
            <input
              type="date"
              value={localTo}
              onChange={(e) => setLocalTo(e.target.value)}
              className="rounded-lg border border-gray-300 px-2.5 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-brand-400"
            />
            <button
              onClick={applyCustom}
              disabled={!localFrom || !localTo}
              className="rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-700 disabled:opacity-50"
            >
              Aplicar
            </button>
          </div>
        )}
      </div>

      {/* 2. Top KPI bar — full base status at a glance */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <KPICard
          label="Clientes na base"
          value={stats.totalCustomers.toLocaleString("pt-BR")}
          sub="Inclui Foocci + importados"
          accent="brand"
          loading={loading}
        />
        <KPICard
          label="Quentes"
          value={stats.ativoCustomers.toLocaleString("pt-BR")}
          pct={ativoPct}
          sub={`Compraram nos últ. ${HOT_DAYS} dias`}
          accent="green"
          loading={loading}
          onClick={onSegmentClick ? () => onSegmentClick("quente") : undefined}
          ctaLabel={onSegmentClick ? "Ver quentes" : undefined}
        />
        <KPICard
          label="Mornos"
          value={stats.mornoCustomers.toLocaleString("pt-BR")}
          pct={mornoPct}
          sub={`${HOT_DAYS + 1}–${WARM_DAYS} dias sem comprar`}
          accent="yellow"
          loading={loading}
          onClick={onSegmentClick ? () => onSegmentClick("morno") : undefined}
          ctaLabel={onSegmentClick ? "Ver mornos" : undefined}
        />
        <KPICard
          label="Frios"
          value={stats.frioCustomers.toLocaleString("pt-BR")}
          pct={frioPct}
          sub={`Mais de ${WARM_DAYS} dias sem comprar`}
          accent="red"
          loading={loading}
          onClick={onSegmentClick ? () => onSegmentClick("frio") : undefined}
          ctaLabel={onSegmentClick ? "Ver frios" : undefined}
        />
        <KPICard
          label="Perdidos"
          value={perdidosCustomers.toLocaleString("pt-BR")}
          pct={perdidoPct}
          sub={`Mais de ${LOST_DAYS} dias sem comprar`}
          accent="gray"
          loading={loading}
          onClick={onSegmentClick ? () => onSegmentClick("frio") : undefined}
          ctaLabel={onSegmentClick ? "Ver frios" : undefined}
        />
        <KPICard
          label={newCustomersLabel}
          value={stats.newCustomers.toLocaleString("pt-BR")}
          sub={newCustomersSub}
          accent="blue"
          loading={loading}
          onClick={onSegmentClick ? () => onSegmentClick("novos") : undefined}
          ctaLabel={onSegmentClick ? "Ver novos" : undefined}
        />
      </div>

      {/* 3. Receita gerada pelo CRM (chart + summary) */}
      <RevenueBlock
        revenueSummary={revenueSummary ?? null}
        revenueSummaryLoading={!!revenueSummaryLoading}
      />

      {/* 4. Clientes mais valiosos (replaces redundant temperature strip) */}
      <TopCustomersBlock data={topCustomers ?? null} loading={!!topCustomersLoading} />

      {/* 5. Programa de relacionamento */}
      <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-widest text-gray-400 mb-4">
          Programa de relacionamento
        </p>
        {totalSegmented === 0 ? (
          <p className="text-sm text-gray-400">Nenhum cliente ainda.</p>
        ) : (
          <>
            <div className="space-y-2">
              {stats.segments.map(({ tier, count }) => {
                const cfg = TIER_CONFIG[tier];
                const pct = totalSegmented > 0 ? Math.round((count / totalSegmented) * 100) : 0;
                return (
                  <div key={tier} className="flex items-center gap-3">
                    <span className="w-[80px] shrink-0 text-xs font-semibold text-gray-600">
                      {cfg.icon} {cfg.label}
                    </span>
                    <span className={`text-sm font-bold ${cfg.text} w-16 shrink-0`}>
                      {count.toLocaleString("pt-BR")}
                    </span>
                    <span className="text-xs text-gray-400 w-10 shrink-0">{pct}%</span>
                    <div className="flex-1 h-1.5 rounded-full bg-gray-100 overflow-hidden">
                      <div
                        className={`h-full rounded-full ${cfg.bar} transition-all`}
                        style={{ width: count > 0 ? `${Math.max(pct, 2)}%` : "0%" }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
            {stats.segments.find((s) => s.tier === "BRONZE")?.count === totalSegmented && totalSegmented > 0 && (
              <p className="mt-3 text-[11px] text-amber-700 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2">
                💡 Quase toda a base ainda está no Bronze. Há oportunidade de desenvolver clientes recorrentes.
              </p>
            )}
          </>
        )}
      </div>

      {/* 6. Oportunidades de receita (compact) */}
      {actions.length > 0 && (
        <CompactOpportunitiesSection
          actions={actions}
          onNavigateToTab={onNavigateToTab ?? (() => {})}
        />
      )}

      {/* 7. Configurações pendentes (bottom) */}
      {actions.length > 0 && (
        <ConfigAlertsSection
          actions={actions}
          onNavigateToTab={onNavigateToTab ?? (() => {})}
        />
      )}

    </div>
  );
}
