"use client";

import { useState, useEffect, type FormEvent } from "react";
import { apiFetch, Feedback, SaveButton, PageCard, SectionHeading } from "../_shared";
import {
  PERSONALITY_VOICE_MAP,
  INTENSITY_STYLE_MAP,
  DEFAULT_BRAND_CONFIG,
  type PersonalityPreset,
  type UpsellIntensity,
  type SalesFocus,
  type SalesPriority,
} from "@/validators/brand-config";

// ─────────────────────────────────────────────────────────────
//  Static config
// ─────────────────────────────────────────────────────────────

const PERSONALITIES = [
  {
    id: "traditional" as PersonalityPreset,
    emoji: "🤗",
    label: "Tradicional & Caloroso",
    desc: "Acolhedor, paciente e confiável. Cria conexão com o cliente.",
    tags: ["Acolhedor", "Paciente", "Confiável"],
    gradient: "from-amber-50 to-orange-50",
    border: "border-amber-200",
    activeBorder: "border-amber-500",
    activeBg: "bg-amber-50",
    tagColor: "bg-amber-100 text-amber-700",
    accentColor: "#f59e0b",
    sampleMsg: "Olá! Seja muito bem-vindo 😊 Posso te ajudar a encontrar o prato perfeito?",
  },
  {
    id: "fast" as PersonalityPreset,
    emoji: "⚡",
    label: "Rápido & Direto",
    desc: "Objetivo, eficiente e claro. Zero enrolação, máxima velocidade.",
    tags: ["Objetivo", "Eficiente", "Claro"],
    gradient: "from-blue-50 to-sky-50",
    border: "border-blue-200",
    activeBorder: "border-blue-500",
    activeBg: "bg-blue-50",
    tagColor: "bg-blue-100 text-blue-700",
    accentColor: "#3b82f6",
    sampleMsg: "Oi! O que vai querer hoje?",
  },
  {
    id: "premium" as PersonalityPreset,
    emoji: "✨",
    label: "Premium & Sofisticado",
    desc: "Elegante, refinado e exclusivo. Transmite qualidade em cada palavra.",
    tags: ["Elegante", "Refinado", "Exclusivo"],
    gradient: "from-violet-50 to-purple-50",
    border: "border-violet-200",
    activeBorder: "border-violet-500",
    activeBg: "bg-violet-50",
    tagColor: "bg-violet-100 text-violet-700",
    accentColor: "#8b5cf6",
    sampleMsg: "Seja bem-vindo. Terei o prazer de auxiliá-lo com nossa curadoria.",
  },
  {
    id: "young" as PersonalityPreset,
    emoji: "🔥",
    label: "Jovem & Casual",
    desc: "Divertido, informal e engajado. Fala a língua do cliente moderno.",
    tags: ["Divertido", "Informal", "Engajado"],
    gradient: "from-rose-50 to-orange-50",
    border: "border-rose-200",
    activeBorder: "border-rose-500",
    activeBg: "bg-rose-50",
    tagColor: "bg-rose-100 text-rose-700",
    accentColor: "#f43f5e",
    sampleMsg: "Oi!! 🔥 Que incrível ter você aqui! Bora pedir umas delícias??",
  },
  {
    id: "aggressive" as PersonalityPreset,
    emoji: "📈",
    label: "Agressivo em Vendas",
    desc: "Proativo, persuasivo e orientado a conversão. Maximiza o ticket.",
    tags: ["Proativo", "Persuasivo", "Vendedor"],
    gradient: "from-emerald-50 to-teal-50",
    border: "border-emerald-200",
    activeBorder: "border-emerald-500",
    activeBg: "bg-emerald-50",
    tagColor: "bg-emerald-100 text-emerald-700",
    accentColor: "#10b981",
    sampleMsg: "Oi! Hoje temos o Combo Família com 20% OFF! 🎉 Aproveita? Posso te ajudar!",
  },
] as const;

// ─────────────────────────────────────────────────────────────
//  Primitive: triple toggle
// ─────────────────────────────────────────────────────────────

type TripleOption<T extends string> = { value: T; label: string; icon?: string };

