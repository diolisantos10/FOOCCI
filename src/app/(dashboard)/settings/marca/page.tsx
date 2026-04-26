"use client";

import { useState, useEffect, type FormEvent } from "react";
import Link from "next/link";
import {
  apiFetch,
  Feedback,
  SaveButton,
  PageCard,
  SectionHeading,
  Toggle,
  Field,
  INPUT,
} from "../_shared";

// ── Option sets ─────────────────────────────────────────────────────────────

const CUISINE_OPTIONS = [
  { value: "pizza",      label: "Pizzaria",     emoji: "🍕" },
  { value: "sushi",      label: "Japonês",      emoji: "🍱" },
  { value: "burger",     label: "Hamburguer",   emoji: "🍔" },
  { value: "italiano",   label: "Italiano",     emoji: "🍝" },
  { value: "brasileiro", label: "Brasileiro",   emoji: "🇧🇷" },
  { value: "saudável",   label: "Saudável",     emoji: "🥗" },
  { value: "café",       label: "Café",         emoji: "☕" },
  { value: "sobremesa",  label: "Sobremesas",   emoji: "🍰" },
  { value: "mexicano",   label: "Mexicano",     emoji: "🌮" },
  { value: "asiático",   label: "Asiático",     emoji: "🥢" },
];

const PRICE_OPTIONS = [
  { value: "budget",    label: "Econômico",  desc: "Foco em preço acessível" },
  { value: "mid-range", label: "Médio",      desc: "Equilíbrio preço/qualidade" },
  { value: "premium",   label: "Premium",    desc: "Qualidade acima da média" },
  { value: "luxury",    label: "Luxo",       desc: "Exclusividade e sofisticação" },
];

const OBJECTIVE_OPTIONS = [
  { value: "velocidade",  label: "Velocidade",  desc: "Atendimento rápido" },
  { value: "experiência", label: "Experiência", desc: "Momento memorável" },
  { value: "ticket_alto", label: "Ticket alto", desc: "Maximizar valor por pedido" },
  { value: "volume",      label: "Volume",      desc: "Alto giro de pedidos" },
];

const VOICE_TONE_OPTIONS = [
  { value: "formal",    label: "Formal",    desc: "Profissional e respeitoso" },
  { value: "casual",    label: "Casual",    desc: "Próximo e descontraído" },
  { value: "divertido", label: "Divertido", desc: "Animado, usa humor leve" },
  { value: "premium",   label: "Premium",   desc: "Sofisticado e exclusivo" },
  { value: "direto",    label: "Direto",    desc: "Objetivo, sem rodeios" },
];

const PERSONALITY_SUGGESTIONS = [
  "Amigável", "Sofisticado", "Engraçado", "Vendedor",
  "Minimalista", "Técnico", "Acolhedor", "Animado",
  "Criativo", "Confiável", "Tradicional", "Inovador",
];

const UPSELL_OPTIONS = [
  { value: "none",      label: "Discreto",  desc: "Sem sugestões extras" },
  { value: "gentle",    label: "Gentil",    desc: "Sugere uma vez" },
  { value: "moderate",  label: "Moderado",  desc: "Sugere quando adequado" },
  { value: "proactive", label: "Agressivo", desc: "Sempre faz upsell" },
];

const EMOJI_OPTIONS = [
  { value: "none",       label: "Nenhum" },
  { value: "minimal",    label: "Pouco" },
  { value: "moderate",   label: "Médio" },
  { value: "expressive", label: "Muito" },
];

const COMM_STYLE_OPTIONS = [
  { value: "concise",        label: "Curtas",    desc: "Direto ao ponto" },
  { value: "conversational", label: "Naturais",  desc: "Tom de conversa" },
  { value: "detailed",       label: "Detalhadas",desc: "Explica os itens" },
];

// ── Form state ───────────────────────────────────────────────────────────────

