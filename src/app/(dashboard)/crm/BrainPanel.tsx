"use client";

import { useState, useEffect } from "react";
import type { BrainSummary } from "@/services/crm/AdaptiveCRMService";

// ── Label maps ─────────────────────────────────────────────────────────────────

const STYLE_LABELS: Record<string, string> = {
  FRIENDLY:  "Amigável",
  PLAYFUL:   "Divertido",
  DIRECT:    "Direto",
  EMOTIONAL: "Emocional",
  PREMIUM:   "Premium",
};

const TONE_OPTIONS: { value: string; label: string; description: string }[] = [
  { value: "CASUAL",        label: "Casual",         description: "Prefere mensagens divertidas e amigáveis" },
  { value: "FRIENDLY",      label: "Acolhedor",       description: "Prefere mensagens amigáveis e emocionais" },
  { value: "PREMIUM_FEEL",  label: "Premium",         description: "Prefere mensagens refinadas e exclusivas" },
  { value: "SALES_FORWARD", label: "Vendas diretas",  description: "Prefere mensagens diretas e objetivas" },
];

const STYLE_COLORS: Record<string, string> = {
  FRIENDLY:  "bg-green-500",
  PLAYFUL:   "bg-purple-500",
  DIRECT:    "bg-blue-500",
  EMOTIONAL: "bg-pink-500",
  PREMIUM:   "bg-amber-500",
};

// ── Component ─────────────────────────────────────────────────────────────────

export function BrainPanel() {
  const [summary, setSummary]     = useState<BrainSummary | null>(null);
  const [loading, setLoading]     = useState(true);
  const [savingTone, setSavingTone] = useState(false);
  const [showStyles, setShowStyles] = useState(false);

  useEffect(() => {
    fetch("/api/crm/brain")
      .then((r) => r.json())
      .then((j) => { if (j.data) setSummary(j.data); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  async function handleToneChange(tone: string) {
    setSavingTone(true);
    const res = await fetch("/api/crm/brain/tone", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tone }),
    });
    if (res.ok) {
      setSummary((prev) => prev ? { ...prev, toneProfile: tone } : prev);
    }
    setSavingTone(false);
  }

  if (loading) {
    return (
      <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
        <div className="animate-pulse space-y-3">
          <div className="h-4 w-32 rounded bg-gray-200" />
          <div className="h-3 w-full rounded bg-gray-100" />
          <div className="h-3 w-4/5 rounded bg-gray-100" />
        </div>
      </div>
    );
  }

  const hasData = summary && summary.totalSent > 0;

  return (
    <div className="rounded-2xl border border-brand-100 bg-gradient-to-br from-brand-50 to-white p-5 shadow-sm space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-bold text-gray-900 flex items-center gap-2">
            <span>🧠</span> Inteligência CRM
          </p>
          <p className="text-xs text-gray-500 mt-0.5">
            {hasData
              ? `${summary.totalSent} ação${summary.totalSent !== 1 ? "ões" : ""} rastreada${summary.totalSent !== 1 ? "s" : ""} nos últimos 30 dias`
              : "Nenhuma ação registrada ainda — comece enviando mensagens"}
          </p>
        </div>
        {hasData && (
          <button
            onClick={() => setShowStyles(!showStyles)}
            className="text-xs font-medium text-brand-600 hover:text-brand-700 transition-colors"
          >
            {showStyles ? "Ocultar" : "Ver detalhes"}
          </button>
        )}
      </div>

      {/* Key metrics */}
      {hasData && (
        <div className="grid grid-cols-3 gap-3">
          <div className="rounded-xl bg-white border border-gray-100 p-3 text-center">
            <p className="text-lg font-bold text-gray-900">{summary.totalSent}</p>
            <p className="text-[10px] text-gray-500 mt-0.5">Enviadas</p>
          </div>
          <div className="rounded-xl bg-white border border-gray-100 p-3 text-center">
            <p className="text-lg font-bold text-green-600">{summary.totalConverted}</p>
            <p className="text-[10px] text-gray-500 mt-0.5">Convertidas</p>
          </div>
          <div className="rounded-xl bg-white border border-brand-100 p-3 text-center bg-brand-50">
            <p className="text-lg font-bold text-brand-700">
              {(summary.overallRate * 100).toFixed(0)}%
            </p>
            <p className="text-[10px] text-brand-600 mt-0.5">Taxa geral</p>
          </div>
        </div>
      )}

      {/* Style performance breakdown */}
      {hasData && showStyles && (
        <div className="space-y-2">
          <p className="text-xs font-semibold text-gray-600">Desempenho por estilo</p>
          {summary.styles.map((s) => (
            <div key={s.style}>
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-medium text-gray-700">
                  {STYLE_LABELS[s.style] ?? s.style}
                  {summary.topStyle === s.style && (
                    <span className="ml-1.5 rounded-full bg-green-100 px-1.5 py-0.5 text-[9px] font-bold text-green-700">
                      TOP
                    </span>
                  )}
                </span>
                <div className="flex items-center gap-2 text-[10px] text-gray-500">
                  <span>{s.sent} enviadas</span>
                  <span className="font-semibold text-gray-700">
                    {(s.conversionRate * 100).toFixed(0)}% conv.
                  </span>
                  <span className="font-bold text-brand-600">
                    {(s.weight * 100).toFixed(0)}% peso
                  </span>
                </div>
              </div>
              {/* Weight bar */}
              <div className="h-1.5 w-full rounded-full bg-gray-100">
                <div
                  className={`h-1.5 rounded-full ${STYLE_COLORS[s.style] ?? "bg-gray-400"} transition-all`}
                  style={{ width: `${(s.weight * 100).toFixed(1)}%` }}
                />
              </div>
            </div>
          ))}
          <p className="text-[10px] text-gray-400 pt-1">
            Peso = probabilidade de usar este estilo na próxima mensagem.
            Atualiza automaticamente a cada 10 ações ou conversão.
          </p>
        </div>
      )}

      {/* No data state */}
      {!hasData && (
        <div className="rounded-xl bg-white border border-dashed border-gray-200 p-4 text-center">
          <p className="text-xs text-gray-500">
            Quando você registrar envios pelo CRM, o sistema aprenderá quais estilos
            convertem mais e priorizará automaticamente os melhores.
          </p>
        </div>
      )}

      {/* Tone profile selector */}
      <div>
        <p className="text-xs font-semibold text-gray-700 mb-2">
          Personalidade do restaurante
        </p>
        <div className="grid grid-cols-2 gap-2">
          {TONE_OPTIONS.map((opt) => {
            const active = (summary?.toneProfile ?? "FRIENDLY") === opt.value;
            return (
              <button
                key={opt.value}
                type="button"
                disabled={savingTone}
                onClick={() => handleToneChange(opt.value)}
                className={`rounded-xl border-2 p-3 text-left transition-all ${
                  active
                    ? "border-brand-500 bg-brand-50"
                    : "border-gray-200 bg-white hover:border-gray-300"
                } disabled:opacity-60`}
              >
                <p className={`text-xs font-bold ${active ? "text-brand-700" : "text-gray-700"}`}>
                  {opt.label}
                </p>
                <p className="text-[10px] text-gray-500 mt-0.5 leading-relaxed">
                  {opt.description}
                </p>
              </button>
            );
          })}
        </div>
        <p className="mt-2 text-[10px] text-gray-400">
          A personalidade ajusta os pesos dos estilos de mensagem para se alinhar
          com a identidade do seu restaurante.
        </p>
      </div>
    </div>
  );
}
