"use client";

/**
 * QAPanel — Internal automatic-test panel for the chat-sim page.
 *
 * Renders alongside the phone-frame simulator when "Automático" mode
 * is active. Calls POST /api/qa-run, shows live status, summary,
 * per-scenario results, failure details, and a "Reproduzir erro" button
 * that drives the scenario actions back into the simulator UI.
 */

import { useState, useCallback } from "react";
import type { QARunLog, QAScenario, QAScenarioResult } from "@/lib/qa/types";

// ─── Types ────────────────────────────────────────────────────

type RunStatus = "idle" | "running" | "done" | "error";

interface QAPanelProps {
  scenarios: QAScenario[];
  criticalScenarioIds: readonly string[];
  onReplay: (scenario: QAScenario) => void;
  replayingScenarioId: string | null;
  replayStep: number;
  replayTotal: number;
}

// ─── Helpers ──────────────────────────────────────────────────

const OUTCOME_COLOR: Record<QAScenarioResult["outcome"], string> = {
  pass:  "text-green-700  bg-green-50  border-green-200",
  fail:  "text-orange-700 bg-orange-50 border-orange-200",
  error: "text-red-700    bg-red-50    border-red-200",
};
const OUTCOME_ICON: Record<QAScenarioResult["outcome"], string> = {
  pass: "✅", fail: "❌", error: "💥",
};
const SEVERITY_DOT: Record<string, string> = {
  critical: "bg-red-500",
  high:     "bg-orange-400",
  medium:   "bg-yellow-400",
  low:      "bg-gray-400",
};
const RECOMMENDATION_STYLE: Record<string, string> = {
  READY:                      "bg-green-100  text-green-800  border-green-300",
  READY_FOR_CONTROLLED_PILOT: "bg-yellow-100 text-yellow-800 border-yellow-300",
  NOT_READY:                  "bg-red-100    text-red-800    border-red-300",
};

function downloadMarkdown(md: string) {
  const blob = new Blob([md], { type: "text/markdown" });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement("a");
  a.href     = url;
  a.download = `qa-report-${new Date().toISOString().slice(0, 10)}.md`;
  a.click();
  URL.revokeObjectURL(url);
}

// ─── Component ────────────────────────────────────────────────

