"use client";

import { useState, useCallback, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type { CRMCustomer, Opportunity, CustomerTier, OverviewStats } from "@/services/crm/CRMService";
import { ImportModal } from "./ImportModal";
import { OverviewTab, type DateFilterPreset } from "./OverviewTab";
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
  all:          "Top Gasto",
  inactive:     "Inativos 30d+",
  morno:        "Mornos (31–60d)",
  frio:         "Frios (60d+)",
  neverOrdered: "Nunca pediu",
  vip:          "Clientes VIP",
  firstTime:    "1º pedido",
  recent:       "Recentes",
};

// ── Helpers ────────────────────────────────────────────────────────────────────

function formatPhone(phone: string) {
  if (isGuestIdentifier(phone)) return "—";
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
  const [name,          setName]          = useState("");
  const [objective,     setObjective]     = useState("");
  const [targetSegment, setTargetSegment] = useState("");
  const [channel,       setChannel]       = useState("WHATSAPP");
  const [message,       setMessage]       = useState("");
  const [notes,         setNotes]         = useState("");
  const [errors,        setErrors]        = useState<CreateActionFormErrors>({});
  const [saving,        setSaving]        = useState(false);
  const [copied,        setCopied]        = useState(false);

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
            <h2 className="text-base font-bold text-gray-900">Criar ação personalizada</h2>
            <p className="text-xs text-gray-500 mt-0.5">Salvará como rascunho no seu CRM</p>
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
          <div className="flex items-center gap-2 rounded-xl bg-gray-50 px-3 py-2.5">
            <span className="rounded-full bg-gray-200 px-2.5 py-0.5 text-xs font-bold text-gray-600">Rascunho</span>
            <p className="text-xs text-gray-500">A ação será salva como rascunho. Disparo automático em breve.</p>
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

// ── Ações Tab types ───────────────────────────────────────────────────────────

type ActionReadiness = "READY" | "COMING_SOON" | "NEEDS_DATA";

interface ActionTemplate {
  id: string;
  emoji: string;
  title: string;
  objective: string;
  targetLabel: string;
  description: string;
  readiness: ActionReadiness;
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
    readiness: "READY",
    audienceKey: "frioCustomers",
    suggestedMessage: "Fala {nome}! 😊 Sentimos sua falta! Que tal voltar com um desconto especial de 10% no seu próximo pedido? Use o código VOLTEI e aproveite!",
  },
  {
    id: "reativar-mornos",
    emoji: "🌡️",
    title: "Reativar clientes mornos",
    objective: "Engajar clientes que sumiram entre 31–60 dias",
    targetLabel: "Mornos (31–60d)",
    description: "Clientes mornos estão a um passo de se tornarem frios. Uma lembrança carinhosa no momento certo faz a diferença.",
    readiness: "READY",
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
    readiness: "READY",
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
    readiness: "READY",
    audienceKey: "vip",
    suggestedMessage: "Olá {nome}! 💎 Você é um cliente especial e temos uma oferta exclusiva para você. Use o código VIP20 para 20% de desconto no próximo pedido — apenas para VIPs!",
  },
  {
    id: "pedido-avaliacao",
    emoji: "⭐",
    title: "Pedido de avaliação",
    objective: "Aumentar avaliações Google e iFood",
    targetLabel: "Clientes recentes (30d)",
    description: "Clientes satisfeitos raramente avaliam sem um lembrete. Peça no momento certo para maximizar as estrelas.",
    readiness: "READY",
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
    readiness: "NEEDS_DATA",
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
    readiness: "NEEDS_DATA",
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
    readiness: "NEEDS_DATA",
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
    audienceKey: null,
    suggestedMessage: "Ei {nome}, você esqueceu algo! 🛒 Seu pedido ainda está esperando. Finalize agora e ganhe frete grátis!",
  },
  {
    id: "recorrente-sumido",
    emoji: "🔔",
    title: "Recorrente sumido",
    objective: "Reativar clientes com histórico de recorrência",
    targetLabel: "Frequentes + mornos",
    description: "Clientes que pediam regularmente e pararam merecem abordagem diferente — eles já confiam em você e são mais fáceis de recuperar.",
    readiness: "READY",
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
    readiness: "NEEDS_DATA",
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
    audienceKey: null,
    suggestedMessage: "Ei {nome}! 🍽️ Montamos um combo especial para você economizar e comer mais! Confira os combos do dia com até 30% de desconto.",
  },
];