interface MarcaForm {
  brandName: string;
  shortDescription: string;
  brandStory: string;
  targetAudience: string;
  restaurantType: string;
  pricePositioning: string;
  businessObjective: string;
  voiceTonePreset: string;
  personalityTraits: string[];
  upsellStyle: string;
  comboFocus: boolean;
  avgTicketFocus: boolean;
  emojiUsage: string;
  communicationStyle: string;
  canInsistAfterRefusal: boolean;
  useClientName: boolean;
  mainDishes: string;
  differentials: string;
  mostProfitableProducts: string;
  cuisineType: string;
}

const FORM_DEFAULTS: MarcaForm = {
  brandName: "",
  shortDescription: "",
  brandStory: "",
  targetAudience: "",
  restaurantType: "",
  pricePositioning: "",
  businessObjective: "",
  voiceTonePreset: "",
  personalityTraits: [],
  upsellStyle: "gentle",
  comboFocus: false,
  avgTicketFocus: false,
  emojiUsage: "moderate",
  communicationStyle: "conversational",
  canInsistAfterRefusal: true,
  useClientName: true,
  mainDishes: "",
  differentials: "",
  mostProfitableProducts: "",
  cuisineType: "",
};

// Fields managed by other settings pages — passed through unchanged on save
interface PassthroughConfig {
  tone: string;
  formality: string;
  greetingTemplate: string | null;
  systemPromptOverride: string | null;
  aiModel: string;
  maxHistoryMessages: number;
  personalityPreset: string;
  upsellIntensity: string;
  salesFocus: string;
  salesPriority: string;
  brandPrimaryColor: string | null;
  brandSecondaryColor: string | null;
  instagramUrl: string | null;
  tiktokUrl: string | null;
}

const PASSTHROUGH_DEFAULTS: PassthroughConfig = {
  tone: "friendly",
  formality: "informal",
  greetingTemplate: null,
  systemPromptOverride: null,
  aiModel: "gpt-4o-mini",
  maxHistoryMessages: 20,
  personalityPreset: "traditional",
  upsellIntensity: "medium",
  salesFocus: "balanced",
  salesPriority: "bestsellers",
  brandPrimaryColor: null,
  brandSecondaryColor: null,
  instagramUrl: null,
  tiktokUrl: null,
};

// ── Sub-components ───────────────────────────────────────────────────────────

