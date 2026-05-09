"use client";

import { useState, useEffect, useCallback, type FormEvent } from "react";
import {
  apiFetch, Field, INPUT, SELECT, Feedback, SaveButton, PageCard, SectionHeading,
} from "../_shared";

// ── Types ──────────────────────────────────────────────────────────────────────

type EvoStatus = "loading" | "configured" | "not_configured";

type AgentMode = "RECEPTIONIST_ONLY" | "HUMAN_ASSISTED" | "AI_ORDERING_EXPERIMENTAL";

type Form = {
  agentMode:      AgentMode;
  welcomeMessage: string;
  menuUrl:        string;
  handoffMessage: string;
};

const DEFAULTS: Form = {
  agentMode:      "RECEPTIONIST_ONLY",
  welcomeMessage: "Olá! Bem-vindo! 😊 O que você deseja?",
  menuUrl:        "",
  handoffMessage: "Vou te conectar com um atendente. Um momento! 👋",
};

// ── Mode descriptors ───────────────────────────────────────────────────────────

const MODE_OPTIONS: { value: AgentMode; label: string; desc: string }[] = [
  {
    value: "RECEPTIONIST_ONLY",
    label: "Recepcionista (padrão)",
    desc:  "Saúda o cliente, responde dúvidas básicas e envia o link do cardápio. Sem IA de pedidos.",
  },
  {
    value: "HUMAN_ASSISTED",
    label: "Humano Assistido",
    desc:  "Igual ao recepcionista, mas escalona para atendente humano com mais frequência.",
  },
  {
    value: "AI_ORDERING_EXPERIMENTAL",
    label: "IA de Pedidos (experimental)",
    desc:  "Agente completo: entende pedidos, monta carrinho e finaliza via WhatsApp. Use com cautela.",
  },
];

// ── Page ───────────────────────────────────────────────────────────────────────

