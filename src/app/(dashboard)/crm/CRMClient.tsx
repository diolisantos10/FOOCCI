"use client";

import { useState, useCallback, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import type { CRMCustomer, Opportunity, CustomerTier, OverviewStats } from "@/services/crm/CRMService";
import { ImportModal } from "./ImportModal";
import { OverviewTab, type DateFilterPreset } from "./OverviewTab";
import { ProgramaTab } from "./ProgramaTab";
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
  all:          "Todos os clientes",
  inactive:     "Inativos 30d+",
  morno:        "Mornos (31–60d)",
  frio:         "Frios (60d+)",
  neverOrdered: "Nunca pediu",
  vip:          "Clientes VIP",
  firstTime:    "1º pedido",
  recent:       "Recentes",
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
  converted:        boolean;
  convertedAt:      string | null;
  revenue:          number | null;
  convertedOrderId: string | null;
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
  executions:     CampaignExecutionRow[];
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
              Salvo como modelo. Para enviar mensagens, crie uma <strong>Campanha</strong> ou configure uma <strong>Automação</strong>.
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
  { id: "recuperar-frios",  label: "Frios — sem pedido 60d+",        emoji: "🥶" },
  { id: "reativar-mornos",  label: "Mornos — sem pedido 31–60d",     emoji: "😶" },
  { id: "clientes-vip",     label: "VIP — Ouro e Diamante",           emoji: "👑" },
  { id: "segunda-compra",   label: "Novos — somente 1 pedido",        emoji: "🌱" },
  { id: "pedido-avaliacao", label: "Recentes — pedido nos últimos 7d", emoji: "⭐" },
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
      };

      if (sendMode === "recurring") {
        body.scheduleConfig = {
          mode:         "RECURRING",
          weekdays,
          timeWindow:   { start: timeWindowStart, end: timeWindowEnd },
          dailyLimit:   Math.max(1, Math.min(200, dailyLimit)),
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

          {/* Scheduling section */}
          <div className="rounded-xl border border-gray-100 bg-gray-50 px-4 py-3 space-y-3">
              <p className="text-[10px] font-bold uppercase tracking-wide text-gray-400">Quando enviar</p>

              {/* Mode selector */}
              <div className="flex gap-1.5">
                {(["now", "scheduled_once", "recurring"] as const).map((mode) => {
                  const labels = { now: "Agora", scheduled_once: "Uma vez", recurring: "Recorrente" };
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
                  </div>

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

const PILOT_MAX = 20; // safety cap for manual pilot dispatches

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
  } | null>(null);

  useEffect(() => {
    fetch("/api/settings/crm-safety")
      .then((r) => r.json())
      .then((j) => { if (j?.data) setSafety(j.data); })
      .catch(() => {});
  }, []);

  // Effective max: min(PILOT_MAX, dailyGlobalCap) — 0 dailyGlobalCap means no cap
  const effectiveMax = safety?.dailyGlobalCap && safety.dailyGlobalCap > 0
    ? Math.min(PILOT_MAX, safety.dailyGlobalCap)
    : PILOT_MAX;

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
                ? ` · ⚠️ acima do limite (${effectiveMax})`
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
                    <span>Limite diário: {safety.dailyGlobalCap} msg</span>
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

            {/* Pilot cap warning */}
            {active.length > effectiveMax && (
              <div className="border-b border-yellow-100 bg-yellow-50 px-5 py-3 flex items-center justify-between gap-3 shrink-0">
                <p className="text-xs text-yellow-800">
                  ⚠️ <strong>Limite de segurança:</strong> {active.length} destinatários — máximo permitido: {effectiveMax}. Remova manualmente ou aplique o limite automático.
                </p>
                <button
                  onClick={applyCap}
                  className="shrink-0 rounded-lg bg-yellow-600 px-3 py-1.5 text-[11px] font-bold text-white hover:bg-yellow-700 transition-colors"
                >
                  Aplicar limite ({effectiveMax})
                </button>
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
                title={active.length > effectiveMax ? `Reduza para no máximo ${effectiveMax} destinatários antes de enviar` : undefined}
                className="flex-1 rounded-xl bg-green-600 py-2.5 text-sm font-bold text-white hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {sending
                  ? "Enviando…"
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

const EXEC_STATUS_COLORS: Record<string, { bg: string; text: string }> = {
  PENDING:   { bg: "bg-gray-100",   text: "text-gray-600"  },
  SENT:      { bg: "bg-blue-50",    text: "text-blue-700"  },
  DELIVERED: { bg: "bg-blue-100",   text: "text-blue-700"  },
  READ:      { bg: "bg-indigo-50",  text: "text-indigo-700"},
  FAILED:    { bg: "bg-red-50",     text: "text-red-600"   },
  CONVERTED: { bg: "bg-green-50",   text: "text-green-700" },
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

function CampaignDetailModal({
  detailId,
  onClose,
  onCampaignAction,
}: {
  detailId: string;
  onClose: () => void;
  onCampaignAction: (id: string, action: "pause" | "resume" | "cancel") => Promise<void>;
}) {
  const [detail,  setDetail]  = useState<CampaignDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState(false);
  const [debug,   setDebug]   = useState<CampaignDebugResult | null>(null);
  const [loadingDebug, setLoadingDebug] = useState(false);

  useEffect(() => {
    setLoading(true);
    setError(false);
    setDebug(null);
    fetch(`/api/crm/campaigns/${detailId}`)
      .then((r) => r.ok ? r.json() : Promise.reject())
      .then((json) => setDetail(json.data ?? null))
      .catch(() => setError(true))
      .finally(() => setLoading(false));

    setLoadingDebug(true);
    fetch(`/api/crm/campaigns/${detailId}/debug`)
      .then((r) => r.ok ? r.json() : Promise.reject())
      .then((json) => setDebug(json.data ?? null))
      .catch(() => {})
      .finally(() => setLoadingDebug(false));
  }, [detailId]);

  const sc = detail ? (CAMPAIGN_STATUS_COLORS[detail.status] ?? { bg: "bg-gray-100", text: "text-gray-600" }) : null;
  const cfg = detail?.scheduleConfig as { mode?: string; weekdays?: number[]; timeWindow?: { start: string; end: string }; dailyLimit?: number; timezone?: string; endCondition?: string; endDate?: string | null; maxTotal?: number | null } | null | undefined;
  const isRecurring = cfg?.mode === "RECURRING";
  const isControllable = isRecurring && detail && ["ACTIVE", "SCHEDULED", "PAUSED"].includes(detail.status);

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />

      {/* Modal */}
      <div className="relative min-h-full flex items-start justify-center p-0 sm:p-4 sm:py-6">
        <div className="relative w-full bg-white shadow-2xl sm:rounded-3xl sm:max-w-4xl overflow-hidden">
          {/* Header */}
          <div className="sticky top-0 z-10 flex items-center justify-between border-b border-gray-100 bg-white px-5 py-4 sm:px-8">
            <div className="min-w-0 pr-4">
              <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400">Detalhes da campanha</p>
              <h2 className="mt-0.5 text-base font-bold text-gray-900 truncate">
                {detail ? detail.name : "Carregando…"}
              </h2>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {isControllable && detail && (
                <>
                  {detail.status === "PAUSED" ? (
                    <button
                      onClick={async () => { await onCampaignAction(detail.id, "resume"); onClose(); }}
                      className="rounded-xl bg-green-50 px-3 py-1.5 text-xs font-semibold text-green-700 hover:bg-green-100 transition-colors"
                    >
                      Retomar
                    </button>
                  ) : (
                    <button
                      onClick={async () => { await onCampaignAction(detail.id, "pause"); onClose(); }}
                      className="rounded-xl bg-yellow-50 px-3 py-1.5 text-xs font-semibold text-yellow-700 hover:bg-yellow-100 transition-colors"
                    >
                      Pausar
                    </button>
                  )}
                  <button
                    onClick={async () => {
                      if (!confirm("Cancelar esta campanha permanentemente?")) return;
                      await onCampaignAction(detail.id, "cancel");
                      onClose();
                    }}
                    className="rounded-xl bg-red-50 px-3 py-1.5 text-xs font-semibold text-red-600 hover:bg-red-100 transition-colors"
                  >
                    Cancelar
                  </button>
                </>
              )}
              <button
                onClick={onClose}
                className="rounded-xl p-2 text-gray-400 hover:bg-gray-100 transition-colors"
              >
                <svg className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          </div>

          {/* Body */}
          <div className="px-5 py-6 sm:px-8 sm:py-8 space-y-8">
            {loading && (
              <div className="flex items-center justify-center py-20 text-sm text-gray-400">
                Carregando campanha…
              </div>
            )}
            {error && (
              <div className="flex items-center justify-center py-20 text-sm text-red-500">
                Erro ao carregar. Tente novamente.
              </div>
            )}

            {detail && !loading && (
              <div className="grid grid-cols-1 gap-8 lg:grid-cols-2">
                {/* ── Left column ── */}
                <div className="space-y-6">

                  {/* A. Resumo */}
                  <section>
                    <h3 className="mb-3 text-[10px] font-bold uppercase tracking-widest text-gray-400">A · Resumo</h3>
                    <div className="rounded-2xl border border-gray-100 bg-gray-50 p-4 space-y-3">
                      <div className="flex flex-wrap gap-2">
                        {sc && (
                          <span className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold ${sc.bg} ${sc.text}`}>
                            {CAMPAIGN_STATUS_LABELS[detail.status] ?? detail.status}
                          </span>
                        )}
                        {isRecurring && (
                          <span className="rounded-full bg-purple-50 px-2 py-0.5 text-[10px] font-semibold text-purple-700">Recorrente</span>
                        )}
                        {detail.objective && (
                          <span className="rounded-full bg-gray-200 px-2 py-0.5 text-[10px] font-semibold text-gray-600">
                            {OBJECTIVE_LABELS[detail.objective] ?? detail.objective}
                          </span>
                        )}
                        {detail.targetSegment && (
                          <span className="rounded-full bg-gray-200 px-2 py-0.5 text-[10px] font-semibold text-gray-600">
                            {SEGMENT_LABELS[detail.targetSegment] ?? detail.targetSegment}
                          </span>
                        )}
                      </div>
                      <div className="grid grid-cols-2 gap-3 text-xs">
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
                            <p className="text-gray-700 mt-0.5">
                              {new Date(detail.sentAt).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit" })}
                            </p>
                          </div>
                        )}
                        {detail.scheduledAt && !detail.sentAt && (
                          <div>
                            <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">Agendada para</p>
                            <p className="text-gray-700 mt-0.5">
                              {new Date(detail.scheduledAt).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit" })}
                            </p>
                          </div>
                        )}
                      </div>
                    </div>
                  </section>

                  {/* B. Programação (recurring only) */}
                  {isRecurring && cfg && (
                    <section>
                      <h3 className="mb-3 text-[10px] font-bold uppercase tracking-widest text-gray-400">B · Programação</h3>
                      <div className="rounded-2xl border border-gray-100 bg-gray-50 p-4 space-y-2 text-xs">
                        <div className="flex flex-wrap gap-1">
                          {(cfg.weekdays ?? []).map((d) => (
                            <span key={d} className="rounded-full bg-purple-50 px-2 py-0.5 text-[10px] font-semibold text-purple-700">
                              {WEEKDAY_LABELS_PT[d] ?? `D${d}`}
                            </span>
                          ))}
                        </div>
                        {cfg.timeWindow && (
                          <p className="text-gray-700">
                            <span className="font-semibold">Janela:</span> {cfg.timeWindow.start}–{cfg.timeWindow.end}
                            {cfg.timezone ? ` (${cfg.timezone})` : ""}
                          </p>
                        )}
                        {cfg.dailyLimit && (
                          <p className="text-gray-700"><span className="font-semibold">Limite diário:</span> {cfg.dailyLimit} mensagens</p>
                        )}
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
                    </section>
                  )}

                  {/* C. Mensagem */}
                  {detail.message && (
                    <section>
                      <h3 className="mb-3 text-[10px] font-bold uppercase tracking-widest text-gray-400">C · Mensagem</h3>
                      <div className="rounded-2xl border border-gray-200 bg-[#e7ffd1] px-4 py-3 text-sm text-gray-800 whitespace-pre-wrap leading-relaxed shadow-sm">
                        {detail.message}
                      </div>
                    </section>
                  )}

                </div>

                {/* ── Right column ── */}
                <div className="space-y-6">

                  {/* D. Execução */}
                  <section>
                    <h3 className="mb-3 text-[10px] font-bold uppercase tracking-widest text-gray-400">D · Execução</h3>
                    <div className="grid grid-cols-3 gap-2">
                      {[
                        { label: "Disparos",         value: detail.totalSent,      color: "text-blue-700" },
                        { label: "Falhas",            value: detail.totalFailed,    color: detail.totalFailed > 0 ? "text-red-600" : "text-gray-400" },
                        { label: "Lidos",             value: detail.totalRead,      color: "text-indigo-700" },
                        { label: "Respostas",         value: detail.totalResponded, color: "text-blue-600" },
                        { label: "Compras geradas",   value: detail.totalConverted, color: detail.totalConverted > 0 ? "text-green-700" : "text-gray-400" },
                        { label: "Total audiência",   value: detail.totalAudience,  color: "text-gray-700" },
                      ].map((m) => (
                        <div key={m.label} className="rounded-xl border border-gray-100 bg-white px-2 py-3 text-center shadow-sm">
                          <p className={`text-xl font-bold leading-none ${m.color}`}>{m.value}</p>
                          <p className="mt-1.5 text-[9px] text-gray-500 leading-tight">{m.label}</p>
                        </div>
                      ))}
                    </div>

                    {detail.totalConverted > 0 && (
                      <div className="mt-2 flex items-center gap-3 rounded-xl border border-green-100 bg-green-50 px-4 py-3">
                        <div className="flex-1">
                          <p className="text-[10px] font-semibold uppercase tracking-wide text-green-600">Receita gerada</p>
                          <p className="text-xl font-bold text-green-700">
                            R$ {Number(detail.totalRevenue).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                          </p>
                        </div>
                        {detail.totalSent > 0 && (
                          <div className="text-right">
                            <p className="text-[10px] font-semibold uppercase tracking-wide text-green-600">Conversão</p>
                            <p className="text-xl font-bold text-green-700">
                              {Math.round((detail.totalConverted / detail.totalSent) * 100)}%
                            </p>
                          </div>
                        )}
                      </div>
                    )}
                  </section>

                  {/* E. Diagnóstico (recurring) */}
                  {isRecurring && (
                    <section>
                      <h3 className="mb-3 text-[10px] font-bold uppercase tracking-widest text-gray-400">E · Diagnóstico do runner</h3>
                      {loadingDebug && (
                        <div className="rounded-2xl border border-gray-100 bg-gray-50 p-4 text-xs text-gray-400">
                          Verificando estado do runner…
                        </div>
                      )}
                      {!loadingDebug && debug && (
                        <div className="rounded-2xl border border-gray-100 bg-gray-50 p-4 space-y-3 text-xs">
                          {/* Due now status */}
                          <div className={`flex items-center gap-2 rounded-xl px-3 py-2 ${debug.isDueNow ? "bg-green-50 border border-green-100" : "bg-amber-50 border border-amber-100"}`}>
                            <div className={`h-2 w-2 rounded-full shrink-0 ${debug.isDueNow ? "bg-green-500" : "bg-amber-400"}`} />
                            <p className={`text-xs font-semibold ${debug.isDueNow ? "text-green-700" : "text-amber-700"}`}>
                              {debug.isDueNow ? "Campanha será processada no próximo ciclo do cron" : (debug.notDueReason ?? "Não está na janela de envio")}
                            </p>
                          </div>

                          {/* Next run */}
                          {debug.nextRunAt && (
                            <p className="text-gray-600">
                              <span className="font-semibold">Próximo envio:</span>{" "}
                              {new Date(debug.nextRunAt).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit" })}
                            </p>
                          )}

                          {/* Safety blocks */}
                          {debug.safetyBlocks.length > 0 && (
                            <div>
                              <p className="font-semibold text-red-600 mb-1">Bloqueios de segurança ativos:</p>
                              {debug.safetyBlocks.map((b, i) => (
                                <p key={i} className="text-red-600">• {b}</p>
                              ))}
                            </div>
                          )}

                          {/* Daily cap */}
                          {debug.dailyCapStatus && (
                            <p className="text-gray-600">
                              <span className="font-semibold">Cap diário:</span> {debug.dailyCapStatus}
                            </p>
                          )}

                          {/* Live audience */}
                          {debug.audience && (
                            <div className="border-t border-gray-200 pt-2 space-y-1">
                              <p className="font-semibold text-gray-700">Audiência (tempo real):</p>
                              {debug.audience.error ? (
                                <p className="text-red-500">Erro ao calcular: {debug.audience.error}</p>
                              ) : (
                                <>
                                  <p className="text-gray-600">• {debug.audience.totalEligible} clientes elegíveis no segmento</p>
                                  <p className="text-gray-600">• {debug.audience.alreadySent} já receberam esta campanha</p>
                                  <p className={`font-semibold ${debug.audience.newEligible === 0 ? "text-red-600" : "text-green-700"}`}>
                                    • {debug.audience.newEligible} novos destinatários disponíveis
                                  </p>
                                  {debug.audience.newEligible === 0 && debug.audience.totalEligible === 0 && (
                                    <p className="text-amber-600 mt-1">
                                      ⚠ Nenhum cliente elegível encontrado. Verifique se o segmento está correto e se há clientes com telefone cadastrado (crmContactable=true).
                                    </p>
                                  )}
                                  {debug.audience.newEligible === 0 && debug.audience.alreadySent > 0 && (
                                    <p className="text-amber-600 mt-1">
                                      ⚠ Todos os clientes elegíveis já receberam esta campanha. Campanha será marcada como CONCLUÍDA no próximo ciclo.
                                    </p>
                                  )}
                                </>
                              )}
                            </div>
                          )}
                        </div>
                      )}
                    </section>
                  )}

                  {/* F. Clientes / logs */}
                  <section>
                    <h3 className="mb-3 text-[10px] font-bold uppercase tracking-widest text-gray-400">
                      F · Clientes ({detail.executions.length})
                    </h3>
                    {detail.executions.length === 0 ? (
                      <div className="rounded-2xl border-2 border-dashed border-gray-100 py-8 text-center text-xs text-gray-400">
                        {isRecurring
                          ? "Nenhum envio registrado ainda. O cron executará no próximo horário configurado."
                          : "Nenhum destinatário registrado ainda."}
                      </div>
                    ) : (
                      <div className="space-y-1.5 max-h-64 overflow-y-auto rounded-xl border border-gray-100 p-2">
                        {detail.executions.map((ex) => {
                          const exSc = EXEC_STATUS_COLORS[ex.status] ?? { bg: "bg-gray-100", text: "text-gray-600" };
                          return (
                            <div key={ex.id} className="flex items-center gap-3 rounded-xl border border-gray-50 bg-white px-3 py-2 shadow-sm">
                              <div className="flex-1 min-w-0">
                                <p className="text-xs font-semibold text-gray-800 truncate">{ex.customerName ?? "Cliente"}</p>
                                <p className="text-[10px] text-gray-400 truncate">{ex.customerPhone ?? "—"}</p>
                                {ex.failedReason && (
                                  <p className="text-[10px] text-red-500 truncate">{ex.failedReason}</p>
                                )}
                              </div>
                              <div className="shrink-0 flex flex-col items-end gap-0.5">
                                <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${exSc.bg} ${exSc.text}`}>
                                  {EXEC_STATUS_LABELS[ex.status] ?? ex.status}
                                </span>
                                {ex.converted && ex.revenue != null && (
                                  <span className="text-[10px] font-semibold text-green-600">
                                    R$ {Number(ex.revenue).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                                  </span>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </section>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Active Campaigns Section ──────────────────────────────────────────────────

const ACTIVE_STATUSES = new Set(["ACTIVE", "SENDING", "SCHEDULED", "PAUSED"]);
const HISTORY_STATUSES = new Set(["SENT", "COMPLETED", "CANCELLED", "DRAFT"]);

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
    <div>
      <div className="mb-3">
        <h3 className="text-xs font-bold uppercase tracking-widest text-brand-600">
          Campanhas ativas
        </h3>
        <p className="mt-1 text-xs text-gray-400">
          Acompanhe campanhas em execução, recorrentes ou programadas.
        </p>
      </div>

      <div className="space-y-3">
        {active.map((c) => {
          const sc         = CAMPAIGN_STATUS_COLORS[c.status] ?? { bg: "bg-gray-100", text: "text-gray-600" };
          const cfg        = c.scheduleConfig as { mode?: string; weekdays?: number[]; timeWindow?: { start: string; end: string }; dailyLimit?: number; timezone?: string } | null;
          const isRecurring = cfg?.mode === "RECURRING";
          const isControllable = isRecurring && ["ACTIVE", "SCHEDULED", "PAUSED"].includes(c.status);

          const displayDate = c.sentAt
            ? `Último envio: ${new Date(c.sentAt).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit" })}`
            : c.scheduledAt
              ? `Agendada: ${new Date(c.scheduledAt).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}`
              : "Criada recentemente";

          return (
            <div
              key={c.id}
              className="rounded-2xl border-2 border-brand-100 bg-white px-4 py-4 shadow-sm"
            >
              {/* Top row */}
              <div className="flex items-start gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2 mb-1">
                    <span className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold ${sc.bg} ${sc.text}`}>
                      {CAMPAIGN_STATUS_LABELS[c.status] ?? c.status}
                    </span>
                    {isRecurring && (
                      <span className="rounded-full bg-purple-50 px-2 py-0.5 text-[10px] font-semibold text-purple-700">
                        Recorrente
                      </span>
                    )}
                    {c.totalSent > 0 && (
                      <span className="rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-semibold text-blue-700">
                        {c.totalSent} disparos
                      </span>
                    )}
                  </div>
                  <p className="text-sm font-bold text-gray-900">{c.name}</p>
                  <p className="text-[11px] text-gray-500 mt-0.5">
                    {c.targetSegment ? `${SEGMENT_LABELS[c.targetSegment] ?? c.targetSegment} · ` : ""}WhatsApp · {displayDate}
                  </p>
                </div>
                <div className="shrink-0 flex flex-col items-end gap-1.5">
                  <button
                    onClick={() => onDetail(c.id)}
                    className="rounded-xl bg-brand-50 px-3 py-1.5 text-xs font-semibold text-brand-700 hover:bg-brand-100 transition-colors whitespace-nowrap"
                  >
                    Ver detalhes
                  </button>
                </div>
              </div>

              {/* Schedule summary */}
              {isRecurring && cfg && (
                <div className="mt-2 flex flex-wrap items-center gap-1.5">
                  {(cfg.weekdays ?? []).map((d) => (
                    <span key={d} className="rounded-full bg-gray-100 px-1.5 py-0.5 text-[10px] font-semibold text-gray-600">
                      {WEEKDAY_LABELS_PT[d] ?? `D${d}`}
                    </span>
                  ))}
                  {cfg.timeWindow && (
                    <span className="text-[10px] text-gray-500">
                      {cfg.timeWindow.start}–{cfg.timeWindow.end}
                    </span>
                  )}
                  {cfg.dailyLimit && (
                    <span className="text-[10px] text-gray-500">
                      · {cfg.dailyLimit}/dia
                    </span>
                  )}
                </div>
              )}

              {/* Stats */}
              {c.totalSent > 0 && (
                <div className="mt-2 flex flex-wrap gap-3 text-[10px] text-gray-500 border-t border-gray-50 pt-2">
                  <span>{c.totalSent} enviados</span>
                  {c.totalFailed > 0 && <span className="text-red-500">{c.totalFailed} falhas</span>}
                  {c.totalResponded > 0 && <span className="text-blue-600">{c.totalResponded} respostas</span>}
                  {c.totalConverted > 0 && (
                    <span className="text-green-600 font-semibold">
                      {c.totalConverted} compras ·{" "}
                      R$ {Number(c.totalRevenue).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                    </span>
                  )}
                </div>
              )}

              {/* Controls */}
              {isControllable && (
                <div className="mt-2 flex gap-2 border-t border-gray-50 pt-2">
                  {c.status === "PAUSED" ? (
                    <button
                      onClick={() => onAction(c.id, "resume")}
                      className="rounded-lg bg-green-50 px-3 py-1 text-[10px] font-semibold text-green-700 hover:bg-green-100 transition-colors"
                    >
                      Retomar
                    </button>
                  ) : (
                    <button
                      onClick={() => onAction(c.id, "pause")}
                      className="rounded-lg bg-yellow-50 px-3 py-1 text-[10px] font-semibold text-yellow-700 hover:bg-yellow-100 transition-colors"
                    >
                      Pausar
                    </button>
                  )}
                  <button
                    onClick={() => {
                      if (!confirm("Cancelar esta campanha permanentemente?")) return;
                      onAction(c.id, "cancel");
                    }}
                    className="rounded-lg bg-red-50 px-3 py-1 text-[10px] font-semibold text-red-600 hover:bg-red-100 transition-colors"
                  >
                    Cancelar
                  </button>
                </div>
              )}
            </div>
          );
        })}
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

  const summaryCards = [
    { emoji: "🥶", label: "Frios",       count: stats.frioCustomers,  color: "bg-blue-50 border-blue-100",   textColor: "text-blue-700"   },
    { emoji: "🌡️", label: "Mornos",      count: stats.mornoCustomers, color: "bg-amber-50 border-amber-100", textColor: "text-amber-700"  },
    { emoji: "🆕", label: "Novos (mês)", count: stats.newCustomers,   color: "bg-green-50 border-green-100", textColor: "text-green-700"  },
    { emoji: "👑", label: "VIP",          count: vipCount,             color: "bg-cyan-50 border-cyan-100",   textColor: "text-cyan-700"   },
    { emoji: "🥤", label: "Bebidas",      count: null,                 color: "bg-gray-50 border-gray-100",   textColor: "text-gray-400"   },
    { emoji: "🍰", label: "Sobremesas",   count: null,                 color: "bg-rose-50 border-rose-100",   textColor: "text-rose-400"   },
  ];

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

      {/* Summary cards */}
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
        {summaryCards.map((card) => (
          <div
            key={card.label}
            className={`rounded-2xl border px-3 py-3 text-center ${card.color}`}
          >
            <p className="text-base leading-none">{card.emoji}</p>
            <p className={`mt-1.5 text-lg font-bold leading-none ${card.textColor}`}>
              {card.count !== null ? card.count : "—"}
            </p>
            <p className="mt-0.5 text-[10px] font-medium text-gray-500">{card.label}</p>
          </div>
        ))}
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
        {ACTION_TEMPLATES.map((tpl) => {
          const rc  = READINESS_CONFIG[tpl.readiness];
          const count = getAudienceCount(tpl.audienceKey);
          return (
            <div
              key={tpl.id}
              className="flex flex-col rounded-2xl border border-gray-100 bg-white p-4 shadow-sm hover:shadow-md transition-shadow"
            >
              {/* Icon + title */}
              <div className="flex items-start justify-between gap-2 mb-2">
                <div className="flex items-center gap-2.5">
                  <span className="text-xl">{tpl.emoji}</span>
                  <p className="text-sm font-bold text-gray-900 leading-tight">{tpl.title}</p>
                </div>
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

      </div>{/* end Ações sugeridas section */}

      {/* ── Histórico de ações ─────────────────────────────────────────────── */}
      {(!loadingHistory) && (
        <div>
          <h3 className="mb-3 text-xs font-bold uppercase tracking-widest text-gray-400">
            Histórico de campanhas
          </h3>
          {loadingHistory ? (
            <div className="py-4 text-center text-sm text-gray-400">Carregando…</div>
          ) : campaigns.filter((c) => HISTORY_STATUSES.has(c.status)).length === 0 ? (
            <div className="rounded-2xl border-2 border-dashed border-gray-100 py-6 text-center text-xs text-gray-400">
              Nenhuma campanha concluída ainda.
            </div>
          ) : (
            <div className="space-y-2">
              {campaigns.filter((c) => HISTORY_STATUSES.has(c.status)).map((c) => {
                const sc         = CAMPAIGN_STATUS_COLORS[c.status] ?? { bg: "bg-gray-100", text: "text-gray-600" };
                const cfg        = c.scheduleConfig as { mode?: string; weekdays?: number[]; timeWindow?: { start: string; end: string }; dailyLimit?: number } | null;
                const isRecurring = cfg?.mode === "RECURRING";
                const displayDate = c.sentAt
                  ? new Date(c.sentAt).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit" })
                  : c.scheduledAt
                    ? `Prog. ${new Date(c.scheduledAt).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit" })}`
                    : new Date(c.createdAt).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit" });
                const isDeletable  = c.status === "DRAFT" || c.status === "CANCELLED";
                const isControllable = isRecurring && ["ACTIVE", "SCHEDULED", "PAUSED"].includes(c.status);
                const convRate     = c.totalSent > 0
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

                    {/* Recurring schedule summary */}
                    {isRecurring && cfg && (
                      <div className="mt-1.5 text-[10px] text-gray-500">
                        {cfg.weekdays && cfg.weekdays.map((d: number) => WEEKDAY_LABELS[d]).join(", ")}
                        {cfg.timeWindow && ` · ${cfg.timeWindow.start}–${cfg.timeWindow.end}`}
                        {cfg.dailyLimit && ` · ${cfg.dailyLimit}/dia`}
                      </div>
                    )}

                    {/* Stats row */}
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

                    {/* Recurring controls: pause / resume / cancel */}
                    {isControllable && (
                      <div className="mt-2 flex gap-2 border-t border-gray-50 pt-2">
                        {c.status === "PAUSED" ? (
                          <button
                            onClick={() => handleCampaignAction(c.id, "resume")}
                            className="rounded-lg bg-green-50 px-3 py-1 text-[10px] font-semibold text-green-700 hover:bg-green-100 transition-colors"
                          >
                            Retomar
                          </button>
                        ) : (
                          <button
                            onClick={() => handleCampaignAction(c.id, "pause")}
                            className="rounded-lg bg-yellow-50 px-3 py-1 text-[10px] font-semibold text-yellow-700 hover:bg-yellow-100 transition-colors"
                          >
                            Pausar
                          </button>
                        )}
                        <button
                          onClick={() => {
                            if (!confirm("Cancelar esta campanha recorrente permanentemente?")) return;
                            handleCampaignAction(c.id, "cancel");
                          }}
                          className="rounded-lg bg-red-50 px-3 py-1 text-[10px] font-semibold text-red-600 hover:bg-red-100 transition-colors"
                        >
                          Cancelar
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
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
            <span className="font-semibold text-gray-500">Para enviar mensagens, use Campanhas ou Automações.</span>
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

      {/* Campaign detail modal */}
      {detailId && (
        <CampaignDetailModal
          detailId={detailId}
          onClose={() => setDetailId(null)}
          onCampaignAction={handleCampaignAction}
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

type CRMFilter = "all" | "inactive" | "morno" | "frio" | "neverOrdered" | "vip" | "firstTime" | "recent";

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
  const [filter,    setFilter]    = useState<CRMFilter>(initialFilter);
  const [customers, setCustomers] = useState<CRMCustomer[]>(
    initialFilter === "all" ? initialCustomers : []
  );
  const [loading,   setLoading]   = useState(initialFilter !== "all");
  const [sortValue, setSortValue] = useState("spend-desc");
  const [search,    setSearch]    = useState("");
  const [debSearch, setDebSearch] = useState("");
  const [waSend,    setWaSend]    = useState<CRMCustomer | null>(null);

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
        {filterKeys.map((f) => (
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
    description: "Envia mensagem de aniversário no dia do cliente (requer data de nascimento cadastrada).",
    defaultDays: 0,
    daysLabel: "",
    showDays: false,
  },
  POST_ORDER: {
    emoji: "⭐",
    label: "Pós-venda",
    description: "Envia mensagem de avaliação após um pedido ser entregue.",
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
      init[trigger] = { trigger, isEnabled: false, messageTemplate: "", triggerAfterDays: defaultDays, sendTime: "08:00", sendDays: [0, 1, 2, 3, 4, 5, 6] };
    }
    return init;
  });
  const [loading,  setLoading]  = useState(true);
  const [saving,   setSaving]   = useState<Record<string, boolean>>({});
  const [savedOk,  setSavedOk]  = useState<Record<string, boolean>>({});

  useEffect(() => {
    fetch("/api/crm/automations")
      .then((r) => r.ok ? r.json() : Promise.reject())
      .then((json: { data?: { trigger: string; isEnabled: boolean; messageTemplate: string; triggerAfterDays: number; scheduleConfig?: { sendTime?: string; sendDays?: number[] } | null }[] }) => {
        const rows = json.data ?? [];
        setLocal((prev) => {
          const next = { ...prev };
          for (const row of rows) {
            next[row.trigger] = {
              trigger:          row.trigger,
              isEnabled:        row.isEnabled,
              messageTemplate:  row.messageTemplate,
              triggerAfterDays: row.triggerAfterDays,
              sendTime:         row.scheduleConfig?.sendTime  ?? prev[row.trigger]?.sendTime  ?? "08:00",
              sendDays:         row.scheduleConfig?.sendDays  ?? prev[row.trigger]?.sendDays  ?? [0, 1, 2, 3, 4, 5, 6],
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
          isEnabled:        state.isEnabled,
          messageTemplate:  state.messageTemplate,
          triggerAfterDays: state.triggerAfterDays,
          scheduleConfig:   {
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
                Use <code className="rounded bg-gray-100 px-1">{"{nome}"}</code> para o nome do cliente.
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
        title="Segurança de Envio WhatsApp"
        subtitle="Limites e proteções aplicados a todas as campanhas manuais e automações."
      >
        <div className="grid gap-5 sm:grid-cols-2">
          <CfgField
            label="Cap global diário"
            hint="Máx. mensagens CRM em 24h, somando todas as campanhas. 0 = sem limite."
          >
            <input
              type="number" min={0} max={10000}
              value={cfg.dailyGlobalCap}
              onChange={(e) => set("dailyGlobalCap", Math.max(0, parseInt(e.target.value, 10) || 0))}
              className={CFG_INPUT}
            />
          </CfgField>

          <CfgField
            label="Cooldown por cliente (horas)"
            hint="Intervalo mínimo entre mensagens ao mesmo cliente."
          >
            <input
              type="number" min={1} max={720}
              value={cfg.customerCooldownHours}
              onChange={(e) => set("customerCooldownHours", Math.max(1, parseInt(e.target.value, 10) || 24))}
              className={CFG_INPUT}
            />
          </CfgField>

          <CfgField
            label="Limite semanal por cliente"
            hint="Máx. mensagens ao mesmo cliente em 7 dias. 0 = sem limite."
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
            label="Ativar horário quieto"
            desc="Bloqueia envios durante o período definido."
            checked={cfg.quietHoursEnabled}
            onChange={(v) => set("quietHoursEnabled", v)}
          />

          {cfg.quietHoursEnabled && (
            <div className="grid gap-4 sm:grid-cols-3">
              <CfgField label="Início do silêncio">
                <input type="time" value={cfg.quietHoursStart} onChange={(e) => set("quietHoursStart", e.target.value)} className={CFG_INPUT} />
              </CfgField>
              <CfgField label="Fim do silêncio">
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
            label="Permitir envios no fim de semana"
            desc="Quando desativado, campanhas e automações são bloqueadas no sábado e domingo."
            checked={cfg.sendOnWeekends}
            onChange={(v) => set("sendOnWeekends", v)}
          />
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

      {/* C — Opt-out */}
      <CfgCard
        title="Opt-out"
        subtitle="Palavras-chave que identificam pedidos de exclusão inbound via WhatsApp."
      >
        <ul className="space-y-2.5">
          {["parar", "sair", "remover", "não quero", "nao quero"].map((word) => (
            <li key={word} className="flex items-center gap-2 text-sm text-gray-700">
              <span className="inline-flex items-center rounded-full bg-red-100 px-2.5 py-0.5 text-xs font-semibold text-red-700">{word}</span>
            </li>
          ))}
        </ul>
        <p className="mt-3 text-xs text-gray-400">
          Quando um cliente envia uma dessas palavras, ele é marcado como opt-out e excluído de todos os envios futuros.
          A detecção é automática via webhook do WhatsApp.
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

      {/* E — Automações */}
      <CfgCard
        title="Automações"
        subtitle="As automações (reativação, aniversário, pós-pedido) também respeitam o horário quieto e o cap diário."
      >
        <ul className="space-y-2.5">
          {[
            { icon: "🔄", text: "Reativação: enviada após o número de dias configurado em cada automação" },
            { icon: "🎂", text: "Aniversário: enviada no dia do aniversário do cliente, dentro da janela de horário" },
            { icon: "⭐", text: "Pós-pedido: enviada após o número de horas configurado na automação" },
            { icon: "🛡️", text: "Todas as automações respeitam o cooldown por cliente e o cap diário" },
          ].map((item) => (
            <li key={item.text} className="flex items-start gap-2.5 text-sm text-gray-700">
              <span className="shrink-0">{item.icon}</span>
              <span>{item.text}</span>
            </li>
          ))}
        </ul>
        <p className="mt-3 text-xs text-gray-400">
          Para ajustar os horários e intervalos de cada automação, acesse a aba{" "}
          <button type="button" className="text-brand-600 underline" onClick={(e) => { e.preventDefault(); }}>Automações</button>.
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
            { icon: "⏱️", text: "Cooldown cruzado: cliente que recebeu qualquer campanha hoje aguarda cooldown" },
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
  overviewStats,
  opportunitiesCount,
  reviewLinks = { google: null, ifood: null },
  initialTab,
}: {
  initialCustomers:     CRMCustomer[];
  initialOpportunities: Opportunity[];
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

  async function handleDateChange(
    preset: DateFilterPreset,
    cfrom?: string,
    cto?: string,
  ) {
    setDatePreset(preset);
    if (cfrom !== undefined) setCustomFrom(cfrom);
    if (cto   !== undefined) setCustomTo(cto);

    if (preset === "custom" && (!cfrom || !cto)) return;

    let url = "/api/crm/overview-stats";
    if (preset !== "total") {
      const now = new Date();
      let from: string;
      let to: string;
      if (preset === "month") {
        from = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
        to   = now.toISOString();
      } else if (preset === "year") {
        from = new Date(now.getFullYear(), 0, 1).toISOString();
        to   = now.toISOString();
      } else {
        from = new Date(cfrom!).toISOString();
        to   = new Date(cto!  ).toISOString();
      }
      url += `?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`;
    }

    setStatsLoading(true);
    try {
      const res = await fetch(url);
      if (res.ok) {
        const json = await res.json();
        setCurrentStats(json.data);
      }
    } finally {
      setStatsLoading(false);
    }
  }

  const friasCount = currentStats.frioCustomers + currentStats.mornoCustomers;

  const tabs: { id: Tab; label: string; badge?: number }[] = [
    { id: "overview",      label: "Visão Geral" },
    { id: "campanhas",     label: "Campanhas", badge: friasCount || undefined },
    { id: "automacoes",    label: "Automações" },
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
          loading={statsLoading}
          datePreset={datePreset}
          customFrom={customFrom}
          customTo={customTo}
          onDateChange={handleDateChange}
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
