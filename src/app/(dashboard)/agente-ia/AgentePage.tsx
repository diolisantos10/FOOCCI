"use client";

/**
 * /agente-ia — AI Sales Agent configuration hub
 *
 * 4 tabs:
 *   1. Base da IA    — Personality, voice, greeting
 *   2. Atendimento   — WhatsApp agent identity & flows
 *   3. Cardápio      — Sales strategy & upsell behaviour
 *   4. CRM           — Data collection (informational)
 *
 * Saves to RestaurantBrandConfig via /api/brand-config.
 * WhatsApp agent tab will wire to /api/whatsapp-agent in a later step.
 */

import { useState, useEffect, type FormEvent } from "react";
import Link from "next/link";
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

// ── Types ─────────────────────────────────────────────────────────────────────

type TabId = "base" | "atendimento" | "cardapio" | "crm";

// ── Tab config ────────────────────────────────────────────────────────────────

const TABS: Array<{ id: TabId; label: string; icon: string }> = [
  { id: "base",        label: "Base da IA",  icon: "🧠" },
  { id: "atendimento", label: "Atendimento", icon: "💬" },
  { id: "cardapio",    label: "Cardápio",    icon: "🍽" },
  { id: "crm",         label: "CRM",         icon: "📊" },
];

// ── Option tables ─────────────────────────────────────────────────────────────

const PRESETS: Array<{
  value: PersonalityPreset;
  label: string;
  tagline: string;
  badges: string[];
}> = [
  { value: "traditional", label: "Tradicional", tagline: "Caloroso, acolhedor, de confiança",    badges: ["Caloroso", "Poucos emojis", "Upsell gentil"]  },
  { value: "young",       label: "Moderno",     tagline: "Casual, animado, próximo do cliente", badges: ["Casual", "Emojis", "Upsell moderado"]          },
  { value: "fast",        label: "Ágil",        tagline: "Direto, rápido, sem enrolação",       badges: ["Profissional", "Sem emojis", "Conciso"]        },
  { value: "premium",     label: "Premium",     tagline: "Refinado, elegante, sofisticado",     badges: ["Formal", "Sem emojis", "Detalhado"]            },
  { value: "aggressive",  label: "Vendas",      tagline: "Focado em conversão e upsell",        badges: ["Amigável", "Upsell proativo", "Revenue"]       },
];

const FORMALITY_OPTIONS = [
  { value: "informal" as const, label: "Informal",  desc: "Você, relaxado"    },
  { value: "mixed"    as const, label: "Adaptável", desc: "Segue o cliente"   },
  { value: "formal"   as const, label: "Formal",    desc: "Senhor(a), cortês" },
];

const EMOJI_OPTIONS = [
  { value: "none"       as const, label: "Nenhum",     desc: "Sem emojis"         },
  { value: "minimal"    as const, label: "Poucos",     desc: "Só momentos-chave"  },
  { value: "moderate"   as const, label: "Moderado",   desc: "Alguns por mensagem" },
  { value: "expressive" as const, label: "Expressivo", desc: "Bastante, animado"  },
];

const GREETING_OPTIONS = [
  { value: "warm"         as const, label: "Caloroso",     desc: "Acolhedor, faz o cliente se sentir bem-vindo", example: "Olá! Que bom ter você aqui 😊 O que vai ser hoje?"    },
  { value: "professional" as const, label: "Direto",       desc: "Objetivo e sem enrolação",                    example: "Olá! Pronto para pedir?"                              },
  { value: "casual"       as const, label: "Descontraído", desc: "Energético e próximo",                        example: "Ei! Bora pedir? 🚀 O que vai ser?"                   },
] as const;

const INTENSITY_OPTIONS: Array<{ value: UpsellIntensity; label: string; desc: string }> = [
  { value: "low",    label: "Baixa",  desc: "Uma sugestão gentil"    },
  { value: "medium", label: "Média",  desc: "Sugere quando oportuno" },
  { value: "high",   label: "Alta",   desc: "Sugere frequentemente"  },
];

const FOCUS_OPTIONS: Array<{ value: SalesFocus; label: string; desc: string }> = [
  { value: "balanced", label: "Equilibrado", desc: "Boa experiência e boa receita" },
  { value: "ticket",   label: "Receita",     desc: "Prioriza itens de maior valor" },
  { value: "volume",   label: "Volume",      desc: "Foco em agilidade e quantidade" },
];

