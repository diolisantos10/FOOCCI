"use client";

import { useState } from "react";
import type { OverviewStats, CustomerTier } from "@/services/crm/CRMService";
import type { CrmAction, CrmActionType, ActionPriority } from "@/services/crm/CrmActionCenterService";

// ── Config ────────────────────────────────────────────────────────────────────

const TIER_CONFIG: Record<CustomerTier, { label: string; icon: string; bar: string; text: string }> = {
  DIAMANTE: { label: "Diamante", icon: "💎", bar: "bg-cyan-400",   text: "text-cyan-700"   },
  OURO:     { label: "Ouro",     icon: "🥇", bar: "bg-amber-400",  text: "text-amber-700"  },
  PRATA:    { label: "Prata",    icon: "🥈", bar: "bg-gray-400",   text: "text-gray-600"   },
  BRONZE:   { label: "Bronze",   icon: "🥉", bar: "bg-orange-400", text: "text-orange-700" },
};

// ── Date filter ───────────────────────────────────────────────────────────────

export type DateFilterPreset = "total" | "month" | "year" | "custom";

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
    </div>
  );
}

function ActionCenterSection({
  actions,
  onNavigateToTab,
}: {
  actions: CrmAction[];
  onNavigateToTab: (tab: "campanhas" | "customers") => void;
}) {
  const [expanded, setExpanded] = useState(false);
  if (actions.length === 0) return null;

  const highCount = actions.filter((a) => a.priority === "HIGH").length;
  const visible = expanded ? actions : actions.slice(0, 3);

  return (
    <div className="rounded-2xl border border-brand-100 bg-white p-5 shadow-sm">
      <div className="flex items-center justify-between mb-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-gray-400">
            Próximas ações recomendadas
          </p>
          {highCount > 0 && (
            <p className="text-[10px] text-red-600 mt-0.5">{highCount} de alta prioridade</p>
          )}
        </div>
        <span className="rounded-full bg-brand-50 px-2.5 py-0.5 text-xs font-semibold text-brand-700">
          {actions.length} ação{actions.length !== 1 ? "ões" : ""}
        </span>
      </div>
      <div className="space-y-3">
        {visible.map((action) => (
          <ActionCard key={action.id} action={action} onNavigateToTab={onNavigateToTab} />
        ))}
      </div>
      {actions.length > 3 && (
        <button
          onClick={() => setExpanded((v) => !v)}
          className="mt-3 w-full rounded-lg border border-gray-100 py-2 text-xs font-semibold text-gray-500 hover:bg-gray-50 transition-colors"
        >
          {expanded ? "Ver menos" : `Ver mais ${actions.length - 3} ação${actions.length - 3 !== 1 ? "ões" : ""}`}
        </button>
      )}
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
}: {
  label: string;
  value: string | number;
  sub?: string;
  accent?: "green" | "yellow" | "red" | "blue" | "brand";
  loading?: boolean;
}) {
  const accentClass = {
    green:  "text-green-700",
    yellow: "text-yellow-600",
    red:    "text-red-600",
    blue:   "text-blue-700",
    brand:  "text-brand-700",
  }[accent ?? "brand"] ?? "text-brand-700";

  return (
    <div className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
      {loading ? (
        <div className="h-8 w-16 animate-pulse rounded bg-gray-100" />
      ) : (
        <p className={`text-2xl font-extrabold ${accentClass}`}>{value}</p>
      )}
      <p className="mt-0.5 text-xs font-semibold text-gray-600">{label}</p>
      {sub && <p className="mt-1 text-[10px] text-gray-400">{sub}</p>}
    </div>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────

export function OverviewTab({
  stats,
  opportunitiesCount,
  actions = [],
  onNavigateToTab,
  loading,
  datePreset,
  customFrom,
  customTo,
  onDateChange,
}: {
  stats: OverviewStats;
  opportunitiesCount: number;
  actions?: CrmAction[];
  onNavigateToTab?: (tab: "campanhas" | "customers") => void;
  loading: boolean;
  datePreset: DateFilterPreset;
  customFrom: string;
  customTo: string;
  onDateChange: (preset: DateFilterPreset, customFrom?: string, customTo?: string) => void;
}) {
  const [localFrom, setLocalFrom] = useState(customFrom);
  const [localTo,   setLocalTo]   = useState(customTo);

  // Temperature bar calculations
  const tempTotal = stats.ativoCustomers + stats.mornoCustomers + stats.frioCustomers;
  const ativoPct  = tempTotal > 0 ? Math.round((stats.ativoCustomers / tempTotal) * 100) : 0;
  const mornoPct  = tempTotal > 0 ? Math.round((stats.mornoCustomers / tempTotal) * 100) : 0;
  const frioPct   = tempTotal > 0 ? Math.round((stats.frioCustomers  / tempTotal) * 100) : 0;

  // Channel calculations
  const totalChannelCustomers = stats.deliveryOnlyCustomers + stats.dineInOnlyCustomers + stats.bothChannelsCustomers;

  const totalSegmented = stats.segments.reduce((s, x) => s + x.count, 0);

  const DATE_PRESETS: { id: DateFilterPreset; label: string }[] = [
    { id: "total",  label: "Total"         },
    { id: "month",  label: "Este mês"      },
    { id: "year",   label: "Este ano"      },
    { id: "custom", label: "Personalizado" },
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
    datePreset === "month"  ? "Novos (mês)"     :
    datePreset === "year"   ? "Novos (ano)"      :
    datePreset === "custom" ? "Novos (período)"  :
                              "Novos clientes";

  return (
    <div className="space-y-6">

      {/* ── Date filter ──────────────────────────────────────────────────── */}
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

      {/* ── KPI grid (5 cards) ───────────────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        <KPICard
          label="Total"
          value={stats.totalCustomers}
          accent="brand"
          loading={loading}
        />
        <KPICard
          label="Quentes"
          value={stats.ativoCustomers}
          sub="≤ 30 dias"
          accent="green"
          loading={loading}
        />
        <KPICard
          label="Mornos"
          value={stats.mornoCustomers}
          sub="31–60 dias"
          accent="yellow"
          loading={loading}
        />
        <KPICard
          label="Frios"
          value={stats.frioCustomers}
          sub="> 60 dias"
          accent="red"
          loading={loading}
        />
        <KPICard
          label={newCustomersLabel}
          value={stats.newCustomers}
          accent="blue"
          loading={loading}
        />
      </div>

      {/* ── Action Center ───────────────────────────────────────────────── */}
      {actions.length > 0 && (
        <ActionCenterSection
          actions={actions}
          onNavigateToTab={onNavigateToTab ?? (() => {})}
        />
      )}

      {/* ── Temperatura da base ──────────────────────────────────────────── */}
      <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-widest text-gray-400 mb-3">
          Temperatura da base
        </p>
        {tempTotal === 0 ? (
          <p className="text-sm text-gray-400">Nenhum cliente com pedidos ainda.</p>
        ) : (
          <>
            <div className="flex h-3 w-full overflow-hidden rounded-full bg-gray-100">
              <div className="bg-green-500 transition-all"  style={{ width: `${ativoPct}%` }} />
              <div className="bg-yellow-400 transition-all" style={{ width: `${mornoPct}%` }} />
              <div className="bg-red-400 transition-all"    style={{ width: `${frioPct}%`  }} />
            </div>
            <div className="mt-2.5 flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-600">
              <span className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-green-500" />
                🔥 Quente: {ativoPct}% ({stats.ativoCustomers})
              </span>
              <span className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-yellow-400" />
                🟡 Morno: {mornoPct}% ({stats.mornoCustomers})
              </span>
              <span className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-red-400" />
                🔴 Frio: {frioPct}% ({stats.frioCustomers})
              </span>
            </div>
          </>
        )}
      </div>

      {/* ── Canal de pedidos (por clientes únicos) ────────────────────────── */}
      <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-widest text-gray-400 mb-3">
          Canal de pedidos
        </p>
        <p className="text-[10px] text-gray-400 mb-3">Clientes únicos por canal preferido</p>
        {totalChannelCustomers === 0 ? (
          <p className="text-sm text-gray-400">Nenhum pedido registrado ainda.</p>
        ) : (
          <div className="grid grid-cols-3 gap-3">
            <div className="rounded-xl bg-blue-50 p-3">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-blue-500 mb-1">🛵 Só Delivery</p>
              <p className="text-xl font-extrabold text-blue-700">{stats.deliveryOnlyCustomers.toLocaleString("pt-BR")}</p>
              <p className="text-[10px] text-blue-400">clientes</p>
            </div>
            <div className="rounded-xl bg-amber-50 p-3">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-amber-600 mb-1">🍽️ Só Presencial</p>
              <p className="text-xl font-extrabold text-amber-700">{stats.dineInOnlyCustomers.toLocaleString("pt-BR")}</p>
              <p className="text-[10px] text-amber-500">clientes</p>
            </div>
            <div className="rounded-xl bg-purple-50 p-3">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-purple-600 mb-1">🔀 Ambos</p>
              <p className="text-xl font-extrabold text-purple-700">{stats.bothChannelsCustomers.toLocaleString("pt-BR")}</p>
              <p className="text-[10px] text-purple-400">clientes</p>
            </div>
          </div>
        )}
      </div>

      {/* ── Segmentos ────────────────────────────────────────────────────── */}
      <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-widest text-gray-400 mb-4">
          Distribuição por segmento
        </p>

        {totalSegmented === 0 ? (
          <p className="text-sm text-gray-400">Nenhum cliente ainda.</p>
        ) : (
          <div className="space-y-3">
            {stats.segments.map(({ tier, count }) => {
              const cfg = TIER_CONFIG[tier];
              const pct = totalSegmented > 0 ? Math.round((count / totalSegmented) * 100) : 0;
              return (
                <div key={tier} className="flex items-center gap-3">
                  <span className="w-[68px] shrink-0 text-xs font-semibold text-gray-600">
                    {cfg.icon} {cfg.label}
                  </span>
                  <div className="flex-1 h-2.5 rounded-full bg-gray-100 overflow-hidden">
                    <div
                      className={`h-full rounded-full ${cfg.bar} transition-all`}
                      style={{ width: count > 0 ? `${Math.max(pct, 2)}%` : "0%" }}
                    />
                  </div>
                  <span className={`w-8 shrink-0 text-right text-xs font-bold ${cfg.text}`}>
                    {count}
                  </span>
                  <span className="w-8 shrink-0 text-right text-[10px] text-gray-400">
                    {pct}%
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>

    </div>
  );
}
