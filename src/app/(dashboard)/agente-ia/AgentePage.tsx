"use client";

/**
 * /agente-ia — AI Sales Agent configuration
 *
 * Centralized page for configuring the restaurant's AI ordering agent.
 * Persists to RestaurantBrandConfig via existing /api/brand-config endpoint.
 * All field types come from @/validators/brand-config — no new DB fields needed.
 */

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

// ── Option tables ─────────────────────────────────────────────────────────────

const PRESETS: Array<{
  value: PersonalityPreset;
  label: string;
  tagline: string;
  badges: string[];
}> = [
  {
    value:   "traditional",
    label:   "Tradicional",
    tagline: "Caloroso, acolhedor, de confiança",
    badges:  ["Caloroso", "Poucos emojis", "Upsell gentil"],
  },
  {
    value:   "young",
    label:   "Moderno",
    tagline: "Casual, animado, próximo do cliente",
    badges:  ["Casual", "Emojis", "Upsell moderado"],
  },
  {
    value:   "fast",
    label:   "Ágil",
    tagline: "Direto, rápido, sem enrolação",
    badges:  ["Profissional", "Sem emojis", "Conciso"],
  },
  {
    value:   "premium",
    label:   "Premium",
    tagline: "Refinado, elegante, sofisticado",
    badges:  ["Formal", "Sem emojis", "Detalhado"],
  },
  {
    value:   "aggressive",
    label:   "Vendas",
    tagline: "Focado em conversão e upsell",
    badges:  ["Amigável", "Upsell proativo", "Revenue"],
  },
];

const FORMALITY_OPTIONS = [
  { value: "informal" as const, label: "Informal",   desc: "Você, relaxado" },
  { value: "mixed"    as const, label: "Adaptável",  desc: "Segue o cliente" },
  { value: "formal"   as const, label: "Formal",     desc: "Senhor(a), cortês" },
];

const EMOJI_OPTIONS = [
  { value: "none"       as const, label: "Nenhum",     desc: "Sem emojis" },
  { value: "minimal"    as const, label: "Poucos",     desc: "Só momentos-chave" },
  { value: "moderate"   as const, label: "Moderado",   desc: "Alguns por mensagem" },
  { value: "expressive" as const, label: "Expressivo", desc: "Bastante, animado" },
];

const INTENSITY_OPTIONS: Array<{ value: UpsellIntensity; label: string; desc: string }> = [
  { value: "low",    label: "Baixa",  desc: "Uma sugestão gentil" },
  { value: "medium", label: "Média",  desc: "Sugere quando oportuno" },
  { value: "high",   label: "Alta",   desc: "Sugere frequentemente" },
];

const FOCUS_OPTIONS: Array<{ value: SalesFocus; label: string; desc: string }> = [
  { value: "balanced", label: "Equilibrado", desc: "Boa experiência e boa receita" },
  { value: "ticket",   label: "Receita",     desc: "Prioriza itens de maior valor" },
  { value: "volume",   label: "Volume",      desc: "Foco em agilidade e quantidade" },
];

const PRIORITY_OPTIONS: Array<{ value: SalesPriority; label: string; desc: string }> = [
  { value: "bestsellers",  label: "Mais vendidos",   desc: "Sugere os campeões de venda" },
  { value: "high_margin",  label: "Maior margem",    desc: "Favorece itens rentáveis" },
  { value: "promotions",   label: "Promoções ativas", desc: "Destaca os itens em oferta" },
];

const GREETING_OPTIONS = [
  {
    value:   "warm",
    label:   "Caloroso",
    example: "Olá! Que bom ter você aqui 😊 O que vai ser hoje?",
    desc:    "Acolhedor, faz o cliente se sentir bem-vindo",
  },
  {
    value:   "professional",
    label:   "Direto",
    example: "Olá! Pronto para pedir?",
    desc:    "Objetivo e sem enrolação",
  },
  {
    value:   "casual",
    label:   "Descontraído",
    example: "Ei! Bora pedir? 🚀 O que vai ser?",
    desc:    "Energético e próximo",
  },
] as const;

// ── Profile summary ───────────────────────────────────────────────────────────

function buildProfile(form: UpsertBrandConfigInput): string {
  const preset: Record<PersonalityPreset, string> = {
    traditional: "Tradicional",
    young:       "Moderno",
    fast:        "Ágil",
    premium:     "Premium",
    aggressive:  "Focado em vendas",
  };
  const intensity: Record<UpsellIntensity, string> = {
    low:    "upsell baixo",
    medium: "upsell médio",
    high:   "upsell alto",
  };
  const focus: Record<SalesFocus, string> = {
    balanced: "foco equilibrado",
    ticket:   "foco em receita",
    volume:   "foco em volume",
  };
  const priority: Record<SalesPriority, string> = {
    bestsellers: "prioriza mais vendidos",
    high_margin: "prioriza alta margem",
    promotions:  "prioriza promoções",
  };
  const emoji: Record<string, string> = {
    none:       "sem emojis",
    minimal:    "poucos emojis",
    moderate:   "emojis moderados",
    expressive: "emojis expressivos",
  };

  return [
    preset[form.personalityPreset],
    emoji[form.emojiUsage] ?? "emojis moderados",
    intensity[form.upsellIntensity],
    focus[form.salesFocus],
    priority[form.salesPriority],
  ].join(" · ");
}

// ── Sub-components ────────────────────────────────────────────────────────────

