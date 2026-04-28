"use client";

import { useState, useCallback } from "react";
import type { SimulationReport, ScenarioResult, CheckResult, SalesMetrics } from "@/services/ai/AISimulatorService";

// ─── types ────────────────────────────────────────────────────

type RunState = "idle" | "running" | "done" | "error";

interface ProgressInfo {
  current:      number;
  total:        number;
  scenarioName: string;
}

// ─── main client ──────────────────────────────────────────────

export function AISimulatorClient() {
  const [state,    setState]    = useState<RunState>("idle");
  const [progress, setProgress] = useState<ProgressInfo | null>(null);
  const [results,  setResults]  = useState<ScenarioResult[]>([]);
  const [report,   setReport]   = useState<SimulationReport | null>(null);
  const [errMsg,   setErrMsg]   = useState<string>("");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const runSimulations = useCallback(async () => {
    setState("running");
    setProgress(null);
    setResults([]);
    setReport(null);
    setErrMsg("");
    setExpanded(new Set());

    try {
      const response = await fetch("/api/ai-simulator/run", { method: "POST" });
      if (!response.ok || !response.body) {
        throw new Error(`HTTP ${response.status}`);
      }

      const reader  = response.body.getReader();
      const decoder = new TextDecoder();
      let   buffer  = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          try {
            const event = JSON.parse(line.slice(6)) as Record<string, unknown>;
            if (event.type === "progress") {
              setProgress(event as unknown as ProgressInfo);
            } else if (event.type === "scenario_result") {
              setResults((prev) => [...prev, event.result as ScenarioResult]);
            } else if (event.type === "report") {
              setReport(event.report as SimulationReport);
              setState("done");
            } else if (event.type === "error") {
              setErrMsg(String(event.message));
              setState("error");
            }
          } catch {
            // malformed SSE line — skip
          }
        }
      }
    } catch (err) {
      setErrMsg(String(err));
      setState("error");
    }
  }, []);

  const toggleExpanded = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <div className="min-h-screen bg-[#F5F5F5] p-6">
      <div className="max-w-5xl mx-auto space-y-6">

        {/* Header */}
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Simulador da IA de Vendas</h1>
            <p className="text-sm text-gray-500 mt-1">
              Testa automaticamente a IA com 10 perfis de clientes usando o cardápio e configuração reais.
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {/* Download buttons — visible only after simulation completes */}
            {state === "done" && report && (
              <>
                <button
                  onClick={() => downloadJSON(report)}
                  title="Baixar relatório completo (JSON)"
                  className="px-3 py-2 bg-white border border-gray-200 text-gray-600 text-xs font-medium rounded-lg
                             hover:bg-gray-50 hover:border-gray-300 transition-colors flex items-center gap-1.5"
                >
                  ⬇ JSON
                </button>
                <button
                  onClick={() => downloadSummary(report)}
                  title="Baixar resumo legível (TXT)"
                  className="px-3 py-2 bg-white border border-gray-200 text-gray-600 text-xs font-medium rounded-lg
                             hover:bg-gray-50 hover:border-gray-300 transition-colors flex items-center gap-1.5"
                >
                  ⬇ Resumo
                </button>
                <button
                  onClick={() => downloadCSV(report)}
                  title="Baixar tabela de resultados (CSV)"
                  className="px-3 py-2 bg-white border border-gray-200 text-gray-600 text-xs font-medium rounded-lg
                             hover:bg-gray-50 hover:border-gray-300 transition-colors flex items-center gap-1.5"
                >
                  ⬇ CSV
                </button>
              </>
            )}
            <button
              onClick={runSimulations}
              disabled={state === "running"}
              className="px-5 py-2.5 bg-blue-600 text-white text-sm font-semibold rounded-lg
                         hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed
                         transition-colors flex items-center gap-2"
            >
              {state === "running" ? (
                <>
                  <span className="inline-block w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  Executando...
                </>
              ) : state === "done" ? (
                "↺ Rodar novamente"
              ) : (
                "▶ Rodar simulações"
              )}
            </button>
          </div>
        </div>

        {/* Progress bar */}
        {state === "running" && progress && (
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <div className="flex justify-between text-sm text-gray-600 mb-2">
              <span>Executando: <strong>{progress.scenarioName}</strong></span>
              <span>{progress.current} / {progress.total}</span>
            </div>
            <div className="w-full bg-gray-100 rounded-full h-2">
              <div
                className="bg-blue-500 h-2 rounded-full transition-all duration-500"
                style={{ width: `${(progress.current / progress.total) * 100}%` }}
              />
            </div>
            <p className="text-xs text-gray-400 mt-2">
              Isso pode levar ~60–90 segundos. As respostas aparecem à medida que cada cenário termina.
            </p>
          </div>
        )}

        {/* Error */}
        {state === "error" && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-sm text-red-700">
            <strong>Erro ao executar simulações:</strong> {errMsg}
          </div>
        )}

        {/* Summary report */}
        {report && (
          <SummaryCard report={report} />
        )}

        {/* Scenario results */}
        {results.length > 0 && (
          <div>
            <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">
              Resultados por cenário
            </h2>
            <div className="space-y-3">
              {results.map((r) => (
                <ScenarioCard
                  key={r.id}
                  result={r}
                  isExpanded={expanded.has(r.id)}
                  onToggle={() => toggleExpanded(r.id)}
                />
              ))}
            </div>
          </div>
        )}

        {/* Empty state */}
        {state === "idle" && (
          <div className="bg-white rounded-xl border border-gray-200 p-10 text-center text-gray-400">
            <div className="text-4xl mb-3">🤖</div>
            <p className="font-medium text-gray-600">Nenhuma simulação executada ainda</p>
            <p className="text-sm mt-1">Clique em &quot;Rodar simulações&quot; para começar.</p>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── summary card ─────────────────────────────────────────────

function SummaryCard({ report }: { report: SimulationReport }) {
  const scoreColor = report.overallScore >= 7
    ? "text-green-600" : report.overallScore >= 5
    ? "text-yellow-600" : "text-red-600";

  const safeBadge = report.safeToTest
    ? { bg: "bg-green-100 text-green-700 border-green-200", label: "✅ SIM — pronto para testar com cliente real" }
    : { bg: "bg-red-100 text-red-700 border-red-200", label: "❌ NÃO — corrija os problemas antes" };

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs text-gray-500 uppercase tracking-wide">Score geral</p>
          <p className={`text-4xl font-bold ${scoreColor}`}>
            {report.overallScore.toFixed(1)}<span className="text-xl text-gray-400"> / 10</span>
          </p>
        </div>
        <div className={`px-4 py-2 rounded-lg border text-sm font-semibold ${safeBadge.bg}`}>
          {safeBadge.label}
        </div>
      </div>

      {/* Global sales stats */}
      <div className="grid grid-cols-3 gap-3 pt-1 border-t border-gray-100">
        <div className="text-center">
          <p className="text-xs text-gray-400 mb-0.5">Ticket médio</p>
          <p className="text-lg font-bold text-gray-800">
            {report.avgTicket > 0 ? `R$ ${report.avgTicket.toFixed(2)}` : "—"}
          </p>
        </div>
        <div className="text-center">
          <p className="text-xs text-gray-400 mb-0.5">Itens médios</p>
          <p className="text-lg font-bold text-gray-800">
            {report.avgItems > 0 ? report.avgItems.toFixed(1) : "—"}
          </p>
        </div>
        <div className="text-center">
          <p className="text-xs text-gray-400 mb-0.5">Taxa de conversão</p>
          <p className="text-lg font-bold text-gray-800">
            {(report.conversionRate * 100).toFixed(0)}%
          </p>
        </div>
      </div>

      {/* Top fixes */}
      {report.topFixes.length > 0 && (
        <div>
          <p className="text-sm font-semibold text-gray-700 mb-2">Top correções necessárias:</p>
          <ol className="space-y-1">
            {report.topFixes.map((fix, i) => (
              <li key={i} className="text-sm text-gray-600 flex gap-2">
                <span className="font-bold text-gray-400">{i + 1}.</span>
                {fix}
              </li>
            ))}
          </ol>
        </div>
      )}

      {/* Critical bugs */}
      {report.criticalBugs.length > 0 && (
        <details>
          <summary className="text-sm font-semibold text-red-600 cursor-pointer select-none">
            🐛 {report.criticalBugs.length} bug{report.criticalBugs.length > 1 ? "s" : ""} crítico{report.criticalBugs.length > 1 ? "s" : ""} detectado{report.criticalBugs.length > 1 ? "s" : ""}
          </summary>
          <ul className="mt-2 space-y-1">
            {report.criticalBugs.map((bug, i) => (
              <li key={i} className="text-xs text-red-600 bg-red-50 rounded px-3 py-1.5">
                {bug}
              </li>
            ))}
          </ul>
        </details>
      )}

      <p className="text-xs text-gray-400">
        {report.restaurantName} · Executado em {new Date(report.ranAt).toLocaleString("pt-BR")}
      </p>
    </div>
  );
}

// ─── scenario card ────────────────────────────────────────────

function ScenarioCard({
  result,
  isExpanded,
  onToggle,
}: {
  result:     ScenarioResult;
  isExpanded: boolean;
  onToggle:   () => void;
}) {
  const statusConfig = {
    passed:  { bg: "bg-green-50 border-green-200",  badge: "bg-green-100 text-green-700",  icon: "✅" },
    warning: { bg: "bg-yellow-50 border-yellow-200", badge: "bg-yellow-100 text-yellow-700", icon: "⚠️" },
    failed:  { bg: "bg-red-50 border-red-200",      badge: "bg-red-100 text-red-700",      icon: "❌" },
  }[result.status];

  return (
    <div className={`rounded-xl border ${statusConfig.bg} overflow-hidden`}>
      {/* Card header */}
      <button
        onClick={onToggle}
        className="w-full flex items-center justify-between p-4 text-left hover:brightness-95 transition-all"
      >
        <div className="flex items-center gap-3">
          <span className="text-lg">{statusConfig.icon}</span>
          <div>
            <p className="font-semibold text-gray-800 text-sm">{result.name}</p>
            <p className="text-xs text-gray-500">{result.description}</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <span className={`text-xs font-semibold px-2 py-1 rounded-full ${statusConfig.badge}`}>
            {result.score.toFixed(1)} / 10
          </span>
          <span className="text-gray-400 text-sm">{isExpanded ? "▲" : "▼"}</span>
        </div>
      </button>

      {/* Expanded content */}
      {isExpanded && (
        <div className="border-t border-inherit px-4 pb-4 space-y-4">

          {/* Sales metrics strip */}
          <SalesMetricsRow metrics={result.salesMetrics} />

          {/* Expected behavior */}
          <div>
            <p className="text-xs text-gray-500 font-medium mb-1">Comportamento esperado</p>
            <p className="text-sm text-gray-700">{result.expectedBehavior}</p>
          </div>

          {/* Checks */}
          <div>
            <p className="text-xs text-gray-500 font-medium mb-2">Verificações</p>
            <div className="space-y-1.5">
              {result.checks.map((check, i) => (
                <CheckRow key={i} check={check} />
              ))}
            </div>
          </div>

          {/* Issues */}
          {result.issues.length > 0 && (
            <div>
              <p className="text-xs text-gray-500 font-medium mb-2">Problemas detectados</p>
              <ul className="space-y-1">
                {result.issues.map((issue, i) => (
                  <li key={i} className="text-xs text-red-600 bg-red-50 rounded px-2 py-1.5">
                    ⚠ {issue}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Transcript */}
          {result.transcript.length > 0 && (
            <div>
              <p className="text-xs text-gray-500 font-medium mb-2">Transcrição</p>
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {result.transcript.map((turn, i) => (
                  <TranscriptBubble key={i} turn={turn} />
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function CheckRow({ check }: { check: CheckResult }) {
  return (
    <div className="flex items-start gap-2 text-xs">
      <span className={check.passed ? "text-green-500" : "text-red-500"}>
        {check.passed ? "✓" : "✗"}
      </span>
      <div>
        <span className={`font-medium ${check.passed ? "text-gray-700" : "text-red-700"}`}>
          {check.label}
        </span>
        <span className="text-gray-400 ml-1">— {check.detail}</span>
      </div>
    </div>
  );
}

// ─── sales metrics row ────────────────────────────────────────

function SalesMetricsRow({ metrics }: { metrics: SalesMetrics }) {
  const acceptRate = metrics.upsellAttempts > 0
    ? ((metrics.acceptedSuggestions / metrics.upsellAttempts) * 100).toFixed(0) + "%"
    : "—";

  const items: Array<{ label: string; value: string; highlight?: boolean }> = [
    {
      label: "Ticket final",
      value: metrics.finalCartValue > 0 ? `R$ ${metrics.finalCartValue.toFixed(2)}` : "—",
    },
    {
      label: "Itens",
      value: metrics.totalItems > 0 ? String(metrics.totalItems) : "—",
    },
    {
      label: "Upsells",
      value: metrics.upsellAttempts > 0
        ? `${metrics.acceptedSuggestions}/${metrics.upsellAttempts} (${acceptRate})`
        : "—",
    },
    {
      label: "Conversão",
      value: metrics.conversionSuccess ? "✓ Sim" : "✗ Não",
      highlight: metrics.conversionSuccess,
    },
  ];

  return (
    <div className="pt-3 grid grid-cols-4 gap-2">
      {items.map((item) => (
        <div key={item.label} className="bg-gray-50 rounded-lg px-3 py-2 text-center">
          <p className="text-[10px] text-gray-400 uppercase tracking-wide mb-0.5">{item.label}</p>
          <p className={`text-sm font-semibold ${item.highlight ? "text-green-600" : "text-gray-700"}`}>
            {item.value}
          </p>
        </div>
      ))}
    </div>
  );
}

// ─── export helpers ───────────────────────────────────────────

function slugify(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

function fileTimestamp(iso: string): string {
  const d = new Date(iso);
  const date = d.toISOString().slice(0, 10);
  const time = d.toISOString().slice(11, 19).replace(/:/g, "-");
  return `${date}-${time}`;
}

function triggerDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a   = document.createElement("a");
  a.href     = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function downloadJSON(report: SimulationReport): void {
  const ts       = fileTimestamp(report.ranAt);
  const name     = slugify(report.restaurantName);
  const filename = `simulation-report-${ts}-${name}.json`;
  triggerDownload(
    new Blob([JSON.stringify(report, null, 2)], { type: "application/json" }),
    filename,
  );
}

function downloadSummary(report: SimulationReport): void {
  const ts         = fileTimestamp(report.ranAt);
  const name       = slugify(report.restaurantName);
  const filename   = `simulation-summary-${ts}-${name}.txt`;
  const dateStr    = new Date(report.ranAt).toLocaleString("pt-BR");
  const passed     = report.scenarios.filter((s) => s.status === "passed").length;
  const warned     = report.scenarios.filter((s) => s.status === "warning").length;
  const failed     = report.scenarios.filter((s) => s.status === "failed").length;

  const lines: string[] = [
    "═══════════════════════════════════════════════",
    "   RELATÓRIO DO SIMULADOR DE IA DE VENDAS",
    "═══════════════════════════════════════════════",
    `Restaurante : ${report.restaurantName}`,
    `Executado em: ${dateStr}`,
    "",
    "─── RESULTADO GERAL ────────────────────────────",
    `Score geral       : ${report.overallScore.toFixed(1)} / 10`,
    `Pronto para testar: ${report.safeToTest ? "SIM ✓" : "NÃO ✗"}`,
    `Cenários aprovados: ${passed} / ${report.scenarios.length}`,
    `Cenários atenção  : ${warned}`,
    `Cenários falha    : ${failed}`,
    "",
  ];

  if (report.topFixes.length > 0) {
    lines.push("─── PRINCIPAIS CORREÇÕES NECESSÁRIAS ──────────");
    report.topFixes.forEach((fix, i) => lines.push(`  ${i + 1}. ${fix}`));
    lines.push("");
  }

  lines.push("─── RESULTADOS POR CENÁRIO ─────────────────────");
  report.scenarios.forEach((s) => {
    const icon = s.status === "passed" ? "✓" : s.status === "warning" ? "⚠" : "✗";
    lines.push(`${icon} [${s.score.toFixed(1)}/10] ${s.name}`);
    lines.push(`   ${s.description}`);
    if (s.issues.length > 0) {
      s.issues.forEach((issue) => lines.push(`   ⚠ ${issue}`));
    }
    lines.push("");
  });

  if (report.criticalBugs.length > 0) {
    lines.push("─── BUGS CRÍTICOS ──────────────────────────────");
    report.criticalBugs.forEach((bug) => lines.push(`  • ${bug}`));
    lines.push("");
  }

  triggerDownload(
    new Blob([lines.join("\n")], { type: "text/plain;charset=utf-8" }),
    filename,
  );
}

function downloadCSV(report: SimulationReport): void {
  const ts       = fileTimestamp(report.ranAt);
  const name     = slugify(report.restaurantName);
  const filename = `simulation-csv-${ts}-${name}.csv`;

  const headers = [
    "Cenário",
    "Score",
    "Status",
    "Ticket Final (R$)",
    "Itens",
    "Upsell Tentativas",
    "Aceitos",
    "Taxa de Aceitação",
    "Receita Score",
    "Loop Detectado",
    "Conversão",
    "Problemas",
  ];

  const rows = report.scenarios.map((s) => {
    const m           = s.salesMetrics;
    const acceptRate  = m.upsellAttempts > 0
      ? ((m.acceptedSuggestions / m.upsellAttempts) * 100).toFixed(0) + "%"
      : "0%";
    const revenueScore = report.avgTicket > 0
      ? (m.finalCartValue / report.avgTicket * 10).toFixed(1)
      : "—";
    const loopCheck  = s.checks.find((c) => c.type === "no_loop");
    const loopDetected = loopCheck ? !loopCheck.passed : false;
    const statusLabel =
      s.status === "passed" ? "Aprovado" :
      s.status === "warning" ? "Atenção"  : "Falha";

    return [
      s.name,
      s.score.toFixed(1),
      statusLabel,
      m.finalCartValue > 0 ? m.finalCartValue.toFixed(2) : "0.00",
      String(m.totalItems),
      String(m.upsellAttempts),
      String(m.acceptedSuggestions),
      acceptRate,
      revenueScore,
      loopDetected            ? "Sim" : "Não",
      m.conversionSuccess     ? "Sim" : "Não",
      s.issues.join(" | "),
    ];
  });

  const escape = (v: string) => `"${v.replace(/"/g, '""')}"`;
  const csv = [headers, ...rows]
    .map((row) => row.map(escape).join(","))
    .join("\r\n");

  // BOM prefix so Excel opens with correct encoding
  triggerDownload(
    new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" }),
    filename,
  );
}

// ─── transcript bubble ────────────────────────────────────────

function TranscriptBubble({
  turn,
}: {
  turn: { role: "customer" | "ai"; content: string; toolCalls: Array<{ name: string; success: boolean; detail: string }> };
}) {
  const isAI = turn.role === "ai";
  return (
    <div className={`flex ${isAI ? "justify-start" : "justify-end"}`}>
      <div
        className={`max-w-[85%] rounded-lg px-3 py-2 text-xs ${
          isAI
            ? "bg-white border border-gray-200 text-gray-800"
            : "bg-blue-600 text-white"
        }`}
      >
        <p className={`text-[10px] font-semibold mb-0.5 ${isAI ? "text-gray-400" : "text-blue-200"}`}>
          {isAI ? "🤖 IA" : "👤 Cliente"}
        </p>
        <p className="whitespace-pre-wrap leading-relaxed">{turn.content || <em className="opacity-50">sem resposta</em>}</p>
        {turn.toolCalls.length > 0 && (
          <div className="mt-1 pt-1 border-t border-gray-100 space-y-0.5">
            {turn.toolCalls.map((tc, i) => (
              <p key={i} className={`text-[10px] ${tc.success ? "text-green-600" : "text-red-500"}`}>
                ⚙ {tc.name}: {tc.detail}
              </p>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
