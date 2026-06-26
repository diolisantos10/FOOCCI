"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import type { FailurePattern } from "@/services/ai/FailureAnalyzer";

// ─── types ────────────────────────────────────────────────────────────────────

type SimulatorStatus = "IDLE" | "RUNNING" | "SCHEDULED" | "PAUSED" | "ERROR";

interface StatusResponse {
  status:    SimulatorStatus;
  isRunning: boolean;
  lastRunAt: string | null;
  nextRunAt: string | null;
  progress:  { current: number; total: number; pct: number; scenarioName: string } | null;
  lastError: string | null;
}

interface AutoConfig {
  enabled:         boolean;
  intervalMinutes: number;
  scenarioCount:   number;
  lastRunAt:       string | null;
}

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

// ─── constants ────────────────────────────────────────────────────────────────

const STATUS_META: Record<SimulatorStatus, { label: string; dot: string; badge: string }> = {
  IDLE:      { label: "Inativo",          dot: "bg-muted",  badge: "bg-[#F4F4F2] text-ink2"   },
  RUNNING:   { label: "Rodando agora",    dot: "bg-blue-500",  badge: "bg-blue-100 text-blue-700"   },
  SCHEDULED: { label: "Agendado",         dot: "bg-green-500", badge: "bg-green-100 text-green-700" },
  PAUSED:    { label: "Pausado",          dot: "bg-amber-400", badge: "bg-amber-100 text-amber-700" },
  ERROR:     { label: "Erro na execução", dot: "bg-red-500",   badge: "bg-red-100 text-red-700"     },
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

const IMPACT_COLORS: Record<string, string> = {
  high:   "bg-red-100 text-red-700",
  medium: "bg-brand-100 text-brand-700",
  low:    "bg-green-100 text-green-700",
  none:   "bg-[#F4F4F2] text-muted",
};

function fmtTime(iso: string) {
  return new Date(iso).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}

// ─── sub-components ───────────────────────────────────────────────────────────

function StatusDot({ status }: { status: SimulatorStatus }) {
  const { dot } = STATUS_META[status];
  return (
    <span className="relative flex h-3 w-3 shrink-0">
      {status === "RUNNING" && (
        <span className={`animate-ping absolute inline-flex h-full w-full rounded-full ${dot} opacity-75`} />
      )}
      <span className={`relative inline-flex rounded-full h-3 w-3 ${dot}`} />
    </span>
  );
}

function ImpactBadge({ pattern }: { pattern: FailurePattern }) {
  const colorClass = IMPACT_COLORS[pattern.impact] ?? IMPACT_COLORS.none;
  const label      = FAILURE_LABELS[pattern.type] ?? pattern.type;
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${colorClass}`}>
      {pattern.type !== "none" && <span>{pattern.frequency}</span>}
      {label}
    </span>
  );
}

function MetricCard({ label, value, warn }: { label: string; value: string; warn?: boolean }) {
  return (
    <div className="bg-[#FAFAF8] rounded-lg px-3 py-2 text-center">
      <p className="text-xs text-muted mb-0.5">{label}</p>
      <p className={`text-lg font-bold ${warn ? "text-brand-600" : "text-ink"}`}>{value}</p>
    </div>
  );
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={() => {
        void navigator.clipboard.writeText(text).then(() => {
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
        });
      }}
      className="px-3 py-1.5 text-xs font-medium bg-[#F4F4F2] hover:bg-line2 text-ink2 rounded-lg transition-colors"
    >
      {copied ? "✓ Copiado!" : "Copiar sugestão"}
    </button>
  );
}

function HistoryRow({ run, isSelected, onClick }: {
  run: SimRunRecord; isSelected: boolean; onClick: () => void;
}) {
  const score = Math.round(run.overallScore * 100);
  const scoreColor = score >= 75 ? "text-green-600" : score >= 50 ? "text-brand-600" : "text-red-600";
  return (
    <button
      onClick={onClick}
      className={`w-full text-left flex items-center gap-3 px-3 py-2 rounded-lg transition-colors ${
        isSelected ? "bg-blue-50 ring-1 ring-blue-200" : "hover:bg-[#FAFAF8]"
      }`}
    >
      <div className="flex-1 min-w-0">
        <p className="text-xs text-muted">
          {fmtTime(run.ranAt)}
          {run.triggeredBy === "manual" && (
            <span className="ml-1.5 px-1.5 py-0.5 bg-blue-100 text-blue-600 rounded text-[10px] font-medium">manual</span>
          )}
        </p>
        <p className="text-xs text-ink2 truncate mt-0.5">
          {FAILURE_LABELS[run.analysis?.type] ?? "—"}
        </p>
      </div>
      <span className={`text-sm font-bold ${scoreColor} shrink-0`}>{score}%</span>
    </button>
  );
}

function RunDetail({ run }: { run: SimRunRecord }) {
  const score = Math.round(run.overallScore * 100);
  const scoreColor = score >= 75 ? "text-green-600" : score >= 50 ? "text-brand-600" : "text-red-600";
  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs text-muted">{fmtTime(run.ranAt)} · {run.scenarioCount} cenários</p>
          <ImpactBadge pattern={run.analysis} />
        </div>
        <p className={`text-3xl font-bold ${scoreColor}`}>
          {score}<span className="text-base font-normal text-muted">%</span>
        </p>
      </div>

      <div className="grid grid-cols-3 gap-2">
        <MetricCard label="Conversão"   value={`${Math.round(run.conversionRate * 100)}%`}    warn={run.conversionRate < 0.5} />
        <MetricCard label="Com bebida"  value={`${Math.round(run.attachRateDrink * 100)}%`}   warn={run.attachRateDrink < 0.4} />
        <MetricCard label="Com sobrem." value={`${Math.round(run.attachRateDessert * 100)}%`} warn={run.attachRateDessert < 0.3} />
      </div>

      {run.analysis.type !== "none" && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 space-y-1">
          <p className="text-xs font-semibold text-amber-800">Problema principal</p>
          <p className="text-sm text-amber-700">{run.analysis.mainIssue}</p>
        </div>
      )}

      <div className="space-y-1">
        <p className="text-xs font-semibold text-ink2">Insight</p>
        <p className="text-sm text-ink2 leading-relaxed">{run.insight}</p>
      </div>

      {run.analysis.type !== "none" && run.suggestedPrompt && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold text-ink2">Sugestão de prompt</p>
            <CopyButton text={run.suggestedPrompt} />
          </div>
          <pre className="text-[11px] font-mono text-ink2 bg-[#FAFAF8] border border-line2 rounded-lg p-3 whitespace-pre-wrap overflow-x-auto max-h-52 leading-relaxed">
            {run.suggestedPrompt}
          </pre>
        </div>
      )}
    </div>
  );
}

// ─── main panel ───────────────────────────────────────────────────────────────

export function AutoSimulatorPanel() {
  const [status,      setStatus]      = useState<StatusResponse | null>(null);
  const [config,      setConfig]      = useState<AutoConfig | null>(null);
  const [history,     setHistory]     = useState<SimRunRecord[]>([]);
  const [selectedRun, setSelectedRun] = useState<SimRunRecord | null>(null);
  const [savingCfg,   setSavingCfg]   = useState(false);
  const [actionErr,   setActionErr]   = useState("");
  const [initialLoad, setInitialLoad] = useState(true);

  const wasRunningRef = useRef(false);

  // ── Data fetchers ──────────────────────────────────────────────────────────

  const refreshHistory = useCallback(async () => {
    const res  = await fetch("/api/auto-simulator/history");
    const json = await res.json() as { success: boolean; data: SimRunRecord[] };
    if (!json.success) return;
    setHistory(json.data);
    setSelectedRun((prev) => {
      if (prev) return prev; // keep selection
      return json.data[0] ?? null;
    });
  }, []);

  const refreshConfig = useCallback(async () => {
    const res  = await fetch("/api/auto-simulator/config");
    const json = await res.json() as { success: boolean; data: AutoConfig };
    if (json.success) setConfig(json.data);
  }, []);

  // ── Status poll (every 5 s) ────────────────────────────────────────────────

  useEffect(() => {
    let alive = true;

    const poll = async () => {
      try {
        const res  = await fetch("/api/auto-simulator/status");
        if (!res.ok || !alive) return;
        const json = await res.json() as { success: boolean; data: StatusResponse };
        if (!json.success || !alive) return;

        setStatus(json.data);

        const nowRunning = json.data.isRunning;
        if (wasRunningRef.current && !nowRunning) {
          // Run just finished — refresh config (lastRunAt) and history (new record)
          void refreshConfig();
          void refreshHistory();
        }
        wasRunningRef.current = nowRunning;
      } catch { /* ignore network errors */ }
    };

    // Initial data load
    const boot = async () => {
      await Promise.all([poll(), refreshConfig(), refreshHistory()]);
      if (alive) setInitialLoad(false);
    };
    void boot();

    const id = setInterval(() => void poll(), 5_000);
    return () => { alive = false; clearInterval(id); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Config patch ───────────────────────────────────────────────────────────

  const patchConfig = useCallback(async (patch: Partial<AutoConfig>) => {
    setSavingCfg(true);
    try {
      const res  = await fetch("/api/auto-simulator/config", {
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

  // ── Action handlers ────────────────────────────────────────────────────────

  const doAction = useCallback(async (endpoint: string) => {
    setActionErr("");
    try {
      const res = await fetch(endpoint, { method: "POST" });
      if (!res.ok) { setActionErr(`Erro HTTP ${res.status}`); return; }
      await refreshConfig();
    } catch (err) {
      setActionErr(String(err));
    }
  }, [refreshConfig]);

  const runNow = useCallback(async () => {
    setActionErr("");
    const res  = await fetch("/api/auto-simulator/run", {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ scenarioCount: config?.scenarioCount ?? 10 }),
    });
    const json = await res.json() as { success: boolean; data: { queued: boolean; reason?: string } };
    if (!json.success || !json.data.queued) {
      setActionErr(
        json.data?.reason === "already_running"
          ? "Simulação já em andamento"
          : `Erro HTTP ${res.status}`,
      );
    }
    // polling effect detects start automatically via next /status tick
  }, [config]);

  // ── Derived state ──────────────────────────────────────────────────────────

  const simStatus  = status?.status ?? "IDLE";
  const isRunning  = status?.isRunning ?? false;
  const meta       = STATUS_META[simStatus];

  if (initialLoad) {
    return (
      <div className="flex items-center justify-center py-16 text-muted text-sm">
        <span className="inline-block w-4 h-4 border-2 border-line2 border-t-blue-500 rounded-full animate-spin mr-2" />
        Carregando...
      </div>
    );
  }

  return (
    <div className="space-y-4">

      {/* ── Status header ───────────────────────────────────────────────────── */}
      <div className="bg-paper border border-line2 rounded-xl p-5 space-y-3">
        {/* Status row */}
        <div className="flex items-center gap-2">
          <StatusDot status={simStatus} />
          <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold ${meta.badge}`}>
            {meta.label}
          </span>
          {isRunning && (
            <span className="text-xs text-muted ml-1">
              — cenário {status?.progress?.current ?? "…"} de {status?.progress?.total ?? "…"}
            </span>
          )}
        </div>

        {/* Progress bar */}
        {isRunning && status?.progress && (
          <div className="space-y-1">
            <div className="flex justify-between text-xs text-muted">
              <span className="truncate max-w-xs">{status.progress.scenarioName || "Preparando…"}</span>
              <span className="shrink-0 ml-2">{status.progress.pct}%</span>
            </div>
            <div className="h-2 bg-[#F4F4F2] rounded-full overflow-hidden">
              <div
                className="h-full bg-blue-500 rounded-full transition-all duration-500"
                style={{ width: `${status.progress.pct}%` }}
              />
            </div>
          </div>
        )}

        {/* Time info */}
        <div className="flex flex-wrap gap-4 text-xs text-muted">
          {status?.lastRunAt && (
            <span>Última execução: <strong className="text-ink2">{fmtTime(status.lastRunAt)}</strong></span>
          )}
          {status?.nextRunAt && simStatus === "SCHEDULED" && (
            <span>Próxima execução: <strong className="text-ink2">{fmtTime(status.nextRunAt)}</strong></span>
          )}
          {!status?.lastRunAt && <span className="text-muted">Nenhuma execução registrada</span>}
        </div>

        {/* Error */}
        {simStatus === "ERROR" && status?.lastError && (
          <div className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2 font-mono">
            {status.lastError}
          </div>
        )}
      </div>

      {/* ── Controls ────────────────────────────────────────────────────────── */}
      <div className="bg-paper border border-line2 rounded-xl p-4 flex flex-wrap items-center gap-3">
        {/* Interval */}
        <label className="flex items-center gap-2 text-sm text-ink2">
          A cada
          <select
            value={config?.intervalMinutes ?? 60}
            disabled={savingCfg || isRunning}
            onChange={(e) => void patchConfig({ intervalMinutes: Number(e.target.value) })}
            className="px-2 py-1 border border-line2 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-40"
          >
            {[15, 30, 60, 120, 240].map((m) => (
              <option key={m} value={m}>{m} min</option>
            ))}
          </select>
        </label>

        {/* Scenario count */}
        <label className="flex items-center gap-2 text-sm text-ink2">
          Cenários:
          <select
            value={config?.scenarioCount ?? 10}
            disabled={savingCfg || isRunning}
            onChange={(e) => void patchConfig({ scenarioCount: Number(e.target.value) })}
            className="px-2 py-1 border border-line2 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-40"
          >
            {[5, 10, 20].map((n) => (
              <option key={n} value={n}>{n}</option>
            ))}
          </select>
        </label>

        {/* Action buttons */}
        <div className="flex items-center gap-2 ml-auto">
          {/* Run now — disabled while running */}
          <button
            onClick={() => void runNow()}
            disabled={isRunning}
            title="Executar simulação agora"
            className="px-4 py-2 bg-blue-600 text-white text-sm font-semibold rounded-lg hover:bg-blue-700
                       disabled:opacity-40 disabled:cursor-not-allowed transition-colors flex items-center gap-1.5"
          >
            ▶ Rodar agora
          </button>

          {/* Pause — only when SCHEDULED */}
          {simStatus === "SCHEDULED" && (
            <button
              onClick={() => void doAction("/api/auto-simulator/pause")}
              title="Pausar agendamento automático"
              className="px-3 py-2 border border-line2 text-ink2 text-sm font-medium rounded-lg hover:bg-[#FAFAF8] transition-colors"
            >
              ⏸ Pausar
            </button>
          )}

          {/* Resume — when PAUSED or ERROR */}
          {(simStatus === "PAUSED" || simStatus === "ERROR" || simStatus === "IDLE") && (
            <button
              onClick={() => void doAction("/api/auto-simulator/resume")}
              title="Ativar agendamento automático"
              className="px-3 py-2 border border-line2 text-ink2 text-sm font-medium rounded-lg hover:bg-[#FAFAF8] transition-colors"
            >
              🔄 Ativar autopilot
            </button>
          )}

          {/* Stop — only when RUNNING */}
          {isRunning && (
            <button
              onClick={() => void doAction("/api/auto-simulator/stop")}
              title="Encerrar execução atual após o cenário em curso"
              className="px-3 py-2 border border-red-200 text-red-600 text-sm font-medium rounded-lg hover:bg-red-50 transition-colors"
            >
              🛑 Parar
            </button>
          )}
        </div>
      </div>

      {actionErr && (
        <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{actionErr}</p>
      )}

      {/* ── Safety note ─────────────────────────────────────────────────────── */}
      <div className="flex gap-2 items-start bg-blue-50 border border-blue-200 rounded-lg px-4 py-3">
        <span className="text-blue-500 text-base shrink-0">ℹ</span>
        <p className="text-xs text-blue-700 leading-relaxed">
          <strong>Modo seguro:</strong> O auto-simulador apenas analisa o comportamento da IA e gera sugestões.
          Nenhuma alteração é aplicada automaticamente — copie o prompt sugerido e cole manualmente.
        </p>
      </div>

      {/* ── History + detail ─────────────────────────────────────────────────── */}
      {history.length === 0 ? (
        <div className="text-center py-16 space-y-2">
          <p className="text-muted text-sm font-medium">Nenhuma execução ainda</p>
          <p className="text-muted text-xs">
            Clique em &quot;Rodar agora&quot; para iniciar a primeira simulação,
            ou ative o autopilot para execuções automáticas.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-[220px_1fr] gap-4 min-h-[400px]">
          {/* History sidebar */}
          <div className="bg-paper border border-line2 rounded-xl p-2 overflow-y-auto max-h-[600px] space-y-0.5">
            <p className="text-xs font-semibold text-muted uppercase tracking-wide px-3 py-1.5">Histórico</p>
            {history.map((run) => (
              <HistoryRow
                key={run.id}
                run={run}
                isSelected={selectedRun?.id === run.id}
                onClick={() => setSelectedRun(run)}
              />
            ))}
          </div>

          {/* Run detail */}
          <div className="bg-paper border border-line2 rounded-xl p-5">
            {selectedRun ? (
              <RunDetail run={selectedRun} />
            ) : (
              <p className="text-muted text-sm text-center py-12">Selecione uma execução no histórico</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
