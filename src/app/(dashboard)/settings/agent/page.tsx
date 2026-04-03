"use client";

/**
 * /dashboard/settings/agent
 *
 * WhatsApp agent configuration panel.
 * Controls the agent's personality, welcome flow, and handoff settings.
 */

import { useState, useEffect, FormEvent } from "react";
import Link from "next/link";
import { AGENT_DEFAULTS } from "@/validators/whatsapp-agent";

// ── Option maps ────────────────────────────────────────────────────────────────

const TONE_OPTIONS = [
  { value: "informal", label: "Informal",  desc: "Você, sabe? Tranquilo" },
  { value: "neutral",  label: "Neutro",    desc: "Equilibrado e claro" },
  { value: "premium",  label: "Premium",   desc: "Sofisticado e cortês" },
];

const STYLE_OPTIONS = [
  { value: "direct",       label: "Direto",      desc: "Respostas curtas e rápidas" },
  { value: "consultive",   label: "Consultivo",  desc: "Explica e orienta o cliente" },
  { value: "sales_driven", label: "Vendas",      desc: "Sugere, engaja, converte" },
];

// ── Form state ─────────────────────────────────────────────────────────────────

interface FormState {
  agentName: string;
  tone: string;
  style: string;
  welcomeMessage: string;
  btn1Label: string;
  btn2Label: string;
  btn3Label: string;
  orderPreMessage: string;
  menuUrl: string;
  handoffPhone: string;
  handoffMessage: string;
}

function toForm(d: Record<string, unknown>): FormState {
  return {
    agentName:       String(d.agentName       ?? AGENT_DEFAULTS.agentName),
    tone:            String(d.tone            ?? AGENT_DEFAULTS.tone),
    style:           String(d.style           ?? AGENT_DEFAULTS.style),
    welcomeMessage:  String(d.welcomeMessage  ?? AGENT_DEFAULTS.welcomeMessage),
    btn1Label:       String(d.btn1Label       ?? AGENT_DEFAULTS.btn1Label),
    btn2Label:       String(d.btn2Label       ?? AGENT_DEFAULTS.btn2Label),
    btn3Label:       String(d.btn3Label       ?? AGENT_DEFAULTS.btn3Label),
    orderPreMessage: String(d.orderPreMessage ?? AGENT_DEFAULTS.orderPreMessage),
    menuUrl:         String(d.menuUrl         ?? ""),
    handoffPhone:    String(d.handoffPhone    ?? ""),
    handoffMessage:  String(d.handoffMessage  ?? AGENT_DEFAULTS.handoffMessage),
  };
}

const FORM_DEFAULTS: FormState = toForm({});

// ── Component ──────────────────────────────────────────────────────────────────