const READINESS_CONFIG: Record<ActionReadiness, { label: string; bg: string; text: string }> = {
  READY:       { label: "Pronto",          bg: "bg-green-100",  text: "text-green-700"  },
  COMING_SOON: { label: "Em breve",        bg: "bg-yellow-100", text: "text-yellow-700" },
  NEEDS_DATA:  { label: "Precisa de dados",bg: "bg-gray-100",   text: "text-gray-500"   },
};

// ── Action Config Drawer ───────────────────────────────────────────────────────

function ActionConfigDrawer({
  template,
  audienceCount,
  onClose,
}: {
  template: ActionTemplate;
  audienceCount: number | null;
  onClose: () => void;
}) {
  const [message, setMessage] = useState(template.suggestedMessage);
  const [copied, setCopied] = useState(false);

  function copyMessage() {
    navigator.clipboard.writeText(message);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div
        className="w-full max-w-lg rounded-2xl bg-white shadow-xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-3 px-5 py-4 border-b border-gray-100">
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

        <div className="p-5 space-y-4 max-h-[70vh] overflow-y-auto">
          {/* Info grid */}
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-xl bg-gray-50 px-3 py-2.5">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">Segmento alvo</p>
              <p className="mt-0.5 text-sm font-semibold text-gray-800">{template.targetLabel}</p>
            </div>
            <div className="rounded-xl bg-gray-50 px-3 py-2.5">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">Audiência estimada</p>
              <p className="mt-0.5 text-sm font-semibold text-gray-800">
                {audienceCount !== null ? `${audienceCount} clientes` : "—"}
              </p>
            </div>
            <div className="rounded-xl bg-gray-50 px-3 py-2.5">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">Canal</p>
              <div className="mt-0.5 flex items-center gap-1.5">
                <p className="text-sm font-semibold text-gray-800">WhatsApp</p>
                <span className="rounded-full bg-yellow-100 px-1.5 py-0.5 text-[9px] font-bold uppercase text-yellow-700">
                  Em breve
                </span>
              </div>
            </div>
            <div className="rounded-xl bg-gray-50 px-3 py-2.5">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">Status</p>
              {(() => {
                const cfg = READINESS_CONFIG[template.readiness];
                return (
                  <span className={`mt-0.5 inline-block rounded-full px-2 py-0.5 text-xs font-semibold ${cfg.bg} ${cfg.text}`}>
                    {cfg.label}
                  </span>
                );
              })()}
            </div>
          </div>

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
        </div>

        {/* Footer */}
        <div className="flex gap-2 border-t border-gray-100 px-5 py-4">
          <button
            onClick={copyMessage}
            className={`flex-1 rounded-xl py-2.5 text-sm font-semibold transition-colors ${
              copied
                ? "bg-green-100 text-green-700"
                : "border border-gray-200 bg-white text-gray-700 hover:bg-gray-50"
            }`}
          >
            {copied ? "✓ Copiado!" : "Copiar sugestão"}
          </button>
          <button
            disabled
            title="Disparo automático em breve"
            className="flex-1 cursor-not-allowed rounded-xl bg-gray-100 py-2.5 text-sm font-semibold text-gray-400"
          >
            Disparo em breve
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Ações Tab ─────────────────────────────────────────────────────────────────

function AcoesTab({ stats }: { stats: OverviewStats }) {
  const [selectedTemplate,  setSelectedTemplate]  = useState<ActionTemplate | null>(null);
  const [showCreateModal,   setShowCreateModal]    = useState(false);
  const [customActions,     setCustomActions]      = useState<CustomActionRow[]>([]);
  const [loadingCustom,     setLoadingCustom]      = useState(true);
  const [expandedCustom,    setExpandedCustom]     = useState<string | null>(null);

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
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-bold text-gray-900">Ações de CRM</h2>
          <p className="mt-0.5 text-xs text-gray-500">
            Templates prontos para engajar, recuperar e fidelizar clientes via WhatsApp.
          </p>
        </div>
        <button
          onClick={() => setShowCreateModal(true)}
          className="shrink-0 flex items-center gap-1.5 rounded-xl bg-brand-600 px-4 py-2 text-sm font-bold text-white shadow-sm hover:bg-brand-700 transition-colors"
        >
          <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
          </svg>
          Criar ação
        </button>
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

      {/* ── Minhas ações ─────────────────────────────────────────────────────── */}
      <div>
        <h3 className="mb-3 text-xs font-bold uppercase tracking-widest text-gray-400">
          Minhas ações
        </h3>

        {loadingCustom ? (
          <div className="py-6 text-center text-sm text-gray-400">Carregando…</div>
        ) : customActions.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-gray-200 py-10 text-center">
            <span className="text-3xl">✍️</span>
            <p className="mt-2 text-sm font-semibold text-gray-500">Nenhuma ação criada ainda</p>
            <p className="mt-0.5 text-xs text-gray-400">
              Clique em &quot;Criar ação&quot; para montar sua primeira ação personalizada.
            </p>
            <button
              onClick={() => setShowCreateModal(true)}
              className="mt-4 rounded-xl bg-brand-600 px-4 py-2 text-xs font-bold text-white hover:bg-brand-700 transition-colors"
            >
              Criar primeira ação
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
                        <span className="rounded-full bg-gray-200 px-2 py-0.5 text-[10px] font-bold text-gray-600">
                          Rascunho
                        </span>
                      </div>
                      <p className="text-sm font-bold text-gray-900 truncate">{action.name}</p>
                    </div>
                    {/* Expand toggle */}
                    <button
                      onClick={() => setExpandedCustom(isExpanded ? null : action.id)}
                      className="shrink-0 rounded-lg bg-gray-100 px-3 py-1.5 text-xs font-semibold text-gray-600 hover:bg-gray-200 transition-colors"
                    >
                      {isExpanded ? "Fechar" : "Ver"}
                    </button>
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

      {/* ── Ações sugeridas ──────────────────────────────────────────────────── */}
      <div>
        <h3 className="mb-3 text-xs font-bold uppercase tracking-widest text-gray-400">
          Ações sugeridas
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
                Configurar ação
              </button>
            </div>
          );
        })}
      </div>{/* end templates grid */}

      </div>{/* end Ações sugeridas section */}

      {/* Config drawer for suggested templates */}
      {selectedTemplate && (
        <ActionConfigDrawer
          template={selectedTemplate}
          audienceCount={getAudienceCount(selectedTemplate.audienceKey)}
          onClose={() => setSelectedTemplate(null)}
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

// ── Programa de Relacionamento Tab ────────────────────────────────────────────

function ProgramaDeRelacionamentoTab() {
  const features = [
    {
      emoji: "⭐",
      title: "Sistema de Pontos",
      description: "Clientes acumulam pontos a cada pedido e trocam por recompensas exclusivas. Configure multiplicadores por categoria ou valor de pedido.",
      status: "Em breve",
      statusColor: "bg-yellow-100 text-yellow-700",
    },
    {
      emoji: "🏆",
      title: "Progressão de Tier",
      description: "Bronze → Prata → Ouro → Diamante. Clientes sobem de nível automaticamente conforme o gasto acumulado e desbloqueiam benefícios.",
      status: "Estrutura pronta",
      statusColor: "bg-green-100 text-green-700",
    },
    {
      emoji: "🎂",
      title: "Recompensa de Aniversário",
      description: "Mensagem automática e cupom especial no aniversário do cliente. Configurável: desconto fixo, % ou item grátis.",
      status: "Em breve",
      statusColor: "bg-yellow-100 text-yellow-700",
    },
    {
      emoji: "👥",
      title: "Programa de Indicação",
      description: "Clientes ganham bônus por cada amigo que indicam. Rastreamento automático via link único ou código de indicação.",
      status: "Planejado",
      statusColor: "bg-gray-100 text-gray-500",
    },
    {
      emoji: "🎁",
      title: "Recompensas Configuráveis",
      description: "Defina recompensas por atingir um número de pedidos, valor acumulado ou frequência. Cupons, itens grátis ou descontos.",
      status: "Em breve",
      statusColor: "bg-yellow-100 text-yellow-700",
    },
    {
      emoji: "📊",
      title: "Dashboard de Fidelidade",
      description: "Visualize taxa de retenção, clientes mais engajados, custos com recompensas e ROI do programa de relacionamento.",
      status: "Planejado",
      statusColor: "bg-gray-100 text-gray-500",
    },
  ];

  const tiers = [
    { name: "Bronze",  icon: "🥉", threshold: "R$ 0",    color: "border-orange-200 bg-orange-50",  text: "text-orange-700", benefit: "Acesso ao clube" },
    { name: "Prata",   icon: "🥈", threshold: "R$ 300",  color: "border-gray-200 bg-gray-50",      text: "text-gray-700",   benefit: "5% de cashback" },
    { name: "Ouro",    icon: "🥇", threshold: "R$ 800",  color: "border-amber-200 bg-amber-50",    text: "text-amber-700",  benefit: "10% de cashback + Frete grátis" },
    { name: "Diamante",icon: "💎", threshold: "R$ 2.000",color: "border-cyan-200 bg-cyan-50",      text: "text-cyan-700",   benefit: "15% + Frete grátis + Atendimento VIP" },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="rounded-2xl border border-brand-100 bg-gradient-to-br from-brand-50 to-orange-50 px-5 py-5">
        <div className="flex items-center gap-3 mb-2">
          <span className="text-3xl">🤝</span>
          <div>
            <h2 className="text-base font-bold text-gray-900">Programa de Relacionamento</h2>
            <p className="text-xs text-gray-500">Fidelização automática com tiers, pontos e recompensas</p>
          </div>
        </div>
        <p className="text-sm text-gray-600 leading-relaxed">
          Transforme compradores ocasionais em clientes fiéis. O programa de relacionamento automatiza recompensas,
          reconhece clientes VIP e cria incentivos para a recorrência — tudo integrado ao seu CRM.
        </p>
      </div>

      {/* Tier progression */}
      <div>
        <h3 className="mb-3 text-xs font-bold uppercase tracking-widest text-gray-400">Estrutura de Tiers</h3>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {tiers.map((tier, i) => (
            <div key={tier.name} className={`rounded-2xl border px-4 py-4 ${tier.color}`}>
              <div className="flex items-center justify-between mb-2">
                <span className="text-xl">{tier.icon}</span>
                <span className="text-[10px] font-bold text-gray-400">#{i + 1}</span>
              </div>
              <p className={`text-sm font-bold ${tier.text}`}>{tier.name}</p>
              <p className="text-[11px] font-semibold text-gray-500 mt-0.5">{tier.threshold}+</p>
              <p className="text-[10px] text-gray-500 mt-1.5 leading-tight">{tier.benefit}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Features grid */}
      <div>
        <h3 className="mb-3 text-xs font-bold uppercase tracking-widest text-gray-400">Funcionalidades</h3>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {features.map((feat) => (
            <div key={feat.title} className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
              <div className="flex items-start justify-between gap-2 mb-2">
                <div className="flex items-center gap-2">
                  <span className="text-xl">{feat.emoji}</span>
                  <p className="text-sm font-bold text-gray-900">{feat.title}</p>
                </div>
                <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ${feat.statusColor}`}>
                  {feat.status}
                </span>
              </div>
              <p className="text-xs text-gray-500 leading-relaxed">{feat.description}</p>
            </div>
          ))}
        </div>
      </div>

      {/* CTA */}
      <div className="rounded-2xl border border-dashed border-brand-200 bg-brand-50 p-5 text-center">
        <p className="text-sm font-bold text-brand-800 mb-1">Quer ajudar a moldar o programa?</p>
        <p className="text-xs text-brand-600">
          Os tiers já estão sendo calculados automaticamente. As recompensas e o painel de fidelidade chegam nas próximas versões.
        </p>
      </div>
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
                    {!isGuestIdentifier(c.phone) && (
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
  const [filter, setFilter] = useState<CRMFilter>(initialFilter);
  const [customers, setCustomers] = useState<CRMCustomer[]>(
    initialFilter === "all" ? initialCustomers : []
  );
  const [loading, setLoading] = useState(initialFilter !== "all");

  useEffect(() => {
    if (initialFilter !== "all") {
      fetch(`/api/crm/customers?filter=${initialFilter}`)
        .then((r) => r.json())
        .then((json) => { setCustomers(json.data ?? []); setLoading(false); });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function applyFilter(f: CRMFilter) {
    setFilter(f);
    setLoading(true);
    const res = await fetch(`/api/crm/customers?filter=${f}`);
    if (res.ok) {
      const json = await res.json();
      setCustomers(json.data ?? []);
    }
    setLoading(false);
  }

  const tierOrder: CustomerTier[] = ["DIAMANTE", "OURO", "PRATA", "BRONZE"];
  const filterKeys = Object.keys(CUSTOMER_FILTER_LABELS) as CRMFilter[];

  return (
    <div className="space-y-4">
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
        <span className="text-xs text-gray-400 ml-1">{customers.length} clientes</span>
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
        <div className="py-12 text-center text-sm text-gray-400">Nenhum cliente neste filtro.</div>
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
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {customers.map((c) => (
                  <tr key={c.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3">
                      <Link href={`/customers/${c.id}`} className="hover:text-brand-600 transition-colors">
                        <p className="font-semibold text-gray-900 text-sm">{c.name}</p>
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
            {customers.map((c) => (
              <Link key={c.id} href={`/customers/${c.id}`}>
                <div className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm hover:shadow-md transition-shadow">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-sm font-bold text-gray-900 truncate">{c.name}</p>
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
                </div>
              </Link>
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
              <Link href="/settings/marca" className="text-brand-600 underline">Adicionar →</Link>
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
              <Link href="/settings/marca" className="text-brand-600 underline">Adicionar →</Link>
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
            Acesse <Link href="/settings/marca" className="underline font-semibold">Configurações → Marca</Link>{" "}
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

type Tab = "overview" | "acoes" | "customers" | "programa" | "avaliacoes";

export function CRMClient({
  initialCustomers,
  initialOpportunities,
  overviewStats,
  opportunitiesCount,
  reviewLinks = { google: null, ifood: null },
}: {
  initialCustomers:     CRMCustomer[];
  initialOpportunities: Opportunity[];
  restaurantName:       string;
  overviewStats:        OverviewStats;
  opportunitiesCount:   number;
  reviewLinks?:         { google: string | null; ifood: string | null };
}) {
  const googleReviewUrl = reviewLinks.google;
  const ifoodReviewUrl  = reviewLinks.ifood;
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("overview");
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
    { id: "overview",  label: "Visão Geral" },
    { id: "acoes",     label: "Ações", badge: friasCount || undefined },
    { id: "customers", label: "Clientes" },
    { id: "programa",  label: "Programa de Relacionamento" },
    { id: "avaliacoes",label: "Avaliações" },
  ];

  function goToInactive() {
    setCustomerFilter("inactive");
    setTab("customers");
  }

  function goToOpportunities() {
    setTab("acoes");
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
      {tab === "acoes" && (
        <AcoesTab stats={currentStats} />
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
        <ProgramaDeRelacionamentoTab />
      )}
      {tab === "avaliacoes" && (
        <AvaliacoesTab
          googleReviewUrl={googleReviewUrl}
          ifoodReviewUrl={ifoodReviewUrl}
        />
      )}
      <ImportModal
        open={showImport}
        onClose={() => setShowImport(false)}
        onComplete={() => { setShowImport(false); router.refresh(); }}
      />
    </div>
  );
}
