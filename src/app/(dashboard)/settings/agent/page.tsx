"use client";

/**
 * /dashboard/settings/agent
 *
 * WhatsApp agent configuration panel.
 * Controls personality, welcome message, dynamic entry options, and flow settings.
 */

import { useState, useEffect, FormEvent } from "react";
import Link from "next/link";
import {
  AGENT_DEFAULTS,
  DEFAULT_MENU_OPTIONS,
  FLOW_TYPES,
  type MenuOption,
  type FlowType,
} from "@/validators/whatsapp-agent";

// ── Constants ──────────────────────────────────────────────────────────────────

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

const FLOW_CONFIG: Record<FlowType, { label: string; desc: string; icon: string }> = {
  order:      { icon: "🛒", label: "Fazer pedido",            desc: "Envia msg de pedido + link do cardápio"      },
  handoff:    { icon: "👤", label: "Falar com atendente",     desc: "Encaminha para o número configurado"         },
  menu:       { icon: "📋", label: "Ver cardápio",             desc: "Envia o link do cardápio"                    },
  promotions: { icon: "🎁", label: "Ver promoções",            desc: "O agente lista as promoções ativas"          },
  custom:     { icon: "💬", label: "Mensagem personalizada",   desc: "Envia um texto livre definido aqui"          },
  text_order: { icon: "✍️", label: "Pedido por mensagem",     desc: "Cliente digita o pedido diretamente no chat" },
  rodizio:    { icon: "🍽️", label: "Rodízio presencial",      desc: "Informa sobre o rodízio e horários"          },
  club:       { icon: "⭐", label: "Cazza Club",               desc: "Informa sobre o programa de fidelidade"      },
  submenu:    { icon: "📂", label: "Abrir submenu",           desc: "Mostra um submenu com mais opções"           },
};

// Preset chips shown at the bottom of the options list
const PRESETS: Array<{ label: string; flow: FlowType; message?: string }> = [
  { label: "Fazer pedido",        flow: "order"      },
  { label: "Falar com atendente", flow: "handoff"    },
  { label: "Ver promoções",       flow: "promotions" },
  { label: "Ver cardápio",        flow: "menu"       },
  { label: "Informações",         flow: "custom",    message: "Horário: ...\nEndereço: ..." },
];

// ── Helpers ────────────────────────────────────────────────────────────────────