export function QAPanel({
  scenarios,
  criticalScenarioIds,
  onReplay,
  replayingScenarioId,
  replayStep,
  replayTotal,
}: QAPanelProps) {
  const [runStatus,         setRunStatus]         = useState<RunStatus>("idle");
  const [runLog,            setRunLog]             = useState<QARunLog | null>(null);
  const [markdown,          setMarkdown]           = useState<string>("");
  const [runError,          setRunError]           = useState<string>("");
  const [expandedIds,       setExpandedIds]        = useState<Set<string>>(new Set());
  const [selectedScenario,  setSelectedScenario]   = useState<string>("");
  const [showReport,        setShowReport]         = useState(false);
  const [runProgress,       setRunProgress]        = useState(0);
  const [runTarget,         setRunTarget]          = useState(0);

  // ── Run trigger ─────────────────────────────────────────────

  const triggerRun = useCallback(
    async (mode: "critical" | "full" | "single") => {
      setRunStatus("running");
      setRunLog(null);
      setRunError("");
      setExpandedIds(new Set());

      const target =
        mode === "critical" ? criticalScenarioIds.length :
        mode === "single"   ? 1                          : scenarios.length;
      setRunTarget(target);
      setRunProgress(0);

      // Animate a fake progress counter while the request is in-flight.
      // The runner is synchronous and fast (<200ms), so this is cosmetic.
      let current = 0;
      const interval = setInterval(() => {
        current = Math.min(current + 1, target - 1);
        setRunProgress(current);
      }, 120);

      try {
        const body: { mode: string; scenarioId?: string } = { mode };
        if (mode === "single" && selectedScenario) body.scenarioId = selectedScenario;

        const res  = await fetch("/api/qa-run", {
          method:  "POST",
          headers: { "Content-Type": "application/json" },
          body:    JSON.stringify(body),
        });
        const data = await res.json();
        clearInterval(interval);

        if (!res.ok) throw new Error(data.error ?? "Falha na execução");

        setRunProgress(target);
        setRunLog(data.data.log as QARunLog);
        setMarkdown(data.data.markdown as string);
        setRunStatus("done");
      } catch (err) {
        clearInterval(interval);
        setRunError(err instanceof Error ? err.message : "Erro desconhecido");
        setRunStatus("error");
      }
    },
    [scenarios.length, criticalScenarioIds.length, selectedScenario],
  );

  // ── UI helpers ───────────────────────────────────────────────

  const toggleExpanded = (id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const isRunning = runStatus === "running";

  // ─── Render ──────────────────────────────────────────────────

  return (
    <div className="relative flex h-full flex-col rounded-2xl border border-gray-200 bg-white shadow-sm overflow-hidden">

      {/* ── Header ──────────────────────────────────────────── */}
      <div className="shrink-0 border-b border-gray-100 bg-gray-50 px-4 py-3">
        <div className="flex items-center justify-between">
          <p className="text-xs font-bold uppercase tracking-widest text-gray-500">
            🤖 Painel QA Interno
          </p>
          <p className="text-[10px] text-gray-400">
            Cardápio interno · sem conexão ao banco
          </p>
        </div>
      </div>

      {/* ── Scrollable body ─────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-4">

        {/* Run buttons */}
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => triggerRun("critical")}
            disabled={isRunning}
            className="rounded-full bg-red-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-red-700 disabled:opacity-40 transition-colors shadow-sm"
          >
            🔴 Rodar críticos ({criticalScenarioIds.length})
          </button>
          <button
            onClick={() => triggerRun("full")}
            disabled={isRunning}
            className="rounded-full bg-[#128c7e] px-3 py-1.5 text-xs font-bold text-white hover:bg-[#0d7066] disabled:opacity-40 transition-colors shadow-sm"
          >
            ▶ Rodar bateria completa ({scenarios.length})
          </button>
        </div>

        {/* Single-scenario selector */}
        <div className="flex items-center gap-2">
          <select
            value={selectedScenario}
            onChange={(e) => setSelectedScenario(e.target.value)}
            disabled={isRunning}
            className="flex-1 rounded-xl border border-gray-200 bg-white px-2.5 py-1.5 text-xs text-gray-700 focus:border-[#25d366] focus:outline-none focus:ring-1 focus:ring-[#25d366] disabled:opacity-50"
          >
            <option value="">— Selecionar cenário —</option>
            {scenarios.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name} ({s.severity})
              </option>
            ))}
          </select>
          <button
            onClick={() => triggerRun("single")}
            disabled={isRunning || !selectedScenario}
            className="shrink-0 rounded-full border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-40 transition-colors"
          >
            ▶ Rodar
          </button>
        </div>

        {/* ── Live status ─────────────────────────────────────── */}
        {runStatus !== "idle" && (
          <div className={`rounded-xl border px-3 py-2 text-xs font-medium ${
            runStatus === "running" ? "border-blue-200 bg-blue-50 text-blue-800" :
            runStatus === "done"    ? "border-green-200 bg-green-50 text-green-800" :
                                     "border-red-200 bg-red-50 text-red-700"
          }`}>
            {runStatus === "running" && (
              <span className="flex items-center gap-2">
                <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-blue-500" />
                Rodando... {runProgress} / {runTarget}
              </span>
            )}
            {runStatus === "done" && (
              <span>
                ✅ Concluído — {runProgress}/{runTarget} cenários executados
              </span>
            )}
            {runStatus === "error" && (
              <span>❌ Erro: {runError}</span>
            )}
          </div>
        )}

        {/* ── Summary box ─────────────────────────────────────── */}
        {runLog && (
          <div className="rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 space-y-2">
            <p className="text-[11px] font-bold uppercase tracking-widest text-gray-500">
              Resumo
            </p>
            <div className="grid grid-cols-4 gap-2 text-center">
              {[
                { label: "Total",    value: runLog.summary.total,   cls: "text-gray-900" },
                { label: "Passou",   value: runLog.summary.passed,  cls: "text-green-700 font-bold" },
                { label: "Falhou",   value: runLog.summary.failed + runLog.summary.errored, cls: runLog.summary.failed + runLog.summary.errored > 0 ? "text-red-600 font-bold" : "text-gray-900" },
                { label: "Críticos", value: runLog.summary.critical, cls: runLog.summary.critical > 0 ? "text-red-600 font-bold" : "text-gray-900" },
              ].map(({ label, value, cls }) => (
                <div key={label} className="rounded-lg bg-white border border-gray-200 px-2 py-1.5">
                  <p className={`text-base leading-none ${cls}`}>{value}</p>
                  <p className="mt-0.5 text-[10px] text-gray-500">{label}</p>
                </div>
              ))}
            </div>
            <div className="flex items-center justify-between pt-1">
              <span className="text-[11px] text-gray-500">
                ⏱ {runLog.totalDurationMs}ms
              </span>
              <span className={`rounded-full border px-2.5 py-0.5 text-[11px] font-bold ${
                RECOMMENDATION_STYLE[runLog.summary.recommendation] ?? ""
              }`}>
                {runLog.summary.recommendation.replace(/_/g, " ")}
              </span>
            </div>
          </div>
        )}

        {/* ── Scenario results ────────────────────────────────── */}
        {runLog && (
          <div className="space-y-1.5">
            <p className="text-[11px] font-bold uppercase tracking-widest text-gray-500">
              Cenários
            </p>
            {runLog.scenarios.map((result) => {
              const scenario = scenarios.find((s) => s.id === result.scenarioId);
              const isExpanded = expandedIds.has(result.scenarioId);
              const isFailed   = result.outcome !== "pass";
              const isReplaying = replayingScenarioId === result.scenarioId;

              return (
                <div
                  key={result.scenarioId}
                  className={`rounded-xl border ${OUTCOME_COLOR[result.outcome]} overflow-hidden`}
                >
                  {/* Row header */}
                  <button
                    onClick={() => toggleExpanded(result.scenarioId)}
                    className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-black/5 transition-colors"
                  >
                    <span className="text-sm leading-none">{OUTCOME_ICON[result.outcome]}</span>
                    <span className="flex-1 text-xs font-semibold leading-tight">
                      {result.scenarioName}
                    </span>
                    <span className="flex items-center gap-1 shrink-0">
                      <span
                        className={`inline-block h-1.5 w-1.5 rounded-full ${SEVERITY_DOT[scenario?.severity ?? "low"] ?? SEVERITY_DOT["low"]}`}
                      />
                      <span className="text-[10px] opacity-70">{result.durationMs}ms</span>
                      <span className="text-[10px] opacity-50">{isExpanded ? "▲" : "▼"}</span>
                    </span>
                  </button>

                  {/* Expanded: failures + replay button */}
                  {isExpanded && (
                    <div className="border-t border-current/10 px-3 py-2 space-y-1.5">
                      {result.failures.length === 0 ? (
                        <p className="text-[11px] opacity-70">Sem falhas registradas.</p>
                      ) : (
                        result.failures.map((f, i) => (
                          <div key={i} className="rounded-lg bg-white/60 px-2.5 py-1.5 text-[11px]">
                            <p className="font-semibold">{f.description}</p>
                            <p className="mt-0.5 opacity-80 font-mono leading-relaxed break-all">
                              {f.detail}
                            </p>
                          </div>
                        ))
                      )}

                      {/* Checkpoint results */}
                      {result.checkpointResults.some((c) => !c.passed) && (
                        <div className="space-y-1 pt-1">
                          <p className="text-[10px] font-bold uppercase tracking-wider opacity-60">
                            Checkpoints
                          </p>
                          {result.checkpointResults
                            .filter((c) => !c.passed)
                            .map((c) => (
                              <div key={c.checkpointId} className="rounded bg-white/60 px-2 py-1 text-[11px]">
                                <span className="font-medium">✗ {c.description}</span>
                                {c.detail && (
                                  <span className="ml-1 opacity-70">— {c.detail}</span>
                                )}
                              </div>
                            ))}
                        </div>
                      )}

                      {/* Reproduzir erro button */}
                      {isFailed && scenario && (
                        <div className="pt-1">
                          {isReplaying ? (
                            <div className="flex items-center gap-2 rounded-full bg-orange-500 px-3 py-1.5 text-[11px] font-bold text-white w-fit">
                              <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-white" />
                              Reproduzindo... {replayStep}/{replayTotal}
                            </div>
                          ) : (
                            <button
                              onClick={() => onReplay(scenario)}
                              className="rounded-full bg-[#128c7e] px-3 py-1.5 text-[11px] font-bold text-white hover:bg-[#0d7066] transition-colors shadow-sm"
                            >
                              ▶ Reproduzir erro no simulador
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* ── Footer actions ──────────────────────────────────── */}
        {runLog && (
          <div className="flex gap-2 pt-1 pb-2">
            <button
              onClick={() => setShowReport(true)}
              className="rounded-full border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 transition-colors"
            >
              📄 Ver relatório
            </button>
            <button
              onClick={() => downloadMarkdown(markdown)}
              className="rounded-full border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 transition-colors"
            >
              ⬇ Baixar .md
            </button>
          </div>
        )}
      </div>

      {/* ── Report modal overlay ─────────────────────────────── */}
      {showReport && (
        <div className="absolute inset-0 z-50 flex flex-col bg-white">
          <div className="shrink-0 flex items-center justify-between border-b border-gray-200 px-4 py-3">
            <p className="text-sm font-bold text-gray-800">📄 Relatório completo</p>
            <div className="flex items-center gap-2">
              <button
                onClick={() => downloadMarkdown(markdown)}
                className="rounded-full border border-gray-200 px-3 py-1 text-xs font-medium text-gray-600 hover:bg-gray-50 transition-colors"
              >
                ⬇ Baixar
              </button>
              <button
                onClick={() => setShowReport(false)}
                className="flex h-7 w-7 items-center justify-center rounded-full bg-gray-100 text-gray-500 hover:bg-gray-200 transition-colors text-sm"
              >
                ✕
              </button>
            </div>
          </div>
          <pre className="flex-1 overflow-auto p-4 font-mono text-[11px] text-gray-700 leading-relaxed whitespace-pre-wrap">
            {markdown}
          </pre>
        </div>
      )}
    </div>
  );
}
