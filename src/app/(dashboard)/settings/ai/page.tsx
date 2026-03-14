"use client";

/**
 * /dashboard/settings/ai
 *
 * Brand voice and AI ordering engine configuration.
 * Accessible to OWNER and MANAGER roles.
 *
 * Sections:
 *   1. Voice & Tone — how the AI speaks to customers
 *   2. Ordering behaviour — upsell aggressiveness, greeting template
 *   3. AI model — gpt-4o-mini (default) or gpt-4o
 *   4. Advanced — full system prompt override
 */

import { useState, useEffect, FormEvent } from "react";

// ─── option maps ─────────────────────────────────────────────

const TONE_OPTIONS = [
  { value: "friendly",      label: "Amigável",      desc: "Caloroso e acolhedor" },
  { value: "professional",  label: "Profissional",   desc: "Formal e objetivo" },
  { value: "casual",        label: "Descontraído",   desc: "Informal e próximo" },
  { value: "warm",          label: "Caloroso",       desc: "Empático e afetuoso" },
];

const FORMALITY_OPTIONS = [
  { value: "informal", label: "Informal",  desc: "Você, tudo bem?" },
  { value: "formal",   label: "Formal",    desc: "O(a) senhor(a)" },
  { value: "mixed",    label: "Adaptável", desc: "Segue o tom do cliente" },
];

const EMOJI_OPTIONS = [
  { value: "none",        label: "Nenhum",       desc: "Sem emojis" },
  { value: "minimal",     label: "Mínimo",       desc: "Só em momentos-chave" },
  { value: "moderate",    label: "Moderado",     desc: "Alguns por mensagem" },
  { value: "expressive",  label: "Expressivo",   desc: "Bastante, animado" },
];

const STYLE_OPTIONS = [
  { value: "conversational", label: "Conversacional", desc: "Natural, faz perguntas" },
  { value: "concise",        label: "Conciso",        desc: "Respostas curtas e diretas" },
  { value: "detailed",       label: "Detalhado",      desc: "Explica os itens" },
];

const UPSELL_OPTIONS = [
  { value: "none",       label: "Desativado",  desc: "Sem sugestões" },
  { value: "gentle",     label: "Gentil",      desc: "Uma sugestão natural" },
  { value: "moderate",   label: "Moderado",    desc: "Sugere quando adequado" },
  { value: "proactive",  label: "Proativo",    desc: "Sugere frequentemente" },
];

const MODEL_OPTIONS = [
  { value: "gpt-4o-mini", label: "GPT-4o Mini", desc: "Rápido e econômico (recomendado)" },
  { value: "gpt-4o",      label: "GPT-4o",      desc: "Mais capaz, maior custo" },
];

// ─── form state ───────────────────────────────────────────────

interface FormState {
  tone: string;
  formality: string;
  emojiUsage: string;
  communicationStyle: string;
  upsellStyle: string;
  greetingTemplate: string;
  systemPromptOverride: string;
  aiModel: string;
  maxHistoryMessages: number;
}

const DEFAULTS: FormState = {
  tone: "friendly",
  formality: "informal",
  emojiUsage: "moderate",
  communicationStyle: "conversational",
  upsellStyle: "gentle",
  greetingTemplate: "",
  systemPromptOverride: "",
  aiModel: "gpt-4o-mini",
  maxHistoryMessages: 20,
};

// ─── component ────────────────────────────────────────────────

