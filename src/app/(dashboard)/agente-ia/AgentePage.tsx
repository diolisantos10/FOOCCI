"use client";

import { useState, useEffect, type FormEvent } from "react";
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
    status:      "breve",
    statusLabel: "Em breve",
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
  { value: "RECEPTIONIST_ONLY", label: "Recepcionista",      desc: "Responde, exibe opções e direciona o cliente"  },
  { value: "HUMAN_ASSISTED",    label: "Com suporte humano", desc: "IA e equipe atuam juntos na mesma conversa"    },
];

const FLOW_CONFIG: Record<FlowType, { label: string; desc: string; icon: string }> = {
  order:      { icon: "🛒", label: "Fazer pedido",          desc: "Envia msg de pedido + link do cardápio" },
  handoff:    { icon: "👤", label: "Falar com atendente",   desc: "Encaminha para o número configurado"    },
  menu:       { icon: "📋", label: "Ver cardápio",           desc: "Envia o link do cardápio"               },
  promotions: { icon: "🎁", label: "Ver promoções",          desc: "O agente lista as promoções ativas"     },
  custom:     { icon: "💬", label: "Mensagem personalizada", desc: "Envia um texto livre definido aqui"     },
};

const PRESETS_AGENT: Array<{ label: string; flow: FlowType; message?: string }> = [
  { label: "Fazer pedido",        flow: "order"      },
  { label: "Falar com atendente", flow: "handoff"    },
  { label: "Ver promoções",       flow: "promotions" },
  { label: "Ver cardápio",        flow: "menu"       },
  { label: "Informações",         flow: "custom",    message: "Horário: ...\nEndereço: ..." },
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

// ── Status badge ──────────────────────────────────────────────────────────────

function StatusBadge({ status, label }: { status: AgentStatus; label: string }) {
  const cls =
    status === "ativo"
      ? "bg-green-100 text-green-700 border-green-200"
      : status === "parcial"
      ? "bg-amber-100 text-amber-700 border-amber-200"
      : "bg-gray-100 text-gray-500 border-gray-200";
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
    <section className="rounded-xl border border-gray-200 bg-white p-5 space-y-5">
      <div>
        <h2 className="text-sm font-semibold text-gray-900">{title}</h2>
        {subtitle && <p className="mt-0.5 text-xs text-gray-500">{subtitle}</p>}
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
      <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-gray-500">
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
                : "border-gray-200 hover:border-gray-300 hover:bg-gray-50"
            }`}
          >
            <span className={`text-sm font-semibold ${value === opt.value ? "text-brand-700" : "text-gray-800"}`}>
              {opt.label}
            </span>
            <span className="text-xs text-gray-500">{opt.desc}</span>
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
      <p className="mb-2 text-sm font-medium text-gray-700">{label}</p>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        {options.map((opt) => (
          <label
            key={opt.value}
            className={`flex cursor-pointer flex-col gap-0.5 rounded-lg border p-3 text-sm transition-colors ${
              value === opt.value
                ? "border-brand-500 bg-brand-50 text-brand-700"
                : "border-gray-200 text-gray-700 hover:border-gray-300 hover:bg-gray-50"
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
            <span className="text-xs text-gray-500">{opt.desc}</span>
          </label>
        ))}
      </div>
    </div>
  );
}