function TripleToggle<T extends string>({
  label,
  desc,
  options,
  value,
  onChange,
}: {
  label: string;
  desc?: string;
  options: [TripleOption<T>, TripleOption<T>, TripleOption<T>];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-4">
      <div className="min-w-0">
        <p className="text-sm font-semibold text-gray-800">{label}</p>
        {desc && <p className="text-xs text-gray-500">{desc}</p>}
      </div>
      <div className="flex shrink-0 overflow-hidden rounded-xl border border-gray-200 bg-gray-50">
        {options.map((opt) => (
          <button
            key={opt.value}
            type="button"
            onClick={() => onChange(opt.value)}
            className={`px-3 py-2 text-xs font-semibold transition-all whitespace-nowrap ${
              value === opt.value
                ? "bg-indigo-600 text-white shadow-sm"
                : "text-gray-500 hover:bg-gray-100 hover:text-gray-800"
            }`}
          >
            {opt.icon && <span className="mr-1">{opt.icon}</span>}
            {opt.label}
          </button>
        ))}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
//  Live preview (phone mockup)
// ─────────────────────────────────────────────────────────────

function LivePreview({
  primaryColor,
  secondaryColor,
  logoUrl,
  restaurantName,
  sampleMsg,
}: {
  primaryColor: string;
  secondaryColor: string;
  logoUrl: string;
  restaurantName: string;
  sampleMsg: string;
}) {
  const primary = primaryColor || "#6366f1";
  const secondary = secondaryColor || "#8b5cf6";

  return (
    <div className="flex flex-col items-center">
      <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-gray-400">
        Preview ao vivo
      </p>

      {/* Phone shell */}
      <div className="w-52 rounded-[2.5rem] bg-gray-900 p-[5px] shadow-2xl shadow-gray-400/30">
        <div className="overflow-hidden rounded-[2.1rem] bg-gray-50">
          {/* Notch */}
          <div className="flex justify-center bg-gray-900 py-1.5">
            <div className="h-1.5 w-14 rounded-full bg-gray-700" />
          </div>

          {/* App header */}
          <div className="flex items-center gap-2 px-3 py-2.5" style={{ backgroundColor: primary }}>
            {logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={logoUrl}
                alt="logo"
                className="h-8 w-8 rounded-full border-2 border-white/30 object-cover"
              />
            ) : (
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-white/20 text-sm">
                🍽
              </div>
            )}
            <div>
              <p className="text-[11px] font-bold leading-none text-white">
                {restaurantName || "Seu Restaurante"}
              </p>
              <p className="mt-0.5 text-[9px] text-white/70">• Online agora</p>
            </div>
          </div>

          {/* Chat area */}
          <div
            className="space-y-2 p-2.5"
            style={{ minHeight: 180, background: "#e5ddd5" }}
          >
            {/* AI bubble */}
            <div className="flex items-end gap-1.5">
              <div
                className="max-w-[85%] rounded-2xl rounded-tl-sm px-3 py-2 text-[10px] leading-snug text-white shadow-sm"
                style={{ backgroundColor: primary }}
              >
                {sampleMsg}
              </div>
            </div>

            {/* Menu card */}
            <div className="overflow-hidden rounded-xl bg-white shadow-sm">
              <div
                className="h-12 w-full"
                style={{
                  background: `linear-gradient(135deg, ${primary}33 0%, ${secondary}33 100%)`,
                }}
              />
              <div className="px-2.5 py-2">
                <p className="text-[10px] font-bold text-gray-900">X-Burguer Especial</p>
                <div className="mt-1 flex items-center justify-between">
                  <span className="text-[10px] text-gray-500">R$ 28,90</span>
                  <button
                    type="button"
                    className="rounded-full px-2.5 py-1 text-[9px] font-bold text-white"
                    style={{ backgroundColor: primary }}
                  >
                    + Pedir
                  </button>
                </div>
              </div>
            </div>

            {/* Customer reply */}
            <div className="flex justify-end">
              <div className="max-w-[75%] rounded-2xl rounded-tr-sm bg-white px-3 py-2 text-[10px] shadow-sm">
                Perfeito! Quero esse 🤤
              </div>
            </div>
          </div>

          {/* Input bar */}
          <div className="flex items-center gap-2 bg-gray-100 px-2.5 py-2">
            <div className="flex-1 rounded-full bg-white px-3 py-1.5 text-[9px] text-gray-400">
              Mensagem…
            </div>
          </div>
        </div>
      </div>

      {/* Color chips */}
      <div className="mt-3 flex items-center gap-2">
        <div
          className="h-5 w-5 rounded-full border-2 border-white shadow-sm"
          style={{ backgroundColor: primary }}
          title="Cor principal"
        />
        <div
          className="h-5 w-5 rounded-full border-2 border-white shadow-sm"
          style={{ backgroundColor: secondary }}
          title="Cor secundária"
        />
        <p className="text-[10px] text-gray-400">
          {primary} · {secondary}
        </p>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
//  Color field
// ─────────────────────────────────────────────────────────────

function ColorField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  const display = value || "#6366f1";
  return (
    <div>
      <label className="mb-1.5 block text-sm font-medium text-gray-700">{label}</label>
      <div className="flex items-center gap-2">
        <div className="relative">
          <input
            type="color"
            value={display}
            onChange={(e) => onChange(e.target.value)}
            className="h-10 w-10 cursor-pointer rounded-xl border-0 p-0.5 shadow-sm"
            style={{ backgroundColor: display }}
          />
        </div>
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="#6366f1"
          maxLength={7}
          className="w-28 rounded-xl border border-gray-200 px-3 py-2 text-sm font-mono text-gray-800 focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-100"
        />
        <div
          className="h-10 w-10 shrink-0 rounded-xl border border-gray-100 shadow-sm"
          style={{ backgroundColor: display }}
        />
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
//  Page
// ─────────────────────────────────────────────────────────────

type Language     = "formal" | "neutral" | "casual";
type EmojiLevel   = "none" | "moderate" | "high";
type MsgLength    = "short" | "medium" | "detailed";

export default function ExperiencePage() {
  // Personality
  const [personality, setPersonality] = useState<PersonalityPreset>("traditional");

  // Sales strategy
  const [upsellIntensity, setUpsellIntensity] = useState<UpsellIntensity>("medium");
  const [salesFocus, setSalesFocus]           = useState<SalesFocus>("balanced");
  const [salesPriority, setSalesPriority]     = useState<SalesPriority>("bestsellers");

  // Communication style (UI-level — maps to brand config fields on save)
  const [language, setLanguage]       = useState<Language>("neutral");
  const [emojiLevel, setEmojiLevel]   = useState<EmojiLevel>("moderate");
  const [msgLength, setMsgLength]     = useState<MsgLength>("medium");

  // Visual identity
  const [primaryColor, setPrimaryColor]     = useState("#6366f1");
  const [secondaryColor, setSecondaryColor] = useState("#8b5cf6");
  const [logoUrl, setLogoUrl]               = useState("");
  const [restaurantName, setRestaurantName] = useState("");

  const [loading, setLoading] = useState(true);
  const [saving, setSaving]   = useState(false);
  const [success, setSuccess] = useState<string | null>(null);
  const [error, setError]     = useState<string | null>(null);

  // Load existing config
  useEffect(() => {
    Promise.all([
      apiFetch("/api/brand-config"),
      apiFetch("/api/settings/store"),
    ]).then(([bc, store]) => {
      // Brand config (may 404 on first run — use defaults)
      const c = bc.ok ? bc.data : DEFAULT_BRAND_CONFIG;
      setPersonality((c.personalityPreset as PersonalityPreset) ?? "traditional");
      setUpsellIntensity((c.upsellIntensity as UpsellIntensity) ?? "medium");
      setSalesFocus((c.salesFocus as SalesFocus) ?? "balanced");
      setSalesPriority((c.salesPriority as SalesPriority) ?? "bestsellers");
      setPrimaryColor(c.brandPrimaryColor ?? "#6366f1");
      setSecondaryColor(c.brandSecondaryColor ?? "#8b5cf6");

      // Reverse-map stored brand config → UI controls
      const fmt = c.formality ?? "informal";
      setLanguage(fmt === "formal" ? "formal" : fmt === "mixed" ? "neutral" : "casual");
      const em = c.emojiUsage ?? "moderate";
      setEmojiLevel(em === "none" || em === "minimal" ? "none" : em === "expressive" ? "high" : "moderate");
      const cs = c.communicationStyle ?? "conversational";
      setMsgLength(cs === "concise" ? "short" : cs === "detailed" ? "detailed" : "medium");

      // Store
      if (store.ok) {
        setLogoUrl(store.data?.logoUrl ?? "");
        setRestaurantName(store.data?.name ?? "");
      }

      setLoading(false);
    });
  }, []);

  // When personality changes, apply voice preset defaults
  function handlePersonalityChange(p: PersonalityPreset) {
    setPersonality(p);
    const voice = PERSONALITY_VOICE_MAP[p];
    const fmt = voice.formality;
    setLanguage(fmt === "formal" ? "formal" : fmt === "mixed" ? "neutral" : "casual");
    const em = voice.emojiUsage;
    setEmojiLevel(em === "none" || em === "minimal" ? "none" : em === "expressive" ? "high" : "moderate");
    const cs = voice.communicationStyle;
    setMsgLength(cs === "concise" ? "short" : cs === "detailed" ? "detailed" : "medium");
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setSuccess(null);
    setError(null);

    // Map UI state → brand config fields
    const voice = PERSONALITY_VOICE_MAP[personality];
    const formality  = language === "formal" ? "formal" : language === "neutral" ? "mixed" : "informal";
    const emojiUsage = emojiLevel === "none" ? "none" : emojiLevel === "high" ? "expressive" : "moderate";
    const commStyle  = msgLength === "short" ? "concise" : msgLength === "detailed" ? "detailed" : "conversational";
    const upsellSty  = INTENSITY_STYLE_MAP[upsellIntensity];

    const [bcRes, storeRes] = await Promise.all([
      apiFetch("/api/brand-config", "PUT", {
        tone:               voice.tone,
        formality,
        emojiUsage,
        communicationStyle: commStyle,
        upsellStyle:        upsellSty,
        aiModel:            "gpt-4o-mini",
        maxHistoryMessages: 20,
        personalityPreset:  personality,
        upsellIntensity,
        salesFocus,
        salesPriority,
        brandPrimaryColor:   primaryColor  || null,
        brandSecondaryColor: secondaryColor || null,
      }),
      apiFetch("/api/settings/store", "PUT", {
        logoUrl: logoUrl || null,
      }),
    ]);

    if (bcRes.ok && storeRes.ok) {
      setSuccess("Experiência de marca configurada com sucesso.");
    } else {
      setError(
        (!bcRes.ok ? bcRes.data?.error : null) ??
        (!storeRes.ok ? storeRes.data?.error : null) ??
        "Erro ao salvar."
      );
    }
    setSaving(false);
  }

  const activePersonality = PERSONALITIES.find((p) => p.id === personality) ?? PERSONALITIES[0]!;

  if (loading) return <p className="py-8 text-sm text-gray-400">Carregando…</p>;

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <Feedback success={success} error={error} onDismiss={() => setError(null)} />

      {/* ── 1. Personality ─────────────────────────────────── */}
      <PageCard>
        <SectionHeading
          title="Personalidade do restaurante"
          subtitle="Como o seu agente de IA se apresenta e vende para os clientes."
        />

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {PERSONALITIES.slice(0, 4).map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => handlePersonalityChange(p.id)}
              className={`flex flex-col items-start gap-2 rounded-2xl border-2 p-4 text-left transition-all duration-150 ${
                personality === p.id
                  ? `${p.activeBorder} ${p.activeBg} shadow-sm`
                  : `${p.border} bg-white hover:bg-gray-50`
              }`}
            >
              <span className="text-2xl leading-none">{p.emoji}</span>
              <div className="min-w-0">
                <p className={`text-sm font-bold leading-tight ${personality === p.id ? "text-gray-900" : "text-gray-700"}`}>
                  {p.label}
                </p>
                <p className="mt-1 text-[11px] text-gray-500 leading-snug">{p.desc}</p>
              </div>
              <div className="flex flex-wrap gap-1 mt-1">
                {p.tags.map((tag) => (
                  <span key={tag} className={`rounded-full px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide ${p.tagColor}`}>
                    {tag}
                  </span>
                ))}
              </div>
            </button>
          ))}

          {/* 5th card: full width on xs, 1 col on sm+ */}
          <button
            key={PERSONALITIES[4]!.id}
            type="button"
            onClick={() => handlePersonalityChange(PERSONALITIES[4]!.id)}
            className={`col-span-2 flex items-center gap-4 rounded-2xl border-2 p-4 text-left transition-all duration-150 sm:col-span-1 sm:flex-col sm:items-start sm:gap-2 ${
              personality === PERSONALITIES[4]!.id
                ? `${PERSONALITIES[4]!.activeBorder} ${PERSONALITIES[4]!.activeBg} shadow-sm`
                : `${PERSONALITIES[4]!.border} bg-white hover:bg-gray-50`
            }`}
          >
            <span className="text-2xl leading-none">{PERSONALITIES[4]!.emoji}</span>
            <div className="flex-1 sm:w-full">
              <p className={`text-sm font-bold leading-tight ${personality === PERSONALITIES[4]!.id ? "text-gray-900" : "text-gray-700"}`}>
                {PERSONALITIES[4]!.label}
              </p>
              <p className="mt-1 text-[11px] text-gray-500 leading-snug">{PERSONALITIES[4]!.desc}</p>
              <div className="mt-2 flex flex-wrap gap-1">
                {PERSONALITIES[4]!.tags.map((tag) => (
                  <span key={tag} className={`rounded-full px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide ${PERSONALITIES[4]!.tagColor}`}>
                    {tag}
                  </span>
                ))}
              </div>
            </div>
          </button>
        </div>

        {/* Sample message preview */}
        <div className="mt-4 flex items-start gap-3 rounded-xl border border-gray-100 bg-gray-50 p-3">
          <span className="mt-0.5 text-lg leading-none">{activePersonality.emoji}</span>
          <div>
            <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide mb-1">
              Mensagem de exemplo
            </p>
            <p className="text-sm italic text-gray-700">&ldquo;{activePersonality.sampleMsg}&rdquo;</p>
          </div>
        </div>
      </PageCard>

      {/* ── 2. Sales Strategy ──────────────────────────────── */}
      <PageCard>
        <SectionHeading
          title="Estratégia de vendas"
          subtitle="Como o agente deve priorizar e conduzir cada conversa."
        />
        <div className="space-y-4">
          <TripleToggle
            label="Intensidade de upsell"
            desc="Com que frequência o agente sugere itens adicionais."
            value={upsellIntensity}
            onChange={setUpsellIntensity}
            options={[
              { value: "low",    label: "Baixa",  icon: "💤" },
              { value: "medium", label: "Média",  icon: "⚡" },
              { value: "high",   label: "Alta",   icon: "🔥" },
            ]}
          />
          <div className="border-t border-gray-50" />
          <TripleToggle
            label="Foco em vendas"
            desc="O que o agente tenta maximizar em cada pedido."
            value={salesFocus}
            onChange={setSalesFocus}
            options={[
              { value: "balanced", label: "Equilibrado" },
              { value: "ticket",   label: "Ticket médio" },
              { value: "volume",   label: "Volume" },
            ]}
          />
          <div className="border-t border-gray-50" />
          <TripleToggle
            label="Prioridade de produto"
            desc="Quais itens o agente recomenda primeiro."
            value={salesPriority}
            onChange={setSalesPriority}
            options={[
              { value: "bestsellers",  label: "Mais vendidos" },
              { value: "high_margin",  label: "Maior margem" },
              { value: "promotions",   label: "Promoções" },
            ]}
          />
        </div>
      </PageCard>

      {/* ── 3. Communication Style ─────────────────────────── */}
      <PageCard>
        <SectionHeading
          title="Estilo de comunicação"
          subtitle="O tom e o formato das mensagens enviadas ao cliente."
        />
        <div className="space-y-4">
          <TripleToggle
            label="Linguagem"
            desc="Grau de formalidade nas mensagens."
            value={language}
            onChange={setLanguage}
            options={[
              { value: "formal",  label: "Formal"  },
              { value: "neutral", label: "Neutro"  },
              { value: "casual",  label: "Casual"  },
            ]}
          />
          <div className="border-t border-gray-50" />
          <TripleToggle
            label="Uso de emojis"
            desc="Quantidade de emojis nas mensagens do agente."
            value={emojiLevel}
            onChange={setEmojiLevel}
            options={[
              { value: "none",     label: "Nenhum",   icon: "🚫" },
              { value: "moderate", label: "Moderado", icon: "😊" },
              { value: "high",     label: "Alto",     icon: "🎉" },
            ]}
          />
          <div className="border-t border-gray-50" />
          <TripleToggle
            label="Tamanho das mensagens"
            desc="Nível de detalhe nas respostas do agente."
            value={msgLength}
            onChange={setMsgLength}
            options={[
              { value: "short",    label: "Curto"    },
              { value: "medium",   label: "Médio"    },
              { value: "detailed", label: "Detalhado" },
            ]}
          />
        </div>
      </PageCard>

      {/* ── 4. Visual Identity + Live Preview ─────────────── */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <PageCard>
          <SectionHeading
            title="Identidade visual"
            subtitle="Cores e logo aplicadas ao cardápio e comunicações."
          />
          <div className="space-y-5">
            <ColorField
              label="Cor principal"
              value={primaryColor}
              onChange={setPrimaryColor}
            />
            <ColorField
              label="Cor secundária"
              value={secondaryColor}
              onChange={setSecondaryColor}
            />

            <div>
              <label className="mb-1.5 block text-sm font-medium text-gray-700">
                Logo (URL)
              </label>
              <input
                type="url"
                value={logoUrl}
                onChange={(e) => setLogoUrl(e.target.value)}
                placeholder="https://…"
                maxLength={500}
                className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-100 transition"
              />
            </div>
          </div>
        </PageCard>

        {/* Live preview */}
        <div className="flex items-center justify-center rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
          <LivePreview
            primaryColor={primaryColor}
            secondaryColor={secondaryColor}
            logoUrl={logoUrl}
            restaurantName={restaurantName}
            sampleMsg={activePersonality.sampleMsg}
          />
        </div>
      </div>

      <SaveButton saving={saving} label="Salvar configuração" />
    </form>
  );
}
