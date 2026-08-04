"use client";

import { useState, useEffect, useCallback, type FormEvent } from "react";
import Link from "next/link";
import { UpsellCategoriesPicker } from "./UpsellCategoriesPicker";
import {
  DEFAULT_BRAND_CONFIG,
  PERSONALITY_VOICE_MAP,
  INTENSITY_STYLE_MAP,
  type UpsertBrandConfigInput,
  type PersonalityPreset,
  type UpsellIntensity,
  type SalesFocus,
  type SalesPriority,
} from "@/validators/brand-config";
import {
  AGENT_DEFAULTS,
  DEFAULT_MENU_OPTIONS,
  FLOW_TYPES,
  type AgentMode,
  type MenuOption,
  type FlowType,
} from "@/validators/whatsapp-agent";
import {
  KNOWLEDGE_CATEGORIES,
  type KnowledgeItem,
  type KnowledgeCategory,
} from "@/services/knowledge/RestaurantKnowledgeService";

// ── Types ─────────────────────────────────────────────────────────────────────

type AgentTab    = "whatsapp-host" | "waiter" | "crm" | "analytics";
type AgentStatus = "ativo" | "parcial" | "breve";

// ── Agent registry ────────────────────────────────────────────────────────────

const AGENT_TABS: Array<{
  id:          AgentTab;
  label:       string;
  icon:        string;
  status:      AgentStatus;
  statusLabel: string;
  description: string;
}> = [
  {
    id:          "whatsapp-host",
    label:       "WhatsApp Host",
    icon:        "📱",
    status:      "parcial",
    statusLabel: "Parcial",
    description: "Recepcionista no WhatsApp. Recebe clientes, exibe menu inicial, direciona pedidos e transfere para atendentes quando necessário.",
  },
  {
    id:          "waiter",
    label:       "Waiter",
    icon:        "🍽️",
    status:      "ativo",
    statusLabel: "Ativo",
    description: "Conduz pedidos no cardápio digital. Explica pratos, sugere combinações, aplica upsell e finaliza o pedido.",
  },
  {
    id:          "crm",
    label:       "CRM",
    icon:        "📊",
    status:      "ativo",
    statusLabel: "Ativo",
    description: "Reativação, fidelização e relacionamento pós-venda. Segmenta clientes por temperatura e aciona campanhas personalizadas.",
  },
  {
    id:          "analytics",
    label:       "Analytics",
    icon:        "📈",
    status:      "breve",
    statusLabel: "Em breve",
    description: "Monitora KPIs do restaurante, envia alertas automáticos e gera insights de crescimento e rentabilidade.",
  },
];

// ── Option tables ─────────────────────────────────────────────────────────────

const PRESETS: Array<{
  value:   PersonalityPreset;
  label:   string;
  tagline: string;
  badges:  string[];
}> = [
  { value: "traditional", label: "Tradicional", tagline: "Caloroso, acolhedor, de confiança",    badges: ["Caloroso", "Poucos emojis", "Upsell gentil"]  },
  { value: "young",       label: "Moderno",     tagline: "Casual, animado, próximo do cliente",  badges: ["Casual", "Emojis", "Upsell moderado"]          },
  { value: "fast",        label: "Ágil",        tagline: "Direto, rápido, sem enrolação",        badges: ["Profissional", "Sem emojis", "Conciso"]        },
  { value: "premium",     label: "Premium",     tagline: "Refinado, elegante, sofisticado",      badges: ["Formal", "Sem emojis", "Detalhado"]            },
  { value: "aggressive",  label: "Vendas",      tagline: "Focado em conversão e upsell",         badges: ["Amigável", "Upsell proativo", "Revenue"]       },
];

const FORMALITY_OPTIONS = [
  { value: "informal" as const, label: "Informal",  desc: "Você, relaxado"    },
  { value: "mixed"    as const, label: "Adaptável", desc: "Segue o cliente"   },
  { value: "formal"   as const, label: "Formal",    desc: "Senhor(a), cortês" },
];

const EMOJI_OPTIONS = [
  { value: "none"       as const, label: "Nenhum",     desc: "Sem emojis"          },
  { value: "minimal"    as const, label: "Poucos",     desc: "Só momentos-chave"   },
  { value: "moderate"   as const, label: "Moderado",   desc: "Alguns por mensagem" },
  { value: "expressive" as const, label: "Expressivo", desc: "Bastante, animado"   },
];

const GREETING_OPTIONS = [
  { value: "warm"         as const, label: "Caloroso",     desc: "Acolhedor, faz o cliente se sentir bem-vindo", example: "Olá! Que bom ter você aqui 😊 O que vai ser hoje?"  },
  { value: "professional" as const, label: "Direto",       desc: "Objetivo e sem enrolação",                    example: "Olá! Pronto para pedir?"                            },
  { value: "casual"       as const, label: "Descontraído", desc: "Energético e próximo",                        example: "Ei! Bora pedir? 🚀 O que vai ser?"                 },
] as const;

const INTENSITY_OPTIONS: Array<{ value: UpsellIntensity; label: string; desc: string }> = [
  { value: "low",    label: "Baixa",  desc: "Uma sugestão gentil"    },
  { value: "medium", label: "Média",  desc: "Sugere quando oportuno" },
  { value: "high",   label: "Alta",   desc: "Sugere frequentemente"  },
];

const FOCUS_OPTIONS: Array<{ value: SalesFocus; label: string; desc: string }> = [
  { value: "balanced", label: "Equilibrado", desc: "Boa experiência e boa receita"  },
  { value: "ticket",   label: "Receita",     desc: "Prioriza itens de maior valor"  },
  { value: "volume",   label: "Volume",      desc: "Foco em agilidade e quantidade" },
];

const PRIORITY_OPTIONS: Array<{ value: SalesPriority; label: string; desc: string }> = [
  { value: "bestsellers", label: "Mais vendidos",    desc: "Sugere os campeões de venda" },
  { value: "high_margin", label: "Maior margem",     desc: "Favorece itens rentáveis"    },
  { value: "promotions",  label: "Promoções ativas", desc: "Destaca os itens em oferta"  },
];

const UPSELL_STYLE_OPTIONS = [
  { value: "none"      as const, label: "Desativado", desc: "Agente não sugere extras"                  },
  { value: "gentle"    as const, label: "Leve",       desc: "Uma sugestão discreta na hora certa"       },
  { value: "moderate"  as const, label: "Moderado",   desc: "Sugere bebida, sobremesa e complementos"   },
  { value: "proactive" as const, label: "Proativo",   desc: "Incentiva ativamente em cada oportunidade" },
] as const;

const TONE_OPTIONS = [
  { value: "informal", label: "Informal", desc: "Você, sabe? Tranquilo" },
  { value: "neutral",  label: "Neutro",   desc: "Equilibrado e claro"   },
  { value: "premium",  label: "Premium",  desc: "Sofisticado e cortês"  },
];

const STYLE_OPTIONS = [
  { value: "direct",       label: "Direto",     desc: "Respostas curtas e rápidas"  },
  { value: "consultive",   label: "Consultivo", desc: "Explica e orienta o cliente" },
  { value: "sales_driven", label: "Vendas",     desc: "Sugere, engaja, converte"    },
];

const AGENT_MODE_OPTIONS: Array<{ value: AgentMode; label: string; desc: string }> = [
  { value: "MENU_ONLY",         label: "Menu fixo (sem IA)", desc: "Só o menu numerado. Sem IA. Pedido → falar com a equipe" },
  { value: "RECEPTIONIST_ONLY", label: "Recepcionista",      desc: "Responde, exibe opções e direciona o cliente"  },
  { value: "HUMAN_ASSISTED",    label: "Com suporte humano", desc: "IA e equipe atuam juntos na mesma conversa"    },
];

const FLOW_CONFIG: Record<FlowType, { label: string; desc: string; icon: string }> = {
  order:      { icon: "🛒", label: "Fazer pedido",           desc: "Envia msg de pedido + link do cardápio"   },
  handoff:    { icon: "👤", label: "Falar com atendente",    desc: "Encaminha para o número configurado"      },
  menu:       { icon: "📋", label: "Ver cardápio",            desc: "Envia o link do cardápio"                 },
  promotions: { icon: "🎁", label: "Ver promoções",           desc: "O agente lista as promoções ativas"       },
  custom:     { icon: "💬", label: "Mensagem personalizada",  desc: "Envia um texto livre definido aqui"       },
  text_order: { icon: "✍️", label: "Pedido por mensagem",    desc: "Cliente digita o pedido diretamente no chat" },
  rodizio:    { icon: "🍽️", label: "Rodízio presencial",     desc: "Informa sobre o rodízio e horários"       },
  club:       { icon: "⭐", label: "Cazza Club",              desc: "Informa sobre o programa de fidelidade"   },
  submenu:    { icon: "📂", label: "Abrir submenu",          desc: "Mostra um submenu com mais opções"        },
};

const PRESETS_AGENT: Array<{ label: string; flow: FlowType; message?: string }> = [
  { label: "Fazer pedido",        flow: "order"      },
  { label: "Falar com atendente", flow: "handoff"    },
  { label: "Ver promoções",       flow: "promotions" },
  { label: "Ver cardápio",        flow: "menu"       },
  { label: "Informações",         flow: "custom",    message: "Horário: ...\nEndereço: ..." },
];

const SAFETY_CASES = [
  "Cliente pede explicitamente para falar com humano",
  "Reclamação ou insatisfação com o serviço",
  "Problema com pagamento ou cobrança",
  "Solicitação de cancelamento ou reembolso",
  "Atraso grave na entrega",
  "Restrição alimentar ou risco de alergia",
  "IA com baixa confiança na resposta",
  "Informação ausente no sistema",
];

const PLACEHOLDER_FLOWS: Array<{ icon: string; label: string; desc: string }> = [
  { icon: "🕐", label: "Horário de funcionamento", desc: "Responde se o restaurante está aberto ou fechado"   },
  { icon: "📍", label: "Endereço e localização",   desc: "Informa o endereço do restaurante"                 },
  { icon: "🛵", label: "Entrega",                  desc: "Informações sobre área, taxa e prazo de entrega"   },
  { icon: "💳", label: "Pagamento",                desc: "Formas de pagamento aceitas"                       },
  { icon: "📦", label: "Status do pedido",         desc: "Acompanhamento de pedido em andamento"             },
  { icon: "😤", label: "Reclamação",               desc: "Encaminha para atendente humano imediatamente"     },
];