function SaveRow({ saving, label }: { saving: boolean; label: string }) {
  return (
    <div className="flex items-center justify-end gap-3 pt-2 pb-4">
      <p className="text-xs text-gray-400">Aplicado em novas conversas imediatamente.</p>
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
    <p className={`mt-0.5 text-right text-xs ${near ? "text-amber-500" : "text-gray-400"}`}>
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
    <div className="rounded-xl border border-gray-200 bg-gray-50 p-3 space-y-2">
      <div className="flex items-center gap-2">
        <span className="shrink-0 flex h-6 w-6 items-center justify-center rounded-full bg-gray-200 text-xs font-bold text-gray-600">
          {index + 1}
        </span>
        <input
          type="text"
          value={option.label}
          onChange={(e) => onChange({ label: e.target.value })}
          maxLength={60}
          placeholder="Ex: Fazer pedido"
          className="flex-1 min-w-0 rounded-lg border border-gray-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
        />
        <select
          value={option.flow}
          onChange={(e) => onChange({ flow: e.target.value as FlowType })}
          className="rounded-lg border border-gray-300 bg-white px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-brand-500"
        >
          {FLOW_TYPES.map((f) => (
            <option key={f} value={f}>{FLOW_CONFIG[f].icon} {FLOW_CONFIG[f].label}</option>
          ))}
        </select>
        <div className="flex flex-col gap-0.5 shrink-0">
          <button type="button" onClick={onMoveUp} disabled={index === 0}
            className="flex h-5 w-5 items-center justify-center rounded text-xs text-gray-400 hover:bg-gray-200 disabled:opacity-30"
            aria-label="Mover para cima">▲</button>
          <button type="button" onClick={onMoveDown} disabled={index === total - 1}
            className="flex h-5 w-5 items-center justify-center rounded text-xs text-gray-400 hover:bg-gray-200 disabled:opacity-30"
            aria-label="Mover para baixo">▼</button>
        </div>
        <button type="button" onClick={onRemove}
          className="shrink-0 flex h-7 w-7 items-center justify-center rounded-lg text-red-400 hover:bg-red-50 hover:text-red-600 transition-colors"
          aria-label="Remover opção">✕</button>
      </div>
      <p className="pl-8 text-xs text-gray-500">{flow.icon} {flow.desc}</p>
      {option.flow === "custom" && (
        <div className="pl-8">
          <textarea
            value={option.message ?? ""}
            onChange={(e) => onChange({ message: e.target.value })}
            rows={2}
            maxLength={500}
            placeholder="Mensagem enviada ao cliente ao selecionar esta opção…"
            className="w-full resize-none rounded-lg border border-gray-300 px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-brand-500"
          />
        </div>
      )}
    </div>
  );
}