function Chips({
  options,
  value,
  onChange,
  allowDeselect = true,
}: {
  options: { value: string; label: string; desc?: string; emoji?: string }[];
  value: string;
  onChange: (v: string) => void;
  allowDeselect?: boolean;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((opt) => {
        const active = value === opt.value;
        return (
          <button
            key={opt.value}
            type="button"
            title={opt.desc}
            onClick={() => onChange(allowDeselect && active ? "" : opt.value)}
            className={`rounded-full border px-3.5 py-1.5 text-sm font-medium transition-all ${
              active
                ? "border-indigo-500 bg-indigo-600 text-white shadow-sm"
                : "border-gray-200 bg-white text-gray-700 hover:border-gray-300 hover:bg-gray-50"
            }`}
          >
            {opt.emoji && <span className="mr-1.5">{opt.emoji}</span>}
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

function MultiChips({
  suggestions,
  value,
  onChange,
  max = 8,
}: {
  suggestions: string[];
  value: string[];
  onChange: (v: string[]) => void;
  max?: number;
}) {
  const [custom, setCustom] = useState("");

  function toggle(trait: string) {
    if (value.includes(trait)) {
      onChange(value.filter((t) => t !== trait));
    } else if (value.length < max) {
      onChange([...value, trait]);
    }
  }

  function addCustom() {
    const trimmed = custom.trim();
    if (trimmed && !value.includes(trimmed) && value.length < max) {
      onChange([...value, trimmed]);
      setCustom("");
    }
  }

  const customSelected = value.filter((t) => !suggestions.includes(t));

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        {suggestions.map((trait) => {
          const active = value.includes(trait);
          return (
            <button
              key={trait}
              type="button"
              onClick={() => toggle(trait)}
              className={`rounded-full border px-3 py-1.5 text-sm font-medium transition-all ${
                active
                  ? "border-indigo-500 bg-indigo-600 text-white"
                  : "border-gray-200 bg-white text-gray-600 hover:border-gray-300 hover:bg-gray-50"
              }`}
            >
              {trait}
            </button>
          );
        })}
      </div>

      {customSelected.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {customSelected.map((t) => (
            <span
              key={t}
              className="flex items-center gap-1 rounded-full border border-indigo-200 bg-indigo-50 px-3 py-1.5 text-sm text-indigo-700"
            >
              {t}
              <button
                type="button"
                onClick={() => onChange(value.filter((x) => x !== t))}
                className="ml-0.5 text-indigo-400 hover:text-indigo-700"
              >
                ×
              </button>
            </span>
          ))}
        </div>
      )}

      {value.length < max && (
        <div className="flex gap-2">
          <input
            type="text"
            value={custom}
            onChange={(e) => setCustom(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                addCustom();
              }
            }}
            placeholder="Adicionar traço personalizado…"
            maxLength={30}
            className="rounded-xl border border-gray-200 px-3 py-1.5 text-sm focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-100 transition"
          />
          <button
            type="button"
            onClick={addCustom}
            disabled={!custom.trim()}
            className="rounded-xl border border-gray-200 px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-50 disabled:opacity-40 transition"
          >
            +
          </button>
        </div>
      )}

      {value.length > 0 && (
        <p className="text-xs text-gray-400">
          {value.length}/{max} traços selecionados
        </p>
      )}
    </div>
  );
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default function MarcaPage() {
  const [form, setForm] = useState<MarcaForm>(FORM_DEFAULTS);
  const [passthrough, setPassthrough] = useState<PassthroughConfig>(PASSTHROUGH_DEFAULTS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiFetch("/api/brand-config").then(({ ok, data }) => {
      if (ok && data) {
        const p = (data.brandPersona ?? {}) as Record<string, unknown>;
        setForm({
          brandName:             String(p.brandName ?? ""),
          shortDescription:      String(p.shortDescription ?? ""),
          brandStory:            String(p.brandStory ?? ""),
          targetAudience:        String(p.targetAudience ?? ""),
          restaurantType:        String(p.restaurantType ?? ""),
          pricePositioning:      String(p.pricePositioning ?? ""),
          businessObjective:     String(p.businessObjective ?? ""),
          voiceTonePreset:       String(p.voiceTonePreset ?? ""),
          personalityTraits:     Array.isArray(p.personalityTraits)
            ? (p.personalityTraits as string[])
            : [],
          upsellStyle:           data.upsellStyle ?? "gentle",
          comboFocus:            Boolean(p.comboFocus),
          avgTicketFocus:        Boolean(p.avgTicketFocus),
          emojiUsage:            data.emojiUsage ?? "moderate",
          communicationStyle:    data.communicationStyle ?? "conversational",
          canInsistAfterRefusal: p.canInsistAfterRefusal !== false,
          useClientName:         p.useClientName !== false,
          mainDishes:            String(p.mainDishes ?? ""),
          differentials:         String(p.differentials ?? ""),
          mostProfitableProducts: String(p.mostProfitableProducts ?? ""),
          cuisineType:           String(p.cuisineType ?? ""),
        });
        setPassthrough({
          tone:                 data.tone ?? "friendly",
          formality:            data.formality ?? "informal",
          greetingTemplate:     data.greetingTemplate ?? null,
          systemPromptOverride: data.systemPromptOverride ?? null,
          aiModel:              data.aiModel ?? "gpt-4o-mini",
          maxHistoryMessages:   data.maxHistoryMessages ?? 20,
          personalityPreset:    data.personalityPreset ?? "traditional",
          upsellIntensity:      data.upsellIntensity ?? "medium",
          salesFocus:           data.salesFocus ?? "balanced",
          salesPriority:        data.salesPriority ?? "bestsellers",
          brandPrimaryColor:    data.brandPrimaryColor ?? null,
          brandSecondaryColor:  data.brandSecondaryColor ?? null,
          instagramUrl:         data.instagramUrl ?? null,
          tiktokUrl:            data.tiktokUrl ?? null,
        });
      }
    }).finally(() => setLoading(false));
  }, []);

  function set<K extends keyof MarcaForm>(key: K) {
    return (value: MarcaForm[K]) => setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setSuccess(null);
    setError(null);

    const brandPersona: Record<string, unknown> = {
      canInsistAfterRefusal: form.canInsistAfterRefusal,
      useClientName: form.useClientName,
    };
    if (form.brandName)              brandPersona.brandName = form.brandName;
    if (form.shortDescription)       brandPersona.shortDescription = form.shortDescription;
    if (form.brandStory)             brandPersona.brandStory = form.brandStory;
    if (form.targetAudience)         brandPersona.targetAudience = form.targetAudience;
    if (form.restaurantType)         brandPersona.restaurantType = form.restaurantType;
    if (form.pricePositioning)       brandPersona.pricePositioning = form.pricePositioning;
    if (form.businessObjective)      brandPersona.businessObjective = form.businessObjective;
    if (form.voiceTonePreset)        brandPersona.voiceTonePreset = form.voiceTonePreset;
    if (form.personalityTraits.length > 0) brandPersona.personalityTraits = form.personalityTraits;
    if (form.comboFocus)             brandPersona.comboFocus = true;
    if (form.avgTicketFocus)         brandPersona.avgTicketFocus = true;
    if (form.mainDishes)             brandPersona.mainDishes = form.mainDishes;
    if (form.differentials)          brandPersona.differentials = form.differentials;
    if (form.mostProfitableProducts) brandPersona.mostProfitableProducts = form.mostProfitableProducts;
    if (form.cuisineType)            brandPersona.cuisineType = form.cuisineType;

    const { ok, data } = await apiFetch("/api/brand-config", "PUT", {
      ...passthrough,
      upsellStyle:        form.upsellStyle,
      emojiUsage:         form.emojiUsage,
      communicationStyle: form.communicationStyle,
      brandPersona,
    });

    if (ok) {
      setSuccess("Persona da marca salva com sucesso.");
    } else {
      setError(data?.error ?? "Erro ao salvar.");
    }
    setSaving(false);
  }

  if (loading) return <p className="py-8 text-sm text-gray-400">Carregando…</p>;

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <Feedback success={success} error={error} onDismiss={() => setError(null)} />

      {/* ── 1. Identidade da Marca ────────────────────────────────── */}
      <PageCard>
        <SectionHeading
          title="🧠 Identidade da Marca"
          subtitle="Como sua marca se apresenta e quem ela quer alcançar."
        />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Nome da marca">
            <input
              type="text"
              value={form.brandName}
              onChange={(e) => set("brandName")(e.target.value)}
              placeholder="Ex: Foocci Burgers"
              maxLength={100}
              className={INPUT}
            />
          </Field>
          <Field label="Público principal" hint="Quem é seu cliente ideal?">
            <input
              type="text"
              value={form.targetAudience}
              onChange={(e) => set("targetAudience")(e.target.value)}
              placeholder="Ex: jovens adultos que valorizam qualidade"
              maxLength={200}
              className={INPUT}
            />
          </Field>
          <div className="sm:col-span-2">
            <Field label="Descrição curta">
              <input
                type="text"
                value={form.shortDescription}
                onChange={(e) => set("shortDescription")(e.target.value)}
                placeholder="Ex: Hamburguer artesanal com ingredientes premium"
                maxLength={200}
                className={INPUT}
              />
            </Field>
          </div>
          <div className="sm:col-span-2">
            <Field label="História da marca" hint="Opcional — humaniza a comunicação da IA.">
              <textarea
                value={form.brandStory}
                onChange={(e) => set("brandStory")(e.target.value)}
                rows={3}
                maxLength={1000}
                placeholder="Ex: Fundado em 2018 por dois apaixonados por gastronomia…"
                className={`${INPUT} resize-none`}
              />
            </Field>
          </div>
        </div>
      </PageCard>

      {/* ── 2. Posicionamento ─────────────────────────────────────── */}
      <PageCard>
        <SectionHeading
          title="🎯 Posicionamento"
          subtitle="Define como a IA posiciona seu restaurante nas conversas."
        />
        <div className="space-y-5">
          <Field label="Tipo de restaurante">
            <input
              type="text"
              value={form.restaurantType}
              onChange={(e) => set("restaurantType")(e.target.value)}
              placeholder="Ex: hamburguer artesanal, pizzaria napolitana"
              maxLength={100}
              className={INPUT}
            />
          </Field>
          <Field label="Nível de preço">
            <Chips
              options={PRICE_OPTIONS}
              value={form.pricePositioning}
              onChange={set("pricePositioning")}
            />
          </Field>
          <Field label="Objetivo principal">
            <Chips
              options={OBJECTIVE_OPTIONS}
              value={form.businessObjective}
              onChange={set("businessObjective")}
            />
          </Field>
        </div>
      </PageCard>

      {/* ── 3 & 4. Tom de Voz + Personalidade ────────────────────── */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <PageCard>
          <SectionHeading
            title="🗣️ Tom de Voz"
            subtitle="Como a IA fala com seus clientes."
          />
          <Field label="Preset de tom">
            <Chips
              options={VOICE_TONE_OPTIONS}
              value={form.voiceTonePreset}
              onChange={set("voiceTonePreset")}
            />
          </Field>
        </PageCard>

        <PageCard>
          <SectionHeading
            title="🧑‍🍳 Personalidade"
            subtitle="Traços que definem o caráter do assistente."
          />
          <MultiChips
            suggestions={PERSONALITY_SUGGESTIONS}
            value={form.personalityTraits}
            onChange={set("personalityTraits")}
          />
        </PageCard>
      </div>

      {/* ── 5 & 6. Vendas + Comunicação ───────────────────────────── */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <PageCard>
          <SectionHeading
            title="💰 Estilo de Venda"
            subtitle="Controla como a IA sugere itens e aumenta o ticket."
          />
          <div className="space-y-5">
            <Field label="Estratégia de upsell">
              <Chips
                options={UPSELL_OPTIONS}
                value={form.upsellStyle}
                onChange={set("upsellStyle")}
                allowDeselect={false}
              />
            </Field>
            <div className="space-y-3 pt-1">
              <Toggle
                label="Foco em combos"
                desc="IA prioriza sugestões de combos e promoções"
                checked={form.comboFocus}
                onChange={set("comboFocus")}
              />
              <Toggle
                label="Foco em ticket médio"
                desc="IA trabalha ativamente para aumentar o valor do pedido"
                checked={form.avgTicketFocus}
                onChange={set("avgTicketFocus")}
              />
            </div>
          </div>
        </PageCard>

        <PageCard>
          <SectionHeading
            title="🧾 Comunicação"
            subtitle="Regras de estilo e comportamento nas mensagens."
          />
          <div className="space-y-5">
            <Field label="Uso de emojis">
              <Chips
                options={EMOJI_OPTIONS}
                value={form.emojiUsage}
                onChange={set("emojiUsage")}
                allowDeselect={false}
              />
            </Field>
            <Field label="Tamanho das mensagens">
              <Chips
                options={COMM_STYLE_OPTIONS}
                value={form.communicationStyle}
                onChange={set("communicationStyle")}
                allowDeselect={false}
              />
            </Field>
            <div className="space-y-3 pt-1">
              <Toggle
                label="Usar nome do cliente"
                desc="IA usa o nome do cliente nas mensagens"
                checked={form.useClientName}
                onChange={set("useClientName")}
              />
              <Toggle
                label="Pode insistir após recusa"
                desc="IA pode re-sugerir itens que o cliente recusou"
                checked={form.canInsistAfterRefusal}
                onChange={set("canInsistAfterRefusal")}
              />
            </div>
          </div>
        </PageCard>
      </div>

      {/* ── 7. Contexto do Cardápio ───────────────────────────────── */}
      <PageCard>
        <SectionHeading
          title="🍽️ Contexto do Cardápio"
          subtitle="Ajuda a IA a apresentar seu cardápio com mais contexto e personalidade."
        />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Pratos principais" hint="O que define sua cozinha?">
            <textarea
              value={form.mainDishes}
              onChange={(e) => set("mainDishes")(e.target.value)}
              rows={3}
              maxLength={500}
              placeholder="Ex: Pizzas napolitanas assadas em forno a lenha, massas artesanais…"
              className={`${INPUT} resize-none`}
            />
          </Field>
          <Field label="Diferenciais" hint="O que torna você único?">
            <textarea
              value={form.differentials}
              onChange={(e) => set("differentials")(e.target.value)}
              rows={3}
              maxLength={500}
              placeholder="Ex: ingredientes importados, receitas exclusivas, entrega em 30 min…"
              className={`${INPUT} resize-none`}
            />
          </Field>
          <div className="sm:col-span-2">
            <Field
              label="Produtos mais lucrativos"
              hint="Opcional — IA priorizará esses itens ao fazer sugestões."
            >
              <input
                type="text"
                value={form.mostProfitableProducts}
                onChange={(e) => set("mostProfitableProducts")(e.target.value)}
                placeholder="Ex: Combo Premium, Pizza Quatro Queijos, Sobremesas"
                maxLength={300}
                className={INPUT}
              />
            </Field>
          </div>
        </div>
      </PageCard>

      {/* ── 8. Avatar da Marca ────────────────────────────────────── */}
      <PageCard>
        <SectionHeading
          title="🤖 Avatar da Marca"
          subtitle="Tipo de culinária — personaliza o avatar e o contexto do assistente."
        />
        <div className="grid grid-cols-5 gap-2 sm:grid-cols-10">
          {CUISINE_OPTIONS.map((opt) => {
            const active = form.cuisineType === opt.value;
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => set("cuisineType")(active ? "" : opt.value)}
                className={`flex flex-col items-center gap-1.5 rounded-xl border p-2.5 text-center transition-all ${
                  active
                    ? "border-indigo-400 bg-indigo-50 shadow-sm"
                    : "border-gray-200 bg-white hover:border-gray-300 hover:bg-gray-50"
                }`}
              >
                <span className="text-2xl leading-none">{opt.emoji}</span>
                <span
                  className={`text-[10px] font-medium leading-tight ${
                    active ? "text-indigo-700" : "text-gray-600"
                  }`}
                >
                  {opt.label}
                </span>
              </button>
            );
          })}
        </div>
      </PageCard>

      {/* ── 9. Identidade Visual ─────────────────────────────────── */}
      <PageCard>
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-base font-semibold text-gray-900">🎨 Identidade Visual</h2>
            <p className="mt-0.5 text-sm text-gray-500">
              Cores e logo aplicadas ao cardápio digital e WhatsApp.
            </p>
          </div>
          <Link
            href="/settings/experience"
            className="shrink-0 rounded-xl border border-indigo-200 bg-indigo-50 px-4 py-2 text-sm font-medium text-indigo-700 transition hover:bg-indigo-100"
          >
            Editar visual →
          </Link>
        </div>
        <div className="mt-4 flex items-center gap-3 rounded-xl border border-gray-100 bg-gray-50 px-4 py-3">
          <div
            className="h-7 w-7 rounded-full border border-gray-200 shadow-sm"
            style={{ backgroundColor: passthrough.brandPrimaryColor ?? "#6366f1" }}
          />
          <div
            className="h-7 w-7 rounded-full border border-gray-200 shadow-sm"
            style={{ backgroundColor: passthrough.brandSecondaryColor ?? "#8b5cf6" }}
          />
          <p className="text-sm text-gray-500">
            {passthrough.brandPrimaryColor ?? "#6366f1"} &middot;{" "}
            {passthrough.brandSecondaryColor ?? "#8b5cf6"}
          </p>
        </div>
      </PageCard>

      <SaveButton saving={saving} label="Salvar persona da marca" />
    </form>
  );
}
