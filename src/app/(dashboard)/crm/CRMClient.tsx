"use client";

import { useState, useCallback, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import type { CRMCustomer, Opportunity, CustomerTier, OverviewStats } from "@/services/crm/CRMService";
import type { CrmAction } from "@/services/crm/CrmActionCenterService";
import { ImportModal } from "./ImportModal";
import { OverviewTab, type DateFilterPreset } from "./OverviewTab";
import { ProgramaTab } from "./ProgramaTab";
import { ReviewRequestModal } from "./ReviewRequestModal";
import { NewCustomerButton } from "@/app/(dashboard)/customers/NewCustomerButton";
import { isGuestIdentifier } from "@/lib/guest";

// ── Label maps ─────────────────────────────────────────────────────────────────

const TIER_CONFIG: Record<CustomerTier, { label: string; bg: string; text: string; icon: string }> = {
  DIAMANTE: { label: "Diamante", bg: "bg-cyan-100",   text: "text-cyan-700",   icon: "💎" },
  OURO:     { label: "Ouro",     bg: "bg-amber-100",  text: "text-amber-700",  icon: "🥇" },
  PRATA:    { label: "Prata",    bg: "bg-gray-200",   text: "text-gray-700",   icon: "🥈" },
  BRONZE:   { label: "Bronze",   bg: "bg-orange-100", text: "text-orange-700", icon: "🥉" },
};

const PRIORITY_CONFIG: Record<string, { label: string; dot: string }> = {
  HIGH:   { label: "Alta",  dot: "bg-red-500"    },
  MEDIUM: { label: "Média", dot: "bg-yellow-500"  },
  LOW:    { label: "Baixa", dot: "bg-green-500"   },
};

const CUSTOMER_FILTER_LABELS: Record<string, string> = {
  all:           "Todos os clientes",
  quente:        "🔥 Quentes (≤30d)",
  morno:         "🌡️ Mornos (31–60d)",
  frio:          "🥶 Frios (60d+)",
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
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div
        className="w-full max-w-lg rounded-2xl bg-white shadow-xl overflow-hidden flex flex-col max-h-[90vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 shrink-0">
          <div>
            <h2 className="text-base font-bold text-gray-900">Salvar modelo de mensagem</h2>
            <p className="text-xs text-gray-500 mt-0.5">Rascunho — não envia mensagens automaticamente</p>
          </div>
          <button onClick={onClose} className="rounded-full p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-colors">
            <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Body — scrollable */}
        <div className="overflow-y-auto p-5 space-y-4 flex-1">

          {/* 1. Nome */}
          <div>
            <label className="mb-1 block text-xs font-semibold text-gray-700">
              Nome da ação <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ex: Reativação de clientes do almoço"
              className={`w-full rounded-xl border px-3 py-2.5 text-sm text-gray-800 focus:outline-none focus:ring-2 transition ${
                errors.name ? "border-red-300 focus:ring-red-100" : "border-gray-200 focus:border-brand-400 focus:ring-brand-100"
              }`}
            />
            {errors.name && <p className="mt-1 text-xs text-red-500">{errors.name}</p>}
          </div>

          {/* 2. Objetivo */}
          <div>
            <label className="mb-1 block text-xs font-semibold text-gray-700">
              Objetivo <span className="text-red-500">*</span>
            </label>
            <select
              value={objective}
              onChange={(e) => setObjective(e.target.value)}
              className={`w-full rounded-xl border px-3 py-2.5 text-sm text-gray-800 bg-white focus:outline-none focus:ring-2 transition ${
                errors.objective ? "border-red-300 focus:ring-red-100" : "border-gray-200 focus:border-brand-400 focus:ring-brand-100"
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
            <label className="mb-1 block text-xs font-semibold text-gray-700">
              Público-alvo / Segmento <span className="text-red-500">*</span>
            </label>
            <select
              value={targetSegment}
              onChange={(e) => setTargetSegment(e.target.value)}
              className={`w-full rounded-xl border px-3 py-2.5 text-sm text-gray-800 bg-white focus:outline-none focus:ring-2 transition ${
                errors.targetSegment ? "border-red-300 focus:ring-red-100" : "border-gray-200 focus:border-brand-400 focus:ring-brand-100"
              }`}
            >
              <option value="">Selecione um segmento</option>
              {Object.entries(SEGMENT_LABELS).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </select>
            {errors.targetSegment && <p className="mt-1 text-xs text-red-500">{errors.targetSegment}</p>}
            {targetSegment && (
              <p className="mt-1.5 text-[11px] text-gray-500">
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
            <label className="mb-1 block text-xs font-semibold text-gray-700">Canal</label>
            <div className="flex gap-2">
              {Object.entries(CHANNEL_LABELS).map(([k, v]) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => setChannel(k)}
                  className={`flex-1 rounded-xl border py-2 text-xs font-semibold transition-colors ${
                    channel === k
                      ? "border-brand-400 bg-brand-50 text-brand-700"
                      : "border-gray-200 bg-white text-gray-600 hover:bg-gray-50"
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
              <label className="text-xs font-semibold text-gray-700">
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
              className={`w-full rounded-xl border px-3 py-2.5 text-sm text-gray-800 resize-none focus:outline-none focus:ring-2 transition ${
                errors.message ? "border-red-300 focus:ring-red-100" : "border-gray-200 focus:border-brand-400 focus:ring-brand-100"
              }`}
            />
            {errors.message && <p className="mt-1 text-xs text-red-500">{errors.message}</p>}
            <div className="mt-1.5 flex flex-wrap gap-1">
              {VARIABLE_HINTS.map((v) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => setMessage((m) => m + v)}
                  className="rounded bg-gray-100 px-1.5 py-0.5 font-mono text-[10px] text-gray-600 hover:bg-gray-200 transition-colors"
                >
                  {v}
                </button>
              ))}
              <span className="ml-1 text-[10px] text-gray-400">clique para inserir variável</span>
            </div>
          </div>

          {/* 6. Observações internas */}
          <div>
            <label className="mb-1 block text-xs font-semibold text-gray-700">
              Observações internas <span className="font-normal text-gray-400">(opcional)</span>
            </label>
            <textarea
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Notas para sua equipe — não aparecem para o cliente"
              className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm text-gray-800 resize-none focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-100 transition"
            />
          </div>

          {/* 7. Status info */}
          <div className="flex items-start gap-2 rounded-xl bg-amber-50 border border-amber-100 px-3 py-2.5">
            <span className="rounded-full bg-gray-200 px-2.5 py-0.5 text-xs font-bold text-gray-600 shrink-0">Rascunho</span>
            <p className="text-xs text-amber-700">
              Salvo como modelo. Para enviar mensagens, crie uma <strong>Campanha</strong> — única ou recorrente.
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className="flex gap-2 border-t border-gray-100 px-5 py-4 shrink-0">
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="flex-1 rounded-xl border border-gray-200 py-2.5 text-sm font-semibold text-gray-600 hover:bg-gray-50 disabled:opacity-50 transition-colors"
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
  PRATA:    { bg: "bg-gray-200",   text: "text-gray-700",   icon: "🥈" },
  BRONZE:   { bg: "bg-orange-100", text: "text-orange-700", icon: "🥉" },
};

