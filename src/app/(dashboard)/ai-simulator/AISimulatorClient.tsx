"use client";

import { useState, useCallback } from "react";
import type {
  SimulationReport,
  ScenarioResult,
  CheckResult,
  SalesMetrics,
  CartSnapshot,
} from "@/services/ai/AISimulatorService";

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
  const scoreColor = report.overallScore >= 70
    ? "text-green-600" : report.overallScore >= 50
    ? "text-yellow-600" : "text-red-600";

  const safeBadge = report.safeToTest
    ? { bg: "bg-green-100 text-green-700 border-green-200", label: "SIM — pronto para teste com cliente real" }
    : { bg: "bg-red-100 text-red-700 border-red-200",       label: "NÃO — corrija os problemas antes" };

  const stats: Array<{ label: string; value: string; warn?: boolean }> = [
    {
      label: "Ticket médio",
      value: report.avgTicket > 0 ? `R$ ${report.avgTicket.toFixed(2)}` : "—",
    },
    {
      label: "Itens médios",
      value: report.avgItems > 0 ? report.avgItems.toFixed(1) : "—",
    },
    {
      label: "Taxa de conversão",
      value: `${(report.conversionRate * 100).toFixed(0)}%`,
      warn: report.conversionRate < 0.4,
    },
    {
      label: "Turnos médios",
      value: report.avgTurns > 0 ? report.avgTurns.toFixed(1) : "—",
      warn: report.avgTurns > 8,
    },
    {
      label: "Taxa de abandono",
      value: `${(report.abandonmentRate * 100).toFixed(0)}%`,
      warn: report.abandonmentRate > 0.5,
    },
    {
      label: "Aceitação upsell",
      value: report.upsellAcceptanceRate > 0
        ? `${(report.upsellAcceptanceRate * 100).toFixed(0)}%`
        : "—",
      warn: report.upsellAcceptanceRate > 0 && report.upsellAcceptanceRate < 0.3,
    },
    {
      label: "Receita real",
      value: report.realRevenue > 0 ? `R$ ${report.realRevenue.toFixed(2)}` : "—",
    },
    {
      label: "Flow score",
      value: `${(report.flowScore * 100).toFixed(0)}%`,
      warn: report.flowScore < 0.5,
    },
    {
      label: "Erros totais",
      value: String(report.errorCount),
      warn: report.errorCount > 5,
    },
  ];

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-5">
      {/* Score + safe badge */}
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs text-gray-500 uppercase tracking-wide">Score geral</p>
          <p className={`text-4xl font-bold ${scoreColor}`}>
            {report.overallScore.toFixed(0)}<span className="text-xl text-gray-400"> / 100</span>
          </p>
        </div>
        <div className={`px-4 py-2 rounded-lg border text-sm font-semibold flex items-center gap-2 ${safeBadge.bg}`}>
          <span className="text-base">{report.safeToTest ? "✅" : "❌"}</span>
          <span>Pronto para teste real: <strong>{report.safeToTest ? "SIM" : "NÃO"}</strong></span>
        </div>
      </div>

      {/* 6-stat grid */}
      <div className="grid grid-cols-3 gap-3 pt-1 border-t border-gray-100">
        {stats.map((s) => (
          <div key={s.label} className="text-center">
            <p className="text-xs text-gray-400 mb-0.5">{s.label}</p>
            <p className={`text-lg font-bold ${s.warn ? "text-orange-500" : "text-gray-800"}`}>
              {s.value}
            </p>
          </div>
        ))}
      </div>

      {/* Top fixes */}
      {report.topFixes.length > 0 && (
        <div>
          <p className="text-sm font-semibold text-gray-700 mb-2">Correções recomendadas:</p>
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
            🐛 {report.criticalBugs.length} falha{report.criticalBugs.length > 1 ? "s" : ""} crítica{report.criticalBugs.length > 1 ? "s" : ""} detectada{report.criticalBugs.length > 1 ? "s" : ""}
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
            {result.score.toFixed(0)} / 100
          </span>
          <span className="text-gray-400 text-sm">{isExpanded ? "▲" : "▼"}</span>
        </div>
      </button>

      {/* Expanded content */}
      {isExpanded && (
        <div className="border-t border-inherit px-4 pb-4 space-y-4">

          {/* Sales metrics strip */}
          <SalesMetricsRow metrics={result.salesMetrics} totalTurns={result.totalTurns} abandoned={result.abandoned} />

          {/* Cart evolution */}
          {result.cartEvolution.length > 0 && (
            <CartEvolutionTable evolution={result.cartEvolution} />
          )}

          {/* Sales weaknesses */}
          {result.salesWeaknesses.length > 0 && (
            <div>
              <p className="text-xs text-gray-500 font-medium mb-2">Pontos fracos de vendas</p>
              <ul className="space-y-1">
                {result.salesWeaknesses.map((w, i) => (
                  <li key={i} className="text-xs text-orange-700 bg-orange-50 rounded px-2 py-1.5">
                    ↘ {w}
                  </li>
                ))}
              </ul>
            </div>
          )}

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
              <p className="text-xs text-gray-500 font-medium mb-2">Falhas detectadas</p>
              <ul className="space-y-1">
                {result.issues.map((issue, i) => (
                  <li key={i} className="text-xs text-red-600 bg-red-50 rounded px-2 py-1.5">
                    ⚠ {issue}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Full transcript */}
          {result.transcript.length > 0 && (
            <div>
              <p className="text-xs text-gray-500 font-medium mb-2">
                Transcrição completa ({result.totalTurns} turnos)
              </p>
              <div className="space-y-2 max-h-96 overflow-y-auto">
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

function SalesMetricsRow({
  metrics,
  totalTurns,
  abandoned,
}: {
  metrics:    SalesMetrics;
  totalTurns: number;
  abandoned:  boolean;
}) {
  const acceptRate = metrics.upsellAttempts > 0
    ? ((metrics.acceptedUpsellsOnly / metrics.upsellAttempts) * 100).toFixed(0) + "%"
    : "—";

  const items: Array<{ label: string; value: string; color?: string }> = [
    {
      label: "Ticket final",
      value: metrics.finalCartValue > 0 ? `R$ ${metrics.finalCartValue.toFixed(2)}` : "—",
    },
    {
      label: "Itens",
      value: metrics.totalItems > 0 ? String(metrics.totalItems) : "—",
    },
    {
      label: "Turnos",
      value: String(totalTurns),
      color: totalTurns >= 10 ? "text-orange-500" : undefined,
    },
    {
      label: "Conversão",
      value: abandoned ? "Abandonou" : "Converteu",
      color: abandoned ? "text-red-500" : "text-green-600",
    },
    {
      label: "Upsells aceitos",
      value: metrics.upsellAttempts > 0
        ? `${metrics.acceptedUpsellsOnly}/${metrics.upsellAttempts} (${acceptRate})`
        : "—",
    },
    {
      label: "Receita upsell",
      value: metrics.upsellValueGenerated > 0
        ? `R$ ${metrics.upsellValueGenerated.toFixed(2)}`
        : "—",
      color: metrics.upsellValueGenerated > 0 ? "text-green-600" : undefined,
    },
  ];

  return (
    <div className="pt-3 grid grid-cols-3 gap-2 sm:grid-cols-6">
      {items.map((item) => (
        <div key={item.label} className="bg-gray-50 rounded-lg px-2 py-2 text-center">
          <p className="text-[10px] text-gray-400 uppercase tracking-wide mb-0.5 leading-tight">{item.label}</p>
          <p className={`text-xs font-semibold ${item.color ?? "text-gray-700"}`}>
            {item.value}
          </p>
        </div>
      ))}
    </div>
  );
}

// ─── cart evolution table ─────────────────────────────────────

function CartEvolutionTable({ evolution }: { evolution: CartSnapshot[] }) {
  return (
    <div>
      <p className="text-xs text-gray-500 font-medium mb-2">Evolução do carrinho por turno</p>
      <div className="overflow-x-auto">
        <table className="w-full text-xs border-collapse">
          <thead>
            <tr className="text-gray-400 border-b border-gray-100">
              <th className="text-left py-1 pr-3 font-medium">Turno</th>
              <th className="text-right py-1 pr-3 font-medium">Valor</th>
              <th className="text-right py-1 pr-3 font-medium">Itens</th>
              <th className="text-right py-1 font-medium">Δ Valor</th>
            </tr>
          </thead>
          <tbody>
            {evolution.map((snap, i) => {
              const prev   = evolution[i - 1];
              const delta  = snap.value - (prev?.value ?? 0);
              const added  = delta > 0;
              return (
                <tr key={snap.turn} className="border-b border-gray-50">
                  <td className="py-1 pr-3 text-gray-500">#{snap.turn}</td>
                  <td className="py-1 pr-3 text-right font-medium text-gray-800">
                    {snap.value > 0 ? `R$ ${snap.value.toFixed(2)}` : "—"}
                  </td>
                  <td className="py-1 pr-3 text-right text-gray-600">{snap.items}</td>
                  <td className={`py-1 text-right font-medium ${added ? "text-green-600" : "text-gray-300"}`}>
                    {added ? `+R$ ${delta.toFixed(2)}` : "—"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
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
  const ts   = fileTimestamp(report.ranAt);
  const name = slugify(report.restaurantName);
  triggerDownload(
    new Blob([JSON.stringify(report, null, 2)], { type: "application/json" }),
    `simulation-report-${ts}-${name}.json`,
  );
}

function downloadSummary(report: SimulationReport): void {
  const ts      = fileTimestamp(report.ranAt);
  const name    = slugify(report.restaurantName);
  const dateStr = new Date(report.ranAt).toLocaleString("pt-BR");

  const passed  = report.scenarios.filter((s) => s.status === "passed").length;
  const warned  = report.scenarios.filter((s) => s.status === "warning").length;
  const failed  = report.scenarios.filter((s) => s.status === "failed").length;

  const sorted  = [...report.scenarios].sort((a, b) => a.score - b.score);
  const worst   = sorted.slice(0, 3);
  const best    = sorted.slice(-3).reverse();

  // Collect up to 5 most impactful failures across all scenarios
  const allFailures: string[] = [];
  for (const s of report.scenarios) {
    for (const c of s.checks) {
      if (!c.passed) allFailures.push(`[${s.name}] ${c.detail}`);
    }
  }
  const top5Failures = allFailures.slice(0, 5);

  const lines: string[] = [
    "═══════════════════════════════════════════════════════",
    "       RELATÓRIO DO SIMULADOR DE IA DE VENDAS",
    "═══════════════════════════════════════════════════════",
    `Restaurante : ${report.restaurantName}`,
    `Executado em: ${dateStr}`,
    "",
    "┌─────────────────────────────────────────────────────┐",
    `│  PRONTO PARA TESTE REAL: ${report.safeToTest ? "SIM ✓" : "NÃO ✗"}                        │`,
    "└─────────────────────────────────────────────────────┘",
    "",
    "─── MÉTRICAS GERAIS ──────────────────────────────────",
    `  Score geral       : ${report.overallScore.toFixed(0)} / 100`,
    `  Cenários aprovados: ${passed} / ${report.scenarios.length}`,
    `  Cenários atenção  : ${warned}`,
    `  Cenários com falha: ${failed}`,
    `  Taxa de conversão : ${(report.conversionRate * 100).toFixed(0)}%`,
    `  Taxa de abandono  : ${(report.abandonmentRate * 100).toFixed(0)}%`,
    `  Ticket médio      : R$ ${report.avgTicket.toFixed(2)}`,
    `  Itens médios      : ${report.avgItems.toFixed(1)}`,
    `  Turnos médios     : ${report.avgTurns.toFixed(1)}`,
    `  Aceitação upsell  : ${(report.upsellAcceptanceRate * 100).toFixed(0)}%`,
    "",
  ];

  if (top5Failures.length > 0) {
    lines.push("─── TOP 5 FALHAS ─────────────────────────────────────");
    top5Failures.forEach((f, i) => lines.push(`  ${i + 1}. ${f}`));
    lines.push("");
  }

  lines.push("─── PIORES CENÁRIOS ──────────────────────────────────");
  worst.forEach((s, i) => {
    const icon = s.status === "failed" ? "✗" : "⚠";
    lines.push(`  ${i + 1}. ${icon} [${s.score.toFixed(0)}/100] ${s.name}`);
    if (s.salesWeaknesses.length > 0) {
      lines.push(`       → ${s.salesWeaknesses[0]}`);
    }
  });
  lines.push("");

  lines.push("─── MELHORES CENÁRIOS ────────────────────────────────");
  best.forEach((s, i) => {
    lines.push(`  ${i + 1}. ✓ [${s.score.toFixed(0)}/100] ${s.name}`);
    if (s.salesMetrics.conversionSuccess) {
      lines.push(`       → Pedido confirmado em ${s.totalTurns} turnos — R$ ${s.salesMetrics.finalCartValue.toFixed(2)}`);
    }
  });
  lines.push("");

  if (report.topFixes.length > 0) {
    lines.push("─── CORREÇÕES RECOMENDADAS ───────────────────────────");
    report.topFixes.forEach((fix, i) => lines.push(`  ${i + 1}. ${fix}`));
    lines.push("");
  }

  lines.push("─── DETALHES POR CENÁRIO ─────────────────────────────");
  report.scenarios.forEach((s) => {
    const icon = s.status === "passed" ? "✓" : s.status === "warning" ? "⚠" : "✗";
    lines.push(`${icon} [${s.score.toFixed(0)}/100] ${s.name}`);
    lines.push(`   ${s.description}`);
    lines.push(`   Turnos: ${s.totalTurns} | Ticket: R$ ${s.salesMetrics.finalCartValue.toFixed(2)} | ${s.abandoned ? "Abandonou" : "Converteu"}`);
    if (s.issues.length > 0) {
      s.issues.forEach((issue) => lines.push(`   ⚠ ${issue}`));
    }
    if (s.salesWeaknesses.length > 0) {
      s.salesWeaknesses.forEach((w) => lines.push(`   ↘ ${w}`));
    }
    lines.push("");
  });

  triggerDownload(
    new Blob([lines.join("\n")], { type: "text/plain;charset=utf-8" }),
    `simulation-summary-${ts}-${name}.txt`,
  );
}

function downloadCSV(report: SimulationReport): void {
  const ts   = fileTimestamp(report.ranAt);
  const name = slugify(report.restaurantName);

  // Exact columns per spec
  const headers = [
    "scenarioId",
    "score",
    "status",
    "finalCartValue",
    "totalItems",
    "totalTurns",
    "conversionSuccess",
    "upsellAttempts",
    "acceptedUpsells",
    "acceptanceRate",
    "abandonment",
    "loopDetected",
  ];

  const rows = report.scenarios.map((s) => {
    const m          = s.salesMetrics;
    const acceptRate = m.upsellAttempts > 0
      ? (m.acceptedUpsellsOnly / m.upsellAttempts).toFixed(4)
      : "0";
    const loopCheck    = s.checks.find((c) => c.type === "no_loop");
    const loopDetected = loopCheck ? (!loopCheck.passed ? "true" : "false") : "false";

    return [
      s.id,
      s.score.toFixed(2),
      s.status,
      m.finalCartValue.toFixed(2),
      String(m.totalItems),
      String(s.totalTurns),
      m.conversionSuccess ? "true" : "false",
      String(m.upsellAttempts),
      String(m.acceptedUpsellsOnly),
      acceptRate,
      s.abandoned ? "true" : "false",
      loopDetected,
    ];
  });

  const escape = (v: string) => `"${v.replace(/"/g, '""')}"`;
  const csv = [headers, ...rows]
    .map((row) => row.map(escape).join(","))
    .join("\r\n");

  // BOM prefix so Excel opens with correct UTF-8 encoding
  triggerDownload(
    new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" }),
    `simulation-${ts}-${name}.csv`,
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
