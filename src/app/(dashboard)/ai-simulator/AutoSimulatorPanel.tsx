"use client";

import { useState, useEffect, useCallback } from "react";
import type { FailurePattern } from "@/services/ai/FailureAnalyzer";

// ─── types ────────────────────────────────────────────────────

interface SimRunRecord {
  id:                string;
  ranAt:             string;
  scenarioCount:     number;
  overallScore:      number;
  conversionRate:    number;
  attachRateDrink:   number;
  attachRateDessert: number;
  insight:           string;
  suggestedPrompt:   string;
  triggeredBy:       string;
  analysis:          FailurePattern;
}

interface AutoConfig {
  enabled:         boolean;
  intervalMinutes: number;
  scenarioCount:   number;
  lastRunAt:       string | null;
}

// ─── impact badge ─────────────────────────────────────────────

const IMPACT_COLORS: Record<string, string> = {
  high:   "bg-red-100 text-red-700",
  medium: "bg-orange-100 text-orange-700",
  low:    "bg-green-100 text-green-700",
  none:   "bg-gray-100 text-gray-500",
};

const FAILURE_LABELS: Record<string, string> = {
  low_conversion:       "Conversão baixa",
  upsell_not_happening: "Upsell ausente",
  early_checkout_drop:  "Abandono antes do checkout",
  too_many_questions:   "Perguntas em excesso",
  repetition:           "Sugestões repetidas",
  tool_errors:          "Erros de ferramenta",
  drink_not_offered:    "Bebida não oferecida",
  dessert_not_offered:  "Sobremesa não oferecida",
  dietary_violation:    "Violação alimentar",
  none:                 "Sem problemas detectados",
};