// ── Agent form helpers ────────────────────────────────────────────────────────

function newId() {
  return `opt-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

function parseMenuOptions(raw: unknown): MenuOption[] {
  if (Array.isArray(raw) && raw.length > 0) return raw as MenuOption[];
  return DEFAULT_MENU_OPTIONS.map((o) => ({ ...o, id: newId() }));
}

interface AgentFormState {
  agentMode:       AgentMode;
  agentName:       string;
  tone:            string;
  style:           string;
  welcomeMessage:  string;
  orderPreMessage: string;
  menuUrl:         string;
  handoffPhone:    string;
  handoffMessage:  string;
}

function toAgentForm(d: Record<string, unknown>): AgentFormState {
  const def = AGENT_DEFAULTS;
  return {
    agentMode:       (d.agentMode as AgentMode) ?? def.agentMode,
    agentName:       String(d.agentName       ?? def.agentName),
    tone:            String(d.tone            ?? def.tone),
    style:           String(d.style           ?? def.style),
    welcomeMessage:  String(d.welcomeMessage  ?? def.welcomeMessage),
    orderPreMessage: String(d.orderPreMessage ?? def.orderPreMessage),
    menuUrl:         String(d.menuUrl         ?? ""),
    handoffPhone:    String(d.handoffPhone    ?? ""),
    handoffMessage:  String(d.handoffMessage  ?? def.handoffMessage),
  };
}

// ── CRM Agent types ───────────────────────────────────────────────────────────

type CRMAgentSummary = {
  overview: {
    totalCustomers:    number;
    frioCustomers:     number;
    mornoCustomers:    number;
    ativoCustomers:    number;
    newCustomers:      number;
    vipCustomers:      number;
    birthdayThisMonth: number;
  };
  campaigns: {
    activeCount: number;
    list: Array<{
      id:             string;
      name:           string;
      status:         string;
      targetSegment:  string | null;
      scheduleConfig: Record<string, unknown> | null;
      totalSent:      number;
      totalResponded: number;
      totalConverted: number;
      totalRevenue:   number;
      scheduledAt:    string | null;
    }>;
  };
  automations: {
    enabledCount: number;
    list: Array<{
      trigger:          string;
      isEnabled:        boolean;
      triggerAfterDays: number;
    }>;
  };
  revenue: {
    totalSent:      number;
    totalResponded: number;
    totalConverted: number;
    totalRevenue:   number;
  };
};

const CRM_TRIGGER_LABELS: Record<string, string> = {
  REACTIVATION: "Recuperação de clientes",
  BIRTHDAY:     "Feliz aniversário",
  POST_ORDER:   "Pós-venda",
};

const CRM_TRIGGER_DESC: Record<string, string> = {
  REACTIVATION: "Clientes inativos após X dias sem pedido",
  BIRTHDAY:     "Dispara no dia do aniversário do cliente",
  POST_ORDER:   "Enviado após entrega de um pedido",
};

const CRM_STATUS_LABELS: Record<string, string> = {
  ACTIVE:    "Ativa",
  SCHEDULED: "Agendada",
  PAUSED:    "Em pausa",
  SENDING:   "Em execução",
};

const CRM_SEGMENT_LABELS: Record<string, string> = {
  FRIO:            "Clientes frios",
  MORNO:           "Clientes mornos",
  NOVOS:           "Novos clientes",
  VIP:             "Clientes VIP",
  PRIMEIRO_PEDIDO: "1º pedido",
  TODOS:           "Todos os clientes",
  RECORRENTES:     "Recorrentes",
};

// ── Stat card for CRM dashboard ───────────────────────────────────────────────

function StatCard({
  emoji,
  label,
  value,
  desc,
  bg,
  color,
}: {
  emoji:  string;
  label:  string;
  value:  number;
  desc:   string;
  bg:     string;
  color:  string;
}) {
  return (
    <div className={`rounded-xl border px-4 py-3 ${bg}`}>
      <p className="text-base leading-none">{emoji}</p>
      <p className={`mt-2 text-2xl font-bold leading-none ${color}`}>{value.toLocaleString("pt-BR")}</p>
      <p className="mt-1 text-xs font-semibold text-ink2">{label}</p>
      <p className="mt-0.5 text-[10px] text-muted">{desc}</p>
    </div>
  );
}

// ── Status badge ──────────────────────────────────────────────────────────────

function StatusBadge({ status, label }: { status: AgentStatus; label: string }) {
  const cls =
    status === "ativo"
      ? "bg-green-100 text-green-700 border-green-200"
      : status === "parcial"
      ? "bg-amber-100 text-amber-700 border-amber-200"
      : "bg-[#F4F4F2] text-muted border-line2";
  return (
    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${cls}`}>
      {label}
    </span>
  );
}

// ── Shared primitives ─────────────────────────────────────────────────────────

function Section({
  title,
  subtitle,
  children,
}: {
  title:     string;
  subtitle?: string;
  children:  React.ReactNode;
}) {
  return (
    <section className="rounded-xl border border-line2 bg-paper p-5 space-y-5">
      <div>
        <h2 className="text-sm font-semibold text-ink">{title}</h2>
        {subtitle && <p className="mt-0.5 text-xs text-muted">{subtitle}</p>}
      </div>
      {children}
    </section>
  );
}