function Section({ title, subtitle, children }: {
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
  const colClass = cols === 4 ? "sm:grid-cols-4" : cols === 3 ? "sm:grid-cols-3" : "sm:grid-cols-2";
  return (
    <div>
      <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-gray-500">{label}</p>
      <div className={`grid grid-cols-2 gap-2 ${colClass}`}>
        {options.map((opt) => (
          <button
            key={opt.value}
            type="button"
            onClick={() => onChange(opt.value)}
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

// ── Main component ────────────────────────────────────────────────────────────

export function AgentePage() {
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

  function patch<K extends keyof UpsertBrandConfigInput>(key: K, value: UpsertBrandConfigInput[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  /** Selecting a preset fills all voice fields automatically, but the user can still override them. */
  function applyPreset(preset: PersonalityPreset) {
    const voice = PERSONALITY_VOICE_MAP[preset];
    setForm((prev) => ({ ...prev, personalityPreset: preset, ...voice }));
  }

  /** Selecting upsell intensity also keeps upsellStyle in sync. */
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

  if (loading) {
    return (
      <div className="flex h-48 items-center justify-center">
        <p className="text-sm text-gray-400">Carregando configuração…</p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSave} className="mx-auto max-w-2xl space-y-6 p-6">

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div>
        <h1 className="text-xl font-bold text-gray-900">Agente IA</h1>
        <p className="mt-1 text-sm text-gray-500">
          Configure como o seu agente de vendas se comporta com os clientes.
        </p>
      </div>

      {/* ── Feedback ───────────────────────────────────────────────────────── */}
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

      {/* ── 1. Visão geral ─────────────────────────────────────────────────── */}
      <div className="rounded-xl border border-brand-100 bg-brand-50 px-5 py-4">
        <div className="flex items-start gap-4">
          <span className="text-3xl leading-none mt-0.5">🤖</span>
          <div>
            <p className="text-sm font-semibold text-brand-800">
              Agente de vendas IA do seu restaurante
            </p>
            <p className="mt-1 text-xs text-brand-600 leading-relaxed">
              Este agente atende clientes, sugere pratos, faz upsell e conduz o pedido do início ao fim.
              Configure abaixo como ele deve se comportar — tom, energia, estratégia de venda e estilo de abertura.
            </p>
          </div>
        </div>
      </div>

      {/* ── 2. Personalidade ───────────────────────────────────────────────── */}
      <Section
        title="Personalidade"
        subtitle="Escolha um perfil base. As configurações abaixo são ajustadas automaticamente, mas você pode personalizar."
      >
        {/* Preset grid */}
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {PRESETS.map((p) => {
            const active = form.personalityPreset === p.value;
            return (
              <button
                key={p.value}
                type="button"
                onClick={() => applyPreset(p.value)}
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
                        active
                          ? "bg-brand-100 text-brand-600"
                          : "bg-gray-100 text-gray-500"
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

      {/* ── 3. Estratégia de vendas ─────────────────────────────────────────── */}
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

      {/* ── 4. Comportamento do agente ─────────────────────────────────────── */}
      <Section
        title="Comportamento"
        subtitle="Como o agente age ao longo da conversa."
      >
        {/* Proactive suggestions */}
        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-gray-500">
            Sugestões proativas
          </p>
          <div className="space-y-2">
            {(
              [
                { value: "none"     as const, label: "Desativado",  desc: "Agente não sugere extras ativamente" },
                { value: "gentle"   as const, label: "Leve",        desc: "Uma sugestão discreta na hora certa" },
                { value: "moderate" as const, label: "Moderado",    desc: "Sugere bebida, sobremesa e complementos" },
                { value: "proactive"as const, label: "Proativo",    desc: "Incentiva ativamente em cada oportunidade" },
              ] as const
            ).map((opt) => (
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
        </div>
      </Section>

      {/* ── 5. Estilo de abertura ───────────────────────────────────────────── */}
      <Section
        title="Saudação"
        subtitle="Define o estilo da abertura — não uma frase fixa repetida, mas como o agente abre cada conversa."
      >
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          {GREETING_OPTIONS.map((opt) => {
            const active = form.tone === opt.value;
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => patch("tone", opt.value)}
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

        {/* Optional custom override */}
        <div>
          <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-gray-500">
            Abertura personalizada{" "}
            <span className="font-normal normal-case text-gray-400">(opcional — deixe em branco para usar o estilo acima)</span>
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
            Quando preenchido, substitui o estilo selecionado acima. Mantenha natural — não é uma mensagem de bot.
          </p>
        </div>
      </Section>

      {/* ── 6. Resumo do perfil ─────────────────────────────────────────────── */}
      <section className="rounded-xl border border-gray-200 bg-gray-50 px-5 py-4">
        <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-gray-400">
          Perfil atual do agente
        </p>
        <p className="text-sm font-medium text-gray-800">{buildProfile(form)}</p>
        <p className="mt-2 text-xs text-gray-400">
          Resumo gerado automaticamente com base nas configurações acima.
        </p>
      </section>

      {/* ── Save ────────────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-end gap-3 pb-4">
        <p className="text-xs text-gray-400">
          As configurações são aplicadas imediatamente em novas conversas.
        </p>
        <button
          type="submit"
          disabled={saving}
          className="rounded-lg bg-brand-600 px-6 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-brand-700 disabled:opacity-50 transition-colors"
        >
          {saving ? "Salvando…" : "Salvar configuração"}
        </button>
      </div>
    </form>
  );
}
