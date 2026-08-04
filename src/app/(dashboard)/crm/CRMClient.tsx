"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import type { CRMCustomer, Opportunity, CustomerTier, OverviewStats } from "@/services/crm/CRMService";
import type { CrmAction } from "@/services/crm/CrmActionCenterService";
import { renderCrmMessage } from "@/services/crm/renderCrmMessage";
import {
  COUPON_PERCENT_OPTIONS, COUPON_FIXED_OPTIONS, couponLabel,
  getReadyMadeCampaign, getReadyMadeMessageVariants, getReadyMadeTiming, CADENCE_EXPLAINER,
  READY_MADE_CAMPAIGNS,
  type CouponType, type ReadyMadeCoupon,
} from "@/services/crm/readyMadeCampaigns";
import { parseMessagePool, phraseKey, MAX_CUSTOM_PHRASES } from "@/services/crm/crmMessagePool";
import { TIER_COUPON_CAMPAIGN_IDS } from "@/services/crm/readyMadeCampaigns";

// Ids of the "fixed" ready-made campaigns — used to badge a row as Fixa vs Personalizada.
const READY_MADE_ID_SET = new Set(READY_MADE_CAMPAIGNS.map((c) => c.id));
const isFixedCampaign = (templateId: string | null | undefined): boolean =>
  !!templateId && READY_MADE_ID_SET.has(templateId);
import { ReadyMadeCampaignsSection, type ReadyMadeState } from "./ReadyMadeCampaignsSection";
import { CuponsTab } from "./CuponsTab";
import { ImportModal } from "./ImportModal";
import { OverviewTab, RevenueBlock, type DateFilterPreset } from "./OverviewTab";
import CrmCampaignAI from "./CrmCampaignAI";
import { ContactBaseHealthPanel } from "./ContactBaseHealthPanel";
import { ConversoesTab } from "./ConversoesTab";
import { MigracaoTab } from "./MigracaoTab";
import { ProgramaTab } from "./ProgramaTab";
import { ReviewRequestModal } from "./ReviewRequestModal";
import { NewCustomerButton } from "@/app/(dashboard)/customers/NewCustomerButton";
import { isGuestIdentifier } from "@/lib/guest";

// ── Label maps ─────────────────────────────────────────────────────────────────

const TIER_CONFIG: Record<CustomerTier, { label: string; bg: string; text: string; icon: string }> = {
  DIAMANTE: { label: "Diamante", bg: "bg-cyan-100",   text: "text-cyan-700",   icon: "💎" },
  OURO:     { label: "Ouro",     bg: "bg-amber-100",  text: "text-amber-700",  icon: "🥇" },
  PRATA:    { label: "Prata",    bg: "bg-line2",   text: "text-ink2",   icon: "🥈" },
  BRONZE:   { label: "Bronze",   bg: "bg-brand-100", text: "text-brand-700", icon: "🥉" },
};


const CUSTOMER_FILTER_LABELS: Record<string, string> = {
  all:           "Todos os clientes",
  quente:        "🔥 Quentes (≤30d)",
  morno:         "🌡️ Mornos (31–60d)",
  frio:          "🥶 Frios (61–120d)",
  perdido:       "💤 Perdidos (120d+)",
  inactive:      "Inativos 30d+",
  neverOrdered:  "Nunca pediu",
  firstTime:     "1º pedido",
  recent:        "Recentes",
  "tier-diamante": "💎 Diamante",
  "tier-ouro":     "🥇 Ouro",
  "tier-prata":    "🥈 Prata",
  "tier-bronze":   "🥉 Bronze",
};

type CRMSortKey = "spend" | "orders" | "lastOrder" | "name";
type CRMSortDir = "asc" | "desc";

const CRM_SORT_OPTS: { value: string; label: string }[] = [
  { value: "spend-desc",     label: "Maior gasto"                },
  { value: "spend-asc",      label: "Menor gasto"                },
  { value: "orders-desc",    label: "Mais pedidos"               },
  { value: "orders-asc",     label: "Menos pedidos"              },
  { value: "lastOrder-desc", label: "Última compra mais recente" },
  { value: "lastOrder-asc",  label: "Última compra mais antiga"  },
  { value: "name-asc",       label: "Nome A-Z"                   },
  { value: "name-desc",      label: "Nome Z-A"                   },
];

