"use client";

import { useState, useEffect, type FormEvent } from "react";
import { apiFetch, Field, INPUT, Feedback, SaveButton, PageCard, SectionHeading } from "../_shared";

// ── Tone & Style options ───────────────────────────────────────────────────────

const TONE_OPTIONS = [
  {
    value: "informal",
    label: "Informal",
    emoji: "😊",
    desc: "Descontraído, próximo, usa expressões do dia a dia",
  },
  {
    value: "neutral",
    label: "Neutro",
    emoji: "🎯",
    desc: "Equilibrado, claro e direto — funciona para qualquer nicho",
  },
  {
    value: "premium",
    label: "Premium",
    emoji: "✨",
    desc: "Sofisticado e cortês — ideal para restaurantes finos",
  },
] as const;

const STYLE_OPTIONS = [
  {
    value: "direct",
    label: "Direto",
    emoji: "⚡",
    desc: "Respostas curtas e objetivas — cliente não espera",
  },
  {
    value: "consultive",
    label: "Consultivo",
    emoji: "🧭",
    desc: "Explica pratos, orienta escolhas, cria conexão",
  },
  {
    value: "sales_driven",
    label: "Voltado para vendas",
    emoji: "📈",
    desc: "Sugere, faz upsell e engaja para aumentar o ticket",
  },
] as const;

type Tone  = (typeof TONE_OPTIONS)[number]["value"];
type Style = (typeof STYLE_OPTIONS)[number]["value"];

// ── Option card ────────────────────────────────────────────────────────────────

function OptionCard<T extends string>({
  option,
  selected,
  onSelect,
}: {
  option: { value: T; label: string; emoji: string; desc: string };
  selected: boolean;
  onSelect: (v: T) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onSelect(option.value)}
      className={`flex items-start gap-3 rounded-2xl border-2 p-4 text-left transition-all ${
        selected
          ? "border-indigo-500 bg-indigo-50 shadow-sm shadow-indigo-100"
          : "border-gray-100 bg-white hover:border-gray-300"
      }`}
    >
      <span className="text-2xl leading-none mt-0.5">{option.emoji}</span>
      <div>
        <p className={`text-sm font-semibold ${selected ? "text-indigo-800" : "text-gray-800"}`}>
          {option.label}
        </p>
        <p className="mt-0.5 text-xs text-gray-500">{option.desc}</p>
      </div>
    </button>
  );
}

// ── Page ───────────────────────────────────────────────────────────────────────

export default function ExperiencePage() {
  const [logoUrl, setLogoUrl] = useState("");
  const [tone, setTone]   = useState<Tone>("informal");
  const [style, setStyle] = useState<Style>("sales_driven");

  const [loading, setLoading]   = useState(true);
  const [saving, setSaving]     = useState(false);
  const [success, setSuccess]   = useState<string | null>(null);
  const [error, setError]       = useState<string | null>(null);

  // Load logo from store + tone/style from agent config
  useEffect(() => {
    Promise.all([
      apiFetch("/api/settings/store"),
      apiFetch("/api/whatsapp-agent"),
    ]).then(([store, agent]) => {
      if (store.ok)  setLogoUrl(store.data?.logoUrl ?? "");
      if (agent.ok) {
        setTone(agent.data?.tone  ?? "informal");
        setStyle(agent.data?.style ?? "sales_driven");
      }
      setLoading(false);
    });
  }, []);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setSuccess(null);
    setError(null);

    // Persist logo to store + tone/style to agent config in parallel
    const [storeRes, agentRes] = await Promise.all([
      apiFetch("/api/settings/store", "PUT", { logoUrl: logoUrl || null }),
      apiFetch("/api/whatsapp-agent", "PUT", { tone, style }),
    ]);

    if (storeRes.ok && agentRes.ok) setSuccess("Experiência de marca salva.");
    else setError(
      (!storeRes.ok ? storeRes.data?.error : null) ??
        (!agentRes.ok ? agentRes.data?.error : null) ??
        "Erro ao salvar."
    );
    setSaving(false);
  }

  if (loading) return <p className="py-8 text-sm text-gray-400">Carregando…</p>;

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <Feedback success={success} error={error} onDismiss={() => setError(null)} />

      {/* Brand identity */}
      <PageCard>
        <SectionHeading
          title="Identidade visual"
          subtitle="Como seu restaurante aparece para os clientes."
        />
        <div className="space-y-4">
          <Field label="Logo (URL)" hint="Imagem quadrada recomendada, mínimo 200×200px.">
            <input
              className={INPUT}
              type="url"
              value={logoUrl}
              onChange={(e) => setLogoUrl(e.target.value)}
              placeholder="https://…"
              maxLength={500}
            />
          </Field>

          {logoUrl && (
            <div className="flex items-center gap-4">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={logoUrl}
                alt="Logo preview"
                className="h-16 w-16 rounded-2xl border border-gray-100 object-cover shadow-sm"
              />
              <div className="rounded-2xl border border-gray-100 bg-white p-3 shadow-sm">
                <div className="flex items-center gap-2">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={logoUrl}
                    alt="Logo mini"
                    className="h-8 w-8 rounded-lg object-cover"
                  />
                  <span className="text-sm font-semibold text-gray-900">Seu restaurante</span>
                </div>
                <p className="mt-1 text-[10px] text-gray-400">Preview no cardápio</p>
              </div>
            </div>
          )}

          {/* Brand color — coming soon */}
          <div className="rounded-xl border border-dashed border-indigo-200 bg-indigo-50/40 px-4 py-4">
            <div className="flex items-center gap-2">
              <span className="text-base">🎨</span>
              <p className="text-sm font-semibold text-indigo-700">Cor da marca — em breve</p>
            </div>
            <p className="mt-1 text-xs text-indigo-500 opacity-80">
              Personalização de cores primárias e secundárias aplicadas ao cardápio web e comunicações.
            </p>
          </div>
        </div>
      </PageCard>

      {/* AI voice — tone */}
      <PageCard>
        <SectionHeading
          title="Tom de voz do agente"
          subtitle="Como o agente de IA se comunica com seus clientes."
        />
        <div className="grid gap-3 sm:grid-cols-3">
          {TONE_OPTIONS.map((opt) => (
            <OptionCard
              key={opt.value}
              option={opt}
              selected={tone === opt.value}
              onSelect={setTone}
            />
          ))}
        </div>
      </PageCard>

      {/* AI voice — style */}
      <PageCard>
        <SectionHeading
          title="Personalidade do agente"
          subtitle="Como o agente age para cada interação com o cliente."
        />
        <div className="grid gap-3 sm:grid-cols-3">
          {STYLE_OPTIONS.map((opt) => (
            <OptionCard
              key={opt.value}
              option={opt}
              selected={style === opt.value}
              onSelect={setStyle}
            />
          ))}
        </div>
      </PageCard>

      <SaveButton saving={saving} label="Salvar experiência" />
    </form>
  );
}