export default function AgentSettingsPage() {
  const [form, setForm]         = useState<FormState>(FORM_DEFAULTS);
  const [loading, setLoading]   = useState(true);
  const [saving, setSaving]     = useState(false);
  const [successMsg, setSuccess] = useState<string | null>(null);
  const [errorMsg, setError]    = useState<string | null>(null);

  useEffect(() => { fetchConfig(); }, []);

  async function fetchConfig() {
    setLoading(true);
    try {
      const res = await fetch("/api/whatsapp-agent");
      if (res.ok) {
        const json = await res.json();
        setForm(toForm(json.data));
      }
      // 404 = not configured yet, keep defaults
    } catch {
      setError("Falha ao carregar configuração");
    } finally {
      setLoading(false);
    }
  }

  async function handleSave(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setSuccess(null);
    setError(null);
    try {
      const res = await fetch("/api/whatsapp-agent", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          menuUrl:      form.menuUrl      || null,
          handoffPhone: form.handoffPhone || null,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? "Erro ao salvar");
        return;
      }
      setSuccess("Configuração do agente salva com sucesso.");
    } catch {
      setError("Falha de rede");
    } finally {
      setSaving(false);
    }
  }

  function set(key: keyof FormState) {
    return (value: string) => setForm((prev) => ({ ...prev, [key]: value }));
  }

  if (loading) {
    return (
      <div className="p-6 text-sm text-gray-400">
        Carregando configuração do agente…
      </div>
    );
  }

  return (
    <form onSubmit={handleSave} className="p-6 max-w-2xl space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-xl font-semibold text-gray-900">
          Agente WhatsApp — Configuração
        </h1>
        <p className="mt-1 text-sm text-gray-500">
          Configure como o agente se apresenta, responde e encaminha clientes
          no WhatsApp.
        </p>
      </div>

      {/* Feedback banners */}
      {successMsg && (
        <div className="rounded-lg border border-green-200 bg-green-50 px-4 py-2 text-sm text-green-700">
          {successMsg}
        </div>
      )}
      {errorMsg && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700">
          {errorMsg}
          <button
            type="button"
            className="ml-2 underline"
            onClick={() => setError(null)}
          >
            fechar
          </button>
        </div>
      )}

      {/* ── 1. Personalidade ─────────────────────────────────────── */}
      <Section title="Personalidade do agente">
        {/* Agent name */}
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">
            Nome do agente
          </label>
          <input
            type="text"
            value={form.agentName}
            onChange={(e) => set("agentName")(e.target.value)}
            maxLength={50}
            placeholder="Ex: Ju, Max, Agente Foocci"
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
          />
          <p className="mt-1 text-xs text-gray-400">
            Nome que o agente usa para se apresentar.
          </p>
        </div>

        <RadioGroup
          label="Tom de voz"
          options={TONE_OPTIONS}
          value={form.tone}
          onChange={set("tone")}
        />

        <RadioGroup
          label="Estilo de atendimento"
          options={STYLE_OPTIONS}
          value={form.style}
          onChange={set("style")}
        />
      </Section>

      {/* ── 2. Mensagem de boas-vindas ───────────────────────────── */}
      <Section title="Mensagem de boas-vindas">
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">
            Mensagem inicial
          </label>
          <textarea
            value={form.welcomeMessage}
            onChange={(e) => set("welcomeMessage")(e.target.value)}
            rows={4}
            maxLength={1000}
            placeholder="Ex: Olá! Bem-vindo ao restaurante 🍣 O que você deseja?"
            className="w-full resize-none rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
          />
          <CharCount current={form.welcomeMessage.length} max={1000} />
        </div>
        {/* Live preview */}
        <div className="rounded-xl bg-[#dcf8c6] px-4 py-3 text-sm text-gray-800 shadow-inner max-w-xs">
          <p className="text-[11px] font-semibold text-gray-500 mb-1">
            Pré-visualização
          </p>
          <p className="whitespace-pre-wrap leading-relaxed">
            {form.welcomeMessage || "…"}
          </p>
        </div>
      </Section>

      {/* ── 3. Opções de entrada ─────────────────────────────────── */}
      <Section title="Opções de entrada">
        <p className="text-xs text-gray-500">
          Botões exibidos logo após a mensagem de boas-vindas.
        </p>
        <div className="space-y-3">
          {(
            [
              { key: "btn1Label", icon: "🛒", hint: "Inicia fluxo de pedido" },
              { key: "btn2Label", icon: "👤", hint: "Transfere para atendente" },
              { key: "btn3Label", icon: "🎁", hint: "Mostra ofertas" },
            ] as const
          ).map(({ key, icon, hint }, i) => (
            <div key={key} className="flex items-center gap-3">
              <span className="text-xl w-7 text-center">{icon}</span>
              <div className="flex-1">
                <input
                  type="text"
                  value={form[key]}
                  onChange={(e) => set(key)(e.target.value)}
                  maxLength={60}
                  placeholder={`Opção ${i + 1}`}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                />
                <p className="mt-0.5 text-xs text-gray-400">{hint}</p>
              </div>
            </div>
          ))}
        </div>
      </Section>

      {/* ── 4. Ação: Fazer pedido ────────────────────────────────── */}
      <Section title='Ação — "Fazer pedido"'>
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">
            Mensagem enviada ao iniciar pedido
          </label>
          <textarea
            value={form.orderPreMessage}
            onChange={(e) => set("orderPreMessage")(e.target.value)}
            rows={2}
            maxLength={500}
            placeholder="Ex: Ótimo! Aqui está nosso cardápio 👇"
            className="w-full resize-none rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
          />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">
            URL do cardápio web{" "}
            <span className="font-normal text-gray-400">(opcional)</span>
          </label>
          <input
            type="url"
            value={form.menuUrl}
            onChange={(e) => set("menuUrl")(e.target.value)}
            placeholder="https://seudominio.com/qr/slug"
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
          />
          <p className="mt-1 text-xs text-gray-400">
            Link enviado junto com a mensagem de pedido.
          </p>
        </div>
      </Section>

      {/* ── 5. Transferência para humano ─────────────────────────── */}
      <Section title="Transferência para atendente">
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">
            Telefone do atendente{" "}
            <span className="font-normal text-gray-400">(WhatsApp, com DDI)</span>
          </label>
          <input
            type="tel"
            value={form.handoffPhone}
            onChange={(e) => set("handoffPhone")(e.target.value)}
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
            value={form.handoffMessage}
            onChange={(e) => set("handoffMessage")(e.target.value)}
            rows={2}
            maxLength={500}
            placeholder="Ex: Vou te conectar com um atendente. Um momento! 👋"
            className="w-full resize-none rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
          />
        </div>
      </Section>

      {/* ── 6. CRM básico ────────────────────────────────────────── */}
      <Section title="CRM — Dados coletados">
        <div className="rounded-lg border border-blue-100 bg-blue-50 p-4 space-y-2">
          <p className="text-sm font-medium text-blue-800">
            O agente coleta automaticamente:
          </p>
          <ul className="space-y-1 text-sm text-blue-700">
            <li className="flex items-center gap-2">
              <span className="text-green-500 font-bold">✓</span> Nome do cliente
            </li>
            <li className="flex items-center gap-2">
              <span className="text-green-500 font-bold">✓</span> Número de telefone
            </li>
            <li className="flex items-center gap-2">
              <span className="text-green-500 font-bold">✓</span> Última interação
            </li>
          </ul>
          <p className="text-xs text-blue-500 pt-1">
            Dados ficam disponíveis na seção{" "}
            <Link
              href="/customers"
              className="underline font-medium hover:text-blue-700"
            >
              Clientes
            </Link>
            .
          </p>
        </div>
      </Section>

      {/* Save */}
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

// ── Sub-components ─────────────────────────────────────────────────────────────

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-xl border border-gray-200 bg-white p-5 space-y-4">
      <h2 className="text-sm font-semibold text-gray-700">{title}</h2>
      {children}
    </section>
  );
}

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

function CharCount({ current, max }: { current: number; max: number }) {
  const near = current > max * 0.85;
  return (
    <p
      className={`mt-0.5 text-right text-xs ${
        near ? "text-amber-500" : "text-gray-400"
      }`}
    >
      {current} / {max}
    </p>
  );
}