const PRIORITY_OPTIONS: Array<{ value: SalesPriority; label: string; desc: string }> = [
  { value: "bestsellers", label: "Mais vendidos",    desc: "Sugere os campeões de venda" },
  { value: "high_margin", label: "Maior margem",     desc: "Favorece itens rentáveis"    },
  { value: "promotions",  label: "Promoções ativas", desc: "Destaca os itens em oferta"  },
];

const UPSELL_STYLE_OPTIONS = [
  { value: "none"      as const, label: "Desativado", desc: "Agente não sugere extras"                      },
  { value: "gentle"    as const, label: "Leve",       desc: "Uma sugestão discreta na hora certa"           },
  { value: "moderate"  as const, label: "Moderado",   desc: "Sugere bebida, sobremesa e complementos"      },
  { value: "proactive" as const, label: "Proativo",   desc: "Incentiva ativamente em cada oportunidade"    },
] as const;

// Atendimento tab — static option tables (no API wiring yet)
const TONE_OPTIONS = [
  { value: "informal", label: "Informal", desc: "Você, sabe? Tranquilo"  },
  { value: "neutral",  label: "Neutro",   desc: "Equilibrado e claro"    },
  { value: "premium",  label: "Premium",  desc: "Sofisticado e cortês"   },
];
const STYLE_OPTIONS = [
  { value: "direct",       label: "Direto",      desc: "Respostas curtas e rápidas"    },
  { value: "consultive",   label: "Consultivo",  desc: "Explica e orienta o cliente"   },
  { value: "sales_driven", label: "Vendas",      desc: "Sugere, engaja, converte"      },
];

// ── Shared primitives ─────────────────────────────────────────────────────────