function ChipGroup<T extends string>({
  label,
  options,
  value,
  onChange,
  cols = 3,
}: {
  label:   string;
  options: Array<{ value: T; label: string; desc: string }>;
  value:   T;
  onChange: (v: T) => void;
  cols?:   2 | 3 | 4;
}) {
  const colClass =
    cols === 4 ? "sm:grid-cols-4" : cols === 3 ? "sm:grid-cols-3" : "sm:grid-cols-2";
  return (
    <div>
      <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted">
        {label}
      </p>
      <div className={`grid grid-cols-2 gap-2 ${colClass}`}>
        {options.map((opt) => (
          <button
            key={opt.value}
            type="button"
            onClick={(e) => { e.stopPropagation(); onChange(opt.value); }}
            className={`flex flex-col gap-0.5 rounded-lg border p-3 text-left transition-colors ${
              value === opt.value
                ? "border-brand-500 bg-brand-50"
                : "border-line2 hover:border-line2 hover:bg-[#FAFAF8]"
            }`}
          >
            <span className={`text-sm font-semibold ${value === opt.value ? "text-brand-700" : "text-ink"}`}>
              {opt.label}
            </span>
            <span className="text-xs text-muted">{opt.desc}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

function RadioRow({
  label,
  options,
  value,
  onChange,
}: {
  label:   string;
  options: { value: string; label: string; desc: string }[];
  value:   string;
  onChange: (v: string) => void;
}) {
  return (
    <div>
      <p className="mb-2 text-sm font-medium text-ink2">{label}</p>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        {options.map((opt) => (
          <label
            key={opt.value}
            className={`flex cursor-pointer flex-col gap-0.5 rounded-lg border p-3 text-sm transition-colors ${
              value === opt.value
                ? "border-brand-500 bg-brand-50 text-brand-700"
                : "border-line2 text-ink2 hover:border-line2 hover:bg-[#FAFAF8]"
            }`}
          >
            <input
              type="radio"
              className="sr-only"
              value={opt.value}
              checked={value === opt.value}
              onChange={() => onChange(opt.value)}
            />
            <span className="font-medium">{opt.label}</span>
            <span className="text-xs text-muted">{opt.desc}</span>
          </label>
        ))}
      </div>
    </div>
  );
}

function SaveRow({ saving, label }: { saving: boolean; label: string }) {
  return (
    <div className="flex items-center justify-end gap-3 pt-2 pb-4">
      <p className="text-xs text-muted">Aplicado em novas conversas imediatamente.</p>
      <button
        type="submit"
        disabled={saving}
        className="rounded-lg bg-brand-600 px-6 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-brand-700 disabled:opacity-50 transition-colors"
      >
        {saving ? "Salvando…" : label}
      </button>
    </div>
  );
}

function CharCount({ current, max }: { current: number; max: number }) {
  const near = current > max * 0.85;
  return (
    <p className={`mt-0.5 text-right text-xs ${near ? "text-amber-500" : "text-muted"}`}>
      {current} / {max}
    </p>
  );
}

function OptionCard({
  option, index, total, onChange, onRemove, onMoveUp, onMoveDown,
}: {
  option:      MenuOption;
  index:       number;
  total:       number;
  onChange:    (patch: Partial<MenuOption>) => void;
  onRemove:    () => void;
  onMoveUp:    () => void;
  onMoveDown:  () => void;
}) {
  const flow = FLOW_CONFIG[option.flow];
  return (
    <div className="rounded-xl border border-line2 bg-[#FAFAF8] p-3 space-y-2">
      <div className="flex items-center gap-2">
        <span className="shrink-0 flex h-6 w-6 items-center justify-center rounded-full bg-line2 text-xs font-bold text-ink2">
          {index + 1}
        </span>
        <input
          type="text"
          value={option.label}
          onChange={(e) => onChange({ label: e.target.value })}
          maxLength={60}
          placeholder="Ex: Fazer pedido"
          className="flex-1 min-w-0 rounded-lg border border-line2 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
        />
        <select
          value={option.flow}
          onChange={(e) => onChange({ flow: e.target.value as FlowType })}
          className="rounded-lg border border-line2 bg-paper px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-brand-500"
        >
          {FLOW_TYPES.map((f) => (
            <option key={f} value={f}>{FLOW_CONFIG[f].icon} {FLOW_CONFIG[f].label}</option>
          ))}
        </select>
        <div className="flex flex-col gap-0.5 shrink-0">
          <button type="button" onClick={onMoveUp} disabled={index === 0}
            className="flex h-5 w-5 items-center justify-center rounded text-xs text-muted hover:bg-line2 disabled:opacity-30"
            aria-label="Mover para cima">▲</button>
          <button type="button" onClick={onMoveDown} disabled={index === total - 1}
            className="flex h-5 w-5 items-center justify-center rounded text-xs text-muted hover:bg-line2 disabled:opacity-30"
            aria-label="Mover para baixo">▼</button>
        </div>
        <button type="button" onClick={onRemove}
          className="shrink-0 flex h-7 w-7 items-center justify-center rounded-lg text-red-400 hover:bg-red-50 hover:text-red-600 transition-colors"
          aria-label="Remover opção">✕</button>
      </div>
      <p className="pl-8 text-xs text-muted">{flow.icon} {flow.desc}</p>
      {option.flow !== "submenu" && (
        <div className="pl-8">
          <textarea
            value={option.message ?? ""}
            onChange={(e) => onChange({ message: e.target.value })}
            rows={2}
            maxLength={500}
            placeholder={
              option.flow === "custom"
                ? "Mensagem enviada ao cliente ao selecionar esta opção…"
                : "Frase de resposta (opcional) — em branco usa o texto padrão desta ação."
            }
            className="w-full resize-none rounded-lg border border-line2 px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-brand-500"
          />
          {option.flow !== "custom" && (
            <p className="mt-1 text-[11px] text-muted">
              A ação continua igual (ex.: link do cardápio, transferência) — isto troca só o texto que o cliente recebe.
            </p>
          )}
        </div>
      )}
      {option.flow === "submenu" && (
        <div className="pl-8 space-y-2">
          <p className="text-xs font-medium text-ink2">Opções do submenu:</p>
          {(option.submenuOptions ?? []).map((sub, si) => (
            <div key={sub.id} className="flex items-center gap-2">
              <input
                type="text"
                value={sub.label}
                onChange={(e) => {
                  const next = [...(option.submenuOptions ?? [])];
                  next[si] = { ...sub, label: e.target.value };
                  onChange({ submenuOptions: next });
                }}
                maxLength={60}
                placeholder="Ex: Digitar pedido"
                className="flex-1 min-w-0 rounded-lg border border-line2 px-3 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-brand-500"
              />
              <select
                value={sub.flow}
                onChange={(e) => {
                  const next = [...(option.submenuOptions ?? [])];
                  next[si] = { ...sub, flow: e.target.value as FlowType };
                  onChange({ submenuOptions: next });
                }}
                className="rounded-lg border border-line2 bg-paper px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-brand-500"
              >
                {FLOW_TYPES.filter((f) => f !== "submenu").map((f) => (
                  <option key={f} value={f}>{FLOW_CONFIG[f].icon} {FLOW_CONFIG[f].label}</option>
                ))}
              </select>
              <button
                type="button"
                onClick={() => onChange({ submenuOptions: (option.submenuOptions ?? []).filter((_, i) => i !== si) })}
                className="shrink-0 flex h-7 w-7 items-center justify-center rounded-lg text-red-400 hover:bg-red-50 hover:text-red-600 transition-colors"
                aria-label="Remover sub-opção"
              >✕</button>
            </div>
          ))}
          {(option.submenuOptions ?? []).length < 8 && (
            <button
              type="button"
              onClick={() => onChange({
                submenuOptions: [
                  ...(option.submenuOptions ?? []),
                  { id: `sub-${Date.now()}`, label: "", flow: "menu" as FlowType },
                ],
              })}
              className="text-xs font-medium text-brand-600 hover:text-brand-700"
            >+ Adicionar opção ao submenu</button>
          )}
        </div>
      )}
    </div>
  );
}

function ComingSoon({ title, items }: { title: string; items: string[] }) {
  return (
    <div className="rounded-xl border border-dashed border-line2 bg-[#FAFAF8] p-5">
      <p className="text-xs font-semibold uppercase tracking-widest text-muted mb-2">Em breve</p>
      <p className="text-sm font-semibold text-ink2 mb-3">{title}</p>
      <ul className="space-y-1.5">
        {items.map((item) => (
          <li key={item} className="flex items-center gap-2 text-xs text-muted">
            <span className="h-1 w-1 shrink-0 rounded-full bg-line2" />
            {item}
          </li>
        ))}
      </ul>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export function AgentePage() {
  const [activeTab, setActiveTab] = useState<AgentTab>("whatsapp-host");

  // CRM Agent state ─────────────────────────────────────────────────────────
  const [crmSummary, setCrmSummary] = useState<CRMAgentSummary | null>(null);
  const [crmLoading, setCrmLoading] = useState(false);
  const [crmLoaded,  setCrmLoaded]  = useState(false);

  useEffect(() => {
    if (activeTab !== "crm" || crmLoaded) return;
    setCrmLoading(true);
    fetch("/api/crm/agent-summary")
      .then((r) => r.ok ? r.json() : Promise.reject())
      .then((json: { data?: CRMAgentSummary }) => setCrmSummary(json.data ?? null))
      .catch(() => setCrmSummary(null))
      .finally(() => { setCrmLoading(false); setCrmLoaded(true); });
  }, [activeTab, crmLoaded]);

  // Brand config state (Waiter tab) ─────────────────────────────────────────
  const [form, setForm]     = useState<UpsertBrandConfigInput>(DEFAULT_BRAND_CONFIG);
  const [loading, setLoad]  = useState(true);
  const [saving, setSaving] = useState(false);
  const [success, setOk]    = useState(false);
  const [error, setErr]     = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/brand-config")
      .then((r) => (r.ok ? r.json() : null))
      .then((json) => {
        if (json?.data) setForm({ ...DEFAULT_BRAND_CONFIG, ...json.data });
      })
      .catch(() => {})
      .finally(() => setLoad(false));
  }, []);

  function patch<K extends keyof UpsertBrandConfigInput>(
    key: K,
    value: UpsertBrandConfigInput[K],
  ) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function applyPreset(preset: PersonalityPreset) {
    const voice = PERSONALITY_VOICE_MAP[preset];
    setForm((prev) => ({ ...prev, personalityPreset: preset, ...voice }));
  }

  function applyIntensity(intensity: UpsellIntensity) {
    setForm((prev) => ({
      ...prev,
      upsellIntensity: intensity,
      upsellStyle:     INTENSITY_STYLE_MAP[intensity],
    }));
  }

  async function handleSave(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setOk(false);
    setErr(null);
    try {
      const res = await fetch("/api/brand-config", {
        method:  "PUT",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({
          ...form,
          greetingTemplate:     form.greetingTemplate     || null,
          systemPromptOverride: form.systemPromptOverride || null,
        }),
      });
      const json = await res.json();
      if (!res.ok) { setErr(json.error ?? "Erro ao salvar"); return; }
      setOk(true);
      setTimeout(() => setOk(false), 4000);
    } catch {
      setErr("Falha de rede — tente novamente.");
    } finally {
      setSaving(false);
    }
  }

  // WhatsApp agent state (WhatsApp Host tab) ────────────────────────────────
  const [agentForm, setAgentForm]       = useState<AgentFormState>(toAgentForm({}));
  const [menuOptions, setMenuOptions]   = useState<MenuOption[]>(
    DEFAULT_MENU_OPTIONS.map((o) => ({ ...o, id: newId() }))
  );
  const [agentLoading, setAgentLoading] = useState(true);
  const [agentSaving, setAgentSaving]   = useState(false);
  const [agentOk, setAgentOk]           = useState(false);
  const [agentErr, setAgentErr]         = useState<string | null>(null);

  // Local-only state (no backend storage yet)
  const [oohEnabled, setOohEnabled]           = useState(false);
  const [oohMessage, setOohMessage]           = useState("No momento estamos fechados. Você pode ver o cardápio e pedir quando abrirmos 😊");
  const [fallbackMessage, setFallbackMessage] = useState("Não entendi certinho. Você quer fazer pedido, ver cardápio ou falar com alguém?");
  const [previewOptId, setPreviewOptId]       = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/whatsapp-agent")
      .then((r) => (r.ok ? r.json() : null))
      .then((json) => {
        if (json?.data) {
          setAgentForm(toAgentForm(json.data));
          setMenuOptions(parseMenuOptions(json.data.menuOptions));
        }
      })
      .catch(() => {})
      .finally(() => setAgentLoading(false));
  }, []);

  // Knowledge base state ────────────────────────────────────────────────────
  const [knowledgeItems,   setKnowledgeItems]   = useState<KnowledgeItem[]>([]);
  const [knowledgeLoading, setKnowledgeLoading] = useState(false);
  const [knowledgeLoaded,  setKnowledgeLoaded]  = useState(false);
  const [addKnowledge,     setAddKnowledge]      = useState(false);
  const [kNewTitle,        setKNewTitle]         = useState("");
  const [kNewPatterns,     setKNewPatterns]      = useState("");
  const [kNewAnswer,       setKNewAnswer]        = useState("");
  const [kNewCategory,     setKNewCategory]      = useState<KnowledgeCategory>("FAQ");
  const [kSaving,          setKSaving]           = useState(false);
  const [kSaveErr,         setKSaveErr]          = useState<string | null>(null);

  const fetchKnowledge = useCallback(() => {
    setKnowledgeLoading(true);
    fetch("/api/knowledge")
      .then((r) => r.ok ? r.json() : null)
      .then((json) => { if (json?.data) setKnowledgeItems(json.data as KnowledgeItem[]); })
      .catch(() => {})
      .finally(() => { setKnowledgeLoading(false); setKnowledgeLoaded(true); });
  }, []);

  useEffect(() => {
    if (activeTab === "whatsapp-host" && !knowledgeLoaded) {
      fetchKnowledge();
    }
  }, [activeTab, knowledgeLoaded, fetchKnowledge]);

  async function handleKnowledgeStatusChange(id: string, status: "ACTIVE" | "REJECTED") {
    await fetch(`/api/knowledge/${id}`, {
      method:  "PATCH",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ status }),
    }).catch(() => {});
    fetchKnowledge();
  }

  async function handleKnowledgeDelete(id: string) {
    await fetch(`/api/knowledge/${id}`, { method: "DELETE" }).catch(() => {});
    setKnowledgeItems((prev) => prev.filter((k) => k.id !== id));
  }

  async function handleKnowledgeSave() {
    if (!kNewTitle.trim() || !kNewAnswer.trim() || !kNewPatterns.trim()) return;
    setKSaving(true);
    setKSaveErr(null);
    try {
      const patterns = kNewPatterns.split("\n").map((s) => s.trim()).filter(Boolean);
      const res = await fetch("/api/knowledge", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({
          title:            kNewTitle.trim(),
          category:         kNewCategory,
          questionPatterns: patterns,
          answer:           kNewAnswer.trim(),
          status:           "ACTIVE",
          source:           "MANUAL",
        }),
      });
      if (!res.ok) throw new Error("Erro ao salvar");
      setAddKnowledge(false);
      setKNewTitle(""); setKNewPatterns(""); setKNewAnswer(""); setKNewCategory("FAQ");
      fetchKnowledge();
    } catch {
      setKSaveErr("Falha ao salvar. Tente novamente.");
    } finally {
      setKSaving(false);
    }
  }

  const suggested = knowledgeItems.filter((k) => k.status === "SUGGESTED");
  const active    = knowledgeItems.filter((k) => k.status === "ACTIVE");
  const gaps      = knowledgeItems.filter((k) => k.category === "UNKNOWN_GAP" && k.status !== "REJECTED");

  function patchAgent(key: keyof AgentFormState) {
    return (value: string) => setAgentForm((prev) => ({ ...prev, [key]: value }));
  }

  function addOption(preset?: typeof PRESETS_AGENT[number]) {
    setMenuOptions((prev) => [
      ...prev,
      { id: newId(), label: preset?.label ?? "", flow: preset?.flow ?? "custom", message: preset?.message ?? "" },
    ]);
  }

  function updateOption(id: string, p: Partial<MenuOption>) {
    setMenuOptions((prev) => prev.map((o) => (o.id === id ? { ...o, ...p } : o)));
  }

  function removeOption(id: string) {
    setMenuOptions((prev) => prev.filter((o) => o.id !== id));
  }

  function moveOption(id: string, dir: -1 | 1) {
    setMenuOptions((prev) => {
      const idx = prev.findIndex((o) => o.id === id);
      if (idx < 0) return prev;
      const next = idx + dir;
      if (next < 0 || next >= prev.length) return prev;
      const arr = [...prev];
      [arr[idx], arr[next]] = [arr[next]!, arr[idx]!];
      return arr;
    });
  }

  async function saveAgentConfig(e: FormEvent) {
    e.preventDefault();
    if (menuOptions.some((o) => !o.label.trim())) {
      setAgentErr("Todas as opções precisam ter um rótulo.");
      return;
    }
    setAgentSaving(true);
    setAgentOk(false);
    setAgentErr(null);
    try {
      const res = await fetch("/api/whatsapp-agent", {
        method:  "PUT",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({
          ...agentForm,
          menuOptions,
          menuUrl:      agentForm.menuUrl      || null,
          handoffPhone: agentForm.handoffPhone || null,
        }),
      });
      const json = await res.json();
      if (!res.ok) { setAgentErr(json.error ?? "Erro ao salvar"); return; }
      setAgentOk(true);
      setTimeout(() => setAgentOk(false), 4000);
    } catch {
      setAgentErr("Falha de rede — tente novamente.");
    } finally {
      setAgentSaving(false);
    }
  }

  // ── Loading ───────────────────────────────────────────────────────────────
  if (loading || agentLoading) {
    return (
      <div className="flex h-48 items-center justify-center">
        <p className="text-sm text-muted">Carregando configuração…</p>
      </div>
    );
  }

  const activeAgent = AGENT_TABS.find((a) => a.id === activeTab)!;

  const previewOpt      = menuOptions.find((o) => o.id === previewOptId) ?? null;
  // A per-option phrase (opt.message) overrides the default text of ANY flow —
  // mirrors buildFlowReply on the server so the preview matches what's sent.
  const previewPhrase   = previewOpt?.message?.trim() || null;
  const previewResponse = previewOpt == null ? "" :
    previewOpt.flow === "order"      ? [previewPhrase ?? agentForm.orderPreMessage, agentForm.menuUrl].filter(Boolean).join("\n") :
    previewOpt.flow === "handoff"    ? (previewPhrase ?? agentForm.handoffMessage) :
    previewOpt.flow === "menu"       ? `${previewPhrase ?? "Aqui está nosso cardápio:"}${agentForm.menuUrl ? `\n${agentForm.menuUrl}` : ""}` :
    previewOpt.flow === "promotions" ? `${previewPhrase ?? "Confira nossas promoções atuais:"}${agentForm.menuUrl ? `\n${agentForm.menuUrl}` : ""}` :
    (previewPhrase ?? "(mensagem personalizada)");

  return (
    <div className="mx-auto max-w-2xl p-6">

      {/* Header */}
      <div className="mb-6">
        <h1 className="text-xl font-bold text-ink">Agentes IA</h1>
        <p className="mt-1 text-sm text-muted">
          Configure os agentes de inteligência artificial que atendem seus clientes.
        </p>
      </div>

      {/* Agent selector — 4 cards */}
      <div className="grid grid-cols-2 gap-3 mb-5 sm:grid-cols-4">
        {AGENT_TABS.map((agent) => (
          <button
            key={agent.id}
            type="button"
            onClick={() => setActiveTab(agent.id)}
            className={`flex flex-col gap-2 rounded-xl border-2 p-4 text-left transition-all ${
              activeTab === agent.id
                ? "border-brand-500 bg-brand-50 shadow-sm"
                : "border-line2 hover:border-line2 hover:bg-[#FAFAF8]"
            }`}
          >
            <span className="text-2xl leading-none">{agent.icon}</span>
            <span className={`text-sm font-bold ${activeTab === agent.id ? "text-brand-700" : "text-ink"}`}>
              {agent.label}
            </span>
            <StatusBadge status={agent.status} label={agent.statusLabel} />
          </button>
        ))}
      </div>

      {/* Active agent description bar */}
      <div className="mb-6 flex items-start gap-3 rounded-xl border border-line bg-[#FAFAF8] px-4 py-3">
        <span className="mt-0.5 text-xl leading-none">{activeAgent.icon}</span>
        <p className="flex-1 text-xs text-muted">{activeAgent.description}</p>
        <StatusBadge status={activeAgent.status} label={activeAgent.statusLabel} />
      </div>

      {/* ════════════════════════════════════════════════════════════════════
          WhatsApp Host
      ════════════════════════════════════════════════════════════════════ */}
      {activeTab === "whatsapp-host" && (
        <>
        {/* Entry point to the detailed WhatsApp agent management view — kept under
            Agentes (it used to be a misplaced standalone "WhatsApp" sidebar tab). */}
        <div className="mb-5 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-brand-100 bg-brand-50 px-4 py-3">
          <p className="text-xs text-ink2">
            Acompanhe conversas, saúde e aprendizados do agente no WhatsApp.
          </p>
          <Link
            href="/aprendizado-whatsapp"
            className="shrink-0 rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-brand-700 transition"
          >
            Abrir gestão do WhatsApp →
          </Link>
        </div>
        <form onSubmit={saveAgentConfig} className="space-y-6">

          {agentOk && (
            <div className="rounded-lg border border-green-200 bg-green-50 px-4 py-2.5 text-sm font-medium text-green-700">
              Configuração salva com sucesso.
            </div>
          )}
          {agentErr && (
            <div className="flex items-center justify-between rounded-lg border border-red-200 bg-red-50 px-4 py-2.5 text-sm text-red-700">
              <span>{agentErr}</span>
              <button type="button" onClick={() => setAgentErr(null)} className="ml-4 text-red-400 hover:text-red-600">✕</button>
            </div>
          )}

          {/* 1 — Status do agente */}
          <Section title="Status do agente" subtitle="Identidade e modo de operação do WhatsApp Host.">
            <div>
              <label className="mb-1 block text-sm font-medium text-ink2">Nome do agente</label>
              <input
                type="text"
                value={agentForm.agentName}
                onChange={(e) => patchAgent("agentName")(e.target.value)}
                maxLength={50}
                placeholder="Ex: Ju, Max, Agente Foocci"
                className="w-full rounded-lg border border-line2 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
              />
              <p className="mt-1 text-xs text-muted">Nome que o agente usa para se apresentar ao cliente.</p>
            </div>

            <div>
              <p className="mb-2 text-sm font-medium text-ink2">Modo de operação</p>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {AGENT_MODE_OPTIONS.map((opt) => (
                  <label
                    key={opt.value}
                    className={`flex cursor-pointer flex-col gap-0.5 rounded-lg border p-3 text-sm transition-colors ${
                      agentForm.agentMode === opt.value
                        ? "border-brand-500 bg-brand-50 text-brand-700"
                        : "border-line2 text-ink2 hover:border-line2 hover:bg-[#FAFAF8]"
                    }`}
                  >
                    <input
                      type="radio"
                      className="sr-only"
                      value={opt.value}
                      checked={agentForm.agentMode === opt.value}
                      onChange={() => setAgentForm((prev) => ({ ...prev, agentMode: opt.value }))}
                    />
                    <span className="font-medium">{opt.label}</span>
                    <span className="text-xs text-muted">{opt.desc}</span>
                  </label>
                ))}
              </div>
            </div>

            <RadioRow label="Tom de voz"            options={TONE_OPTIONS}  value={agentForm.tone}  onChange={patchAgent("tone")}  />
            <RadioRow label="Estilo de atendimento" options={STYLE_OPTIONS} value={agentForm.style} onChange={patchAgent("style")} />
          </Section>

          {/* 2 — Menu inicial */}
          <Section title="Menu inicial" subtitle="Primeira mensagem enviada ao cliente e as opções do menu.">
            <div>
              <label className="mb-1 block text-sm font-medium text-ink2">Mensagem de boas-vindas</label>
              <textarea
                value={agentForm.welcomeMessage}
                onChange={(e) => patchAgent("welcomeMessage")(e.target.value)}
                rows={4}
                maxLength={1000}
                placeholder="Ex: Olá! Bem-vindo ao restaurante 🍣 O que você deseja?"
                className="w-full resize-none rounded-lg border border-line2 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
              />
              <CharCount current={agentForm.welcomeMessage.length} max={1000} />
            </div>

            <div className="border-t border-line pt-4">
              <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-muted">Opções do menu</p>
              <p className="mb-3 text-xs text-muted">Botões exibidos após a mensagem. Cada opção aciona um fluxo.</p>
              <div className="space-y-2">
                {menuOptions.length === 0 && (
                  <p className="rounded-lg border border-dashed border-line2 py-4 text-center text-xs text-muted">
                    Nenhuma opção configurada. Adicione abaixo.
                  </p>
                )}
                {menuOptions.map((opt, idx) => (
                  <OptionCard
                    key={opt.id}
                    option={opt}
                    index={idx}
                    total={menuOptions.length}
                    onChange={(p) => updateOption(opt.id, p)}
                    onRemove={() => removeOption(opt.id)}
                    onMoveUp={() => moveOption(opt.id, -1)}
                    onMoveDown={() => moveOption(opt.id, 1)}
                  />
                ))}
              </div>
              <div className="pt-2 space-y-3">
                <button
                  type="button"
                  onClick={() => addOption()}
                  className="rounded-lg border border-dashed border-brand-300 bg-brand-50 px-4 py-2 text-sm font-medium text-brand-600 hover:bg-brand-100 transition-colors"
                >
                  + Nova opção em branco
                </button>
                <div>
                  <p className="mb-2 text-xs font-medium text-muted">Adicionar predefinição:</p>
                  <div className="flex flex-wrap gap-2">
                    {PRESETS_AGENT.map((p) => (
                      <button
                        key={p.label}
                        type="button"
                        onClick={() => addOption(p)}
                        className="rounded-full border border-line2 bg-paper px-3 py-1 text-xs font-medium text-ink2 hover:border-brand-300 hover:text-brand-600 transition-colors"
                      >
                        {FLOW_CONFIG[p.flow].icon} {p.label}
                      </button>
                    ))}
                  </div>
                </div>
                {menuOptions.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setMenuOptions(DEFAULT_MENU_OPTIONS.map((o) => ({ ...o, id: newId() })))}
                    className="text-xs text-muted underline hover:text-ink2"
                  >
                    Restaurar padrões
                  </button>
                )}
              </div>
            </div>
          </Section>

          {/* 3 — Fluxos de atendimento */}
          <Section title="Fluxos de atendimento" subtitle="O que acontece quando o cliente seleciona cada opção do menu.">
            <div className="rounded-xl border border-line2 bg-[#FAFAF8] p-4 space-y-3">
              <div className="flex items-center gap-2">
                <span className="text-lg">🛒</span>
                <div>
                  <p className="text-sm font-semibold text-ink">Fazer pedido</p>
                  <p className="text-xs text-muted">Ativado pelas opções com fluxo &ldquo;Fazer pedido&rdquo;</p>
                </div>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-ink2">Mensagem ao iniciar pedido</label>
                <textarea
                  value={agentForm.orderPreMessage}
                  onChange={(e) => patchAgent("orderPreMessage")(e.target.value)}
                  rows={2}
                  maxLength={500}
                  placeholder="Ex: Ótimo! Aqui está nosso cardápio 👇"
                  className="w-full resize-none rounded-lg border border-line2 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-ink2">
                  URL do cardápio{" "}
                  <span className="font-normal text-muted">(opcional)</span>
                </label>
                <input
                  type="url"
                  value={agentForm.menuUrl}
                  onChange={(e) => patchAgent("menuUrl")(e.target.value)}
                  placeholder="https://seudominio.com/qr/slug"
                  className="w-full rounded-lg border border-line2 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                />
                <p className="mt-1 text-xs text-muted">Enviado junto com a mensagem acima.</p>
              </div>
            </div>

            <div className="space-y-2">
              {PLACEHOLDER_FLOWS.map((flow) => (
                <div key={flow.label} className="flex items-center gap-3 rounded-xl border border-dashed border-line2 bg-[#FAFAF8] px-4 py-3 opacity-70">
                  <span className="text-base leading-none">{flow.icon}</span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-ink2">{flow.label}</p>
                    <p className="text-xs text-muted">{flow.desc}</p>
                  </div>
                  <span className="shrink-0 rounded-full border border-line2 bg-paper px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-muted">
                    Em breve
                  </span>
                </div>
              ))}
            </div>
          </Section>

          {/* 4 — Encaminhamento humano */}
          <Section title="Encaminhamento humano" subtitle="Ativado quando o cliente pede para falar com um atendente.">
            <div>
              <label className="mb-1 block text-sm font-medium text-ink2">
                Telefone do atendente{" "}
                <span className="font-normal text-muted">(WhatsApp, com DDI)</span>
              </label>
              <input
                type="tel"
                value={agentForm.handoffPhone}
                onChange={(e) => patchAgent("handoffPhone")(e.target.value)}
                maxLength={30}
                placeholder="5511999999999"
                className="w-full rounded-lg border border-line2 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-ink2">Mensagem de transferência</label>
              <textarea
                value={agentForm.handoffMessage}
                onChange={(e) => patchAgent("handoffMessage")(e.target.value)}
                rows={2}
                maxLength={500}
                placeholder="Ex: Vou te conectar com um atendente. Um momento! 👋"
                className="w-full resize-none rounded-lg border border-line2 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
              />
            </div>
          </Section>

          {/* 5 — Regras de segurança */}
          <Section
            title="Regras de segurança"
            subtitle="Situações em que o agente transfere automaticamente para um atendente — sempre ativo."
          >
            <div className="space-y-2">
              {SAFETY_CASES.map((rule) => (
                <div key={rule} className="flex items-center gap-2.5 rounded-lg border border-line bg-[#FAFAF8] px-3 py-2.5">
                  <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-green-100">
                    <span className="block h-1.5 w-1.5 rounded-full bg-green-500" />
                  </span>
                  <p className="text-sm text-ink2">{rule}</p>
                </div>
              ))}
            </div>
            <p className="text-xs text-muted">
              Estas regras são fixas e não podem ser desativadas para garantir a segurança do atendimento.
            </p>
          </Section>

          {/* 6 — Fora do horário */}
          <Section title="Fora do horário">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-medium text-ink">Mensagem automática fora do horário</p>
                <p className="mt-0.5 text-xs text-muted">Enviada quando o cliente contata fora do horário de funcionamento.</p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <span className="rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-amber-600">
                  Em breve
                </span>
                <button
                  type="button"
                  role="switch"
                  aria-checked={oohEnabled}
                  onClick={() => setOohEnabled((v) => !v)}
                  className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 transition-colors ${
                    oohEnabled ? "border-brand-500 bg-brand-500" : "border-line2 bg-line2"
                  }`}
                >
                  <span className={`absolute top-0.5 h-3 w-3 rounded-full bg-paper shadow transition-transform ${
                    oohEnabled ? "translate-x-[17px]" : "translate-x-0.5"
                  }`} />
                </button>
              </div>
            </div>
            {oohEnabled && (
              <div>
                <textarea
                  value={oohMessage}
                  onChange={(e) => setOohMessage(e.target.value)}
                  rows={3}
                  maxLength={500}
                  className="w-full resize-none rounded-lg border border-line2 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                />
                <p className="mt-1 text-xs text-amber-500">Esta mensagem ainda não é persistida — configuração em desenvolvimento.</p>
              </div>
            )}
          </Section>

          {/* 7 — Mensagens de fallback */}
          <Section title="Mensagens de fallback">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-medium text-ink">Quando o agente não entende a mensagem</p>
                <p className="mt-0.5 text-xs text-muted">Enviada quando nenhuma intenção é reconhecida.</p>
              </div>
              <span className="shrink-0 rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-amber-600">
                Em breve
              </span>
            </div>
            <div>
              <textarea
                value={fallbackMessage}
                onChange={(e) => setFallbackMessage(e.target.value)}
                rows={2}
                maxLength={500}
                className="w-full resize-none rounded-lg border border-line2 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
              />
              <p className="mt-1 text-xs text-amber-500">Esta mensagem ainda não é persistida — configuração em desenvolvimento.</p>
            </div>
          </Section>

          {/* 8 — Prévia / Teste simples */}
          <Section title="Prévia — como o cliente vê" subtitle="Simulação da primeira interação com o WhatsApp Host.">
            <div className="mx-auto max-w-xs rounded-2xl bg-[#e5ddd5] p-3 shadow-inner space-y-2">
              {/* Agent welcome bubble */}
              <div className="flex justify-start">
                <div className="max-w-[85%] rounded-2xl rounded-tl-none bg-paper px-3 py-2 shadow-sm">
                  <p className="mb-0.5 text-[11px] font-semibold text-[#075e54]">{agentForm.agentName || "Agente"}</p>
                  <p className="whitespace-pre-wrap text-sm leading-relaxed text-ink">{agentForm.welcomeMessage || "…"}</p>
                  {menuOptions.length > 0 && (
                    <div className="mt-2 space-y-1">
                      {menuOptions.map((o, i) => (
                        <button
                          key={o.id}
                          type="button"
                          onClick={() => setPreviewOptId(previewOptId === o.id ? null : o.id)}
                          className={`w-full rounded-lg px-2.5 py-1.5 text-left text-xs font-medium transition-colors ${
                            previewOptId === o.id
                              ? "bg-[#075e54] text-white"
                              : "bg-[#dcf8c6] text-[#075e54] hover:bg-[#c5e8b0]"
                          }`}
                        >
                          {i + 1}. {o.label || "(sem rótulo)"}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Selected option + agent response */}
              {previewOpt != null && (
                <>
                  <div className="flex justify-end">
                    <div className="max-w-[85%] rounded-2xl rounded-tr-none bg-[#dcf8c6] px-3 py-2 shadow-sm">
                      <p className="text-xs text-ink2">{previewOpt.label}</p>
                    </div>
                  </div>
                  {previewResponse.trim() !== "" && (
                    <div className="flex justify-start">
                      <div className="max-w-[85%] rounded-2xl rounded-tl-none bg-paper px-3 py-2 shadow-sm">
                        <p className="mb-0.5 text-[11px] font-semibold text-[#075e54]">{agentForm.agentName || "Agente"}</p>
                        <p className="whitespace-pre-wrap text-sm leading-relaxed text-ink">{previewResponse}</p>
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
            <p className="text-center text-xs text-muted">
              Clique em uma opção para simular a resposta do agente.
            </p>
          </Section>

          <SaveRow saving={agentSaving} label="Salvar WhatsApp Host" />
        </form>

        {/* ── Knowledge Base ─────────────────────────────────────────────── */}
        <div className="mt-8 space-y-6">

          {/* Suggested learnings */}
          {(suggested.length > 0 || gaps.length > 0) && (
            <Section
              title={`Aprendizados pendentes ${suggested.length + gaps.length > 0 ? `(${suggested.length + gaps.length})` : ""}`}
              subtitle="Respostas sugeridas pela equipe aguardando sua aprovação. Aprove para que a IA passe a usar."
            >
              {knowledgeLoading && <p className="text-sm text-muted">Carregando…</p>}
              {suggested.map((item) => (
                <div key={item.id} className="rounded-xl border border-amber-200 bg-amber-50/60 p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-xs font-bold text-amber-700 uppercase tracking-wide">
                          {KNOWLEDGE_CATEGORIES.find((c) => c.id === item.category)?.label ?? item.category}
                        </span>
                        <span className="text-[10px] text-amber-500 bg-amber-100 px-2 py-px rounded-full">
                          {item.source === "HUMAN_REPLY" ? "Aprendido da equipe" : item.source.toLowerCase()}
                        </span>
                      </div>
                      <p className="mt-1 text-sm font-semibold text-ink truncate">{item.title}</p>
                      {item.questionPatterns.length > 0 && (
                        <p className="mt-0.5 text-xs text-muted">
                          Ex: <em>&ldquo;{item.questionPatterns[0]}&rdquo;</em>
                        </p>
                      )}
                      {item.answer && (
                        <p className="mt-1 text-xs text-ink2 bg-paper border border-line rounded-lg px-3 py-2">
                          {item.answer}
                        </p>
                      )}
                      {!item.answer && item.category === "UNKNOWN_GAP" && (
                        <p className="mt-1 text-xs italic text-muted">
                          Gap detectado — a IA pediu ajuda da equipe. Preencha a resposta abaixo.
                        </p>
                      )}
                    </div>
                    <div className="flex gap-1.5 shrink-0">
                      <button
                        type="button"
                        onClick={() => handleKnowledgeStatusChange(item.id, "ACTIVE")}
                        className="rounded-lg bg-green-500 px-3 py-1.5 text-xs font-bold text-white hover:bg-green-600 transition-colors"
                      >
                        Aprovar
                      </button>
                      <button
                        type="button"
                        onClick={() => handleKnowledgeStatusChange(item.id, "REJECTED")}
                        className="rounded-lg border border-line2 px-3 py-1.5 text-xs font-medium text-muted hover:bg-[#F4F4F2] transition-colors"
                      >
                        Rejeitar
                      </button>
                    </div>
                  </div>
                </div>
              ))}
              {gaps.filter((g) => !suggested.includes(g)).map((item) => (
                <div key={item.id} className="rounded-xl border border-red-200 bg-red-50/60 p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <span className="text-xs font-bold text-red-600 uppercase tracking-wide">Gap — sem resposta</span>
                      <p className="mt-1 text-sm text-ink">{item.title}</p>
                      <p className="mt-0.5 text-xs text-muted">
                        O cliente perguntou e a IA não soube responder. Adicione a resposta manualmente.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleKnowledgeDelete(item.id)}
                      className="shrink-0 rounded-lg border border-line2 px-2.5 py-1.5 text-[11px] font-medium text-muted hover:bg-[#F4F4F2]"
                    >
                      Ignorar
                    </button>
                  </div>
                </div>
              ))}
            </Section>
          )}

          {/* Active knowledge */}
          <Section
            title={`Base de conhecimento ativa (${active.length})`}
            subtitle="Fatos aprovados que a IA usa para responder clientes automaticamente."
          >
            {knowledgeLoading && <p className="text-sm text-muted">Carregando…</p>}
            {!knowledgeLoading && active.length === 0 && (
              <p className="text-sm text-muted">
                Nenhum conhecimento ativo ainda. Adicione manualmente ou aprove sugestões acima.
              </p>
            )}
            <div className="space-y-2">
              {active.map((item) => (
                <div key={item.id} className="flex items-start gap-3 rounded-xl border border-green-200 bg-green-50/40 p-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-[10px] font-bold text-green-700 uppercase tracking-wide">
                        {KNOWLEDGE_CATEGORIES.find((c) => c.id === item.category)?.label ?? item.category}
                      </span>
                      {item.usageCount > 0 && (
                        <span className="text-[10px] text-green-600 bg-green-100 px-2 py-px rounded-full">
                          {item.usageCount}× usado
                        </span>
                      )}
                    </div>
                    <p className="mt-0.5 text-sm font-semibold text-ink">{item.title}</p>
                    <p className="mt-0.5 text-xs text-ink2 line-clamp-2">{item.answer}</p>
                  </div>
                  <div className="flex gap-1 shrink-0">
                    <button
                      type="button"
                      onClick={() => handleKnowledgeStatusChange(item.id, "REJECTED")}
                      className="rounded-lg border border-line2 px-2.5 py-1.5 text-[11px] text-muted hover:bg-[#F4F4F2]"
                    >
                      Desativar
                    </button>
                    <button
                      type="button"
                      onClick={() => handleKnowledgeDelete(item.id)}
                      className="rounded-lg border border-red-100 px-2.5 py-1.5 text-[11px] text-red-500 hover:bg-red-50"
                    >
                      Excluir
                    </button>
                  </div>
                </div>
              ))}
            </div>

            {/* Add knowledge manually */}
            {!addKnowledge ? (
              <button
                type="button"
                onClick={() => setAddKnowledge(true)}
                className="mt-2 rounded-lg border border-dashed border-line2 px-4 py-2 text-sm text-muted hover:border-brand-400 hover:text-brand-600 w-full transition-colors"
              >
                + Adicionar conhecimento manualmente
              </button>
            ) : (
              <div className="mt-2 rounded-xl border border-line2 bg-[#FAFAF8] p-4 space-y-3">
                <p className="text-sm font-semibold text-ink">Novo conhecimento</p>
                <div>
                  <label className="mb-1 block text-xs font-medium text-ink2">Título</label>
                  <input
                    type="text"
                    value={kNewTitle}
                    onChange={(e) => setKNewTitle(e.target.value)}
                    placeholder="Ex: Benefício para aniversariante"
                    className="w-full rounded-lg border border-line2 px-3 py-1.5 text-sm focus:border-brand-400 focus:outline-none focus:ring-1 focus:ring-brand-400"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-ink2">
                    Exemplos de pergunta <span className="font-normal text-muted">(uma por linha)</span>
                  </label>
                  <textarea
                    rows={2}
                    value={kNewPatterns}
                    onChange={(e) => setKNewPatterns(e.target.value)}
                    placeholder={"Tem algo para aniversariante?\nAniversariante ganha algo?"}
                    className="w-full resize-none rounded-lg border border-line2 px-3 py-1.5 text-sm focus:border-brand-400 focus:outline-none focus:ring-1 focus:ring-brand-400"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-ink2">Resposta da IA</label>
                  <textarea
                    rows={3}
                    value={kNewAnswer}
                    onChange={(e) => setKNewAnswer(e.target.value)}
                    placeholder="Sim! Aqui o aniversariante ganha uma sobremesa 🎉"
                    className="w-full resize-none rounded-lg border border-line2 px-3 py-1.5 text-sm focus:border-brand-400 focus:outline-none focus:ring-1 focus:ring-brand-400"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-ink2">Categoria</label>
                  <select
                    value={kNewCategory}
                    onChange={(e) => setKNewCategory(e.target.value as KnowledgeCategory)}
                    className="w-full rounded-lg border border-line2 bg-paper px-3 py-1.5 text-sm text-ink2 focus:border-brand-400 focus:outline-none"
                  >
                    {KNOWLEDGE_CATEGORIES.filter((c) => c.id !== "UNKNOWN_GAP").map((c) => (
                      <option key={c.id} value={c.id}>{c.label}</option>
                    ))}
                  </select>
                </div>
                {kSaveErr && <p className="text-xs text-red-600">{kSaveErr}</p>}
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={handleKnowledgeSave}
                    disabled={kSaving || !kNewTitle.trim() || !kNewAnswer.trim() || !kNewPatterns.trim()}
                    className="rounded-lg bg-brand-500 px-4 py-1.5 text-xs font-bold text-white hover:bg-brand-600 disabled:opacity-50 transition-colors"
                  >
                    {kSaving ? "Salvando…" : "Salvar como ativo"}
                  </button>
                  <button
                    type="button"
                    onClick={() => { setAddKnowledge(false); setKSaveErr(null); }}
                    className="rounded-lg border border-line2 px-4 py-1.5 text-xs font-medium text-muted hover:bg-[#F4F4F2]"
                  >
                    Cancelar
                  </button>
                </div>
              </div>
            )}
          </Section>

        </div>
        </>
      )}

      {/* ════════════════════════════════════════════════════════════════════
          Waiter
      ════════════════════════════════════════════════════════════════════ */}
      {activeTab === "waiter" && (
        <form onSubmit={handleSave} className="space-y-6">

          {success && (
            <div className="rounded-lg border border-green-200 bg-green-50 px-4 py-2.5 text-sm font-medium text-green-700">
              Configuração salva com sucesso.
            </div>
          )}
          {error && (
            <div className="flex items-center justify-between rounded-lg border border-red-200 bg-red-50 px-4 py-2.5 text-sm text-red-700">
              <span>{error}</span>
              <button type="button" onClick={() => setErr(null)} className="ml-4 text-red-400 hover:text-red-600">✕</button>
            </div>
          )}

          <Section
            title="Comportamento geral"
            subtitle="Define a personalidade e o estilo de comunicação do Waiter com os clientes."
          >
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {PRESETS.map((p) => {
                const active = form.personalityPreset === p.value;
                return (
                  <button
                    key={p.value}
                    type="button"
                    onClick={(e) => { e.stopPropagation(); applyPreset(p.value); }}
                    className={`flex flex-col gap-2 rounded-xl border-2 p-4 text-left transition-all ${
                      active
                        ? "border-brand-500 bg-brand-50 shadow-sm"
                        : "border-line2 hover:border-line2 hover:bg-[#FAFAF8]"
                    }`}
                  >
                    <span className={`text-sm font-bold ${active ? "text-brand-700" : "text-ink"}`}>
                      {p.label}
                    </span>
                    <span className={`text-xs ${active ? "text-brand-500" : "text-muted"}`}>
                      {p.tagline}
                    </span>
                    <div className="flex flex-wrap gap-1">
                      {p.badges.map((b) => (
                        <span
                          key={b}
                          className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${
                            active ? "bg-brand-100 text-brand-600" : "bg-[#F4F4F2] text-muted"
                          }`}
                        >
                          {b}
                        </span>
                      ))}
                    </div>
                  </button>
                );
              })}
            </div>
            <div className="border-t border-line pt-4 space-y-4">
              <p className="text-xs font-semibold text-muted uppercase tracking-wider">Ajuste fino</p>
              <ChipGroup
                label="Formalidade"
                options={FORMALITY_OPTIONS}
                value={form.formality}
                onChange={(v) => patch("formality", v)}
              />
              <ChipGroup
                label="Emojis"
                options={EMOJI_OPTIONS}
                value={form.emojiUsage}
                onChange={(v) => patch("emojiUsage", v)}
                cols={4}
              />
            </div>
          </Section>

          <Section
            title="Saudação"
            subtitle="Define o estilo de abertura — não uma frase fixa, mas como o agente inicia cada conversa."
          >
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
              {GREETING_OPTIONS.map((opt) => {
                const active = form.tone === opt.value;
                return (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={(e) => { e.stopPropagation(); patch("tone", opt.value); }}
                    className={`flex flex-col gap-2 rounded-xl border-2 p-4 text-left transition-all ${
                      active
                        ? "border-brand-500 bg-brand-50"
                        : "border-line2 hover:border-line2 hover:bg-[#FAFAF8]"
                    }`}
                  >
                    <span className={`text-sm font-bold ${active ? "text-brand-700" : "text-ink"}`}>
                      {opt.label}
                    </span>
                    <span className={`text-xs ${active ? "text-brand-500" : "text-muted"}`}>
                      {opt.desc}
                    </span>
                    <div className={`mt-1 rounded-lg px-3 py-2 text-xs leading-relaxed ${
                      active ? "bg-brand-100 text-brand-700" : "bg-[#F4F4F2] text-muted"
                    }`}>
                      &ldquo;{opt.example}&rdquo;
                    </div>
                  </button>
                );
              })}
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-muted">
                Abertura personalizada{" "}
                <span className="font-normal normal-case text-muted">
                  (opcional — deixe em branco para usar o estilo acima)
                </span>
              </label>
              <textarea
                value={form.greetingTemplate ?? ""}
                onChange={(e) => patch("greetingTemplate", e.target.value || null)}
                rows={2}
                maxLength={300}
                placeholder="Ex: Olá! Bem-vindo ao Restaurante XYZ 🍕 Pronto para pedir?"
                className="w-full resize-none rounded-lg border border-line2 bg-[#FAFAF8] px-3 py-2 text-sm text-ink placeholder-gray-400 focus:border-brand-400 focus:bg-paper focus:outline-none focus:ring-1 focus:ring-brand-400"
              />
              <p className="mt-1 text-[11px] text-muted">
                Quando preenchido, substitui o estilo selecionado acima.
              </p>
            </div>
          </Section>

          <Section
            title="Venda guiada"
            subtitle="Como o Waiter conduz o cliente em direção ao pedido ideal."
          >
            <ChipGroup
              label="Foco de vendas"
              options={FOCUS_OPTIONS}
              value={form.salesFocus}
              onChange={(v) => patch("salesFocus", v)}
            />
            <ChipGroup
              label="Prioridade de sugestão"
              options={PRIORITY_OPTIONS}
              value={form.salesPriority}
              onChange={(v) => patch("salesPriority", v)}
            />
          </Section>

          <Section
            title="Upsell e promoções"
            subtitle="Com que frequência o Waiter sugere itens extras e promoções ativas."
          >
            <ChipGroup
              label="Intensidade do upsell"
              options={INTENSITY_OPTIONS}
              value={form.upsellIntensity}
              onChange={applyIntensity}
            />
            <div className="space-y-2">
              {UPSELL_STYLE_OPTIONS.map((opt) => (
                <label
                  key={opt.value}
                  className={`flex cursor-pointer items-center gap-3 rounded-lg border p-3 transition-colors ${
                    form.upsellStyle === opt.value
                      ? "border-brand-400 bg-brand-50"
                      : "border-line2 hover:border-line2"
                  }`}
                >
                  <input
                    type="radio"
                    name="upsellStyle"
                    className="accent-brand-600"
                    checked={form.upsellStyle === opt.value}
                    onChange={() => patch("upsellStyle", opt.value)}
                  />
                  <div>
                    <p className={`text-sm font-medium ${form.upsellStyle === opt.value ? "text-brand-700" : "text-ink"}`}>
                      {opt.label}
                    </p>
                    <p className="text-xs text-muted">{opt.desc}</p>
                  </div>
                </label>
              ))}
            </div>
          </Section>

          <Section
            title="Ofertas no fechamento do pedido"
            subtitle="Quais categorias do SEU cardápio o Garçom oferece quando o cliente vai finalizar — e em que ordem. Cada uma é oferecida uma vez só, sem insistir."
          >
            <UpsellCategoriesPicker
              value={form.waiterUpsellCategories ?? []}
              onChange={(next) => patch("waiterUpsellCategories", next)}
            />
          </Section>

          <Section
            title="Instruções do agente"
            subtitle="Use este campo para orientar o comportamento do Waiter. Ele seguirá essas instruções junto com as regras obrigatórias do Foocci, cardápio, marca e fluxo do pedido."
          >
            <div>
              <textarea
                value={form.waiterPrompt ?? ""}
                onChange={(e) => patch("waiterPrompt", e.target.value || null)}
                rows={5}
                maxLength={2000}
                placeholder="Ex: Seja mais consultivo, sugira combos com bebidas, evite insistir após uma recusa, destaque pratos quentes em dias frios..."
                className="w-full resize-none rounded-lg border border-line2 bg-[#FAFAF8] px-3 py-2 text-sm text-ink placeholder-gray-400 focus:border-brand-400 focus:bg-paper focus:outline-none focus:ring-1 focus:ring-brand-400"
              />
              <div className="flex items-start justify-between mt-1 gap-3">
                <p className="text-[11px] text-muted">
                  As regras críticas do sistema sempre prevalecem sobre estas instruções. O agente ignorará qualquer instrução que conflite com segurança, cardápio real ou etapas do pedido.
                </p>
                <CharCount current={(form.waiterPrompt ?? "").length} max={2000} />
              </div>
            </div>
          </Section>

          <ComingSoon
            title="Segurança e limites"
            items={[
              "Tópicos que o Waiter não deve abordar",
              "Número máximo de mensagens por sessão",
              "Inteligência de cardápio — restrições alimentares automáticas",
              "Sugestões baseadas no histórico do cliente",
            ]}
          />

          <SaveRow saving={saving} label="Salvar Waiter" />
        </form>
      )}

      {/* ════════════════════════════════════════════════════════════════════
          CRM
      ════════════════════════════════════════════════════════════════════ */}
      {activeTab === "crm" && (
        <div className="space-y-5">

          {/* Page header */}
          <div>
            <h2 className="text-base font-bold text-ink">Agente CRM</h2>
            <p className="mt-0.5 text-xs text-muted">
              Identifica oportunidades de recompra, clientes inativos, VIPs, campanhas, automações e receita gerada pelo relacionamento.
            </p>
          </div>

          {/* Loading */}
          {crmLoading && (
            <div className="py-10 text-center text-sm text-muted">
              Carregando dados do CRM…
            </div>
          )}

          {/* Error / not loaded */}
          {!crmLoading && crmLoaded && !crmSummary && (
            <div className="rounded-xl border border-line2 bg-[#FAFAF8] py-8 text-center text-sm text-muted">
              Não foi possível carregar os dados do CRM.
            </div>
          )}

          {/* ── Main content ── */}
          {!crmLoading && crmSummary && (() => {
            const s = crmSummary;
            const hasRevenue = s.revenue.totalSent > 0;

            const opportunities: Array<{
              emoji: string;
              label: string;
              desc:  string;
              why:   string;
            }> = [
              s.overview.frioCustomers > 0 && {
                emoji: "🥶",
                label: "Recuperar clientes frios",
                desc:  `${s.overview.frioCustomers} clientes sem comprar há mais de 60 dias.`,
                why:   "Alto risco de perda definitiva — o momento de agir é agora.",
              },
              s.overview.mornoCustomers > 0 && {
                emoji: "🌡️",
                label: "Reativar clientes mornos",
                desc:  `${s.overview.mornoCustomers} clientes sem comprar entre 31 e 60 dias.`,
                why:   "Uma lembrança no momento certo evita que fiquem frios.",
              },
              s.overview.newCustomers > 0 && {
                emoji: "🔁",
                label: "Garantir a segunda compra",
                desc:  `${s.overview.newCustomers} clientes novos este mês.`,
                why:   "O segundo pedido é o mais importante para criar fidelidade.",
              },
              s.overview.birthdayThisMonth > 0 && {
                emoji: "🎂",
                label: "Aniversariantes do mês",
                desc:  `${s.overview.birthdayThisMonth} clientes com aniversário este mês.`,
                why:   "Mensagens de aniversário têm alta taxa de conversão.",
              },
              s.overview.vipCustomers > 0 && {
                emoji: "👑",
                label: "Oferta exclusiva para VIPs",
                desc:  `${s.overview.vipCustomers} clientes VIP na base.`,
                why:   "Seus melhores clientes merecem tratamento especial.",
              },
            ].filter((x): x is { emoji: string; label: string; desc: string; why: string } => x !== false);

            return (
              <>
                {/* 1 — Resumo comercial */}
                <Section title="Resumo comercial" subtitle="Situação atual da base de clientes e do CRM.">
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                    <StatCard emoji="🥶" label="Clientes frios"      value={s.overview.frioCustomers}     desc="+60 dias sem comprar"          bg="bg-blue-50 border-blue-100"     color="text-blue-700"   />
                    <StatCard emoji="🌡️" label="Clientes mornos"     value={s.overview.mornoCustomers}    desc="31–60 dias sem comprar"         bg="bg-amber-50 border-amber-100"   color="text-amber-700"  />
                    <StatCard emoji="👑" label="Clientes VIP"        value={s.overview.vipCustomers}      desc="Ouro + Diamante"                bg="bg-cyan-50 border-cyan-100"     color="text-cyan-700"   />
                    <StatCard emoji="📣" label="Campanhas ativas"    value={s.campaigns.activeCount}      desc="Ativas, agendadas ou em pausa"  bg="bg-green-50 border-green-100"   color="text-green-700"  />
                    <StatCard emoji="🔄" label="Automações ativas"   value={s.automations.enabledCount}   desc="Disparos automáticos ligados"   bg="bg-brand-50 border-brand-100" color="text-brand-600" />
                    <StatCard emoji="🎂" label="Aniversariantes"     value={s.overview.birthdayThisMonth} desc="Neste mês"                      bg="bg-rose-50 border-rose-100"     color="text-rose-700"   />
                  </div>
                </Section>

                {/* 2 — Oportunidades */}
                <Section title="Oportunidades para agir agora" subtitle="Segmentos com maior potencial de resultado hoje.">
                  {opportunities.length === 0 ? (
                    <p className="text-sm text-muted">
                      Nenhuma oportunidade identificada no momento — base de clientes ativa e bem aquecida.
                    </p>
                  ) : (
                    <div className="space-y-2">
                      {opportunities.map((opp) => (
                        <div
                          key={opp.label}
                          className="flex items-start gap-3 rounded-xl border border-line bg-[#FAFAF8] px-4 py-3"
                        >
                          <span className="text-xl leading-none mt-0.5 shrink-0">{opp.emoji}</span>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-semibold text-ink">{opp.label}</p>
                            <p className="text-xs text-muted mt-0.5">{opp.desc}</p>
                            <p className="text-[11px] text-muted mt-1 italic">{opp.why}</p>
                          </div>
                          <Link
                            href="/crm?tab=campanhas"
                            className="shrink-0 self-center rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-brand-700 transition-colors"
                          >
                            Criar campanha
                          </Link>
                        </div>
                      ))}
                    </div>
                  )}
                </Section>

                {/* 3 — Campanhas em andamento */}
                <Section title="Campanhas em andamento" subtitle="Campanhas ativas, agendadas e em pausa.">
                  {s.campaigns.list.length === 0 ? (
                    <div className="space-y-3">
                      <p className="text-sm text-muted">Nenhuma campanha ativa no momento.</p>
                      <Link
                        href="/crm?tab=campanhas"
                        className="inline-flex items-center gap-1.5 rounded-lg bg-brand-600 px-4 py-2 text-xs font-bold text-white hover:bg-brand-700 transition-colors"
                      >
                        Criar primeira campanha →
                      </Link>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {s.campaigns.list.map((c) => {
                        const cfg         = c.scheduleConfig as { mode?: string } | null;
                        const isRecurring = cfg?.mode === "RECURRING";
                        const isScheduled = cfg?.mode === "SCHEDULED_ONCE";
                        const modeLabel   = isRecurring ? "Recorrente" : isScheduled ? "Agendada" : "Manual";
                        const statusCls   = c.status === "ACTIVE"
                          ? "bg-green-100 text-green-700"
                          : c.status === "SCHEDULED"
                          ? "bg-amber-100 text-amber-700"
                          : c.status === "PAUSED"
                          ? "bg-amber-100 text-amber-700"
                          : "bg-blue-100 text-blue-700";
                        const hasStats    = c.totalSent > 0;
                        const convRate    = c.totalSent > 0
                          ? Math.round((c.totalConverted / c.totalSent) * 100)
                          : null;
                        return (
                          <div key={c.id} className="rounded-xl border border-line bg-paper px-4 py-3">
                            <div className="flex items-start justify-between gap-2">
                              <div className="min-w-0 flex-1">
                                <p className="text-sm font-semibold text-ink truncate">{c.name}</p>
                                <p className="text-[10px] text-muted mt-0.5">
                                  {CRM_SEGMENT_LABELS[c.targetSegment ?? ""] ?? c.targetSegment ?? "—"} · {modeLabel}
                                </p>
                              </div>
                              <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold ${statusCls}`}>
                                {CRM_STATUS_LABELS[c.status] ?? c.status}
                              </span>
                            </div>
                            {hasStats && (
                              <div className="mt-2 flex flex-wrap gap-3 text-[10px] text-muted border-t border-line pt-2">
                                <span>{c.totalSent.toLocaleString("pt-BR")} enviados</span>
                                {c.totalResponded > 0 && <span className="text-blue-600">{c.totalResponded} respostas</span>}
                                {c.totalConverted > 0 && (
                                  <span className="text-green-600 font-semibold">
                                    {c.totalConverted} conversões{convRate !== null && ` (${convRate}%)`}
                                    {c.totalRevenue > 0 && ` · R$${c.totalRevenue.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`}
                                  </span>
                                )}
                              </div>
                            )}
                          </div>
                        );
                      })}
                      <Link
                        href="/crm?tab=campanhas"
                        className="inline-flex items-center gap-1 text-xs font-semibold text-brand-600 hover:text-brand-700 transition-colors"
                      >
                        Ver todas as campanhas →
                      </Link>
                    </div>
                  )}
                </Section>

                {/* 4 — Automações */}
                <Section title="Automações do CRM" subtitle="Regras ativas que disparam mensagens automaticamente.">
                  <div className="space-y-2">
                    {(["REACTIVATION", "BIRTHDAY", "POST_ORDER"] as const).map((trigger) => {
                      const auto = s.automations.list.find((a) => a.trigger === trigger);
                      const enabled = auto?.isEnabled ?? false;
                      return (
                        <div
                          key={trigger}
                          className={`flex items-center gap-3 rounded-xl border px-4 py-3 ${
                            enabled ? "border-green-200 bg-green-50/40" : "border-line bg-paper"
                          }`}
                        >
                          <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${enabled ? "bg-green-500" : "bg-line2"}`} />
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-semibold text-ink">
                              {CRM_TRIGGER_LABELS[trigger] ?? trigger}
                            </p>
                            <p className="text-[10px] text-muted mt-0.5">
                              {CRM_TRIGGER_DESC[trigger]}
                              {auto && trigger !== "BIRTHDAY" && ` · ${auto.triggerAfterDays}d`}
                            </p>
                          </div>
                          <span className={`shrink-0 text-[10px] font-bold ${enabled ? "text-green-600" : "text-muted"}`}>
                            {enabled ? "Ativa" : "Inativa"}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                  <div className="pt-1">
                    <Link
                      href="/crm?tab=automacoes"
                      className="inline-flex items-center gap-1 text-xs font-semibold text-brand-600 hover:text-brand-700 transition-colors"
                    >
                      Gerenciar automações →
                    </Link>
                  </div>
                </Section>

                {/* 5 — Resultado do CRM */}
                <Section title="Resultado do CRM" subtitle="Receita e conversões atribuídas a campanhas e automações.">
                  {!hasRevenue ? (
                    <p className="text-sm text-muted">
                      Ainda não há receita atribuída ao CRM. Quando campanhas e automações gerarem pedidos, os resultados aparecerão aqui.
                    </p>
                  ) : (
                    <div className="space-y-3">
                      <div className="grid grid-cols-2 gap-3">
                        <div className="rounded-xl border border-line bg-[#FAFAF8] px-4 py-3">
                          <p className="text-[10px] font-semibold uppercase tracking-wide text-muted">Mensagens enviadas</p>
                          <p className="mt-1 text-xl font-bold text-ink">{s.revenue.totalSent.toLocaleString("pt-BR")}</p>
                        </div>
                        <div className="rounded-xl border border-line bg-[#FAFAF8] px-4 py-3">
                          <p className="text-[10px] font-semibold uppercase tracking-wide text-muted">Respostas</p>
                          <p className="mt-1 text-xl font-bold text-ink">{s.revenue.totalResponded.toLocaleString("pt-BR")}</p>
                        </div>
                        <div className="rounded-xl border border-green-100 bg-green-50 px-4 py-3">
                          <p className="text-[10px] font-semibold uppercase tracking-wide text-green-600">Conversões</p>
                          <p className="mt-1 text-xl font-bold text-green-700">{s.revenue.totalConverted.toLocaleString("pt-BR")}</p>
                          {s.revenue.totalSent > 0 && (
                            <p className="text-[10px] text-green-500 mt-0.5">
                              {Math.round((s.revenue.totalConverted / s.revenue.totalSent) * 100)}% de conversão
                            </p>
                          )}
                        </div>
                        <div className="rounded-xl border border-emerald-100 bg-emerald-50 px-4 py-3">
                          <p className="text-[10px] font-semibold uppercase tracking-wide text-emerald-600">Receita gerada</p>
                          <p className="mt-1 text-xl font-bold text-emerald-700">
                            R${s.revenue.totalRevenue.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                          </p>
                        </div>
                      </div>
                    </div>
                  )}
                </Section>
              </>
            );
          })()}

        </div>
      )}

      {/* ════════════════════════════════════════════════════════════════════
          Analytics
      ════════════════════════════════════════════════════════════════════ */}
      {activeTab === "analytics" && (
        <div className="space-y-6">

          <Section
            title="O que o Agente Analytics faz"
            subtitle="Age como o gerente comercial do restaurante, monitorando resultados e emitindo alertas."
          >
            <div className="rounded-lg border border-brand-100 bg-brand-50 p-4 space-y-2">
              <p className="text-sm font-medium text-brand-800">Responsabilidades:</p>
              <ul className="space-y-1.5 text-sm text-brand-700">
                {[
                  "Monitorar KPIs em tempo real (ticket médio, taxa de recompra, conversão)",
                  "Enviar alertas quando métricas saem do padrão",
                  "Identificar produtos parados e oportunidades de promoção",
                  "Gerar relatórios de rentabilidade e mix de vendas",
                  "Recomendar ações com base em dados históricos",
                ].map((item) => (
                  <li key={item} className="flex items-center gap-2">
                    <span className="text-brand-500 font-bold">✓</span>
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          </Section>

          <ComingSoon
            title="Configurações do Agente Analytics"
            items={[
              "KPIs monitorados — escolha quais métricas acompanhar",
              "Alertas automáticos — limites e frequência de notificação",
              "Frequência de insights — diário, semanal, mensal",
              "Ticket médio — meta e desvio aceitável",
              "Taxa de recompra — período de análise",
              "Produtos parados — dias sem venda para alertar",
              "Produtos mais vendidos — ranking e tendências",
              "Margem e rentabilidade — análise por categoria",
            ]}
          />
        </div>
      )}

    </div>
  );
}