function ComingSoon({ title, items }: { title: string; items: string[] }) {
  return (
    <div className="rounded-xl border border-dashed border-gray-200 bg-gray-50 p-5">
      <p className="text-xs font-semibold uppercase tracking-widest text-gray-400 mb-2">Em breve</p>
      <p className="text-sm font-semibold text-gray-700 mb-3">{title}</p>
      <ul className="space-y-1.5">
        {items.map((item) => (
          <li key={item} className="flex items-center gap-2 text-xs text-gray-500">
            <span className="h-1 w-1 shrink-0 rounded-full bg-gray-300" />
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
        <p className="text-sm text-gray-400">Carregando configuração…</p>
      </div>
    );
  }

  const activeAgent = AGENT_TABS.find((a) => a.id === activeTab)!;

  return (
    <div className="mx-auto max-w-2xl p-6">

      {/* Header */}
      <div className="mb-6">
        <h1 className="text-xl font-bold text-gray-900">Agentes IA</h1>
        <p className="mt-1 text-sm text-gray-500">
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
                : "border-gray-200 hover:border-gray-300 hover:bg-gray-50"
            }`}
          >
            <span className="text-2xl leading-none">{agent.icon}</span>
            <span className={`text-sm font-bold ${activeTab === agent.id ? "text-brand-700" : "text-gray-800"}`}>
              {agent.label}
            </span>
            <StatusBadge status={agent.status} label={agent.statusLabel} />
          </button>
        ))}
      </div>

      {/* Active agent description bar */}
      <div className="mb-6 flex items-start gap-3 rounded-xl border border-gray-100 bg-gray-50 px-4 py-3">
        <span className="mt-0.5 text-xl leading-none">{activeAgent.icon}</span>
        <p className="flex-1 text-xs text-gray-500">{activeAgent.description}</p>
        <StatusBadge status={activeAgent.status} label={activeAgent.statusLabel} />
      </div>

      {/* ════════════════════════════════════════════════════════════════════
          WhatsApp Host
      ════════════════════════════════════════════════════════════════════ */}
      {activeTab === "whatsapp-host" && (
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

          <Section title="Identidade do agente" subtitle="Como o agente se apresenta e interage no WhatsApp.">
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">Nome do agente</label>
              <input
                type="text"
                value={agentForm.agentName}
                onChange={(e) => patchAgent("agentName")(e.target.value)}
                maxLength={50}
                placeholder="Ex: Ju, Max, Agente Foocci"
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
              />
              <p className="mt-1 text-xs text-gray-400">Nome que o agente usa para se apresentar ao cliente.</p>
            </div>

            <div>
              <p className="mb-2 text-sm font-medium text-gray-700">Modo de operação</p>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {AGENT_MODE_OPTIONS.map((opt) => (
                  <label
                    key={opt.value}
                    className={`flex cursor-pointer flex-col gap-0.5 rounded-lg border p-3 text-sm transition-colors ${
                      agentForm.agentMode === opt.value
                        ? "border-brand-500 bg-brand-50 text-brand-700"
                        : "border-gray-200 text-gray-700 hover:border-gray-300 hover:bg-gray-50"
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
                    <span className="text-xs text-gray-500">{opt.desc}</span>
                  </label>
                ))}
              </div>
            </div>

            <RadioRow label="Tom de voz"          options={TONE_OPTIONS}  value={agentForm.tone}  onChange={patchAgent("tone")}  />
            <RadioRow label="Estilo de atendimento" options={STYLE_OPTIONS} value={agentForm.style} onChange={patchAgent("style")} />
          </Section>

          <Section title="Mensagem de boas-vindas">
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">Mensagem inicial</label>
              <textarea
                value={agentForm.welcomeMessage}
                onChange={(e) => patchAgent("welcomeMessage")(e.target.value)}
                rows={4}
                maxLength={1000}
                placeholder="Ex: Olá! Bem-vindo ao restaurante 🍣 O que você deseja?"
                className="w-full resize-none rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
              />
              <CharCount current={agentForm.welcomeMessage.length} max={1000} />
            </div>
            <div className="rounded-xl bg-[#dcf8c6] px-4 py-3 text-sm text-gray-800 shadow-inner max-w-xs">
              <p className="text-[11px] font-semibold text-gray-500 mb-1">Pré-visualização</p>
              <p className="whitespace-pre-wrap leading-relaxed">{agentForm.welcomeMessage || "…"}</p>
              {menuOptions.length > 0 && (
                <div className="mt-2 space-y-1">
                  {menuOptions.map((o, i) => (
                    <div key={o.id} className="rounded bg-white/70 px-2 py-1 text-xs font-medium text-gray-700">
                      {i + 1}. {o.label || <span className="text-gray-400 italic">sem rótulo</span>}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </Section>

          <Section title="Opções de entrada">
            <p className="text-xs text-gray-500">
              Botões exibidos após a mensagem de boas-vindas. Cada opção aciona um fluxo.
            </p>
            <div className="space-y-2">
              {menuOptions.length === 0 && (
                <p className="rounded-lg border border-dashed border-gray-300 py-4 text-center text-xs text-gray-400">
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
            <div className="pt-1 space-y-3">
              <button
                type="button"
                onClick={() => addOption()}
                className="rounded-lg border border-dashed border-brand-300 bg-brand-50 px-4 py-2 text-sm font-medium text-brand-600 hover:bg-brand-100 transition-colors"
              >
                + Nova opção em branco
              </button>
              <div>
                <p className="mb-2 text-xs font-medium text-gray-500">Adicionar predefinição:</p>
                <div className="flex flex-wrap gap-2">
                  {PRESETS_AGENT.map((p) => (
                    <button
                      key={p.label}
                      type="button"
                      onClick={() => addOption(p)}
                      className="rounded-full border border-gray-200 bg-white px-3 py-1 text-xs font-medium text-gray-600 hover:border-brand-300 hover:text-brand-600 transition-colors"
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
                  className="text-xs text-gray-400 underline hover:text-gray-600"
                >
                  Restaurar padrões
                </button>
              )}
            </div>
          </Section>

          <Section title='Fluxo — "Fazer pedido"'>
            <p className="text-xs text-gray-500">
              Ativado quando o cliente escolhe uma opção com fluxo{" "}
              <span className="font-semibold text-gray-700">Fazer pedido</span>.
            </p>
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">Mensagem ao iniciar pedido</label>
              <textarea
                value={agentForm.orderPreMessage}
                onChange={(e) => patchAgent("orderPreMessage")(e.target.value)}
                rows={2}
                maxLength={500}
                placeholder="Ex: Ótimo! Aqui está nosso cardápio 👇"
                className="w-full resize-none rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">
                URL do cardápio{" "}
                <span className="font-normal text-gray-400">(opcional)</span>
              </label>
              <input
                type="url"
                value={agentForm.menuUrl}
                onChange={(e) => patchAgent("menuUrl")(e.target.value)}
                placeholder="https://seudominio.com/qr/slug"
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
              />
              <p className="mt-1 text-xs text-gray-400">Enviado junto com a mensagem acima.</p>
            </div>
          </Section>

          <Section title='Fluxo — "Falar com atendente"'>
            <p className="text-xs text-gray-500">
              Ativado quando o cliente escolhe uma opção com fluxo{" "}
              <span className="font-semibold text-gray-700">Falar com atendente</span>.
            </p>
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">
                Telefone do atendente{" "}
                <span className="font-normal text-gray-400">(WhatsApp, com DDI)</span>
              </label>
              <input
                type="tel"
                value={agentForm.handoffPhone}
                onChange={(e) => patchAgent("handoffPhone")(e.target.value)}
                maxLength={30}
                placeholder="5511999999999"
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">Mensagem de transferência</label>
              <textarea
                value={agentForm.handoffMessage}
                onChange={(e) => patchAgent("handoffMessage")(e.target.value)}
                rows={2}
                maxLength={500}
                placeholder="Ex: Vou te conectar com um atendente. Um momento! 👋"
                className="w-full resize-none rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
              />
            </div>
          </Section>

          <ComingSoon
            title="Recursos avançados em desenvolvimento"
            items={[
              "Autonomia máxima — quantas perguntas o agente responde sozinho",
              "Regras de segurança — tópicos que o agente não deve abordar",
              "Respostas fora do horário — mensagens automáticas quando fechado",
              "Quando chamar humano — gatilhos automáticos de transferência",
              "Fluxos personalizados — jornadas configuráveis por objetivo",
            ]}
          />

          <SaveRow saving={agentSaving} label="Salvar WhatsApp Host" />
        </form>
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
                        : "border-gray-200 hover:border-gray-300 hover:bg-gray-50"
                    }`}
                  >
                    <span className={`text-sm font-bold ${active ? "text-brand-700" : "text-gray-800"}`}>
                      {p.label}
                    </span>
                    <span className={`text-xs ${active ? "text-brand-500" : "text-gray-500"}`}>
                      {p.tagline}
                    </span>
                    <div className="flex flex-wrap gap-1">
                      {p.badges.map((b) => (
                        <span
                          key={b}
                          className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${
                            active ? "bg-brand-100 text-brand-600" : "bg-gray-100 text-gray-500"
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
            <div className="border-t border-gray-100 pt-4 space-y-4">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Ajuste fino</p>
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
                        : "border-gray-200 hover:border-gray-300 hover:bg-gray-50"
                    }`}
                  >
                    <span className={`text-sm font-bold ${active ? "text-brand-700" : "text-gray-800"}`}>
                      {opt.label}
                    </span>
                    <span className={`text-xs ${active ? "text-brand-500" : "text-gray-400"}`}>
                      {opt.desc}
                    </span>
                    <div className={`mt-1 rounded-lg px-3 py-2 text-xs leading-relaxed ${
                      active ? "bg-brand-100 text-brand-700" : "bg-gray-100 text-gray-500"
                    }`}>
                      &ldquo;{opt.example}&rdquo;
                    </div>
                  </button>
                );
              })}
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-gray-500">
                Abertura personalizada{" "}
                <span className="font-normal normal-case text-gray-400">
                  (opcional — deixe em branco para usar o estilo acima)
                </span>
              </label>
              <textarea
                value={form.greetingTemplate ?? ""}
                onChange={(e) => patch("greetingTemplate", e.target.value || null)}
                rows={2}
                maxLength={300}
                placeholder="Ex: Olá! Bem-vindo ao Restaurante XYZ 🍕 Pronto para pedir?"
                className="w-full resize-none rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:border-brand-400 focus:bg-white focus:outline-none focus:ring-1 focus:ring-brand-400"
              />
              <p className="mt-1 text-[11px] text-gray-400">
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
                      : "border-gray-200 hover:border-gray-300"
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
                    <p className={`text-sm font-medium ${form.upsellStyle === opt.value ? "text-brand-700" : "text-gray-800"}`}>
                      {opt.label}
                    </p>
                    <p className="text-xs text-gray-500">{opt.desc}</p>
                  </div>
                </label>
              ))}
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
        <div className="space-y-6">

          <Section
            title="O que o Agente CRM faz"
            subtitle="Inteligência dedicada a relacionamento, retenção e reativação de clientes."
          >
            <div className="rounded-lg border border-brand-100 bg-brand-50 p-4 space-y-2">
              <p className="text-sm font-medium text-brand-800">Responsabilidades:</p>
              <ul className="space-y-1.5 text-sm text-brand-700">
                {[
                  "Identificar clientes inativos e acionar reativação",
                  "Segmentar clientes por temperatura (Ativo, Morno, Frio)",
                  "Sugerir mensagens personalizadas por segmento",
                  "Monitorar oportunidades de fidelização",
                  "Disparar alertas de VIPs em risco",
                ].map((item) => (
                  <li key={item} className="flex items-center gap-2">
                    <span className="text-brand-500 font-bold">✓</span>
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          </Section>

          <Section title="Segmentação por temperatura">
            <div className="space-y-2">
              {[
                { icon: "🟢", label: "Ativo",       desc: "Pedido nos últimos 30 dias — manter engajamento",       bg: "bg-green-50",  text: "text-green-700"  },
                { icon: "🟡", label: "Morno",       desc: "Sem pedido entre 31 e 60 dias — momento de reativação", bg: "bg-yellow-50", text: "text-yellow-700" },
                { icon: "🔴", label: "Frio",        desc: "Sem pedido há mais de 60 dias — oferta agressiva",      bg: "bg-red-50",    text: "text-red-700"    },
                { icon: "⬛", label: "Nunca pediu", desc: "Cadastrado mas sem pedido — ativar primeiro pedido",    bg: "bg-gray-50",   text: "text-gray-700"   },
              ].map((s) => (
                <div key={s.label} className={`flex items-start gap-3 rounded-lg border border-gray-100 ${s.bg} p-3`}>
                  <span className="text-lg leading-none mt-0.5">{s.icon}</span>
                  <div>
                    <p className={`text-sm font-semibold ${s.text}`}>{s.label}</p>
                    <p className="text-xs text-gray-500">{s.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </Section>

          <ComingSoon
            title="Configurações do Agente CRM"
            items={[
              "Reativação automática — gatilhos e mensagens por segmento",
              "Pós-venda — mensagens automáticas após o pedido",
              "Pedido de avaliação — timing e canal de envio",
              "Clientes VIP — critérios e tratamento especial",
              "Frequência máxima de contato por período",
              "Aprovação humana antes de envio",
              "Canais permitidos — WhatsApp, e-mail, SMS",
              "Campanhas automáticas por temperatura",
            ]}
          />
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