function Section({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
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
  label: string;
  options: Array<{ value: T; label: string; desc: string }>;
  value: T;
  onChange: (v: T) => void;
  cols?: 2 | 3 | 4;
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
  label: string;
  options: { value: string; label: string; desc: string }[];
  value: string;
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
      <p className="text-xs text-gray-400">
        Aplicado em novas conversas imediatamente.
      </p>
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

// ── Main component ────────────────────────────────────────────────────────────

export function AgentePage() {
  const [activeTab, setActiveTab] = useState<TabId>("base");

  // ── Brand config state (tabs: Base da IA + Cardápio) ──────────────────────
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
      .catch(() => {/* keep defaults */})
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

  // ── Atendimento local state (no API wiring yet) ───────────────────────────
  const [agentName, setAgentName]           = useState("Agente");
  const [agentTone, setAgentTone]           = useState("informal");
  const [agentStyle, setAgentStyle]         = useState("sales_driven");
  const [welcomeMsg, setWelcomeMsg]         = useState("Olá! Bem-vindo! 😊 O que você deseja?");
  const [orderPreMsg, setOrderPreMsg]       = useState("Ótimo! Aqui está nosso cardápio 👇");
  const [menuUrl, setMenuUrl]               = useState("");
  const [handoffPhone, setHandoffPhone]     = useState("");
  const [handoffMessage, setHandoffMessage] = useState("Vou te conectar com um atendente. Um momento! 👋");

  // ── Loading ───────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="flex h-48 items-center justify-center">
        <p className="text-sm text-gray-400">Carregando configuração…</p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl p-6">

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="mb-6">
        <h1 className="text-xl font-bold text-gray-900">Agente IA</h1>
        <p className="mt-1 text-sm text-gray-500">
          Configure como o agente de vendas IA se comporta com os seus clientes.
        </p>
      </div>

      {/* ── Tab bar ────────────────────────────────────────────────────────── */}
      <div className="flex gap-1 border-b border-gray-200 mb-6">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={(e) => { e.stopPropagation(); setActiveTab(tab.id); }}
            className={`flex items-center gap-1.5 border-b-2 px-3 pb-3 pt-1 text-sm font-medium transition-colors ${
              activeTab === tab.id
                ? "border-brand-500 text-brand-600"
                : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
            }`}
          >
            <span className="text-base leading-none">{tab.icon}</span>
            {tab.label}
          </button>
        ))}
      </div>

      {/* ══════════════════════════════════════════════════════════════════════
          TAB 1 — Base da IA
      ══════════════════════════════════════════════════════════════════════ */}
      {activeTab === "base" && (
        <form onSubmit={handleSave} className="space-y-6">

          {/* Feedback */}
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

          {/* Personalidade */}
          <Section
            title="Personalidade"
            subtitle="Escolha um perfil base. As configurações abaixo ajustam-se automaticamente, mas você pode personalizar."
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

            {/* Fine-tune */}
            <div className="border-t border-gray-100 pt-4 space-y-4">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
                Ajuste fino
              </p>
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

          {/* Saudação */}
          <Section
            title="Saudação"
            subtitle="Define o estilo de abertura — não uma frase fixa, mas como o agente abre cada conversa."
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

          <SaveRow saving={saving} label="Salvar Base da IA" />
        </form>
      )}

      {/* ══════════════════════════════════════════════════════════════════════
          TAB 2 — Atendimento
      ══════════════════════════════════════════════════════════════════════ */}
      {activeTab === "atendimento" && (
        <div className="space-y-6">

          {/* Coming-soon notice */}
          <div className="flex items-start gap-3 rounded-xl border border-blue-100 bg-blue-50 px-4 py-3 text-sm text-blue-700">
            <span className="mt-0.5 text-base leading-none">ℹ️</span>
            <p>
              A configuração do agente WhatsApp será integrada aqui em breve.
              Por enquanto, acesse{" "}
              <Link
                href="/settings/agent"
                className="font-semibold underline hover:text-blue-800"
              >
                Configurações → Agente WhatsApp
              </Link>
              .
            </p>
          </div>

          {/* Personalidade */}
          <Section title="Personalidade do agente WhatsApp" subtitle="Como o agente se apresenta no WhatsApp.">
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">
                Nome do agente
              </label>
              <input
                type="text"
                value={agentName}
                onChange={(e) => setAgentName(e.target.value)}
                maxLength={50}
                placeholder="Ex: Ju, Max, Agente Foocci"
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
              />
              <p className="mt-1 text-xs text-gray-400">
                Nome que o agente usa para se apresentar.
              </p>
            </div>
            <RadioRow
              label="Tom de voz"
              options={TONE_OPTIONS}
              value={agentTone}
              onChange={setAgentTone}
            />
            <RadioRow
              label="Estilo de atendimento"
              options={STYLE_OPTIONS}
              value={agentStyle}
              onChange={setAgentStyle}
            />
          </Section>

          {/* Mensagem de boas-vindas */}
          <Section title="Mensagem de boas-vindas">
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">
                Mensagem inicial
              </label>
              <textarea
                value={welcomeMsg}
                onChange={(e) => setWelcomeMsg(e.target.value)}
                rows={4}
                maxLength={1000}
                placeholder="Ex: Olá! Bem-vindo ao restaurante 🍣 O que você deseja?"
                className="w-full resize-none rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
              />
            </div>
            {/* Live preview bubble */}
            <div className="rounded-xl bg-[#dcf8c6] px-4 py-3 text-sm text-gray-800 shadow-inner max-w-xs">
              <p className="text-[11px] font-semibold text-gray-500 mb-1">Pré-visualização</p>
              <p className="whitespace-pre-wrap leading-relaxed">{welcomeMsg || "…"}</p>
            </div>
          </Section>

          {/* Fluxo: Fazer pedido */}
          <Section title='Fluxo — "Fazer pedido"'>
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">
                Mensagem ao iniciar pedido
              </label>
              <textarea
                value={orderPreMsg}
                onChange={(e) => setOrderPreMsg(e.target.value)}
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
                value={menuUrl}
                onChange={(e) => setMenuUrl(e.target.value)}
                placeholder="https://seudominio.com/qr/slug"
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
              />
            </div>
          </Section>

          {/* Fluxo: Transferência */}
          <Section title='Fluxo — "Falar com atendente"'>
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">
                Telefone do atendente{" "}
                <span className="font-normal text-gray-400">(WhatsApp, com DDI)</span>
              </label>
              <input
                type="tel"
                value={handoffPhone}
                onChange={(e) => setHandoffPhone(e.target.value)}
                maxLength={30}
                placeholder="5511999999999"
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">
                Mensagem de transferência
              </label>
              <textarea
                value={handoffMessage}
                onChange={(e) => setHandoffMessage(e.target.value)}
                rows={2}
                maxLength={500}
                placeholder="Ex: Vou te conectar com um atendente. Um momento! 👋"
                className="w-full resize-none rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
              />
            </div>
          </Section>

          {/* Placeholder save */}
          <div className="flex justify-end pb-4">
            <button
              type="button"
              disabled
              className="rounded-lg bg-gray-300 px-6 py-2.5 text-sm font-semibold text-gray-500 cursor-not-allowed"
              title="Integração em breve"
            >
              Salvar Atendimento
            </button>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════════
          TAB 3 — Cardápio
      ══════════════════════════════════════════════════════════════════════ */}
      {activeTab === "cardapio" && (
        <form onSubmit={handleSave} className="space-y-6">

          {/* Feedback */}
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

          {/* Estratégia de vendas */}
          <Section
            title="Estratégia de vendas"
            subtitle="Como o agente deve se comportar para aumentar o ticket e as conversões."
          >
            <ChipGroup
              label="Intensidade do upsell"
              options={INTENSITY_OPTIONS}
              value={form.upsellIntensity}
              onChange={applyIntensity}
            />
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

          {/* Sugestões proativas */}
          <Section
            title="Sugestões proativas"
            subtitle="Com que frequência o agente propõe itens extras durante a conversa."
          >
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

          <SaveRow saving={saving} label="Salvar Cardápio" />
        </form>
      )}

      {/* ══════════════════════════════════════════════════════════════════════
          TAB 4 — CRM
      ══════════════════════════════════════════════════════════════════════ */}
      {activeTab === "crm" && (
        <div className="space-y-6">

          {/* Dados coletados */}
          <Section title="Dados coletados pelo agente" subtitle="O agente registra automaticamente cada interação.">
            <div className="rounded-lg border border-blue-100 bg-blue-50 p-4 space-y-2">
              <p className="text-sm font-medium text-blue-800">
                O agente coleta automaticamente:
              </p>
              <ul className="space-y-1.5 text-sm text-blue-700">
                {[
                  "Nome do cliente",
                  "Número de telefone",
                  "Última interação",
                  "Histórico de pedidos",
                  "Preferências alimentares (quando informadas)",
                ].map((item) => (
                  <li key={item} className="flex items-center gap-2">
                    <span className="text-green-500 font-bold">✓</span>
                    {item}
                  </li>
                ))}
              </ul>
              <p className="text-xs text-blue-500 pt-1">
                Dados disponíveis em{" "}
                <Link href="/customers" className="underline font-medium hover:text-blue-700">
                  Clientes
                </Link>{" "}
                e no motor de receita em{" "}
                <Link href="/crm" className="underline font-medium hover:text-blue-700">
                  CRM
                </Link>
                .
              </p>
            </div>
          </Section>

          {/* Segmentação */}
          <Section
            title="Segmentação automática"
            subtitle="O CRM agrupa clientes com base no comportamento de compra."
          >
            <div className="space-y-2">
              {[
                { icon: "👑", label: "VIP",         desc: "Alto valor de compra e alta frequência"    },
                { icon: "💤", label: "Inativos",     desc: "Sem pedidos nos últimos 30 dias"           },
                { icon: "🌟", label: "Novos",        desc: "Primeiro pedido nos últimos 7 dias"        },
                { icon: "🔁", label: "Recorrentes",  desc: "Mais de 2 pedidos no histórico"            },
              ].map((s) => (
                <div
                  key={s.label}
                  className="flex items-start gap-3 rounded-lg border border-gray-100 bg-gray-50 p-3"
                >
                  <span className="text-lg leading-none mt-0.5">{s.icon}</span>
                  <div>
                    <p className="text-sm font-semibold text-gray-800">{s.label}</p>
                    <p className="text-xs text-gray-500">{s.desc}</p>
                  </div>
                </div>
              ))}
            </div>
            <p className="text-xs text-gray-400">
              Configure automações de reativação e aniversário em{" "}
              <Link href="/crm" className="text-brand-600 underline hover:text-brand-700">
                CRM → Automações
              </Link>
              .
            </p>
          </Section>

          {/* Em breve */}
          <section className="rounded-xl border border-dashed border-gray-200 bg-gray-50 p-5">
            <p className="text-xs font-semibold uppercase tracking-widest text-gray-400 mb-2">
              Em breve
            </p>
            <p className="text-sm font-medium text-gray-700">
              Comportamentos automáticos de CRM
            </p>
            <p className="mt-1 text-xs text-gray-400">
              Reativação de inativos, mensagem de aniversário e follow-up pós-pedido
              diretamente configuráveis aqui.
            </p>
          </section>

        </div>
      )}

    </div>
  );
}