const SEGMENT_BADGE: Record<string, { bg: string; text: string; label: string }> = {
  QUENTE:      { bg: "bg-red-100",    text: "text-red-700",    label: "Quente"   },
  MORNO:       { bg: "bg-amber-100",  text: "text-amber-700",  label: "Morno"    },
  FRIO:        { bg: "bg-blue-100",   text: "text-blue-700",   label: "Frio"     },
  PERDIDO:     { bg: "bg-purple-100", text: "text-purple-700", label: "Perdido"  },
  SEM_PEDIDOS: { bg: "bg-gray-100",   text: "text-gray-500",   label: "Sem pedidos" },
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
  DRAFT:              { label: "Rascunho",           bg: "bg-gray-100",    text: "text-gray-600"   },
  READY_TO_CONFIGURE: { label: "Pronta p/ configurar", bg: "bg-green-100", text: "text-green-700" },
  COMING_SOON:        { label: "Em breve",           bg: "bg-yellow-100",  text: "text-yellow-700" },
  NEEDS_DATA:         { label: "Precisa de dados",   bg: "bg-gray-100",    text: "text-gray-500"   },
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
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div
        className="w-full max-w-lg rounded-2xl bg-white shadow-xl overflow-hidden flex flex-col max-h-[90vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-3 px-5 py-4 border-b border-gray-100 shrink-0">
          <div className="flex items-center gap-3">
            <span className="text-2xl">{template.emoji}</span>
            <div>
              <h2 className="text-base font-bold text-gray-900">{template.title}</h2>
              <p className="text-xs text-gray-500">{template.objective}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="shrink-0 rounded-full p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-colors"
          >
            <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="p-5 space-y-4 overflow-y-auto flex-1">
          {/* Campaign name */}
          <div>
            <label className="mb-1 block text-xs font-semibold text-gray-700">
              Nome da campanha <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={campaignName}
              onChange={(e) => setCampaignName(e.target.value)}
              placeholder="Ex: Reativação frios — PROMO10"
              maxLength={120}
              className="w-full rounded-xl border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm text-gray-800 focus:border-brand-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-brand-100 transition"
            />
            <p className="mt-1 text-[10px] text-gray-400">
              Use um nome fácil para identificar depois nos relatórios.
            </p>
          </div>

          {/* Info grid */}
          <div className="grid grid-cols-2 gap-3">
            {isCustom ? (
              <div className="col-span-2">
                <label className="block text-[10px] font-semibold uppercase tracking-wide text-gray-400 mb-1.5">
                  Público alvo
                </label>
                <select
                  value={customAudienceId}
                  onChange={(e) => setCustomAudienceId(e.target.value)}
                  className="w-full rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-800 focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-100"
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
              <div className="rounded-xl bg-gray-50 px-3 py-2.5">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">Segmento alvo</p>
                <p className="mt-0.5 text-sm font-semibold text-gray-800">{template.targetLabel}</p>
              </div>
            )}
            <div className={`rounded-xl bg-gray-50 px-3 py-2.5 ${isCustom ? "col-span-2" : ""}`}>
              <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">Canal</p>
              <div className="mt-0.5 flex items-center gap-1.5">
                <p className="text-sm font-semibold text-gray-800">WhatsApp</p>
                <span className="rounded-full bg-green-100 px-1.5 py-0.5 text-[9px] font-bold uppercase text-green-700">ativo</span>
              </div>
            </div>
          </div>

          {/* Audience counts — the key fix */}
          {(template.hasAudienceQuery || (isCustom && !!customAudienceId)) && (
            <div className="rounded-xl border border-gray-100 bg-gray-50 px-4 py-3 space-y-2">
              <p className="text-[10px] font-bold uppercase tracking-wide text-gray-400">Público estimado</p>
              {loadingAudience ? (
                <p className="text-xs text-gray-400">Calculando…</p>
              ) : !audience ? null : !audience.computed ? (
                <p className="text-xs text-gray-500">
                  {audience.totalSegmentCount != null && audience.totalSegmentCount > 0
                    ? `${audience.totalSegmentCount} clientes no segmento — dados de contato ainda não disponíveis para esta ação.`
                    : "Dados insuficientes para calcular o público desta ação."}
                </p>
              ) : (
                <>
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-gray-600">No segmento</span>
                    <span className="font-bold text-gray-900">{audience.totalSegmentCount ?? audience.count}</span>
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
                      <p className="text-[10px] text-gray-400 border-t border-gray-200 pt-1.5 mt-0.5">
                        {excluded} excluído{excluded !== 1 ? "s" : ""}: {reasons.join(", ")}
                      </p>
                    );
                  })()}
                </>
              )}
            </div>
          )}

          {/* Customer preview list — only when computed and has eligible customers */}
          {(template.hasAudienceQuery || (isCustom && !!customAudienceId)) && audience?.computed && (audience.eligibleCount ?? audience.count) > 0 && (
            <div>
              <p className="mb-2 text-[10px] font-bold uppercase tracking-wide text-gray-400">
                Prévia do público elegível
              </p>
              {loadingAudience ? (
                <div className="py-4 text-center text-xs text-gray-400">Carregando clientes…</div>
              ) : audience.customers.length === 0 ? (
                <div className="rounded-xl bg-gray-50 px-4 py-3 text-xs text-gray-500">
                  Nenhum cliente elegível no momento.
                </div>
              ) : (
                <div className="max-h-48 overflow-y-auto space-y-1.5 rounded-xl border border-gray-100 p-2">
                  {audience.customers.map((c) => {
                    const tierCfg = TIER_BADGE[c.tier] ?? { bg: "bg-orange-100", text: "text-orange-700", icon: "🥉" };
                    const segCfg  = SEGMENT_BADGE[c.segment] ?? { bg: "bg-gray-100", text: "text-gray-500", label: "—" };
                    return (
                      <div key={c.id} className="flex items-center gap-2 rounded-lg bg-gray-50 px-2.5 py-2">
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-semibold text-gray-900 truncate">{c.name}</p>
                          <p className="text-[10px] text-gray-400">{c.phone}</p>
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
                          <p className="text-[10px] font-semibold text-gray-700">
                            R${c.totalSpend.toLocaleString("pt-BR", { minimumFractionDigits: 0 })}
                          </p>
                          <p className="text-[10px] text-gray-400">{c.totalOrders} pedidos</p>
                        </div>
                      </div>
                    );
                  })}
                  {(audience.eligibleCount ?? audience.count) > audience.customers.length && (
                    <p className="text-center text-[10px] text-gray-400 py-1">
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
              <p className="text-xs font-semibold text-gray-600">
                Mensagem sugerida
                <span className="ml-1 font-normal text-gray-400">(edite à vontade)</span>
              </p>
            </div>
            <textarea
              rows={5}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              className="w-full rounded-xl border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm text-gray-800 focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-100 resize-none"
            />
            <p className="mt-1 text-[10px] text-gray-400">
              Use <code className="bg-gray-100 px-1 rounded">{"{nome}"}</code> para inserir o nome do cliente automaticamente.
            </p>
          </div>

          {/* Coupon attribution link (optional) */}
          <div>
            <label className="mb-1 block text-xs font-semibold text-gray-700">
              Cupom vinculado{" "}
              <span className="font-normal text-gray-400">(opcional — para relatório de atribuição)</span>
            </label>
            <input
              type="text"
              value={linkedCouponCode}
              onChange={(e) => setLinkedCouponCode(e.target.value.toUpperCase())}
              placeholder="Ex: PROMO10"
              maxLength={40}
              className="w-full rounded-xl border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm text-gray-800 uppercase focus:border-brand-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-brand-100 transition"
            />
            <p className="mt-1 text-[10px] text-gray-400">
              Se esta campanha usa um cupom, vincule-o aqui para ver a receita comprovada nos relatórios.
            </p>
          </div>

          {/* Governance: identity + anti-spam dedupe */}
          <div className="rounded-xl border border-gray-200 bg-gray-50 p-3">
            <p className="text-[11px] font-bold uppercase tracking-wide text-gray-500">Identidade & evitar repetição</p>
            <label className="mt-2 block text-[11px] font-semibold text-gray-700">
              Identidade da campanha
              <input
                type="text"
                value={familyKey}
                onChange={(e) => setFamilyKey(e.target.value)}
                placeholder="ex: pascoa-2026 (sugerido pelo nome)"
                className="mt-1 w-full rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-xs lowercase focus:border-brand-400 focus:outline-none"
              />
            </label>
            <p className="mt-1 text-[10px] text-gray-400">Use para não reenviar a mesma campanha/conceito a quem já foi impactado — mesmo se a campanha for recriada.</p>
            <div className="mt-2 space-y-1.5">
              <label className="flex items-center gap-2 text-[11px] text-gray-700">
                <input type="checkbox" checked={dedupeByConcept} onChange={(e) => setDedupeByConcept(e.target.checked)} /> Não reenviar para quem já recebeu esta campanha/conceito
              </label>
              <label className="flex items-center gap-2 text-[11px] text-gray-700">
                <input type="checkbox" checked={dedupeByMessage} onChange={(e) => setDedupeByMessage(e.target.checked)} /> Não reenviar mensagem igual ou parecida
              </label>
              <label className="flex items-center gap-2 text-[11px] text-gray-700">
                Janela de dedupe (dias)
                <input type="number" min={0} value={dedupeWindowDays} onChange={(e) => setDedupeWindowDays(Math.max(0, parseInt(e.target.value) || 0))}
                  className="w-20 rounded border border-gray-200 px-2 py-1 text-xs" />
              </label>
              <label className="flex items-center gap-2 text-[11px] text-amber-700">
                <input type="checkbox" checked={allowResend} onChange={(e) => setAllowResend(e.target.checked)} /> Permitir reenviar para já impactados (use com cuidado)
              </label>
            </div>
          </div>

          {/* Scheduling section */}
          <div className="rounded-xl border border-gray-100 bg-gray-50 px-4 py-3 space-y-3">
              <p className="text-[10px] font-bold uppercase tracking-wide text-gray-400">Tipo de campanha</p>

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
                          : "bg-white text-gray-600 border-gray-200 hover:bg-gray-50"
                      }`}
                    >
                      {labels[mode]}
                    </button>
                  );
                })}
              </div>

              {/* Friendly explainer per type */}
              <p className="text-[11px] text-gray-500">
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
                    <label className="block text-[10px] font-semibold text-gray-500 mb-1">Data</label>
                    <input
                      type="date"
                      value={scheduleDate}
                      min={new Date().toISOString().split("T")[0]}
                      onChange={(e) => setScheduleDate(e.target.value)}
                      className="w-full rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-xs text-gray-800 focus:border-brand-400 focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-semibold text-gray-500 mb-1">Hora</label>
                    <input
                      type="time"
                      value={scheduleTime}
                      onChange={(e) => setScheduleTime(e.target.value)}
                      className="w-full rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-xs text-gray-800 focus:border-brand-400 focus:outline-none"
                    />
                  </div>
                </div>
              )}

              {/* Recurring: full config */}
              {sendMode === "recurring" && (
                <div className="space-y-3 pt-1">
                  {/* Weekdays */}
                  <div>
                    <label className="block text-[10px] font-semibold text-gray-500 mb-1.5">Dias da semana</label>
                    <div className="flex gap-1">
                      {WEEKDAY_LABELS.map((label, day) => (
                        <button
                          key={day}
                          onClick={() => toggleWeekday(day)}
                          className={`flex-1 rounded-lg py-1.5 text-[10px] font-bold border transition-colors ${
                            weekdays.includes(day)
                              ? "bg-brand-600 text-white border-brand-600"
                              : "bg-white text-gray-500 border-gray-200 hover:bg-gray-50"
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
                      <label className="block text-[10px] font-semibold text-gray-500 mb-1">Horário início</label>
                      <input
                        type="time"
                        value={timeWindowStart}
                        onChange={(e) => setTimeWindowStart(e.target.value)}
                        className="w-full rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-xs text-gray-800 focus:border-brand-400 focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] font-semibold text-gray-500 mb-1">Horário fim</label>
                      <input
                        type="time"
                        value={timeWindowEnd}
                        onChange={(e) => setTimeWindowEnd(e.target.value)}
                        className="w-full rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-xs text-gray-800 focus:border-brand-400 focus:outline-none"
                      />
                    </div>
                  </div>

                  {/* Daily limit */}
                  <div>
                    <label className="block text-[10px] font-semibold text-gray-500 mb-1">
                      Limite diário <span className="font-normal text-gray-400">(1–200)</span>
                    </label>
                    <input
                      type="number"
                      min={1}
                      max={200}
                      value={dailyLimit}
                      onChange={(e) => setDailyLimit(Math.max(1, Math.min(200, parseInt(e.target.value) || 1)))}
                      className="w-full rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-xs text-gray-800 focus:border-brand-400 focus:outline-none"
                    />
                    <p className="mt-1 text-[10px] text-gray-400">Ritmo da campanha. O envio real também respeita o orçamento global do restaurante e o limite por cliente.</p>
                  </div>

                  {/* Priority */}
                  <div>
                    <label className="block text-[10px] font-semibold text-gray-500 mb-1">Prioridade</label>
                    <select
                      value={priority}
                      onChange={(e) => setPriority(e.target.value as "LOW" | "NORMAL" | "HIGH" | "CRITICAL")}
                      className="w-full rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-xs text-gray-800 focus:border-brand-400 focus:outline-none"
                    >
                      <option value="LOW">Baixa</option>
                      <option value="NORMAL">Normal</option>
                      <option value="HIGH">Alta (aniversário, pós-pedido, reativação)</option>
                      <option value="CRITICAL">Crítica (urgente)</option>
                    </select>
                    <p className="mt-1 text-[10px] text-gray-400">Na previsão de capacidade, campanhas de prioridade alta recebem orçamento primeiro.</p>
                  </div>

                  {/* Priority override */}
                  <label className="flex items-start gap-2 rounded-lg border border-gray-100 bg-gray-50 px-2.5 py-2">
                    <input type="checkbox" checked={allowWeeklyOverride} onChange={(e) => setAllowWeeklyOverride(e.target.checked)} className="mt-0.5" />
                    <span className="text-[10px] text-gray-600">
                      <strong className="text-gray-800">Permitir envio prioritário acima do limite semanal por cliente.</strong> Use apenas para campanhas importantes (ex.: aniversário).
                      Ainda respeita opt-out, telefone válido, janela de envio, quiet hours, dedupe e limite global do restaurante.
                    </span>
                  </label>

                  {/* End condition */}
                  <div>
                    <label className="block text-[10px] font-semibold text-gray-500 mb-1">Condição de término</label>
                    <select
                      value={endCondition}
                      onChange={(e) => setEndCondition(e.target.value as EndCondition)}
                      className="w-full rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-xs text-gray-800 focus:border-brand-400 focus:outline-none"
                    >
                      <option value="AUDIENCE_EXHAUSTED">Até acabar o público</option>
                      <option value="END_DATE">Até uma data final</option>
                      <option value="MAX_TOTAL">Até número máximo de envios</option>
                    </select>
                  </div>

                  {endCondition === "END_DATE" && (
                    <div>
                      <label className="block text-[10px] font-semibold text-gray-500 mb-1">Data final</label>
                      <input
                        type="date"
                        value={endDate}
                        min={new Date().toISOString().split("T")[0]}
                        onChange={(e) => setEndDate(e.target.value)}
                        className="w-full rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-xs text-gray-800 focus:border-brand-400 focus:outline-none"
                      />
                    </div>
                  )}

                  {endCondition === "MAX_TOTAL" && (
                    <div>
                      <label className="block text-[10px] font-semibold text-gray-500 mb-1">Máximo total de envios</label>
                      <input
                        type="number"
                        min={1}
                        value={maxTotal}
                        onChange={(e) => setMaxTotal(Math.max(1, parseInt(e.target.value) || 1))}
                        className="w-full rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-xs text-gray-800 focus:border-brand-400 focus:outline-none"
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
        <div className="flex gap-2 border-t border-gray-100 px-5 py-4 shrink-0">
          <button
            onClick={copyMessage}
            className={`rounded-xl px-4 py-2.5 text-sm font-semibold transition-colors ${
              copied
                ? "bg-green-100 text-green-700"
                : "border border-gray-200 bg-white text-gray-700 hover:bg-gray-50"
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
              className="flex-1 cursor-not-allowed rounded-xl bg-gray-100 py-2.5 text-sm font-semibold text-gray-400"
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
  DRAFT:     { bg: "bg-gray-100",   text: "text-gray-600"   },
  SCHEDULED: { bg: "bg-amber-100",  text: "text-amber-700"  },
  ACTIVE:    { bg: "bg-green-100",  text: "text-green-700"  },
  SENDING:   { bg: "bg-blue-100",   text: "text-blue-700"   },
  SENT:      { bg: "bg-green-100",  text: "text-green-700"  },
  PAUSED:    { bg: "bg-yellow-100", text: "text-yellow-700" },
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
  } | null>(null);

  useEffect(() => {
    fetch("/api/settings/crm-safety")
      .then((r) => r.json())
      .then((j) => { if (j?.data) setSafety(j.data); })
      .catch(() => {});
  }, []);

  // For manual sends: cap to remaining global daily capacity (dailyGlobalCap - todaySent).
  // 0 dailyGlobalCap means no cap configured.
  const effectiveMax = safety?.dailyGlobalCap && safety.dailyGlobalCap > 0
    ? Math.max(0, safety.dailyGlobalCap - (safety.todaySent ?? 0))
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
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div
        className="w-full max-w-2xl rounded-2xl bg-white shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 shrink-0">
          <div>
            <h2 className="text-base font-bold text-gray-900">Revisar e enviar</h2>
            <p className={`text-xs mt-0.5 ${active.length > effectiveMax ? "text-yellow-600 font-semibold" : "text-gray-500"}`}>
              {active.length} destinatário{active.length !== 1 ? "s" : ""}
              {active.length > effectiveMax
                ? effectiveMax === 0
                  ? " · ⚠️ limite diário atingido"
                  : ` · ⚠️ acima do limite diário restante (${effectiveMax})`
                : " · Canal: WhatsApp"}
            </p>
          </div>
          <button onClick={onClose} className="rounded-full p-1.5 text-gray-400 hover:bg-gray-100 transition-colors">
            <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Result state */}
        {result ? (
          <div className="flex flex-col items-center justify-center gap-3 px-6 py-12 text-center">
            <span className="text-4xl">{result.totalFailed === 0 ? "✅" : result.totalSent === 0 ? "❌" : "⚠️"}</span>
            <p className="text-base font-bold text-gray-900">
              {result.totalSent} enviada{result.totalSent !== 1 ? "s" : ""}
              {result.totalFailed > 0 ? ` · ${result.totalFailed} falha${result.totalFailed !== 1 ? "s" : ""}` : ""}
            </p>
            <p className="text-sm text-gray-500">
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
                  {safety.dailyGlobalCap > 0 && (
                    <span>
                      Limite diário: {safety.dailyGlobalCap} msg
                      {safety.todaySent > 0 && ` · ${Math.max(0, safety.dailyGlobalCap - safety.todaySent)} restantes hoje`}
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
              <div className="border-b border-yellow-100 bg-yellow-50 px-5 py-3 flex items-center justify-between gap-3 shrink-0">
                <p className="text-xs text-yellow-800">
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
                <p className="text-center text-sm text-gray-400 py-8">Nenhum destinatário selecionado.</p>
              ) : active.map((r) => (
                <div key={r.id} className="rounded-xl border border-gray-100 bg-gray-50 p-3">
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-xs font-bold text-gray-900 truncate">{r.customerName}</p>
                      <p className="text-[10px] text-gray-400">{r.customerPhone}</p>
                    </div>
                    <button
                      onClick={() => setRemoved((prev) => new Set([...prev, r.id]))}
                      className="shrink-0 rounded-lg border border-gray-200 px-2 py-1 text-[10px] font-semibold text-gray-500 hover:bg-red-50 hover:border-red-200 hover:text-red-600 transition-colors"
                    >
                      Remover
                    </button>
                  </div>
                  <textarea
                    rows={3}
                    value={messages[r.id] ?? r.messageText}
                    onChange={(e) => setMessages((prev) => ({ ...prev, [r.id]: e.target.value }))}
                    className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs text-gray-800 focus:border-brand-400 focus:outline-none focus:ring-1 focus:ring-brand-100 resize-none"
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
            <div className="border-t border-gray-100 px-5 py-4 shrink-0 flex gap-2">
              <button
                onClick={onClose}
                className="rounded-xl border border-gray-200 px-4 py-2.5 text-sm font-semibold text-gray-600 hover:bg-gray-50 transition-colors"
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
  PENDING:   { bg: "bg-gray-100",   text: "text-gray-600"  },
  SENT:      { bg: "bg-blue-50",    text: "text-blue-700"  },
  DELIVERED: { bg: "bg-blue-100",   text: "text-blue-700"  },
  READ:      { bg: "bg-indigo-50",  text: "text-indigo-700"},
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

// ── CampaignManageModal ───────────────────────────────────────────────────────
// Tabbed management console: Visão Geral | Mensagem | Agendamento | Performance | Diagnóstico

type ManageTab = "overview" | "message" | "schedule" | "performance" | "diagnostics";

function CampaignManageModal({
  detailId,
  onClose,
  onCampaignAction,
  onCampaignUpdated,
}: {
  detailId: string;
  onClose: () => void;
  onCampaignAction: (id: string, action: "pause" | "resume" | "cancel") => Promise<void>;
  onCampaignUpdated?: (id: string, updates: Partial<CampaignHistoryRow>) => void;
}) {
  const [activeTab,    setActiveTab]    = useState<ManageTab>("overview");
  const [detail,       setDetail]       = useState<CampaignDetail | null>(null);
  const [loading,      setLoading]      = useState(true);
  const [error,        setError]        = useState(false);
  const [debug,        setDebug]        = useState<CampaignDebugResult | null>(null);
  const [loadingDebug, setLoadingDebug] = useState(false);
  const [preflight,    setPreflight]    = useState<PreflightResult | null>(null);

  // Edit – name
  const [editName,    setEditName]    = useState("");
  const [savingName,  setSavingName]  = useState(false);
  const [nameSaved,   setNameSaved]   = useState(false);

  // Edit – message
  const [msgText,   setMsgText]   = useState("");
  const [savingMsg, setSavingMsg] = useState(false);
  const [msgSaved,  setMsgSaved]  = useState(false);

  // Edit – schedule
  const [editWd,      setEditWd]      = useState<number[]>([]);
  const [editStart,   setEditStart]   = useState("08:00");
  const [editEnd,     setEditEnd]     = useState("20:00");
  const [editLimit,   setEditLimit]   = useState(20);
  const [savingSched, setSavingSched] = useState(false);
  const [schedSaved,  setSchedSaved]  = useState(false);

  useEffect(() => {
    setLoading(true);
    setError(false);
    setDebug(null);
    setMsgSaved(false);
    setSchedSaved(false);
    setNameSaved(false);
    setActiveTab("overview");

    fetch(`/api/crm/campaigns/${detailId}`)
      .then((r) => r.ok ? r.json() : Promise.reject())
      .then((json) => {
        const d = json.data as CampaignDetail;
        setDetail(d);
        setMsgText(d.message ?? "");
        setEditName(d.name ?? "");
        const cfg = d.scheduleConfig as ScheduleCfg | null;
        if (cfg) {
          setEditWd(cfg.weekdays ?? []);
          setEditStart(cfg.timeWindow?.start ?? "08:00");
          setEditEnd(cfg.timeWindow?.end ?? "20:00");
          setEditLimit(cfg.dailyLimit ?? 20);
        }
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
  }, [detailId]);

  const sc           = detail ? (CAMPAIGN_STATUS_COLORS[detail.status] ?? { bg: "bg-gray-100", text: "text-gray-600" }) : null;
  const cfg          = detail?.scheduleConfig as ScheduleCfg | null | undefined;
  const isRecurring  = cfg?.mode === "RECURRING";
  const isControllable = isRecurring && detail && ["ACTIVE", "SCHEDULED", "PAUSED"].includes(detail.status);
  const isTerminal   = ["SENT", "COMPLETED", "CANCELLED"].includes(detail?.status ?? "");
  const canEdit      = !isTerminal;

  const responseRate = detail && detail.totalSent > 0
    ? ((detail.totalResponded / detail.totalSent) * 100).toFixed(1) : null;
  const convRate     = detail && detail.totalSent > 0
    ? ((detail.totalConverted / detail.totalSent) * 100).toFixed(1) : null;

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

  async function handleSaveMessage() {
    if (!detail || !msgText.trim() || msgText.trim() === detail.message) return;
    setSavingMsg(true);
    try {
      const res = await fetch(`/api/crm/campaigns/${detail.id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: msgText.trim() }),
      });
      if (res.ok) {
        setDetail((p) => p ? { ...p, message: msgText.trim() } : p);
        setMsgSaved(true);
        setTimeout(() => setMsgSaved(false), 3000);
      }
    } finally { setSavingMsg(false); }
  }

  async function handleSaveSchedule() {
    if (!detail || !isRecurring) return;
    setSavingSched(true);
    try {
      const newCfg = { ...(cfg ?? {}), weekdays: editWd, timeWindow: { start: editStart, end: editEnd }, dailyLimit: editLimit };
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
      <div className="fixed inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />

      {/* Modal card */}
      <div className="relative min-h-full flex items-start justify-center p-0 sm:p-4 sm:py-6">
        <div className="relative w-full bg-white shadow-2xl sm:rounded-3xl sm:max-w-4xl overflow-hidden">

          {/* ── Sticky header + tab bar ── */}
          <div className="sticky top-0 z-10 border-b border-gray-100 bg-white">
            <div className="flex items-center justify-between px-5 py-4 sm:px-8">
              <div className="min-w-0 pr-4">
                <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400">Gerenciar campanha</p>
                <h2 className="mt-0.5 text-base font-bold text-gray-900 truncate">
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
                        className="rounded-xl bg-yellow-50 px-3 py-1.5 text-xs font-semibold text-yellow-700 hover:bg-yellow-100 transition-colors"
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
                <button onClick={onClose} className="rounded-xl p-2 text-gray-400 hover:bg-gray-100 transition-colors">
                  <svg className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>

            {/* Tab bar */}
            <div className="flex overflow-x-auto border-t border-gray-100 px-5 sm:px-8 [&::-webkit-scrollbar]:hidden" style={{ scrollbarWidth: "none" }}>
              {TABS.filter((t) => !t.hidden).map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`shrink-0 border-b-2 px-4 py-2.5 text-xs font-semibold transition-colors ${
                    activeTab === tab.id
                      ? "border-brand-600 text-brand-700"
                      : "border-transparent text-gray-500 hover:text-gray-700"
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>

          {/* ── Body ── */}
          <div className="px-5 py-6 sm:px-8 sm:py-8">
            {loading && <div className="flex items-center justify-center py-20 text-sm text-gray-400">Carregando campanha…</div>}
            {error   && <div className="flex items-center justify-center py-20 text-sm text-red-500">Erro ao carregar. Tente novamente.</div>}

            {detail && !loading && (
              <>
                {/* ── Visão Geral ── */}
                {activeTab === "overview" && (
                  <div className="space-y-6">
                    {/* Badges */}
                    <div className="flex flex-wrap gap-2">
                      {sc && <span className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold ${sc.bg} ${sc.text}`}>{CAMPAIGN_STATUS_LABELS[detail.status] ?? detail.status}</span>}
                      {isRecurring && <span className="rounded-full bg-purple-50 px-2 py-0.5 text-[10px] font-semibold text-purple-700">Recorrente</span>}
                      {detail.objective && <span className="rounded-full bg-gray-200 px-2 py-0.5 text-[10px] font-semibold text-gray-600">{OBJECTIVE_LABELS[detail.objective] ?? detail.objective}</span>}
                      {detail.targetSegment && <span className="rounded-full bg-gray-200 px-2 py-0.5 text-[10px] font-semibold text-gray-600">{SEGMENT_LABELS[detail.targetSegment] ?? detail.targetSegment}</span>}
                    </div>

                    {/* Dates */}
                    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 text-xs">
                      <div>
                        <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">Canal</p>
                        <p className="text-gray-700 mt-0.5">{CHANNEL_LABELS[detail.channel] ?? detail.channel}</p>
                      </div>
                      <div>
                        <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">Criada em</p>
                        <p className="text-gray-700 mt-0.5">{new Date(detail.createdAt).toLocaleDateString("pt-BR")}</p>
                      </div>
                      {detail.sentAt && (
                        <div>
                          <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">Último disparo</p>
                          <p className="text-gray-700 mt-0.5">{new Date(detail.sentAt).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}</p>
                        </div>
                      )}
                      {debug?.nextRunAt && (
                        <div>
                          <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">Próximo envio</p>
                          <p className="text-gray-700 mt-0.5">{new Date(debug.nextRunAt).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}</p>
                        </div>
                      )}
                    </div>

                    {/* KPI grid */}
                    <div>
                      <p className="mb-3 text-[10px] font-bold uppercase tracking-widest text-gray-400">Métricas de performance</p>
                      <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
                        {[
                          { label: "Audiência",   value: detail.totalAudience,  color: "text-gray-900" },
                          { label: "Enviados",    value: detail.totalSent,      color: "text-blue-700" },
                          { label: "Respostas",   value: detail.totalResponded, color: "text-indigo-700" },
                          { label: "Tx. Resp.",   value: responseRate ? `${responseRate}%` : "—", color: responseRate ? "text-green-700" : "text-gray-400" },
                          { label: "Pedidos",     value: detail.totalConverted, color: detail.totalConverted > 0 ? "text-green-700" : "text-gray-400" },
                          { label: isRecurring ? "Falhas (histórico)" : "Falhas", value: detail.totalFailed, color: detail.totalFailed > 0 ? "text-red-600" : "text-gray-400" },
                        ].map((m) => (
                          <div key={m.label} className="rounded-xl border border-gray-100 bg-white px-2 py-3 text-center shadow-sm">
                            <p className={`text-xl font-bold leading-none ${m.color}`}>{m.value}</p>
                            <p className="mt-1.5 text-[9px] text-gray-500 leading-tight">{m.label}</p>
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

                    {/* Failure breakdown */}
                    {detail.totalFailed > 0 && (() => {
                      const map: Record<string, number> = {};
                      for (const ex of detail.executions) {
                        if (ex.status !== "FAILED") continue;
                        const r = ex.failedReason ?? "BLOCKED";
                        map[r] = (map[r] ?? 0) + 1;
                      }
                      const entries = Object.entries(map).sort(([, a], [, b]) => b - a);
                      return (
                        <div className="rounded-2xl border border-red-100 bg-red-50 p-4 space-y-2">
                          <p className="text-[10px] font-bold uppercase tracking-widest text-red-500">Diagnóstico de falhas</p>
                          <div className="grid grid-cols-1 gap-1 sm:grid-cols-2">
                            {entries.map(([reason, count]) => (
                              <div key={reason} className="flex items-center justify-between gap-2 rounded-lg bg-white px-3 py-2 border border-red-100">
                                <span className="text-xs text-gray-700 truncate">{FAILURE_REASON_LABELS[reason] ?? reason}</span>
                                <span className="text-xs font-bold text-red-600 shrink-0">{count}</span>
                              </div>
                            ))}
                          </div>
                          {isRecurring && (
                            <p className="text-[10px] text-red-400 leading-snug">
                              Esta campanha é recorrente. Falhas históricas incluem todos os ciclos anteriores e podem exceder o público atual. Veja a aba <strong>Performance → Último ciclo</strong> para o ciclo corrente.
                            </p>
                          )}
                        </div>
                      );
                    })()}

                    {/* Operational status quick view */}
                    {debug && !loadingDebug && (
                      <div className={`rounded-xl border px-4 py-3 ${debug.isDueNow ? "border-green-100 bg-green-50" : debug.safetyBlocks.length > 0 ? "border-red-100 bg-red-50" : "border-amber-100 bg-amber-50"}`}>
                        <div className="flex items-center gap-2">
                          <div className={`h-2 w-2 rounded-full shrink-0 ${debug.isDueNow ? "bg-green-500" : debug.safetyBlocks.length > 0 ? "bg-red-500" : "bg-amber-400"}`} />
                          <p className={`text-xs font-semibold ${debug.isDueNow ? "text-green-700" : debug.safetyBlocks.length > 0 ? "text-red-700" : "text-amber-700"}`}>
                            {debug.isDueNow ? "Campanha será processada no próximo ciclo do cron" : debug.safetyBlocks.length > 0 ? debug.safetyBlocks[0] : (debug.notDueReason ?? "Fora da janela de envio")}
                          </p>
                        </div>
                        {debug.dailyCapStatus && <p className="mt-1.5 text-[11px] text-gray-600 ml-4">{debug.dailyCapStatus}</p>}
                      </div>
                    )}

                    {/* Schedule summary */}
                    {isRecurring && cfg && (
                      <div className="rounded-2xl border border-gray-100 bg-gray-50 p-4 space-y-2 text-xs">
                        <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400">Programação recorrente</p>
                        <div className="flex flex-wrap gap-1">
                          {(cfg.weekdays ?? []).map((d) => (
                            <span key={d} className="rounded-full bg-purple-50 px-2 py-0.5 text-[10px] font-semibold text-purple-700">{WEEKDAY_LABELS_PT[d] ?? `D${d}`}</span>
                          ))}
                        </div>
                        {cfg.timeWindow && <p className="text-gray-700"><span className="font-semibold">Janela:</span> {cfg.timeWindow.start}–{cfg.timeWindow.end}{cfg.timezone ? ` (${cfg.timezone})` : ""}</p>}
                        {cfg.dailyLimit && <p className="text-gray-700"><span className="font-semibold">Limite diário:</span> {cfg.dailyLimit} mensagens</p>}
                        {cfg.endCondition && (
                          <p className="text-gray-700">
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
                      <div className="rounded-2xl border border-gray-100 bg-gray-50 p-4">
                        <p className="mb-2 text-[10px] font-bold uppercase tracking-widest text-gray-400">Editar nome da campanha</p>
                        <div className="flex gap-2">
                          <input
                            value={editName}
                            onChange={(e) => setEditName(e.target.value)}
                            maxLength={120}
                            className="flex-1 rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm text-gray-800 focus:border-brand-300 focus:outline-none"
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
                  </div>
                )}

                {/* ── Mensagem ── */}
                {activeTab === "message" && (
                  <div className="space-y-5">
                    <div>
                      <p className="mb-2 text-[10px] font-bold uppercase tracking-widest text-gray-400">Mensagem atual</p>
                      <div className="rounded-2xl border border-gray-200 bg-[#e7ffd1] px-4 py-3 text-sm text-gray-800 whitespace-pre-wrap leading-relaxed shadow-sm">
                        {detail.message}
                      </div>
                    </div>
                    {canEdit ? (
                      <div>
                        <p className="mb-1 text-[10px] font-bold uppercase tracking-widest text-gray-400">Editar mensagem</p>
                        <p className="mb-2 text-xs text-gray-500">
                          Alterações valem para os próximos envios. Mensagens já enviadas não são afetadas.
                        </p>
                        <textarea
                          value={msgText}
                          onChange={(e) => setMsgText(e.target.value)}
                          rows={7}
                          maxLength={4000}
                          className="w-full resize-y rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-800 placeholder-gray-400 focus:border-brand-300 focus:outline-none focus:ring-2 focus:ring-brand-100"
                        />
                        <p className="mt-1 text-[10px] text-gray-400">Variáveis: {"{nome}"}, {"{restaurante}"}, {"{ultimo_pedido}"}, {"{nivel}"}</p>
                        <div className="mt-3 flex items-center gap-3">
                          <button
                            onClick={handleSaveMessage}
                            disabled={savingMsg || msgText.trim() === detail.message}
                            className="rounded-xl bg-brand-600 px-4 py-2 text-sm font-bold text-white hover:bg-brand-700 transition-colors disabled:opacity-50"
                          >
                            {savingMsg ? "Salvando…" : "Salvar mensagem"}
                          </button>
                          {msgSaved && <p className="text-xs font-semibold text-green-600">✓ Salvo com sucesso!</p>}
                        </div>
                      </div>
                    ) : (
                      <p className="rounded-xl border border-gray-100 bg-gray-50 px-4 py-3 text-xs text-gray-500">
                        Campanha finalizada — a mensagem não pode ser editada.
                      </p>
                    )}
                  </div>
                )}

                {/* ── Agendamento (recurring only) ── */}
                {activeTab === "schedule" && isRecurring && (
                  <div className="space-y-5">
                    <div className="rounded-2xl border border-gray-100 bg-gray-50 p-4 space-y-2 text-xs">
                      <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400">Configuração atual</p>
                      <div className="flex flex-wrap gap-1">
                        {(cfg?.weekdays ?? []).map((d) => (
                          <span key={d} className="rounded-full bg-purple-50 px-2 py-0.5 text-[10px] font-semibold text-purple-700">{WEEKDAY_LABELS_PT[d] ?? `D${d}`}</span>
                        ))}
                      </div>
                      {cfg?.timeWindow && <p className="text-gray-700"><span className="font-semibold">Janela:</span> {cfg.timeWindow.start}–{cfg.timeWindow.end}</p>}
                      {cfg?.dailyLimit && <p className="text-gray-700"><span className="font-semibold">Limite diário:</span> {cfg.dailyLimit} mensagens</p>}
                    </div>

                    {canEdit && (
                      <div className="space-y-4">
                        <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400">Editar agendamento</p>
                        <p className="text-xs text-gray-500">Alterações valem para os próximos ciclos. Disparos já realizados não são afetados.</p>

                        <div>
                          <p className="mb-2 text-xs font-semibold text-gray-700">Dias da semana</p>
                          <div className="flex flex-wrap gap-2">
                            {WEEKDAY_LABELS_PT.map((label, d) => (
                              <button
                                key={d}
                                onClick={() => setEditWd((prev) => prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d].sort())}
                                className={`rounded-full px-3 py-1 text-xs font-semibold transition-colors ${editWd.includes(d) ? "bg-brand-600 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"}`}
                              >{label}</button>
                            ))}
                          </div>
                        </div>

                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <label className="mb-1 block text-xs font-semibold text-gray-700">Início</label>
                            <input type="time" value={editStart} onChange={(e) => setEditStart(e.target.value)}
                              className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm focus:border-brand-300 focus:outline-none" />
                          </div>
                          <div>
                            <label className="mb-1 block text-xs font-semibold text-gray-700">Fim</label>
                            <input type="time" value={editEnd} onChange={(e) => setEditEnd(e.target.value)}
                              className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm focus:border-brand-300 focus:outline-none" />
                          </div>
                        </div>

                        <div>
                          <label className="mb-1 block text-xs font-semibold text-gray-700">Limite diário (mensagens)</label>
                          <input type="number" min={1} max={200} value={editLimit}
                            onChange={(e) => setEditLimit(Math.max(1, Math.min(200, parseInt(e.target.value) || 1)))}
                            className="w-32 rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm focus:border-brand-300 focus:outline-none" />
                          <p className="mt-1 text-[10px] text-gray-400">Máximo: 200/dia</p>
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
                              <p className="mb-1 text-[10px] font-bold uppercase tracking-widest text-purple-500">Último ciclo</p>
                              {detail.lastRunAt && (
                                <p className="mb-2 text-[9px] text-gray-400">Desde {new Date(detail.lastRunAt).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}</p>
                              )}
                              <div className="grid grid-cols-3 gap-2">
                                {[
                                  { label: "Enviados",             value: cycle.sent,           color: "text-blue-700" },
                                  { label: "Bloqueados",           value: cycle.blockedSafety,  color: cycle.blockedSafety > 0 ? "text-amber-600" : "text-gray-400" },
                                  { label: "Falhas",               value: cycle.failedProvider, color: cycle.failedProvider > 0 ? "text-red-600" : "text-gray-400" },
                                ].map((m) => (
                                  <div key={m.label} className="rounded-xl border border-purple-100 bg-purple-50/40 px-2 py-3 text-center">
                                    <p className={`text-xl font-bold leading-none ${m.color}`}>{m.value}</p>
                                    <p className="mt-1.5 text-[9px] text-gray-500 leading-tight">{m.label}</p>
                                  </div>
                                ))}
                              </div>
                              {cycle.reasonGroups.length > 0 && (
                                <div className="mt-2 flex flex-wrap gap-1.5">
                                  {cycle.reasonGroups.map((g) => (
                                    <span key={g.category} className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${g.kind === "FAILED" ? "bg-red-50 text-red-600" : g.kind === "BLOCKED" ? "bg-amber-50 text-amber-700" : "bg-gray-100 text-gray-600"}`}>
                                      {g.badge}: {g.count}{g.kind === "FAILED" && g.retryabilityLabel ? ` · ${g.retryabilityLabel}` : ""}
                                    </span>
                                  ))}
                                </div>
                              )}
                            </div>
                          )}

                          <div>
                            <p className="mb-3 text-[10px] font-bold uppercase tracking-widest text-gray-400">
                              {isRecurring ? "Total histórico (todos os ciclos)" : "Resultados totais"}
                            </p>
                            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                              {[
                                { label: "Audiência total",        value: perf?.audience ?? detail.totalAudience, color: "text-gray-700" },
                                { label: "Enviados",                value: sent,    color: "text-blue-700" },
                                { label: "Bloqueados (segurança)",  value: blocked, color: blocked > 0 ? "text-amber-600" : "text-gray-400" },
                                { label: "Falhas reais de envio",   value: failed,  color: failed > 0 ? "text-red-600" : "text-gray-400" },
                                { label: "Lidos",                   value: detail.totalRead,      color: "text-indigo-700" },
                                { label: "Respostas",               value: detail.totalResponded, color: "text-blue-600" },
                                { label: "Compras",                 value: detail.totalConverted, color: detail.totalConverted > 0 ? "text-green-700" : "text-gray-400" },
                                { label: "Conversão",               value: convRate ? `${convRate}%` : "—", color: convRate ? "text-green-700" : "text-gray-400" },
                              ].map((m) => (
                                <div key={m.label} className="rounded-xl border border-gray-100 bg-white px-2 py-3 text-center shadow-sm">
                                  <p className={`text-xl font-bold leading-none ${m.color}`}>{m.value}</p>
                                  <p className="mt-1.5 text-[9px] text-gray-500 leading-tight">{m.label}</p>
                                </div>
                              ))}
                            </div>
                            {blocked > 0 && (
                              <p className="mt-2 text-[10px] text-amber-600">
                                ⓘ Bloqueios de segurança (limite semanal, cooldown, opt-out) <strong>não são falhas de envio</strong> — os clientes voltam a ficar elegíveis quando a janela expira.
                              </p>
                            )}
                            {perf && perf.reasonGroups.length > 0 && (
                              <div className="mt-3 flex flex-wrap gap-1.5">
                                {perf.reasonGroups.map((g) => (
                                  <span key={g.category} className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${g.kind === "FAILED" ? "bg-red-50 text-red-600" : g.kind === "BLOCKED" ? "bg-amber-50 text-amber-700" : "bg-gray-100 text-gray-600"}`}>
                                    {g.badge}: {g.count}{g.kind === "FAILED" && g.retryabilityLabel ? ` · ${g.retryabilityLabel}` : ""}
                                  </span>
                                ))}
                              </div>
                            )}
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

                    <p className="text-[10px] text-gray-400 italic">
                      Conversões atribuídas: pedidos realizados pelo cliente após receber a mensagem da campanha.
                    </p>

                    <div>
                      <p className="mb-3 text-[10px] font-bold uppercase tracking-widest text-gray-400">
                        Clientes contactados ({detail.executions.length})
                      </p>
                      {detail.executions.length === 0 ? (
                        <div className="rounded-2xl border-2 border-dashed border-gray-100 py-8 text-center text-xs text-gray-400">
                          {isRecurring ? "Nenhum envio registrado ainda. Aguardando próximo ciclo." : "Nenhum destinatário registrado."}
                        </div>
                      ) : (
                        <div className="space-y-1.5 max-h-72 overflow-y-auto rounded-xl border border-gray-100 p-2">
                          {detail.executions.map((ex) => {
                            // Prefer the server classification so a safety block reads
                            // "Bloqueado", an invalid number reads "Telefone inválido",
                            // and only a real provider error reads "Falhou".
                            const kind = ex.classification?.kind ?? ex.status;
                            const badge = ex.classification?.badge ?? (EXEC_STATUS_LABELS[ex.status] ?? ex.status);
                            const tone = kind === "SENT" ? { bg: "bg-green-50", text: "text-green-700" }
                              : kind === "BLOCKED" ? { bg: "bg-amber-50", text: "text-amber-700" }
                              : kind === "FAILED" ? { bg: "bg-red-50", text: "text-red-600" }
                              : (EXEC_STATUS_COLORS[ex.status] ?? { bg: "bg-gray-100", text: "text-gray-600" });
                            const reasonColor = kind === "BLOCKED" ? "text-amber-600" : "text-red-500";
                            return (
                              <div key={ex.id} className="flex items-center gap-3 rounded-xl border border-gray-50 bg-white px-3 py-2 shadow-sm">
                                <div className="flex-1 min-w-0">
                                  <p className="text-xs font-semibold text-gray-800 truncate">{ex.customerName ?? "Cliente"}</p>
                                  <p className="text-[10px] text-gray-400 truncate">{ex.customerPhone ?? "—"}</p>
                                  {ex.failedReason && <p className={`text-[10px] truncate ${reasonColor}`}>{ex.failedReason}</p>}
                                </div>
                                <div className="shrink-0 flex flex-col items-end gap-0.5">
                                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${tone.bg} ${tone.text}`}>{badge}</span>
                                  {ex.converted && ex.revenue != null && (
                                    <span className="text-[10px] font-semibold text-green-600">R$ {Number(ex.revenue).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</span>
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

                {/* ── Diagnóstico ── */}
                {activeTab === "diagnostics" && (
                  <div className="space-y-4">
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
                            <div key={m.l} className="rounded-lg border border-gray-100 bg-white px-2 py-1.5 text-center">
                              <p className="text-sm font-bold text-gray-800">{m.v}</p>
                              <p className="text-[9px] text-gray-500">{m.l}</p>
                            </div>
                          ))}
                        </div>
                        {preflight.warnings.map((w, i) => <p key={i} className="mt-1 text-[10px] text-amber-700">• {w}</p>)}
                        {preflight.recommendations.map((r, i) => <p key={`r${i}`} className="mt-1 text-[10px] text-blue-700">→ {r}</p>)}
                      </div>
                    )}
                    {loadingDebug && <div className="rounded-2xl border border-gray-100 bg-gray-50 p-4 text-xs text-gray-400">Verificando estado do runner…</div>}
                    {!loadingDebug && !debug && (
                      <div className="rounded-2xl border-2 border-dashed border-gray-100 py-8 text-center text-xs text-gray-400">
                        Diagnóstico disponível apenas para campanhas recorrentes ativas.
                      </div>
                    )}
                    {!loadingDebug && debug && (
                      <div className="space-y-3">
                        {detail.performance && (detail.performance.blockedSafety > 0 || detail.performance.failedProvider > 0) && (
                          <div className="rounded-xl border border-gray-100 bg-white px-3 py-3">
                            <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400">Por que clientes não receberam</p>
                            <div className="mt-2 flex flex-wrap gap-1.5">
                              {detail.performance.reasonGroups.map((g) => (
                                <span key={g.category} className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${g.kind === "FAILED" ? "bg-red-50 text-red-600" : g.kind === "BLOCKED" ? "bg-amber-50 text-amber-700" : "bg-gray-100 text-gray-600"}`}>
                                  {g.badge}: {g.count}{g.kind === "FAILED" && g.retryabilityLabel ? ` · ${g.retryabilityLabel}` : ""}
                                </span>
                              ))}
                            </div>
                            <p className="mt-2 text-[10px] text-gray-500">
                              <strong className="text-amber-700">{detail.performance.blockedSafety}</strong> bloqueio(s) de segurança (não é falha — voltam a ser elegíveis quando a janela expira) ·
                              <strong className="text-red-600"> {detail.performance.failedProvider}</strong> falha(s) real(is) de envio.
                            </p>
                            <div className="mt-2 rounded-lg bg-violet-50 px-3 py-2 text-[10px] text-violet-800">
                              <p>
                                <strong>{detail.performance.recoverableLater ?? 0}</strong> falha(s) temporária(s) podem ser reenviadas depois ·
                                <strong> {detail.performance.skipped ?? 0}</strong> ignorada(s) (telefone inválido / não elegível — não reenviar).
                              </p>
                              <p className="mt-1 text-violet-600">Modo seguro WhatsApp Web: até 5 envios por ciclo. Falhas temporárias (Evolution 5xx, timeout) voltam a ser tentadas no próximo ciclo do cron; telefone inválido, opt-out e 400 não são reenviados automaticamente.</p>
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
                          <div className="rounded-xl border border-gray-100 bg-gray-50 px-3 py-2 text-xs">
                            <span className="font-semibold text-gray-700">Próximo envio: </span>
                            <span className="text-gray-600">{new Date(debug.nextRunAt).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit" })}</span>
                          </div>
                        )}
                        {debug.safetyBlocks.length > 0 && (
                          <div className="rounded-xl border border-red-100 bg-red-50 px-3 py-3 space-y-1">
                            <p className="text-xs font-bold text-red-700">Bloqueios ativos:</p>
                            {debug.safetyBlocks.map((b, i) => <p key={i} className="text-xs text-red-600">• {b}</p>)}
                          </div>
                        )}
                        {debug.dailyCapStatus && (
                          <div className="rounded-xl border border-gray-100 bg-gray-50 px-3 py-2 text-xs">
                            <span className="font-semibold text-gray-700">Cap diário: </span>
                            <span className="text-gray-600">{debug.dailyCapStatus}</span>
                          </div>
                        )}
                        {debug.audience && (
                          <div className="rounded-xl border border-gray-100 bg-gray-50 px-3 py-3 text-xs space-y-1">
                            <p className="font-semibold text-gray-700">Audiência em tempo real:</p>
                            {debug.audience.error ? (
                              <p className="text-red-500">Erro: {debug.audience.error}</p>
                            ) : (
                              <>
                                <p className="text-gray-600">• {debug.audience.totalEligible} clientes elegíveis no segmento</p>
                                <p className="text-gray-600">• {debug.audience.alreadySent} já receberam esta campanha</p>
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

function getOperationalStatus(c: CampaignHistoryRow): { text: string; color: string; dot: string } {
  const cfg = c.scheduleConfig as ScheduleCfg | null;
  if (c.status === "PAUSED")  return { text: "Campanha pausada — aguardando retomada", color: "text-yellow-700", dot: "bg-yellow-400" };
  if (c.status === "SENDING") {
    const sent    = c.totalSent;
    const pending = c.pendingCount ?? 0;
    const failed  = c.totalFailed;
    const total   = sent + pending + failed;
    if (total > 0) {
      const parts: string[] = [];
      if (sent > 0)    parts.push(`${sent} enviados`);
      if (pending > 0) parts.push(`${pending} na fila`);
      if (failed > 0)  parts.push(`${failed} falhas`);
      return { text: parts.join(" · "), color: "text-blue-700", dot: "bg-blue-500" };
    }
    return { text: "Enviando mensagens agora…", color: "text-blue-700", dot: "bg-blue-500" };
  }
  if (c.status === "SCHEDULED" && c.scheduledAt) {
    const d = new Date(c.scheduledAt);
    return { text: `Agendada para ${d.toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}`, color: "text-amber-700", dot: "bg-amber-400" };
  }
  if (c.totalSent === 0 && c.totalAudience === 0) return { text: "Calculando audiência…", color: "text-gray-500", dot: "bg-gray-400" };
  if (c.totalSent === 0) return { text: "Aguardando próximo ciclo de envio", color: "text-gray-600", dot: "bg-gray-400" };
  if (cfg?.mode === "RECURRING" && cfg.timeWindow) {
    return { text: `Ativa · janela de envio ${cfg.timeWindow.start}–${cfg.timeWindow.end}`, color: "text-green-700", dot: "bg-green-500" };
  }
  return { text: "Campanha ativa", color: "text-green-700", dot: "bg-green-500" };
}

// ── Active Campaigns Section ──────────────────────────────────────────────────

const ACTIVE_STATUSES = new Set(["ACTIVE", "SENDING", "SCHEDULED", "PAUSED"]);
const HISTORY_STATUSES = new Set(["SENT", "COMPLETED", "CANCELLED", "DRAFT"]);

type CampaignTipo = "Única" | "Agendada" | "Recorrente";

const TIPO_BADGE: Record<CampaignTipo, string> = {
  "Única":      "bg-gray-100 text-gray-600",
  "Agendada":   "bg-amber-50 text-amber-700",
  "Recorrente": "bg-purple-50 text-purple-700",
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

// ── Campaign Performance Summary ──────────────────────────────────────────────

function CampaignPerformanceSummary({ campaigns }: { campaigns: CampaignHistoryRow[] }) {
  const active = campaigns.filter((c) => ACTIVE_STATUSES.has(c.status));
  if (active.length === 0) return null;

  const totalSent      = active.reduce((s, c) => s + c.totalSent,      0);
  const totalResponded = active.reduce((s, c) => s + c.totalResponded, 0);
  const totalConverted = active.reduce((s, c) => s + c.totalConverted, 0);
  const totalRevenue   = active.reduce((s, c) => s + Number(c.totalRevenue), 0);
  const avgRate        = totalSent > 0 ? ((totalResponded / totalSent) * 100).toFixed(1) : null;

  const kpis = [
    { label: "Campanhas",  value: String(active.length),                              color: "text-brand-700" },
    { label: "Enviados",   value: totalSent      > 0 ? String(totalSent)      : "—",  color: "text-blue-700" },
    { label: "Respostas",  value: totalResponded > 0 ? String(totalResponded) : "—",  color: "text-indigo-700" },
    { label: "Tx. Resp.",  value: avgRate ? `${avgRate}%` : "—",                      color: avgRate ? "text-green-700" : "text-gray-400" },
    { label: "Pedidos",    value: totalConverted > 0 ? String(totalConverted) : "—",  color: totalConverted > 0 ? "text-green-700" : "text-gray-400" },
    { label: "Receita",    value: totalRevenue   > 0 ? `R$ ${totalRevenue.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}` : "—", color: totalRevenue > 0 ? "text-green-700" : "text-gray-400" },
  ];

  return (
    <div className="mb-4 rounded-2xl border border-brand-100 bg-gradient-to-br from-brand-50 to-white p-4">
      <p className="mb-3 text-[10px] font-bold uppercase tracking-widest text-brand-500">Resumo · campanhas ativas</p>
      <div className="grid grid-cols-3 gap-3 sm:grid-cols-6">
        {kpis.map((kpi) => (
          <div key={kpi.label} className="text-center">
            <p className={`text-lg font-bold leading-none ${kpi.color}`}>{kpi.value}</p>
            <p className="mt-0.5 text-[9px] font-semibold uppercase tracking-wide text-gray-500">{kpi.label}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Active Campaign Card ──────────────────────────────────────────────────────

function ActiveCampaignCard({
  campaign: c,
  onDetail,
  onAction,
}: {
  campaign:  CampaignHistoryRow;
  onDetail:  (id: string) => void;
  onAction:  (id: string, action: "pause" | "resume" | "cancel") => void;
}) {
  const sc          = CAMPAIGN_STATUS_COLORS[c.status] ?? { bg: "bg-gray-100", text: "text-gray-600" };
  const cfg         = c.scheduleConfig as ScheduleCfg | null;
  const isRecurring = cfg?.mode === "RECURRING";
  const controllable = ["ACTIVE", "SCHEDULED", "PAUSED"].includes(c.status);
  const opStatus    = getOperationalStatus(c);

  const daysRunning  = Math.max(0, Math.floor((Date.now() - new Date(c.createdAt).getTime()) / 86_400_000));
  const responseRate = c.totalSent > 0 ? ((c.totalResponded / c.totalSent) * 100).toFixed(1) : null;

  // For SENDING campaigns, 0 is a real value (not "unknown") — show it explicitly.
  const isSending = c.status === "SENDING";
  const kpis = [
    { label: "Audiência",  value: c.totalAudience  > 0 ? c.totalAudience  : "—", color: "text-gray-900" },
    { label: "Enviados",   value: c.totalSent > 0 ? c.totalSent : isSending ? 0 : "—", color: c.totalSent > 0 ? "text-blue-700" : isSending ? "text-blue-400" : "text-gray-400" },
    { label: "Respostas",  value: c.totalResponded  > 0 ? c.totalResponded  : "—", color: c.totalResponded > 0 ? "text-indigo-700" : "text-gray-400" },
    { label: "Tx. Resp.",  value: responseRate ? `${responseRate}%` : "—",          color: responseRate ? "text-green-700" : "text-gray-400" },
    { label: "Pedidos",    value: c.totalConverted  > 0 ? c.totalConverted  : "—", color: c.totalConverted > 0 ? "text-green-700" : "text-gray-400" },
    { label: "Receita",    value: Number(c.totalRevenue) > 0 ? `R$ ${Number(c.totalRevenue).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}` : "—", color: Number(c.totalRevenue) > 0 ? "text-green-700" : "text-gray-400" },
    { label: "Falhas",     value: c.totalFailed > 0 ? c.totalFailed : isSending ? 0 : "—", color: c.totalFailed > 0 ? "text-red-600" : "text-gray-400" },
  ];

  return (
    <div className="rounded-2xl border-2 border-brand-100 bg-white p-4 shadow-sm">
      {/* ── Header ── */}
      <div className="flex items-start gap-3">
        <div className="flex-1 min-w-0">
          {/* Badges */}
          <div className="flex flex-wrap items-center gap-1.5 mb-1.5">
            <span className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold ${sc.bg} ${sc.text}`}>
              {CAMPAIGN_STATUS_LABELS[c.status] ?? c.status}
            </span>
            <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${isRecurring ? "bg-purple-50 text-purple-700" : "bg-gray-100 text-gray-600"}`}>
              {isRecurring ? "Recorrente" : "Pontual"}
            </span>
            {c.targetSegment && (
              <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-semibold text-gray-600">
                {SEGMENT_LABELS[c.targetSegment] ?? c.targetSegment}
              </span>
            )}
          </div>
          {/* Name */}
          <p className="text-sm font-bold text-gray-900 leading-tight">{c.name}</p>
          {/* Meta */}
          <p className="mt-0.5 text-[11px] text-gray-500">
            WhatsApp
            {" · "}
            {daysRunning === 0 ? "Iniciada hoje" : daysRunning === 1 ? "Rodando há 1 dia" : `Rodando há ${daysRunning} dias`}
            {c.sentAt && ` · Último: ${new Date(c.sentAt).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}`}
          </p>
        </div>
        <button
          onClick={() => onDetail(c.id)}
          className="shrink-0 rounded-xl bg-brand-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-brand-700 transition-colors whitespace-nowrap shadow-sm"
        >
          Gerenciar
        </button>
      </div>

      {/* ── KPI row ── */}
      <div className="mt-3 grid grid-cols-4 gap-2 border-t border-gray-100 pt-3 sm:grid-cols-7">
        {kpis.map((kpi) => (
          <div key={kpi.label} className="text-center">
            <p className={`text-sm font-bold leading-none ${kpi.color}`}>{String(kpi.value)}</p>
            <p className="mt-0.5 text-[9px] font-semibold uppercase tracking-wide text-gray-400">{kpi.label}</p>
          </div>
        ))}
      </div>

      {/* ── Operational status + secondary actions ── */}
      <div className="mt-2.5 flex flex-wrap items-center justify-between gap-2 border-t border-gray-100 pt-2.5">
        <div className="flex items-center gap-1.5">
          <div className={`h-1.5 w-1.5 rounded-full shrink-0 ${opStatus.dot}`} />
          <p className={`text-[11px] font-medium ${opStatus.color}`}>{opStatus.text}</p>
        </div>
        {controllable && (
          <div className="flex items-center gap-1.5 shrink-0">
            {c.status === "PAUSED" ? (
              <button
                onClick={() => onAction(c.id, "resume")}
                className="rounded-lg bg-green-50 px-2.5 py-1 text-[11px] font-semibold text-green-700 hover:bg-green-100 transition-colors"
              >Retomar</button>
            ) : (
              <button
                onClick={() => onAction(c.id, "pause")}
                className="rounded-lg bg-gray-100 px-2.5 py-1 text-[11px] font-semibold text-gray-600 hover:bg-gray-200 transition-colors"
              >Pausar</button>
            )}
            <button
              onClick={() => {
                if (!confirm("Cancelar esta campanha permanentemente? Esta ação não pode ser desfeita.")) return;
                onAction(c.id, "cancel");
              }}
              className="rounded-lg bg-red-50 px-2.5 py-1 text-[11px] font-semibold text-red-600 hover:bg-red-100 transition-colors"
            >Cancelar</button>
          </div>
        )}
      </div>
    </div>
  );
}

function CampanhasAtivasSection({
  campaigns,
  onDetail,
  onAction,
}: {
  campaigns: CampaignHistoryRow[];
  onDetail: (id: string) => void;
  onAction: (id: string, action: "pause" | "resume" | "cancel") => void;
}) {
  const active = campaigns.filter((c) => ACTIVE_STATUSES.has(c.status));
  if (active.length === 0) return null;

  return (
    <div data-testid="campanhas-ativas-section">
      <div className="mb-3 flex items-center justify-between">
        <div>
          <h3 className="text-xs font-bold uppercase tracking-widest text-brand-600">Campanhas ativas</h3>
          <p className="mt-0.5 text-xs text-gray-400">Campanhas em execução, agendadas ou recorrentes.</p>
        </div>
        <span className="rounded-full bg-brand-50 px-2.5 py-0.5 text-xs font-bold text-brand-700">{active.length}</span>
      </div>
      {/* 9 columns — fits 1280px+ without horizontal scroll.
          Respostas/Tx./Pedidos moved to the Gerenciar detail modal. */}
      <div className="overflow-x-auto rounded-2xl border border-gray-100 bg-white shadow-sm">
        <table className="w-full min-w-[860px] text-left text-xs">
          <thead className="border-b border-gray-100 bg-gray-50">
            <tr className="text-[10px] uppercase tracking-wide text-gray-400">
              <th className="py-2.5 pl-4 pr-2 font-semibold">Status</th>
              <th className="py-2.5 px-2 font-semibold">Nome</th>
              <th className="py-2.5 px-2 font-semibold">Tipo</th>
              <th className="py-2.5 px-2 font-semibold">Público</th>
              <th className="py-2.5 px-2 font-semibold text-right">Enviados</th>
              <th className="py-2.5 px-2 font-semibold text-right">Falhas</th>
              <th className="py-2.5 px-2 font-semibold text-right">Receita</th>
              <th className="py-2.5 px-2 font-semibold">Agenda</th>
              <th className="py-2.5 pl-2 pr-4 font-semibold">Ações</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {active.map((c) => {
              const sc           = CAMPAIGN_STATUS_COLORS[c.status] ?? { bg: "bg-gray-100", text: "text-gray-600" };
              const cfg          = c.scheduleConfig as ScheduleCfg | null;
              const isRecurring  = cfg?.mode === "RECURRING";
              const controllable = ["ACTIVE", "SCHEDULED", "PAUSED"].includes(c.status);
              const agenda       = campaignAgenda(c);
              const tipo         = campaignTipo(c);
              const failTitle    = c.totalFailed > 0 && c.failureBreakdown && Object.keys(c.failureBreakdown).length > 0
                ? failureTitleText(c.failureBreakdown, isRecurring)
                : undefined;

              return (
                <tr key={c.id} className="hover:bg-gray-50 transition-colors">
                  {/* Status */}
                  <td className="py-3 pl-4 pr-2">
                    <span className={`inline-block rounded-full px-2 py-0.5 text-[9px] font-bold whitespace-nowrap ${sc.bg} ${sc.text}`}>
                      {CAMPAIGN_STATUS_LABELS[c.status] ?? c.status}
                    </span>
                  </td>

                  {/* Nome */}
                  <td className="py-3 px-2 max-w-[160px]">
                    <p className="font-semibold text-gray-900 truncate">{c.name}</p>
                    {c.objective && (
                      <p className="text-[10px] text-gray-400 truncate">{OBJECTIVE_LABELS[c.objective] ?? c.objective}</p>
                    )}
                  </td>

                  {/* Tipo */}
                  <td className="py-3 px-2 whitespace-nowrap">
                    <span className={`rounded-full px-2 py-0.5 text-[9px] font-semibold ${TIPO_BADGE[tipo]}`}>
                      {tipo}
                    </span>
                  </td>

                  {/* Público */}
                  <td className="py-3 px-2 max-w-[100px]">
                    <span className="text-gray-600 truncate block text-[11px]">
                      {c.targetSegment ? (SEGMENT_LABELS[c.targetSegment] ?? c.targetSegment) : "—"}
                    </span>
                  </td>

                  {/* Enviados */}
                  <td className="py-3 px-2 text-right tabular-nums text-blue-700">
                    {c.totalSent > 0 ? c.totalSent : "—"}
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
                      <span className="text-gray-300">—</span>
                    )}
                  </td>

                  {/* Receita */}
                  <td className="py-3 px-2 text-right tabular-nums font-semibold text-green-700">
                    {Number(c.totalRevenue) > 0
                      ? `R$ ${Number(c.totalRevenue).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`
                      : <span className="text-gray-300 font-normal">—</span>}
                  </td>

                  {/* Agenda: time window on line 1, cadence on line 2 */}
                  <td className="py-3 px-2 text-[11px]">
                    <p className="text-gray-600 whitespace-nowrap">{agenda.primary}</p>
                    {agenda.secondary && (
                      <p className="text-gray-400 whitespace-nowrap">{agenda.secondary}</p>
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
                            className="rounded-lg bg-gray-100 px-2 py-1 text-[10px] font-semibold text-gray-600 hover:bg-gray-200 transition-colors"
                          >Pausar</button>
                        )
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Campanhas Tab ─────────────────────────────────────────────────────────────

const BLANK_CAMPAIGN_TEMPLATE: ActionTemplate = {
  id: "custom",
  emoji: "📢",
  title: "Nova campanha",
  objective: "Campanha personalizada",
  targetLabel: "Todos os clientes",
  description: "",
  readiness: "READY_TO_CONFIGURE",
  hasAudienceQuery: false,
  audienceKey: null,
  suggestedMessage: "",
};

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

// ── Campaign + Coupon performance ──────────────────────────────────────────

type CouponMetricRow = {
  promotionId: string; couponCode: string | null; name: string; type: string;
  status: string; usedCount: number; orderCount: number; revenue: number;
  discount: number; averageTicket: number; uniqueCustomers: number;
  firstUsedAt: string | null; lastUsedAt: string | null; conversion: number | null;
};
type CampaignMetricRow = {
  campaignId: string; name: string; status: string; audienceSize: number;
  sentCount: number; failedCount: number; responseCount: number;
  assistedConversions: number; assistedRevenue: number; conversionRate: number | null;
  lastExecutionAt: string | null;
};
type CampaignCouponMetricsResponse = {
  period: string;
  coupons: {
    totalCouponsActive: number; totalCouponOrders: number;
    couponRevenue: number; totalDiscountGiven: number; rows: CouponMetricRow[];
  };
  campaigns: {
    totalCampaigns: number; totalSent: number; totalFailed: number;
    totalAssistedRevenue: number; couponAttribution: string;
    couponAttributionNote: string; rows: CampaignMetricRow[];
  };
};

type AttributionQuality = "COUPON_PROVEN" | "CAMPAIGN_COUPON" | "ASSISTED" | "NONE";
type AttributionRowClient = {
  campaignId: string; attributionQuality: AttributionQuality;
  attributionLabel: string; attributionDescription: string;
  linkedCouponCode: string | null; couponOrderCount: number | null;
  couponRevenue: number | null; discountGiven: number | null;
};
const QUALITY_BADGE: Record<AttributionQuality, { bg: string; text: string }> = {
  COUPON_PROVEN:   { bg: "bg-green-100",  text: "text-green-700"  },
  CAMPAIGN_COUPON: { bg: "bg-blue-100",   text: "text-blue-700"   },
  ASSISTED:        { bg: "bg-amber-100",  text: "text-amber-700"  },
  NONE:            { bg: "bg-gray-100",   text: "text-gray-500"   },
};

const PERFORMANCE_PERIODS: { value: string; label: string }[] = [
  { value: "7d",  label: "7 dias"  },
  { value: "30d", label: "30 dias" },
  { value: "90d", label: "90 dias" },
  { value: "all", label: "Tudo"    },
];

function CampaignCouponPerformance() {
  const [period,         setPeriod]         = useState("30d");
  const [data,           setData]           = useState<CampaignCouponMetricsResponse | null>(null);
  const [attribution,    setAttribution]    = useState<Map<string, AttributionRowClient>>(new Map());
  const [loading,        setLoading]        = useState(true);
  const [showAllCoupons, setShowAllCoupons] = useState(false);

  useEffect(() => {
    setLoading(true);
    Promise.all([
      fetch(`/api/crm/campaign-metrics?period=${period}`)
        .then((r) => r.ok ? r.json() : Promise.reject())
        .then((json) => json.data ?? null)
        .catch(() => null),
      fetch(`/api/crm/attribution?period=${period}`)
        .then((r) => r.ok ? r.json() : Promise.reject())
        .then((json): AttributionRowClient[] => (json.data?.rows ?? []))
        .catch(() => [] as AttributionRowClient[]),
    ]).then(([metrics, attrRows]) => {
      setData(metrics);
      const map = new Map<string, AttributionRowClient>();
      for (const r of attrRows) map.set(r.campaignId, r);
      setAttribution(map);
    }).finally(() => setLoading(false));
  }, [period]);

  const cards = [
    { label: "Cupons usados",     value: data ? String(data.coupons.totalCouponOrders) : "—",                    sub: data ? `${data.coupons.totalCouponsActive} ativos` : "" },
    { label: "Receita com cupons", value: data ? `R$ ${formatCurrency(data.coupons.couponRevenue)}` : "—",        sub: "pedidos válidos" },
    { label: "Desconto concedido", value: data ? `R$ ${formatCurrency(data.coupons.totalDiscountGiven)}` : "—",   sub: "total no período" },
    { label: "Campanhas enviadas", value: data ? String(data.campaigns.totalSent) : "—",                          sub: data ? `${data.campaigns.totalFailed} falhas` : "" },
  ];

  return (
    <div className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-bold text-gray-900">Performance de campanhas e cupons</h3>
          <p className="mt-0.5 text-xs text-gray-500">Cupons com atribuição confiável; receita de campanha é assistida (pós-envio).</p>
        </div>
        <div className="flex items-center gap-1 rounded-lg border border-gray-200 p-0.5">
          {PERFORMANCE_PERIODS.map((p) => (
            <button
              key={p.value}
              onClick={() => setPeriod(p.value)}
              className={`rounded-md px-2.5 py-1 text-[11px] font-semibold transition-colors ${
                period === p.value ? "bg-brand-600 text-white" : "text-gray-500 hover:bg-gray-100"
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {/* Metric cards */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {cards.map((c) => (
          <div key={c.label} className="rounded-xl border border-gray-100 bg-gray-50 px-3 py-3">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">{c.label}</p>
            <p className="mt-1 text-lg font-bold leading-none text-gray-900">{c.value}</p>
            {c.sub && <p className="mt-1 text-[10px] text-gray-400">{c.sub}</p>}
          </div>
        ))}
      </div>

      {loading ? (
        <p className="py-6 text-center text-xs text-gray-400">Carregando métricas…</p>
      ) : !data ? (
        <p className="py-6 text-center text-xs text-gray-400">Não foi possível carregar as métricas.</p>
      ) : (
        <>
          {/* Coupon table */}
          <div className="mt-5">
            <p className="mb-2 text-[11px] font-bold uppercase tracking-widest text-gray-400">Cupons</p>
            {data.coupons.rows.length === 0 ? (
              <div className="rounded-xl border-2 border-dashed border-gray-100 py-5 text-center text-xs text-gray-400">
                Nenhum cupom cadastrado.
              </div>
            ) : (
              <>
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="text-[10px] uppercase tracking-wide text-gray-400">
                        <th className="py-1.5 pr-2 font-semibold">Cupom</th>
                        <th className="py-1.5 px-2 font-semibold text-right">Usos</th>
                        <th className="py-1.5 px-2 font-semibold text-right">Pedidos</th>
                        <th className="py-1.5 px-2 font-semibold text-right">Receita</th>
                        <th className="py-1.5 px-2 font-semibold text-right">Desconto</th>
                        <th className="py-1.5 pl-2 font-semibold text-right">Ticket médio</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {(showAllCoupons ? data.coupons.rows : data.coupons.rows.slice(0, 5)).map((r) => (
                        <tr key={r.promotionId} className="text-gray-700">
                          <td className="py-2 pr-2">
                            <div className="flex items-center gap-1.5">
                              <span className="font-semibold text-gray-900">{r.couponCode ?? "—"}</span>
                              {r.status !== "ACTIVE" && (
                                <span className="rounded bg-gray-100 px-1 py-0.5 text-[9px] font-semibold text-gray-400">
                                  {r.status}
                                </span>
                              )}
                            </div>
                            <span className="text-[10px] text-gray-400">{r.name}</span>
                          </td>
                          <td className="py-2 px-2 text-right tabular-nums">{r.orderCount}</td>
                          <td className="py-2 px-2 text-right tabular-nums">{r.uniqueCustomers} clientes</td>
                          <td className="py-2 px-2 text-right tabular-nums font-semibold text-green-700">R$ {formatCurrency(r.revenue)}</td>
                          <td className="py-2 px-2 text-right tabular-nums text-gray-500">R$ {formatCurrency(r.discount)}</td>
                          <td className="py-2 pl-2 text-right tabular-nums">R$ {formatCurrency(r.averageTicket)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {data.coupons.rows.length > 5 && (
                  <button
                    onClick={() => setShowAllCoupons((v) => !v)}
                    className="mt-2 text-[11px] font-semibold text-brand-600 hover:text-brand-700 transition-colors"
                  >
                    {showAllCoupons ? "Ver menos" : `Ver todos (${data.coupons.rows.length})`}
                  </button>
                )}
              </>
            )}
          </div>

          {/* Campaign table */}
          <div className="mt-5">
            <p className="mb-2 text-[11px] font-bold uppercase tracking-widest text-gray-400">Campanhas</p>
            {data.campaigns.rows.length === 0 ? (
              <div className="rounded-xl border-2 border-dashed border-gray-100 py-5 text-center text-xs text-gray-400">
                Nenhuma campanha no período.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="text-[10px] uppercase tracking-wide text-gray-400">
                      <th className="py-1.5 pr-2 font-semibold">Campanha</th>
                      <th className="py-1.5 px-2 font-semibold text-right">Enviados</th>
                      <th className="py-1.5 px-2 font-semibold text-right">Falhas</th>
                      <th className="py-1.5 px-2 font-semibold text-right">Conversões</th>
                      <th className="py-1.5 px-2 font-semibold text-right">Atribuição</th>
                      <th className="py-1.5 pl-2 font-semibold text-right">Receita</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {data.campaigns.rows.map((r) => {
                      const attr = attribution.get(r.campaignId);
                      const quality = attr?.attributionQuality ?? "NONE";
                      const badge = QUALITY_BADGE[quality];
                      const revenueLabel = quality === "COUPON_PROVEN" && attr?.couponRevenue != null
                        ? `R$ ${formatCurrency(attr.couponRevenue)}`
                        : r.assistedRevenue > 0
                        ? `R$ ${formatCurrency(r.assistedRevenue)}`
                        : "—";
                      return (
                        <tr key={r.campaignId} className="text-gray-700">
                          <td className="py-2 pr-2">
                            <span className="font-semibold text-gray-900">{r.name}</span>
                            <span className="block text-[10px] text-gray-400">{r.audienceSize} no público</span>
                            {attr?.linkedCouponCode && (
                              <span className="block text-[10px] text-blue-500">cupom: {attr.linkedCouponCode}</span>
                            )}
                          </td>
                          <td className="py-2 px-2 text-right tabular-nums">{r.sentCount}</td>
                          <td className="py-2 px-2 text-right tabular-nums text-red-500">{r.failedCount}</td>
                          <td className="py-2 px-2 text-right tabular-nums">{r.assistedConversions}</td>
                          <td className="py-2 px-2 text-right">
                            {attr ? (
                              <span
                                className={`inline-block rounded px-1.5 py-0.5 text-[9px] font-semibold ${badge.bg} ${badge.text}`}
                                title={attr.attributionDescription}
                              >
                                {attr.attributionLabel}
                              </span>
                            ) : (
                              <span className="text-gray-400">—</span>
                            )}
                          </td>
                          <td className="py-2 pl-2 text-right tabular-nums font-semibold text-green-700">
                            {revenueLabel}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                <p className="mt-2 text-[10px] text-gray-400">
                  Receita: comprovada por cupom quando vinculado; assistida (pós-envio) caso contrário.
                </p>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
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

  // Campaign history
  const [campaigns,       setCampaigns]       = useState<CampaignHistoryRow[]>([]);
  const [loadingHistory,  setLoadingHistory]  = useState(true);

  function refreshCampaigns() {
    fetch("/api/crm/campaigns")
      .then((r) => r.ok ? r.json() : Promise.reject())
      .then((json) => setCampaigns(json.data ?? []))
      .catch(() => {});
  }

  useEffect(() => {
    fetch("/api/crm/campaigns")
      .then((r) => r.ok ? r.json() : Promise.reject())
      .then((json) => setCampaigns(json.data ?? []))
      .catch(() => {})
      .finally(() => setLoadingHistory(false));
  }, []);

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

  const visibleTemplates = showMoreTemplates ? ACTION_TEMPLATES : ACTION_TEMPLATES.slice(0, 6);
  const historyRows = campaigns.filter((c) => HISTORY_STATUSES.has(c.status));

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-bold text-gray-900">Campanhas de CRM</h2>
          <p className="mt-0.5 text-xs text-gray-500">
            Envie agora, agende uma vez ou configure recorrência via WhatsApp.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <button
            onClick={() => setSelectedTemplate(BLANK_CAMPAIGN_TEMPLATE)}
            className="flex items-center gap-1.5 rounded-xl bg-brand-600 px-4 py-2 text-sm font-bold text-white shadow-sm hover:bg-brand-700 transition-colors"
          >
            <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
            </svg>
            Nova campanha
          </button>
          <button
            onClick={() => setShowCreateModal(true)}
            className="flex items-center gap-1.5 rounded-xl border border-gray-200 bg-white px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50 transition-colors"
          >
            Novo modelo
          </button>
        </div>
      </div>

      {/* ── Campanhas ativas ─────────────────────────────────────────────────── */}
      {!loadingHistory && (
        <CampanhasAtivasSection
          campaigns={campaigns}
          onDetail={(id) => setDetailId(id)}
          onAction={(id, action) => { void handleCampaignAction(id, action); }}
        />
      )}

      {/* ── Ações sugeridas ──────────────────────────────────────────────────── */}
      <div>
        <h3 className="mb-3 text-xs font-bold uppercase tracking-widest text-gray-400">
          Templates de campanha
        </h3>

      {/* Action templates grid */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {visibleTemplates.map((tpl) => {
          const rc  = READINESS_CONFIG[tpl.readiness];
          const count = getAudienceCount(tpl.audienceKey);
          const recommendedType = TEMPLATE_RECOMMENDED_TYPE[tpl.id] ?? "Única";
          return (
            <div
              key={tpl.id}
              className="flex flex-col rounded-2xl border border-gray-100 bg-white p-4 shadow-sm hover:shadow-md transition-shadow"
            >
              {/* Icon + title + recommended type */}
              <div className="flex items-start justify-between gap-2 mb-2">
                <div className="flex items-center gap-2.5">
                  <span className="text-xl">{tpl.emoji}</span>
                  <p className="text-sm font-bold text-gray-900 leading-tight">{tpl.title}</p>
                </div>
                <span className={`shrink-0 rounded-full px-2 py-0.5 text-[9px] font-semibold ${TIPO_BADGE[recommendedType]}`}>
                  {recommendedType}
                </span>
              </div>

              {/* Description */}
              <p className="text-xs text-gray-500 leading-relaxed flex-1 mb-3">{tpl.description}</p>

              {/* Meta row */}
              <div className="flex flex-wrap items-center gap-1.5 mb-3">
                <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-semibold text-gray-600">
                  {tpl.targetLabel}
                </span>
                {count !== null && (
                  <span className="rounded-full bg-brand-50 px-2 py-0.5 text-[10px] font-bold text-brand-700">
                    {count} clientes
                  </span>
                )}
                <span className={`ml-auto rounded-full px-2 py-0.5 text-[10px] font-semibold ${rc.bg} ${rc.text}`}>
                  {rc.label}
                </span>
              </div>

              {/* CTA */}
              <button
                onClick={() => setSelectedTemplate(tpl)}
                className="w-full rounded-xl bg-gray-900 py-2 text-xs font-bold text-white hover:bg-gray-700 transition-colors"
              >
                Configurar campanha
              </button>
            </div>
          );
        })}
      </div>{/* end templates grid */}

      {ACTION_TEMPLATES.length > 6 && (
        <div className="mt-3 text-center">
          <button
            onClick={() => setShowMoreTemplates((v) => !v)}
            className="text-xs font-semibold text-brand-600 hover:text-brand-700 transition-colors"
          >
            {showMoreTemplates
              ? "Ver menos modelos"
              : `Ver mais modelos (${ACTION_TEMPLATES.length - 6} restantes)`}
          </button>
        </div>
      )}

      </div>{/* end Ações sugeridas section */}

      {/* ── Histórico de campanhas (collapsed by default) ────────────────────── */}
      {!loadingHistory && (
        <div data-testid="history-section">
          <button
            onClick={() => setShowHistory((v) => !v)}
            className="flex items-center gap-2 text-xs font-semibold text-gray-500 hover:text-gray-700 transition-colors"
          >
            <svg
              className={`h-3.5 w-3.5 transition-transform ${showHistory ? "rotate-90" : ""}`}
              fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
            </svg>
            Ver histórico
            {historyRows.length > 0 && (
              <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-bold text-gray-600">
                {historyRows.length}
              </span>
            )}
          </button>

          {showHistory && (
            <div className="mt-3">
              {historyRows.length === 0 ? (
                <div className="rounded-2xl border-2 border-dashed border-gray-100 py-6 text-center text-xs text-gray-400">
                  Nenhuma campanha concluída ainda.
                </div>
              ) : (
                <div className="space-y-2">
                  {historyRows.map((c) => {
                    const sc         = CAMPAIGN_STATUS_COLORS[c.status] ?? { bg: "bg-gray-100", text: "text-gray-600" };
                    const cfg        = c.scheduleConfig as { mode?: string; weekdays?: number[]; timeWindow?: { start: string; end: string }; dailyLimit?: number } | null;
                    const isRecurring = cfg?.mode === "RECURRING";
                    const displayDate = c.sentAt
                      ? new Date(c.sentAt).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit" })
                      : c.scheduledAt
                        ? `Prog. ${new Date(c.scheduledAt).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit" })}`
                        : new Date(c.createdAt).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit" });
                    const isDeletable = c.status === "DRAFT" || c.status === "CANCELLED";
                    const convRate    = c.totalSent > 0
                      ? Math.round((c.totalConverted / c.totalSent) * 100)
                      : null;
                    const showStats = ["SENT", "SENDING", "ACTIVE", "PAUSED", "COMPLETED"].includes(c.status) && c.totalSent > 0;
                    return (
                      <div key={c.id} className="rounded-xl border border-gray-100 bg-white px-4 py-3 shadow-sm">
                        <div className="flex items-start gap-3">
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-semibold text-gray-900 truncate">{c.name}</p>
                            <p className="text-[10px] text-gray-400 mt-0.5">
                              {isRecurring ? "Recorrente · WhatsApp" : `WhatsApp · ${displayDate}`}
                            </p>
                          </div>
                          <div className="shrink-0 flex items-center gap-2">
                            <span className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-bold ${sc.bg} ${sc.text}`}>
                              {CAMPAIGN_STATUS_LABELS[c.status] ?? c.status}
                            </span>
                            <button
                              onClick={() => setDetailId(c.id)}
                              className="rounded-lg bg-gray-100 px-2.5 py-1 text-[10px] font-semibold text-gray-600 hover:bg-gray-200 transition-colors"
                            >
                              Ver detalhes
                            </button>
                            {isDeletable && (
                              <button
                                title="Excluir"
                                onClick={async () => {
                                  if (!confirm("Excluir esta ação?")) return;
                                  const res = await fetch(`/api/crm/campaigns/${c.id}`, { method: "DELETE" });
                                  if (res.ok) setCampaigns((prev) => prev.filter((x) => x.id !== c.id));
                                }}
                                className="rounded-lg p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-600 transition-colors"
                              >
                                <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                </svg>
                              </button>
                            )}
                          </div>
                        </div>

                        {isRecurring && cfg && (
                          <div className="mt-1.5 text-[10px] text-gray-500">
                            {cfg.weekdays && cfg.weekdays.map((d: number) => WEEKDAY_LABELS[d]).join(", ")}
                            {cfg.timeWindow && ` · ${cfg.timeWindow.start}–${cfg.timeWindow.end}`}
                            {cfg.dailyLimit && ` · ${cfg.dailyLimit}/dia`}
                          </div>
                        )}

                        {showStats && (
                          <div className="mt-2 flex flex-wrap gap-3 text-[10px] text-gray-500 border-t border-gray-50 pt-2">
                            <span>{c.totalSent} enviados</span>
                            {c.totalFailed > 0 && <span className="text-red-500">{c.totalFailed} falhas</span>}
                            {c.totalResponded > 0 && <span className="text-blue-600">{c.totalResponded} responderam</span>}
                            {c.totalConverted > 0 && (
                              <span className="text-green-600 font-semibold">
                                {c.totalConverted} conversões
                                {convRate !== null && ` (${convRate}%)`}
                                {" · R$"}{Number(c.totalRevenue).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ── Modelos salvos (ex "Minhas ações") ──────────────────────────────── */}
      <div>
        <div className="mb-3">
          <h3 className="text-xs font-bold uppercase tracking-widest text-gray-400">
            Modelos salvos
          </h3>
          <p className="mt-1 text-xs text-gray-400">
            Rascunhos de mensagens para referência.{" "}
            <span className="font-semibold text-gray-500">Para enviar mensagens, use uma Campanha — única ou recorrente.</span>
          </p>
        </div>

        {loadingCustom ? (
          <div className="py-6 text-center text-sm text-gray-400">Carregando…</div>
        ) : customActions.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-gray-200 py-10 text-center">
            <span className="text-3xl">✍️</span>
            <p className="mt-2 text-sm font-semibold text-gray-500">Nenhum modelo salvo ainda</p>
            <p className="mt-0.5 text-xs text-gray-400">
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
                <div key={action.id} className="rounded-2xl border border-gray-100 bg-white shadow-sm overflow-hidden">
                  <div className="flex items-center gap-3 px-4 py-3">
                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-1.5 mb-1">
                        <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-semibold text-gray-600">
                          {OBJECTIVE_LABELS[action.objective] ?? action.objective}
                        </span>
                        <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-semibold text-gray-600">
                          {SEGMENT_LABELS[action.targetSegment] ?? action.targetSegment}
                        </span>
                        {(() => {
                          const sc = CAMPAIGN_STATUS_COLORS[action.status] ?? { bg: "bg-gray-100", text: "text-gray-600" };
                          return (
                            <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${sc.bg} ${sc.text}`}>
                              {CAMPAIGN_STATUS_LABELS[action.status] ?? "Rascunho"}
                            </span>
                          );
                        })()}
                      </div>
                      <p className="text-sm font-bold text-gray-900 truncate">{action.name}</p>
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
                        className="rounded-lg bg-gray-100 px-3 py-1.5 text-xs font-semibold text-gray-600 hover:bg-gray-200 transition-colors"
                      >
                        {isExpanded ? "Fechar" : "Ver"}
                      </button>
                      <button
                        onClick={() => handleDeleteAction(action.id)}
                        disabled={deletingAction === action.id}
                        title="Excluir modelo"
                        className="rounded-lg p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-600 transition-colors disabled:opacity-50"
                      >
                        <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                      </button>
                    </div>
                  </div>

                  {isExpanded && (
                    <div className="border-t border-gray-50 bg-gray-50 px-4 py-3 space-y-3">
                      <div className="grid grid-cols-2 gap-2 text-xs">
                        <div>
                          <p className="font-semibold text-gray-400 uppercase tracking-wide text-[10px]">Canal</p>
                          <p className="text-gray-700 mt-0.5">{CHANNEL_LABELS[action.channel] ?? action.channel}</p>
                        </div>
                        <div>
                          <p className="font-semibold text-gray-400 uppercase tracking-wide text-[10px]">Criada em</p>
                          <p className="text-gray-700 mt-0.5">
                            {new Date(action.createdAt).toLocaleDateString("pt-BR")}
                          </p>
                        </div>
                      </div>
                      <div>
                        <p className="font-semibold text-gray-400 uppercase tracking-wide text-[10px] mb-1">Mensagem</p>
                        <div className="rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm text-gray-700 whitespace-pre-wrap">
                          {action.message}
                        </div>
                      </div>
                      {action.notes && (
                        <div>
                          <p className="font-semibold text-gray-400 uppercase tracking-wide text-[10px] mb-1">Observações internas</p>
                          <p className="text-xs text-gray-500 italic">{action.notes}</p>
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
          onClose={() => setDetailId(null)}
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
        copied ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500 hover:bg-gray-200"
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
        <div className="border-t border-brand-100 bg-white p-4 space-y-3">
          <textarea
            rows={3}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            className="w-full rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-800 focus:border-brand-400 focus:outline-none resize-none"
          />
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-[10px] text-gray-400 flex-1 min-w-0">
              Use <code className="bg-gray-100 px-1 rounded">{"{nome}"}</code> para personalizar.
            </p>
            <button
              onClick={copyTemplate}
              className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
                copied === "__template__"
                  ? "bg-green-100 text-green-700"
                  : "bg-gray-100 text-gray-600 hover:bg-gray-200"
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
              <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-gray-400">
                Copiar mensagem personalizada para cada cliente
              </p>
              <div className="max-h-52 overflow-y-auto space-y-1.5">
                {customers.slice(0, 30).map((c) => (
                  <div
                    key={c.id}
                    className="flex items-center justify-between gap-2 rounded-xl border border-gray-100 bg-gray-50 px-3 py-2"
                  >
                    <div className="min-w-0">
                      <p className="text-xs font-semibold text-gray-900 truncate">{c.name}</p>
                      <p className="text-[10px] text-gray-400">{formatPhone(c.phone)}</p>
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
                  <p className="text-center text-[10px] text-gray-400 py-1.5">
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
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 px-4 pb-4 sm:pb-0"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="w-full max-w-md rounded-2xl bg-white shadow-xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4">
          <div>
            <h3 className="text-sm font-semibold text-gray-900">
              Enviar WhatsApp para {customer.name}
            </h3>
            <p className="mt-0.5 text-xs text-gray-500">{maskedPhone}</p>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-colors"
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
                className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm text-gray-900 placeholder:text-gray-400 focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-100 resize-none transition"
              />
              <p className="text-right text-xs text-gray-400">{message.length}/4096</p>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="flex gap-2 border-t border-gray-100 px-5 py-4">
          <button
            onClick={onClose}
            className="flex-1 rounded-xl border border-gray-200 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
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

type CRMFilter = "all" | "inactive" | "quente" | "morno" | "frio" | "neverOrdered" | "firstTime" | "recent" | "tier-bronze" | "tier-prata" | "tier-ouro" | "tier-diamante";

function CustomersTab({
  initialCustomers,
  initialFilter = "all",
  onImportOpen,
  reviewLinks,
}: {
  initialCustomers: CRMCustomer[];
  initialFilter?: CRMFilter;
  onImportOpen: () => void;
  reviewLinks: { google: string | null; ifood: string | null };
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

  // Debounce search → debSearch triggers the API call
  useEffect(() => {
    const t = setTimeout(() => setDebSearch(search), 350);
    return () => clearTimeout(t);
  }, [search]);

  // Single fetch effect: runs on filter OR debounced search change
  useEffect(() => {
    if (filter === "all" && !debSearch) {
      setCustomers(initialCustomers);
      setLoading(false);
      return;
    }
    setLoading(true);
    const qs = new URLSearchParams({ filter });
    if (debSearch) qs.set("search", debSearch);
    fetch(`/api/crm/customers?${qs}`)
      .then((r) => r.json())
      .then((json) => setCustomers((json.data as CRMCustomer[]) ?? []))
      .catch(() => setCustomers([]))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter, debSearch]);

  function applyFilter(f: CRMFilter) {
    setFilter(f);
  }

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

      {/* Search box */}
      <div className="relative">
        <svg
          className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400"
          fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z" />
        </svg>
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar cliente por nome ou telefone…"
          className="w-full rounded-xl border border-gray-200 bg-white py-2.5 pl-10 pr-10 text-sm text-gray-900 placeholder:text-gray-400 focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-100 transition"
        />
        {search && (
          <button
            onClick={() => setSearch("")}
            className="absolute right-3 top-1/2 -translate-y-1/2 rounded-lg p-0.5 text-gray-400 hover:text-gray-600 transition-colors"
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
                : "bg-gray-100 text-gray-600 hover:bg-gray-200"
            }`}
          >
            {CUSTOMER_FILTER_LABELS[f]}
          </button>
        ))}
        <span
          className="text-[10px] font-bold uppercase tracking-wide text-gray-400 pl-1"
          title="Os níveis Bronze, Prata, Ouro e Diamante são definidos no Programa de Relacionamento."
        >Nível:</span>
        {filterKeys.filter((f) => f.startsWith("tier-")).map((f) => (
          <button
            key={f}
            onClick={() => applyFilter(f)}
            title="Os níveis são definidos no Programa de Relacionamento."
            className={`rounded-full px-3.5 py-1.5 text-xs font-semibold transition-all ${
              filter === f
                ? "bg-brand-600 text-white shadow-sm"
                : "bg-gray-100 text-gray-600 hover:bg-gray-200"
            }`}
          >
            {CUSTOMER_FILTER_LABELS[f]}
          </button>
        ))}
        <select
          value={sortValue}
          onChange={(e) => setSortValue(e.target.value)}
          className="rounded-full border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-600 focus:outline-none focus:ring-1 focus:ring-brand-300"
          aria-label="Ordenar clientes"
        >
          {CRM_SORT_OPTS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        <span className="text-xs text-gray-400 ml-1">
          {debSearch ? `${customers.length} resultado${customers.length !== 1 ? "s" : ""}` : `${customers.length} clientes`}
        </span>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <NewCustomerButton onCreated={() => applyFilter(filter)} />
          {customers.length > 0 && (
            <button
              onClick={() => exportCSV(customers)}
              className="flex items-center gap-1.5 rounded-full border border-gray-200 bg-white px-3.5 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-50 transition-colors"
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
        <div className="py-12 text-center text-sm text-gray-400">Carregando…</div>
      ) : customers.length === 0 ? (
        <div className="py-12 text-center space-y-3">
          <p className="text-sm text-gray-500">
            {debSearch
              ? "Não encontramos clientes com esse nome ou telefone."
              : "Nenhum cliente neste filtro."}
          </p>
          {debSearch && (
            <button
              onClick={() => setSearch("")}
              className="rounded-full border border-gray-200 px-4 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50 transition-colors"
            >
              Limpar busca
            </button>
          )}
        </div>
      ) : (
        <>
          {/* Desktop table */}
          <div className="hidden sm:block overflow-x-auto rounded-2xl border border-gray-100 bg-white shadow-sm">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 text-left text-[11px] font-semibold uppercase tracking-wide text-gray-400">
                  <th className="px-4 py-3">Cliente</th>
                  <th className="px-4 py-3">Tier</th>
                  <th className="px-4 py-3 text-right">Gasto total</th>
                  <th className="px-4 py-3 text-right">Pedidos</th>
                  <th className="px-4 py-3 text-right">Último pedido</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {sortedCustomers.map((c) => (
                  <tr key={c.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3">
                      <Link href={`/customers/${c.id}`} className="hover:text-brand-600 transition-colors">
                        <p className="font-semibold text-gray-900 text-sm">
                          {c.name}
                          {c.isUsingImportedData && (
                            <span className="ml-1.5 inline-flex items-center rounded-full bg-amber-100 px-1.5 py-0.5 text-[9px] font-medium text-amber-700">Histórico importado</span>
                          )}
                          {c.contactStatus === "SEM_TELEFONE" && (
                            <span className="ml-1.5 inline-flex items-center rounded-full bg-gray-100 px-1.5 py-0.5 text-[9px] font-medium text-gray-500">Sem telefone</span>
                          )}
                          {!c.crmContactable && c.contactStatus !== "SEM_TELEFONE" && (
                            <span className="ml-1.5 inline-flex items-center rounded-full bg-red-100 px-1.5 py-0.5 text-[9px] font-medium text-red-600">Não contatável</span>
                          )}
                          {c.dataEnrichmentStatus === "NEEDS_ENRICHMENT" && (
                            <span className="ml-1.5 inline-flex items-center rounded-full bg-amber-100 px-1.5 py-0.5 text-[9px] font-medium text-amber-700">Precisa enriquecer</span>
                          )}
                        </p>
                        <span className="text-[11px] text-gray-400">
                          {formatPhone(c.phone)}
                          <CopyPhoneButton phone={c.phone} />
                        </span>
                      </Link>
                    </td>
                    <td className="px-4 py-3">
                      <TierBadge tier={c.tier} />
                    </td>
                    <td className="px-4 py-3 text-right font-semibold text-gray-900">
                      R${formatCurrency(c.totalSpend)}
                    </td>
                    <td className="px-4 py-3 text-right text-gray-600">
                      {c.totalOrders}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <span className={c.daysSinceLastOrder != null && c.daysSinceLastOrder > 30
                        ? "text-red-500 font-medium"
                        : "text-gray-600"
                      }>
                        {relativeDate(c.lastOrderAt)}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      {c.contactStatus === "OPT_OUT" ? (
                        <span className="text-[10px] text-gray-400 italic">Opt-out</span>
                      ) : !c.phone || c.contactStatus === "SEM_TELEFONE" ? (
                        <span className="text-[10px] text-gray-400 italic">Sem telefone</span>
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
            <div className="border-t border-gray-50 px-4 py-3 flex flex-wrap gap-3">
              {tierOrder.map((t) => {
                const cfg = TIER_CONFIG[t];
                const count = customers.filter((c) => c.tier === t).length;
                return (
                  <span key={t} className="text-[11px] text-gray-500">
                    {cfg.icon} {cfg.label}: <strong>{count}</strong>
                  </span>
                );
              })}
            </div>
          </div>

          {/* Mobile cards */}
          <div className="sm:hidden space-y-2">
            {sortedCustomers.map((c) => (
              <div key={c.id} className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
                <Link href={`/customers/${c.id}`}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-sm font-bold text-gray-900 truncate">
                        {c.name}
                        {c.contactStatus === "SEM_TELEFONE" && (
                          <span className="ml-1.5 inline-flex items-center rounded-full bg-gray-100 px-1.5 py-0.5 text-[9px] font-medium text-gray-500">Sem telefone</span>
                        )}
                        {!c.crmContactable && c.contactStatus !== "SEM_TELEFONE" && (
                          <span className="ml-1.5 inline-flex items-center rounded-full bg-red-100 px-1.5 py-0.5 text-[9px] font-medium text-red-600">Não contatável</span>
                        )}
                        {c.dataEnrichmentStatus === "NEEDS_ENRICHMENT" && (
                          <span className="ml-1.5 inline-flex items-center rounded-full bg-amber-100 px-1.5 py-0.5 text-[9px] font-medium text-amber-700">Precisa enriquecer</span>
                        )}
                      </p>
                      <span className="text-xs text-gray-400">
                        {formatPhone(c.phone)}
                        <CopyPhoneButton phone={c.phone} />
                      </span>
                    </div>
                    <TierBadge tier={c.tier} />
                  </div>
                  <div className="mt-2 flex gap-4 text-xs text-gray-500">
                    <span>R${formatCurrency(c.totalSpend)}</span>
                    <span>{c.totalOrders} pedido{c.totalOrders !== 1 ? "s" : ""}</span>
                    <span className={c.daysSinceLastOrder != null && c.daysSinceLastOrder > 30 ? "text-red-500 font-medium" : ""}>
                      {relativeDate(c.lastOrderAt)}
                    </span>
                  </div>
                </Link>
                {c.phone && c.contactStatus !== "SEM_TELEFONE" && c.contactStatus !== "OPT_OUT" && (
                  <div className="mt-3 border-t border-gray-50 pt-3">
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

      {/* Reactivation Helper */}
      <ReactivationHelper customers={customers} reviewLinks={reviewLinks} />
    </div>
  );
}

// ── Avaliações Tab ────────────────────────────────────────────────────────────

const MOCK_REVIEWS = [
  { author: "Maria S.", stars: 5, text: "Comida incrível, entrega rápida! Voltarei com certeza.", date: "há 2 dias" },
  { author: "João P.",  stars: 5, text: "Atendimento excelente e pedido chegou quente.",          date: "há 5 dias" },
  { author: "Ana L.",   stars: 4, text: "Muito bom! Apenas a embalagem poderia ser melhor.",       date: "há 1 semana" },
];

function StarRating({ count }: { count: number }) {
  return (
    <span className="text-amber-400 text-base leading-none">
      {"★".repeat(count)}{"☆".repeat(5 - count)}
    </span>
  );
}

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
        <div className="rounded-xl border border-gray-200 bg-white p-5 space-y-3">
          <div className="flex items-center gap-2">
            <span className="text-2xl">🌐</span>
            <h3 className="text-sm font-semibold text-gray-900">Google Reviews</h3>
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
            <p className="text-xs text-gray-400">
              Link não configurado.{" "}
              <Link href="/marca" className="text-brand-600 underline">Adicionar →</Link>
            </p>
          )}
          <div className="space-y-2 pt-1">
            {MOCK_REVIEWS.map((r) => (
              <div key={r.author} className="rounded-lg border border-gray-100 bg-gray-50 p-3">
                <div className="flex items-center justify-between mb-1">
                  <p className="text-xs font-semibold text-gray-800">{r.author}</p>
                  <span className="text-[10px] text-gray-400">{r.date}</span>
                </div>
                <StarRating count={r.stars} />
                <p className="mt-1 text-xs text-gray-600">{r.text}</p>
              </div>
            ))}
            <p className="text-[10px] text-gray-400 pt-1">
              * Avaliações de exemplo — integração real com a API do Google em breve.
            </p>
          </div>
        </div>

        {/* iFood */}
        <div className="rounded-xl border border-gray-200 bg-white p-5 space-y-3">
          <div className="flex items-center gap-2">
            <span className="text-2xl">🛵</span>
            <h3 className="text-sm font-semibold text-gray-900">iFood Avaliações</h3>
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
            <p className="text-xs text-gray-400">
              Link não configurado.{" "}
              <Link href="/marca" className="text-brand-600 underline">Adicionar →</Link>
            </p>
          )}
          <div className="space-y-2 pt-1">
            {MOCK_REVIEWS.map((r) => (
              <div key={r.author} className="rounded-lg border border-gray-100 bg-gray-50 p-3">
                <div className="flex items-center justify-between mb-1">
                  <p className="text-xs font-semibold text-gray-800">{r.author}</p>
                  <span className="text-[10px] text-gray-400">{r.date}</span>
                </div>
                <StarRating count={r.stars} />
                <p className="mt-1 text-xs text-gray-600">{r.text}</p>
              </div>
            ))}
            <p className="text-[10px] text-gray-400 pt-1">
              * Avaliações de exemplo — integração real com a API do iFood em breve.
            </p>
          </div>
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

      <div className="rounded-xl border border-gray-200 bg-white p-5 space-y-3">
        <h3 className="text-sm font-semibold text-gray-900">📨 Template Pós-Venda</h3>
        <p className="text-xs text-gray-500">Use este template nas campanhas de WhatsApp após o pedido.</p>
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

// ── Main CRM Component ────────────────────────────────────────────────────────

// ── Automações Tab ────────────────────────────────────────────────────────────

type AutomationLocalRow = {
  trigger: string;
  isEnabled: boolean;
  messageTemplate: string;
  triggerAfterDays: number;
  oncePerCustomerLifetime: boolean;
  sendTime: string;
  sendDays: number[];
};

const AUTOMATION_META: Record<string, {
  emoji: string;
  label: string;
  description: string;
  defaultDays: number;
  daysLabel: string;
  showDays: boolean;
}> = {
  REACTIVATION: {
    emoji: "🔄",
    label: "Recuperação de clientes",
    description: "Dispara para clientes que não pedem há X dias. Cada cliente recebe uma vez por período.",
    defaultDays: 30,
    daysLabel: "Dias sem pedido para disparar",
    showDays: true,
  },
  BIRTHDAY: {
    emoji: "🎂",
    label: "Feliz aniversário",
    description: "Envia mensagem de aniversário no dia do cliente (requer data de nascimento cadastrada). Mensagens de aniversário não entram na régua comum de frequência — são enviadas mesmo que o cliente tenha recebido outra campanha recentemente.",
    defaultDays: 0,
    daysLabel: "",
    showDays: false,
  },
  POST_ORDER: {
    emoji: "⭐",
    label: "Pós-pedido",
    description: "Envia mensagem automaticamente após um pedido ser entregue. Com impacto único por cliente ativado, cada cliente recebe esta mensagem apenas uma vez na vida.",
    defaultDays: 1,
    daysLabel: "Dias após entrega para disparar",
    showDays: true,
  },
};

const AUTOMATION_TRIGGERS = ["REACTIVATION", "BIRTHDAY", "POST_ORDER"] as const;

function AutomacoesTab() {
  const [local, setLocal]   = useState<Record<string, AutomationLocalRow>>(() => {
    const init: Record<string, AutomationLocalRow> = {};
    for (const trigger of AUTOMATION_TRIGGERS) {
      const meta = AUTOMATION_META[trigger];
      const defaultDays = meta?.defaultDays ?? 0;
      init[trigger] = { trigger, isEnabled: false, messageTemplate: "", triggerAfterDays: defaultDays, oncePerCustomerLifetime: trigger === "POST_ORDER", sendTime: "08:00", sendDays: [0, 1, 2, 3, 4, 5, 6] };
    }
    return init;
  });
  const [loading,  setLoading]  = useState(true);
  const [saving,   setSaving]   = useState<Record<string, boolean>>({});
  const [savedOk,  setSavedOk]  = useState<Record<string, boolean>>({});

  useEffect(() => {
    fetch("/api/crm/automations")
      .then((r) => r.ok ? r.json() : Promise.reject())
      .then((json: { data?: { trigger: string; isEnabled: boolean; messageTemplate: string; triggerAfterDays: number; oncePerCustomerLifetime?: boolean; scheduleConfig?: { sendTime?: string; sendDays?: number[] } | null }[] }) => {
        const rows = json.data ?? [];
        setLocal((prev) => {
          const next = { ...prev };
          for (const row of rows) {
            next[row.trigger] = {
              trigger:                 row.trigger,
              isEnabled:               row.isEnabled,
              messageTemplate:         row.messageTemplate,
              triggerAfterDays:        row.triggerAfterDays,
              oncePerCustomerLifetime: row.oncePerCustomerLifetime ?? (row.trigger === "POST_ORDER"),
              sendTime:                row.scheduleConfig?.sendTime  ?? prev[row.trigger]?.sendTime  ?? "08:00",
              sendDays:                row.scheduleConfig?.sendDays  ?? prev[row.trigger]?.sendDays  ?? [0, 1, 2, 3, 4, 5, 6],
            };
          }
          return next;
        });
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  function updateLocal(trigger: string, patch: Partial<AutomationLocalRow>) {
    setLocal((prev) => ({
      ...prev,
      [trigger]: { ...prev[trigger], ...patch } as AutomationLocalRow,
    }));
  }

  async function handleSave(trigger: string) {
    const state = local[trigger];
    if (!state) return;
    setSaving((prev) => ({ ...prev, [trigger]: true }));
    try {
      const res = await fetch(`/api/crm/automations/${trigger}`, {
        method:  "PATCH",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({
          isEnabled:               state.isEnabled,
          messageTemplate:         state.messageTemplate,
          triggerAfterDays:        state.triggerAfterDays,
          oncePerCustomerLifetime: state.oncePerCustomerLifetime,
          scheduleConfig:          {
            sendTime: state.sendTime,
            sendDays: state.sendDays,
            timezone: "America/Sao_Paulo",
          },
        }),
      });
      if (res.ok) {
        setSavedOk((prev) => ({ ...prev, [trigger]: true }));
        setTimeout(() => setSavedOk((prev) => ({ ...prev, [trigger]: false })), 2500);
      }
    } finally {
      setSaving((prev) => ({ ...prev, [trigger]: false }));
    }
  }

  if (loading) {
    return <div className="py-12 text-center text-sm text-gray-400">Carregando automações…</div>;
  }

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-base font-bold text-gray-900">Automações de CRM</h2>
        <p className="mt-0.5 text-xs text-gray-500">
          Regras sempre ativas. Configure os dias e o horário de disparo para cada automação.
        </p>
      </div>

      {AUTOMATION_TRIGGERS.map((trigger) => {
        const meta  = AUTOMATION_META[trigger];
        const state = local[trigger];
        if (!meta || !state) return null;
        return (
          <div
            key={trigger}
            className={`rounded-2xl border p-5 space-y-4 transition-colors ${
              state.isEnabled ? "border-green-200 bg-green-50/30" : "border-gray-100 bg-white"
            }`}
          >
            {/* Header row */}
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-3">
                <span className="text-2xl">{meta.emoji}</span>
                <div>
                  <p className="text-sm font-bold text-gray-900">{meta.label}</p>
                  <p className="text-xs text-gray-500 mt-0.5">{meta.description}</p>
                </div>
              </div>
              {/* Toggle */}
              <button
                onClick={() => updateLocal(trigger, { isEnabled: !state.isEnabled })}
                aria-label={state.isEnabled ? "Desativar" : "Ativar"}
                className={`shrink-0 relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none ${
                  state.isEnabled ? "bg-green-500" : "bg-gray-200"
                }`}
              >
                <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
                  state.isEnabled ? "translate-x-6" : "translate-x-1"
                }`} />
              </button>
            </div>

            {/* Days field */}
            {meta.showDays && (
              <div>
                <label className="block text-[10px] font-semibold uppercase tracking-wide text-gray-400 mb-1.5">
                  {meta.daysLabel}
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min={1}
                    max={365}
                    value={state.triggerAfterDays}
                    onChange={(e) => updateLocal(trigger, { triggerAfterDays: Math.max(1, parseInt(e.target.value) || 1) })}
                    className="w-20 rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-sm text-gray-800 focus:border-brand-400 focus:outline-none"
                  />
                  <span className="text-xs text-gray-500">dias</span>
                </div>
              </div>
            )}

            {/* Timing config */}
            <div className="space-y-2.5">
              <label className="block text-[10px] font-semibold uppercase tracking-wide text-gray-400">
                Dias de envio
              </label>
              <div className="flex gap-1">
                {WEEKDAY_LABELS.map((label, day) => (
                  <button
                    key={day}
                    type="button"
                    onClick={() => {
                      const current = state.sendDays;
                      const next = current.includes(day)
                        ? current.filter((d) => d !== day)
                        : [...current, day].sort((a, b) => a - b);
                      updateLocal(trigger, { sendDays: next });
                    }}
                    className={`flex-1 rounded-lg py-1.5 text-[10px] font-bold border transition-colors ${
                      state.sendDays.includes(day)
                        ? "bg-brand-600 text-white border-brand-600"
                        : "bg-white text-gray-500 border-gray-200 hover:bg-gray-50"
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
              {state.sendDays.length === 0 && (
                <p className="text-[10px] text-red-500">Selecione pelo menos um dia</p>
              )}
              <div className="flex items-center gap-2">
                <label className="text-[10px] font-semibold text-gray-500 shrink-0">Horário de envio</label>
                <input
                  type="time"
                  value={state.sendTime}
                  onChange={(e) => updateLocal(trigger, { sendTime: e.target.value })}
                  className="rounded-lg border border-gray-200 bg-white px-2.5 py-1 text-xs text-gray-800 focus:border-brand-400 focus:outline-none"
                />
                <span className="text-[10px] text-gray-400">(Brasília)</span>
              </div>
            </div>

            {/* Lifetime impact rule — POST_ORDER only */}
            {trigger === "POST_ORDER" && (
              <div className="flex items-center justify-between rounded-xl border border-gray-100 bg-white px-4 py-3">
                <div>
                  <p className="text-xs font-semibold text-gray-800">Impacto único por cliente</p>
                  <p className="text-[10px] text-gray-400 mt-0.5">
                    Cada cliente recebe esta mensagem apenas uma vez na vida, independente da quantidade de pedidos.
                  </p>
                </div>
                <button
                  onClick={() => updateLocal(trigger, { oncePerCustomerLifetime: !state.oncePerCustomerLifetime })}
                  aria-label={state.oncePerCustomerLifetime ? "Desativar impacto único" : "Ativar impacto único"}
                  className={`shrink-0 relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none ${
                    state.oncePerCustomerLifetime ? "bg-brand-600" : "bg-gray-200"
                  }`}
                >
                  <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
                    state.oncePerCustomerLifetime ? "translate-x-6" : "translate-x-1"
                  }`} />
                </button>
              </div>
            )}

            {/* Message template */}
            <div>
              <label className="block text-[10px] font-semibold uppercase tracking-wide text-gray-400 mb-1.5">
                Mensagem
              </label>
              <textarea
                rows={4}
                value={state.messageTemplate}
                onChange={(e) => updateLocal(trigger, { messageTemplate: e.target.value })}
                placeholder="Oi {nome}! …"
                className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm text-gray-800 resize-none focus:border-brand-400 focus:outline-none focus:ring-1 focus:ring-brand-100"
              />
              <p className="mt-1 text-[10px] text-gray-400">
                Use <code className="rounded bg-gray-100 px-1">{"{nome}"}</code> para o nome do cliente
                {trigger === "POST_ORDER" && (
                  <>, <code className="rounded bg-gray-100 px-1">{"{instagram}"}</code> para o link do Instagram</>
                )}.
              </p>
            </div>

            {/* Save row */}
            <div className="flex items-center gap-3">
              <button
                onClick={() => handleSave(trigger)}
                disabled={saving[trigger]}
                className="rounded-xl bg-brand-600 px-5 py-2 text-sm font-bold text-white hover:bg-brand-700 disabled:opacity-50 transition-colors"
              >
                {saving[trigger] ? "Salvando…" : "Salvar"}
              </button>
              {savedOk[trigger] && (
                <span className="text-xs font-semibold text-green-600">✓ Salvo</span>
              )}
              {!state.isEnabled && (
                <span className="text-[10px] text-gray-400">Desativada — salve após ativar para iniciar os disparos.</span>
              )}
            </div>
          </div>
        );
      })}

      <div className="rounded-xl border border-dashed border-gray-200 bg-gray-50 px-4 py-3">
        <p className="text-xs text-gray-500">
          <strong>Como funciona:</strong> O cron executa diariamente e envia para clientes elegíveis que ainda não receberam a automação no período. Ative e salve a mensagem para iniciar.
        </p>
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
};

type SafetyCfg = typeof DEFAULT_CFG;

const CFG_INPUT =
  "w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:border-orange-400 focus:outline-none focus:ring-2 focus:ring-orange-100 transition";

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
      <label className="mb-1.5 block text-sm font-medium text-gray-700">{label}</label>
      {children}
      {hint && <p className="mt-1 text-xs text-gray-400">{hint}</p>}
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
        <div className={`h-5 w-9 rounded-full transition-colors ${checked ? "bg-brand-500" : "bg-gray-300"}`} />
        <div className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform ${checked ? "translate-x-4" : "translate-x-0.5"}`} />
      </div>
      <div>
        <p className="text-sm font-medium text-gray-800">{label}</p>
        {desc && <p className="text-xs text-gray-500">{desc}</p>}
      </div>
    </label>
  );
}

function CfgCard({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
      <div className="mb-5">
        <h2 className="text-base font-semibold text-gray-900">{title}</h2>
        {subtitle && <p className="mt-0.5 text-sm text-gray-500">{subtitle}</p>}
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

  useEffect(() => {
    fetch("/api/settings/crm-safety")
      .then((r) => r.json())
      .then(({ data }) => { if (data) setCfg({ ...DEFAULT_CFG, ...data }); })
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

        <div className="mt-5 space-y-4 border-t border-gray-100 pt-5">
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

      {/* B — Comportamento gradual (delay) */}
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
        <p className="mt-3 text-xs text-gray-400">
          A detecção é automática via webhook do WhatsApp. Clientes com opt-out são excluídos de todos os envios futuros de CRM.
          A lista de palavras é gerenciada pela plataforma e não pode ser editada aqui.
        </p>
      </CfgCard>

      {/* D — Campanhas */}
      <CfgCard
        title="Campanhas"
        subtitle="Comportamento padrão das campanhas manuais."
      >
        <div className="rounded-xl border border-amber-100 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          <p className="font-semibold">⚠️ Campanhas para clientes frios</p>
          <p className="mt-1 text-xs text-amber-700">
            Campanhas enviadas a clientes que não interagem há mais de 60 dias têm maior risco de bloqueio.
            Use o cap diário acima para limitar o volume. Recomendamos no máximo 20 mensagens por dia para campanhas de reativação.
          </p>
        </div>
        <p className="mt-3 text-xs text-gray-400">
          O cap diário configurado em &quot;Segurança de Envio&quot; se aplica a todos os envios manuais.
          Campanhas recorrentes usam a configuração de limite definida em cada campanha.
        </p>
      </CfgCard>

      {/* E — Campanhas recorrentes */}
      <CfgCard
        title="Campanhas recorrentes"
        subtitle="Campanhas que rodam automaticamente (reativação, aniversário, pós-pedido) também respeitam o horário quieto e o cap diário."
      >
        <ul className="space-y-2.5">
          {[
            { icon: "🔄", text: "Recuperação de frios/mornos: envia para clientes sem pedido há X dias, no ritmo definido na campanha" },
            { icon: "🎂", text: "Aniversário: envia no dia do aniversário do cliente. Não entra na régua de cooldown — é enviada mesmo que o cliente tenha recebido outra campanha recentemente. Opt-out e segurança do WhatsApp continuam sendo respeitados." },
            { icon: "⭐", text: "Pós-pedido / avaliação: envia depois da compra, no intervalo configurado na campanha" },
            { icon: "🛡️", text: "Todas as campanhas recorrentes respeitam o cooldown por cliente e o cap diário global" },
          ].map((item) => (
            <li key={item.text} className="flex items-start gap-2.5 text-sm text-gray-700">
              <span className="shrink-0">{item.icon}</span>
              <span>{item.text}</span>
            </li>
          ))}
        </ul>
        <p className="mt-3 text-xs text-gray-400">
          Para criar ou ajustar uma campanha que roda automaticamente, abra a aba <strong>Campanhas</strong> e
          escolha o tipo <strong>Recorrente</strong>.
        </p>
      </CfgCard>

      {/* F — Avaliações */}
      <CfgCard
        title="Avaliações"
        subtitle="Links de avaliação usados em templates de campanha e automações pós-pedido."
      >
        <p className="text-sm text-gray-500">
          Configure os links de avaliação na aba{" "}
          <span className="font-medium text-gray-700">Avaliações</span>{" "}
          ou em{" "}
          <Link href="/settings/store" className="text-brand-600 hover:underline">Configurações → Loja</Link>.
        </p>
      </CfgCard>

      {/* G — IA de mensagens (futuro) */}
      <div className="rounded-2xl border border-dashed border-gray-200 p-5">
        <div className="flex items-start gap-3">
          <span className="mt-0.5 text-lg">🤖</span>
          <div>
            <p className="text-sm font-semibold text-gray-700">
              Mensagens dinâmicas por IA
              <span className="ml-2 rounded-full bg-gray-200 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide text-gray-500">em breve</span>
            </p>
            <p className="mt-1 text-xs text-gray-500">
              Em breve, o Agente CRM poderá variar mensagens automaticamente para evitar repetição e aumentar o engajamento.
            </p>
          </div>
        </div>
      </div>

      {/* Proteções permanentes */}
      <CfgCard title="Proteções Permanentes">
        <ul className="space-y-2.5">
          {[
            { icon: "🚫", text: "Clientes com opt-out são sempre excluídos de qualquer envio CRM" },
            { icon: "📵", text: "Clientes sem telefone válido nunca recebem mensagens" },
            { icon: "🔄", text: "Deduplicação: mesmo cliente não recebe a mesma campanha duas vezes" },
            { icon: "⏱️", text: "Cooldown cruzado: cliente que recebeu qualquer campanha hoje aguarda cooldown (exceto mensagens de aniversário)" },
          ].map((item) => (
            <li key={item.text} className="flex items-start gap-2.5 text-sm text-gray-700">
              <span className="shrink-0 text-base">{item.icon}</span>
              <span>{item.text}</span>
            </li>
          ))}
        </ul>
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

function SegmentacaoConfig() {
  const DEFAULT_SEG = { hotMaxDays: 30, warmMaxDays: 60, lostMinDays: 120 };
  const [loading,   setLoading]   = useState(true);
  const [saving,    setSaving]    = useState(false);
  const [success,   setSuccess]   = useState<string | null>(null);
  const [segError,  setSegError]  = useState<string | null>(null);
  const [seg, setSeg] = useState(DEFAULT_SEG);

  useEffect(() => {
    fetch("/api/settings/crm-segments")
      .then((r) => r.json())
      .then(({ data }) => { if (data) setSeg({ ...DEFAULT_SEG, ...data }); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  function setField(key: keyof typeof DEFAULT_SEG, raw: string) {
    const val = Math.max(1, parseInt(raw, 10) || 1);
    setSeg((prev) => ({ ...prev, [key]: val }));
  }

  const validationError =
    seg.hotMaxDays  >= seg.warmMaxDays ? "'Cliente quente' deve ser menor que 'Cliente morno'."
    : seg.warmMaxDays >= seg.lostMinDays ? "'Cliente morno' deve ser menor que 'Cliente perdido'."
    : null;

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (validationError) return;
    setSaving(true);
    setSuccess(null);
    setSegError(null);
    try {
      const res = await fetch("/api/settings/crm-segments", {
        method:  "PATCH",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify(seg),
      });
      const json = await res.json();
      if (res.ok) {
        if (json.data) setSeg({ ...DEFAULT_SEG, ...json.data });
        setSuccess("Segmentação salva com sucesso.");
      } else {
        setSegError("Erro ao salvar. Tente novamente.");
      }
    } catch {
      setSegError("Falha de rede. Tente novamente.");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center gap-2 py-4 text-sm text-gray-400">
        <span className="h-4 w-4 animate-spin rounded-full border-2 border-brand-400 border-t-transparent" />
        Carregando segmentação…
      </div>
    );
  }

  const frio     = seg.warmMaxDays + 1;
  const perdido  = seg.lostMinDays;

  return (
    <form onSubmit={handleSave} className="max-w-2xl space-y-5 mt-8 border-t border-gray-100 pt-8">
      <div>
        <h2 className="text-base font-semibold text-gray-800">Segmentação de relacionamento</h2>
        <p className="mt-1 text-xs text-gray-500">
          Define os limiares de dias sem pedido que classificam cada segmento. Afeta o agrupamento de clientes no painel e as campanhas de reativação.
        </p>
      </div>

      {success && (
        <div className="flex items-center gap-2 rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm font-medium text-green-700">
          <span>✓</span> {success}
        </div>
      )}
      {(segError || validationError) && (
        <div className="flex items-center justify-between rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          <span>{segError ?? validationError}</span>
          <button type="button" className="ml-2 text-xs underline opacity-70 hover:opacity-100" onClick={() => { setSegError(null); }}>fechar</button>
        </div>
      )}

      <CfgCard
        title="Limiares de segmento"
        subtitle="Número máximo de dias sem pedido para cada classificação."
      >
        <div className="grid gap-5 sm:grid-cols-3">
          <CfgField
            label="Cliente quente (dias)"
            hint={`Pediu nos últimos ${seg.hotMaxDays} dias → QUENTE`}
          >
            <input
              type="number" min={1} max={364}
              value={seg.hotMaxDays}
              onChange={(e) => setField("hotMaxDays", e.target.value)}
              className={CFG_INPUT}
            />
          </CfgField>

          <CfgField
            label="Cliente morno (dias)"
            hint={`${seg.hotMaxDays + 1}–${seg.warmMaxDays} dias → MORNO`}
          >
            <input
              type="number" min={1} max={364}
              value={seg.warmMaxDays}
              onChange={(e) => setField("warmMaxDays", e.target.value)}
              className={CFG_INPUT}
            />
          </CfgField>

          <CfgField
            label="Cliente perdido (dias)"
            hint={`${perdido}+ dias sem pedido → PERDIDO`}
          >
            <input
              type="number" min={1} max={1000}
              value={seg.lostMinDays}
              onChange={(e) => setField("lostMinDays", e.target.value)}
              className={CFG_INPUT}
            />
          </CfgField>
        </div>

        {/* Derived labels preview */}
        <div className="mt-4 flex flex-wrap gap-2">
          {[
            { label: "Quente",  desc: `0–${seg.hotMaxDays} dias`,          color: "bg-green-100 text-green-700" },
            { label: "Morno",   desc: `${seg.hotMaxDays + 1}–${seg.warmMaxDays} dias`, color: "bg-yellow-100 text-yellow-700" },
            { label: "Frio",    desc: `${frio}–${seg.lostMinDays - 1} dias`, color: "bg-blue-100 text-blue-700" },
            { label: "Perdido", desc: `${perdido}+ dias`,                   color: "bg-red-100 text-red-700" },
          ].map((s) => (
            <span key={s.label} className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold ${s.color}`}>
              {s.label}
              <span className="font-normal opacity-75">{s.desc}</span>
            </span>
          ))}
        </div>
      </CfgCard>

      <div className="flex justify-end pt-2">
        <button
          type="submit"
          disabled={saving || !!validationError}
          className="rounded-xl bg-brand-600 px-6 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-brand-700 disabled:opacity-50 transition"
        >
          {saving ? "Salvando…" : "Salvar segmentação"}
        </button>
      </div>
    </form>
  );
}

// ── Main CRM Component ────────────────────────────────────────────────────────

type Tab = "overview" | "campanhas" | "automacoes" | "customers" | "programa" | "avaliacoes" | "configuracoes";

const TAB_PARAM_MAP: Record<string, Tab> = {
  "visao-geral":   "overview",
  "campanhas":     "campanhas",
  "automacoes":    "automacoes",
  "clientes":      "customers",
  "avaliacoes":    "avaliacoes",
  "configuracoes": "configuracoes",
};

const TAB_URL_MAP: Record<Tab, string> = {
  overview:       "visao-geral",
  campanhas:      "campanhas",
  automacoes:     "automacoes",
  customers:      "clientes",
  programa:       "programa",
  avaliacoes:     "avaliacoes",
  configuracoes:  "configuracoes",
};

export function CRMClient({
  initialCustomers,
  initialOpportunities,
  initialActions = [],
  overviewStats,
  opportunitiesCount,
  reviewLinks = { google: null, ifood: null },
  initialTab,
}: {
  initialCustomers:     CRMCustomer[];
  initialOpportunities: Opportunity[];
  initialActions?:      CrmAction[];
  restaurantName:       string;
  overviewStats:        OverviewStats;
  opportunitiesCount:   number;
  reviewLinks?:         { google: string | null; ifood: string | null };
  initialTab?:          Tab;
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
  const [datePreset, setDatePreset] = useState<DateFilterPreset>("total");
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

  // Load initial revenue summary + top customers (all-time) on mount
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

  // Automações recorrentes agora vivem dentro de Campanhas (campanha recorrente).
  // A aba separada foi removida da navegação; o backend de automações segue
  // intacto e as automações já configuradas continuam rodando.
  const tabs: { id: Tab; label: string; badge?: number }[] = [
    { id: "overview",      label: "Visão Geral" },
    { id: "campanhas",     label: "Campanhas" },
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

  function handleSegmentClick(filter: "quente" | "morno" | "frio" | "novos") {
    const crmFilter: CRMFilter = filter === "novos" ? "firstTime" : filter;
    setCustomerFilter(crmFilter);
    setTab("customers");
  }

  return (
    <div className="p-6 max-w-5xl">

      {/* Tabs */}
      <div className="mb-5 flex gap-1 rounded-xl bg-gray-100 p-1 flex-wrap">
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold transition-all whitespace-nowrap ${
              tab === t.id
                ? "bg-white shadow-sm text-gray-900"
                : "text-gray-500 hover:text-gray-700"
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
      )}
      {tab === "campanhas" && (
        <CampanhasTab stats={currentStats} />
      )}
      {tab === "automacoes" && (
        <AutomacoesTab />
      )}
      {tab === "customers" && (
        <CustomersTab
          key={customerFilter}
          initialCustomers={initialCustomers}
          initialFilter={customerFilter}
          onImportOpen={() => setShowImport(true)}
          reviewLinks={reviewLinks}
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
          <SegmentacaoConfig />
        </div>
      )}
      <ImportModal
        open={showImport}
        onClose={() => setShowImport(false)}
        onComplete={() => { setShowImport(false); router.refresh(); }}
      />
    </div>
  );
}