export default function WhatsAppSettingsPage() {
  const [form, setForm]         = useState<Form>(DEFAULTS);
  const [loading, setLoading]   = useState(true);
  const [saving, setSaving]     = useState(false);
  const [success, setSuccess]   = useState<string | null>(null);
  const [error, setError]       = useState<string | null>(null);
  const [evoStatus, setEvoStatus] = useState<EvoStatus>("loading");

  const load = useCallback(async () => {
    setLoading(true);
    const [agentRes, evoRes] = await Promise.all([
      apiFetch("/api/whatsapp-agent"),
      apiFetch("/api/evolution/config"),
    ]);
    if (agentRes.ok && agentRes.data) {
      setForm({
        agentMode:      agentRes.data.agentMode      ?? "RECEPTIONIST_ONLY",
        welcomeMessage: agentRes.data.welcomeMessage ?? DEFAULTS.welcomeMessage,
        menuUrl:        agentRes.data.menuUrl        ?? "",
        handoffMessage: agentRes.data.handoffMessage ?? DEFAULTS.handoffMessage,
      });
    }
    setEvoStatus(evoRes.ok && evoRes.data?.isActive ? "configured" : "not_configured");
    setLoading(false);
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setSuccess(null);
    setError(null);

    const res = await apiFetch("/api/whatsapp-agent", "PUT", {
      agentMode:      form.agentMode,
      welcomeMessage: form.welcomeMessage,
      menuUrl:        form.menuUrl || null,
      handoffMessage: form.handoffMessage,
    });

    setSaving(false);
    if (res.ok) {
      setSuccess("Configurações salvas com sucesso.");
    } else {
      setError(res.data?.error ?? "Erro ao salvar configurações.");
    }
  }

  function set<K extends keyof Form>(key: K, value: Form[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  if (loading) {
    return (
      <div className="space-y-4">
        {[1, 2].map((i) => (
          <div key={i} className="h-36 animate-pulse rounded-2xl bg-gray-100" />
        ))}
      </div>
    );
  }

  return (
    <form onSubmit={(e) => void handleSubmit(e)} className="space-y-6">

      {/* ── Status da integração Evolution ─────────────────────────── */}
      {evoStatus !== "loading" && (
        <div className={`flex items-center gap-3 rounded-xl border px-4 py-3 ${
          evoStatus === "configured"
            ? "border-green-200 bg-green-50"
            : "border-amber-200 bg-amber-50"
        }`}>
          <span className="text-lg shrink-0">{evoStatus === "configured" ? "✅" : "⚠️"}</span>
          <div>
            <p className={`text-sm font-semibold ${evoStatus === "configured" ? "text-green-800" : "text-amber-800"}`}>
              {evoStatus === "configured" ? "Evolution API conectada" : "Evolution API não configurada"}
            </p>
            <p className={`text-xs mt-0.5 ${evoStatus === "configured" ? "text-green-600" : "text-amber-600"}`}>
              {evoStatus === "configured"
                ? "WhatsApp ativo — mensagens serão enviadas e recebidas normalmente."
                : "Sem integração ativa, as mensagens automáticas não serão disparadas. Configure em Integrações > WhatsApp Business."}
            </p>
          </div>
        </div>
      )}

      {/* ── Modo do agente ─────────────────────────────────────────── */}
      <PageCard>
        <SectionHeading
          title="Modo do Agente WhatsApp"
          subtitle="Define o comportamento do assistente ao receber mensagens no WhatsApp."
        />

        <div className="space-y-3">
          {MODE_OPTIONS.map((opt) => (
            <label
              key={opt.value}
              className={`flex cursor-pointer items-start gap-3 rounded-xl border p-4 transition ${
                form.agentMode === opt.value
                  ? "border-indigo-400 bg-indigo-50"
                  : "border-gray-200 bg-white hover:border-gray-300"
              }`}
            >
              <input
                type="radio"
                name="agentMode"
                value={opt.value}
                checked={form.agentMode === opt.value}
                onChange={() => set("agentMode", opt.value)}
                className="mt-0.5 accent-indigo-600"
              />
              <div>
                <p className="text-sm font-semibold text-gray-800">{opt.label}</p>
                <p className="mt-0.5 text-xs text-gray-500">{opt.desc}</p>
              </div>
            </label>
          ))}
        </div>

        {form.agentMode === "AI_ORDERING_EXPERIMENTAL" && (
          <div className="mt-4 flex gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4">
            <span className="text-lg">⚠️</span>
            <div>
              <p className="text-sm font-semibold text-amber-800">Modo experimental ativo</p>
              <p className="mt-0.5 text-xs text-amber-700">
                O agente de IA de pedidos ainda está em fase experimental. Erros de interpretação podem
                ocorrer. Monitore os pedidos com atenção e reporte anomalias à equipe.
              </p>
            </div>
          </div>
        )}
      </PageCard>

      {/* ── Mensagens ──────────────────────────────────────────────── */}
      <PageCard>
        <SectionHeading
          title="Mensagens do Agente"
          subtitle="Personalize as mensagens enviadas automaticamente pelo assistente."
        />

        <div className="space-y-5">
          <Field
            label="Mensagem de boas-vindas"
            hint="Enviada quando o cliente entra em contato pela primeira vez."
          >
            <textarea
              value={form.welcomeMessage}
              onChange={(e) => set("welcomeMessage", e.target.value)}
              rows={3}
              maxLength={1000}
              className={`${INPUT} resize-none`}
              placeholder="Olá! Bem-vindo! 😊 O que você deseja?"
            />
          </Field>

          <Field
            label="Mensagem de transferência para atendente"
            hint="Exibida quando o cliente é encaminhado para atendimento humano."
          >
            <textarea
              value={form.handoffMessage}
              onChange={(e) => set("handoffMessage", e.target.value)}
              rows={2}
              maxLength={500}
              className={`${INPUT} resize-none`}
              placeholder="Vou te conectar com um atendente. Um momento! 👋"
            />
          </Field>

          <Field
            label="URL do cardápio (opcional)"
            hint="Link enviado quando o cliente pede para ver o cardápio."
          >
            <input
              type="url"
              value={form.menuUrl}
              onChange={(e) => set("menuUrl", e.target.value)}
              className={INPUT}
              placeholder="https://seu-dominio.com/pedido/meu-restaurante"
            />
          </Field>
        </div>
      </PageCard>

      {/* ── Feedback + save ────────────────────────────────────────── */}
      <Feedback
        success={success}
        error={error}
        onDismiss={() => { setSuccess(null); setError(null); }}
      />
      <SaveButton saving={saving} label="Salvar configurações" />
    </form>
  );
}