function applyCRMSort(
  customers: import("@/services/crm/CRMService").CRMCustomer[],
  sortValue: string,
): import("@/services/crm/CRMService").CRMCustomer[] {
  const parts   = sortValue.split("-");
  const key     = parts[0] as CRMSortKey;
  const dir     = parts[1] as CRMSortDir;
  const mult    = dir === "asc" ? 1 : -1;
  return [...customers].sort((a, b) => {
    if (key === "name")      return a.name.localeCompare(b.name, "pt-BR") * mult;
    if (key === "orders")    return (a.totalOrders - b.totalOrders) * mult;
    if (key === "lastOrder") {
      const ta = a.lastOrderAt ? new Date(a.lastOrderAt).getTime() : 0;
      const tb = b.lastOrderAt ? new Date(b.lastOrderAt).getTime() : 0;
      return (ta - tb) * mult;
    }
    return (a.totalSpend - b.totalSpend) * mult;
  });
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function formatPhone(phone: string) {
  if (!phone || isGuestIdentifier(phone)) return "—";
  const d = phone.replace(/\D/g, "");
  if (d.length === 13) return `+${d.slice(0,2)} (${d.slice(2,4)}) ${d.slice(4,9)}-${d.slice(9)}`;
  return phone;
}

function formatCurrency(v: number) {
  return v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function relativeDate(iso: string | null): string {
  if (!iso) return "—";
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  if (days === 0) return "Hoje";
  if (days === 1) return "Ontem";
  if (days < 30)  return `${days}d atrás`;
  if (days < 365) return `${Math.floor(days / 30)}m atrás`;
  return `${Math.floor(days / 365)}a atrás`;
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function TierBadge({ tier }: { tier: CustomerTier }) {
  const cfg = TIER_CONFIG[tier];
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-bold ${cfg.bg} ${cfg.text}`}>
      {cfg.icon} {cfg.label}
    </span>
  );
}

// ── Custom Action types ───────────────────────────────────────────────────────

// ── Campaign types ────────────────────────────────────────────────────────────

type CampaignRecipientRow = {
  id:            string;
  customerId:    string;
  customerName:  string;
  customerPhone: string;
  messageText:   string;
  status:        string;
};

type CampaignHistoryRow = {
  id:             string;
  name:           string;
  objective:      string | null;
  targetSegment:  string | null;
  templateId:     string | null;
  channel:        string;
  status:         string;
  totalAudience:  number;
  totalSent:      number;
  totalFailed:    number;
  totalResponded: number;
  totalConverted: number;
  totalRevenue:   number;
  scheduledAt:    string | null;
  scheduleConfig: Record<string, unknown> | null;
  createdAt:      string;
  sentAt:         string | null;
  /** Live execution count for SENDING campaigns — messages still in PENDING state. */
  pendingCount?:  number;
  /** Per-reason failure count, populated by the campaigns list API. */
  failureBreakdown?: Record<string, number> | null;
};

type ActivityRow = {
  id:            string;
  campaignId:    string | null;
  campaignName:  string;
  customerName:  string | null;
  customerPhone: string | null;
  messageText:   string | null;
  status:        string;
  kind:          string;
  badge:         string;
  at:            string;
  converted:     boolean;
  revenue:       number | null;
};

type CampaignExecutionRow = {
  id:               string;
  customerId:       string;
  customerName:     string | null;
  customerPhone:    string | null;
  messageText:      string | null;
  status:           string;
  sentAt:           string | null;
  failedReason:     string | null;
  errorMessage?:    string | null;
  converted:        boolean;
  convertedAt:      string | null;
  revenue:          number | null;
  convertedOrderId: string | null;
  classification?:  { category: string; kind: string; badge: string } | null;
};

type ReasonGroup = {
  category: string; badge: string; count: number; kind: string;
  retryability?: string; retryabilityLabel?: string;
};

type CampaignPerformance = {
  audience: number; sent: number; blockedSafety: number; failedProvider: number;
  skipped?: number; recoverableLater?: number;
  read: number; responded: number; converted: number; conversionRate: number;
  reasonGroups: ReasonGroup[];
};

type CycleSummary = {
  sent: number; blockedSafety: number; failedProvider: number;
  skipped?: number; recoverableLater?: number;
  reasonGroups: ReasonGroup[];
};

type CampaignDetail = {
  id:             string;
  name:           string;
  objective:      string | null;
  channel:        string;
  targetSegment:  string | null;
  templateId:     string | null;
  status:         string;
  message:        string;
  scheduledAt:    string | null;
  scheduleConfig: Record<string, unknown> | null;
  audienceConfig: Record<string, unknown> | null;
  totalAudience:  number;
  totalSent:      number;
  totalFailed:    number;
  totalRead:      number;
  totalResponded: number;
  totalConverted: number;
  totalRevenue:   number;
  createdAt:      string;
  sentAt:         string | null;
  lastRunAt:      string | null;
  executions:     CampaignExecutionRow[];
  performance?:   CampaignPerformance | null;
  currentCyclePerformance?: CycleSummary | null;
  eligibility?: EligibilityMetrics | null;
  safeSend?: { provider: string; maxPerCycle: number; note: string } | null;
  budget?: CampaignBudgetSnapshot | null;
};

type CampaignBudgetSnapshot = {
  enabled: boolean;
  providerMode: "META_CLOUD";
  distributionMode: "EQUAL" | "PRIORITY" | "MANUAL" | "AUDIENCE";
  globalDailyUsed?: number;
  globalDailyLimit?: number;
  globalCycleLimit?: number;
  remainingDailyBudget?: number | null;
  activeCampaigns?: number;
  campaign?: {
    dailyQuota: number;
    alreadySentToday: number;
    nextCycleAllocation: number;
    reason: string | null;
    reasonText: string;
  } | null;
};

type EligibilityMetrics = {
  audienceTotal: number;
  whatsAppEligible: number;
  sent: number;
  skipped: number;
  blockedSafety: number;
  providerFailures: number;
  recoverableFailures: number;
  permanentFailures: number;
  skippedBreakdown: { noPhone: number; invalidPhone: number; optOut: number; notContactable: number; otherNotEligible: number };
  failureBreakdown: { http400: number; http500: number; timeout: number; rateLimit: number; disconnected: number; auth: number; emptyMessage: number; unknown: number };
};

type ReprocessPlan = {
  campaignId: string;
  campaignName: string;
  instance: { name: string; state: string; connected: boolean };
  recoverableExecutions: number;
  distinctRecipients: number;
  duplicatesRemoved: number;
  alreadySentExcluded: number;
  eligibleToReprocess: number;
  batchLimit: number;
  nextBatch: Array<{ customerId: string | null; customerName: string; maskedPhone: string; reason: string; retryability: string }>;
  safeToSend: boolean;
  message: string;
};

// ── Custom action types ───────────────────────────────────────────────────────
type CustomActionRow = {
  id:            string;
  name:          string;
  objective:     string;
  targetSegment: string;
  channel:       string;
  message:       string;
  notes:         string | null;
  status:        string;
  createdAt:     string;
};

const OBJECTIVE_LABELS: Record<string, string> = {
  RECUPERAR:   "Recuperar clientes",
  RECOMPRA:    "Aumentar recompra",
  TICKET:      "Aumentar ticket médio",
  BEBIDA:      "Vender bebida",
  SOBREMESA:   "Vender sobremesa",
  AVALIACAO:   "Pedir avaliação",
  VIP:         "Valorizar clientes VIP",
  ANIVERSARIO: "Aniversário",
  OUTRO:       "Outro",
};

const SEGMENT_LABELS: Record<string, string> = {
  TODOS:             "Todos os clientes",
  QUENTE:            "Clientes quentes",
  MORNO:             "Clientes mornos",
  FRIO:              "Clientes frios",
  NOVOS:             "Novos clientes",
  RECORRENTES:       "Clientes recorrentes",
  VIP:               "Clientes VIP",
  PRIMEIRO_PEDIDO:   "Clientes com 1 pedido",
  INATIVO_X_DIAS:    "Clientes sem comprar há X dias",
  PRODUTO_ESPECIFICO:"Compraram produto/categoria específica",
  SEM_BEBIDA:        "Não compram bebida",
  SEM_SOBREMESA:     "Não compram sobremesa",
  PERSONALIZADO:     "Personalizado",
};

const CHANNEL_LABELS: Record<string, string> = {
  WHATSAPP:  "WhatsApp",
  MANUAL:    "Manual por enquanto",
  CRM_AGENT: "Agente CRM futuro",
};

// ── Create Action Modal ───────────────────────────────────────────────────────

type CreateActionFormErrors = Partial<Record<"name" | "objective" | "targetSegment" | "message", string>>;

function CreateActionModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (action: CustomActionRow) => void;
}) {
  const [name,            setName]            = useState("");
  const [objective,       setObjective]       = useState("");
  const [targetSegment,   setTargetSegment]   = useState("");
  const [channel,         setChannel]         = useState("WHATSAPP");
  const [message,         setMessage]         = useState("");
  const [notes,           setNotes]           = useState("");
  const [errors,          setErrors]          = useState<CreateActionFormErrors>({});
  const [saving,          setSaving]          = useState(false);
  const [copied,          setCopied]          = useState(false);
  const [audienceCount,   setAudienceCount]   = useState<number | null>(null);
  const [audienceLoading, setAudienceLoading] = useState(false);

  // Map segment values to audience API template names
  const SEGMENT_TEMPLATES: Record<string, string> = {
    FRIO:            "recuperar-frios",
    MORNO:           "reativar-mornos",
    PRIMEIRO_PEDIDO: "segunda-compra",
    VIP:             "clientes-vip",
    RECORRENTES:     "recorrente-sumido",
  };

  useEffect(() => {
    const tpl = SEGMENT_TEMPLATES[targetSegment];
    if (!tpl) { setAudienceCount(null); return; }
    setAudienceLoading(true);
    fetch(`/api/crm/audience?template=${tpl}`)
      .then((r) => r.ok ? r.json() : Promise.reject())
      .then((json: { data?: { count: number } }) => setAudienceCount(json.data?.count ?? null))
      .catch(() => setAudienceCount(null))
      .finally(() => setAudienceLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [targetSegment]);

  function validate(): CreateActionFormErrors {
    const e: CreateActionFormErrors = {};
    if (!name.trim())          e.name          = "Nome é obrigatório";
    if (!objective)            e.objective      = "Selecione um objetivo";
    if (!targetSegment)        e.targetSegment  = "Selecione um segmento";
    if (!message.trim())       e.message        = "Mensagem é obrigatória";
    return e;
  }

  async function handleSave() {
    const e = validate();
    if (Object.keys(e).length > 0) { setErrors(e); return; }
    setSaving(true);
    setErrors({});
    try {
      const res = await fetch("/api/crm/custom-actions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), objective, targetSegment, channel, message: message.trim(), notes: notes.trim() || null }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        const fieldErrs = (body as { details?: Record<string, string[]> }).details ?? {};
        const mapped: CreateActionFormErrors = {};
        if (fieldErrs.name?.[0])          mapped.name          = fieldErrs.name[0];
        if (fieldErrs.objective?.[0])     mapped.objective     = fieldErrs.objective[0];
        if (fieldErrs.targetSegment?.[0]) mapped.targetSegment = fieldErrs.targetSegment[0];
        if (fieldErrs.message?.[0])       mapped.message       = fieldErrs.message[0];
        setErrors(Object.keys(mapped).length > 0 ? mapped : { name: "Erro ao salvar. Tente novamente." });
        return;
      }
      const json = await res.json();
      onCreated(json.data as CustomActionRow);
      onClose();
    } finally {
      setSaving(false);
    }
  }

  function copyMessage() {
    navigator.clipboard.writeText(message);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  const VARIABLE_HINTS = ["{nome}", "{restaurante}", "{ultimo_pedido}", "{produto_favorito}"];

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-ink/45 p-4" onClick={onClose}>
      <div
        className="w-full max-w-lg rounded-2xl bg-paper shadow-xl overflow-hidden flex flex-col max-h-[90vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-line shrink-0">
          <div>
            <h2 className="text-base font-bold text-ink">Salvar modelo de mensagem</h2>
            <p className="text-xs text-muted mt-0.5">Rascunho — não envia mensagens automaticamente</p>
          </div>
          <button onClick={onClose} className="rounded-full p-1.5 text-muted hover:bg-[#F4F4F2] hover:text-ink2 transition-colors">
            <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Body — scrollable */}
        <div className="overflow-y-auto p-5 space-y-4 flex-1">

          {/* 1. Nome */}
          <div>
            <label className="mb-1 block text-xs font-semibold text-ink2">
              Nome da ação <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ex: Reativação de clientes do almoço"
              className={`w-full rounded-xl border px-3 py-2.5 text-sm text-ink focus:outline-none focus:ring-2 transition ${
                errors.name ? "border-red-300 focus:ring-red-100" : "border-line2 focus:border-brand-400 focus:ring-brand-100"
              }`}
            />
            {errors.name && <p className="mt-1 text-xs text-red-500">{errors.name}</p>}
          </div>

          {/* 2. Objetivo */}
          <div>
            <label className="mb-1 block text-xs font-semibold text-ink2">
              Objetivo <span className="text-red-500">*</span>
            </label>
            <select
              value={objective}
              onChange={(e) => setObjective(e.target.value)}
              className={`w-full rounded-xl border px-3 py-2.5 text-sm text-ink bg-paper focus:outline-none focus:ring-2 transition ${
                errors.objective ? "border-red-300 focus:ring-red-100" : "border-line2 focus:border-brand-400 focus:ring-brand-100"
              }`}
            >
              <option value="">Selecione um objetivo</option>
              {Object.entries(OBJECTIVE_LABELS).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </select>
            {errors.objective && <p className="mt-1 text-xs text-red-500">{errors.objective}</p>}
          </div>

          {/* 3. Segmento */}
          <div>
            <label className="mb-1 block text-xs font-semibold text-ink2">
              Público-alvo / Segmento <span className="text-red-500">*</span>
            </label>
            <select
              value={targetSegment}
              onChange={(e) => setTargetSegment(e.target.value)}
              className={`w-full rounded-xl border px-3 py-2.5 text-sm text-ink bg-paper focus:outline-none focus:ring-2 transition ${
                errors.targetSegment ? "border-red-300 focus:ring-red-100" : "border-line2 focus:border-brand-400 focus:ring-brand-100"
              }`}
            >
              <option value="">Selecione um segmento</option>
              {Object.entries(SEGMENT_LABELS).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </select>
            {errors.targetSegment && <p className="mt-1 text-xs text-red-500">{errors.targetSegment}</p>}
            {targetSegment && (
              <p className="mt-1.5 text-[11px] text-muted">
                {audienceLoading
                  ? "Buscando estimativa…"
                  : audienceCount !== null
                    ? `≈ ${audienceCount} cliente${audienceCount !== 1 ? "s" : ""} neste segmento`
                    : "Estimativa não disponível para este segmento"}
              </p>
            )}
          </div>

          {/* 4. Canal */}
          <div>
            <label className="mb-1 block text-xs font-semibold text-ink2">Canal</label>
            <div className="flex gap-2">
              {Object.entries(CHANNEL_LABELS).map(([k, v]) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => setChannel(k)}
                  className={`flex-1 rounded-xl border py-2 text-xs font-semibold transition-colors ${
                    channel === k
                      ? "border-brand-400 bg-brand-50 text-brand-700"
                      : "border-line2 bg-paper text-ink2 hover:bg-[#FAFAF8]"
                  }`}
                >
                  {v}
                </button>
              ))}
            </div>
          </div>

          {/* 5. Mensagem */}
          <div>
            <div className="mb-1 flex items-center justify-between">
              <label className="text-xs font-semibold text-ink2">
                Mensagem <span className="text-red-500">*</span>
              </label>
              <button
                type="button"
                onClick={copyMessage}
                disabled={!message.trim()}
                className={`text-xs font-semibold transition-colors disabled:opacity-40 ${
                  copied ? "text-green-600" : "text-brand-600 hover:text-brand-700"
                }`}
              >
                {copied ? "✓ Copiado!" : "Copiar mensagem"}
              </button>
            </div>
            <textarea
              rows={5}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Oi {nome}! 👋 Temos uma oferta especial para você..."
              className={`w-full rounded-xl border px-3 py-2.5 text-sm text-ink resize-none focus:outline-none focus:ring-2 transition ${
                errors.message ? "border-red-300 focus:ring-red-100" : "border-line2 focus:border-brand-400 focus:ring-brand-100"
              }`}
            />
            {errors.message && <p className="mt-1 text-xs text-red-500">{errors.message}</p>}
            <div className="mt-1.5 flex flex-wrap gap-1">
              {VARIABLE_HINTS.map((v) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => setMessage((m) => m + v)}
                  className="rounded bg-[#F4F4F2] px-1.5 py-0.5 font-mono text-[10px] text-ink2 hover:bg-line2 transition-colors"
                >
                  {v}
                </button>
              ))}
              <span className="ml-1 text-[10px] text-muted">clique para inserir variável</span>
            </div>
          </div>

          {/* 6. Observações internas */}
          <div>
            <label className="mb-1 block text-xs font-semibold text-ink2">
              Observações internas <span className="font-normal text-muted">(opcional)</span>
            </label>
            <textarea
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Notas para sua equipe — não aparecem para o cliente"
              className="w-full rounded-xl border border-line2 px-3 py-2.5 text-sm text-ink resize-none focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-100 transition"
            />
          </div>

          {/* 7. Status info */}
          <div className="flex items-start gap-2 rounded-xl bg-amber-50 border border-amber-100 px-3 py-2.5">
            <span className="rounded-full bg-line2 px-2.5 py-0.5 text-xs font-bold text-ink2 shrink-0">Rascunho</span>
            <p className="text-xs text-amber-700">
              Salvo como modelo. Para enviar mensagens, crie uma <strong>Campanha</strong> — única ou recorrente.
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className="flex gap-2 border-t border-line px-5 py-4 shrink-0">
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="flex-1 rounded-xl border border-line2 py-2.5 text-sm font-semibold text-ink2 hover:bg-[#FAFAF8] disabled:opacity-50 transition-colors"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="flex-1 rounded-xl bg-brand-600 py-2.5 text-sm font-bold text-white hover:bg-brand-700 disabled:opacity-50 transition-colors"
          >
            {saving ? "Salvando…" : "Salvar rascunho"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Audience data types ───────────────────────────────────────────────────────

type CustomerPreview = {
  id:          string;
  name:        string;
  phone:       string;
  tier:        string;
  segment:     string;
  totalOrders: number;
  totalSpend:  number;
  lastOrderAt: string | null;
};

type AudienceData = {
  count:              number;
  customers:          CustomerPreview[];
  computed:           boolean;
  totalSegmentCount?: number;
  eligibleCount?:     number;
  exclusionBreakdown?: {
    noPhone:        number;
    notContactable: number;
    isGuest:        number;
  };
};

const TIER_BADGE: Record<string, { bg: string; text: string; icon: string }> = {
  DIAMANTE: { bg: "bg-cyan-100",   text: "text-cyan-700",   icon: "💎" },
  OURO:     { bg: "bg-amber-100",  text: "text-amber-700",  icon: "🥇" },
  PRATA:    { bg: "bg-line2",   text: "text-ink2",   icon: "🥈" },
  BRONZE:   { bg: "bg-brand-100", text: "text-brand-700", icon: "🥉" },
};

const SEGMENT_BADGE: Record<string, { bg: string; text: string; label: string }> = {
  QUENTE:      { bg: "bg-red-100",    text: "text-red-700",    label: "Quente"   },
  MORNO:       { bg: "bg-amber-100",  text: "text-amber-700",  label: "Morno"    },
  FRIO:        { bg: "bg-blue-100",   text: "text-blue-700",   label: "Frio"     },
  PERDIDO:     { bg: "bg-brand-100", text: "text-brand-600", label: "Perdido"  },
  SEM_PEDIDOS: { bg: "bg-[#F4F4F2]",   text: "text-muted",   label: "Sem pedidos" },
};

// ── Ações Tab types ───────────────────────────────────────────────────────────

type ActionReadiness = "SUGGESTED_TEMPLATE" | "DRAFT" | "READY_TO_CONFIGURE" | "COMING_SOON" | "NEEDS_DATA";

interface ActionTemplate {
  id: string;
  emoji: string;
  title: string;
  objective: string;
  targetLabel: string;
  description: string;
  readiness: ActionReadiness;
  hasAudienceQuery: boolean;
  audienceKey: keyof OverviewStats | "vip" | null;
  suggestedMessage: string;
}

const ACTION_TEMPLATES: ActionTemplate[] = [
  {
    id: "recuperar-frios",
    emoji: "🥶",
    title: "Recuperar clientes frios",
    objective: "Reconquistar clientes que somem há mais de 60 dias",
    targetLabel: "Frios (60d+)",
    description: "Clientes que não pedem há mais de 60 dias têm alto risco de perda definitiva. Uma oferta especial pode reativá-los.",
    readiness: "SUGGESTED_TEMPLATE",
    hasAudienceQuery: true,
    audienceKey: "frioCustomers",
    suggestedMessage: "Oi, {nome}! Tudo bem? 😊 Passando pra avisar que o {restaurante} está atendendo hoje pelo delivery. Se quiser fazer seu pedido, é só acessar: {link_cardapio}",
  },
  {
    id: "reativar-mornos",
    emoji: "🌡️",
    title: "Reativar clientes mornos",
    objective: "Engajar clientes que sumiram entre 31–60 dias",
    targetLabel: "Mornos (31–60d)",
    description: "Clientes mornos estão a um passo de se tornarem frios. Uma lembrança carinhosa no momento certo faz a diferença.",
    readiness: "SUGGESTED_TEMPLATE",
    hasAudienceQuery: true,
    audienceKey: "mornoCustomers",
    suggestedMessage: "Oi {nome}! 👋 Faz um tempo que não vemos você por aqui. Tem uma novidade deliciosa esperando — quer ver o cardápio atualizado?",
  },
  {
    id: "segunda-compra",
    emoji: "🔁",
    title: "Garantir a segunda compra",
    objective: "Fidelizar clientes após o primeiro pedido",
    targetLabel: "1º pedido (últimos 30d)",
    description: "O segundo pedido é o mais importante para criar um vínculo. Aborde novos clientes enquanto a experiência é fresca.",
    readiness: "SUGGESTED_TEMPLATE",
    hasAudienceQuery: true,
    audienceKey: "newCustomers",
    suggestedMessage: "Oi {nome}, que bom ter você conosco! 🎉 Como foi o seu primeiro pedido? Aproveite 15% de desconto no próximo com o código VOLTEMAIS!",
  },
  {
    id: "clientes-vip",
    emoji: "👑",
    title: "Clientes VIP — oferta exclusiva",
    objective: "Recompensar e reter clientes de alto valor",
    targetLabel: "Ouro + Diamante",
    description: "Seus melhores clientes merecem tratamento especial. Uma ação exclusiva reforça o relacionamento e aumenta a recorrência.",
    readiness: "SUGGESTED_TEMPLATE",
    hasAudienceQuery: true,
    audienceKey: "vip",
    suggestedMessage: "Olá {nome}! 💎 Você é um cliente especial e temos uma oferta exclusiva para você. Use o código VIP20 para 20% de desconto no próximo pedido — apenas para VIPs!",
  },
  {
    id: "pedido-avaliacao",
    emoji: "⭐",
    title: "Pedido de avaliação",
    objective: "Aumentar avaliações Google e iFood",
    targetLabel: "Clientes recentes (7d)",
    description: "Clientes satisfeitos raramente avaliam sem um lembrete. Peça no momento certo para maximizar as estrelas.",
    readiness: "SUGGESTED_TEMPLATE",
    hasAudienceQuery: true,
    audienceKey: "ativoCustomers",
    suggestedMessage: "Oi {nome}! 🌟 Adoramos ter você como cliente. Pode nos dar 5 minutinhos e deixar uma avaliação? Sua opinião faz toda a diferença para nós! ⭐⭐⭐⭐⭐",
  },
  {
    id: "aniversariantes",
    emoji: "🎂",
    title: "Mensagem de aniversário",
    objective: "Surpreender clientes no dia especial",
    targetLabel: "Aniversariantes do mês",
    description: "Mensagens de aniversário personalizadas geram alta taxa de conversão e fortalecem o vínculo emocional com o cliente.",
    readiness: "READY_TO_CONFIGURE",
    hasAudienceQuery: false,
    audienceKey: null,
    suggestedMessage: "Feliz aniversário, {nome}! 🎉🎂 Hoje é seu dia especial e queremos comemorar junto com você. Ganhe uma sobremesa grátis no próximo pedido — use o código ANIVERSARIO!",
  },
  {
    id: "aumentar-sobremesas",
    emoji: "🍰",
    title: "Aumentar pedidos de sobremesa",
    objective: "Elevar ticket médio com upsell de sobremesas",
    targetLabel: "Clientes sem sobremesa",
    description: "Clientes que nunca pediram sobremesas representam uma grande oportunidade de aumentar o ticket médio sem custo de aquisição.",
    readiness: "READY_TO_CONFIGURE",
    hasAudienceQuery: false,
    audienceKey: null,
    suggestedMessage: "Ei {nome}! 🍰 Você sabia que temos sobremesas irresistíveis? Adicione uma ao seu próximo pedido e ganhe 10% de desconto na sobremesa!",
  },
  {
    id: "aumentar-bebidas",
    emoji: "🥤",
    title: "Aumentar pedidos de bebida",
    objective: "Elevar ticket médio com upsell de bebidas",
    targetLabel: "Clientes sem bebidas",
    description: "Clientes que pedem apenas comida raramente adicionam bebidas. Uma oferta focada pode mudar esse padrão facilmente.",
    readiness: "READY_TO_CONFIGURE",
    hasAudienceQuery: false,
    audienceKey: null,
    suggestedMessage: "Oi {nome}! 🥤 Que tal uma bebida gelada com seu próximo pedido? Temos opções incríveis — adicione ao carrinho e ganhe frete grátis!",
  },
  {
    id: "carrinho-abandonado",
    emoji: "🛒",
    title: "Recuperar carrinho abandonado",
    objective: "Converter rascunhos iniciados mas não confirmados",
    targetLabel: "Rascunhos abandonados",
    description: "Clientes que iniciaram um pedido mas não concluíram estão a um passo da compra. Um lembrete gentil converte.",
    readiness: "COMING_SOON",
    hasAudienceQuery: false,
    audienceKey: null,
    suggestedMessage: "Ei {nome}, você esqueceu algo! 🛒 Seu pedido ainda está esperando. Finalize agora e ganhe frete grátis!",
  },
  {
    id: "recorrente-sumido",
    emoji: "🔔",
    title: "Recorrente sumido",
    objective: "Reativar clientes com histórico de recorrência",
    targetLabel: "Frequentes + frios",
    description: "Clientes que pediam regularmente e pararam merecem abordagem diferente — eles já confiam em você e são mais fáceis de recuperar.",
    readiness: "SUGGESTED_TEMPLATE",
    hasAudienceQuery: true,
    audienceKey: "mornoCustomers",
    suggestedMessage: "Oi {nome}! 👀 Notamos que você não aparece há um tempo. Saudade! Que tal fazer um pedido hoje? Tem novidades esperando por você.",
  },
  {
    id: "produto-favorito",
    emoji: "❤️",
    title: "Campanha produto favorito",
    objective: "Usar preferências para gerar recompra",
    targetLabel: "VIP com histórico de pedidos",
    description: "Clientes VIP têm padrões de consumo claros. Personalizar a oferta com o produto favorito aumenta muito a taxa de conversão.",
    readiness: "READY_TO_CONFIGURE",
    hasAudienceQuery: false,
    audienceKey: null,
    suggestedMessage: "Oi {nome}! ❤️ Sabemos que você adora [produto favorito]. Hoje temos uma condição especial exatamente para você — confira!",
  },
  {
    id: "alto-ticket",
    emoji: "💰",
    title: "Alto ticket — combo especial",
    objective: "Elevar o ticket médio com combos e extras",
    targetLabel: "Clientes com ticket baixo",
    description: "Clientes com ticket abaixo da média têm potencial de crescimento. Combos atrativos apresentam o cardápio completo de forma irresistível.",
    readiness: "COMING_SOON",
    hasAudienceQuery: false,
    audienceKey: null,
    suggestedMessage: "Ei {nome}! 🍽️ Montamos um combo especial para você economizar e comer mais! Confira os combos do dia com até 30% de desconto.",
  },
];

const READINESS_CONFIG: Record<ActionReadiness, { label: string; bg: string; text: string }> = {
  SUGGESTED_TEMPLATE: { label: "Sugerida",          bg: "bg-brand-100",   text: "text-brand-700"  },
  DRAFT:              { label: "Rascunho",           bg: "bg-[#F4F4F2]",    text: "text-ink2"   },
  READY_TO_CONFIGURE: { label: "Pronta p/ configurar", bg: "bg-green-100", text: "text-green-700" },
  COMING_SOON:        { label: "Em breve",           bg: "bg-amber-100",  text: "text-amber-700" },
  NEEDS_DATA:         { label: "Precisa de dados",   bg: "bg-[#F4F4F2]",    text: "text-muted"   },
};

// ── Action Config Drawer ───────────────────────────────────────────────────────

const MANUAL_AUDIENCE_OPTIONS: Array<{ id: string; label: string; emoji: string }> = [
  { id: "clientes-quentes", label: "Quentes — pedido ≤30d",          emoji: "🔥" },
  { id: "reativar-mornos",  label: "Mornos — sem pedido 31–60d",     emoji: "😶" },
  { id: "recuperar-frios",  label: "Frios — sem pedido 60d+",        emoji: "🥶" },
  { id: "segunda-compra",   label: "Novos — somente 1 pedido",        emoji: "🌱" },
  { id: "pedido-avaliacao", label: "Recentes — pedido nos últimos 7d", emoji: "⭐" },
  { id: "clientes-vip",     label: "VIP — Ouro e Diamante",           emoji: "👑" },
  { id: "aniversariantes",  label: "Aniversariantes do mês",          emoji: "🎂" },
  { id: "tier-bronze",      label: "Bronze",                           emoji: "🥉" },
  { id: "tier-prata",       label: "Prata",                            emoji: "🥈" },
  { id: "tier-ouro",        label: "Ouro",                             emoji: "🥇" },
  { id: "tier-diamante",    label: "Diamante",                         emoji: "💎" },
  { id: "todos-clientes",   label: "Todos os clientes",                emoji: "👥" },
];

function ActionConfigDrawer({
  template,
  onClose,
  onStartCampaign,
  onAfterCreate,
}: {
  template: ActionTemplate;
  onClose: () => void;
  onStartCampaign?: (campaignId: string, recipients: CampaignRecipientRow[]) => void;
  onAfterCreate?: () => void;
}) {
  const [message,  setMessage]  = useState(template.suggestedMessage);
  const [copied,   setCopied]   = useState(false);
  const [audience, setAudience] = useState<AudienceData | null>(null);
  const [loadingAudience, setLoadingAudience] = useState(false);
  const [preparing, setPreparing] = useState(false);
  const [prepError, setPrepError] = useState<string | null>(null);
  const [campaignName, setCampaignName] = useState(template.id === "custom" ? "" : template.title);
  const [linkedCouponCode, setLinkedCouponCode] = useState("");

  const isCustom = template.id === "custom";
  const [customAudienceId, setCustomAudienceId] = useState("");
  const audienceFetchId = isCustom
    ? (customAudienceId || null)
    : (template.hasAudienceQuery ? template.id : null);

  // Scheduling
  type SendMode = "now" | "scheduled_once" | "recurring";
  const [sendMode,        setSendMode]        = useState<SendMode>("now");
  const [scheduleDate,    setScheduleDate]    = useState("");      // "YYYY-MM-DD"
  const [scheduleTime,    setScheduleTime]    = useState("09:00");
  // Recurring config
  const [weekdays,        setWeekdays]        = useState<number[]>([1, 2, 3, 4, 5]);
  const [timeWindowStart, setTimeWindowStart] = useState("10:00");
  const [timeWindowEnd,   setTimeWindowEnd]   = useState("18:00");
  const [dailyLimit,      setDailyLimit]      = useState(20);
  const [priority,        setPriority]        = useState<"LOW" | "NORMAL" | "HIGH" | "CRITICAL">("NORMAL");
  // ── Governance / anti-spam ──
  const [familyKey,       setFamilyKey]       = useState("");
  const [dedupeByConcept, setDedupeByConcept] = useState(true);
  const [dedupeByMessage, setDedupeByMessage] = useState(true);
  const [dedupeWindowDays, setDedupeWindowDays] = useState(30);
  const [allowResend,     setAllowResend]     = useState(false);
  const [allowWeeklyOverride, setAllowWeeklyOverride] = useState(false);
  type EndCondition = "AUDIENCE_EXHAUSTED" | "END_DATE" | "MAX_TOTAL";
  const [endCondition, setEndCondition] = useState<EndCondition>("AUDIENCE_EXHAUSTED");
  const [endDate,      setEndDate]      = useState("");
  const [maxTotal,     setMaxTotal]     = useState(100);

  function toggleWeekday(day: number) {
    setWeekdays((prev) =>
      prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day].sort()
    );
  }

  useEffect(() => {
    if (!audienceFetchId) { setAudience(null); return; }
    setLoadingAudience(true);
    setAudience(null);
    fetch(`/api/crm/audience?template=${encodeURIComponent(audienceFetchId)}`)
      .then((r) => r.ok ? r.json() : Promise.reject())
      .then((json) => setAudience(json.data ?? null))
      .catch(() => {})
      .finally(() => setLoadingAudience(false));
  }, [audienceFetchId]);

  function copyMessage() {
    navigator.clipboard.writeText(message);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  function buildScheduledAt(): string | null {
    if (sendMode !== "scheduled_once" || !scheduleDate) return null;
    return new Date(`${scheduleDate}T${scheduleTime}:00`).toISOString();
  }

  async function handlePrepareCampaign() {
    if (!onStartCampaign && sendMode !== "recurring") return;
    if (isCustom && !customAudienceId) return;
    setPreparing(true);
    setPrepError(null);
    try {
      const scheduledAt = buildScheduledAt();
      const targetId = isCustom ? customAudienceId : template.id;

      const now = new Date();
      const pad = (n: number) => String(n).padStart(2, "0");
      const resolvedName = campaignName.trim() ||
        `Campanha sem nome — ${pad(now.getDate())}/${pad(now.getMonth() + 1)} ${pad(now.getHours())}:${pad(now.getMinutes())}`;

      const body: Record<string, unknown> = {
        name:            resolvedName,
        templateId:      targetId,
        targetSegment:   targetId,
        messageTemplate: message,
        objective:       template.objective,
        ...(linkedCouponCode.trim() ? { couponCode: linkedCouponCode.trim().toUpperCase() } : {}),
        // Governance: stable concept key + anti-spam dedupe policy.
        ...(familyKey.trim() ? { campaignFamilyKey: familyKey.trim() } : {}),
        dedupePolicy: { dedupeByConcept, dedupeByMessage, dedupeWindowDays: Math.max(0, dedupeWindowDays), allowResendToImpacted: allowResend },
      };

      if (sendMode === "recurring") {
        body.scheduleConfig = {
          mode:         "RECURRING",
          weekdays,
          timeWindow:   { start: timeWindowStart, end: timeWindowEnd },
          dailyLimit:   Math.max(1, Math.min(200, dailyLimit)),
          priority,
          allowWeeklyCustomerCapOverride: allowWeeklyOverride,
          endCondition,
          endDate:      endCondition === "END_DATE"   ? (endDate || null) : null,
          maxTotal:     endCondition === "MAX_TOTAL"  ? maxTotal          : null,
          timezone:     "America/Sao_Paulo",
        };
        body.audienceConfig = {
          templateId:         targetId,
          channel:            "WHATSAPP",
          excludeAlreadySent: true,
        };
      } else if (scheduledAt) {
        body.scheduledAt    = scheduledAt;
        body.scheduleConfig = { mode: "SCHEDULED_ONCE", scheduledAt };
      }

      const res = await fetch("/api/crm/campaigns", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify(body),
      });
      const json = await res.json() as { data?: { campaignId: string; recipients: CampaignRecipientRow[] }; error?: string };
      if (!res.ok || !json.data) {
        setPrepError("Erro ao preparar campanha. Tente novamente.");
        return;
      }
      if (sendMode === "recurring" || sendMode === "scheduled_once") {
        onClose();
        onAfterCreate?.();
      } else {
        onStartCampaign!(json.data.campaignId, json.data.recipients);
        onClose();
      }
    } catch {
      setPrepError("Falha de rede. Tente novamente.");
    } finally {
      setPreparing(false);
    }
  }

  const rc = READINESS_CONFIG[template.readiness];

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-ink/45 p-4" onClick={onClose}>
      <div
        className="w-full max-w-lg rounded-2xl bg-paper shadow-xl overflow-hidden flex flex-col max-h-[90vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-3 px-5 py-4 border-b border-line shrink-0">
          <div className="flex items-center gap-3">
            <span className="text-2xl">{template.emoji}</span>
            <div>
              <h2 className="text-base font-bold text-ink">{template.title}</h2>
              <p className="text-xs text-muted">{template.objective}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="shrink-0 rounded-full p-1.5 text-muted hover:bg-[#F4F4F2] hover:text-ink2 transition-colors"
          >
            <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="p-5 space-y-4 overflow-y-auto flex-1">
          {/* Campaign name */}
          <div>
            <label className="mb-1 block text-xs font-semibold text-ink2">
              Nome da campanha <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={campaignName}
              onChange={(e) => setCampaignName(e.target.value)}
              placeholder="Ex: Reativação frios — PROMO10"
              maxLength={120}
              className="w-full rounded-xl border border-line2 bg-[#FAFAF8] px-3 py-2.5 text-sm text-ink focus:border-brand-400 focus:bg-paper focus:outline-none focus:ring-2 focus:ring-brand-100 transition"
            />
            <p className="mt-1 text-[10px] text-muted">
              Use um nome fácil para identificar depois nos relatórios.
            </p>
          </div>

          {/* Info grid */}
          <div className="grid grid-cols-2 gap-3">
            {isCustom ? (
              <div className="col-span-2">
                <label className="block text-[10px] font-semibold uppercase tracking-wide text-muted mb-1.5">
                  Público alvo
                </label>
                <select
                  value={customAudienceId}
                  onChange={(e) => setCustomAudienceId(e.target.value)}
                  className="w-full rounded-xl border border-line2 bg-[#FAFAF8] px-3 py-2 text-sm text-ink focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-100"
                >
                  <option value="">Selecione o público…</option>
                  {MANUAL_AUDIENCE_OPTIONS.map((opt) => (
                    <option key={opt.id} value={opt.id}>
                      {opt.emoji} {opt.label}
                    </option>
                  ))}
                </select>
              </div>
            ) : (
              <div className="rounded-xl bg-[#FAFAF8] px-3 py-2.5">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-muted">Segmento alvo</p>
                <p className="mt-0.5 text-sm font-semibold text-ink">{template.targetLabel}</p>
              </div>
            )}
            <div className={`rounded-xl bg-[#FAFAF8] px-3 py-2.5 ${isCustom ? "col-span-2" : ""}`}>
              <p className="text-[10px] font-semibold uppercase tracking-wide text-muted">Canal</p>
              <div className="mt-0.5 flex items-center gap-1.5">
                <p className="text-sm font-semibold text-ink">WhatsApp</p>
                <span className="rounded-full bg-green-100 px-1.5 py-0.5 text-[9px] font-bold uppercase text-green-700">ativo</span>
              </div>
            </div>
          </div>

          {/* Audience counts — the key fix */}
          {(template.hasAudienceQuery || (isCustom && !!customAudienceId)) && (
            <div className="rounded-xl border border-line bg-[#FAFAF8] px-4 py-3 space-y-2">
              <p className="text-[10px] font-bold uppercase tracking-wide text-muted">Público estimado</p>
              {loadingAudience ? (
                <p className="text-xs text-muted">Calculando…</p>
              ) : !audience ? null : !audience.computed ? (
                <p className="text-xs text-muted">
                  {audience.totalSegmentCount != null && audience.totalSegmentCount > 0
                    ? `${audience.totalSegmentCount} clientes no segmento — dados de contato ainda não disponíveis para esta ação.`
                    : "Dados insuficientes para calcular o público desta ação."}
                </p>
              ) : (
                <>
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-ink2">No segmento</span>
                    <span className="font-bold text-ink">{audience.totalSegmentCount ?? audience.count}</span>
                  </div>
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-green-700">Elegíveis WhatsApp</span>
                    <span className="font-bold text-green-700">{audience.eligibleCount ?? audience.count}</span>
                  </div>
                  {(() => {
                    const excl = audience.exclusionBreakdown;
                    const excluded = (excl?.noPhone ?? 0) + (excl?.notContactable ?? 0);
                    if (excluded === 0) return null;
                    const reasons: string[] = [];
                    if (excl?.noPhone) reasons.push(`${excl.noPhone} sem telefone`);
                    if (excl?.notContactable) reasons.push(`${excl.notContactable} opt-out`);
                    return (
                      <p className="text-[10px] text-muted border-t border-line2 pt-1.5 mt-0.5">
                        {excluded} excluído{excluded !== 1 ? "s" : ""}: {reasons.join(", ")}
                      </p>
                    );
                  })()}
                </>
              )}
            </div>
          )}

          {/* Aviso de risco — campanhas para clientes frios (sem pedido há +60 dias) */}
          {(template.audienceKey === "frioCustomers" || (isCustom && customAudienceId === "recuperar-frios")) && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
              <p className="text-xs leading-relaxed text-amber-800">
                ⚠️ Clientes frios (sem pedido há +60 dias) têm maior risco de bloqueio — mantenha o volume baixo.
              </p>
            </div>
          )}

          {/* Customer preview list — only when computed and has eligible customers */}
          {(template.hasAudienceQuery || (isCustom && !!customAudienceId)) && audience?.computed && (audience.eligibleCount ?? audience.count) > 0 && (
            <div>
              <p className="mb-2 text-[10px] font-bold uppercase tracking-wide text-muted">
                Prévia do público elegível
              </p>
              {loadingAudience ? (
                <div className="py-4 text-center text-xs text-muted">Carregando clientes…</div>
              ) : audience.customers.length === 0 ? (
                <div className="rounded-xl bg-[#FAFAF8] px-4 py-3 text-xs text-muted">
                  Nenhum cliente elegível no momento.
                </div>
              ) : (
                <div className="max-h-48 overflow-y-auto space-y-1.5 rounded-xl border border-line p-2">
                  {audience.customers.map((c) => {
                    const tierCfg = TIER_BADGE[c.tier] ?? { bg: "bg-brand-100", text: "text-brand-700", icon: "🥉" };
                    const segCfg  = SEGMENT_BADGE[c.segment] ?? { bg: "bg-[#F4F4F2]", text: "text-muted", label: "—" };
                    return (
                      <div key={c.id} className="flex items-center gap-2 rounded-lg bg-[#FAFAF8] px-2.5 py-2">
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-semibold text-ink truncate">{c.name}</p>
                          <p className="text-[10px] text-muted">{c.phone}</p>
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          <span className={`rounded-full px-1.5 py-0.5 text-[9px] font-bold ${tierCfg.bg} ${tierCfg.text}`}>
                            {tierCfg.icon}
                          </span>
                          <span className={`rounded-full px-1.5 py-0.5 text-[9px] font-semibold ${segCfg.bg} ${segCfg.text}`}>
                            {segCfg.label}
                          </span>
                        </div>
                        <div className="text-right shrink-0">
                          <p className="text-[10px] font-semibold text-ink2">
                            R${c.totalSpend.toLocaleString("pt-BR", { minimumFractionDigits: 0 })}
                          </p>
                          <p className="text-[10px] text-muted">{c.totalOrders} pedidos</p>
                        </div>
                      </div>
                    );
                  })}
                  {(audience.eligibleCount ?? audience.count) > audience.customers.length && (
                    <p className="text-center text-[10px] text-muted py-1">
                      +{(audience.eligibleCount ?? audience.count) - audience.customers.length} clientes não exibidos
                    </p>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Message editor */}
          <div>
            <div className="mb-1.5 flex items-center justify-between">
              <p className="text-xs font-semibold text-ink2">
                Mensagem sugerida
                <span className="ml-1 font-normal text-muted">(edite à vontade)</span>
              </p>
            </div>
            <textarea
              rows={5}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              className="w-full rounded-xl border border-line2 bg-[#FAFAF8] px-3 py-2.5 text-sm text-ink focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-100 resize-none"
            />
            <p className="mt-1 text-[10px] text-muted">
              Use <code className="bg-[#F4F4F2] px-1 rounded">{"{nome}"}</code> para inserir o nome do cliente automaticamente.
            </p>
          </div>

          {/* Coupon attribution link (optional) */}
          <div>
            <label className="mb-1 block text-xs font-semibold text-ink2">
              Cupom vinculado{" "}
              <span className="font-normal text-muted">(opcional — para relatório de atribuição)</span>
            </label>
            <input
              type="text"
              value={linkedCouponCode}
              onChange={(e) => setLinkedCouponCode(e.target.value.toUpperCase())}
              placeholder="Ex: PROMO10"
              maxLength={40}
              className="w-full rounded-xl border border-line2 bg-[#FAFAF8] px-3 py-2.5 text-sm text-ink uppercase focus:border-brand-400 focus:bg-paper focus:outline-none focus:ring-2 focus:ring-brand-100 transition"
            />
            <p className="mt-1 text-[10px] text-muted">
              Se esta campanha usa um cupom, vincule-o aqui para ver a receita comprovada nos relatórios.
            </p>
          </div>

          {/* Governance: identity + anti-spam dedupe */}
          <div className="rounded-xl border border-line2 bg-[#FAFAF8] p-3">
            <p className="text-[11px] font-bold uppercase tracking-wide text-muted">Identidade & evitar repetição</p>
            <label className="mt-2 block text-[11px] font-semibold text-ink2">
              Identidade da campanha
              <input
                type="text"
                value={familyKey}
                onChange={(e) => setFamilyKey(e.target.value)}
                placeholder="ex: pascoa-2026 (sugerido pelo nome)"
                className="mt-1 w-full rounded-lg border border-line2 bg-paper px-2.5 py-1.5 text-xs lowercase focus:border-brand-400 focus:outline-none"
              />
            </label>
            <p className="mt-1 text-[10px] text-muted">Use para não reenviar a mesma campanha/conceito a quem já foi impactado — mesmo se a campanha for recriada.</p>
            <div className="mt-2 space-y-1.5">
              <label className="flex items-center gap-2 text-[11px] text-ink2">
                <input type="checkbox" checked={dedupeByConcept} onChange={(e) => setDedupeByConcept(e.target.checked)} /> Não reenviar para quem já recebeu esta campanha/conceito
              </label>
              <label className="flex items-center gap-2 text-[11px] text-ink2">
                <input type="checkbox" checked={dedupeByMessage} onChange={(e) => setDedupeByMessage(e.target.checked)} /> Não reenviar mensagem igual ou parecida
              </label>
              <label className="flex items-center gap-2 text-[11px] text-ink2">
                Janela de dedupe (dias)
                <input type="number" min={0} value={dedupeWindowDays} onChange={(e) => setDedupeWindowDays(Math.max(0, parseInt(e.target.value) || 0))}
                  className="w-20 rounded border border-line2 px-2 py-1 text-xs" />
              </label>
              <label className="flex items-center gap-2 text-[11px] text-amber-700">
                <input type="checkbox" checked={allowResend} onChange={(e) => setAllowResend(e.target.checked)} /> Permitir reenviar para já impactados (use com cuidado)
              </label>
            </div>
          </div>

          {/* Scheduling section */}
          <div className="rounded-xl border border-line bg-[#FAFAF8] px-4 py-3 space-y-3">
              <p className="text-[10px] font-bold uppercase tracking-wide text-muted">Tipo de campanha</p>

              {/* Mode selector — envio único / agendada / recorrente */}
              <div className="flex gap-1.5">
                {(["now", "scheduled_once", "recurring"] as const).map((mode) => {
                  const labels = { now: "Envio único", scheduled_once: "Agendada", recurring: "Recorrente" };
                  return (
                    <button
                      key={mode}
                      onClick={() => setSendMode(mode)}
                      className={`flex-1 rounded-lg py-2 text-xs font-semibold border transition-colors ${
                        sendMode === mode
                          ? "bg-brand-600 text-white border-brand-600"
                          : "bg-paper text-ink2 border-line2 hover:bg-[#FAFAF8]"
                      }`}
                    >
                      {labels[mode]}
                    </button>
                  );
                })}
              </div>

              {/* Friendly explainer per type */}
              <p className="text-[11px] text-muted">
                {sendMode === "now"
                  ? "Envia uma vez, agora, para o público selecionado."
                  : sendMode === "scheduled_once"
                    ? "Envia uma vez, na data e hora escolhidas."
                    : "Roda automaticamente e envia nos dias e horários definidos. Você pode pausar ou retomar quando quiser."}
              </p>

              {/* Scheduled once: date + time */}
              {sendMode === "scheduled_once" && (
                <div className="grid grid-cols-2 gap-2 pt-1">
                  <div>
                    <label className="block text-[10px] font-semibold text-muted mb-1">Data</label>
                    <input
                      type="date"
                      value={scheduleDate}
                      min={new Date().toISOString().split("T")[0]}
                      onChange={(e) => setScheduleDate(e.target.value)}
                      className="w-full rounded-lg border border-line2 bg-paper px-2.5 py-1.5 text-xs text-ink focus:border-brand-400 focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-semibold text-muted mb-1">Hora</label>
                    <input
                      type="time"
                      value={scheduleTime}
                      onChange={(e) => setScheduleTime(e.target.value)}
                      className="w-full rounded-lg border border-line2 bg-paper px-2.5 py-1.5 text-xs text-ink focus:border-brand-400 focus:outline-none"
                    />
                  </div>
                </div>
              )}

              {/* Recurring: full config */}
              {sendMode === "recurring" && (
                <div className="space-y-3 pt-1">
                  {/* Weekdays */}
                  <div>
                    <label className="block text-[10px] font-semibold text-muted mb-1.5">Dias da semana</label>
                    <div className="flex gap-1">
                      {WEEKDAY_LABELS.map((label, day) => (
                        <button
                          key={day}
                          onClick={() => toggleWeekday(day)}
                          className={`flex-1 rounded-lg py-1.5 text-[10px] font-bold border transition-colors ${
                            weekdays.includes(day)
                              ? "bg-brand-600 text-white border-brand-600"
                              : "bg-paper text-muted border-line2 hover:bg-[#FAFAF8]"
                          }`}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                    {weekdays.length === 0 && (
                      <p className="mt-1 text-[10px] text-red-500">Selecione pelo menos um dia</p>
                    )}
                  </div>

                  {/* Time window */}
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-[10px] font-semibold text-muted mb-1">Horário início</label>
                      <input
                        type="time"
                        value={timeWindowStart}
                        onChange={(e) => setTimeWindowStart(e.target.value)}
                        className="w-full rounded-lg border border-line2 bg-paper px-2.5 py-1.5 text-xs text-ink focus:border-brand-400 focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] font-semibold text-muted mb-1">Horário fim</label>
                      <input
                        type="time"
                        value={timeWindowEnd}
                        onChange={(e) => setTimeWindowEnd(e.target.value)}
                        className="w-full rounded-lg border border-line2 bg-paper px-2.5 py-1.5 text-xs text-ink focus:border-brand-400 focus:outline-none"
                      />
                    </div>
                  </div>

                  {/* Daily limit */}
                  <div>
                    <label className="block text-[10px] font-semibold text-muted mb-1">
                      Limite diário <span className="font-normal text-muted">(1–200)</span>
                    </label>
                    <input
                      type="number"
                      min={1}
                      max={200}
                      value={dailyLimit}
                      onChange={(e) => setDailyLimit(Math.max(1, Math.min(200, parseInt(e.target.value) || 1)))}
                      className="w-full rounded-lg border border-line2 bg-paper px-2.5 py-1.5 text-xs text-ink focus:border-brand-400 focus:outline-none"
                    />
                    <p className="mt-1 text-[10px] text-muted">Ritmo da campanha. O envio real também respeita o orçamento global do restaurante e o limite por cliente.</p>
                  </div>

                  {/* Priority */}
                  <div>
                    <label className="block text-[10px] font-semibold text-muted mb-1">Prioridade</label>
                    <select
                      value={priority}
                      onChange={(e) => setPriority(e.target.value as "LOW" | "NORMAL" | "HIGH" | "CRITICAL")}
                      className="w-full rounded-lg border border-line2 bg-paper px-2.5 py-1.5 text-xs text-ink focus:border-brand-400 focus:outline-none"
                    >
                      <option value="LOW">Baixa</option>
                      <option value="NORMAL">Normal</option>
                      <option value="HIGH">Alta (aniversário, pós-pedido, reativação)</option>
                      <option value="CRITICAL">Crítica (urgente)</option>
                    </select>
                    <p className="mt-1 text-[10px] text-muted">Na previsão de capacidade, campanhas de prioridade alta recebem orçamento primeiro.</p>
                  </div>

                  {/* Priority override */}
                  <label className="flex items-start gap-2 rounded-lg border border-line bg-[#FAFAF8] px-2.5 py-2">
                    <input type="checkbox" checked={allowWeeklyOverride} onChange={(e) => setAllowWeeklyOverride(e.target.checked)} className="mt-0.5" />
                    <span className="text-[10px] text-ink2">
                      <strong className="text-ink">Permitir envio prioritário acima do limite semanal por cliente.</strong> Use apenas para campanhas importantes (ex.: aniversário).
                      Ainda respeita opt-out, telefone válido, janela de envio, quiet hours, dedupe e limite global do restaurante.
                    </span>
                  </label>

                  {/* End condition */}
                  <div>
                    <label className="block text-[10px] font-semibold text-muted mb-1">Condição de término</label>
                    <select
                      value={endCondition}
                      onChange={(e) => setEndCondition(e.target.value as EndCondition)}
                      className="w-full rounded-lg border border-line2 bg-paper px-2.5 py-1.5 text-xs text-ink focus:border-brand-400 focus:outline-none"
                    >
                      <option value="AUDIENCE_EXHAUSTED">Até acabar o público</option>
                      <option value="END_DATE">Até uma data final</option>
                      <option value="MAX_TOTAL">Até número máximo de envios</option>
                    </select>
                  </div>

                  {endCondition === "END_DATE" && (
                    <div>
                      <label className="block text-[10px] font-semibold text-muted mb-1">Data final</label>
                      <input
                        type="date"
                        value={endDate}
                        min={new Date().toISOString().split("T")[0]}
                        onChange={(e) => setEndDate(e.target.value)}
                        className="w-full rounded-lg border border-line2 bg-paper px-2.5 py-1.5 text-xs text-ink focus:border-brand-400 focus:outline-none"
                      />
                    </div>
                  )}

                  {endCondition === "MAX_TOTAL" && (
                    <div>
                      <label className="block text-[10px] font-semibold text-muted mb-1">Máximo total de envios</label>
                      <input
                        type="number"
                        min={1}
                        value={maxTotal}
                        onChange={(e) => setMaxTotal(Math.max(1, parseInt(e.target.value) || 1))}
                        className="w-full rounded-lg border border-line2 bg-paper px-2.5 py-1.5 text-xs text-ink focus:border-brand-400 focus:outline-none"
                      />
                    </div>
                  )}
                </div>
              )}
          </div>
        </div>

        {/* Footer */}
        {prepError && (
          <p className="border-t border-red-100 bg-red-50 px-5 py-2 text-xs text-red-600">
            {prepError}
          </p>
        )}
        <div className="flex gap-2 border-t border-line px-5 py-4 shrink-0">
          <button
            onClick={copyMessage}
            className={`rounded-xl px-4 py-2.5 text-sm font-semibold transition-colors ${
              copied
                ? "bg-green-100 text-green-700"
                : "border border-line2 bg-paper text-ink2 hover:bg-[#FAFAF8]"
            }`}
          >
            {copied ? "✓ Copiado" : "Copiar"}
          </button>
          {(isCustom ? !!customAudienceId : (!template.hasAudienceQuery || sendMode === "recurring" || audience?.computed)) ? (
            <button
              onClick={handlePrepareCampaign}
              disabled={
                preparing ||
                (isCustom && !customAudienceId) ||
                ((template.hasAudienceQuery || (isCustom && !!customAudienceId)) && sendMode === "now" && (audience?.eligibleCount ?? audience?.count ?? 0) === 0) ||
                (sendMode === "scheduled_once" && !scheduleDate) ||
                (sendMode === "recurring" && weekdays.length === 0)
              }
              className="flex-1 rounded-xl bg-brand-600 py-2.5 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {preparing
                ? "Processando…"
                : sendMode === "recurring"
                  ? weekdays.length === 0
                    ? "Selecione os dias"
                    : "Ativar campanha recorrente →"
                  : (!template.hasAudienceQuery && !isCustom)
                    ? sendMode === "scheduled_once"
                      ? scheduleDate ? "Agendar campanha →" : "Escolha uma data"
                      : "Criar campanha agora →"
                    : (audience?.eligibleCount ?? audience?.count ?? 0) === 0
                      ? "Sem público elegível"
                      : sendMode === "scheduled_once"
                        ? scheduleDate ? "Agendar →" : "Escolha uma data"
                        : "Preparar disparo →"}
            </button>
          ) : (
            <button
              disabled
              title={
                isCustom && !customAudienceId
                  ? "Selecione o público alvo"
                  : loadingAudience
                    ? "Calculando público…"
                    : "Aguardando dados do público…"
              }
              className="flex-1 cursor-not-allowed rounded-xl bg-[#F4F4F2] py-2.5 text-sm font-semibold text-muted"
            >
              {loadingAudience ? "Calculando público…" : "Aguardando público…"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Campaign Review Modal ─────────────────────────────────────────────────────

const CAMPAIGN_STATUS_LABELS: Record<string, string> = {
  DRAFT:     "Rascunho",
  SCHEDULED: "Programada",
  ACTIVE:    "Ativa",
  SENDING:   "Em execução",
  SENT:      "Concluída",
  PAUSED:    "Pausada",
  COMPLETED: "Concluída",
  CANCELLED: "Cancelada",
};

const CAMPAIGN_STATUS_COLORS: Record<string, { bg: string; text: string }> = {
  DRAFT:     { bg: "bg-[#F4F4F2]",   text: "text-ink2"   },
  SCHEDULED: { bg: "bg-amber-100",  text: "text-amber-700"  },
  ACTIVE:    { bg: "bg-green-100",  text: "text-green-700"  },
  SENDING:   { bg: "bg-blue-100",   text: "text-blue-700"   },
  SENT:      { bg: "bg-green-100",  text: "text-green-700"  },
  PAUSED:    { bg: "bg-amber-100", text: "text-amber-700" },
  COMPLETED: { bg: "bg-green-100",  text: "text-green-700"  },
  CANCELLED: { bg: "bg-red-100",    text: "text-red-600"    },
};

const WEEKDAY_LABELS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];


function CampaignReviewModal({
  campaignId,
  initialRecipients,
  onClose,
  onSent,
}: {
  campaignId:        string;
  initialRecipients: CampaignRecipientRow[];
  onClose:           () => void;
  onSent:            () => void;
}) {
  const [messages, setMessages] = useState<Record<string, string>>(
    () => Object.fromEntries(initialRecipients.map((r) => [r.id, r.messageText]))
  );
  const [removed,  setRemoved]  = useState<Set<string>>(new Set());
  const [sending,  setSending]  = useState(false);
  const [error,    setError]    = useState<string | null>(null);
  const [result,   setResult]   = useState<{ totalSent: number; totalFailed: number; warning?: string } | null>(null);

  // Safety config — loaded at mount for the UI summary
  const [safety, setSafety] = useState<{
    dailyGlobalCap: number;
    quietHoursEnabled: boolean;
    quietHoursStart: string;
    quietHoursEnd: string;
    randomDelayEnabled: boolean;
    randomDelayMinSec: number;
    randomDelayMaxSec: number;
    todaySent: number;
    // What is actually enforced (applyEffectiveSafety): on Meta official this is
    // the 900 tier ceiling, not the raw 200 default. Prefer this over dailyGlobalCap.
    effective?: { dailyGlobalCap: number };
  } | null>(null);

  useEffect(() => {
    fetch("/api/settings/crm-safety")
      .then((r) => r.json())
      .then((j) => { if (j?.data) setSafety(j.data); })
      .catch(() => {});
  }, []);

  // For manual sends: cap to remaining global daily capacity (dailyCap - todaySent).
  // Use the EFFECTIVE cap (applyEffectiveSafety → 900 on Meta official), never the
  // raw 200 default, or the composer would over-restrict a Meta-official number.
  // 0 means no cap configured.
  const dailyCap = safety?.effective?.dailyGlobalCap ?? safety?.dailyGlobalCap ?? 0;
  const effectiveMax = dailyCap > 0
    ? Math.max(0, dailyCap - (safety?.todaySent ?? 0))
    : 9999;

  const active = initialRecipients.filter((r) => !removed.has(r.id));

  function applyCap() {
    setRemoved((prev) => new Set([...prev, ...active.slice(effectiveMax).map((r) => r.id)]));
  }

  async function handleSend() {
    setSending(true);
    setError(null);
    try {
      const res = await fetch(`/api/crm/campaigns/${campaignId}/send`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({
          messages: active.map((r) => ({ recipientId: r.id, messageText: messages[r.id] ?? r.messageText })),
        }),
      });
      const json = await res.json() as {
        data?: { totalSent: number; totalFailed: number; warning?: string };
        error?: string;
        message?: string;
        blocked?: boolean;
        reason?: string;
        code?: string;
      };
      if (res.status === 422 && json.blocked) {
        setError(json.reason ?? "Envio bloqueado pelas configurações de segurança.");
        return;
      }
      if (!res.ok) {
        if (json.error === "whatsapp_not_configured") {
          setError("WhatsApp não configurado neste restaurante. Configure a integração em Configurações > Integrações.");
        } else {
          setError(json.message ?? "Erro ao enviar. Tente novamente.");
        }
        return;
      }
      setResult(json.data!);
      onSent();
    } catch {
      setError("Falha de rede. Tente novamente.");
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-ink/45 p-4" onClick={onClose}>
      <div
        className="w-full max-w-2xl rounded-2xl bg-paper shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-line shrink-0">
          <div>
            <h2 className="text-base font-bold text-ink">Revisar e enviar</h2>
            <p className={`text-xs mt-0.5 ${active.length > effectiveMax ? "text-amber-600 font-semibold" : "text-muted"}`}>
              {active.length} destinatário{active.length !== 1 ? "s" : ""}
              {active.length > effectiveMax
                ? effectiveMax === 0
                  ? " · ⚠️ limite diário atingido"
                  : ` · ⚠️ acima do limite diário restante (${effectiveMax})`
                : " · Canal: WhatsApp"}
            </p>
          </div>
          <button onClick={onClose} className="rounded-full p-1.5 text-muted hover:bg-[#F4F4F2] transition-colors">
            <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Result state */}
        {result ? (
          <div className="flex flex-col items-center justify-center gap-3 px-6 py-12 text-center">
            <span className="text-4xl">{result.totalFailed === 0 ? "✅" : result.totalSent === 0 ? "❌" : "⚠️"}</span>
            <p className="text-base font-bold text-ink">
              {result.totalSent} enviada{result.totalSent !== 1 ? "s" : ""}
              {result.totalFailed > 0 ? ` · ${result.totalFailed} falha${result.totalFailed !== 1 ? "s" : ""}` : ""}
            </p>
            <p className="text-sm text-muted">
              As mensagens aparecem no Chat Inbox de cada conversa.
            </p>
            {result.warning && (
              <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-2.5 text-xs text-amber-800 max-w-sm">
                ⚠️ {result.warning}
              </p>
            )}
            <button
              onClick={onClose}
              className="mt-2 rounded-xl bg-brand-600 px-6 py-2.5 text-sm font-bold text-white hover:bg-brand-700 transition-colors"
            >
              Fechar
            </button>
          </div>
        ) : (
          <>
            {/* Safety summary banner */}
            {safety && (
              <div className="border-b border-brand-100 bg-brand-50 px-5 py-2.5 shrink-0">
                <p className="text-[11px] font-semibold text-brand-700 mb-1">🛡️ Modo seguro ativo</p>
                <div className="flex flex-wrap gap-x-4 gap-y-0.5 text-[10px] text-brand-600">
                  {dailyCap > 0 && (
                    <span>
                      Limite diário: {dailyCap} msg
                      {safety.todaySent > 0 && ` · ${Math.max(0, dailyCap - safety.todaySent)} restantes hoje`}
                    </span>
                  )}
                  {safety.quietHoursEnabled && (
                    <span>Horário quieto: {safety.quietHoursStart}–{safety.quietHoursEnd}</span>
                  )}
                  {safety.randomDelayEnabled && (
                    <span>Delay: {safety.randomDelayMinSec}–{safety.randomDelayMaxSec}s entre envios</span>
                  )}
                  <span>Opt-out: sempre respeitado</span>
                </div>
              </div>
            )}

            {/* Daily cap warning */}
            {active.length > effectiveMax && (
              <div className="border-b border-amber-100 bg-amber-50 px-5 py-3 flex items-center justify-between gap-3 shrink-0">
                <p className="text-xs text-amber-800">
                  ⚠️ <strong>Limite diário:</strong> {active.length} destinatários — capacidade restante hoje: {effectiveMax === 0 ? "nenhuma (limite atingido)" : effectiveMax}. Remova manualmente ou aplique o limite automático.
                </p>
                {effectiveMax > 0 && (
                  <button
                    onClick={applyCap}
                    className="shrink-0 rounded-lg bg-yellow-600 px-3 py-1.5 text-[11px] font-bold text-white hover:bg-yellow-700 transition-colors"
                  >
                    Aplicar limite ({effectiveMax})
                  </button>
                )}
              </div>
            )}

            {/* Recipients list */}
            <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
              {active.length === 0 ? (
                <p className="text-center text-sm text-muted py-8">Nenhum destinatário selecionado.</p>
              ) : active.map((r) => (
                <div key={r.id} className="rounded-xl border border-line bg-[#FAFAF8] p-3">
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-xs font-bold text-ink truncate">{r.customerName}</p>
                      <p className="text-[10px] text-muted">{r.customerPhone}</p>
                    </div>
                    <button
                      onClick={() => setRemoved((prev) => new Set([...prev, r.id]))}
                      className="shrink-0 rounded-lg border border-line2 px-2 py-1 text-[10px] font-semibold text-muted hover:bg-red-50 hover:border-red-200 hover:text-red-600 transition-colors"
                    >
                      Remover
                    </button>
                  </div>
                  <textarea
                    rows={3}
                    value={messages[r.id] ?? r.messageText}
                    onChange={(e) => setMessages((prev) => ({ ...prev, [r.id]: e.target.value }))}
                    className="w-full rounded-lg border border-line2 bg-paper px-3 py-2 text-xs text-ink focus:border-brand-400 focus:outline-none focus:ring-1 focus:ring-brand-100 resize-none"
                  />
                </div>
              ))}
            </div>

            {/* Error */}
            {error && (
              <p className="border-t border-red-100 bg-red-50 px-5 py-2.5 text-xs text-red-600">
                {error}
              </p>
            )}

            {/* Footer */}
            <div className="border-t border-line px-5 py-4 shrink-0 flex gap-2">
              <button
                onClick={onClose}
                className="rounded-xl border border-line2 px-4 py-2.5 text-sm font-semibold text-ink2 hover:bg-[#FAFAF8] transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={handleSend}
                disabled={sending || active.length === 0 || active.length > effectiveMax}
                title={
                  effectiveMax === 0
                    ? "Limite diário atingido. Tente novamente amanhã."
                    : active.length > effectiveMax
                      ? `Capacidade restante hoje: ${effectiveMax}. Reduza a lista antes de enviar.`
                      : undefined
                }
                className="flex-1 rounded-xl bg-green-600 py-2.5 text-sm font-bold text-white hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {sending
                  ? "Enviando…"
                  : effectiveMax === 0
                    ? "Limite diário atingido"
                    : active.length > effectiveMax
                      ? `Limite: reduza para ≤ ${effectiveMax}`
                      : `Enviar ${active.length} mensagem${active.length !== 1 ? "s" : ""}`}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ── Campaign Detail Modal ─────────────────────────────────────────────────────

const EXEC_STATUS_LABELS: Record<string, string> = {
  PENDING:   "Pendente",
  SENT:      "Enviado",
  DELIVERED: "Entregue",
  READ:      "Lido",
  FAILED:    "Falhou",
  CONVERTED: "Convertido",
};

const FAILURE_REASON_LABELS: Record<string, string> = {
  CUSTOMER_OPTED_OUT:          "Opt-out (LGPD)",
  CUSTOMER_NOT_CONTACTABLE:    "Não contactável",
  MISSING_PHONE:               "Sem telefone",
  INVALID_PHONE_FORMAT:        "Telefone inválido",
  NO_WHATSAPP_CONFIG:          "WhatsApp desconectado",
  // Código aposentado em 04/08 junto com a Evolution. Continua no mapa porque
  // execuções antigas no banco ainda carregam esse motivo — sem a linha, a tela
  // mostraria o código cru para o lojista.
  NO_EVOLUTION_CONFIG:         "WhatsApp desconectado",
  QUIET_HOURS:                 "Horário silencioso",
  WEEKEND_BLOCKED:             "Bloqueio fim de semana",
  OUTSIDE_SENDING_WINDOW:      "Fora da janela de envio",
  DAILY_GLOBAL_CAP_REACHED:    "Limite diário atingido",
  CUSTOMER_COOLDOWN_ACTIVE:    "Cliente em cooldown",
  CUSTOMER_WEEKLY_CAP_REACHED: "Limite semanal do cliente",
  RECENT_CRM_MESSAGE_24H:      "Mensagem recente (24h)",
  DUPLICATE_CAMPAIGN_RECIPIENT:"Destinatário duplicado",
  RESTAURANT_CLOSED:           "Restaurante fechado",
  DUPLICATE_24H_SKIP:          "Dedup 24h",
  BLOCKED:                     "Bloqueado",
  UNKNOWN_ERROR:               "Erro desconhecido",
  "Cliente opt-out":           "Opt-out",
  "Telefone inválido ou ausente": "Telefone inválido",
  "Mensagem vazia":            "Mensagem vazia",
};

const EXEC_STATUS_COLORS: Record<string, { bg: string; text: string }> = {
  PENDING:   { bg: "bg-[#F4F4F2]",   text: "text-ink2"  },
  SENT:      { bg: "bg-blue-50",    text: "text-blue-700"  },
  DELIVERED: { bg: "bg-blue-100",   text: "text-blue-700"  },
  READ:      { bg: "bg-brand-50",  text: "text-brand-600"},
  FAILED:    { bg: "bg-red-50",     text: "text-red-600"   },
  CONVERTED: { bg: "bg-green-50",   text: "text-green-700" },
};

type PreflightResult = {
  audienceTotal: number; eligibleNow: number; forecastSendToday: number;
  blocked: { optOut: number; invalidPhone: number; weeklyLimit: number; alreadyImpactedCampaign: number; alreadyImpactedConcept: number; duplicateMessage: number; globalCap: number; campaignCap: number };
  overrideWeeklyLimitUsed: number;
  warnings: string[]; recommendations: string[]; canSendNow: boolean;
};

type CampaignDebugResult = {
  isRecurring:    boolean;
  isDueNow:       boolean;
  notDueReason:   string | null;
  nextRunAt:      string | null;
  safetyBlocks:   string[];
  dailyCapStatus: string | null;
  audience: {
    totalEligible: number;
    alreadySent:   number;
    newEligible:   number;
    error?:        string;
  } | null;
};

const WEEKDAY_LABELS_PT = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

// Preview sample used by the unified manage modal (matches the old config modal).
const MANAGE_PREVIEW_CUSTOMER = { name: "Diego", tier: "OURO", lastOrderAt: new Date(Date.now() - 3 * 86_400_000).toISOString() };
const MANAGE_PREVIEW_CTX = { restaurantName: "seu restaurante", pedidoUrl: "https://foocci.com.br", googleReviewUrl: null, instagramUrl: null };

/** Failure reason breakdown + owner-facing verdict — lives in the Diagnóstico tab. */
function CampaignFailureDiagnosis({ detail, isRecurring }: { detail: CampaignDetail; isRecurring: boolean }) {
  if (detail.totalFailed <= 0) return null;
  const map: Record<string, number> = {};
  const catCount: Record<string, number> = {};
  for (const ex of detail.executions) {
    if (ex.status !== "FAILED") continue;
    const badge = ex.classification?.badge ?? ex.failedReason ?? "Falha";
    map[badge] = (map[badge] ?? 0) + 1;
    const cat = ex.classification?.category ?? "";
    catCount[cat] = (catCount[cat] ?? 0) + 1;
  }
  const entries = Object.entries(map).sort(([, a], [, b]) => b - a);
  const numberProblems = (catCount["EVOLUTION_BAD_REQUEST"] ?? 0) + (catCount["BLOCKED_INVALID_PHONE"] ?? 0);
  const infraProblems  = (catCount["EVOLUTION_INSTANCE_DISCONNECTED"] ?? 0) + (catCount["FAILED_PROVIDER"] ?? 0) + (catCount["FAILED_TIMEOUT"] ?? 0);
  const authProblems   = catCount["WHATSAPP_AUTH_ERROR"] ?? 0;
  const verdict = authProblems > numberProblems && authProblems > infraProblems
    ? "🔑 Erro de autenticação do WhatsApp (Meta) — o token expirou; reconecte a integração."
    : numberProblems >= infraProblems
    ? "📵 A maioria são números que não existem no WhatsApp (base antiga). Não há o que corrigir — são inalcançáveis e já saem do CRM automaticamente; os válidos recebem normalmente."
    : "⚠️ A maioria são erros temporários da Evolution/conexão. O robô para o lote quando isso acontece e tenta de novo no próximo ciclo.";
  return (
    <div className="rounded-2xl border border-red-100 bg-red-50 p-4 space-y-2">
      <p className="text-[10px] font-bold uppercase tracking-widest text-red-500">Diagnóstico de falhas</p>
      <p className="rounded-lg bg-paper/70 px-3 py-2 text-xs text-ink2">{verdict}</p>
      <div className="grid grid-cols-1 gap-1 sm:grid-cols-2">
        {entries.map(([reason, count]) => (
          <div key={reason} className="flex items-center justify-between gap-2 rounded-lg bg-paper px-3 py-2 border border-red-100">
            <span className="text-xs text-ink2 truncate">{FAILURE_REASON_LABELS[reason] ?? reason}</span>
            <span className="text-xs font-bold text-red-600 shrink-0">{count}</span>
          </div>
        ))}
      </div>
      {isRecurring && (
        <p className="text-[10px] text-red-400 leading-snug">
          Campanha recorrente: falhas históricas incluem ciclos anteriores. Veja <strong>Performance → Último ciclo</strong> para o ciclo atual.
        </p>
      )}
    </div>
  );
}

// ── CampaignManageModal ───────────────────────────────────────────────────────
// Tabbed management console: Visão Geral | Mensagem | Agendamento | Performance | Diagnóstico

type ManageTab = "overview" | "message" | "schedule" | "performance" | "diagnostics";

function CampaignManageModal({
  detailId,
  onClose,
  onCampaignAction,
  onCampaignUpdated,
  initialTab,
}: {
  detailId: string;
  onClose: () => void;
  /** Tab to open on. "Configurar" opens on Mensagem so edits are immediately visible. */
  initialTab?: ManageTab;
  onCampaignAction: (id: string, action: "pause" | "resume" | "cancel") => Promise<void>;
  onCampaignUpdated?: (id: string, updates: Partial<CampaignHistoryRow>) => void;
}) {
  const [activeTab,    setActiveTab]    = useState<ManageTab>(initialTab ?? "overview");
  const [detail,       setDetail]       = useState<CampaignDetail | null>(null);
  const [loading,      setLoading]      = useState(true);
  const [error,        setError]        = useState(false);
  const [debug,        setDebug]        = useState<CampaignDebugResult | null>(null);
  const [loadingDebug, setLoadingDebug] = useState(false);
  const [preflight,    setPreflight]    = useState<PreflightResult | null>(null);

  // Reprocess preview (read-only — never sends).
  const [reprocessPlan, setReprocessPlan] = useState<ReprocessPlan | null>(null);
  const [loadingPlan,    setLoadingPlan]   = useState(false);
  const [showReprocess,  setShowReprocess] = useState(false);

  const loadReprocessPlan = useCallback(async (campaignId: string) => {
    setLoadingPlan(true);
    try {
      const res  = await fetch(`/api/crm/campaigns/${campaignId}/reprocess-plan`);
      const json = await res.json().catch(() => null);
      if (res.ok && json?.data) { setReprocessPlan(json.data as ReprocessPlan); setShowReprocess(true); }
    } finally {
      setLoadingPlan(false);
    }
  }, []);

  // Edit – name
  const [editName,    setEditName]    = useState("");
  const [savingName,  setSavingName]  = useState(false);
  const [nameSaved,   setNameSaved]   = useState(false);

  // Edit – público-alvo (custom campaigns only)
  const [editSegment,   setEditSegment]   = useState("TODOS");
  const [savingSegment, setSavingSegment] = useState(false);
  const [segmentSaved,  setSegmentSaved]  = useState(false);

  // Edit – message pool (which phrases rotate) + the new-phrase composer.
  // msgText doubles as the composer input; poolCustom holds the owner's phrases.
  const [msgText,   setMsgText]   = useState("");
  const [savingMsg, setSavingMsg] = useState(false);
  const [msgSaved,  setMsgSaved]  = useState(false);
  const [poolSelected, setPoolSelected] = useState<Set<string>>(new Set());
  const [poolCustom, setPoolCustom]     = useState<{ id: string; text: string; on: boolean }[]>([]);
  const [composing, setComposing]       = useState(false);
  // Per-phrase effectiveness + confidence seal (tier = same rule the agent uses).
  const [phraseStats, setPhraseStats]   = useState<Record<string, { sent: number; converted: number; revenue: number; underTest?: boolean; champion?: boolean; tier?: "champion" | "reliable" | "under-test" | "none" }>>({});
  // Meta approval status per phrase (variantKey → APPROVED/PENDING/REJECTED).
  const [phraseMeta, setPhraseMeta]     = useState<{ enabled: boolean; status: Record<string, string> }>({ enabled: false, status: {} });
  // Campaign-level maturity: are there enough sends to trust conclusions yet?
  const [phraseCampaign, setPhraseCampaign] = useState<{ totalSent: number; baselineTarget: number; baselineReached: boolean }>({ totalSent: 0, baselineTarget: 100, baselineReached: false });

  // Edit – schedule
  const [editWd,      setEditWd]      = useState<number[]>([]);
  const [editStart,   setEditStart]   = useState("08:00");
  const [editEnd,     setEditEnd]     = useState("20:00");
  const [editLimit,   setEditLimit]   = useState(20);
  const [savingSched, setSavingSched] = useState(false);
  const [schedSaved,  setSchedSaved]  = useState(false);

  // Edit – coupon/reward (ported from the ready-made config so this is the ONE modal)
  const [coupon,      setCoupon]      = useState<ReadyMadeCoupon | null>(null);
  const [savingCoupon,setSavingCoupon]= useState(false);
  const [couponSaved, setCouponSaved] = useState(false);

  // Edit – trigger days ("X dias após o evento") for event-based ready-made campaigns
  const [triggerDays, setTriggerDays] = useState<number>(2);

  // Edit – per-tier rewards (Subiu de nível / Mimo mensal): Prata/Ouro/Diamante
  // each with their own coupon, so levels FEEL different.
  const [tierCoupons, setTierCoupons]       = useState<Record<string, ReadyMadeCoupon | null>>({});
  const [savingTierC, setSavingTierC]       = useState(false);
  const [tierCSaved, setTierCSaved]         = useState(false);

  useEffect(() => {
    setLoading(true);
    setError(false);
    setDebug(null);
    setMsgSaved(false);
    setSchedSaved(false);
    setNameSaved(false);
    setActiveTab(initialTab ?? "overview");

    fetch(`/api/crm/campaigns/${detailId}`)
      .then((r) => r.ok ? r.json() : Promise.reject())
      .then((json) => {
        const d = json.data as CampaignDetail;
        setDetail(d);
        setMsgText("");
        setComposing(false);
        setEditName(d.name ?? "");
        setEditSegment(d.targetSegment ?? "TODOS");
        // Phrase pool: use the stored pool; legacy campaigns (no pool yet) start
        // with the phrase actually running — the catalog variant matching
        // campaign.message, or the message itself as an initial custom phrase.
        {
          const pool = parseMessagePool(d.scheduleConfig);
          if (pool) {
            setPoolSelected(new Set(pool.selected ?? []));
            setPoolCustom((pool.custom ?? []).map((c) => ({ id: c.id, text: c.text, on: c.on !== false })));
          } else {
            const msgKey   = phraseKey(d.message ?? "");
            const variants = d.templateId ? getReadyMadeMessageVariants(d.templateId) : [];
            if (variants.some((v) => phraseKey(v) === msgKey)) {
              setPoolSelected(new Set([msgKey]));
              setPoolCustom([]);
            } else {
              setPoolSelected(new Set());
              setPoolCustom((d.message ?? "").trim() ? [{ id: "atual", text: d.message, on: true }] : []);
            }
          }
        }
        const cfg = d.scheduleConfig as ScheduleCfg | null;
        if (cfg) {
          setEditWd(cfg.weekdays ?? []);
          setEditStart(cfg.timeWindow?.start ?? "08:00");
          setEditEnd(cfg.timeWindow?.end ?? "20:00");
          setEditLimit(cfg.dailyLimit ?? 20);
        }
        setCoupon(((cfg as unknown as { coupon?: ReadyMadeCoupon | null })?.coupon) ?? null);
        setTriggerDays(((cfg as unknown as { triggerDays?: number })?.triggerDays) ?? 2);
        // Per-tier rewards: stored map, else seed every tier with the base coupon.
        {
          const stored = (cfg as unknown as { tierCoupons?: Record<string, ReadyMadeCoupon | null> })?.tierCoupons;
          const base   = ((cfg as unknown as { coupon?: ReadyMadeCoupon | null })?.coupon) ?? { type: "PERCENTAGE" as const, value: 10 };
          setTierCoupons(stored ?? { PRATA: base, OURO: base, DIAMANTE: base });
        }
        setTierCSaved(false);
      })
      .catch(() => setError(true))
      .finally(() => setLoading(false));

    setLoadingDebug(true);
    fetch(`/api/crm/campaigns/${detailId}/debug`)
      .then((r) => r.ok ? r.json() : Promise.reject())
      .then((json) => setDebug(json.data ?? null))
      .catch(() => {})
      .finally(() => setLoadingDebug(false));

    setPreflight(null);
    fetch(`/api/crm/campaigns/${detailId}/preflight`)
      .then((r) => r.ok ? r.json() : Promise.reject())
      .then((json) => setPreflight(json.data ?? null))
      .catch(() => {});

    // Per-phrase effectiveness + Meta approval status for the pool list.
    setPhraseStats({});
    setPhraseMeta({ enabled: false, status: {} });
    setPhraseCampaign({ totalSent: 0, baselineTarget: 100, baselineReached: false });
    fetch(`/api/crm/campaigns/${detailId}/phrase-stats`)
      .then((r) => r.ok ? r.json() : Promise.reject())
      .then((json) => {
        setPhraseStats(json.data?.stats ?? {});
        setPhraseMeta({ enabled: !!json.data?.metaEnabled, status: json.data?.meta ?? {} });
        setPhraseCampaign(json.data?.campaign ?? { totalSent: 0, baselineTarget: 100, baselineReached: false });
      })
      .catch(() => {});
  }, [detailId]);

  // Refresh campaign detail + diagnostics after a live reprocess (no tab reset).
  const reloadDetail = useCallback(() => {
    fetch(`/api/crm/campaigns/${detailId}`)
      .then((r) => r.ok ? r.json() : Promise.reject())
      .then((json) => setDetail(json.data as CampaignDetail))
      .catch(() => {});
    fetch(`/api/crm/campaigns/${detailId}/debug`)
      .then((r) => r.ok ? r.json() : Promise.reject())
      .then((json) => setDebug(json.data ?? null))
      .catch(() => {});
  }, [detailId]);

  const [clearingMetrics, setClearingMetrics] = useState(false);
  async function handleClearMetrics() {
    if (!detail) return;
    if (!confirm("Zerar os números (enviados, falhas, receita) e apagar o histórico de falhas desta campanha?\n\nMantém os envios bem-sucedidos e não reenvia mensagens.")) return;
    setClearingMetrics(true);
    try {
      const res = await fetch(`/api/crm/campaigns/${detail.id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "clear-metrics" }),
      });
      if (res.ok) {
        reloadDetail();
        onCampaignUpdated?.(detail.id, { totalSent: 0, totalFailed: 0, totalResponded: 0, totalConverted: 0, totalRevenue: 0 });
      }
    } finally { setClearingMetrics(false); }
  }

  const sc           = detail ? (CAMPAIGN_STATUS_COLORS[detail.status] ?? { bg: "bg-[#F4F4F2]", text: "text-ink2" }) : null;
  const cfg          = detail?.scheduleConfig as ScheduleCfg | null | undefined;
  const isRecurring  = cfg?.mode === "RECURRING";
  const isCartRecovery = cfg?.mode === "CART_RECOVERY";
  const isControllable = (isRecurring || isCartRecovery) && detail && ["ACTIVE", "SCHEDULED", "PAUSED"].includes(detail.status);
  const isTerminal   = ["SENT", "COMPLETED", "CANCELLED"].includes(detail?.status ?? "");
  const canEdit      = !isTerminal;

  const responseRate = detail && detail.totalSent > 0
    ? ((detail.totalResponded / detail.totalSent) * 100).toFixed(1) : null;
  const convRate     = detail && detail.totalSent > 0
    ? ((detail.totalConverted / detail.totalSent) * 100).toFixed(1) : null;

  // Ready-made catalog data (message options, timing, editable fields) for this
  // campaign, so the ONE modal shows every config the old "Configurar" modal had.
  const readyMade      = detail?.templateId ? getReadyMadeCampaign(detail.templateId) : null;
  const rmVariants     = detail?.templateId ? getReadyMadeMessageVariants(detail.templateId) : [];
  const rmTiming       = detail?.templateId ? getReadyMadeTiming(detail.templateId) : null;
  const rmCanEditMsg   = !readyMade || readyMade.editable.includes("message");
  const rmCanTrigger   = !!readyMade?.editable.includes("triggerDays");
  const isTierCouponCampaign = !!detail?.templateId
    && (TIER_COUPON_CAMPAIGN_IDS as readonly string[]).includes(detail.templateId);
  const msgPreview     = renderCrmMessage(msgText, MANAGE_PREVIEW_CUSTOMER, { ...MANAGE_PREVIEW_CTX, coupon });
  // How many phrases are actually rotating (selected catalog + ON custom).
  const poolActiveCount = rmVariants.filter((v) => poolSelected.has(phraseKey(v))).length
    + poolCustom.filter((c) => c.on).length;

  /** Meta approval badge for a phrase (only when the restaurant uses Meta CRM). */
  const metaBadge = (key: string) => {
    if (!phraseMeta.enabled) return null;
    const st = phraseMeta.status[key];
    if (st === "APPROVED") return <span className="rounded-full bg-emerald-100 px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-wide text-emerald-700">✓ Meta aprovada</span>;
    if (st === "PENDING")  return <span className="rounded-full bg-amber-100 px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-wide text-amber-700">⏳ Meta em análise</span>;
    if (st === "REJECTED") return <span className="rounded-full bg-red-100 px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-wide text-red-700">✗ Meta rejeitou</span>;
    return <span className="rounded-full bg-[#F4F4F2] px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-wide text-muted">Meta: na fila</span>;
  };

  /**
   * Confidence seal for a phrase — one per row, mutually exclusive, hierarchy
   * campeã > confiável > em teste. Same rule the agent uses under the hood, so
   * the owner never over-reads a phrase with too few sends. Sized to match the
   * adjacent metaBadge (same line ⇒ same scale).
   */
  const confidenceBadge = (key: string) => {
    const tier = phraseStats[key]?.tier;
    if (tier === "champion")
      return <span className="rounded-full bg-brand-50 px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-wide text-brand-600" title="Converte bem acima da média com amostra suficiente — o agente já copia o padrão dela.">🏆 Campeã</span>;
    if (tier === "reliable")
      return <span className="rounded-full bg-blue-50 px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-wide text-blue-600" title="Já tem envios suficientes para confiar no número.">✓ Confiável</span>;
    if (tier === "under-test")
      return <span className="rounded-full bg-[#F4F4F2] px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-wide text-muted" title="Ainda com poucos envios — número provisório, o agente segue testando.">🧪 Em teste</span>;
    return null;
  };

  async function handleSaveName() {
    if (!detail || !editName.trim() || editName.trim() === detail.name) return;
    setSavingName(true);
    try {
      const res = await fetch(`/api/crm/campaigns/${detail.id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: editName.trim() }),
      });
      if (res.ok) {
        setDetail((p) => p ? { ...p, name: editName.trim() } : p);
        setNameSaved(true);
        onCampaignUpdated?.(detail.id, { name: editName.trim() });
        setTimeout(() => setNameSaved(false), 3000);
      }
    } finally { setSavingName(false); }
  }

  async function handleSaveSegment() {
    if (!detail || editSegment === (detail.targetSegment ?? "TODOS")) return;
    setSavingSegment(true);
    try {
      const res = await fetch(`/api/crm/campaigns/${detail.id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetSegment: editSegment }),
      });
      if (res.ok) {
        setDetail((p) => p ? { ...p, targetSegment: editSegment } : p);
        setSegmentSaved(true);
        setTimeout(() => setSegmentSaved(false), 3000);
      }
    } finally { setSavingSegment(false); }
  }

  /** Persists the phrase pool (selected catalog variants + custom phrases). */
  async function savePool(
    nextSelected: Set<string>,
    nextCustom: { id: string; text: string; on: boolean }[],
  ) {
    if (!detail) return;
    setPoolSelected(nextSelected);
    setPoolCustom(nextCustom);
    setSavingMsg(true);
    try {
      const res = await fetch(`/api/crm/campaigns/${detail.id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scheduleConfig: { messagePool: { selected: [...nextSelected], custom: nextCustom } } }),
      });
      if (res.ok) {
        const json = await res.json() as { data?: { scheduleConfig: unknown } };
        if (json.data?.scheduleConfig) {
          setDetail((p) => p ? { ...p, scheduleConfig: json.data!.scheduleConfig as Record<string, unknown> } : p);
        }
        setMsgSaved(true);
        setTimeout(() => setMsgSaved(false), 2500);
      }
    } finally { setSavingMsg(false); }
  }

  /** Adds a new custom phrase (composer) to the pool, already turned on. */
  async function handleAddPhrase() {
    const text = msgText.trim();
    if (!detail || !text || poolCustom.length >= MAX_CUSTOM_PHRASES) return;
    const id = `p${Date.now().toString(36)}`;
    await savePool(poolSelected, [...poolCustom, { id, text, on: true }]);
    setMsgText("");
    setComposing(false);
  }

  async function handleSaveSchedule() {
    if (!detail || !isRecurring) return;
    setSavingSched(true);
    try {
      const newCfg = {
        ...(cfg ?? {}),
        weekdays: editWd, timeWindow: { start: editStart, end: editEnd }, dailyLimit: editLimit,
        ...(rmCanTrigger ? { triggerDays } : {}),
      };
      const res = await fetch(`/api/crm/campaigns/${detail.id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scheduleConfig: newCfg }),
      });
      if (res.ok) {
        const json = await res.json() as { data?: { scheduleConfig: unknown } };
        const saved = json.data?.scheduleConfig ?? newCfg;
        setDetail((p) => p ? { ...p, scheduleConfig: saved as Record<string, unknown> } : p);
        setSchedSaved(true);
        onCampaignUpdated?.(detail.id, { scheduleConfig: saved as Record<string, unknown> });
        setTimeout(() => setSchedSaved(false), 3000);
      }
    } finally { setSavingSched(false); }
  }

  async function handleSaveTierCoupons() {
    if (!detail) return;
    setSavingTierC(true);
    try {
      const res = await fetch(`/api/crm/campaigns/${detail.id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scheduleConfig: { tierCoupons } }),
      });
      if (res.ok) {
        const json = await res.json() as { data?: { scheduleConfig: unknown } };
        if (json.data?.scheduleConfig) {
          setDetail((p) => p ? { ...p, scheduleConfig: json.data!.scheduleConfig as Record<string, unknown> } : p);
        }
        setTierCSaved(true);
        setTimeout(() => setTierCSaved(false), 3000);
      }
    } finally { setSavingTierC(false); }
  }

  async function handleSaveCoupon() {
    if (!detail || (!isRecurring && !isCartRecovery)) return;
    setSavingCoupon(true);
    try {
      const newCfg = { ...(cfg ?? {}), coupon };
      const res = await fetch(`/api/crm/campaigns/${detail.id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scheduleConfig: newCfg }),
      });
      if (res.ok) {
        const json = await res.json() as { data?: { scheduleConfig: unknown } };
        const saved = json.data?.scheduleConfig ?? newCfg;
        setDetail((p) => p ? { ...p, scheduleConfig: saved as Record<string, unknown> } : p);
        setCouponSaved(true);
        onCampaignUpdated?.(detail.id, { scheduleConfig: saved as Record<string, unknown> });
        setTimeout(() => setCouponSaved(false), 3000);
      }
    } finally { setSavingCoupon(false); }
  }

  const TABS: { id: ManageTab; label: string; hidden?: boolean }[] = [
    { id: "overview",    label: "Visão Geral" },
    { id: "message",     label: "Mensagem" },
    { id: "schedule",    label: "Agendamento", hidden: !isRecurring },
    { id: "performance", label: "Performance" },
    { id: "diagnostics", label: "Diagnóstico",  hidden: !isRecurring },
  ];

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      {/* Backdrop */}
      <div className="fixed inset-0 bg-ink/45 backdrop-blur-sm" onClick={onClose} />

      {/* Modal card */}
      <div className="relative min-h-full flex items-start justify-center p-0 sm:p-4 sm:py-6">
        <div className="relative w-full bg-paper shadow-2xl sm:rounded-3xl sm:max-w-4xl overflow-hidden">

          {/* ── Sticky header + tab bar ── */}
          <div className="sticky top-0 z-10 border-b border-line bg-paper">
            <div className="flex items-center justify-between px-5 py-4 sm:px-8">
              <div className="min-w-0 pr-4">
                <p className="text-[10px] font-bold uppercase tracking-widest text-muted">Gerenciar campanha</p>
                <h2 className="mt-0.5 text-base font-bold text-ink truncate">
                  {detail ? detail.name : loading ? "Carregando…" : "Campanha"}
                </h2>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {sc && detail && (
                  <span className={`hidden sm:inline-block rounded-full px-2.5 py-0.5 text-[10px] font-bold ${sc.bg} ${sc.text}`}>
                    {CAMPAIGN_STATUS_LABELS[detail.status] ?? detail.status}
                  </span>
                )}
                {isControllable && detail && (
                  <>
                    {detail.status === "PAUSED" ? (
                      <button
                        onClick={async () => { await onCampaignAction(detail.id, "resume"); setDetail((p) => p ? { ...p, status: "ACTIVE" } : p); onCampaignUpdated?.(detail.id, { status: "ACTIVE" }); }}
                        className="rounded-xl bg-green-50 px-3 py-1.5 text-xs font-semibold text-green-700 hover:bg-green-100 transition-colors"
                      >Retomar</button>
                    ) : (
                      <button
                        onClick={async () => { await onCampaignAction(detail.id, "pause"); setDetail((p) => p ? { ...p, status: "PAUSED" } : p); onCampaignUpdated?.(detail.id, { status: "PAUSED" }); }}
                        className="rounded-xl bg-amber-50 px-3 py-1.5 text-xs font-semibold text-amber-700 hover:bg-amber-100 transition-colors"
                      >Pausar</button>
                    )}
                    <button
                      onClick={async () => {
                        if (!confirm("Cancelar esta campanha permanentemente? Esta ação não pode ser desfeita.")) return;
                        await onCampaignAction(detail.id, "cancel");
                        onClose();
                      }}
                      className="rounded-xl bg-red-50 px-3 py-1.5 text-xs font-semibold text-red-600 hover:bg-red-100 transition-colors"
                    >Cancelar</button>
                  </>
                )}
                <button onClick={onClose} className="rounded-xl p-2 text-muted hover:bg-[#F4F4F2] transition-colors">
                  <svg className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>

            {/* Tab bar */}
            <div className="flex overflow-x-auto border-t border-line px-5 sm:px-8 [&::-webkit-scrollbar]:hidden" style={{ scrollbarWidth: "none" }}>
              {TABS.filter((t) => !t.hidden).map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`shrink-0 border-b-2 px-4 py-2.5 text-xs font-semibold transition-colors ${
                    activeTab === tab.id
                      ? "border-brand-600 text-brand-700"
                      : "border-transparent text-muted hover:text-ink2"
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>

          {/* ── Body ── */}
          <div className="px-5 py-6 sm:px-8 sm:py-8">
            {loading && <div className="flex items-center justify-center py-20 text-sm text-muted">Carregando campanha…</div>}
            {error   && <div className="flex items-center justify-center py-20 text-sm text-red-500">Erro ao carregar. Tente novamente.</div>}

            {detail && !loading && (
              <>
                {/* ── Visão Geral ── */}
                {activeTab === "overview" && (
                  <div className="space-y-6">
                    {/* Badges */}
                    <div className="flex flex-wrap gap-2">
                      {sc && <span className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold ${sc.bg} ${sc.text}`}>{CAMPAIGN_STATUS_LABELS[detail.status] ?? detail.status}</span>}
                      {isRecurring && <span className="rounded-full bg-brand-50 px-2 py-0.5 text-[10px] font-semibold text-brand-600">Recorrente</span>}
                      {detail.objective && <span className="rounded-full bg-line2 px-2 py-0.5 text-[10px] font-semibold text-ink2">{OBJECTIVE_LABELS[detail.objective] ?? detail.objective}</span>}
                      {detail.targetSegment && <span className="rounded-full bg-line2 px-2 py-0.5 text-[10px] font-semibold text-ink2">{SEGMENT_LABELS[detail.targetSegment] ?? detail.targetSegment}</span>}
                    </div>

                    {/* Dates */}
                    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 text-xs">
                      <div>
                        <p className="text-[10px] font-semibold uppercase tracking-wide text-muted">Canal</p>
                        <p className="text-ink2 mt-0.5">{CHANNEL_LABELS[detail.channel] ?? detail.channel}</p>
                      </div>
                      <div>
                        <p className="text-[10px] font-semibold uppercase tracking-wide text-muted">Criada em</p>
                        <p className="text-ink2 mt-0.5">{new Date(detail.createdAt).toLocaleDateString("pt-BR")}</p>
                      </div>
                      {detail.sentAt && (
                        <div>
                          <p className="text-[10px] font-semibold uppercase tracking-wide text-muted">Último disparo</p>
                          <p className="text-ink2 mt-0.5">{new Date(detail.sentAt).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}</p>
                        </div>
                      )}
                      {debug?.nextRunAt && (
                        <div>
                          <p className="text-[10px] font-semibold uppercase tracking-wide text-muted">Próximo envio</p>
                          <p className="text-ink2 mt-0.5">{new Date(debug.nextRunAt).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}</p>
                        </div>
                      )}
                    </div>

                    {/* KPI grid */}
                    <div>
                      <p className="mb-3 text-[10px] font-bold uppercase tracking-widest text-muted">Métricas de performance</p>
                      <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
                        {[
                          { label: "Audiência",   value: detail.totalAudience,  color: "text-ink" },
                          { label: "Enviados",    value: detail.totalSent,      color: "text-blue-700" },
                          { label: "Respostas",   value: detail.totalResponded, color: "text-brand-600" },
                          { label: "Tx. Resp.",   value: responseRate ? `${responseRate}%` : "—", color: responseRate ? "text-green-700" : "text-muted" },
                          { label: "Pedidos",     value: detail.totalConverted, color: detail.totalConverted > 0 ? "text-green-700" : "text-muted" },
                          { label: "Falhas reais", value: detail.eligibility?.providerFailures ?? detail.totalFailed, color: (detail.eligibility?.providerFailures ?? detail.totalFailed) > 0 ? "text-red-600" : "text-muted" },
                        ].map((m) => (
                          <div key={m.label} className="rounded-xl border border-line bg-paper px-2 py-3 text-center shadow-sm">
                            <p className={`text-xl font-bold leading-none ${m.color}`}>{m.value}</p>
                            <p className="mt-1.5 text-[9px] text-muted leading-tight">{m.label}</p>
                          </div>
                        ))}
                      </div>
                      {Number(detail.totalRevenue) > 0 && (
                        <div className="mt-2 flex items-center gap-3 rounded-xl border border-green-100 bg-green-50 px-4 py-3">
                          <div className="flex-1">
                            <p className="text-[10px] font-semibold uppercase tracking-wide text-green-600">Receita gerada</p>
                            <p className="text-xl font-bold text-green-700">R$ {Number(detail.totalRevenue).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</p>
                          </div>
                          {convRate && <div className="text-right"><p className="text-[10px] font-semibold uppercase tracking-wide text-green-600">Conversão</p><p className="text-xl font-bold text-green-700">{convRate}%</p></div>}
                        </div>
                      )}
                    </div>

                    {/* Operational status quick view */}
                    {debug && !loadingDebug && (
                      <div className={`rounded-xl border px-4 py-3 ${debug.isDueNow ? "border-green-100 bg-green-50" : debug.safetyBlocks.length > 0 ? "border-red-100 bg-red-50" : "border-amber-100 bg-amber-50"}`}>
                        <div className="flex items-center gap-2">
                          <div className={`h-2 w-2 rounded-full shrink-0 ${debug.isDueNow ? "bg-green-500" : debug.safetyBlocks.length > 0 ? "bg-red-500" : "bg-amber-400"}`} />
                          <p className={`text-xs font-semibold ${debug.isDueNow ? "text-green-700" : debug.safetyBlocks.length > 0 ? "text-red-700" : "text-amber-700"}`}>
                            {debug.isDueNow ? "Campanha será processada no próximo ciclo do cron" : debug.safetyBlocks.length > 0 ? debug.safetyBlocks[0] : (debug.notDueReason ?? "Fora da janela de envio")}
                          </p>
                        </div>
                        {debug.dailyCapStatus && <p className="mt-1.5 text-[11px] text-ink2 ml-4">{debug.dailyCapStatus}</p>}
                      </div>
                    )}

                    {/* Schedule summary */}
                    {isRecurring && cfg && (
                      <div className="rounded-2xl border border-line bg-[#FAFAF8] p-4 space-y-2 text-xs">
                        <p className="text-[10px] font-bold uppercase tracking-widest text-muted">Programação recorrente</p>
                        <div className="flex flex-wrap gap-1">
                          {(cfg.weekdays ?? []).map((d) => (
                            <span key={d} className="rounded-full bg-brand-50 px-2 py-0.5 text-[10px] font-semibold text-brand-600">{WEEKDAY_LABELS_PT[d] ?? `D${d}`}</span>
                          ))}
                        </div>
                        {cfg.timeWindow && <p className="text-ink2"><span className="font-semibold">Janela:</span> {cfg.timeWindow.start}–{cfg.timeWindow.end}{cfg.timezone ? ` (${cfg.timezone})` : ""}</p>}
                        {cfg.dailyLimit && <p className="text-ink2"><span className="font-semibold">Limite diário:</span> {cfg.dailyLimit} mensagens</p>}
                        {cfg.endCondition && (
                          <p className="text-ink2">
                            <span className="font-semibold">Encerramento:</span>{" "}
                            {cfg.endCondition === "AUDIENCE_EXHAUSTED" ? "Quando audiência esgotar"
                              : cfg.endCondition === "END_DATE" && cfg.endDate ? `Em ${new Date(cfg.endDate).toLocaleDateString("pt-BR")}`
                              : cfg.endCondition === "MAX_TOTAL" && cfg.maxTotal != null ? `Após ${cfg.maxTotal} envios`
                              : cfg.endCondition}
                          </p>
                        )}
                      </div>
                    )}

                    {/* Name edit (inline, bottom of overview) */}
                    {canEdit && (
                      <div className="rounded-2xl border border-line bg-[#FAFAF8] p-4">
                        <p className="mb-2 text-[10px] font-bold uppercase tracking-widest text-muted">Editar nome da campanha</p>
                        <div className="flex gap-2">
                          <input
                            value={editName}
                            onChange={(e) => setEditName(e.target.value)}
                            maxLength={120}
                            className="flex-1 rounded-xl border border-line2 bg-paper px-3 py-2 text-sm text-ink focus:border-brand-300 focus:outline-none"
                          />
                          <button
                            onClick={handleSaveName}
                            disabled={savingName || editName.trim() === detail.name}
                            className="rounded-xl bg-brand-600 px-4 py-2 text-xs font-bold text-white hover:bg-brand-700 transition-colors disabled:opacity-40"
                          >
                            {savingName ? "…" : "Salvar"}
                          </button>
                        </div>
                        {nameSaved && <p className="mt-1.5 text-xs font-semibold text-green-600">✓ Nome atualizado!</p>}
                      </div>
                    )}

                    {/* Público-alvo — só campanhas personalizadas (as fixas têm público próprio) */}
                    {canEdit && !isFixedCampaign(detail.templateId) && (
                      <div className="rounded-2xl border border-line bg-[#FAFAF8] p-4">
                        <p className="mb-2 text-[10px] font-bold uppercase tracking-widest text-muted">Público-alvo</p>
                        <div className="flex gap-2">
                          <select
                            value={editSegment}
                            onChange={(e) => setEditSegment(e.target.value)}
                            className="flex-1 rounded-xl border border-line2 bg-paper px-3 py-2 text-sm text-ink focus:border-brand-300 focus:outline-none"
                          >
                            <option value="TODOS">Todos os clientes</option>
                            <option value="QUENTE">Clientes quentes</option>
                            <option value="MORNO">Clientes mornos</option>
                            <option value="FRIO">Clientes frios</option>
                            <option value="VIP">VIPs (Ouro/Diamante)</option>
                            <option value="PRIMEIRO_PEDIDO">Fizeram só 1 pedido</option>
                            <option value="SEM_PEDIDOS">Cadastrados sem compra</option>
                            <option value="RECORRENTES">Recorrentes (2+ pedidos)</option>
                          </select>
                          <button
                            onClick={handleSaveSegment}
                            disabled={savingSegment || editSegment === (detail.targetSegment ?? "TODOS")}
                            className="rounded-xl bg-brand-600 px-4 py-2 text-xs font-bold text-white hover:bg-brand-700 transition-colors disabled:opacity-40"
                          >
                            {savingSegment ? "…" : "Salvar"}
                          </button>
                        </div>
                        {segmentSaved && <p className="mt-1.5 text-xs font-semibold text-green-600">✓ Público atualizado!</p>}
                      </div>
                    )}
                  </div>
                )}

                {/* ── Mensagem ── */}
                {activeTab === "message" && (
                  <div className="space-y-5">
                    {canEdit && rmCanEditMsg ? (
                      <div>
                        <div className="mb-3 flex items-start justify-between gap-3">
                          <div>
                            <p className="text-[10px] font-bold uppercase tracking-widest text-muted">Frases da campanha</p>
                            <p className="mt-0.5 text-xs text-muted">
                              Ative as frases que vão rodar — cada envio sorteia uma das ativas, e os números mostram qual converte mais.
                            </p>
                          </div>
                          {savingMsg
                            ? <span className="shrink-0 text-xs font-semibold text-muted">Salvando…</span>
                            : msgSaved
                            ? <span className="shrink-0 text-xs font-semibold text-green-600">✓ Salvo</span>
                            : null}
                        </div>

                        {/* Coletando baseline: avisa que os números ainda estão maturando,
                            pra ninguém eleger favorita cedo demais. Só enquanto há envios
                            mas o baseline não foi atingido. */}
                        {phraseCampaign.totalSent > 0 && !phraseCampaign.baselineReached && (
                          <div className="mb-3 flex items-start gap-2 rounded-xl border border-blue-100 bg-blue-50/60 px-3 py-2 text-[11px] leading-snug text-blue-700">
                            <span aria-hidden>📊</span>
                            <span>
                              Coletando baseline — <b className="tabular-nums">{phraseCampaign.totalSent}/{phraseCampaign.baselineTarget}</b> envios.
                              Os números ainda estão maturando: o agente testa todas por igual antes de eleger favoritas.
                            </span>
                          </div>
                        )}

                        <div className="space-y-2">
                          {/* Frases prontas do catálogo */}
                          {rmVariants.map((v) => {
                            const key = phraseKey(v);
                            const on  = poolSelected.has(key);
                            const st  = phraseStats[key];
                            return (
                              <div key={key} className={`rounded-xl border px-3 py-2.5 transition-colors ${on ? "border-emerald-200 bg-emerald-50/40" : "border-line bg-white"}`}>
                                <div className="flex items-start gap-3">
                                  <button
                                    onClick={() => {
                                      const next = new Set(poolSelected);
                                      if (on) next.delete(key); else next.add(key);
                                      void savePool(next, poolCustom);
                                    }}
                                    disabled={savingMsg}
                                    aria-label={on ? "Desativar frase" : "Ativar frase"}
                                    className={`mt-0.5 shrink-0 relative inline-flex h-5 w-9 items-center rounded-full transition-colors disabled:opacity-50 ${on ? "bg-emerald-500" : "bg-gray-300"}`}
                                  >
                                    <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform ${on ? "translate-x-[1.15rem]" : "translate-x-0.5"}`} />
                                  </button>
                                  <div className="min-w-0 flex-1">
                                    <p className="whitespace-pre-wrap text-sm leading-relaxed text-ink">{v}</p>
                                    {coupon && !/\{cupom\}/i.test(v) && (
                                      <p className="mt-0.5 text-[10px] text-emerald-600">🎁 + linha do cupom no final (automática): &ldquo;você ganhou {couponLabel(coupon)}…&rdquo;</p>
                                    )}
                                    <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1">
                                      {confidenceBadge(key)}
                                      {metaBadge(key)}
                                      <p className="text-[10px] tabular-nums text-muted">
                                        {st && st.sent > 0
                                          ? <>📤 {st.sent} enviadas · 🛒 {st.converted} pedidos · <span className={st.converted > 0 ? "font-bold text-emerald-700" : ""}>{Math.round((st.converted / st.sent) * 100)}%</span>{st.revenue > 0 && <> · R$ {st.revenue.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</>}</>
                                          : "sem envios ainda"}
                                      </p>
                                    </div>
                                  </div>
                                </div>
                              </div>
                            );
                          })}

                          {/* Frases personalizadas do dono */}
                          {poolCustom.map((c) => {
                            const key = phraseKey(c.text);
                            const st  = phraseStats[key];
                            return (
                              <div key={c.id} className={`rounded-xl border px-3 py-2.5 transition-colors ${c.on ? "border-emerald-200 bg-emerald-50/40" : "border-line bg-white"}`}>
                                <div className="flex items-start gap-3">
                                  <button
                                    onClick={() => void savePool(poolSelected, poolCustom.map((x) => x.id === c.id ? { ...x, on: !x.on } : x))}
                                    disabled={savingMsg}
                                    aria-label={c.on ? "Desativar frase" : "Ativar frase"}
                                    className={`mt-0.5 shrink-0 relative inline-flex h-5 w-9 items-center rounded-full transition-colors disabled:opacity-50 ${c.on ? "bg-emerald-500" : "bg-gray-300"}`}
                                  >
                                    <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform ${c.on ? "translate-x-[1.15rem]" : "translate-x-0.5"}`} />
                                  </button>
                                  <div className="min-w-0 flex-1">
                                    <p className="whitespace-pre-wrap text-sm leading-relaxed text-ink">{c.text}</p>
                                    {coupon && !/\{cupom\}/i.test(c.text) && (
                                      <p className="mt-0.5 text-[10px] text-emerald-600">🎁 + linha do cupom no final (automática): &ldquo;você ganhou {couponLabel(coupon)}…&rdquo;</p>
                                    )}
                                    <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
                                      <span className="rounded-full bg-amber-100 px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-wide text-amber-700">Sua frase</span>
                                      {confidenceBadge(key)}
                                      {metaBadge(key)}
                                      <p className="text-[10px] tabular-nums text-muted">
                                        {st && st.sent > 0
                                          ? <>📤 {st.sent} enviadas · 🛒 {st.converted} pedidos · <span className={st.converted > 0 ? "font-bold text-emerald-700" : ""}>{Math.round((st.converted / st.sent) * 100)}%</span></>
                                          : "sem envios ainda"}
                                      </p>
                                      <button
                                        onClick={() => { if (confirm("Excluir esta frase personalizada?")) void savePool(poolSelected, poolCustom.filter((x) => x.id !== c.id)); }}
                                        disabled={savingMsg}
                                        className="text-[10px] font-semibold text-red-500 hover:text-red-700 disabled:opacity-50"
                                      >Excluir</button>
                                    </div>
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                        </div>

                        {poolActiveCount === 0 && (
                          <p className="mt-2 rounded-lg border border-amber-100 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                            Nenhuma frase ativa — a mensagem padrão da campanha continua rodando até você ativar pelo menos uma.
                          </p>
                        )}

                        {/* Nova frase personalizada (máx {MAX_CUSTOM_PHRASES}) */}
                        {poolCustom.length < MAX_CUSTOM_PHRASES ? (
                          composing ? (
                            <div className="mt-3 rounded-xl border border-brand-200 bg-brand-50/30 p-3">
                              <p className="mb-1 text-[10px] font-bold uppercase tracking-widest text-muted">Nova frase personalizada</p>
                              <textarea
                                value={msgText}
                                onChange={(e) => setMsgText(e.target.value)}
                                rows={5}
                                maxLength={1000}
                                autoFocus
                                placeholder="Escreva sua frase… use {nome}, {cupom}, {validade}, {link_cardapio}"
                                className="w-full resize-y rounded-xl border border-line2 bg-white px-3 py-2.5 text-sm text-ink placeholder-gray-400 focus:border-brand-300 focus:outline-none focus:ring-2 focus:ring-brand-100"
                              />
                              <p className="mt-1 text-[10px] text-muted">Variáveis: {"{nome}"}, {"{restaurante}"}, {"{cupom}"}, {"{validade}"}, {"{link_cardapio}"}</p>
                              {msgText.trim() && (
                                <div className="mt-2 rounded-lg bg-emerald-50/60 px-3 py-2">
                                  <p className="text-[10px] font-semibold uppercase tracking-wide text-emerald-700">Prévia</p>
                                  <p className="mt-0.5 whitespace-pre-wrap break-words text-sm text-ink">{msgPreview}</p>
                                </div>
                              )}
                              <div className="mt-2 flex items-center gap-2">
                                <button
                                  onClick={() => void handleAddPhrase()}
                                  disabled={savingMsg || !msgText.trim()}
                                  className="rounded-xl bg-brand-600 px-3.5 py-1.5 text-xs font-bold text-white hover:bg-brand-700 transition-colors disabled:opacity-50"
                                >Adicionar frase</button>
                                <button
                                  onClick={() => { setComposing(false); setMsgText(""); }}
                                  className="rounded-xl border border-line px-3.5 py-1.5 text-xs font-semibold text-ink2 hover:bg-[#FAFAF8] transition-colors"
                                >Cancelar</button>
                              </div>
                            </div>
                          ) : (
                            <button
                              onClick={() => setComposing(true)}
                              className="mt-3 w-full rounded-xl border-2 border-dashed border-line px-3 py-2.5 text-xs font-semibold text-ink2 hover:border-brand-300 hover:text-brand-700 transition-colors"
                            >
                              + Nova frase personalizada ({poolCustom.length}/{MAX_CUSTOM_PHRASES})
                            </button>
                          )
                        ) : (
                          <p className="mt-3 rounded-lg border border-amber-100 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                            Limite de {MAX_CUSTOM_PHRASES} frases personalizadas atingido — exclua uma para criar outra.
                          </p>
                        )}
                      </div>
                    ) : !canEdit ? (
                      <p className="rounded-xl border border-line bg-[#FAFAF8] px-4 py-3 text-xs text-muted">
                        Campanha finalizada — a mensagem não pode ser editada.
                      </p>
                    ) : (
                      <p className="rounded-xl border border-amber-100 bg-amber-50 px-4 py-3 text-xs text-amber-800">
                        A mensagem desta campanha é gerenciada pelo sistema.
                      </p>
                    )}

                    {/* ── Recompensa por nível (Subiu de nível / Mimo mensal) ── */}
                    {canEdit && isTierCouponCampaign && (
                      <div className="border-t border-line pt-5">
                        <p className="mb-1 text-[10px] font-bold uppercase tracking-widest text-muted">Recompensa por nível</p>
                        <p className="mb-3 text-xs text-muted">
                          Cada nível ganha a própria recompensa — Diamante deve sentir que vale mais que Prata.
                        </p>
                        <div className="space-y-2">
                          {([
                            { key: "PRATA",    label: "🥈 Prata" },
                            { key: "OURO",     label: "🥇 Ouro" },
                            { key: "DIAMANTE", label: "💎 Diamante" },
                          ] as { key: string; label: string }[]).map(({ key, label }) => {
                            const c = tierCoupons[key] ?? null;
                            const setTier = (v: ReadyMadeCoupon | null) => setTierCoupons((p) => ({ ...p, [key]: v }));
                            return (
                              <div key={key} className="rounded-xl border border-line p-3">
                                <div className="flex flex-wrap items-center gap-2">
                                  <span className="w-24 text-sm font-bold text-ink">{label}</span>
                                  {([
                                    { t: null,            lbl: "Sem" },
                                    { t: "PERCENTAGE",    lbl: "%" },
                                    { t: "FIXED",         lbl: "R$" },
                                    { t: "FREE_SHIPPING", lbl: "Frete" },
                                    { t: "CUSTOM",        lbl: "Brinde" },
                                  ] as { t: CouponType | null; lbl: string }[]).map((opt) => (
                                    <button
                                      key={opt.lbl}
                                      onClick={() => setTier(
                                        opt.t === null ? null
                                        : opt.t === "CUSTOM"
                                        ? { type: "CUSTOM", value: c?.type === "CUSTOM" ? c.value : 0, description: c?.description ?? "", validityDays: c?.validityDays ?? 30 }
                                        : opt.t === "FREE_SHIPPING"
                                        ? { type: "FREE_SHIPPING", value: c?.type === "FREE_SHIPPING" ? c.value : 8, validityDays: c?.validityDays ?? 30 }
                                        : { type: opt.t, value: c && c.type === opt.t ? c.value : (opt.t === "PERCENTAGE" ? 10 : 15), validityDays: c?.validityDays ?? 30 }
                                      )}
                                      className={`rounded-lg border px-2.5 py-1 text-xs font-semibold transition-colors ${(c?.type ?? null) === opt.t ? "border-brand-400 bg-brand-50 text-ink" : "border-line bg-white text-ink2 hover:bg-[#FAFAF8]"}`}
                                    >{opt.lbl}</button>
                                  ))}
                                  {c && c.type !== "CUSTOM" && (
                                    <input
                                      type="number" min={1} max={100000} value={c.value}
                                      onChange={(e) => setTier({ ...c, value: Math.max(1, parseInt(e.target.value, 10) || 1) })}
                                      className="w-20 rounded-lg border border-line bg-white px-2 py-1 text-sm text-ink focus:border-brand-400 focus:outline-none"
                                    />
                                  )}
                                  {c && c.type === "CUSTOM" && (
                                    <input
                                      type="text" maxLength={80} placeholder="ex.: sobremesa grátis" value={c.description ?? ""}
                                      onChange={(e) => setTier({ ...c, description: e.target.value })}
                                      className="min-w-[160px] flex-1 rounded-lg border border-line bg-white px-2 py-1 text-sm text-ink focus:border-brand-400 focus:outline-none"
                                    />
                                  )}
                                  {c && (
                                    <span className="flex items-center gap-1 text-xs text-muted">
                                      válido
                                      <input
                                        type="number" min={1} max={365} value={c.validityDays ?? 30}
                                        onChange={(e) => setTier({ ...c, validityDays: Math.max(1, parseInt(e.target.value, 10) || 30) })}
                                        className="w-14 rounded-lg border border-line bg-white px-1.5 py-1 text-sm text-ink focus:border-brand-400 focus:outline-none"
                                      />
                                      dias
                                    </span>
                                  )}
                                </div>
                                <p className="mt-1.5 text-[11px] text-emerald-700">
                                  {c ? <>Ganha <span className="font-bold">{couponLabel(c)}</span> na carteira.</> : <span className="text-muted">Este nível não recebe recompensa.</span>}
                                </p>
                              </div>
                            );
                          })}
                        </div>
                        <div className="mt-3 flex items-center gap-3">
                          <button
                            onClick={() => void handleSaveTierCoupons()}
                            disabled={savingTierC}
                            className="rounded-xl bg-brand-600 px-4 py-2 text-sm font-bold text-white hover:bg-brand-700 transition-colors disabled:opacity-50"
                          >{savingTierC ? "Salvando…" : "Salvar recompensas"}</button>
                          {tierCSaved && <p className="text-xs font-semibold text-green-600">✓ Salvo!</p>}
                        </div>
                      </div>
                    )}

                    {/* ── Cupom / recompensa (recorrentes + carrinho) ── */}
                    {canEdit && (isRecurring || isCartRecovery) && !isTierCouponCampaign && (
                      <div className="border-t border-line pt-5">
                        <p className="mb-1.5 text-[10px] font-bold uppercase tracking-widest text-muted">Cupom de desconto (opcional)</p>
                        <div className="flex flex-wrap gap-2">
                          {([
                            { key: null,            label: "Sem cupom" },
                            { key: "PERCENTAGE",    label: "Porcentagem" },
                            { key: "FIXED",         label: "Valor em R$" },
                            { key: "FREE_SHIPPING", label: "Frete grátis" },
                            { key: "CUSTOM",        label: "Recompensa" },
                          ] as { key: CouponType | null; label: string }[]).map((opt) => {
                            const activeOpt = (coupon?.type ?? null) === opt.key;
                            return (
                              <button
                                key={opt.label}
                                onClick={() => setCoupon(
                                  opt.key === null
                                    ? null
                                    : opt.key === "CUSTOM"
                                    ? { type: "CUSTOM", value: coupon?.type === "CUSTOM" ? coupon.value : 0, description: coupon?.description ?? "", validityDays: coupon?.validityDays }
                                    : opt.key === "FREE_SHIPPING"
                                    ? { type: "FREE_SHIPPING", value: coupon?.type === "FREE_SHIPPING" ? coupon.value : 8, validityDays: coupon?.validityDays }
                                    : { type: opt.key, value: (opt.key === "PERCENTAGE" ? COUPON_PERCENT_OPTIONS : COUPON_FIXED_OPTIONS)[1], validityDays: coupon?.validityDays }
                                )}
                                className={`rounded-xl border px-3 py-2 text-sm font-semibold transition-colors ${activeOpt ? "border-brand-400 bg-brand-50 text-ink" : "border-line bg-white text-ink2 hover:bg-[#FAFAF8]"}`}
                              >{opt.label}</button>
                            );
                          })}
                        </div>

                        {coupon && coupon.type === "FREE_SHIPPING" && (
                          <div className="mt-2 flex items-center gap-2">
                            <input
                              type="number" min={0} max={1000}
                              value={coupon.value}
                              onChange={(e) => setCoupon({ ...coupon, value: Math.max(0, parseInt(e.target.value, 10) || 0) })}
                              className="w-28 rounded-xl border border-line bg-white px-3 py-2 text-base text-ink focus:border-brand-400 focus:outline-none"
                            />
                            <span className="text-xs text-muted">custo estimado do frete (R$), só p/ orçamento</span>
                          </div>
                        )}

                        {coupon && coupon.type !== "CUSTOM" && coupon.type !== "FREE_SHIPPING" && (
                          <div className="mt-2 flex flex-wrap gap-2">
                            {(coupon.type === "PERCENTAGE" ? COUPON_PERCENT_OPTIONS : COUPON_FIXED_OPTIONS).map((v) => (
                              <button
                                key={v}
                                onClick={() => setCoupon({ type: coupon.type, value: v, validityDays: coupon.validityDays })}
                                className={`rounded-xl border px-3.5 py-2 text-sm font-bold transition-colors ${coupon.value === v ? "border-brand-400 bg-brand-50 text-ink" : "border-line bg-white text-ink2 hover:bg-[#FAFAF8]"}`}
                              >{coupon.type === "PERCENTAGE" ? `${v}%` : `R$ ${v}`}</button>
                            ))}
                          </div>
                        )}

                        {coupon && coupon.type === "CUSTOM" && (
                          <div className="mt-2 space-y-2">
                            <input
                              type="text" maxLength={80} placeholder="ex.: sobremesa grátis"
                              value={coupon.description ?? ""}
                              onChange={(e) => setCoupon({ ...coupon, description: e.target.value })}
                              className="w-full rounded-xl border border-line bg-white px-3 py-2 text-base text-ink focus:border-brand-400 focus:outline-none"
                            />
                            <div className="flex items-center gap-2">
                              <input
                                type="number" min={0} max={100000}
                                value={coupon.value}
                                onChange={(e) => setCoupon({ ...coupon, value: Math.max(0, parseInt(e.target.value, 10) || 0) })}
                                className="w-28 rounded-xl border border-line bg-white px-3 py-2 text-base text-ink focus:border-brand-400 focus:outline-none"
                              />
                              <span className="text-xs text-muted">custo estimado (R$), só p/ orçamento</span>
                            </div>
                          </div>
                        )}

                        {coupon && (
                          <div className="mt-2 flex items-center gap-2">
                            <label className="text-xs font-semibold uppercase tracking-wide text-muted">Válido por</label>
                            <input
                              type="number" min={1} max={365}
                              value={coupon.validityDays ?? 30}
                              onChange={(e) => setCoupon({ ...coupon, validityDays: Math.max(1, parseInt(e.target.value, 10) || 30) })}
                              className="w-20 rounded-xl border border-line bg-white px-3 py-2 text-base text-ink focus:border-brand-400 focus:outline-none"
                            />
                            <span className="text-sm text-muted">dias</span>
                          </div>
                        )}

                        {coupon && (
                          <p className="mt-2 rounded-lg bg-emerald-50/60 px-3 py-2 text-xs text-emerald-800">
                            O cliente ganha <span className="font-bold">{couponLabel(coupon)}</span> na carteira.
                            Use <code className="rounded bg-white/70 px-1">{"{cupom}"}</code> na mensagem para mostrar o benefício.
                          </p>
                        )}

                        <div className="mt-3 flex items-center gap-3">
                          <button
                            onClick={handleSaveCoupon}
                            disabled={savingCoupon}
                            className="rounded-xl bg-brand-600 px-4 py-2 text-sm font-bold text-white hover:bg-brand-700 transition-colors disabled:opacity-50"
                          >{savingCoupon ? "Salvando…" : "Salvar cupom"}</button>
                          {couponSaved && <p className="text-xs font-semibold text-green-600">✓ Salvo!</p>}
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* ── Agendamento (recurring only) ── */}
                {activeTab === "schedule" && isRecurring && (
                  <div className="space-y-5">
                    {rmTiming && (
                      <div className="rounded-2xl border border-line bg-[#FAFAF8] p-4">
                        <p className="text-[10px] font-bold uppercase tracking-widest text-muted">Quando é enviada</p>
                        {rmTiming.summary && <p className="mt-1.5 text-sm text-ink2">🕒 {rmTiming.summary}</p>}
                        {rmTiming.fromSegmentation && (
                          <p className="mt-1.5 text-xs text-muted">Os dias que definem esta fase ficam em <span className="font-semibold">Configurações → Segmentação</span>.</p>
                        )}
                        <p className="mt-2.5 text-xs leading-relaxed text-muted">{CADENCE_EXPLAINER}</p>
                      </div>
                    )}

                    {canEdit && rmCanTrigger && (
                      <div className="rounded-2xl border border-line p-4">
                        {/* Each campaign defines its own wording (before/after the event) —
                            e.g. cupom-vencendo: "Avisar quantos dias ANTES de vencer". */}
                        <p className="mb-2 text-[10px] font-bold uppercase tracking-widest text-muted">
                          {readyMade?.triggerDaysLabel ?? "Dias após o evento"}
                        </p>
                        <div className="flex items-center gap-2">
                          <input
                            type="number" min={0} max={90}
                            value={triggerDays}
                            onChange={(e) => setTriggerDays(Math.max(0, parseInt(e.target.value, 10) || 0))}
                            className="w-24 rounded-xl border border-line bg-white px-3 py-2 text-base text-ink focus:border-brand-400 focus:outline-none"
                          />
                          <span className="text-sm text-muted">dias (salvo junto com o agendamento)</span>
                        </div>
                      </div>
                    )}

                    <div className="rounded-2xl border border-line bg-[#FAFAF8] p-4 space-y-2 text-xs">
                      <p className="text-[10px] font-bold uppercase tracking-widest text-muted">Configuração atual</p>
                      <div className="flex flex-wrap gap-1">
                        {(cfg?.weekdays ?? []).map((d) => (
                          <span key={d} className="rounded-full bg-brand-50 px-2 py-0.5 text-[10px] font-semibold text-brand-600">{WEEKDAY_LABELS_PT[d] ?? `D${d}`}</span>
                        ))}
                      </div>
                      {cfg?.timeWindow && <p className="text-ink2"><span className="font-semibold">Janela:</span> {cfg.timeWindow.start}–{cfg.timeWindow.end}</p>}
                      {cfg?.dailyLimit && <p className="text-ink2"><span className="font-semibold">Limite diário:</span> {cfg.dailyLimit} mensagens</p>}
                    </div>

                    {canEdit && (
                      <div className="space-y-4">
                        <p className="text-[10px] font-bold uppercase tracking-widest text-muted">Editar agendamento</p>
                        <p className="text-xs text-muted">Alterações valem para os próximos ciclos. Disparos já realizados não são afetados.</p>

                        <div>
                          <p className="mb-2 text-xs font-semibold text-ink2">Dias da semana</p>
                          <div className="flex flex-wrap gap-2">
                            {WEEKDAY_LABELS_PT.map((label, d) => (
                              <button
                                key={d}
                                onClick={() => setEditWd((prev) => prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d].sort())}
                                className={`rounded-full px-3 py-1 text-xs font-semibold transition-colors ${editWd.includes(d) ? "bg-brand-600 text-white" : "bg-[#F4F4F2] text-ink2 hover:bg-line2"}`}
                              >{label}</button>
                            ))}
                          </div>
                        </div>

                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <label className="mb-1 block text-xs font-semibold text-ink2">Início</label>
                            <input type="time" value={editStart} onChange={(e) => setEditStart(e.target.value)}
                              className="w-full rounded-xl border border-line2 bg-paper px-3 py-2 text-sm focus:border-brand-300 focus:outline-none" />
                          </div>
                          <div>
                            <label className="mb-1 block text-xs font-semibold text-ink2">Fim</label>
                            <input type="time" value={editEnd} onChange={(e) => setEditEnd(e.target.value)}
                              className="w-full rounded-xl border border-line2 bg-paper px-3 py-2 text-sm focus:border-brand-300 focus:outline-none" />
                          </div>
                        </div>

                        <div>
                          <label className="mb-1 block text-xs font-semibold text-ink2">Limite diário (mensagens)</label>
                          <input type="number" min={1} max={200} value={editLimit}
                            onChange={(e) => setEditLimit(Math.max(1, Math.min(200, parseInt(e.target.value) || 1)))}
                            className="w-32 rounded-xl border border-line2 bg-paper px-3 py-2 text-sm focus:border-brand-300 focus:outline-none" />
                          <p className="mt-1 text-[10px] text-muted">Máximo: 200/dia</p>
                        </div>

                        <div className="flex items-center gap-3">
                          <button
                            onClick={handleSaveSchedule}
                            disabled={savingSched}
                            className="rounded-xl bg-brand-600 px-4 py-2 text-sm font-bold text-white hover:bg-brand-700 transition-colors disabled:opacity-50"
                          >
                            {savingSched ? "Salvando…" : "Salvar agendamento"}
                          </button>
                          {schedSaved && <p className="text-xs font-semibold text-green-600">✓ Agendamento atualizado!</p>}
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* ── Performance ── */}
                {activeTab === "performance" && (
                  <div className="space-y-6">
                    <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-line bg-[#FAFAF8] px-3 py-2">
                      <p className="text-[11px] text-muted">📨 As mensagens enviadas aparecem na lista <strong>&quot;Mensagens enviadas&quot;</strong> logo abaixo (com data, hora e texto).</p>
                      <button
                        onClick={handleClearMetrics}
                        disabled={clearingMetrics}
                        className="shrink-0 rounded-lg border border-red-200 bg-red-50 px-2.5 py-1 text-[11px] font-semibold text-red-600 hover:bg-red-100 transition-colors disabled:opacity-50"
                        title="Zera os números e apaga o histórico de falhas só desta campanha."
                      >
                        {clearingMetrics ? "Limpando…" : "🧹 Limpar falhas desta campanha"}
                      </button>
                    </div>
                    {(() => {
                      const perf = detail.performance;
                      const cycle = detail.currentCyclePerformance;
                      const sent = perf?.sent ?? detail.totalSent;
                      const blocked = perf?.blockedSafety ?? 0;
                      const failed = perf?.failedProvider ?? detail.totalFailed;
                      return (
                        <>
                          {/* Current cycle — only for recurring campaigns with lastRunAt */}
                          {isRecurring && cycle && (
                            <div>
                              <p className="mb-1 text-[10px] font-bold uppercase tracking-widest text-brand-500">Último ciclo</p>
                              {detail.lastRunAt && (
                                <p className="mb-2 text-[9px] text-muted">Desde {new Date(detail.lastRunAt).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}</p>
                              )}
                              <div className="grid grid-cols-3 gap-2">
                                {[
                                  { label: "Enviados",             value: cycle.sent,           color: "text-blue-700" },
                                  { label: "Bloqueados",           value: cycle.blockedSafety,  color: cycle.blockedSafety > 0 ? "text-amber-600" : "text-muted" },
                                  { label: "Falhas",               value: cycle.failedProvider, color: cycle.failedProvider > 0 ? "text-red-600" : "text-muted" },
                                ].map((m) => (
                                  <div key={m.label} className="rounded-xl border border-brand-100 bg-brand-50/40 px-2 py-3 text-center">
                                    <p className={`text-xl font-bold leading-none ${m.color}`}>{m.value}</p>
                                    <p className="mt-1.5 text-[9px] text-muted leading-tight">{m.label}</p>
                                  </div>
                                ))}
                              </div>
                              {cycle.reasonGroups.length > 0 && (
                                <div className="mt-2 flex flex-wrap gap-1.5">
                                  {cycle.reasonGroups.map((g) => (
                                    <span key={g.category} className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${g.kind === "FAILED" ? "bg-red-50 text-red-600" : g.kind === "BLOCKED" ? "bg-amber-50 text-amber-700" : "bg-[#F4F4F2] text-ink2"}`}>
                                      {g.badge}: {g.count}{g.kind === "FAILED" && g.retryabilityLabel ? ` · ${g.retryabilityLabel}` : ""}
                                    </span>
                                  ))}
                                </div>
                              )}
                            </div>
                          )}

                          <div>
                            <p className="mb-3 text-[10px] font-bold uppercase tracking-widest text-muted">
                              {isRecurring ? "Total histórico (todos os ciclos)" : "Resultados totais"}
                            </p>
                            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                              {[
                                { label: "Audiência",          value: detail.eligibility?.audienceTotal ?? perf?.audience ?? detail.totalAudience, color: "text-ink2" },
                                { label: "Elegíveis WhatsApp", value: detail.eligibility?.whatsAppEligible ?? "—", color: "text-ink2" },
                                { label: "Enviados",           value: sent,    color: "text-blue-700" },
                                { label: "Ignorados",          value: (detail.eligibility?.skipped ?? perf?.skipped ?? 0) + blocked, color: (detail.eligibility?.skipped ?? 0) + blocked > 0 ? "text-amber-600" : "text-muted" },
                                { label: "Falhas reais",       value: detail.eligibility?.providerFailures ?? failed, color: (detail.eligibility?.providerFailures ?? failed) > 0 ? "text-red-600" : "text-muted" },
                                { label: "Respostas",          value: detail.totalResponded, color: "text-blue-600" },
                                { label: "Pedidos",            value: detail.totalConverted, color: detail.totalConverted > 0 ? "text-green-700" : "text-muted" },
                                { label: "Conversão",          value: convRate ? `${convRate}%` : "—", color: convRate ? "text-green-700" : "text-muted" },
                              ].map((m) => (
                                <div key={m.label} className="rounded-xl border border-line bg-paper px-2 py-3 text-center shadow-sm">
                                  <p className={`text-xl font-bold leading-none ${m.color}`}>{m.value}</p>
                                  <p className="mt-1.5 text-[9px] text-muted leading-tight">{m.label}</p>
                                </div>
                              ))}
                            </div>
                            {blocked > 0 && (
                              <p className="mt-2 text-[10px] text-amber-600">
                                ⓘ Bloqueios de segurança (limite semanal, cooldown, opt-out) <strong>não são falhas de envio</strong> — os clientes voltam a ficar elegíveis quando a janela expira.
                              </p>
                            )}
                            {detail.eligibility && (detail.eligibility.skipped > 0 || detail.eligibility.providerFailures > 0 || detail.eligibility.blockedSafety > 0) && (() => {
                              const el = detail.eligibility;
                              const sb = el.skippedBreakdown;
                              const fb = el.failureBreakdown;
                              const skipRows = [
                                { label: "Sem telefone",     n: sb.noPhone,        tag: "Precisa corrigir cadastro" },
                                { label: "Telefone inválido", n: sb.invalidPhone,   tag: "Precisa corrigir cadastro" },
                                { label: "Opt-out",          n: sb.optOut,         tag: "Não reenviar" },
                                { label: "Não contactável",  n: sb.notContactable, tag: "Precisa corrigir cadastro" },
                                { label: "Não elegível",     n: sb.otherNotEligible, tag: "Ignorado" },
                              ].filter((r) => r.n > 0);
                              const failRows = [
                                { label: "Erro temporário Evolution (5xx)", n: fb.http500,      tag: "Pode reenviar depois" },
                                { label: "Timeout / conexão",               n: fb.timeout,      tag: "Pode reenviar depois" },
                                { label: "Rate limit",                      n: fb.rateLimit,    tag: "Pode reenviar depois" },
                                { label: "Instância desconectada",          n: fb.disconnected, tag: "Pode reenviar depois" },
                                { label: "Bad request (400)",               n: fb.http400,      tag: "Precisa corrigir" },
                                { label: "Autenticação",                    n: fb.auth,         tag: "Precisa corrigir" },
                                { label: "Mensagem vazia",                  n: fb.emptyMessage, tag: "Precisa corrigir" },
                                { label: "Erro desconhecido",               n: fb.unknown,      tag: "Pode reenviar depois" },
                              ].filter((r) => r.n > 0);
                              return (
                                <div className="mt-3 space-y-3">
                                  <p className="rounded-lg bg-[#FAFAF8] px-3 py-2 text-[10px] text-muted">
                                    <strong>Ignorados</strong> são clientes que não foram enviados por falta de telefone, opt-out ou regra de segurança.
                                    <strong> Falhas reais</strong> são erros após a tentativa de envio pelo WhatsApp.
                                  </p>
                                  {(skipRows.length > 0 || el.blockedSafety > 0) && (
                                    <div className="rounded-xl border border-amber-100 bg-amber-50/40 px-3 py-2.5">
                                      <p className="text-[10px] font-bold uppercase tracking-widest text-amber-600">Ignorados antes do envio · {el.skipped + el.blockedSafety}</p>
                                      <div className="mt-1.5 flex flex-wrap gap-1.5">
                                        {skipRows.map((r) => (
                                          <span key={r.label} className="rounded-full bg-paper px-2 py-0.5 text-[10px] font-semibold text-amber-700 border border-amber-200">{r.label}: {r.n} · {r.tag}</span>
                                        ))}
                                        {el.blockedSafety > 0 && (
                                          <span className="rounded-full bg-paper px-2 py-0.5 text-[10px] font-semibold text-amber-700 border border-amber-200">Limite de segurança: {el.blockedSafety} · Ignorado por segurança</span>
                                        )}
                                      </div>
                                    </div>
                                  )}
                                  {failRows.length > 0 && (
                                    <div className="rounded-xl border border-red-100 bg-red-50/40 px-3 py-2.5">
                                      <p className="text-[10px] font-bold uppercase tracking-widest text-red-500">Falhas reais de envio · {el.providerFailures}</p>
                                      <div className="mt-1.5 flex flex-wrap gap-1.5">
                                        {failRows.map((r) => (
                                          <span key={r.label} className="rounded-full bg-paper px-2 py-0.5 text-[10px] font-semibold text-red-600 border border-red-200">{r.label}: {r.n} · {r.tag}</span>
                                        ))}
                                      </div>
                                      <p className="mt-1.5 text-[10px] text-muted">
                                        <strong className="text-brand-600">{el.recoverableFailures}</strong> podem ser reenviadas depois · <strong>{el.permanentFailures}</strong> precisam de correção.
                                      </p>
                                    </div>
                                  )}
                                  <RecoverableReprocessPanel campaignId={detail.id} onDone={reloadDetail} />
                                  <p className="rounded-lg bg-brand-50 px-3 py-2 text-[10px] text-brand-600">
                                    Um <strong>ciclo</strong> é cada execução do robô de campanhas. No <strong>modo seguro WhatsApp Web</strong>, o Foocci envia até <strong>{detail.safeSend?.maxPerCycle ?? 5} mensagens por ciclo</strong> para evitar travamentos e reduzir risco de bloqueio.
                                  </p>
                                  {detail.budget?.enabled && (
                                    <div className="rounded-xl border border-emerald-200 bg-emerald-50/60 px-3 py-2.5">
                                      <p className="text-[11px] font-semibold text-emerald-800">Orçamento de envio WhatsApp</p>
                                      <div className="mt-1.5 grid grid-cols-2 gap-x-4 gap-y-1 text-[10px] text-gray-700">
                                        <span>Diário global usado</span>
                                        <span className="text-right font-semibold">
                                          {detail.budget.globalDailyUsed ?? 0}
                                          {detail.budget.globalDailyLimit ? ` / ${detail.budget.globalDailyLimit}` : " (sem limite)"}
                                        </span>
                                        {detail.budget.campaign && (
                                          <>
                                            <span>Enviado hoje por esta campanha</span>
                                            <span className="text-right font-semibold">
                                              {detail.budget.campaign.alreadySentToday}
                                              {detail.budget.campaign.dailyQuota > 0 ? ` / ${detail.budget.campaign.dailyQuota}` : ""}
                                            </span>
                                            <span>Próximo ciclo</span>
                                            <span className="text-right font-semibold">{detail.budget.campaign.reasonText}</span>
                                          </>
                                        )}
                                      </div>
                                    </div>
                                  )}
                                  {el.recoverableFailures > 0 && (
                                    <div className="rounded-xl border border-brand-200 bg-paper px-3 py-2.5">
                                      <div className="flex items-center justify-between gap-2">
                                        <p className="text-[11px] font-semibold text-brand-700">{el.recoverableFailures} falha(s) recuperável(is) — pode reenviar depois.</p>
                                        <button
                                          type="button"
                                          disabled={loadingPlan}
                                          onClick={() => loadReprocessPlan(detail.id)}
                                          className="rounded-lg bg-brand-500 px-3 py-1.5 text-[11px] font-semibold text-white hover:bg-brand-600 disabled:opacity-50"
                                        >
                                          {loadingPlan ? "Preparando…" : showReprocess ? "Atualizar preview" : "Preparar reenvio"}
                                        </button>
                                      </div>
                                      {showReprocess && reprocessPlan && (
                                        <div className="mt-2.5 rounded-lg bg-brand-50 px-3 py-2.5">
                                          <p className="text-[12px] font-bold text-brand-800">Reprocessar falhas recuperáveis?</p>
                                          <p className="mt-1 text-[10px] text-brand-600">O Foocci vai reenviar apenas para clientes com falha temporária, removendo duplicados e respeitando o limite de {reprocessPlan.batchLimit} por ciclo.</p>
                                          <div className="mt-2 grid grid-cols-2 gap-1.5 text-[10px] text-brand-700 sm:grid-cols-4">
                                            <div><span className="font-bold">{reprocessPlan.recoverableExecutions}</span> recuperáveis</div>
                                            <div><span className="font-bold">{reprocessPlan.duplicatesRemoved}</span> duplicados removidos</div>
                                            <div><span className="font-bold">{reprocessPlan.eligibleToReprocess}</span> elegíveis</div>
                                            <div><span className="font-bold">{reprocessPlan.nextBatch.length}</span> no próximo lote</div>
                                          </div>
                                          <p className={`mt-2 text-[10px] font-semibold ${reprocessPlan.instance.connected ? "text-green-700" : "text-red-600"}`}>
                                            Instância WhatsApp: {reprocessPlan.instance.connected ? "conectada ✓" : `desconectada (${reprocessPlan.instance.state}) — reconecte antes de reprocessar`}
                                          </p>
                                          {reprocessPlan.nextBatch.length > 0 && (
                                            <div className="mt-2 space-y-0.5">
                                              <p className="text-[9px] font-bold uppercase tracking-widest text-brand-500">Próximo lote</p>
                                              {reprocessPlan.nextBatch.map((b, i) => (
                                                <p key={i} className="text-[10px] text-brand-600">{b.customerName || "—"} · {b.maskedPhone} · {b.reason}</p>
                                              ))}
                                            </div>
                                          )}
                                          <div className="mt-2.5 flex items-center gap-2">
                                            <button
                                              type="button"
                                              disabled={!reprocessPlan.safeToSend}
                                              title={reprocessPlan.safeToSend ? "Disparo ao vivo será habilitado na próxima etapa" : reprocessPlan.message}
                                              onClick={() => alert("Pré-visualização apenas. O disparo ao vivo ainda não está habilitado — será ligado na próxima etapa, mediante confirmação.")}
                                              className="rounded-lg bg-brand-500 px-3 py-1.5 text-[11px] font-semibold text-white hover:bg-brand-600 disabled:cursor-not-allowed disabled:opacity-50"
                                            >
                                              Reprocessar {reprocessPlan.nextBatch.length} agora
                                            </button>
                                            <button type="button" onClick={() => setShowReprocess(false)} className="rounded-lg border border-brand-200 px-3 py-1.5 text-[11px] font-semibold text-brand-600">Fechar</button>
                                          </div>
                                          <p className="mt-1.5 text-[9px] text-brand-500">{reprocessPlan.message} · Pré-visualização read-only — nada é enviado nesta etapa.</p>
                                        </div>
                                      )}
                                    </div>
                                  )}
                                </div>
                              );
                            })()}
                          </div>
                        </>
                      );
                    })()}

                    {Number(detail.totalRevenue) > 0 && (
                      <div className="flex items-center gap-3 rounded-xl border border-green-100 bg-green-50 px-4 py-3">
                        <div className="flex-1">
                          <p className="text-[10px] font-semibold uppercase tracking-wide text-green-600">Receita gerada</p>
                          <p className="text-2xl font-bold text-green-700">R$ {Number(detail.totalRevenue).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</p>
                        </div>
                      </div>
                    )}

                    <p className="text-[10px] text-muted italic">
                      Conversões atribuídas: pedidos realizados pelo cliente após receber a mensagem da campanha.
                    </p>

                    <div>
                      <p className="mb-3 text-[10px] font-bold uppercase tracking-widest text-muted">
                        Mensagens enviadas ({detail.executions.length})
                      </p>
                      {detail.executions.length === 0 ? (
                        <div className="rounded-2xl border-2 border-dashed border-line py-8 text-center text-xs text-muted">
                          {isRecurring ? "Nenhum envio registrado ainda. Aguardando próximo ciclo." : "Nenhum destinatário registrado."}
                        </div>
                      ) : (
                        <div className="space-y-1.5 max-h-96 overflow-y-auto rounded-xl border border-line p-2">
                          {detail.executions.map((ex) => {
                            // Prefer the server classification so a safety block reads
                            // "Bloqueado", an invalid number reads "Telefone inválido",
                            // and only a real provider error reads "Falhou".
                            const kind = ex.classification?.kind ?? ex.status;
                            const badge = ex.classification?.badge ?? (EXEC_STATUS_LABELS[ex.status] ?? ex.status);
                            const tone = kind === "SENT" ? { bg: "bg-green-50", text: "text-green-700" }
                              : kind === "BLOCKED" ? { bg: "bg-amber-50", text: "text-amber-700" }
                              : kind === "FAILED" ? { bg: "bg-red-50", text: "text-red-600" }
                              : (EXEC_STATUS_COLORS[ex.status] ?? { bg: "bg-[#F4F4F2]", text: "text-ink2" });
                            const reasonColor = kind === "BLOCKED" ? "text-amber-600" : "text-red-500";
                            const sentLabel = ex.sentAt
                              ? new Date(ex.sentAt).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit" })
                              : null;
                            return (
                              <div key={ex.id} className="rounded-xl border border-line bg-paper px-3 py-2 shadow-sm">
                                <div className="flex items-start gap-3">
                                  <div className="flex-1 min-w-0">
                                    <p className="text-xs font-semibold text-ink truncate">{ex.customerName ?? "Cliente"}</p>
                                    <p className="text-[10px] text-muted truncate">{ex.customerPhone ?? "—"}</p>
                                  </div>
                                  <div className="shrink-0 flex flex-col items-end gap-0.5">
                                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${tone.bg} ${tone.text}`}>{badge}</span>
                                    {sentLabel && <span className="text-[10px] text-muted whitespace-nowrap">🕒 {sentLabel}</span>}
                                    {ex.converted && ex.revenue != null && (
                                      <span className="text-[10px] font-semibold text-green-600">R$ {Number(ex.revenue).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</span>
                                    )}
                                  </div>
                                </div>
                                {ex.messageText && (
                                  <p className="mt-1.5 rounded-lg bg-[#FAFAF8] px-2.5 py-1.5 text-[11px] leading-relaxed text-ink2 whitespace-pre-wrap break-words">
                                    {ex.messageText}
                                  </p>
                                )}
                                {ex.failedReason && <p className={`mt-1 text-[10px] ${reasonColor}`}>⚠ {ex.failedReason}</p>}
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* ── Diagnóstico ── */}
                {activeTab === "diagnostics" && (
                  <div className="space-y-4">
                    <CampaignFailureDiagnosis detail={detail} isRecurring={isRecurring} />
                    {preflight && (
                      <div className="rounded-2xl border border-blue-100 bg-blue-50/40 p-4">
                        <p className="text-[10px] font-bold uppercase tracking-widest text-blue-700">Prévia de envio</p>
                        <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3">
                          {[
                            { l: "Público total", v: preflight.audienceTotal },
                            { l: "Elegíveis agora", v: preflight.eligibleNow },
                            { l: "Previsão hoje", v: preflight.forecastSendToday },
                            { l: "Já receberam o conceito", v: preflight.blocked.alreadyImpactedConcept + preflight.blocked.alreadyImpactedCampaign },
                            { l: "Mensagem duplicada", v: preflight.blocked.duplicateMessage },
                            { l: "Limite semanal/cliente", v: preflight.blocked.weeklyLimit },
                            { l: "Opt-out", v: preflight.blocked.optOut },
                            { l: "Telefone inválido", v: preflight.blocked.invalidPhone },
                            { l: "Orçamento global", v: preflight.blocked.globalCap },
                          ].map((m) => (
                            <div key={m.l} className="rounded-lg border border-line bg-paper px-2 py-1.5 text-center">
                              <p className="text-sm font-bold text-ink">{m.v}</p>
                              <p className="text-[9px] text-muted">{m.l}</p>
                            </div>
                          ))}
                        </div>
                        {preflight.warnings.map((w, i) => <p key={i} className="mt-1 text-[10px] text-amber-700">• {w}</p>)}
                        {preflight.recommendations.map((r, i) => <p key={`r${i}`} className="mt-1 text-[10px] text-blue-700">→ {r}</p>)}
                      </div>
                    )}
                    {loadingDebug && <div className="rounded-2xl border border-line bg-[#FAFAF8] p-4 text-xs text-muted">Verificando estado do runner…</div>}
                    {!loadingDebug && !debug && (
                      <div className="rounded-2xl border-2 border-dashed border-line py-8 text-center text-xs text-muted">
                        Diagnóstico disponível apenas para campanhas recorrentes ativas.
                      </div>
                    )}
                    {!loadingDebug && debug && (
                      <div className="space-y-3">
                        {detail.performance && (detail.performance.blockedSafety > 0 || detail.performance.failedProvider > 0) && (
                          <div className="rounded-xl border border-line bg-paper px-3 py-3">
                            <p className="text-[10px] font-bold uppercase tracking-widest text-muted">Por que clientes não receberam</p>
                            <div className="mt-2 flex flex-wrap gap-1.5">
                              {detail.performance.reasonGroups.map((g) => (
                                <span key={g.category} className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${g.kind === "FAILED" ? "bg-red-50 text-red-600" : g.kind === "BLOCKED" ? "bg-amber-50 text-amber-700" : "bg-[#F4F4F2] text-ink2"}`}>
                                  {g.badge}: {g.count}{g.kind === "FAILED" && g.retryabilityLabel ? ` · ${g.retryabilityLabel}` : ""}
                                </span>
                              ))}
                            </div>
                            <p className="mt-2 text-[10px] text-muted">
                              <strong className="text-amber-700">{detail.performance.blockedSafety}</strong> bloqueio(s) de segurança (não é falha — voltam a ser elegíveis quando a janela expira) ·
                              <strong className="text-red-600"> {detail.performance.failedProvider}</strong> falha(s) real(is) de envio.
                            </p>
                            <div className="mt-2 rounded-lg bg-brand-50 px-3 py-2 text-[10px] text-brand-700">
                              <p>
                                <strong>{detail.performance.recoverableLater ?? 0}</strong> falha(s) temporária(s) podem ser reenviadas depois ·
                                <strong> {detail.performance.skipped ?? 0}</strong> ignorada(s) (telefone inválido / não elegível — não reenviar).
                              </p>
                              <p className="mt-1 text-brand-500">Modo seguro: até 40 envios por ciclo. Falhas temporárias (Evolution 5xx, timeout) voltam a ser tentadas no próximo ciclo do cron; telefone inválido, opt-out e 400 não são reenviados automaticamente.</p>
                            </div>
                            {detail.performance.reasonGroups.some((g) => g.category === "BLOCKED_WEEKLY_LIMIT") && (
                              <div className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-[10px] text-amber-800">
                                <p className="font-semibold">Como destravar (a maioria está no limite semanal por cliente):</p>
                                <ul className="mt-1 list-disc pl-4 space-y-0.5">
                                  <li>Aumentar <strong>“Máximo de contatos por cliente / semana”</strong> nas Configurações de CRM.</li>
                                  <li>Reduzir/pausar a campanha concorrente que consumiu o contato semanal (ex.: almoço).</li>
                                  <li>Separar os públicos para que as campanhas não disputem os mesmos clientes.</li>
                                  <li>Subir a <strong>prioridade</strong> desta campanha para receber orçamento primeiro (previsão).</li>
                                </ul>
                              </div>
                            )}
                          </div>
                        )}
                        <div className={`flex items-start gap-2 rounded-xl px-3 py-3 ${debug.isDueNow ? "border border-green-100 bg-green-50" : "border border-amber-100 bg-amber-50"}`}>
                          <div className={`mt-0.5 h-2 w-2 rounded-full shrink-0 ${debug.isDueNow ? "bg-green-500" : "bg-amber-400"}`} />
                          <p className={`text-xs font-semibold ${debug.isDueNow ? "text-green-700" : "text-amber-700"}`}>
                            {debug.isDueNow ? "Campanha será processada no próximo ciclo do cron" : (debug.notDueReason ?? "Não está na janela de envio")}
                          </p>
                        </div>
                        {debug.nextRunAt && (
                          <div className="rounded-xl border border-line bg-[#FAFAF8] px-3 py-2 text-xs">
                            <span className="font-semibold text-ink2">Próximo envio: </span>
                            <span className="text-ink2">{new Date(debug.nextRunAt).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit" })}</span>
                          </div>
                        )}
                        {debug.safetyBlocks.length > 0 && (
                          <div className="rounded-xl border border-red-100 bg-red-50 px-3 py-3 space-y-1">
                            <p className="text-xs font-bold text-red-700">Bloqueios ativos:</p>
                            {debug.safetyBlocks.map((b, i) => <p key={i} className="text-xs text-red-600">• {b}</p>)}
                          </div>
                        )}
                        {debug.dailyCapStatus && (
                          <div className="rounded-xl border border-line bg-[#FAFAF8] px-3 py-2 text-xs">
                            <span className="font-semibold text-ink2">Cap diário: </span>
                            <span className="text-ink2">{debug.dailyCapStatus}</span>
                          </div>
                        )}
                        {debug.audience && (
                          <div className="rounded-xl border border-line bg-[#FAFAF8] px-3 py-3 text-xs space-y-1">
                            <p className="font-semibold text-ink2">Audiência em tempo real:</p>
                            {debug.audience.error ? (
                              <p className="text-red-500">Erro: {debug.audience.error}</p>
                            ) : (
                              <>
                                <p className="text-ink2">• {debug.audience.totalEligible} clientes elegíveis no segmento</p>
                                <p className="text-ink2">• {debug.audience.alreadySent} já receberam esta campanha</p>
                                <p className={`font-semibold ${debug.audience.newEligible === 0 ? "text-amber-700" : "text-green-700"}`}>
                                  • {debug.audience.newEligible} novos destinatários disponíveis
                                </p>
                                {debug.audience.newEligible === 0 && debug.audience.alreadySent > 0 && (
                                  <p className="mt-1 rounded-lg bg-amber-50 px-2 py-1.5 text-amber-700">
                                    Todos os clientes elegíveis já foram contactados. A campanha será concluída automaticamente no próximo ciclo.
                                  </p>
                                )}
                                {debug.audience.newEligible === 0 && debug.audience.totalEligible === 0 && (
                                  <p className="mt-1 rounded-lg bg-amber-50 px-2 py-1.5 text-amber-700">
                                    Nenhum cliente elegível encontrado. Verifique o segmento e se há clientes com WhatsApp cadastrado.
                                  </p>
                                )}
                              </>
                            )}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Shared type + helpers for campaign cards ──────────────────────────────────

type ScheduleCfg = {
  mode?: string;
  weekdays?: number[];
  timeWindow?: { start: string; end: string };
  dailyLimit?: number;
  timezone?: string;
  endCondition?: string;
  endDate?: string | null;
  maxTotal?: number | null;
};

// ── Active Campaigns Section ──────────────────────────────────────────────────

const ACTIVE_STATUSES = new Set(["ACTIVE", "SENDING", "SCHEDULED", "PAUSED"]);
const HISTORY_STATUSES = new Set(["SENT", "COMPLETED", "CANCELLED", "DRAFT"]);

type CampaignTipo = "Única" | "Agendada" | "Recorrente";

const TIPO_BADGE: Record<CampaignTipo, string> = {
  "Única":      "bg-[#F4F4F2] text-ink2",
  "Agendada":   "bg-amber-50 text-amber-700",
  "Recorrente": "bg-brand-50 text-brand-600",
};

/** Execution type: recurring (automation) vs scheduled-once vs single send. */
function campaignTipo(c: CampaignHistoryRow): CampaignTipo {
  const cfg = c.scheduleConfig as ScheduleCfg | null;
  if (cfg?.mode === "RECURRING") return "Recorrente";
  if (c.scheduledAt || c.status === "SCHEDULED") return "Agendada";
  return "Única";
}

/** Human-friendly cadence for recurring campaigns; "—" for one-off sends. */
function campaignFrequencia(c: CampaignHistoryRow): string {
  const cfg = c.scheduleConfig as ScheduleCfg | null;
  if (cfg?.mode !== "RECURRING") return "—";
  const days = cfg.weekdays ?? [];
  if (days.length === 0 || days.length === 7) return "Diária";
  if (days.length === 1) return WEEKDAY_LABELS[days[0]!] ?? "Semanal";
  if (days.length <= 3) return days.map((d) => WEEKDAY_LABELS[d]).join(", ");
  return `${days.length}× por semana`;
}

/**
 * Combined agenda info for the compact table: primary (time window or date),
 * secondary (cadence for recurring, null otherwise).
 */
function campaignAgenda(c: CampaignHistoryRow): { primary: string; secondary: string | null } {
  const cfg = c.scheduleConfig as ScheduleCfg | null;
  if (cfg?.mode === "RECURRING") {
    const win  = cfg.timeWindow ? `${cfg.timeWindow.start}–${cfg.timeWindow.end}` : null;
    const freq = campaignFrequencia(c);
    return { primary: win ?? freq, secondary: win ? freq : null };
  }
  if (c.scheduledAt) {
    return {
      primary: new Date(c.scheduledAt).toLocaleString("pt-BR", {
        day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit",
      }),
      secondary: null,
    };
  }
  return { primary: "—", secondary: null };
}

/** Human-readable title tooltip text for a failure cell. */
function failureTitleText(breakdown: Record<string, number>, isRecurring: boolean): string {
  const lines = Object.entries(breakdown)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 6)
    .map(([r, n]) => `${FAILURE_REASON_LABELS[r] ?? r}: ${n}`);
  if (isRecurring) {
    lines.push("(campanhas recorrentes acumulam falhas entre ciclos)");
  }
  return lines.join("\n");
}

/**
 * Recommended execution type per template — surfaces in the Templates grid so the
 * owner sees which models are meant to run automatically (recurring) vs. one-off.
 * Recurring templates cover what used to live in the separate "Automações" tab
 * (aniversário, recuperação de frios/mornos, segunda compra, avaliação, VIPs parados).
 */
const TEMPLATE_RECOMMENDED_TYPE: Record<string, CampaignTipo> = {
  "recuperar-frios":     "Recorrente",
  "reativar-mornos":     "Recorrente",
  "segunda-compra":      "Recorrente",
  "clientes-vip":        "Recorrente",
  "pedido-avaliacao":    "Recorrente",
  "aniversariantes":     "Recorrente",
  "recorrente-sumido":   "Recorrente",
  "carrinho-abandonado": "Recorrente",
  "aumentar-sobremesas": "Única",
  "aumentar-bebidas":    "Única",
  "produto-favorito":    "Única",
  "alto-ticket":         "Única",
};
function CampanhasAtivasSection({
  campaigns,
  onDetail,
  onAction,
  limit,
  onSeeAll,
  restrictToIds,
  cartRecoveryActive,
  couponCounts,
  audiences,
  dailyQuotas,
  onCartRecoveryManage,
  onCartRecoveryToggle,
}: {
  campaigns: CampaignHistoryRow[];
  onDetail: (id: string) => void;
  onAction: (id: string, action: "pause" | "resume" | "cancel") => void;
  /** When set, show only the top N by revenue (used on the dashboard overview). */
  limit?: number;
  /** When set, render a "Ver todas" footer linking to the full CRM panel. */
  onSeeAll?: () => void;
  /** When set, show ONLY these campaign ids (the currently-active ready-made ones),
      so old/deleted manual campaigns never linger in this results panel. */
  restrictToIds?: string[] | null;
  /** Carrinho abandonado has no Campaign row — render it as a row when defined.
      undefined → don't render the row (dashboard overview); boolean → on/off state. */
  cartRecoveryActive?: boolean;
  /** Per-campaign coupon counts (campaignId → { sent, used }) from the wallet. */
  couponCounts?: Record<string, { sent: number; used: number }>;
  /** Per-campaign eligible audience for today (campaignId → count of reachable clients). */
  audiences?: Record<string, number>;
  /** Effective daily quota under the current distribution mode (campaignId → msgs/day). */
  dailyQuotas?: Record<string, number>;
  /** Open the cart-recovery config modal (same as "Gerenciar" for real campaigns). */
  onCartRecoveryManage?: () => void;
  /** Toggle cart recovery on/off (same as "Pausar"/"Ativar" for real campaigns). */
  onCartRecoveryToggle?: () => void;
}) {
  const allowed = restrictToIds ? new Set(restrictToIds) : null;
  // Show every active custom campaign, plus the currently-active FIXED (ready-made)
  // ones — this keeps stale ready-made duplicates out while never hiding a campaign
  // the owner created themselves.
  const active = campaigns.filter((c) => {
    if (!ACTIVE_STATUSES.has(c.status)) return false;
    if (!isFixedCampaign(c.templateId)) return true;      // custom → always show
    return !allowed || allowed.has(c.id);                  // fixed → only the live row
  });
  // Cart recovery is a permanent fixed campaign — render its row whenever the parent
  // provides its state (both ON and OFF), so it has the same Gerenciar + Pausar/Ativar
  // controls as every other campaign. Hidden on the limited dashboard overview.
  const showCartRow = cartRecoveryActive !== undefined && limit == null;
  if (active.length === 0 && !showCartRow) return null;
  const shown = limit != null
    ? [...active].sort((a, b) => Number(b.totalRevenue) - Number(a.totalRevenue)).slice(0, limit)
    : active;
  const count = active.length + (showCartRow ? 1 : 0);

  // Totals row — sums the displayed campaigns (the synthetic cart row has no
  // per-campaign numbers, so it doesn't contribute).
  const totals = shown.reduce(
    (a, c) => {
      a.revenue     += Number(c.totalRevenue) || 0;
      a.sent        += c.totalSent || 0;
      a.converted   += c.totalConverted || 0;
      a.failed      += c.totalFailed || 0;
      a.couponsUsed += couponCounts?.[c.id]?.used ?? 0;
      // Same value the Limite/dia cell shows: effective quota, else stored limit.
      {
        const quota = dailyQuotas?.[c.id];
        a.dailyLimit += typeof quota === "number" && quota > 0
          ? quota
          : ((c.scheduleConfig as { dailyLimit?: number } | null)?.dailyLimit ?? 0);
      }
      a.audience    += audiences?.[c.id] ?? 0;
      return a;
    },
    { revenue: 0, sent: 0, converted: 0, failed: 0, couponsUsed: 0, dailyLimit: 0, audience: 0 },
  );
  const totalConvPct = totals.sent > 0 ? Math.round((totals.converted / totals.sent) * 100) : null;
  const brl = (n: number) => `R$ ${n.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`;

  return (
    <div data-testid="campanhas-ativas-section">
      <div className="mb-3 flex items-center justify-between">
        <div>
          <h3 className="text-xs font-bold uppercase tracking-widest text-brand-600">Campanhas ativas</h3>
          <p className="mt-0.5 text-xs text-muted">Campanhas em execução, agendadas ou recorrentes.</p>
        </div>
        <span className="rounded-full bg-brand-50 px-2.5 py-0.5 text-xs font-bold text-brand-700">{count}</span>
      </div>
      {/* Columns: Enviados · Cupons usados · Conversão (usados÷enviados) · Falhas ·
          Receita — all from real backend data (execution totals + the coupon wallet). */}
      <div className="rounded-2xl border border-line bg-paper shadow-sm">
        <table className="w-full text-left text-xs">
          <thead className="border-b border-line bg-[#FAFAF8]">
            <tr className="text-[10px] uppercase tracking-wide text-muted">
              <th className="py-2.5 pl-4 pr-2 font-semibold">Status</th>
              <th className="py-2.5 px-2 font-semibold">Nome</th>
              <th className="py-2.5 px-2 font-semibold">Tipo</th>
              <th className="py-2.5 px-2 font-semibold">Público</th>
              <th className="py-2.5 px-2 font-semibold text-right" title="Clientes no segmento hoje que ainda podem receber uma mensagem — atualiza sozinho conforme os clientes mudam de faixa">Audiência</th>
              <th className="py-2.5 px-2 font-semibold text-right">Receita</th>
              <th className="py-2.5 px-2 font-semibold text-right">Enviados</th>
              <th className="py-2.5 px-2 font-semibold text-right" title="Máximo de mensagens que esta campanha pode enviar por dia">Limite/dia</th>
              <th className="py-2.5 px-2 font-semibold text-right" title="Cupons concedidos pela campanha que foram resgatados">Cupons usados</th>
              <th className="py-2.5 px-2 font-semibold text-right" title="Pedidos atribuídos após a mensagem ÷ mensagens enviadas">Conversão</th>
              <th className="py-2.5 px-2 font-semibold text-right">Falhas</th>
              <th className="py-2.5 px-2 font-semibold">Agenda</th>
              <th className="py-2.5 pl-2 pr-4 font-semibold">Ações</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {showCartRow && (
              <tr className="bg-sky-50/40 hover:bg-sky-50/70 transition-colors">
                <td className="py-3 pl-4 pr-2">
                  <span className={`inline-block rounded-full px-2 py-0.5 text-[9px] font-bold whitespace-nowrap ${cartRecoveryActive ? "bg-emerald-100 text-emerald-700" : "bg-[#F4F4F2] text-muted"}`}>
                    {cartRecoveryActive ? "Ativa" : "Pausada"}
                  </span>
                </td>
                <td className="py-3 px-2 max-w-[170px]">
                  <div className="flex items-center gap-1.5">
                    <p className="font-semibold text-ink truncate">🛒 Carrinho abandonado</p>
                    <span className="shrink-0 rounded-full bg-sky-100 px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-wide text-sky-700">Fixa</span>
                  </div>
                  <p className="text-[10px] text-muted truncate">Recupera pedidos iniciados</p>
                </td>
                <td className="py-3 px-2 whitespace-nowrap">
                  <span className={`rounded-full px-2 py-0.5 text-[9px] font-semibold ${TIPO_BADGE["Recorrente"]}`}>Automática</span>
                </td>
                <td className="py-3 px-2 max-w-[100px]"><span className="text-ink2 truncate block text-[11px]">quem abandonou</span></td>
                {/* Audiência — cart recovery is event-based (dispara no abandono), sem pool fixo. */}
                <td className="py-3 px-2 text-right text-muted">—</td>
                {/* Receita · Enviados · Limite · Cupons usados · Conversão · Falhas — cart
                    recovery grants without a Campaign row, so these aren't attributable. */}
                <td className="py-3 px-2 text-right text-muted">—</td>
                <td className="py-3 px-2 text-right text-muted">—</td>
                <td className="py-3 px-2 text-right text-muted">—</td>
                <td className="py-3 px-2 text-right text-muted">—</td>
                <td className="py-3 px-2 text-right text-muted">—</td>
                <td className="py-3 px-2 text-right text-muted">—</td>
                <td className="py-3 px-2 text-[11px]"><p className="text-ink2 whitespace-nowrap">Após abandono</p><p className="text-muted whitespace-nowrap">automático</p></td>
                <td className="py-3 pl-2 pr-4">
                  <div className="flex items-center gap-1 justify-end">
                    <button
                      onClick={() => onCartRecoveryManage?.()}
                      className="rounded-lg bg-brand-600 px-2.5 py-1 text-[10px] font-bold text-white hover:bg-brand-700 transition-colors whitespace-nowrap"
                    >
                      Gerenciar
                    </button>
                    {cartRecoveryActive ? (
                      <button
                        onClick={() => onCartRecoveryToggle?.()}
                        className="rounded-lg bg-[#F4F4F2] px-2 py-1 text-[10px] font-semibold text-ink2 hover:bg-line2 transition-colors"
                      >Pausar</button>
                    ) : (
                      <button
                        onClick={() => onCartRecoveryToggle?.()}
                        className="rounded-lg bg-green-50 px-2 py-1 text-[10px] font-semibold text-green-700 hover:bg-green-100 transition-colors"
                      >Ativar</button>
                    )}
                  </div>
                </td>
              </tr>
            )}
            {shown.map((c) => {
              const sc           = CAMPAIGN_STATUS_COLORS[c.status] ?? { bg: "bg-[#F4F4F2]", text: "text-ink2" };
              const cfg          = c.scheduleConfig as ScheduleCfg | null;
              const isRecurring  = cfg?.mode === "RECURRING";
              const controllable = ["ACTIVE", "SCHEDULED", "PAUSED"].includes(c.status);
              const agenda       = campaignAgenda(c);
              const tipo         = campaignTipo(c);
              const failTitle    = c.totalFailed > 0 && c.failureBreakdown && Object.keys(c.failureBreakdown).length > 0
                ? failureTitleText(c.failureBreakdown, isRecurring)
                : undefined;
              const fixed        = isFixedCampaign(c.templateId);

              return (
                <tr key={c.id} className={`transition-colors ${fixed ? "bg-sky-50/40 hover:bg-sky-50/70" : "bg-amber-50/30 hover:bg-amber-50/60"}`}>
                  {/* Status */}
                  <td className="py-3 pl-4 pr-2">
                    <span className={`inline-block rounded-full px-2 py-0.5 text-[9px] font-bold whitespace-nowrap ${sc.bg} ${sc.text}`}>
                      {CAMPAIGN_STATUS_LABELS[c.status] ?? c.status}
                    </span>
                  </td>

                  {/* Nome */}
                  <td className="py-3 px-2 max-w-[170px]">
                    <div className="flex items-center gap-1.5">
                      <p className="font-semibold text-ink truncate">{c.name}</p>
                      <span className={`shrink-0 rounded-full px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-wide ${fixed ? "bg-sky-100 text-sky-700" : "bg-amber-100 text-amber-700"}`}>
                        {fixed ? "Fixa" : "Personalizada"}
                      </span>
                    </div>
                    {c.objective && (
                      <p className="text-[10px] text-muted truncate">{OBJECTIVE_LABELS[c.objective] ?? c.objective}</p>
                    )}
                    {(() => {
                      const reward = couponLabel((cfg as { coupon?: ReadyMadeCoupon | null } | null)?.coupon ?? null);
                      return reward
                        ? <p className="mt-0.5 truncate text-[10px] font-semibold text-emerald-600">🎁 {reward}</p>
                        : <p className="mt-0.5 text-[10px] text-muted/70">sem recompensa</p>;
                    })()}
                  </td>

                  {/* Tipo */}
                  <td className="py-3 px-2 whitespace-nowrap">
                    <span className={`rounded-full px-2 py-0.5 text-[9px] font-semibold ${TIPO_BADGE[tipo]}`}>
                      {tipo}
                    </span>
                  </td>

                  {/* Público */}
                  <td className="py-3 px-2 max-w-[100px]">
                    <span className="text-ink2 truncate block text-[11px]">
                      {c.targetSegment ? (SEGMENT_LABELS[c.targetSegment] ?? c.targetSegment) : "—"}
                    </span>
                  </td>

                  {/* Audiência — clientes elegíveis hoje (recalculada a cada carregamento) */}
                  <td className="py-3 px-2 text-right tabular-nums" title="Clientes no segmento agora que ainda podem receber a mensagem">
                    {(() => {
                      const aud = audiences?.[c.id];
                      return aud != null && aud > 0
                        ? <span className="font-semibold text-brand-500">{aud}</span>
                        : <span className="text-muted">{aud === 0 ? "0" : "—"}</span>;
                    })()}
                  </td>

                  {/* Receita — coluna mais importante, vem primeiro */}
                  <td className="py-3 px-2 text-right tabular-nums font-semibold text-green-700">
                    {Number(c.totalRevenue) > 0
                      ? `R$ ${Number(c.totalRevenue).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`
                      : <span className="text-muted font-normal">—</span>}
                  </td>

                  {/* Enviados */}
                  <td className="py-3 px-2 text-right tabular-nums text-blue-700">
                    {c.totalSent > 0 ? c.totalSent : "—"}
                  </td>

                  {/* Limite/dia — a cota EFETIVA sob a distribuição atual (quanto pode
                      sair por dia de verdade); cai pro dailyLimit salvo sem cota. */}
                  <td className="py-3 px-2 text-right tabular-nums text-muted" title="Quanto esta campanha pode enviar por dia sob a distribuição atual do limite global">
                    {(() => {
                      const quota  = dailyQuotas?.[c.id];
                      const stored = (c.scheduleConfig as { dailyLimit?: number } | null)?.dailyLimit;
                      const dl     = typeof quota === "number" && quota > 0 ? quota : stored;
                      return dl && dl > 0 ? `${dl}/dia` : "—";
                    })()}
                  </td>

                  {/* Cupons usados — resgatados pelos clientes */}
                  <td className="py-3 px-2 text-right tabular-nums">
                    {(() => {
                      const used = couponCounts?.[c.id]?.used ?? 0;
                      return used > 0 ? <span className="font-semibold text-green-700">{used}</span> : <span className="text-muted">—</span>;
                    })()}
                  </td>

                  {/* Conversão — pedidos atribuídos ÷ mensagens enviadas */}
                  <td className="py-3 px-2 text-right tabular-nums" title="Pedidos atribuídos após a mensagem ÷ mensagens enviadas">
                    {c.totalSent > 0
                      ? <span className="font-semibold text-emerald-700">{Math.round((c.totalConverted / c.totalSent) * 100)}%</span>
                      : <span className="text-muted">—</span>}
                  </td>

                  {/* Falhas — hover title shows breakdown; click "Gerenciar" for full detail */}
                  <td className="py-3 px-2 text-right" title={failTitle}>
                    {c.totalFailed > 0 ? (
                      <button
                        onClick={() => onDetail(c.id)}
                        className="inline-flex items-center gap-0.5 font-semibold text-red-500 hover:text-red-700 transition-colors"
                      >
                        <span className="tabular-nums">{c.totalFailed}</span>
                        {failTitle && <span className="text-[10px] leading-none">ⓘ</span>}
                      </button>
                    ) : (
                      <span className="text-muted">—</span>
                    )}
                  </td>

                  {/* Agenda: time window on line 1, cadence on line 2 */}
                  <td className="py-3 px-2 text-[11px]">
                    <p className="text-ink2 whitespace-nowrap">{agenda.primary}</p>
                    {agenda.secondary && (
                      <p className="text-muted whitespace-nowrap">{agenda.secondary}</p>
                    )}
                  </td>

                  {/* Ações */}
                  <td className="py-3 pl-2 pr-4">
                    <div className="flex items-center gap-1 justify-end">
                      <button
                        onClick={() => onDetail(c.id)}
                        className="rounded-lg bg-brand-600 px-2.5 py-1 text-[10px] font-bold text-white hover:bg-brand-700 transition-colors whitespace-nowrap"
                      >
                        Gerenciar
                      </button>
                      {controllable && (
                        c.status === "PAUSED" ? (
                          <button
                            onClick={() => onAction(c.id, "resume")}
                            className="rounded-lg bg-green-50 px-2 py-1 text-[10px] font-semibold text-green-700 hover:bg-green-100 transition-colors"
                          >Retomar</button>
                        ) : (
                          <button
                            onClick={() => onAction(c.id, "pause")}
                            className="rounded-lg bg-[#F4F4F2] px-2 py-1 text-[10px] font-semibold text-ink2 hover:bg-line2 transition-colors"
                          >Pausar</button>
                        )
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-line bg-[#FAFAF8] font-bold text-ink">
              <td className="py-2.5 pl-4 pr-2 text-[10px] font-bold uppercase tracking-widest text-muted" colSpan={4}>Totais ({shown.length})</td>
              <td className="py-2.5 px-2 text-right tabular-nums text-brand-500">{totals.audience > 0 ? totals.audience : "—"}</td>
              <td className="py-2.5 px-2 text-right tabular-nums text-green-700">{totals.revenue > 0 ? brl(totals.revenue) : "—"}</td>
              <td className="py-2.5 px-2 text-right tabular-nums text-blue-700">{totals.sent > 0 ? totals.sent : "—"}</td>
              <td className="py-2.5 px-2 text-right tabular-nums text-ink2">{totals.dailyLimit > 0 ? `${totals.dailyLimit}/dia` : "—"}</td>
              <td className="py-2.5 px-2 text-right tabular-nums text-green-700">{totals.couponsUsed > 0 ? totals.couponsUsed : "—"}</td>
              <td className="py-2.5 px-2 text-right tabular-nums text-emerald-700">{totalConvPct !== null ? `${totalConvPct}%` : "—"}</td>
              <td className="py-2.5 px-2 text-right tabular-nums text-red-600">{totals.failed > 0 ? totals.failed : "—"}</td>
              <td className="py-2.5 px-2"></td>
              <td className="py-2.5 pl-2 pr-4"></td>
            </tr>
          </tfoot>
        </table>
        {onSeeAll && active.length > shown.length && (
          <div className="border-t border-line bg-[#FAFAF8] p-3 text-center">
            <button
              onClick={onSeeAll}
              className="text-xs font-semibold text-brand-600 hover:text-brand-700"
            >
              Ver todas as campanhas ({active.length}) →
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Campanhas Tab ─────────────────────────────────────────────────────────────

const SEGMENT_TO_TEMPLATE_ID: Record<string, string> = {
  FRIO:            "recuperar-frios",
  MORNO:           "reativar-mornos",
  NOVOS:           "segunda-compra",
  PRIMEIRO_PEDIDO: "segunda-compra",
  VIP:             "clientes-vip",
};

const SEGMENT_TO_AUDIENCE_KEY: Partial<Record<string, keyof OverviewStats | "vip">> = {
  FRIO:            "frioCustomers",
  MORNO:           "mornoCustomers",
  NOVOS:           "newCustomers",
  PRIMEIRO_PEDIDO: "newCustomers",
  VIP:             "vip",
};

function customActionToTemplate(action: CustomActionRow): ActionTemplate {
  const tplId   = SEGMENT_TO_TEMPLATE_ID[action.targetSegment];
  const aKey    = SEGMENT_TO_AUDIENCE_KEY[action.targetSegment] ?? null;
  return {
    id:               tplId ?? "custom",
    emoji:            "📢",
    title:            action.name,
    objective:        OBJECTIVE_LABELS[action.objective] ?? action.objective,
    targetLabel:      SEGMENT_LABELS[action.targetSegment] ?? action.targetSegment,
    description:      "",
    readiness:        "READY_TO_CONFIGURE",
    hasAudienceQuery: aKey !== null,
    audienceKey:      aKey,
    suggestedMessage: action.message,
  };
}

type CrmPeriodKey = "total" | "today" | "yesterday" | "week7" | "lastweek" | "days30" | "month" | "last_month" | "custom";

const CRM_PERIODS: { id: CrmPeriodKey; label: string }[] = [
  { id: "today",     label: "Hoje"           },
  { id: "yesterday", label: "Ontem"          },
  { id: "week7",     label: "Últimos 7 dias" },
  { id: "lastweek",  label: "Semana passada" },
  { id: "days30",    label: "Últimos 30 dias"},
  { id: "month",     label: "Este mês"       },
  { id: "last_month", label: "Mês anterior"  },
  { id: "custom",    label: "Personalizado"  },
  { id: "total",     label: "Total"          },
];

/** Resolves a period key into an ISO [from,to] window, or null for "total" (lifetime). */
function crmPeriodRange(key: CrmPeriodKey, customFrom?: string, customTo?: string): { from: string; to: string } | null {
  const now = new Date();
  const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const endOfDay   = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999);
  switch (key) {
    case "total": return null;
    case "today": return { from: startOfDay(now).toISOString(), to: now.toISOString() };
    case "yesterday": {
      const y = new Date(now.getTime() - 86_400_000);
      return { from: startOfDay(y).toISOString(), to: endOfDay(y).toISOString() };
    }
    case "week7":  return { from: new Date(now.getTime() - 7 * 86_400_000).toISOString(),  to: now.toISOString() };
    case "days30": return { from: new Date(now.getTime() - 30 * 86_400_000).toISOString(), to: now.toISOString() };
    case "lastweek": {
      const dow = (now.getDay() + 6) % 7; // 0 = Monday
      const thisMonday = startOfDay(new Date(now.getTime() - dow * 86_400_000));
      const lastMonday = new Date(thisMonday.getTime() - 7 * 86_400_000);
      const lastSunday = new Date(thisMonday.getTime() - 1);
      return { from: lastMonday.toISOString(), to: lastSunday.toISOString() };
    }
    case "month": return { from: new Date(now.getFullYear(), now.getMonth(), 1).toISOString(), to: now.toISOString() };
    case "last_month": return {
      from: new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString(),
      to:   endOfDay(new Date(now.getFullYear(), now.getMonth(), 0)).toISOString(),
    };
    case "custom":
      if (!customFrom || !customTo) return null;
      return { from: startOfDay(new Date(customFrom)).toISOString(), to: endOfDay(new Date(customTo)).toISOString() };
  }
}

function CampanhasTab({ stats }: { stats: OverviewStats }) {
  const [selectedTemplate,  setSelectedTemplate]  = useState<ActionTemplate | null>(null);
  const [showCreateModal,   setShowCreateModal]    = useState(false);
  const [customActions,     setCustomActions]      = useState<CustomActionRow[]>([]);
  const [loadingCustom,     setLoadingCustom]      = useState(true);
  const [expandedCustom,    setExpandedCustom]     = useState<string | null>(null);
  const [deletingAction,    setDeletingAction]     = useState<string | null>(null);

  // Campaign review flow
  const [activeCampaign, setActiveCampaign] = useState<{ id: string; recipients: CampaignRecipientRow[] } | null>(null);

  // Campaign detail drawer
  const [detailId, setDetailId] = useState<string | null>(null);
  // Which tab the manage modal opens on: "Configurar" → Mensagem (editable),
  // "Gerenciar" → Visão Geral.
  const [manageInitialTab, setManageInitialTab] = useState<ManageTab>("overview");
  const openManage = (id: string, tab: ManageTab = "overview") => { setManageInitialTab(tab); setDetailId(id); };

  // Campaign history
  const [campaigns,       setCampaigns]       = useState<CampaignHistoryRow[]>([]);
  const [loadingHistory,  setLoadingHistory]  = useState(true);
  // Carrinho abandonado (CART_RECOVERY) has no Campaign row — it's a config flag —
  // so it never appears in `campaigns`. Track it separately just to show it's active.
  const [cartRecoveryOn, setCartRecoveryOn] = useState(false);
  // Full ready-made state for carrinho-abandonado, so its "Gerenciar" opens the SAME
  // modern config modal the other campaigns use (message + reward + on/off).
  const [cartRecoveryItem, setCartRecoveryItem] = useState<ReadyMadeState | null>(null);
  const [cartBusy, setCartBusy] = useState(false);
  // Per-campaign coupon counts (campaignId → { sent, used }) for the Ativas table.
  const [couponCounts, setCouponCounts] = useState<Record<string, { sent: number; used: number }>>({});
  // Per-campaign eligible audience (campaignId → count), recomputed live (today's segments).
  const [audiences, setAudiences] = useState<Record<string, number>>({});
  // Effective daily quota per campaign under the current distribution mode — what
  // "Limite/dia" really is once the budget is split (por audiência / igual / manual).
  const [dailyQuotas, setDailyQuotas] = useState<Record<string, number>>({});
  // Period filter for the Ativas numbers (Total / Hoje / Ontem / … / Personalizado).
  const [period,     setPeriod]     = useState<CrmPeriodKey>("today");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo,   setCustomTo]   = useState("");
  // Ids of the campaigns actually turned on in "Campanhas prontas". The Ativas panel
  // shows ONLY these, so old/deleted manual campaigns never linger there.
  const [activeReadyMadeIds, setActiveReadyMadeIds] = useState<string[]>([]);
  // Bumped whenever a campaign changes, to refresh the ready-made cards + Ativas panel.
  const [readyMadeReload, setReadyMadeReload] = useState(0);

  function refreshCampaigns() {
    fetch("/api/crm/campaigns")
      .then((r) => r.ok ? r.json() : Promise.reject())
      .then((json) => setCampaigns(json.data ?? []))
      .catch(() => {});
  }

  // "Criar minha campanha" opens the SAME unified manage modal as everything else:
  // create a paused custom campaign with safe defaults, then open Gerenciar on it.
  const [creatingCampaign, setCreatingCampaign] = useState(false);
  async function handleCreateCustomCampaign() {
    if (creatingCampaign) return;
    setCreatingCampaign(true);
    try {
      const res = await fetch("/api/crm/campaigns", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name:            "Nova campanha",
          targetSegment:   "TODOS",
          messageTemplate: "Oi, {nome}! 😊 Tem novidade no {restaurante} esperando por você: {link_cardapio}",
          scheduleConfig:  { mode: "RECURRING", weekdays: [0, 1, 2, 3, 4, 5, 6], timeWindow: { start: "11:00", end: "20:00" }, dailyLimit: 30 },
        }),
      });
      if (!res.ok) return;
      const json = await res.json() as { data?: { campaignId?: string; id?: string } };
      const id = json.data?.campaignId ?? json.data?.id;
      if (!id) return;
      // Born paused: the owner configures público/frases/agenda first, then Retomar.
      await fetch(`/api/crm/campaigns/${id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "pause" }),
      }).catch(() => {});
      refreshCampaigns();
      setReadyMadeReload((n) => n + 1);
      openManage(id, "overview");
    } finally { setCreatingCampaign(false); }
  }

  useEffect(() => {
    const range = crmPeriodRange(period, customFrom, customTo);
    const qs = range ? `?from=${encodeURIComponent(range.from)}&to=${encodeURIComponent(range.to)}` : "";
    fetch(`/api/crm/campaigns${qs}`)
      .then((r) => r.ok ? r.json() : Promise.reject())
      .then((json) => setCampaigns(json.data ?? []))
      .catch(() => {})
      .finally(() => setLoadingHistory(false));
    // Live send log (updates as the recurring campaigns fire).
    fetch("/api/crm/activity")
      .then((r) => r.ok ? r.json() : Promise.reject())
      .then((json) => setActivity(json.data?.activity ?? []))
      .catch(() => {});
  }, [readyMadeReload, period, customFrom, customTo]);

  useEffect(() => {
    fetch("/api/crm/ready-made")
      .then((r) => r.ok ? r.json() : Promise.reject())
      .then((json) => {
        const rm = (json?.data?.campaigns as ReadyMadeState[] | undefined) ?? [];
        const cart = rm.find((c) => c.id === "carrinho-abandonado") ?? null;
        setCartRecoveryItem(cart);
        setCartRecoveryOn(!!cart?.active);
        // Carrinho is shown as its own dedicated row, so exclude it here to avoid a
        // duplicate row once it has a Campaign record. PAUSED rows are INCLUDED —
        // a paused fixed campaign must stay visible (status "Pausada" + Retomar),
        // not vanish from the table; the status filter handles the rest.
        setActiveReadyMadeIds(
          rm.filter((c) => c.campaignId && c.id !== "carrinho-abandonado").map((c) => c.campaignId as string),
        );
      })
      .catch(() => {});
  }, [readyMadeReload]);

  // Per-campaign coupon counts for the Ativas table (Cupons usados), period-aware.
  useEffect(() => {
    const range = crmPeriodRange(period, customFrom, customTo);
    const qs = range ? `?from=${encodeURIComponent(range.from)}&to=${encodeURIComponent(range.to)}` : "";
    fetch(`/api/crm/campaign-coupon-summary${qs}`)
      .then((r) => r.ok ? r.json() : Promise.reject())
      .then((json) => setCouponCounts(json.data ?? {}))
      .catch(() => {});
  }, [readyMadeReload, period, customFrom, customTo]);

  // Financial result of the campaigns for the selected period — the chart at the
  // top so the owner sees, at a glance, how much money the CRM is making them.
  const [revSummary, setRevSummary] = useState<Parameters<typeof RevenueBlock>[0]["revenueSummary"]>(null);
  const [revLoading, setRevLoading] = useState(true);
  useEffect(() => {
    const range = crmPeriodRange(period, customFrom, customTo);
    const qs = range ? `?from=${encodeURIComponent(range.from)}&to=${encodeURIComponent(range.to)}` : "";
    setRevLoading(true);
    fetch(`/api/crm/revenue-summary${qs}`)
      .then((r) => r.ok ? r.json() : Promise.reject())
      .then((json) => setRevSummary(json.data ?? null))
      .catch(() => setRevSummary(null))
      .finally(() => setRevLoading(false));
  }, [readyMadeReload, period, customFrom, customTo]);

  // Per-campaign eligible audience for TODAY (independent of the period filter — it's
  // always "how many clients are in this segment right now"). Recomputed on every reload.
  useEffect(() => {
    fetch("/api/crm/campaign-audiences")
      .then((r) => r.ok ? r.json() : Promise.reject())
      .then((json) => {
        setAudiences(json.data?.audiences ?? {});
        setDailyQuotas(json.data?.quotas ?? {});
      })
      .catch(() => {});
  }, [readyMadeReload]);

  // Global daily send limit (shown above the table). In safe mode it's the warmup
  // number that grows on its own; in manual mode it's the owner-set cap (0 = none).
  const [sendLimit, setSendLimit] = useState<{ manual: boolean; cap: number; safe: number } | null>(null);
  // How the daily budget is split across campaigns (EQUAL | AUDIENCE | MANUAL) —
  // saved through the full raw safety config (the PATCH replaces the whole object).
  const [safetyRaw, setSafetyRaw]   = useState<Record<string, unknown> | null>(null);
  const [distMode, setDistMode]     = useState<string>("AUDIENCE");
  const [savingDist, setSavingDist] = useState(false);
  useEffect(() => {
    fetch("/api/settings/crm-safety")
      .then((r) => r.ok ? r.json() : Promise.reject())
      .then(({ data }) => {
        if (!data) return;
        setSendLimit({
          manual: !!data.manualOverride,
          cap:    typeof data.dailyGlobalCap === "number" ? data.dailyGlobalCap : 0,
          safe:   data.warmup?.safeDailyLimit ?? 0,
        });
        setSafetyRaw(data);
        setDistMode((data.crmWhatsAppSafety as { distributionMode?: string } | undefined)?.distributionMode ?? "AUDIENCE");
      })
      .catch(() => {});
  }, [readyMadeReload]);

  async function saveDistributionMode(mode: string) {
    if (!safetyRaw || savingDist || mode === distMode) return;
    setSavingDist(true);
    setDistMode(mode);
    try {
      await fetch("/api/settings/crm-safety", {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...safetyRaw,
          crmWhatsAppSafety: { ...(safetyRaw.crmWhatsAppSafety as object ?? {}), distributionMode: mode },
        }),
      });
    } finally { setSavingDist(false); }
  }

  // Toggle cart recovery on/off — the same control the other campaigns' Pausar/Ativar
  // give, wired to the readyMadeConfig.cartRecoveryEnabled flag.
  async function handleCartRecoveryToggle() {
    if (cartBusy) return;
    setCartBusy(true);
    const turnOn = !cartRecoveryOn;
    try {
      await fetch("/api/crm/ready-made/carrinho-abandonado", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: turnOn ? "activate" : "deactivate" }),
      });
      setReadyMadeReload((n) => n + 1);
    } finally {
      setCartBusy(false);
    }
  }

  // Open the SAME tabbed "Gerenciar" modal the other campaigns use. Carrinho gets a
  // real Campaign row on first manage (so the modal has a campaignId to drive it).
  async function handleCartManage() {
    let campaignId = cartRecoveryItem?.campaignId ?? null;
    if (!campaignId) {
      setCartBusy(true);
      try {
        await fetch("/api/crm/ready-made/carrinho-abandonado", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "update", overrides: {} }),
        });
        const fresh = await fetch("/api/crm/ready-made").then((r) => r.json()).catch(() => null);
        const rows = (fresh?.data?.campaigns as ReadyMadeState[] | undefined) ?? [];
        const cart = rows.find((c) => c.id === "carrinho-abandonado") ?? null;
        setCartRecoveryItem(cart);
        campaignId = cart?.campaignId ?? null;
      } finally {
        setCartBusy(false);
      }
    }
    if (campaignId) openManage(campaignId, "message");
  }

  async function handleCampaignAction(id: string, action: "pause" | "resume" | "cancel") {
    const res = await fetch(`/api/crm/campaigns/${id}`, {
      method:  "PATCH",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ action }),
    });
    if (res.ok) {
      const json = await res.json() as { data?: { id: string; status: string } };
      if (json.data) {
        setCampaigns((prev) =>
          prev.map((c) => c.id === id ? { ...c, status: json.data!.status } : c)
        );
      }
      // Pausing/resuming may change which ready-made campaigns are active — refresh
      // the Ativas filter + cards so the panel reflects reality.
      setReadyMadeReload((n) => n + 1);
    }
  }

  function handleCampaignFieldsUpdated(id: string, updates: Partial<CampaignHistoryRow>) {
    setCampaigns((prev) => prev.map((c) => c.id === id ? { ...c, ...updates } : c));
  }

  useEffect(() => {
    fetch("/api/crm/custom-actions")
      .then((r) => r.ok ? r.json() : Promise.reject())
      .then((json) => setCustomActions(json.data ?? []))
      .catch(() => {})
      .finally(() => setLoadingCustom(false));
  }, []);

  function handleActionCreated(action: CustomActionRow) {
    setCustomActions((prev) => [action, ...prev]);
  }

  async function handleDeleteAction(id: string) {
    if (!confirm("Excluir este modelo salvo?")) return;
    setDeletingAction(id);
    try {
      const res = await fetch(`/api/crm/custom-actions/${id}`, { method: "DELETE" });
      if (res.ok) setCustomActions((prev) => prev.filter((a) => a.id !== id));
    } finally {
      setDeletingAction(null);
    }
  }

  const vipCount = (stats.segments.find((s) => s.tier === "OURO")?.count ?? 0) +
                   (stats.segments.find((s) => s.tier === "DIAMANTE")?.count ?? 0);

  function getAudienceCount(key: ActionTemplate["audienceKey"]): number | null {
    if (!key) return null;
    if (key === "vip") return vipCount;
    const val = stats[key as keyof OverviewStats];
    if (typeof val === "number") return val;
    return null;
  }

  const [showMoreTemplates, setShowMoreTemplates] = useState(false);
  const [showHistory,       setShowHistory]       = useState(false);
  const [activity,          setActivity]          = useState<ActivityRow[]>([]);

  const visibleTemplates = showMoreTemplates ? ACTION_TEMPLATES : ACTION_TEMPLATES.slice(0, 6);
  const historyRows = campaigns.filter((c) => HISTORY_STATUSES.has(c.status));

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-bold text-ink">Campanhas</h2>
          <p className="mt-0.5 text-xs text-muted">
            Ligue uma campanha pronta ou crie a sua. Tudo via WhatsApp, com segurança de envio.
          </p>
        </div>
      </div>

      {/* ── Régua de período (controla o gráfico financeiro E a tabela abaixo) ── */}
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="mr-1 text-[11px] font-semibold uppercase tracking-wide text-muted">Período:</span>
        {CRM_PERIODS.map((p) => (
          <button
            key={p.id}
            onClick={() => setPeriod(p.id)}
            className={`rounded-full px-3 py-1 text-xs font-semibold transition-colors ${
              period === p.id ? "bg-brand-600 text-white" : "bg-[#F4F4F2] text-ink2 hover:bg-line2"
            }`}
          >
            {p.label}
          </button>
        ))}
        {period === "custom" && (
          <span className="flex items-center gap-1.5">
            <input type="date" value={customFrom} onChange={(e) => setCustomFrom(e.target.value)}
              className="rounded-lg border border-line bg-paper px-2 py-1 text-xs text-ink focus:border-brand-400 focus:outline-none" />
            <span className="text-xs text-muted">até</span>
            <input type="date" value={customTo} onChange={(e) => setCustomTo(e.target.value)}
              className="rounded-lg border border-line bg-paper px-2 py-1 text-xs text-ink focus:border-brand-400 focus:outline-none" />
          </span>
        )}
      </div>

      {/* ── Resultado financeiro (protagonista) + limite (quadradinho ao lado) ── */}
      <div className="flex flex-col gap-4 lg:flex-row lg:items-stretch">
        <div className="min-w-0 flex-1">
          <RevenueBlock revenueSummary={revSummary} revenueSummaryLoading={revLoading} />
        </div>

        {sendLimit && (
          <div className="flex shrink-0 flex-col rounded-2xl border border-brand-100 bg-brand-50/40 p-4 lg:w-60">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-muted">📤 Limite de envio</p>
            <p className="mt-1.5 text-2xl font-extrabold leading-none text-brand-700">
              {sendLimit.manual
                ? (sendLimit.cap > 0 ? sendLimit.cap.toLocaleString("pt-BR") : "∞")
                : sendLimit.safe.toLocaleString("pt-BR")}
            </p>
            <p className="text-[11px] text-muted">mensagens/dia</p>
            <p className="mt-1 text-[10px] leading-snug text-muted">
              {sendLimit.manual ? "controle manual" : "modo seguro (automático)"}
            </p>

            <div className="mt-auto pt-3">
              <p className="mb-1.5 text-[9px] font-semibold uppercase tracking-wide text-muted">Distribuição</p>
              <div className="flex flex-col gap-1">
                {([
                  { id: "AUDIENCE", label: "🎯 Por audiência" },
                  { id: "EQUAL",    label: "Igual p/ todas" },
                  { id: "MANUAL",   label: "Manual" },
                ] as { id: string; label: string }[]).map((opt) => (
                  <button
                    key={opt.id}
                    onClick={() => void saveDistributionMode(opt.id)}
                    disabled={savingDist}
                    className={`rounded-lg px-2 py-1 text-left text-[11px] font-semibold transition-colors disabled:opacity-60 ${
                      distMode === opt.id ? "bg-brand-600 text-white" : "bg-white text-ink2 hover:bg-line2"
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ── Criar campanha personalizada (manual OU por IA — texto/voz), acima da tabela ── */}
      <div className="space-y-2.5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="text-sm font-bold text-ink">Criar campanha personalizada</p>
            <p className="mt-0.5 text-xs text-muted">
              Preencha manualmente no botão, ou descreva por texto/voz que a IA monta pra você.
            </p>
          </div>
          <button
            onClick={() => void handleCreateCustomCampaign()}
            disabled={creatingCampaign}
            className="flex items-center gap-1.5 rounded-xl bg-brand-600 px-4 py-2 text-sm font-bold text-white shadow-sm hover:bg-brand-700 transition-colors disabled:opacity-60"
          >
            <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
            </svg>
            {creatingCampaign ? "Criando…" : "Preencher manual"}
          </button>
        </div>
        <CrmCampaignAI onCreated={() => setReadyMadeReload((n) => n + 1)} />
      </div>

      {/* ── Campanhas ativas ─────────────────────────────────────────────────── */}
      {!loadingHistory && (
        <CampanhasAtivasSection
          campaigns={campaigns}
          onDetail={(id) => openManage(id, "overview")}
          onAction={(id, action) => { void handleCampaignAction(id, action); }}
          restrictToIds={activeReadyMadeIds}
          cartRecoveryActive={cartRecoveryOn}
          couponCounts={couponCounts}
          audiences={audiences}
          dailyQuotas={dailyQuotas}
          onCartRecoveryManage={() => { void handleCartManage(); }}
          onCartRecoveryToggle={() => { void handleCartRecoveryToggle(); }}
        />
      )}

      {/* ── Campanhas prontas (catálogo pré-configurado, liga/desliga) ────────── */}
      <ReadyMadeCampaignsSection
        onManage={(campaignId) => openManage(campaignId, "message")}
        reloadSignal={readyMadeReload}
      />

      {/* ── Histórico de campanhas (collapsed by default) ────────────────────── */}
      {!loadingHistory && (
        <div data-testid="history-section">
          <button
            onClick={() => setShowHistory((v) => !v)}
            className="flex items-center gap-2 text-xs font-semibold text-muted hover:text-ink2 transition-colors"
          >
            <svg
              className={`h-3.5 w-3.5 transition-transform ${showHistory ? "rotate-90" : ""}`}
              fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
            </svg>
            Ver histórico geral
            {activity.length > 0 && (
              <span className="rounded-full bg-[#F4F4F2] px-2 py-0.5 text-[10px] font-bold text-ink2">
                {activity.length}
              </span>
            )}
          </button>

          {showHistory && (
            <div className="mt-3 space-y-4">
              {/* Histórico geral de envios — log ao vivo com data e hora */}
              <div>
                <p className="mb-2 text-[10px] font-bold uppercase tracking-widest text-muted">Envios recentes (ao vivo)</p>
                {activity.length === 0 ? (
                  <div className="rounded-2xl border-2 border-dashed border-line py-6 text-center text-xs text-muted">
                    Nenhum envio registrado ainda. Assim que uma campanha disparar, aparece aqui.
                  </div>
                ) : (
                  <div className="max-h-96 space-y-1.5 overflow-y-auto rounded-2xl border border-line bg-paper p-2 shadow-sm">
                    {activity.map((a) => {
                      const tone = a.kind === "SENT" ? { bg: "bg-green-50", text: "text-green-700" }
                        : a.kind === "BLOCKED" ? { bg: "bg-amber-50", text: "text-amber-700" }
                        : a.kind === "FAILED" ? { bg: "bg-red-50", text: "text-red-600" }
                        : { bg: "bg-[#F4F4F2]", text: "text-ink2" };
                      const when = new Date(a.at).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit" });
                      return (
                        <div key={a.id} className="flex items-center gap-3 rounded-xl border border-line bg-[#FAFAF8] px-3 py-2">
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-xs font-semibold text-ink">{a.campaignName}</p>
                            <p className="truncate text-[10px] text-muted">{a.customerName ?? "Cliente"} · {a.customerPhone ?? "—"}</p>
                          </div>
                          <div className="shrink-0 text-right">
                            <span className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-bold ${tone.bg} ${tone.text}`}>{a.badge}</span>
                            <p className="mt-0.5 text-[10px] text-muted whitespace-nowrap">🕒 {when}</p>
                            {a.converted && a.revenue != null && (
                              <p className="text-[10px] font-semibold text-green-600">R$ {a.revenue.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</p>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

            </div>
          )}
        </div>
      )}

      {/* ── Modelos salvos (ex "Minhas ações") ──────────────────────────────── */}
      <div>
        <div className="mb-3">
          <h3 className="text-xs font-bold uppercase tracking-widest text-muted">
            Modelos salvos
          </h3>
          <p className="mt-1 text-xs text-muted">
            Rascunhos de mensagens para referência.{" "}
            <span className="font-semibold text-muted">Para enviar mensagens, use uma Campanha — única ou recorrente.</span>
          </p>
        </div>

        {loadingCustom ? (
          <div className="py-6 text-center text-sm text-muted">Carregando…</div>
        ) : customActions.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-line2 py-10 text-center">
            <span className="text-3xl">✍️</span>
            <p className="mt-2 text-sm font-semibold text-muted">Nenhum modelo salvo ainda</p>
            <p className="mt-0.5 text-xs text-muted">
              Salve rascunhos de mensagens aqui para reutilizá-los em Campanhas.
            </p>
            <button
              onClick={() => setShowCreateModal(true)}
              className="mt-4 rounded-xl bg-brand-600 px-4 py-2 text-xs font-bold text-white hover:bg-brand-700 transition-colors"
            >
              Salvar primeiro modelo
            </button>
          </div>
        ) : (
          <div className="space-y-2">
            {customActions.map((action) => {
              const isExpanded = expandedCustom === action.id;
              return (
                <div key={action.id} className="rounded-2xl border border-line bg-paper shadow-sm overflow-hidden">
                  <div className="flex items-center gap-3 px-4 py-3">
                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-1.5 mb-1">
                        <span className="rounded-full bg-[#F4F4F2] px-2 py-0.5 text-[10px] font-semibold text-ink2">
                          {OBJECTIVE_LABELS[action.objective] ?? action.objective}
                        </span>
                        <span className="rounded-full bg-[#F4F4F2] px-2 py-0.5 text-[10px] font-semibold text-ink2">
                          {SEGMENT_LABELS[action.targetSegment] ?? action.targetSegment}
                        </span>
                        {(() => {
                          const sc = CAMPAIGN_STATUS_COLORS[action.status] ?? { bg: "bg-[#F4F4F2]", text: "text-ink2" };
                          return (
                            <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${sc.bg} ${sc.text}`}>
                              {CAMPAIGN_STATUS_LABELS[action.status] ?? "Rascunho"}
                            </span>
                          );
                        })()}
                      </div>
                      <p className="text-sm font-bold text-ink truncate">{action.name}</p>
                    </div>
                    {/* Actions */}
                    <div className="shrink-0 flex items-center gap-1.5">
                      <button
                        onClick={() => setSelectedTemplate(customActionToTemplate(action))}
                        className="rounded-lg bg-brand-50 px-3 py-1.5 text-xs font-semibold text-brand-700 hover:bg-brand-100 transition-colors whitespace-nowrap"
                      >
                        Usar em campanha
                      </button>
                      <button
                        onClick={() => setExpandedCustom(isExpanded ? null : action.id)}
                        className="rounded-lg bg-[#F4F4F2] px-3 py-1.5 text-xs font-semibold text-ink2 hover:bg-line2 transition-colors"
                      >
                        {isExpanded ? "Fechar" : "Ver"}
                      </button>
                      <button
                        onClick={() => handleDeleteAction(action.id)}
                        disabled={deletingAction === action.id}
                        title="Excluir modelo"
                        className="rounded-lg p-1.5 text-muted hover:bg-red-50 hover:text-red-600 transition-colors disabled:opacity-50"
                      >
                        <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                      </button>
                    </div>
                  </div>

                  {isExpanded && (
                    <div className="border-t border-line bg-[#FAFAF8] px-4 py-3 space-y-3">
                      <div className="grid grid-cols-2 gap-2 text-xs">
                        <div>
                          <p className="font-semibold text-muted uppercase tracking-wide text-[10px]">Canal</p>
                          <p className="text-ink2 mt-0.5">{CHANNEL_LABELS[action.channel] ?? action.channel}</p>
                        </div>
                        <div>
                          <p className="font-semibold text-muted uppercase tracking-wide text-[10px]">Criada em</p>
                          <p className="text-ink2 mt-0.5">
                            {new Date(action.createdAt).toLocaleDateString("pt-BR")}
                          </p>
                        </div>
                      </div>
                      <div>
                        <p className="font-semibold text-muted uppercase tracking-wide text-[10px] mb-1">Mensagem</p>
                        <div className="rounded-xl border border-line2 bg-paper px-3 py-2.5 text-sm text-ink2 whitespace-pre-wrap">
                          {action.message}
                        </div>
                      </div>
                      {action.notes && (
                        <div>
                          <p className="font-semibold text-muted uppercase tracking-wide text-[10px] mb-1">Observações internas</p>
                          <p className="text-xs text-muted italic">{action.notes}</p>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Campaign manage modal */}
      {detailId && (
        <CampaignManageModal
          detailId={detailId}
          initialTab={manageInitialTab}
          onClose={() => { setDetailId(null); setReadyMadeReload((n) => n + 1); }}
          onCampaignAction={handleCampaignAction}
          onCampaignUpdated={handleCampaignFieldsUpdated}
        />
      )}

      {/* Config drawer for suggested templates */}
      {selectedTemplate && (
        <ActionConfigDrawer
          template={selectedTemplate}
          onClose={() => setSelectedTemplate(null)}
          onStartCampaign={(campaignId, recipients) => {
            setActiveCampaign({ id: campaignId, recipients });
          }}
          onAfterCreate={refreshCampaigns}
        />
      )}

      {/* Campaign review modal */}
      {activeCampaign && (
        <CampaignReviewModal
          campaignId={activeCampaign.id}
          initialRecipients={activeCampaign.recipients}
          onClose={() => setActiveCampaign(null)}
          onSent={refreshCampaigns}
        />
      )}

      {/* Create custom action modal */}
      {showCreateModal && (
        <CreateActionModal
          onClose={() => setShowCreateModal(false)}
          onCreated={handleActionCreated}
        />
      )}
    </div>
  );
}


// ── CSV Export ────────────────────────────────────────────────────────────────

function exportCSV(customers: CRMCustomer[]) {
  const header = "Nome,Telefone,Último pedido,Gasto total (R$)";
  const rows = customers.map((c) => [
    `"${c.name.replace(/"/g, '""')}"`,
    isGuestIdentifier(c.phone) ? "" : c.phone,
    c.lastOrderAt ? new Date(c.lastOrderAt).toLocaleDateString("pt-BR") : "",
    c.totalSpend.toFixed(2).replace(".", ","),
  ].join(","));
  const csv = "﻿" + [header, ...rows].join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `clientes_${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

// ── Copy Phone ────────────────────────────────────────────────────────────────

function CopyPhoneButton({ phone }: { phone: string }) {
  const [copied, setCopied] = useState(false);
  if (!phone || isGuestIdentifier(phone)) return null;
  function copy(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    navigator.clipboard.writeText(phone);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }
  return (
    <button
      onClick={copy}
      title="Copiar telefone"
      className={`ml-1 rounded px-1.5 py-0.5 text-[10px] font-semibold transition-colors ${
        copied ? "bg-green-100 text-green-700" : "bg-[#F4F4F2] text-muted hover:bg-line2"
      }`}
    >
      {copied ? "✓" : "copiar"}
    </button>
  );
}

// ── Reactivation Helper ───────────────────────────────────────────────────────

function ReactivationHelper({
  customers,
  reviewLinks,
}: {
  customers: CRMCustomer[];
  reviewLinks: { google: string | null; ifood: string | null };
}) {
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState(
    "Fala {nome}, tudo bem? 👋\nTemos uma condição especial hoje pra você voltar — quer ver?"
  );
  const [copied, setCopied] = useState<string | null>(null);

  function copyFor(c: CRMCustomer) {
    navigator.clipboard.writeText(message.replace(/\{nome\}/gi, c.name));
    setCopied(c.id);
    setTimeout(() => setCopied(null), 2000);
  }

  function copyTemplate() {
    navigator.clipboard.writeText(message);
    setCopied("__template__");
    setTimeout(() => setCopied(null), 2000);
  }

  function appendLink(url: string) {
    setMessage((m) => m.trimEnd() + "\n" + url);
  }

  const hasLinks = reviewLinks.google || reviewLinks.ifood;

  return (
    <div className="rounded-2xl border border-brand-100 bg-brand-50 overflow-hidden">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between px-4 py-3 text-left"
      >
        <span className="text-xs font-bold text-brand-800">
          Mensagem rápida de reativação
        </span>
        <svg
          className={`h-4 w-4 text-brand-600 transition-transform ${open ? "rotate-180" : ""}`}
          fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && (
        <div className="border-t border-brand-100 bg-paper p-4 space-y-3">
          <textarea
            rows={3}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            className="w-full rounded-xl border border-line2 bg-[#FAFAF8] px-3 py-2 text-sm text-ink focus:border-brand-400 focus:outline-none resize-none"
          />
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-[10px] text-muted flex-1 min-w-0">
              Use <code className="bg-[#F4F4F2] px-1 rounded">{"{nome}"}</code> para personalizar.
            </p>
            <button
              onClick={copyTemplate}
              className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
                copied === "__template__"
                  ? "bg-green-100 text-green-700"
                  : "bg-[#F4F4F2] text-ink2 hover:bg-line2"
              }`}
            >
              {copied === "__template__" ? "✓ Copiado!" : "Copiar modelo"}
            </button>
            {hasLinks && (
              <>
                {reviewLinks.google && (
                  <button
                    onClick={() => appendLink(reviewLinks.google!)}
                    className="rounded-lg bg-blue-50 px-3 py-1.5 text-xs font-semibold text-blue-700 hover:bg-blue-100 transition-colors"
                  >
                    + Google
                  </button>
                )}
                {reviewLinks.ifood && (
                  <button
                    onClick={() => appendLink(reviewLinks.ifood!)}
                    className="rounded-lg bg-red-50 px-3 py-1.5 text-xs font-semibold text-red-700 hover:bg-red-100 transition-colors"
                  >
                    + iFood
                  </button>
                )}
              </>
            )}
          </div>

          {customers.length > 0 && (
            <div>
              <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-muted">
                Copiar mensagem personalizada para cada cliente
              </p>
              <div className="max-h-52 overflow-y-auto space-y-1.5">
                {customers.slice(0, 30).map((c) => (
                  <div
                    key={c.id}
                    className="flex items-center justify-between gap-2 rounded-xl border border-line bg-[#FAFAF8] px-3 py-2"
                  >
                    <div className="min-w-0">
                      <p className="text-xs font-semibold text-ink truncate">{c.name}</p>
                      <p className="text-[10px] text-muted">{formatPhone(c.phone)}</p>
                    </div>
                    {c.phone && !isGuestIdentifier(c.phone) && (
                      <button
                        onClick={() => copyFor(c)}
                        className={`shrink-0 rounded-lg px-2.5 py-1 text-xs font-semibold transition-colors ${
                          copied === c.id
                            ? "bg-green-100 text-green-700"
                            : "bg-brand-50 text-brand-700 hover:bg-brand-100"
                        }`}
                      >
                        {copied === c.id ? "✓ Copiado" : "Copiar"}
                      </button>
                    )}
                  </div>
                ))}
                {customers.length > 30 && (
                  <p className="text-center text-[10px] text-muted py-1.5">
                    +{customers.length - 30} clientes. Use &quot;Exportar CSV&quot; para ver todos.
                  </p>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── WhatsApp Send Modal ───────────────────────────────────────────────────────

function WhatsAppSendModal({
  customer,
  onClose,
}: {
  customer: CRMCustomer;
  onClose: () => void;
}) {
  const firstName = customer.name.split(" ")[0];
  const [message, setMessage] = useState(
    `Oi, ${firstName}! Tudo bem? 😊 Passando para dizer que estamos aqui caso queira fazer um pedido. Qualquer dúvida é só falar!`
  );
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<
    { ok: true; conversationId: string } | { ok: false; error: string } | null
  >(null);

  async function handleSend() {
    const trimmed = message.trim();
    if (!trimmed) return;
    setSending(true);
    try {
      const res = await fetch(`/api/customers/${customer.id}/send-whatsapp`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ message: trimmed }),
      });
      const json = await res.json() as {
        success?: boolean;
        data?:    { conversationId: string };
        error?:   string;
      };
      if (res.ok && json.data?.conversationId) {
        setResult({ ok: true, conversationId: json.data.conversationId });
      } else {
        setResult({ ok: false, error: json.error ?? "Falha ao enviar mensagem." });
      }
    } catch {
      setResult({ ok: false, error: "Erro de conexão. Tente novamente." });
    } finally {
      setSending(false);
    }
  }

  const maskedPhone = formatPhone(customer.phone);

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-ink/45 px-4 pb-4 sm:pb-0"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="w-full max-w-md rounded-2xl bg-paper shadow-xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-line px-5 py-4">
          <div>
            <h3 className="text-sm font-semibold text-ink">
              Enviar WhatsApp para {customer.name}
            </h3>
            <p className="mt-0.5 text-xs text-muted">{maskedPhone}</p>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-muted hover:bg-[#F4F4F2] hover:text-ink2 transition-colors"
          >
            <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
              <path d="M6.28 5.22a.75.75 0 0 0-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 1 0 1.06 1.06L10 11.06l3.72 3.72a.75.75 0 1 0 1.06-1.06L11.06 10l3.72-3.72a.75.75 0 0 0-1.06-1.06L10 8.94 6.28 5.22Z" />
            </svg>
          </button>
        </div>

        {/* Body */}
        <div className="px-5 py-4 space-y-3">
          {result?.ok ? (
            <div className="rounded-xl bg-green-50 border border-green-200 p-4 text-sm text-green-800">
              <p className="font-semibold">Mensagem enviada pelo WhatsApp.</p>
              <a
                href={`/atendimento?conversation=${result.conversationId}`}
                className="mt-1 inline-flex items-center gap-1 text-green-700 underline underline-offset-2 hover:text-green-900"
              >
                Ver conversa em Atendimento →
              </a>
            </div>
          ) : (
            <>
              {result && !result.ok && (
                <div className="rounded-xl bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
                  {result.error}
                </div>
              )}
              <textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                rows={5}
                maxLength={4096}
                placeholder="Digite a mensagem…"
                className="w-full rounded-xl border border-line2 bg-paper px-3 py-2.5 text-sm text-ink placeholder:text-muted focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-100 resize-none transition"
              />
              <p className="text-right text-xs text-muted">{message.length}/4096</p>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="flex gap-2 border-t border-line px-5 py-4">
          <button
            onClick={onClose}
            className="flex-1 rounded-xl border border-line2 py-2.5 text-sm font-medium text-ink2 hover:bg-[#FAFAF8] transition-colors"
          >
            {result?.ok ? "Fechar" : "Cancelar"}
          </button>
          {!result?.ok && (
            <button
              onClick={handleSend}
              disabled={sending || !message.trim()}
              className="flex-1 rounded-xl bg-green-600 py-2.5 text-sm font-semibold text-white hover:bg-green-700 disabled:opacity-50 transition-colors"
            >
              {sending ? "Enviando…" : "Enviar WhatsApp"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Customers Tab ─────────────────────────────────────────────────────────────

type CRMFilter = "all" | "inactive" | "quente" | "morno" | "frio" | "perdido" | "neverOrdered" | "firstTime" | "recent" | "tier-bronze" | "tier-prata" | "tier-ouro" | "tier-diamante";

function CustomersTab({
  initialCustomers,
  initialTotal = 0,
  pageSize: initialPageSize = 20,
  initialFilter = "all",
  onImportOpen,
  reviewLinks,
  stats,
  statsLoading,
}: {
  initialCustomers: CRMCustomer[];
  initialTotal?: number;
  pageSize?: number;
  initialFilter?: CRMFilter;
  onImportOpen: () => void;
  reviewLinks: { google: string | null; ifood: string | null };
  stats: OverviewStats;
  statsLoading?: boolean;
}) {
  const [filter,     setFilter]     = useState<CRMFilter>(initialFilter);
  const [customers,  setCustomers]  = useState<CRMCustomer[]>(
    initialFilter === "all" ? initialCustomers : []
  );
  const [loading,    setLoading]    = useState(initialFilter !== "all");
  const [sortValue,  setSortValue]  = useState("spend-desc");
  const [search,     setSearch]     = useState("");
  const [debSearch,  setDebSearch]  = useState("");
  const [waSend,     setWaSend]     = useState<CRMCustomer | null>(null);
  const [reviewReq,  setReviewReq]  = useState<CRMCustomer | null>(null);
  const hasReviewLink = !!(reviewLinks.google || reviewLinks.ifood);

  // Pagination — server-side, so the list never loads the whole base at once.
  const [page,     setPage]     = useState(1);
  const [pageSize, setPageSize] = useState(initialPageSize);
  const [total,    setTotal]    = useState(initialFilter === "all" ? initialTotal : 0);
  const firstRender = useRef(true);

  // Debounce search → debSearch (and jump back to page 1 on a new search)
  useEffect(() => {
    const t = setTimeout(() => { setDebSearch(search); setPage(1); }, 350);
    return () => clearTimeout(t);
  }, [search]);

  // Single fetch effect: runs on filter / search / page / pageSize change.
  // First render uses the SSR-seeded first page (no redundant fetch).
  useEffect(() => {
    if (firstRender.current) { firstRender.current = false; return; }
    setLoading(true);
    const qs = new URLSearchParams({ filter, page: String(page), pageSize: String(pageSize) });
    if (debSearch) qs.set("search", debSearch);
    fetch(`/api/crm/customers?${qs}`)
      .then((r) => r.json())
      .then((json) => {
        const d = json.data as { customers?: CRMCustomer[]; total?: number } | undefined;
        setCustomers(d?.customers ?? []);
        setTotal(d?.total ?? 0);
      })
      .catch(() => { setCustomers([]); setTotal(0); })
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter, debSearch, page, pageSize]);

  function applyFilter(f: CRMFilter) {
    setFilter(f);
    setPage(1);
  }

  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const pageStart  = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const pageEnd    = Math.min(page * pageSize, total);

  const sortedCustomers = applyCRMSort(customers, sortValue);
  const tierOrder: CustomerTier[] = ["DIAMANTE", "OURO", "PRATA", "BRONZE"];
  const filterKeys = Object.keys(CUSTOMER_FILTER_LABELS) as CRMFilter[];

  return (
    <div className="space-y-4">
      {waSend && (
        <WhatsAppSendModal customer={waSend} onClose={() => setWaSend(null)} />
      )}
      {reviewReq && reviewReq.phone && (
        <ReviewRequestModal
          customer={{ id: reviewReq.id, name: reviewReq.name, phone: reviewReq.phone }}
          onClose={() => setReviewReq(null)}
        />
      )}

      {/* Saúde da base de contatos — movido da Visão Geral */}
      <ContactBaseHealthPanel stats={stats} loading={statsLoading} />

      {/* Search box */}
      <div className="relative">
        <svg
          className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted"
          fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z" />
        </svg>
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar cliente por nome ou telefone…"
          className="w-full rounded-xl border border-line2 bg-paper py-2.5 pl-10 pr-10 text-sm text-ink placeholder:text-muted focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-100 transition"
        />
        {search && (
          <button
            onClick={() => setSearch("")}
            className="absolute right-3 top-1/2 -translate-y-1/2 rounded-lg p-0.5 text-muted hover:text-ink2 transition-colors"
          >
            <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
              <path d="M6.28 5.22a.75.75 0 0 0-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 1 0 1.06 1.06L10 11.06l3.72 3.72a.75.75 0 1 0 1.06-1.06L11.06 10l3.72-3.72a.75.75 0 0 0-1.06-1.06L10 8.94 6.28 5.22Z" />
            </svg>
          </button>
        )}
      </div>

      {/* Filter pills + actions */}
      <div className="flex flex-wrap items-center gap-2">
        {filterKeys.filter((f) => !f.startsWith("tier-")).map((f) => (
          <button
            key={f}
            onClick={() => applyFilter(f)}
            className={`rounded-full px-3.5 py-1.5 text-xs font-semibold transition-all ${
              filter === f
                ? "bg-brand-600 text-white shadow-sm"
                : "bg-[#F4F4F2] text-ink2 hover:bg-line2"
            }`}
          >
            {CUSTOMER_FILTER_LABELS[f]}
          </button>
        ))}
        <select
          value={sortValue}
          onChange={(e) => setSortValue(e.target.value)}
          className="rounded-full border border-line2 bg-paper px-3 py-1.5 text-xs font-medium text-ink2 focus:outline-none focus:ring-1 focus:ring-brand-300"
          aria-label="Ordenar clientes"
        >
          {CRM_SORT_OPTS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        <span className="text-xs text-muted ml-1">
          {debSearch ? `${customers.length} resultado${customers.length !== 1 ? "s" : ""}` : `${customers.length} clientes`}
        </span>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <NewCustomerButton onCreated={() => applyFilter(filter)} />
          {customers.length > 0 && (
            <button
              onClick={() => exportCSV(customers)}
              className="flex items-center gap-1.5 rounded-full border border-line2 bg-paper px-3.5 py-1.5 text-xs font-semibold text-ink2 hover:bg-[#FAFAF8] transition-colors"
            >
              <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5M16.5 12 12 16.5m0 0L7.5 12m4.5 4.5V3" />
              </svg>
              Exportar CSV
            </button>
          )}
          <button
            onClick={onImportOpen}
            className="flex items-center gap-1.5 rounded-full bg-brand-600 px-3.5 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-brand-700 transition-colors"
          >
            <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5m-13.5-9L12 3m0 0 4.5 4.5M12 3v13.5" />
            </svg>
            Importar
          </button>
        </div>
      </div>

      {/* Table */}
      {loading ? (
        <div className="py-12 text-center text-sm text-muted">Carregando…</div>
      ) : customers.length === 0 ? (
        <div className="py-12 text-center space-y-3">
          <p className="text-sm text-muted">
            {debSearch
              ? "Não encontramos clientes com esse nome ou telefone."
              : "Nenhum cliente neste filtro."}
          </p>
          {debSearch && (
            <button
              onClick={() => setSearch("")}
              className="rounded-full border border-line2 px-4 py-1.5 text-xs font-medium text-ink2 hover:bg-[#FAFAF8] transition-colors"
            >
              Limpar busca
            </button>
          )}
        </div>
      ) : (
        <>
          {/* Desktop table */}
          <div className="hidden sm:block overflow-x-auto rounded-2xl border border-line bg-paper shadow-sm">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-line text-left text-[11px] font-semibold uppercase tracking-wide text-muted">
                  <th className="px-4 py-3">Cliente</th>
                  <th className="px-4 py-3">Tier</th>
                  <th className="px-4 py-3 text-right">Gasto total</th>
                  <th className="px-4 py-3 text-right">Pedidos</th>
                  <th className="px-4 py-3 text-right">Último pedido</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {sortedCustomers.map((c) => (
                  <tr key={c.id} className="hover:bg-[#FAFAF8] transition-colors">
                    <td className="px-4 py-3">
                      <Link href={`/customers/${c.id}`} className="hover:text-brand-600 transition-colors">
                        <p className="font-semibold text-ink text-sm">
                          {c.name}
                          {c.isUsingImportedData && (
                            <span className="ml-1.5 inline-flex items-center rounded-full bg-amber-100 px-1.5 py-0.5 text-[9px] font-medium text-amber-700">Histórico importado</span>
                          )}
                          {c.contactStatus === "SEM_TELEFONE" && (
                            <span className="ml-1.5 inline-flex items-center rounded-full bg-[#F4F4F2] px-1.5 py-0.5 text-[9px] font-medium text-muted">Sem telefone</span>
                          )}
                          {!c.crmContactable && c.contactStatus !== "SEM_TELEFONE" && (
                            <span className="ml-1.5 inline-flex items-center rounded-full bg-red-100 px-1.5 py-0.5 text-[9px] font-medium text-red-600">Não contatável</span>
                          )}
                          {c.dataEnrichmentStatus === "NEEDS_ENRICHMENT" && (
                            <span className="ml-1.5 inline-flex items-center rounded-full bg-amber-100 px-1.5 py-0.5 text-[9px] font-medium text-amber-700">Precisa enriquecer</span>
                          )}
                        </p>
                        <span className="text-[11px] text-muted">
                          {formatPhone(c.phone)}
                          <CopyPhoneButton phone={c.phone} />
                        </span>
                      </Link>
                    </td>
                    <td className="px-4 py-3">
                      <TierBadge tier={c.tier} />
                    </td>
                    <td className="px-4 py-3 text-right font-semibold text-ink">
                      R${formatCurrency(c.totalSpend)}
                    </td>
                    <td className="px-4 py-3 text-right text-ink2">
                      {c.totalOrders}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <span className={c.daysSinceLastOrder != null && c.daysSinceLastOrder > 30
                        ? "text-red-500 font-medium"
                        : "text-ink2"
                      }>
                        {relativeDate(c.lastOrderAt)}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      {c.contactStatus === "OPT_OUT" ? (
                        <span className="text-[10px] text-muted italic">Opt-out</span>
                      ) : !c.phone || c.contactStatus === "SEM_TELEFONE" ? (
                        <span className="text-[10px] text-muted italic">Sem telefone</span>
                      ) : (
                        <div className="inline-flex items-center gap-1.5">
                          <button
                            onClick={() => setWaSend(c)}
                            className="inline-flex items-center gap-1 rounded-lg border border-green-200 bg-green-50 px-2.5 py-1 text-[11px] font-semibold text-green-700 hover:bg-green-100 transition-colors"
                          >
                            <svg className="h-3 w-3" viewBox="0 0 24 24" fill="currentColor">
                              <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347Z"/>
                              <path d="M11.955 2C6.469 2 2 6.469 2 11.955c0 1.92.525 3.716 1.44 5.26L2 22l4.94-1.418A9.913 9.913 0 0 0 11.955 22C17.44 22 22 17.531 22 12.045 22 6.559 17.44 2 11.955 2Zm0 18.18a8.205 8.205 0 0 1-4.19-1.146l-.3-.178-3.107.893.893-3.026-.196-.312A8.178 8.178 0 0 1 3.82 12.045c0-4.489 3.647-8.135 8.135-8.135 4.489 0 8.135 3.646 8.135 8.135 0 4.489-3.646 8.135-8.135 8.135Z"/>
                            </svg>
                            WhatsApp
                          </button>
                          {hasReviewLink && (
                            <button
                              onClick={() => setReviewReq(c)}
                              title="Pedir avaliação"
                              className="inline-flex items-center rounded-lg border border-amber-200 bg-amber-50 px-2 py-1 text-[11px] font-semibold text-amber-700 hover:bg-amber-100 transition-colors"
                            >
                              ⭐
                            </button>
                          )}
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {/* Tier legend */}
            <div className="border-t border-line px-4 py-3 flex flex-wrap gap-3">
              {tierOrder.map((t) => {
                const cfg = TIER_CONFIG[t];
                const count = customers.filter((c) => c.tier === t).length;
                return (
                  <span key={t} className="text-[11px] text-muted">
                    {cfg.icon} {cfg.label}: <strong>{count}</strong>
                  </span>
                );
              })}
            </div>
          </div>

          {/* Mobile cards */}
          <div className="sm:hidden space-y-2">
            {sortedCustomers.map((c) => (
              <div key={c.id} className="rounded-2xl border border-line bg-paper p-4 shadow-sm">
                <Link href={`/customers/${c.id}`}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-sm font-bold text-ink truncate">
                        {c.name}
                        {c.contactStatus === "SEM_TELEFONE" && (
                          <span className="ml-1.5 inline-flex items-center rounded-full bg-[#F4F4F2] px-1.5 py-0.5 text-[9px] font-medium text-muted">Sem telefone</span>
                        )}
                        {!c.crmContactable && c.contactStatus !== "SEM_TELEFONE" && (
                          <span className="ml-1.5 inline-flex items-center rounded-full bg-red-100 px-1.5 py-0.5 text-[9px] font-medium text-red-600">Não contatável</span>
                        )}
                        {c.dataEnrichmentStatus === "NEEDS_ENRICHMENT" && (
                          <span className="ml-1.5 inline-flex items-center rounded-full bg-amber-100 px-1.5 py-0.5 text-[9px] font-medium text-amber-700">Precisa enriquecer</span>
                        )}
                      </p>
                      <span className="text-xs text-muted">
                        {formatPhone(c.phone)}
                        <CopyPhoneButton phone={c.phone} />
                      </span>
                    </div>
                    <TierBadge tier={c.tier} />
                  </div>
                  <div className="mt-2 flex gap-4 text-xs text-muted">
                    <span>R${formatCurrency(c.totalSpend)}</span>
                    <span>{c.totalOrders} pedido{c.totalOrders !== 1 ? "s" : ""}</span>
                    <span className={c.daysSinceLastOrder != null && c.daysSinceLastOrder > 30 ? "text-red-500 font-medium" : ""}>
                      {relativeDate(c.lastOrderAt)}
                    </span>
                  </div>
                </Link>
                {c.phone && c.contactStatus !== "SEM_TELEFONE" && c.contactStatus !== "OPT_OUT" && (
                  <div className="mt-3 border-t border-line pt-3">
                    <button
                      onClick={() => setWaSend(c)}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-green-200 bg-green-50 px-3 py-1.5 text-xs font-semibold text-green-700 hover:bg-green-100 transition-colors"
                    >
                      <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347Z"/>
                        <path d="M11.955 2C6.469 2 2 6.469 2 11.955c0 1.92.525 3.716 1.44 5.26L2 22l4.94-1.418A9.913 9.913 0 0 0 11.955 22C17.44 22 22 17.531 22 12.045 22 6.559 17.44 2 11.955 2Zm0 18.18a8.205 8.205 0 0 1-4.19-1.146l-.3-.178-3.107.893.893-3.026-.196-.312A8.178 8.178 0 0 1 3.82 12.045c0-4.489 3.647-8.135 8.135-8.135 4.489 0 8.135 3.646 8.135 8.135 0 4.489-3.646 8.135-8.135 8.135Z"/>
                      </svg>
                      Enviar WhatsApp
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </>
      )}

      {/* Paginação — server-side; a lista nunca carrega a base inteira de uma vez */}
      {!loading && total > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line bg-paper px-4 py-2.5">
          <span className="text-[11px] text-muted">
            Mostrando <strong className="text-ink2">{pageStart}–{pageEnd}</strong> de{" "}
            <strong className="text-ink2">{total.toLocaleString("pt-BR")}</strong> clientes
          </span>
          <div className="flex items-center gap-3">
            <label className="flex items-center gap-1.5 text-[11px] text-muted">
              Por página:
              <select
                value={pageSize}
                onChange={(e) => { setPageSize(Number(e.target.value)); setPage(1); }}
                className="rounded-lg border border-line2 px-2 py-1 text-xs text-ink2 focus:outline-none focus:ring-2 focus:ring-brand-400"
              >
                {[10, 20, 50].map((n) => <option key={n} value={n}>{n}</option>)}
              </select>
            </label>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1 || loading}
                className="rounded-lg border border-line2 px-2.5 py-1 text-xs font-semibold text-ink2 hover:bg-[#FAFAF8] disabled:opacity-40"
              >← Anterior</button>
              <span className="px-2 text-[11px] text-muted">{page} / {totalPages}</span>
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages || loading}
                className="rounded-lg border border-line2 px-2.5 py-1 text-xs font-semibold text-ink2 hover:bg-[#FAFAF8] disabled:opacity-40"
              >Próxima →</button>
            </div>
          </div>
        </div>
      )}

      {/* Reactivation Helper */}
      <ReactivationHelper customers={customers} reviewLinks={reviewLinks} />
    </div>
  );
}

// ── Avaliações Tab ────────────────────────────────────────────────────────────

function AvaliacoesTab({
  googleReviewUrl,
  ifoodReviewUrl,
}: {
  googleReviewUrl: string | null;
  ifoodReviewUrl: string | null;
}) {
  const hasAnyLink = googleReviewUrl || ifoodReviewUrl;

  return (
    <div className="space-y-5">
      {/* Plataformas */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {/* Google */}
        <div className="rounded-xl border border-line2 bg-paper p-5 space-y-3">
          <div className="flex items-center gap-2">
            <span className="text-2xl">🌐</span>
            <h3 className="text-sm font-semibold text-ink">Google Reviews</h3>
          </div>
          {googleReviewUrl ? (
            <a
              href={googleReviewUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 transition"
            >
              Ver no Google →
            </a>
          ) : (
            <p className="text-xs text-muted">
              Link não configurado.{" "}
              <Link href="/marca" className="text-brand-600 underline">Adicionar →</Link>
            </p>
          )}
          <p className="text-[11px] text-muted pt-1">
            A leitura automática das avaliações do Google ainda não está integrada.
            Por aqui você configura o link e dispara os pedidos de avaliação para os clientes.
          </p>
        </div>

        {/* iFood */}
        <div className="rounded-xl border border-line2 bg-paper p-5 space-y-3">
          <div className="flex items-center gap-2">
            <span className="text-2xl">🛵</span>
            <h3 className="text-sm font-semibold text-ink">iFood Avaliações</h3>
          </div>
          {ifoodReviewUrl ? (
            <a
              href={ifoodReviewUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 rounded-lg bg-red-500 px-4 py-2 text-sm font-semibold text-white hover:bg-red-600 transition"
            >
              Ver no iFood →
            </a>
          ) : (
            <p className="text-xs text-muted">
              Link não configurado.{" "}
              <Link href="/marca" className="text-brand-600 underline">Adicionar →</Link>
            </p>
          )}
          <p className="text-[11px] text-muted pt-1">
            A leitura automática das avaliações do iFood ainda não está integrada.
            Por aqui você configura o link e dispara os pedidos de avaliação para os clientes.
          </p>
        </div>
      </div>

      {!hasAnyLink && (
        <div className="rounded-xl border border-dashed border-amber-200 bg-amber-50 p-4 text-center">
          <p className="text-sm font-medium text-amber-800">Configure seus links de avaliação</p>
          <p className="mt-1 text-xs text-amber-600">
            Acesse <Link href="/marca" className="underline font-semibold">Marca</Link>{" "}
            e cole os links do Google e iFood.
          </p>
        </div>
      )}

      <div className="rounded-xl border border-line2 bg-paper p-5 space-y-3">
        <h3 className="text-sm font-semibold text-ink">📨 Template Pós-Venda</h3>
        <p className="text-xs text-muted">Use este template nas campanhas de WhatsApp após o pedido.</p>
        <div className="rounded-lg border border-green-100 bg-green-50 p-4 font-mono text-xs text-green-800 whitespace-pre-wrap">
{`Olá {nome}, o que achou do seu pedido? 😊
Se puder, nos avalie — sua opinião faz toda a diferença!
${googleReviewUrl ? `\n⭐ Google: ${googleReviewUrl}` : "⭐ Google: [configure o link nas configurações]"}${ifoodReviewUrl ? `\n🛵 iFood: ${ifoodReviewUrl}` : ""}`}
        </div>
        <button
          onClick={() => {
            const txt = `Olá {nome}, o que achou do seu pedido? 😊\nSe puder, nos avalie — sua opinião faz toda a diferença!\n${googleReviewUrl ? `\n⭐ Google: ${googleReviewUrl}` : ""}${ifoodReviewUrl ? `\n🛵 iFood: ${ifoodReviewUrl}` : ""}`.trim();
            navigator.clipboard.writeText(txt);
          }}
          className="text-xs text-brand-600 underline hover:text-brand-700"
        >
          Copiar template
        </button>
      </div>
    </div>
  );
}

// ── CRM Configurações Tab ─────────────────────────────────────────────────────

const TIMEZONES_CRM = [
  { value: "America/Sao_Paulo",   label: "Brasília (GMT-3)" },
  { value: "America/Manaus",      label: "Manaus (GMT-4)"   },
  { value: "America/Belem",       label: "Belém (GMT-3)"    },
  { value: "America/Fortaleza",   label: "Fortaleza (GMT-3)" },
  { value: "America/Recife",      label: "Recife (GMT-3)"   },
  { value: "America/Bahia",       label: "Salvador (GMT-3)" },
  { value: "America/Cuiaba",      label: "Cuiabá (GMT-4)"   },
  { value: "America/Porto_Velho", label: "Porto Velho (GMT-4)" },
  { value: "America/Rio_Branco",  label: "Rio Branco (GMT-5)" },
  { value: "America/Noronha",     label: "Fernando de Noronha (GMT-2)" },
];

// Default values mirror crm-safety.ts DEFAULT_SAFETY_CONFIG
const DEFAULT_CFG = {
  dailyGlobalCap:        200,
  contactBudgetTotal:    0,
  manualOverride:        false,
  customerCooldownHours: 24,
  quietHoursEnabled:     true,
  quietHoursStart:       "21:00",
  quietHoursEnd:         "08:00",
  timezone:              "America/Sao_Paulo",
  sendOnWeekends:        true,
  maxPerWeekPerCustomer: 5,
  randomDelayEnabled:    true,
  randomDelayMinSec:     5,
  randomDelayMaxSec:     45,
  couponMonthlyBudget:   0,
  couponAvgTicket:       50,
};

type SafetyCfg = typeof DEFAULT_CFG;

const CFG_INPUT =
  "w-full rounded-xl border border-line2 bg-paper px-3 py-2 text-sm text-ink placeholder:text-muted focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-100 transition";

function CfgField({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="mb-1.5 block text-sm font-medium text-ink2">{label}</label>
      {children}
      {hint && <p className="mt-1 text-xs text-muted">{hint}</p>}
    </div>
  );
}

function CfgToggle({
  label,
  desc,
  checked,
  onChange,
}: {
  label: string;
  desc?: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex cursor-pointer items-start gap-3">
      <div className="relative mt-0.5 shrink-0">
        <input type="checkbox" className="sr-only" checked={checked} onChange={(e) => onChange(e.target.checked)} />
        <div className={`h-5 w-9 rounded-full transition-colors ${checked ? "bg-brand-500" : "bg-line2"}`} />
        <div className={`absolute top-0.5 h-4 w-4 rounded-full bg-paper shadow transition-transform ${checked ? "translate-x-4" : "translate-x-0.5"}`} />
      </div>
      <div>
        <p className="text-sm font-medium text-ink">{label}</p>
        {desc && <p className="text-xs text-muted">{desc}</p>}
      </div>
    </label>
  );
}

function CfgCard({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-line bg-paper p-6 shadow-sm">
      <div className="mb-5">
        <h2 className="text-base font-semibold text-ink">{title}</h2>
        {subtitle && <p className="mt-0.5 text-sm text-muted">{subtitle}</p>}
      </div>
      {children}
    </div>
  );
}

function CrmConfiguracoes() {
  const [loading, setLoading] = useState(true);
  const [saving,  setSaving]  = useState(false);
  const [success, setSuccess] = useState<string | null>(null);
  const [error,   setError]   = useState<string | null>(null);
  const [cfg, setCfg]         = useState<SafetyCfg>({ ...DEFAULT_CFG });
  const [warmup, setWarmup]   = useState<{ ageDays: number; safeDailyLimit: number; metaOfficial?: boolean; qualityRating?: string | null; messagingLimit?: string | null }>({ ageDays: 0, safeDailyLimit: 20 });

  useEffect(() => {
    fetch("/api/settings/crm-safety")
      .then((r) => r.json())
      .then(({ data }) => {
        if (data) {
          setCfg({ ...DEFAULT_CFG, ...data });
          if (data.warmup) setWarmup(data.warmup);
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  function set<K extends keyof SafetyCfg>(key: K, val: SafetyCfg[K]) {
    setCfg((prev) => ({ ...prev, [key]: val }));
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setSuccess(null);
    setError(null);
    try {
      const res = await fetch("/api/settings/crm-safety", {
        method:  "PATCH",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify(cfg),
      });
      const json = await res.json();
      if (res.ok) {
        if (json.data) setCfg({ ...DEFAULT_CFG, ...json.data });
        setSuccess("Configurações salvas com sucesso.");
      } else {
        setError("Erro ao salvar. Tente novamente.");
      }
    } catch {
      setError("Falha de rede. Tente novamente.");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <span className="h-6 w-6 animate-spin rounded-full border-2 border-brand-500 border-t-transparent" />
      </div>
    );
  }

  return (
    <form onSubmit={handleSave} className="max-w-2xl space-y-5">

      {/* Feedback */}
      {success && (
        <div className="flex items-center gap-2 rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm font-medium text-green-700">
          <span>✓</span> {success}
        </div>
      )}
      {error && (
        <div className="flex items-center justify-between rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          <span>{error}</span>
          <button type="button" className="ml-2 text-xs underline opacity-70 hover:opacity-100" onClick={() => setError(null)}>fechar</button>
        </div>
      )}

      {/* Regras de Segurança — controle manual + limite de contatos + proteções */}
      <CfgCard
        title="Regras de Segurança"
        subtitle="O limite de mensagens por dia é o teto oficial da Meta, e sobe sozinho conforme a qualidade do seu número. As regras abaixo cuidam do ritmo de envio para o cliente."
      >
        {/* (a) Controle manual + modo seguro */}
        <CfgToggle
          label="Assumir controle manual (eu me responsabilizo)"
          desc="Destrava os limites para você escolher os valores. Desligue para voltar ao modo seguro."
          checked={cfg.manualOverride}
          onChange={(v) => set("manualOverride", v)}
        />

        {!cfg.manualOverride ? (
          <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3.5">
            <div className="flex items-baseline justify-between">
              <span className="text-sm font-semibold text-emerald-800">🟢 Limite oficial da Meta</span>
              <span className="text-lg font-bold text-emerald-700">
                {warmup.safeDailyLimit} <span className="text-sm font-normal text-emerald-800/70">msgs/dia hoje</span>
              </span>
            </div>
            <p className="mt-1.5 text-xs text-emerald-800/80">
              Este é o limite <strong>oficial da Meta</strong> para o seu WhatsApp Business
              {(() => {
                const q = warmup.qualityRating;
                const lbl = q === "GREEN" || q === "HIGH" ? "alta" : q === "YELLOW" || q === "MEDIUM" ? "média" : q === "RED" || q === "LOW" ? "baixa" : null;
                return lbl ? <> — qualidade do número: <strong>{lbl}</strong></> : null;
              })()}
              . Ele sobe sozinho conforme a qualidade e o histórico do seu número, sem risco de bloqueio.
            </p>
            {/* Valores fixos do modo seguro — congelados, só pra visualização. Ligue o
                controle manual para editar qualquer um deles. */}
            <div className="mt-3 grid grid-cols-2 gap-2 border-t border-emerald-200/70 pt-3 sm:grid-cols-3">
              {[
                { l: "Limite diário", v: `${warmup.safeDailyLimit}/dia` },
                { l: "Intervalo por cliente", v: "24 h" },
                { l: "Máx. por cliente/semana", v: "5" },
                { l: "Horário sem envio", v: "21h–8h" },
                { l: "Delay entre envios", v: "5–45 s" },
                { l: "Fim de semana", v: "permitido" },
              ].map((m) => (
                <div key={m.l} className="rounded-lg bg-white/70 px-2.5 py-1.5">
                  <p className="text-[9px] font-semibold uppercase tracking-wide text-emerald-700/70">{m.l}</p>
                  <p className="text-sm font-bold text-emerald-800">{m.v}</p>
                </div>
              ))}
            </div>
            <p className="mt-2 text-[10px] text-emerald-800/70">🔒 Congelados no modo seguro. Ligue “Assumir controle manual” para editar.</p>
          </div>
        ) : (
          <div className="mt-4 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3.5">
            <p className="text-sm font-semibold text-amber-800">⚠️ Controle manual ativo</p>
            <p className="mt-1 text-xs text-amber-800/80">
              Os limites agora estão sob a sua responsabilidade. Enviar muito de um número novo aumenta bastante o
              risco de bloqueio do WhatsApp. Desligue para voltar ao modo seguro.
            </p>
          </div>
        )}

        {/* (b) Limite de contatos */}
        <div className="mt-5 border-t border-line pt-5">
          <p className="text-sm font-semibold text-ink">
            Limite de contatos <span className="font-normal text-muted">(no total, para sempre)</span>
          </p>
          <p className="mt-0.5 text-xs text-muted">
            Teto de pessoas <strong>diferentes</strong> que o CRM pode abordar na <strong>vida toda</strong>. Não confunda com o
            limite diário acima: aquele é <strong>por dia</strong> e reseta todo dia; este <strong>acumula e nunca zera sozinho</strong>.
            Cada pessoa conta 1 vez, mesmo recebendo várias campanhas. <strong>0 = sem limite.</strong>
          </p>
          {(() => {
            const used  = (cfg as unknown as { contactBudgetUsed?: number }).contactBudgetUsed ?? 0;
            const total = cfg.contactBudgetTotal || 0;
            const on    = total > 0;
            const remaining = on ? Math.max(0, total - used) : 0;
            const pct   = on ? Math.min(100, Math.round((used / total) * 100)) : 0;
            const exhausted = on && remaining <= 0;
            const low   = on && !exhausted && remaining <= Math.max(1, Math.round(total * 0.1));
            return (
              <div className="mt-3 grid gap-5 sm:grid-cols-2">
                <CfgField
                  label="Máximo de pessoas"
                  hint={cfg.manualOverride
                    ? "Aumente este número para permitir que o CRM aborde mais pessoas."
                    : "🔒 Travado no modo seguro. Ligue “Assumir controle manual” lá em cima para editar."}
                >
                  <input
                    type="number" min={0} max={1000000}
                    value={cfg.contactBudgetTotal}
                    disabled={!cfg.manualOverride}
                    onChange={(e) => set("contactBudgetTotal", Math.max(0, parseInt(e.target.value, 10) || 0))}
                    className={`${CFG_INPUT} ${!cfg.manualOverride ? "cursor-not-allowed opacity-60" : ""}`}
                  />
                </CfgField>

                <div className={`rounded-xl border px-4 py-3 ${exhausted ? "border-amber-200 bg-amber-50" : "border-line bg-[#FAFAF8]"}`}>
                  {on ? (
                    <>
                      <div className="flex items-baseline justify-between">
                        <span className="text-sm text-muted">Contatos restantes</span>
                        <span className={`text-lg font-bold ${exhausted ? "text-amber-700" : low ? "text-amber-600" : "text-emerald-600"}`}>
                          {remaining} <span className="text-sm font-normal text-muted">de {total}</span>
                        </span>
                      </div>
                      <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-gray-200">
                        <div className={`h-full rounded-full ${exhausted || low ? "bg-amber-500" : "bg-emerald-500"}`} style={{ width: `${pct}%` }} />
                      </div>
                      {exhausted ? (
                        <p className="mt-2 text-xs text-amber-800">
                          Limite de contatos atingido — <strong>{used}</strong> pessoas já abordadas. Para falar com novos
                          clientes, ligue o controle manual acima e aumente o teto (ou coloque <strong>0 = sem limite</strong>).
                        </p>
                      ) : (
                        <p className="mt-2 text-xs text-muted">{used} contatos já abordados{low ? " · pouco restante, aumente o limite se precisar." : "."}</p>
                      )}
                    </>
                  ) : (
                    <p className="text-sm text-muted">
                      Sem limite ativo. Já foram abordados <strong>{used}</strong> contatos.
                      Defina um valor ao lado para limitar.
                    </p>
                  )}
                </div>
              </div>
            );
          })()}
        </div>

        {/* (c) Proteções permanentes — rodapé discreto */}
        <div className="mt-5 border-t border-line pt-4">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted">Proteções sempre ativas</p>
          <ul className="mt-1.5 space-y-1 text-[11px] leading-relaxed text-muted">
            <li>• Quem pediu para sair (opt-out) nunca mais recebe.</li>
            <li>• Sem telefone válido, ninguém recebe.</li>
            <li>• A mesma campanha não chega duas vezes para a mesma pessoa.</li>
            <li>• Quem já recebeu algo hoje espera o intervalo — só o aniversário passa na frente.</li>
          </ul>
        </div>
      </CfgCard>

      {cfg.manualOverride && (<>

      {/* A — Segurança de envio WhatsApp */}
      <CfgCard
        title="Segurança de envio WhatsApp"
        subtitle="Essas regras evitam excesso de mensagens, reduzem risco de bloqueio e protegem a experiência do cliente."
      >
        <div className="grid gap-5 sm:grid-cols-2">
          <CfgField
            label="Limite diário de mensagens"
            hint="Máximo de mensagens de CRM que podem ser enviadas por dia. 0 = sem limite."
          >
            <input
              type="number" min={0} max={10000}
              value={cfg.dailyGlobalCap}
              onChange={(e) => set("dailyGlobalCap", Math.max(0, parseInt(e.target.value, 10) || 0))}
              className={CFG_INPUT}
            />
          </CfgField>

          <CfgField
            label="Intervalo mínimo por cliente"
            hint="Tempo mínimo entre uma mensagem e outra para o mesmo cliente (em horas)."
          >
            <input
              type="number" min={1} max={720}
              value={cfg.customerCooldownHours}
              onChange={(e) => set("customerCooldownHours", Math.max(1, parseInt(e.target.value, 10) || 24))}
              className={CFG_INPUT}
            />
          </CfgField>

          <CfgField
            label="Máximo por cliente na semana"
            hint="Evita que o mesmo cliente receba mensagens demais em 7 dias. 0 = sem limite."
          >
            <input
              type="number" min={0} max={100}
              value={cfg.maxPerWeekPerCustomer}
              onChange={(e) => set("maxPerWeekPerCustomer", Math.max(0, parseInt(e.target.value, 10) || 0))}
              className={CFG_INPUT}
            />
          </CfgField>
        </div>

        <div className="mt-5 space-y-4 border-t border-line pt-5">
          <CfgToggle
            label="Horário sem envios"
            desc="Bloqueia campanhas durante horários em que o restaurante não quer incomodar clientes."
            checked={cfg.quietHoursEnabled}
            onChange={(v) => set("quietHoursEnabled", v)}
          />

          {cfg.quietHoursEnabled && (
            <div className="grid gap-4 sm:grid-cols-3">
              <CfgField label="Início do bloqueio">
                <input type="time" value={cfg.quietHoursStart} onChange={(e) => set("quietHoursStart", e.target.value)} className={CFG_INPUT} />
              </CfgField>
              <CfgField label="Fim do bloqueio">
                <input type="time" value={cfg.quietHoursEnd} onChange={(e) => set("quietHoursEnd", e.target.value)} className={CFG_INPUT} />
              </CfgField>
              <CfgField label="Fuso horário">
                <select value={cfg.timezone} onChange={(e) => set("timezone", e.target.value)} className={CFG_INPUT}>
                  {TIMEZONES_CRM.map((tz) => <option key={tz.value} value={tz.value}>{tz.label}</option>)}
                </select>
              </CfgField>
            </div>
          )}

          <CfgToggle
            label="Permitir campanhas no fim de semana"
            desc="Desative se o restaurante não atende ou não quer campanhas no sábado e domingo."
            checked={cfg.sendOnWeekends}
            onChange={(v) => set("sendOnWeekends", v)}
          />
        </div>

        {/* Safety summary */}
        <div className="mt-5 rounded-xl border border-blue-100 bg-blue-50 px-4 py-3 text-sm text-blue-800">
          <p className="font-semibold text-blue-700 mb-1">Resumo de segurança</p>
          <p className="text-xs leading-relaxed text-blue-700">
            {cfg.dailyGlobalCap > 0
              ? `O CRM pode enviar até ${cfg.dailyGlobalCap} mensagens por dia`
              : "O CRM pode enviar mensagens sem limite diário"}
            {cfg.maxPerWeekPerCustomer > 0
              ? `, no máximo ${cfg.maxPerWeekPerCustomer} por cliente por semana`
              : ""}
            {`, respeitando ${cfg.customerCooldownHours}h entre mensagens para o mesmo cliente`}
            {cfg.quietHoursEnabled
              ? `. Bloqueio ativo de ${cfg.quietHoursStart} às ${cfg.quietHoursEnd}.`
              : "."}
          </p>
        </div>
      </CfgCard>

      </>)}

      {cfg.manualOverride && (
      /* B — Comportamento gradual (delay) */
      <CfgCard
        title="Comportamento Gradual"
        subtitle="Delay aleatório entre envios para reduzir o risco de bloqueio de número."
      >
        <div className="space-y-4">
          <CfgToggle
            label="Delay aleatório entre envios"
            desc="Insere uma pausa entre cada mensagem do lote, imitando comportamento humano."
            checked={cfg.randomDelayEnabled}
            onChange={(v) => set("randomDelayEnabled", v)}
          />
          {cfg.randomDelayEnabled && (
            <div className="grid gap-4 sm:grid-cols-2">
              <CfgField label="Delay mínimo (segundos)" hint="Mín. 1 s.">
                <input
                  type="number" min={1} max={300}
                  value={cfg.randomDelayMinSec}
                  onChange={(e) => set("randomDelayMinSec", Math.max(1, parseInt(e.target.value, 10) || 5))}
                  className={CFG_INPUT}
                />
              </CfgField>
              <CfgField label="Delay máximo (segundos)" hint="Máx. 300 s.">
                <input
                  type="number" min={1} max={300}
                  value={cfg.randomDelayMaxSec}
                  onChange={(e) => set("randomDelayMaxSec", Math.max(1, parseInt(e.target.value, 10) || 45))}
                  className={CFG_INPUT}
                />
              </CfgField>
            </div>
          )}
        </div>
      </CfgCard>
      )}

      {/* C — Palavras de descadastro */}
      <CfgCard
        title="Palavras de descadastro"
        subtitle="Quando o cliente responder uma dessas palavras, ele sai automaticamente das campanhas."
      >
        <div className="flex flex-wrap gap-2">
          {["SAIR", "PARAR", "CANCELAR", "REMOVER", "NÃO QUERO"].map((word) => (
            <span key={word} className="inline-flex items-center rounded-full bg-red-50 border border-red-200 px-3 py-1 text-xs font-semibold text-red-700">{word}</span>
          ))}
        </div>
        <p className="mt-3 text-xs text-muted">
          A detecção é automática via webhook do WhatsApp. Clientes com opt-out são excluídos de todos os envios futuros de CRM.
          A lista de palavras é gerenciada pela plataforma e não pode ser editada aqui.
        </p>
      </CfgCard>

      {/* Save */}
      <div className="flex justify-end pt-2">
        <button
          type="submit"
          disabled={saving}
          className="rounded-xl bg-brand-600 px-6 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-brand-700 disabled:opacity-50 transition"
        >
          {saving ? "Salvando…" : "Salvar configurações"}
        </button>
      </div>
    </form>
  );
}

// ── Main CRM Component ────────────────────────────────────────────────────────

/** As abas do CRM. Fonte única — a page.tsx importa daqui em vez de recriar. */
export type CrmTab = "overview" | "campanhas" | "migracao" | "cupons" | "conversoes" | "customers" | "programa" | "avaliacoes" | "configuracoes";
type Tab = CrmTab;

const TAB_PARAM_MAP: Record<string, Tab> = {
  "visao-geral":   "overview",
  "campanhas":     "campanhas",
  "migracao":      "migracao",
  "cupons":        "cupons",
  "conversoes":    "conversoes",
  "clientes":      "customers",
  "avaliacoes":    "avaliacoes",
  "configuracoes": "configuracoes",
};

const TAB_URL_MAP: Record<Tab, string> = {
  overview:       "visao-geral",
  campanhas:      "campanhas",
  migracao:       "migracao",
  cupons:         "cupons",
  conversoes:     "conversoes",
  customers:      "clientes",
  programa:       "programa",
  avaliacoes:     "avaliacoes",
  configuracoes:  "configuracoes",
};

export function CRMClient({
  initialCustomers,
  initialCustomersTotal = 0,
  customersPageSize = 20,
  initialOpportunities,
  initialActions = [],
  overviewStats,
  opportunitiesCount,
  reviewLinks = { google: null, ifood: null },
  initialTab,
}: {
  initialCustomers:      CRMCustomer[];
  initialCustomersTotal?: number;
  customersPageSize?:    number;
  initialOpportunities:  Opportunity[];
  initialActions?:       CrmAction[];
  restaurantName:        string;
  overviewStats:         OverviewStats;
  opportunitiesCount:    number;
  reviewLinks?:          { google: string | null; ifood: string | null };
  initialTab?:           Tab;
}) {
  const googleReviewUrl = reviewLinks.google;
  const ifoodReviewUrl  = reviewLinks.ifood;
  const router = useRouter();
  const searchParams = useSearchParams();
  const [tab, setTab] = useState<Tab>(initialTab ?? "overview");

  useEffect(() => {
    const params = new URLSearchParams(searchParams.toString());
    const slug = TAB_URL_MAP[tab];
    if (slug === "visao-geral") {
      params.delete("tab");
    } else {
      params.set("tab", slug);
    }
    const qs = params.toString();
    router.replace(qs ? `?${qs}` : "?", { scroll: false });
  }, [tab]); // eslint-disable-line react-hooks/exhaustive-deps

  const [showImport, setShowImport] = useState(false);
  const [customerFilter, setCustomerFilter] = useState<CRMFilter>("all");

  // ── Overview stats with date filter ────────────────────────────────────────
  const [currentStats, setCurrentStats] = useState<OverviewStats>(overviewStats);
  const [statsLoading, setStatsLoading] = useState(false);
  const [datePreset, setDatePreset] = useState<DateFilterPreset>("today");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo,   setCustomTo]   = useState("");
  const [revenueSummary, setRevenueSummary] = useState<{
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
  } | null>(null);
  const [revenueSummaryLoading, setRevenueSummaryLoading] = useState(false);

  const [topCustomers, setTopCustomers] = useState<import("@/services/crm/CRMService").TopCustomersResult | null>(null);
  const [topCustomersLoading, setTopCustomersLoading] = useState(false);

  // Load initial revenue summary + top customers on mount
  useEffect(() => {
    fetch("/api/crm/revenue-summary")
      .then((r) => (r.ok ? r.json() : null))
      .then((json) => { if (json?.data) setRevenueSummary(json.data); })
      .catch(() => {});
    fetch("/api/crm/top-customers")
      .then((r) => (r.ok ? r.json() : null))
      .then((json) => { if (json?.data) setTopCustomers(json.data); })
      .catch(() => {});
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function handleDateChange(
    preset: DateFilterPreset,
    cfrom?: string,
    cto?: string,
  ) {
    setDatePreset(preset);
    if (cfrom !== undefined) setCustomFrom(cfrom);
    if (cto   !== undefined) setCustomTo(cto);

    if (preset === "custom" && (!cfrom || !cto)) return;

    const now = new Date();
    let fromIso: string | undefined;
    let toIso: string | undefined;

    if (preset !== "total") {
      toIso = now.toISOString();
      if (preset === "today") {
        fromIso = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
      } else if (preset === "week7") {
        fromIso = new Date(now.getTime() - 7 * 86_400_000).toISOString();
      } else if (preset === "week") {
        const day = now.getDay();
        const daysSinceMonday = day === 0 ? 6 : day - 1;
        fromIso = new Date(now.getFullYear(), now.getMonth(), now.getDate() - daysSinceMonday).toISOString();
      } else if (preset === "month") {
        fromIso = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
      } else if (preset === "year") {
        fromIso = new Date(now.getFullYear(), 0, 1).toISOString();
      } else if (preset === "last_month") {
        fromIso = new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString();
        toIso   = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999).toISOString();
      } else {
        fromIso = new Date(cfrom!).toISOString();
        toIso   = new Date(cto!).toISOString();
      }
    }

    const qs = fromIso && toIso ? `?from=${encodeURIComponent(fromIso)}&to=${encodeURIComponent(toIso)}` : "";

    setStatsLoading(true);
    setRevenueSummaryLoading(true);
    setTopCustomersLoading(true);
    try {
      const [statsRes, revenueRes, topRes] = await Promise.all([
        fetch(`/api/crm/overview-stats${qs}`),
        fetch(`/api/crm/revenue-summary${qs}`),
        fetch(`/api/crm/top-customers${qs}`),
      ]);
      if (statsRes.ok) {
        const json = await statsRes.json();
        setCurrentStats(json.data);
      }
      if (revenueRes.ok) {
        const rJson = await revenueRes.json();
        setRevenueSummary(rJson.data);
      }
      if (topRes.ok) {
        const tJson = await topRes.json();
        setTopCustomers(tJson.data);
      }
    } finally {
      setStatsLoading(false);
      setRevenueSummaryLoading(false);
      setTopCustomersLoading(false);
    }
  }

  // Default view is HOJE — the server-rendered stats are all-time, so load
  // today's numbers on mount to match the selected chip.
  useEffect(() => {
    void handleDateChange("today");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Automações recorrentes agora vivem dentro de Campanhas (campanha recorrente).
  // A aba separada foi removida da navegação; o backend de automações segue
  // intacto e as automações já configuradas continuam rodando.
  const tabs: { id: Tab; label: string; badge?: number }[] = [
    { id: "overview",      label: "Visão Geral" },
    { id: "campanhas",     label: "Campanhas" },
    { id: "migracao",      label: "Migração" },
    { id: "cupons",        label: "Cupons" },
    { id: "conversoes",    label: "Conversões" },
    { id: "customers",     label: "Clientes" },
    { id: "programa",      label: "Programa de Relacionamento" },
    { id: "avaliacoes",    label: "Avaliações" },
    { id: "configuracoes", label: "Configurações" },
  ];

  function goToInactive() {
    setCustomerFilter("inactive");
    setTab("customers");
  }

  function goToOpportunities() {
    setTab("campanhas");
  }

  function handleSegmentClick(filter: "quente" | "morno" | "frio" | "perdido" | "novos" | "nao-compraram") {
    const crmFilter: CRMFilter =
      filter === "novos"         ? "firstTime"    :
      filter === "nao-compraram" ? "neverOrdered" :
      filter;
    setCustomerFilter(crmFilter);
    setTab("customers");
  }

  return (
    <div className="min-h-full bg-canvas p-6 lg:p-8">
     <div className="mx-auto max-w-6xl">

      {/* Tabs */}
      <div className="mb-5 flex flex-wrap gap-1 rounded-xl border border-line bg-[#F4F4F2] p-1">
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold transition-all whitespace-nowrap ${
              tab === t.id
                ? "bg-paper shadow-sm text-ink"
                : "text-muted hover:text-ink2"
            }`}
          >
            {t.label}
            {t.badge != null && t.badge > 0 && (
              <span className="rounded-full bg-brand-600 px-1.5 py-0.5 text-[10px] font-bold text-white leading-none">
                {t.badge}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {tab === "overview" && (
        <div className="flex flex-col gap-4">
          <OverviewTab
          stats={currentStats}
          opportunitiesCount={opportunitiesCount}
          actions={initialActions}
          onNavigateToTab={setTab}
          onSegmentClick={handleSegmentClick}
          loading={statsLoading}
          datePreset={datePreset}
          customFrom={customFrom}
          customTo={customTo}
          onDateChange={handleDateChange}
          revenueSummary={revenueSummary}
          revenueSummaryLoading={revenueSummaryLoading}
          topCustomers={topCustomers}
          topCustomersLoading={topCustomersLoading}
          />
        </div>
      )}
      {tab === "campanhas" && (
        <CampanhasTab stats={currentStats} />
      )}
      {tab === "migracao" && (
        <MigracaoTab />
      )}
      {tab === "cupons" && (
        <CuponsTab />
      )}
      {tab === "conversoes" && (
        <ConversoesTab />
      )}
      {tab === "customers" && (
        <CustomersTab
          key={customerFilter}
          initialCustomers={initialCustomers}
          initialTotal={initialCustomersTotal}
          pageSize={customersPageSize}
          initialFilter={customerFilter}
          onImportOpen={() => setShowImport(true)}
          reviewLinks={reviewLinks}
          stats={currentStats}
          statsLoading={statsLoading}
        />
      )}
      {tab === "programa" && (
        <ProgramaTab />
      )}
      {tab === "avaliacoes" && (
        <AvaliacoesTab
          googleReviewUrl={googleReviewUrl}
          ifoodReviewUrl={ifoodReviewUrl}
        />
      )}
      {tab === "configuracoes" && (
        <div>
          <CrmConfiguracoes />
        </div>
      )}
      <ImportModal
        open={showImport}
        onClose={() => setShowImport(false)}
        onComplete={() => { setShowImport(false); router.refresh(); }}
      />
     </div>
    </div>
  );
}

// ─── Recoverable reprocess (live, owner-confirmed safe send) ──────────────────

interface ReprocessPreview {
  plan?:           { recoverableExecutions: number; distinctRecipients: number; duplicatesRemoved: number; cap: number; nextBatchCount: number };
  instance?:       { connected: boolean; state: string | null };
  safeToSend?:     boolean;
  campaignStatus?: string;
}

interface ReprocessRunResult {
  ok:         boolean;
  message?:   string;
  requested:  number;
  sent:       number;
  ignored:    number;
  failed:     number;
  aborted:    boolean;
  recipients: Array<{ customerName: string; phoneMasked: string; status: string; detail: string }>;
}

/**
 * Self-contained panel for the campaign detail: loads the read-only recoverable
 * preview, and (only when safe) lets the owner reprocess the next batch via the
 * confirmed POST. Enables the action ONLY when safeToSend && nextBatch>0 &&
 * instance connected. Sends nothing without an explicit click + confirm.
 */
function RecoverableReprocessPanel({ campaignId, onDone }: { campaignId: string; onDone?: () => void }) {
  const [preview, setPreview] = useState<ReprocessPreview | null>(null);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [result,  setResult]  = useState<ReprocessRunResult | null>(null);
  const [err,     setErr]     = useState<string | null>(null);

  const loadPreview = useCallback(() => {
    setLoading(true);
    fetch(`/api/crm/campaigns/${campaignId}/recoverable`)
      .then((r) => r.ok ? r.json() : Promise.reject())
      .then((json) => setPreview(json.data as ReprocessPreview))
      .catch(() => setPreview(null))
      .finally(() => setLoading(false));
  }, [campaignId]);

  useEffect(() => { loadPreview(); }, [loadPreview]);

  const plan      = preview?.plan;
  const n         = plan?.nextBatchCount ?? 0;
  const connected = preview?.instance?.connected ?? false;
  const canSend   = Boolean(preview?.safeToSend) && n > 0 && connected && !sending;

  async function handleReprocess() {
    if (!canSend) return;
    const confirmed = window.confirm(
      `Reenviar agora para até ${n} cliente(s) com falha temporária recuperável?\n\n` +
      `Modo seguro WhatsApp Web — no máximo ${plan?.cap ?? 5} por vez. Opt-out, telefone inválido e quem já recebeu são ignorados automaticamente.`,
    );
    if (!confirmed) return;
    setSending(true);
    setErr(null);
    try {
      const res = await fetch(`/api/crm/campaigns/${campaignId}/reprocess-recoverable`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ confirm: true }),
      });
      const json = await res.json().catch(() => null);
      const data = (json?.data ?? null) as ReprocessRunResult | null;
      if (res.ok && data) {
        setResult(data);
        loadPreview();
        onDone?.();
      } else {
        setErr(json?.error ?? data?.message ?? "Falha ao reprocessar.");
        if (data) setResult(data);
      }
    } catch {
      setErr("Sem conexão. Tente novamente.");
    } finally {
      setSending(false);
    }
  }

  if (loading) {
    return <div className="rounded-xl border border-line bg-paper px-3 py-2 text-[10px] text-muted">Carregando reenvio seguro…</div>;
  }
  if (!plan || (plan.distinctRecipients === 0 && plan.recoverableExecutions === 0)) return null;

  return (
    <div className="rounded-xl border border-brand-200 bg-brand-50/50 px-3 py-3 space-y-2">
      <p className="text-[10px] font-bold uppercase tracking-widest text-brand-600">Reenvio de falhas recuperáveis</p>
      <div className="flex flex-wrap gap-1.5 text-[10px]">
        <span className="rounded-full bg-paper px-2 py-0.5 font-semibold text-brand-600 border border-brand-200">Recuperáveis: {plan.distinctRecipients}</span>
        {plan.duplicatesRemoved > 0 && (
          <span className="rounded-full bg-paper px-2 py-0.5 font-semibold text-muted border border-line2">Duplicados removidos: {plan.duplicatesRemoved}</span>
        )}
        <span className="rounded-full bg-paper px-2 py-0.5 font-semibold text-brand-600 border border-brand-200">Próximo lote: {n}</span>
        <span className={`rounded-full px-2 py-0.5 font-semibold border ${connected ? "bg-green-50 text-green-700 border-green-200" : "bg-red-50 text-red-600 border-red-200"}`}>
          {connected ? "WhatsApp conectado" : "WhatsApp desconectado"}
        </span>
      </div>

      <button
        type="button"
        disabled={!canSend}
        onClick={() => void handleReprocess()}
        className="rounded-xl bg-brand-500 px-4 py-2 text-xs font-semibold text-white shadow-sm hover:bg-brand-600 disabled:opacity-40 disabled:cursor-not-allowed transition"
      >
        {sending ? "Reprocessando…" : `Reprocessar ${n} agora`}
      </button>
      {!canSend && !sending && (
        <p className="text-[10px] text-muted">
          {n === 0 ? "Nenhuma falha recuperável agora." : !connected ? "Conecte o WhatsApp (instância) para poder reenviar." : "Reenvio indisponível no momento."}
        </p>
      )}

      {err && <p className="rounded-lg bg-red-50 px-3 py-2 text-[10px] text-red-600">{err}</p>}

      {result && (
        <div className="rounded-lg bg-paper px-3 py-2 border border-line space-y-1">
          <p className="text-[10px] font-semibold text-ink2">
            Enviados: <span className="text-green-700">{result.sent}</span> · Ignorados: <span className="text-amber-700">{result.ignored}</span> · Falhas: <span className="text-red-600">{result.failed}</span>
            {result.aborted ? " · ⚠️ interrompido (instância caiu)" : ""}
          </p>
          {result.message && <p className="text-[10px] text-muted">{result.message}</p>}
          {result.recipients.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {result.recipients.map((r, i) => (
                <span key={i} className={`rounded-full px-1.5 py-0.5 text-[9px] font-medium ${r.status === "SENT" ? "bg-green-50 text-green-700" : r.status === "FAILED" ? "bg-red-50 text-red-600" : "bg-[#F4F4F2] text-muted"}`}>
                  {(r.customerName || r.phoneMasked)}: {r.status}
                </span>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