function newId() {
  return `opt-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

function parseMenuOptions(raw: unknown): MenuOption[] {
  if (Array.isArray(raw) && raw.length > 0) return raw as MenuOption[];
  return DEFAULT_MENU_OPTIONS.map((o) => ({ ...o, id: newId() }));
}

// ── Form state ─────────────────────────────────────────────────────────────────

interface FormState {
  agentName:       string;
  tone:            string;
  style:           string;
  welcomeMessage:  string;
  orderPreMessage: string;
  menuUrl:         string;
  handoffPhone:    string;
  handoffMessage:  string;
}

function toForm(d: Record<string, unknown>): FormState {
  const def = AGENT_DEFAULTS;
  return {
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

const FORM_DEFAULTS: FormState = toForm({});

// ── Page component ─────────────────────────────────────────────────────────────

export default function AgentSettingsPage() {
  const [form, setForm]           = useState<FormState>(FORM_DEFAULTS);
  const [menuOptions, setOptions] = useState<MenuOption[]>(
    DEFAULT_MENU_OPTIONS.map((o) => ({ ...o, id: newId() }))
  );
  const [loading, setLoading]     = useState(true);
  const [saving, setSaving]       = useState(false);
  const [successMsg, setSuccess]  = useState<string | null>(null);
  const [errorMsg, setError]      = useState<string | null>(null);

  useEffect(() => { fetchConfig(); }, []);

  async function fetchConfig() {
    setLoading(true);
    try {
      const res = await fetch("/api/whatsapp-agent");
      if (res.ok) {
        const json = await res.json();
        setForm(toForm(json.data));
        setOptions(parseMenuOptions(json.data.menuOptions));
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
    if (menuOptions.some((o) => !o.label.trim())) {
      setError("Todas as opções precisam ter um rótulo.");
      return;
    }
    setSaving(true);
    setSuccess(null);
    setError(null);
    try {
      const res = await fetch("/api/whatsapp-agent", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          menuOptions,
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

  // ── Menu options CRUD ────────────────────────────────────────────────────────

  function addOption(preset?: typeof PRESETS[number]) {
    const opt: MenuOption = {
      id:      newId(),
      label:   preset?.label   ?? "",
      flow:    preset?.flow    ?? "custom",
      message: preset?.message ?? "",
    };
    setOptions((prev) => [...prev, opt]);
  }

  function updateOption(id: string, patch: Partial<MenuOption>) {
    setOptions((prev) =>
      prev.map((o) => (o.id === id ? { ...o, ...patch } : o))
    );
  }

  function removeOption(id: string) {
    setOptions((prev) => prev.filter((o) => o.id !== id));
  }

  function moveOption(id: string, dir: -1 | 1) {
    setOptions((prev) => {
      const idx = prev.findIndex((o) => o.id === id);
      if (idx < 0) return prev;
      const next = idx + dir;
      if (next < 0 || next >= prev.length) return prev;
      const arr = [...prev];
      [arr[idx], arr[next]] = [arr[next]!, arr[idx]!];
      return arr;
    });
  }

  function resetToDefaults() {
    setOptions(DEFAULT_MENU_OPTIONS.map((o) => ({ ...o, id: newId() })));
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
          <button type="button" className="ml-2 underline" onClick={() => setError(null)}>
            fechar
          </button>
        </div>
      )}

      {/* ── 1. Personalidade ─────────────────────────────────────── */}
      <Section title="Personalidade do agente">
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
        <RadioGroup label="Tom de voz" options={TONE_OPTIONS} value={form.tone} onChange={set("tone")} />
        <RadioGroup label="Estilo de atendimento" options={STYLE_OPTIONS} value={form.style} onChange={set("style")} />
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
          <p className="text-[11px] font-semibold text-gray-500 mb-1">Pré-visualização</p>
          <p className="whitespace-pre-wrap leading-relaxed">{form.welcomeMessage || "…"}</p>
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

      {/* ── 3. Opções de entrada ─────────────────────────────────── */}
      <Section title="Opções de entrada">
        <p className="text-xs text-gray-500">
          Botões exibidos após a mensagem de boas-vindas. Cada opção aciona um fluxo.
          Você pode editar, remover, reordenar e adicionar novas opções.
        </p>

        {/* Options list */}
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
              onChange={(patch) => updateOption(opt.id, patch)}
              onRemove={() => removeOption(opt.id)}
              onMoveUp={() => moveOption(opt.id, -1)}
              onMoveDown={() => moveOption(opt.id, 1)}
            />
          ))}
        </div>

        {/* Add controls */}
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
              {PRESETS.map((p) => (
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
              onClick={resetToDefaults}
              className="text-xs text-gray-400 underline hover:text-gray-600"
            >
              Restaurar padrões
            </button>
          )}
        </div>
      </Section>

      {/* ── 4. Fluxo: Fazer pedido ───────────────────────────────── */}
      <Section title='Fluxo — "Fazer pedido"'>
        <p className="text-xs text-gray-500">
          Ativado quando o cliente escolhe uma opção com fluxo{" "}
          <span className="font-semibold text-gray-700">Fazer pedido</span>.
        </p>
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
            Enviado junto com a mensagem acima.
          </p>
        </div>
      </Section>

      {/* ── 5. Fluxo: Transferência para humano ─────────────────── */}
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
            <Link href="/customers" className="underline font-medium hover:text-blue-700">
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

// ── OptionCard ─────────────────────────────────────────────────────────────────

function OptionCard({
  option,
  index,
  total,
  onChange,
  onRemove,
  onMoveUp,
  onMoveDown,
}: {
  option: MenuOption;
  index: number;
  total: number;
  onChange: (patch: Partial<MenuOption>) => void;
  onRemove: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
}) {
  const flow = FLOW_CONFIG[option.flow];

  return (
    <div className="rounded-xl border border-gray-200 bg-gray-50 p-3 space-y-2">
      <div className="flex items-center gap-2">
        {/* Position badge */}
        <span className="shrink-0 flex h-6 w-6 items-center justify-center rounded-full bg-gray-200 text-xs font-bold text-gray-600">
          {index + 1}
        </span>

        {/* Label input */}
        <input
          type="text"
          value={option.label}
          onChange={(e) => onChange({ label: e.target.value })}
          maxLength={60}
          placeholder="Ex: Fazer pedido"
          className="flex-1 min-w-0 rounded-lg border border-gray-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
        />

        {/* Flow selector */}
        <select
          value={option.flow}
          onChange={(e) => onChange({ flow: e.target.value as FlowType })}
          className="rounded-lg border border-gray-300 bg-white px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-brand-500"
        >
          {FLOW_TYPES.map((f) => (
            <option key={f} value={f}>
              {FLOW_CONFIG[f].icon} {FLOW_CONFIG[f].label}
            </option>
          ))}
        </select>

        {/* Reorder buttons */}
        <div className="flex flex-col gap-0.5 shrink-0">
          <button
            type="button"
            onClick={onMoveUp}
            disabled={index === 0}
            className="flex h-5 w-5 items-center justify-center rounded text-xs text-gray-400 hover:bg-gray-200 disabled:opacity-30"
            aria-label="Mover para cima"
          >
            ▲
          </button>
          <button
            type="button"
            onClick={onMoveDown}
            disabled={index === total - 1}
            className="flex h-5 w-5 items-center justify-center rounded text-xs text-gray-400 hover:bg-gray-200 disabled:opacity-30"
            aria-label="Mover para baixo"
          >
            ▼
          </button>
        </div>

        {/* Remove */}
        <button
          type="button"
          onClick={onRemove}
          className="shrink-0 flex h-7 w-7 items-center justify-center rounded-lg text-red-400 hover:bg-red-50 hover:text-red-600 transition-colors"
          aria-label="Remover opção"
        >
          ✕
        </button>
      </div>

      {/* Flow description */}
      <p className="pl-8 text-xs text-gray-500">
        {flow.icon} {flow.desc}
      </p>

      {/* Custom message textarea — only when flow = 'custom' */}
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

// ── Shared sub-components ──────────────────────────────────────────────────────

function Section({ title, children }: { title: string; children: React.ReactNode }) {
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
    <p className={`mt-0.5 text-right text-xs ${near ? "text-amber-500" : "text-gray-400"}`}>
      {current} / {max}
    </p>
  );
}