function ImpactBadge({ pattern }: { pattern: FailurePattern }) {
  const colorClass = IMPACT_COLORS[pattern.impact] ?? IMPACT_COLORS.none;
  const label      = FAILURE_LABELS[pattern.type]  ?? pattern.type;
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${colorClass}`}>
      {pattern.type !== "none" && <span>{pattern.frequency}</span>}
      {label}
    </span>
  );
}

// ─── metric card ──────────────────────────────────────────────

function MetricCard({ label, value, warn }: { label: string; value: string; warn?: boolean }) {
  return (
    <div className="bg-gray-50 rounded-lg px-3 py-2 text-center">
      <p className="text-xs text-gray-400 mb-0.5">{label}</p>
      <p className={`text-lg font-bold ${warn ? "text-orange-500" : "text-gray-800"}`}>{value}</p>
    </div>
  );
}

// ─── copy button ──────────────────────────────────────────────

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };
  return (
    <button
      onClick={copy}
      className="px-3 py-1.5 text-xs font-medium bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg transition-colors"
    >
      {copied ? "✓ Copiado!" : "Copiar sugestão"}
    </button>
  );
}

// ─── history row ──────────────────────────────────────────────

function HistoryRow({ run, onClick, isSelected }: {
  run:        SimRunRecord;
  onClick:    () => void;
  isSelected: boolean;
}) {
  const score = Math.round(run.overallScore * 100);
  const scoreColor = score >= 75 ? "text-green-600" : score >= 50 ? "text-orange-500" : "text-red-600";
  return (
    <button
      onClick={onClick}
      className={`w-full text-left flex items-center gap-3 px-3 py-2 rounded-lg transition-colors ${
        isSelected ? "bg-blue-50 ring-1 ring-blue-200" : "hover:bg-gray-50"
      }`}
    >
      <div className="flex-1 min-w-0">
        <p className="text-xs text-gray-400">
          {new Date(run.ranAt).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}
          {run.triggeredBy === "manual" && (
            <span className="ml-1.5 px-1.5 py-0.5 bg-blue-100 text-blue-600 rounded text-[10px] font-medium">manual</span>
          )}
        </p>
        <p className="text-xs text-gray-600 truncate mt-0.5">
          {FAILURE_LABELS[run.analysis?.type] ?? "—"}
        </p>
      </div>
      <span className={`text-sm font-bold ${scoreColor} shrink-0`}>{score}%</span>
    </button>
  );
}

// ─── run detail panel ─────────────────────────────────────────

function RunDetail({ run }: { run: SimRunRecord }) {
  const score = Math.round(run.overallScore * 100);
  const scoreColor = score >= 75 ? "text-green-600" : score >= 50 ? "text-orange-500" : "text-red-600";

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs text-gray-400">
            {new Date(run.ranAt).toLocaleString("pt-BR")} · {run.scenarioCount} cenários
          </p>
          <ImpactBadge pattern={run.analysis} />
        </div>
        <p className={`text-3xl font-bold ${scoreColor}`}>{score}<span className="text-base font-normal text-gray-400">%</span></p>
      </div>

      <div className="grid grid-cols-3 gap-2">
        <MetricCard label="Conversão"  value={`${Math.round(run.conversionRate * 100)}%`}  warn={run.conversionRate < 0.5} />
        <MetricCard label="Com bebida" value={`${Math.round(run.attachRateDrink * 100)}%`}  warn={run.attachRateDrink < 0.4} />
        <MetricCard label="Com sobrem." value={`${Math.round(run.attachRateDessert * 100)}%`} warn={run.attachRateDessert < 0.3} />
      </div>

      {run.analysis.type !== "none" && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 space-y-1">
          <p className="text-xs font-semibold text-amber-800">Problema principal</p>
          <p className="text-sm text-amber-700">{run.analysis.mainIssue}</p>
        </div>
      )}

      <div className="space-y-1">
        <p className="text-xs font-semibold text-gray-700">Insight</p>
        <p className="text-sm text-gray-600 leading-relaxed">{run.insight}</p>
      </div>

      {run.analysis.type !== "none" && run.suggestedPrompt && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold text-gray-700">Sugestão de prompt</p>
            <CopyButton text={run.suggestedPrompt} />
          </div>
          <pre className="text-[11px] font-mono text-gray-600 bg-gray-50 border border-gray-200 rounded-lg p-3 whitespace-pre-wrap overflow-x-auto max-h-52 leading-relaxed">
            {run.suggestedPrompt}
          </pre>
        </div>
      )}
    </div>
  );
}

// ─── main panel ───────────────────────────────────────────────

export function AutoSimulatorPanel() {
  const [config,       setConfig]       = useState<AutoConfig | null>(null);
  const [history,      setHistory]      = useState<SimRunRecord[]>([]);
  const [selectedRun,  setSelectedRun]  = useState<SimRunRecord | null>(null);
  const [loadingCfg,   setLoadingCfg]   = useState(true);
  const [loadingHist,  setLoadingHist]  = useState(true);
  const [running,      setRunning]      = useState(false);
  const [runErr,       setRunErr]       = useState("");
  const [savingCfg,    setSavingCfg]    = useState(false);

  const fetchConfig = useCallback(async () => {
    try {
      const res = await fetch("/api/auto-simulator/config");
      if (!res.ok) return;
      const json = await res.json() as { success: boolean; data: AutoConfig };
      if (json.success) setConfig(json.data);
    } finally {
      setLoadingCfg(false);
    }
  }, []);

  const fetchHistory = useCallback(async () => {
    setLoadingHist(true);
    try {
      const res = await fetch("/api/auto-simulator/history");
      if (!res.ok) return;
      const json = await res.json() as { success: boolean; data: SimRunRecord[] };
      if (json.success) {
        setHistory(json.data);
        if (!selectedRun && json.data.length > 0) setSelectedRun(json.data[0]!);
      }
    } finally {
      setLoadingHist(false);
    }
  }, [selectedRun]);

  useEffect(() => {
    void fetchConfig();
    void fetchHistory();
  }, []);

  const patchConfig = useCallback(async (patch: Partial<AutoConfig>) => {
    setSavingCfg(true);
    try {
      const res = await fetch("/api/auto-simulator/config", {
        method:  "PATCH",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify(patch),
      });
      const json = await res.json() as { success: boolean; data: AutoConfig };
      if (json.success) setConfig(json.data);
    } finally {
      setSavingCfg(false);
    }
  }, []);

  const runNow = useCallback(async () => {
    setRunning(true);
    setRunErr("");
    try {
      const res = await fetch("/api/auto-simulator/run", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ scenarioCount: config?.scenarioCount ?? 10 }),
      });
      if (!res.ok) { setRunErr(`HTTP ${res.status}`); return; }
      const json = await res.json() as { success: boolean; data: SimRunRecord };
      if (json.success) {
        setHistory((prev) => [json.data, ...prev].slice(0, 20));
        setSelectedRun(json.data);
      }
    } catch (err) {
      setRunErr(String(err));
    } finally {
      setRunning(false);
    }
  }, [config]);

  if (loadingCfg) {
    return (
      <div className="flex items-center justify-center py-16 text-gray-400 text-sm">
        <span className="inline-block w-4 h-4 border-2 border-gray-300 border-t-blue-500 rounded-full animate-spin mr-2" />
        Carregando...
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* ── Config bar ─────────────────────────────────────────── */}
      <div className="bg-white border border-gray-200 rounded-xl p-4 flex flex-wrap items-center gap-4">
        {/* Enable toggle */}
        <label className="flex items-center gap-2 cursor-pointer select-none">
          <button
            role="switch"
            aria-checked={config?.enabled ?? false}
            disabled={savingCfg}
            onClick={() => void patchConfig({ enabled: !(config?.enabled ?? false) })}
            className={`relative inline-flex w-10 h-5.5 rounded-full transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-1
              ${config?.enabled ? "bg-blue-600" : "bg-gray-300"} disabled:opacity-50`}
          >
            <span
              className={`pointer-events-none inline-block h-4 w-4 rounded-full bg-white shadow transition-transform duration-200 self-center mx-0.5
                ${config?.enabled ? "translate-x-5" : "translate-x-0"}`}
            />
          </button>
          <span className="text-sm font-medium text-gray-700">
            {config?.enabled ? "Agendamento ativo" : "Agendamento inativo"}
          </span>
        </label>

        {/* Interval */}
        <label className="flex items-center gap-2 text-sm text-gray-600">
          A cada
          <select
            value={config?.intervalMinutes ?? 60}
            disabled={savingCfg || !(config?.enabled)}
            onChange={(e) => void patchConfig({ intervalMinutes: Number(e.target.value) })}
            className="px-2 py-1 border border-gray-200 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-40"
          >
            {[15, 30, 60, 120, 240].map((m) => (
              <option key={m} value={m}>{m} min</option>
            ))}
          </select>
        </label>

        {/* Scenario count */}
        <label className="flex items-center gap-2 text-sm text-gray-600">
          Cenários:
          <select
            value={config?.scenarioCount ?? 10}
            disabled={savingCfg}
            onChange={(e) => void patchConfig({ scenarioCount: Number(e.target.value) })}
            className="px-2 py-1 border border-gray-200 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-40"
          >
            {[5, 10, 20].map((n) => (
              <option key={n} value={n}>{n}</option>
            ))}
          </select>
        </label>

        {config?.lastRunAt && (
          <p className="text-xs text-gray-400 ml-auto">
            Última execução: {new Date(config.lastRunAt).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}
          </p>
        )}

        {/* Run now */}
        <button
          onClick={runNow}
          disabled={running}
          className="px-4 py-2 bg-blue-600 text-white text-sm font-semibold rounded-lg hover:bg-blue-700
                     disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2 ml-auto"
        >
          {running ? (
            <><span className="inline-block w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />Executando...</>
          ) : "▶ Rodar agora"}
        </button>
      </div>

      {runErr && (
        <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{runErr}</p>
      )}

      {/* ── Safety note ─────────────────────────────────────────── */}
      <div className="flex gap-2 items-start bg-blue-50 border border-blue-200 rounded-lg px-4 py-3">
        <span className="text-blue-500 text-base shrink-0">ℹ</span>
        <p className="text-xs text-blue-700 leading-relaxed">
          <strong>Modo seguro:</strong> O auto-simulador apenas analisa o comportamento da IA e gera sugestões.
          Nenhuma alteração é aplicada automaticamente — copie o prompt sugerido e cole manualmente nas configurações de IA.
        </p>
      </div>

      {/* ── Main content ──────────────────────────────────────────── */}
      {loadingHist ? (
        <div className="flex items-center justify-center py-12 text-gray-400 text-sm">
          <span className="inline-block w-4 h-4 border-2 border-gray-300 border-t-blue-500 rounded-full animate-spin mr-2" />
          Carregando histórico...
        </div>
      ) : history.length === 0 ? (
        <div className="text-center py-16 space-y-2">
          <p className="text-gray-500 text-sm font-medium">Nenhuma execução ainda</p>
          <p className="text-gray-400 text-xs">Clique em "Rodar agora" para iniciar a primeira simulação automática.</p>
        </div>
      ) : (
        <div className="grid grid-cols-[220px_1fr] gap-4 min-h-[400px]">
          {/* ── History sidebar ───────────────────────────────────── */}
          <div className="bg-white border border-gray-200 rounded-xl p-2 overflow-y-auto max-h-[600px] space-y-0.5">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide px-3 py-1.5">Histórico</p>
            {history.map((run) => (
              <HistoryRow
                key={run.id}
                run={run}
                isSelected={selectedRun?.id === run.id}
                onClick={() => setSelectedRun(run)}
              />
            ))}
          </div>

          {/* ── Run detail ───────────────────────────────────────── */}
          <div className="bg-white border border-gray-200 rounded-xl p-5">
            {selectedRun ? (
              <RunDetail run={selectedRun} />
            ) : (
              <p className="text-gray-400 text-sm text-center py-12">Selecione uma execução no histórico</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