export default function AISettingsPage() {
  const [form, setForm] = useState<FormState>(DEFAULTS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [showAdvanced, setShowAdvanced] = useState(false);

  useEffect(() => { fetchConfig(); }, []);

  async function fetchConfig() {
    setLoading(true);
    try {
      const res = await fetch("/api/brand-config");
      if (res.ok) {
        const json = await res.json();
        const d = json.data;
        setForm({
          tone: d.tone ?? DEFAULTS.tone,
          formality: d.formality ?? DEFAULTS.formality,
          emojiUsage: d.emojiUsage ?? DEFAULTS.emojiUsage,
          communicationStyle: d.communicationStyle ?? DEFAULTS.communicationStyle,
          upsellStyle: d.upsellStyle ?? DEFAULTS.upsellStyle,
          greetingTemplate: d.greetingTemplate ?? "",
          systemPromptOverride: d.systemPromptOverride ?? "",
          aiModel: d.aiModel ?? DEFAULTS.aiModel,
          maxHistoryMessages: d.maxHistoryMessages ?? DEFAULTS.maxHistoryMessages,
        });
        if (d.systemPromptOverride) setShowAdvanced(true);
      }
      // 404 = not configured yet, form keeps defaults
    } catch {
      setErrorMsg("Falha ao carregar configuração");
    } finally {
      setLoading(false);
    }
  }

  async function handleSave(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setSuccessMsg(null);
    setErrorMsg(null);

    try {
      const res = await fetch("/api/brand-config", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          greetingTemplate: form.greetingTemplate || null,
          systemPromptOverride: form.systemPromptOverride || null,
        }),
      });

      const json = await res.json();
      if (!res.ok) {
        setErrorMsg(json.error ?? "Erro ao salvar");
        return;
      }
      setSuccessMsg("Configuração de IA salva com sucesso.");
    } catch {
      setErrorMsg("Falha de rede");
    } finally {
      setSaving(false);
    }
  }

  function set(key: keyof FormState) {
    return (value: string | number) =>
      setForm((prev) => ({ ...prev, [key]: value }));
  }

  if (loading) {
    return <div className="p-6 text-sm text-gray-400">Carregando configuração de IA…</div>;
  }

  return (
    <form onSubmit={handleSave} className="p-6 max-w-2xl space-y-8">
      <div>
        <h1 className="text-xl font-semibold text-gray-900">Assistente de IA — Configuração</h1>
        <p className="mt-1 text-sm text-gray-500">
          Defina como o assistente de IA interage com seus clientes no WhatsApp.
          Estas configurações são injetadas no prompt de cada conversa.
        </p>
      </div>

      {/* Feedback */}
      {successMsg && (
        <div className="rounded-lg border border-green-200 bg-green-50 px-4 py-2 text-sm text-green-700">
          {successMsg}
        </div>
      )}
      {errorMsg && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700">
          {errorMsg}
          <button className="ml-2 underline" onClick={() => setErrorMsg(null)}>fechar</button>
        </div>
      )}

      {/* ── Voz e Tom ── */}
      <section className="rounded-xl border border-gray-200 bg-white p-5">
        <h2 className="mb-4 text-sm font-semibold text-gray-700">Voz e Tom</h2>
        <div className="space-y-5">
          <RadioGroup label="Tom" options={TONE_OPTIONS} value={form.tone} onChange={set("tone")} />
          <RadioGroup label="Formalidade" options={FORMALITY_OPTIONS} value={form.formality} onChange={set("formality")} />
          <RadioGroup label="Emojis" options={EMOJI_OPTIONS} value={form.emojiUsage} onChange={set("emojiUsage")} />
          <RadioGroup label="Estilo" options={STYLE_OPTIONS} value={form.communicationStyle} onChange={set("communicationStyle")} />
        </div>
      </section>

      {/* ── Comportamento de Pedido ── */}
      <section className="rounded-xl border border-gray-200 bg-white p-5">
        <h2 className="mb-4 text-sm font-semibold text-gray-700">Comportamento de Pedido</h2>
        <div className="space-y-5">
          <RadioGroup label="Sugestões (upsell)" options={UPSELL_OPTIONS} value={form.upsellStyle} onChange={set("upsellStyle")} />

          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">
              Saudação personalizada{" "}
              <span className="font-normal text-gray-400">(opcional)</span>
            </label>
            <textarea
              value={form.greetingTemplate}
              onChange={(e) => set("greetingTemplate")(e.target.value)}
              rows={2}
              maxLength={500}
              placeholder="Ex: Olá! Bem-vindo ao Restaurante XYZ 🍕 Como posso ajudar?"
              className="w-full resize-none rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
            />
          </div>
        </div>
      </section>

      {/* ── Modelo de IA ── */}
      <section className="rounded-xl border border-gray-200 bg-white p-5">
        <h2 className="mb-4 text-sm font-semibold text-gray-700">Modelo de IA</h2>
        <div className="space-y-5">
          <RadioGroup label="Modelo OpenAI" options={MODEL_OPTIONS} value={form.aiModel} onChange={set("aiModel")} />

          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">
              Histórico de mensagens incluído
            </label>
            <div className="flex items-center gap-3">
              <input
                type="range"
                min={5}
                max={50}
                step={5}
                value={form.maxHistoryMessages}
                onChange={(e) => set("maxHistoryMessages")(Number(e.target.value))}
                className="w-48"
              />
              <span className="text-sm text-gray-700">{form.maxHistoryMessages} mensagens</span>
            </div>
            <p className="mt-1 text-xs text-gray-400">
              Mais mensagens = mais contexto, mas maior custo por turno.
            </p>
          </div>
        </div>
      </section>

      {/* ── Avançado ── */}
      <section className="rounded-xl border border-gray-200 bg-white p-5">
        <button
          type="button"
          onClick={() => setShowAdvanced((v) => !v)}
          className="flex w-full items-center justify-between text-sm font-semibold text-gray-700"
        >
          <span>Configurações avançadas</span>
          <span className="text-gray-400">{showAdvanced ? "▲" : "▼"}</span>
        </button>

        {showAdvanced && (
          <div className="mt-4">
            <label className="mb-1 block text-sm font-medium text-gray-700">
              System prompt personalizado{" "}
              <span className="font-normal text-gray-400">(substitui o prompt padrão)</span>
            </label>
            <textarea
              value={form.systemPromptOverride}
              onChange={(e) => set("systemPromptOverride")(e.target.value)}
              rows={8}
              maxLength={4000}
              placeholder="Deixe em branco para usar o prompt padrão gerado automaticamente.&#10;&#10;Use {CONTEXT} para injetar o cardápio, pedido atual e perfil do cliente."
              className="w-full resize-y rounded-lg border border-gray-300 px-3 py-2 font-mono text-xs focus:outline-none focus:ring-2 focus:ring-brand-500"
            />
            <p className="mt-1 text-xs text-amber-600">
              Atenção: um prompt incorreto pode comprometer a experiência de pedidos.
              Teste cuidadosamente antes de ativar.
            </p>
          </div>
        )}
      </section>

      <div className="flex justify-end">
        <button
          type="submit"
          disabled={saving}
          className="rounded-lg bg-brand-600 px-6 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
        >
          {saving ? "Salvando…" : "Salvar configuração"}
        </button>
      </div>
    </form>
  );
}

// ─── RadioGroup sub-component ─────────────────────────────────

function RadioGroup({
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
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
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
